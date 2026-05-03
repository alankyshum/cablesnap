#!/usr/bin/env bash
# CHANGELOG.md ↔ app.config.ts parity gate (BLD-1027 / BLD-1026).
#
# Asserts that the top-most `## v<X.Y.Z>` header in CHANGELOG.md and its
# `<!-- versionCode: N -->` marker match `version` and `android.versionCode`
# in app.config.ts. This is the "scheduled-release shipped without a
# CHANGELOG bump" drift alarm — same class of failure as v0.26.20–v0.26.22
# (see BLD-1026 plan).
#
# Exit codes:
#   0  CHANGELOG ↔ app.config.ts agree.
#   1  drift detected (or required files missing / unparseable).
#
# Usage:
#   bash scripts/check-changelog-parity.sh
#
# Wired into:
#   - .husky/pre-push  (local drift alarm)
#   - .github/workflows/bundle-gate.yml  (CI drift alarm)
#
# macOS/BSD-safe: no `head -n -1`, no GNU-only flags. Mirrors the
# publish-release SKILL Step 7 awk extractor style.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
changelog="$repo_root/CHANGELOG.md"
app_config="$repo_root/app.config.ts"

fail() {
  echo "::error::$*" >&2
  echo "$*" >&2
  exit 1
}

[ -f "$changelog" ] || fail "CHANGELOG.md not found at $changelog"
[ -f "$app_config" ] || fail "app.config.ts not found at $app_config"

# First `## v<semver>` header (skip `## Unreleased`).
top_header=$(awk '/^## v[0-9]+\.[0-9]+\.[0-9]+/ { print; exit }' "$changelog")
[ -n "$top_header" ] || fail "CHANGELOG.md has no '## v<semver>' header"

changelog_version=$(echo "$top_header" \
  | sed -E 's/^## v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

# `<!-- versionCode: N -->` marker inside the top entry's body — read until
# the next `## ` header.
changelog_vcode=$(awk '
  /^## v[0-9]+\.[0-9]+\.[0-9]+/ { if (in_top) exit; in_top = 1; next }
  in_top && match($0, /<!--[[:space:]]*versionCode:[[:space:]]*([0-9]+)[[:space:]]*-->/, m) {
    print m[1]; exit
  }
' "$changelog" 2>/dev/null || true)

# `awk match()` with an array is GNU-only. Fallback for BSD awk: grep+sed.
if [ -z "$changelog_vcode" ]; then
  # Extract the body of the top entry (between first `## v<semver>` and the
  # next `## ` header), then grep for the marker.
  body=$(awk '
    /^## v[0-9]+\.[0-9]+\.[0-9]+/ { if (in_top) exit; in_top = 1; next }
    in_top && /^## / { exit }
    in_top { print }
  ' "$changelog")
  changelog_vcode=$( { echo "$body" \
    | grep -oE '<!--[[:space:]]*versionCode:[[:space:]]*[0-9]+[[:space:]]*-->' \
    || true; } \
    | head -1 \
    | sed -E 's/.*versionCode:[[:space:]]*([0-9]+).*/\1/')
fi

[ -n "$changelog_vcode" ] \
  || fail "CHANGELOG top entry v$changelog_version has no <!-- versionCode: N --> marker"

config_version=$(grep -E '^[[:space:]]*version:[[:space:]]*"' "$app_config" \
  | head -1 \
  | sed -E 's/.*version:[[:space:]]*"([^"]+)".*/\1/')

config_vcode=$(grep -E '^[[:space:]]*versionCode:[[:space:]]*[0-9]+' "$app_config" \
  | head -1 \
  | sed -E 's/.*versionCode:[[:space:]]*([0-9]+).*/\1/')

[ -n "$config_version" ] || fail "could not parse version from app.config.ts"
[ -n "$config_vcode" ]   || fail "could not parse android.versionCode from app.config.ts"

if [ "$changelog_version" != "$config_version" ]; then
  fail "CHANGELOG ↔ app.config.ts version drift — CHANGELOG top: v$changelog_version, app.config.ts: v$config_version"
fi

if [ "$changelog_vcode" != "$config_vcode" ]; then
  fail "CHANGELOG ↔ app.config.ts versionCode drift — CHANGELOG marker: $changelog_vcode, app.config.ts: $config_vcode"
fi

echo "✅ CHANGELOG.md ↔ app.config.ts parity OK (v$config_version, versionCode $config_vcode)"
