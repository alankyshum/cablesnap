#!/usr/bin/env bash
# daily-audit.sh — BLD-480 regression-catcher + daily visual audit driver.
#
# Runs the `completed-workout` and `workout-history` scenario specs against:
#   1. current HEAD (the commit under test today)
#   2. BLD_480_PRE_FIX_SHA — pinned parent of `6f067cc` (BLD-480's fix PR #292)
#      which reproduces the MusclesWorkedCard cropping bug
#
# Each scenario emits four PNGs per viewport (BLD-744):
#   <scenario>/<viewport>.png                  ← baseline
#   <scenario>/<viewport>-deuteranopia.png     ← CVD: red-green (~6% males)
#   <scenario>/<viewport>-protanopia.png       ← CVD: red-cone (~2% males)
#   <scenario>/<viewport>-tritanopia.png       ← CVD: blue-cone (rare)
# Implemented via Chromium DevTools Protocol's
# `Emulation.setEmulatedVisionDeficiency` in `e2e/scenarios/capture-with-cvd.ts`.
# The CVD captures share a single browser session per scenario, so runtime
# stays well under 2x baseline.
#
# The pre-fix commit is the PERMANENT DAILY SMOKE (QD#1). If the ux-designer
# vision pipeline silently regresses, the audit loop would produce green audits
# indefinitely; running scenarios against this known-bad commit every day
# catches that failure mode.
#
# Acceptance (QD#2): after the audit runs, ux-designer's findings for the
# pre-fix commit MUST contain at least one finding whose description matches
# (case-insensitive): crop | truncat | clip | maxHeight | cut off |
# MusclesWorkedCard | body-figure. The match-check is performed by the
# ux-designer agent itself on intake (see AGENTS-ux-designer.md).
#
# Refs: BLD-494, BLD-744, TL#6, QD#1, QD#2

set -euo pipefail

# Node 24+ has breaking ESM changes that are incompatible with Expo SDK 55.
# Guard against running with an unsupported Node version.
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -ge 24 ]]; then
  echo "[daily-audit] ERROR: Node $NODE_MAJOR detected. Expo SDK 55 requires Node ≤22." >&2
  echo "[daily-audit] Install Node 20 or 22 via nvm/fnm/mise, or set .node-version." >&2
  exit 1
fi

# Pinned via `git rev-parse 6f067cc^` on 2026-04-22 — the commit immediately
# BEFORE PR #292 ("fix: remove maxHeight crop on workout summary muscle
# heatmap") merged. Do NOT change this constant unless the BLD-480 fix is
# reverted or the parent SHA is re-pinned.
BLD_480_PRE_FIX_SHA="cce2ac1f828538bf884f91c5e209ab9f6a40d87f"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Ensure devDependencies are installed — the workspace npm config may set
# `omit=dev` globally, but the build needs babel-plugin-module-resolver
# (devDependency) to resolve @/ path aliases during `expo export`.
npm install --include=dev --legacy-peer-deps --silent 2>&1

build_static() {
  echo "[daily-audit] building static web bundle (--dev for __DEV__ seed hook)…"
  npx expo export --platform web --dev
  if [[ ! -f dist/index.html ]]; then
    echo "[daily-audit] ERROR: static build failed — dist/index.html not found" >&2
    exit 1
  fi
  echo "[daily-audit] static bundle ready at dist/"
}

run_scenarios() {
  local label="$1"
  local commit_sha="$2"
  echo ""
  echo "=========================================================="
  echo "[daily-audit] running scenarios against $label ($commit_sha)"
  echo "=========================================================="
  E2E_USE_STATIC=1 COMMIT_SHA="$commit_sha" \
    npx playwright test e2e/scenarios/ --project=mobile
}

ORIGINAL_REF="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$ORIGINAL_REF" == "HEAD" ]]; then
  ORIGINAL_REF="$(git rev-parse HEAD)"
fi

cleanup() {
  echo "[daily-audit] restoring $ORIGINAL_REF"
  # Discard any dirty state from the pinned-SHA section before returning to
  # the original ref. The pre-fix section copies files (e.g. lib/db/test-seed.ts)
  # onto an old tree that may lack them; checking out a branch that tracks
  # those files without a reset first would fail with "would be overwritten".
  git reset --hard --quiet || true
  git clean -fdq || true
  git checkout --quiet "$ORIGINAL_REF" || true
}
trap cleanup EXIT

# 1) Today's HEAD — build static bundle with --dev so __DEV__ seed hook is active,
# then run scenarios against it via E2E_USE_STATIC=1. This ensures COOP/COEP
# headers are served (required for SharedArrayBuffer / expo-sqlite web worker).
HEAD_SHA="$(git rev-parse HEAD)"
build_static
run_scenarios "HEAD" "$HEAD_SHA"

# Move HEAD captures into a date-stamped subdir so the pre-fix run below
# doesn't clobber them.
HEAD_OUT=".pixelslop/screenshots/scenarios"
HEAD_COPY=".pixelslop/audits/$(date -u +%Y-%m-%d)/HEAD"
mkdir -p "$HEAD_COPY"
cp -r "$HEAD_OUT"/* "$HEAD_COPY"/

# 2) BLD-480 pre-fix regression-catcher
# NOTE: we deliberately checkout the OLD tree so the scenario runs against
# the buggy code. If that commit's codebase lacks the scenario spec or
# seed hook, that's expected — the spec files from our branch persist only
# in-memory, not in the working tree, so we need to copy them in temporarily.
PINNED_OUT=".pixelslop/audits/$(date -u +%Y-%m-%d)/BLD_480_PRE_FIX"
mkdir -p "$PINNED_OUT"

TMP_SPECS="$(mktemp -d)"
cp -r e2e/scenarios "$TMP_SPECS/"
cp lib/db/test-seed.ts "$TMP_SPECS/"
cp hooks/useAppInit.ts "$TMP_SPECS/useAppInit.ts.patched"

git checkout --quiet "$BLD_480_PRE_FIX_SHA"

# Re-apply our primitives on top of the old tree so scenarios can run.
mkdir -p e2e/scenarios
cp -r "$TMP_SPECS/scenarios/"* e2e/scenarios/
cp "$TMP_SPECS/test-seed.ts" lib/db/test-seed.ts
# Skip useAppInit.ts re-patch — the pre-fix tree's init path differs, and the
# seed hook can be driven directly from the spec's addInitScript on the
# window object. If the pre-fix spec run needs it, copy it in manually.

# Rebuild the static bundle for the pre-fix tree (with our spec/seed files
# overlaid). The --dev flag preserves __DEV__ so the seed hook activates.
build_static

run_scenarios "BLD_480_PRE_FIX" "$BLD_480_PRE_FIX_SHA"
cp -r "$HEAD_OUT"/* "$PINNED_OUT"/

echo ""
echo "[daily-audit] bundles ready at $HEAD_COPY and $PINNED_OUT"
echo "[daily-audit] next step: scripts/audit-bundle.sh uploads to GH Releases,"
echo "[daily-audit] then ux-designer agent pulls + reviews."
