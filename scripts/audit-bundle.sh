#!/usr/bin/env bash
# audit-bundle.sh — bundle scenario screenshots into a daily GitHub Release.
#
# Reads `.pixelslop/screenshots/scenarios/*/<viewport>.png` and their sibling
# `.json` metadata files, zips them, and creates a GitHub Release tagged
# `audit-YYYY-MM-DD-<short-sha>`. Retention: keeps the last 14 audit releases
# (tag + release both deleted via `gh release delete --cleanup-tag`).
#
# Refs: BLD-494, TL#5

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Paperclip workspaces store gh config in /paperclip/.config/gh.
# Auto-detect if the default location has no auth but Paperclip's does.
if [[ -z "${GH_CONFIG_DIR:-}" ]] && [[ -f /paperclip/.config/gh/hosts.yml ]]; then
  export GH_CONFIG_DIR=/paperclip/.config/gh
fi

# Pre-flight: gh CLI must be authenticated (via GITHUB_TOKEN env var or
# `gh auth login`). Without auth, release create/upload will fail.
if ! gh auth status >/dev/null 2>&1; then
  echo "[audit-bundle] ERROR: gh CLI is not authenticated." >&2
  echo "[audit-bundle] Set GITHUB_TOKEN env var or run 'gh auth login'." >&2
  echo "[audit-bundle] In Paperclip workspaces, add GITHUB_TOKEN to the" >&2
  echo "[audit-bundle] execution workspace secrets." >&2
  exit 1
fi

SRC_DIR=".pixelslop/screenshots/scenarios"
if [[ ! -d "$SRC_DIR" ]]; then
  echo "[audit-bundle] ERROR: $SRC_DIR does not exist. Run the scenario specs first." >&2
  exit 2
fi

SHA="$(git rev-parse --short HEAD)"
DATE="$(date -u +%Y-%m-%d)"
TAG="audit-${DATE}-${SHA}"
ZIP_PATH="/tmp/${TAG}.zip"

echo "[audit-bundle] creating $ZIP_PATH from $SRC_DIR/ ..."
rm -f "$ZIP_PATH"
(cd "$SRC_DIR" && zip -r "$ZIP_PATH" . >/dev/null)

# Create the pre-release (idempotent — if the tag exists, reuse it).
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "[audit-bundle] release $TAG already exists; uploading asset with --clobber."
  gh release upload "$TAG" "$ZIP_PATH" --clobber
else
  gh release create "$TAG" "$ZIP_PATH" \
    --prerelease \
    --title "Visual UX audit $DATE ($SHA)" \
    --notes "Daily scenario screenshot bundle. Commit: $SHA. Scenarios: $(ls "$SRC_DIR" | xargs echo)."
fi

echo "[audit-bundle] pruning audit-* releases older than 14 ..."
# List audit-* releases sorted newest-first, drop the first 14, delete the rest.
# --per-page 100 (TL#5) ensures we see old tags that would otherwise be paginated out.
mapfile -t OLD < <(gh release list --limit 100 --json tagName,createdAt \
  --jq '[.[] | select(.tagName | startswith("audit-"))] | sort_by(.createdAt) | reverse | .[14:] | .[].tagName')

for tag in "${OLD[@]:-}"; do
  [[ -z "$tag" ]] && continue
  echo "[audit-bundle] deleting old release+tag: $tag"
  gh release delete "$tag" --yes --cleanup-tag || echo "[audit-bundle] WARN: failed to delete $tag"
done

echo "[audit-bundle] done. Release URL:"
gh release view "$TAG" --json url --jq '.url'
