#!/usr/bin/env bash
# daily-audit.sh — BLD-480 regression-catcher + daily visual audit driver.
#
# Runs the scenario specs against:
#   1. current HEAD (the commit under test today)
#   2. The BLD-480 pre-fix FIXTURE — a dev-only route at
#      `/__fixtures__/bld-480-prefix` that renders `MusclesWorkedCard`
#      wrapped in a regressed `maxHeight: 200` clamp, faithfully reproducing
#      the cropping defect that PR #292 fixed.
#
# Why a fixture instead of `git checkout` of an old SHA (BLD-951):
#   - Pre-fix tree (cce2ac1f...) targets an Expo SDK incompatible with the
#     workspace's Node 22, so daily checkouts started failing on
#     2026-05-01 (BLD-924) and 2026-05-02 (BLD-941, BLD-943) silently
#     dropping the regression-catcher bundle from the audit.
#   - The fixture lives in HEAD as normal source code, so it carries
#     forward through every Node/Expo upgrade with the rest of the tree.
#   - It still exercises the live ux-designer vision pipeline against a
#     freshly rendered cropped MusclesWorkedCard, preserving QD#2 intent.
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
# The pre-fix fixture is the PERMANENT DAILY SMOKE (QD#1). If the
# ux-designer vision pipeline silently regresses, the audit loop would
# produce green audits indefinitely; running scenarios against this
# known-bad fixture every day catches that failure mode.
#
# Acceptance (QD#2): after the audit runs, ux-designer's findings for the
# pre-fix bundle MUST contain at least one finding whose description
# matches (case-insensitive): crop | truncat | clip | maxHeight | cut off |
# MusclesWorkedCard | body-figure. The match-check is performed by the
# ux-designer agent itself on intake (see AGENTS-ux-designer.md).
#
# Refs: BLD-480, BLD-494, BLD-744, BLD-924, BLD-941, BLD-943, BLD-951.
# TL#6, QD#1, QD#2.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_scenarios() {
  local label="$1"
  local commit_sha="$2"
  shift 2
  if [[ $# -eq 0 ]]; then
    set -- "e2e/scenarios/"
  fi
  echo ""
  echo "=========================================================="
  echo "[daily-audit] running scenarios: $label ($commit_sha)"
  echo "[daily-audit] specs: $*"
  echo "=========================================================="
  COMMIT_SHA="$commit_sha" \
    npx playwright test "$@" --project=mobile
}

HEAD_SHA="$(git rev-parse HEAD)"
DATE_STAMP="$(date -u +%Y-%m-%d)"
HEAD_OUT=".pixelslop/screenshots/scenarios"
HEAD_COPY=".pixelslop/audits/${DATE_STAMP}/HEAD"

# 1) Today's HEAD — run all real-screen scenarios in `e2e/scenarios/`,
#    EXCLUDING the pre-fix fixture spec (covered in step 2 below). The
#    spec list is built dynamically so adding new scenarios stays
#    drop-in: any `*.spec.ts` other than the pre-fix fixture is picked up
#    automatically.
HEAD_SPECS=()
while IFS= read -r -d '' spec; do
  case "$spec" in
    *completed-workout-prefix.spec.ts) ;; # skip — runs in step 2
    *) HEAD_SPECS+=("$spec") ;;
  esac
done < <(find e2e/scenarios -maxdepth 1 -name "*.spec.ts" -print0 | sort -z)

if [[ ${#HEAD_SPECS[@]} -eq 0 ]]; then
  echo "[daily-audit] ERROR: no HEAD scenario specs found under e2e/scenarios/" >&2
  exit 1
fi
run_scenarios "HEAD" "$HEAD_SHA" "${HEAD_SPECS[@]}"

mkdir -p "$HEAD_COPY"
# Copy the HEAD captures aside before the pre-fix run so the second run's
# output (same `.pixelslop/screenshots/scenarios/` root) doesn't clobber them.
if compgen -G "$HEAD_OUT/*" > /dev/null; then
  cp -r "$HEAD_OUT"/* "$HEAD_COPY"/
fi

# 2) BLD-480 pre-fix FIXTURE regression-catcher. We deliberately keep the
#    output bundle directory name `BLD_480_PRE_FIX` (not `..._FIXTURE`) so
#    the existing audit-bundle uploader, ux-designer intake, and any
#    historical comparisons against pre-2026-05-02 bundles continue to
#    work without coordinated downstream changes.
PINNED_OUT=".pixelslop/audits/${DATE_STAMP}/BLD_480_PRE_FIX"
mkdir -p "$PINNED_OUT"

run_scenarios "BLD_480_PRE_FIX" "$HEAD_SHA" "e2e/scenarios/completed-workout-prefix.spec.ts"

# Copy the pre-fix fixture's scenario output into the historically-stable
# bundle path. The scenario emits to `.pixelslop/screenshots/scenarios/bld-480-prefix/`;
# downstream expects everything from this run nested under `BLD_480_PRE_FIX/`.
if compgen -G "$HEAD_OUT/bld-480-prefix/*" > /dev/null; then
  cp -r "$HEAD_OUT/bld-480-prefix" "$PINNED_OUT/"
fi

echo ""
echo "[daily-audit] bundles ready at $HEAD_COPY and $PINNED_OUT"
echo "[daily-audit] next step: scripts/audit-bundle.sh uploads to GH Releases,"
echo "[daily-audit] then ux-designer agent pulls + reviews."
