#!/usr/bin/env bash
# daily-audit.sh — BLD-480 regression-catcher + daily visual audit driver.
#
# Runs the scenario specs in two passes:
#
#   1. HEAD scenarios — every `e2e/scenarios/*.spec.ts` EXCEPT the BLD-480
#      pre-fix fixture spec. Captures the post-workout summary, workout
#      history, etc. against today's code.
#
#   2. BLD-480 pre-fix FIXTURE — runs `completed-workout-prefix.spec.ts`,
#      a dev-only Playwright spec that navigates to the fixture route at
#      `/__fixtures__/bld-480-prefix`. That route renders `MusclesWorkedCard`
#      wrapped in a regressed `maxHeight: 200` clamp, faithfully reproducing
#      the cropping defect that PR #292 fixed (BLD-480). The capture is the
#      vision-pipeline trust-anchor for QD#2.
#
# Why a fixture-route capture instead of a static-PNG fixture or a `git
# checkout` of an old SHA (BLD-1023):
#   - The pre-fix tree (cce2ac1f...) targets an Expo SDK that no longer
#     builds in the 2026 Node 20 + Playwright Chromium environment — React
#     never mounts (BLD-1020 trace analysis).
#   - The static-PNG approach (BLD-959 / PR #482) depended on a
#     `regression-fixture-capture.yml` workflow that hit the same toolchain
#     rot when re-capturing the fixture (BLD-924, BLD-941, BLD-943, BLD-1020).
#   - The fixture route lives in HEAD as normal source code, so it carries
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
# Trust-anchor ordering invariant (BLD-966): if a HEAD spec fails, the
# regression-smoke step MUST still run. A flaky HEAD must not silence the
# alarm — that's precisely when the alarm matters most. We capture the HEAD
# and pre-fix exit codes but defer the actual abort until after smoke.
#
# Smoke priority (BLD-966 / BLD-1023):
#   - Smoke fails  → audit exits with smoke RC (vision pipeline can't be
#                    trusted today, HEAD findings irrelevant).
#   - Smoke passes
#     - HEAD or pre-fix scenarios failed → audit exits with that RC, smoke
#       result logged so operators can distinguish "real regression" from
#       "vision pipeline broken".
#     - All passed → audit exits 0.
#
# Refs: BLD-480, BLD-494, BLD-744, BLD-924, BLD-941, BLD-943, BLD-951,
# BLD-959, BLD-966, BLD-1020, BLD-1023. TL#6, QD#1, QD#2.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# BLD-1631: ensure the Playwright Chromium binary is present before any
# scenarios run. The Paperclip execution workspace stores the browser
# cache under `/paperclip/.cache/ms-playwright`, which is an ephemeral
# overlayfs — so recycled workspaces wake up with no chromium binary,
# OR with a half-populated `chrome-linux/` containing only
# `libvk_swiftshader.so` from a prior partial download (the exact state
# observed in BLD-1630). `install-playwright-browsers.sh` is the local
# alternative to `npx playwright install`: idempotent (no-op when the
# `INSTALLATION_COMPLETE` marker and the executable are both present),
# falls back across the three Playwright CDN mirrors when one returns
# a transient HTTP 400, and wipes any partial-extract dir before
# re-downloading. Running it here means the audit can be re-driven on
# a freshly recreated workspace with no manual intervention.
scripts/install-playwright-browsers.sh

# Path to the dev-only fixture spec. Used both to exclude it from the HEAD
# run and to invoke it as the BLD-480 pre-fix capture pass.
PREFIX_SPEC="e2e/scenarios/completed-workout-prefix.spec.ts"

# Sub-directory the fixture spec emits into (matches `SCENARIO` in
# `e2e/scenarios/completed-workout-prefix.spec.ts`).
PREFIX_SCENARIO_DIR="bld-480-prefix"

build_static_bundle() {
  # Mirror the CI pattern (.github/workflows/ux-audit.yml): export the web
  # bundle in dev mode so `__DEV__` is true and the `__TEST_SCENARIO__` seed
  # hook in `lib/db/test-seed.ts` actually executes — including the dev-only
  # `app/__fixtures__/*` routes (BLD-951). `--no-minify` keeps the bundle
  # readable for debugging. Static export + `E2E_USE_STATIC=1` causes
  # `playwright.config.ts:webServer` to serve via `npx serve` with COOP/COEP
  # headers (BLD-658), which gives the page `crossOriginIsolated === true`
  # and unlocks SharedArrayBuffer for the expo-sqlite Web Worker. Without
  # this, `useAppInit` short-circuits via `webNeedsUnsupportedFallback`, the
  # DB never inits, the seed never runs, `data-test-ready` never flips, and
  # screenshots come out blank (the original BLD-902 symptom).
  echo "[daily-audit] building static web bundle (--dev for __DEV__ seed hook + fixture routes)…"
  npx --yes expo export -p web --dev --no-minify
  if [[ ! -f dist/index.html ]]; then
    echo "[daily-audit] ERROR: static export produced no dist/index.html — aborting." >&2
    exit 1
  fi
}

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
  E2E_USE_STATIC=1 COMMIT_SHA="$commit_sha" \
    npx playwright test "$@" --project=mobile
}

HEAD_SHA="$(git rev-parse HEAD)"
DATE_STAMP="$(date -u +%Y-%m-%d)"
HEAD_OUT=".pixelslop/screenshots/scenarios"
AUDIT_DATE_DIR=".pixelslop/audits/${DATE_STAMP}"
HEAD_COPY="${AUDIT_DATE_DIR}/HEAD"
PINNED_OUT="${AUDIT_DATE_DIR}/BLD_480_PRE_FIX"

mkdir -p "$AUDIT_DATE_DIR"

# ─── Rolling AC-driven coverage report (BLD-1123 / BLD-1124) ──────────
# Surface every BLD ticket shipped in the past ROLLING_WINDOW_DAYS that lacks
# either (a) an `e2e/scenarios/*.spec.ts` for visual auditing, or (b) full AC
# test coverage per `scripts/audit-acceptance-criteria.sh`. The output is
# written to the audit date dir so `audit-bundle.sh` uploads it alongside
# the screenshots, and ux-designer can use it to PRIORITIZE new-feature
# scenarios in the day's review.
#
# Tickets are extracted from commit SUBJECTS only (not bodies/footers) so
# incidental refs like "Refs: BLD-212" don't inflate the list.
ROLLING_WINDOW_DAYS="${ROLLING_WINDOW_DAYS:-7}"
ROLLING_REPORT="${AUDIT_DATE_DIR}/rolling-coverage-report.md"

echo "[daily-audit] building rolling coverage report (past ${ROLLING_WINDOW_DAYS} days)…"
{
  echo "# Rolling UX-Audit Coverage Report"
  echo ""
  echo "Window: past ${ROLLING_WINDOW_DAYS} days  |  HEAD: \`${HEAD_SHA}\`  |  Date: ${DATE_STAMP}"
  echo ""
  echo "## Tickets shipped in the rolling window"
  echo ""

  SHIPPED_TICKETS=$(
    git log --since="${ROLLING_WINDOW_DAYS} days ago" --pretty=format:'%s' \
      | grep -oE 'BLD-[0-9]+' | sort -u || true
  )

  if [ -z "$SHIPPED_TICKETS" ]; then
    echo "_No BLD-tagged commits in window._"
  else
    echo "| Ticket | Plan | Visual scenario? | AC coverage |"
    echo "|---|---|---|---|"
    while IFS= read -r ticket; do
      plan=".plans/PLAN-${ticket}.md"
      plan_cell="—"
      [ -f "$plan" ] && plan_cell="\`$(basename "$plan")\`"

      # UI-relevance heuristic (BLD-2350): a ticket is eligible for the
      # MISSING flag only if its merge commit(s) in the rolling window touched
      # files under app/, components/, or theme/. Infra/CI/bugfix tickets that
      # never touch those paths (e.g. BLD-1631 playwright-install, BLD-1710
      # dependabot, BLD-1796 test-flake, BLD-1976 emulator-smoke, BLD-2040
      # worktree-guard) will NEVER have a visual scenario and used to inflate
      # the MISSING count forever, burying real gaps. Any commit touching at
      # least one app/, components/, or theme/ file counts as UI-relevant.
      ui_files=$(git log --since="${ROLLING_WINDOW_DAYS} days ago" \
        --pretty=format:'' --name-only --diff-filter=ACDMRT -- . \
        2>/dev/null \
        | grep -E '^(app|components|theme)/' | head -1 || true)
      # Narrow to commits that mention this ticket in the subject line.
      ticket_ui_files=$(git log --since="${ROLLING_WINDOW_DAYS} days ago" \
        --pretty=format:'%s' --name-only --diff-filter=ACDMRT -- . \
        2>/dev/null \
        | awk -v t="$ticket" '
          /^BLD-/ || /^(feat|fix|chore|test|refactor|docs|perf|ci)/ { in_commit=0 }
          $0 ~ t { in_commit=1 }
          in_commit && /^(app|components|theme)\// { print; exit }
        ' || true)
      vis="❌ MISSING"
      if grep -rl "$ticket" e2e/scenarios/ 2>/dev/null | head -1 | grep -q .; then
        vis="✅"
      elif [ -z "$ticket_ui_files" ]; then
        # No app/components/theme files touched by this ticket's commits —
        # it is an infra/CI/test/bugfix-only ticket; never flag as MISSING.
        vis="— n/a (non-UI)"
      fi

      ac_cell="—"
      if [ -f "$plan" ]; then
        if grep -q '<!-- ac-audit: legacy -->' "$plan"; then
          ac_cell="🪦 legacy"
        else
          set +e
          out=$(./scripts/audit-acceptance-criteria.sh --plan "$plan" --warn-only 2>&1)
          set -e
          missing=$(echo "$out" | grep -oE 'Missing test refs:[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' || echo "0")
          total=$(echo "$out" | grep -oE 'Total ACs inspected:[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' || echo "0")
          if [ "${missing:-0}" -eq 0 ] && [ "${total:-0}" -gt 0 ]; then
            ac_cell="✅ ${total}/${total}"
          elif [ "${total:-0}" -eq 0 ]; then
            ac_cell="—"
          else
            covered=$((total - missing))
            ac_cell="⚠️  ${covered}/${total}"
          fi
        fi
      fi

      echo "| [$ticket](/BLD/issues/$ticket) | $plan_cell | $vis | $ac_cell |"
    done <<< "$SHIPPED_TICKETS"
  fi

  echo ""
  echo "## ux-designer prioritization hint"
  echo ""
  echo "When auditing today's bundle, **review tickets with ❌ MISSING visual"
  echo "scenarios FIRST** — those are the most likely to harbor undiscovered"
  echo "regressions (BLD-1105 / BLD-1106 class). Tickets with ⚠️ partial AC"
  echo "coverage are the second priority (the unverified ACs are the most"
  echo "likely to be silently broken)."
} > "$ROLLING_REPORT"

echo "[daily-audit] rolling coverage report → $ROLLING_REPORT"
echo ""

build_static_bundle

# 1) Today's HEAD — run every real-screen scenario except the pre-fix
#    fixture spec (covered in step 2). The spec list is built dynamically
#    so adding new scenarios stays drop-in: any `*.spec.ts` other than the
#    pre-fix fixture is picked up automatically.
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

# BLD-966 / BLD-1023: capture HEAD scenario exit code without aborting.
# The smoke check (step 3) is the vision-pipeline trust anchor and MUST
# run even if HEAD scenarios fail. We re-export the failure at the end.
set +e
run_scenarios "HEAD" "$HEAD_SHA" "${HEAD_SPECS[@]}"
HEAD_RC=$?
set -e

# Move HEAD captures into a date-stamped subdir so the pre-fix run doesn't
# clobber them. Tolerate a missing/empty HEAD_OUT when scenarios failed
# before producing any captures — we still want to run pre-fix and smoke.
mkdir -p "$HEAD_COPY"
if [[ -d "$HEAD_OUT" ]] && compgen -G "$HEAD_OUT/*" > /dev/null; then
  cp -r "$HEAD_OUT"/* "$HEAD_COPY"/
else
  echo "[daily-audit] note: no HEAD captures to copy (HEAD scenarios may have failed)" >&2
fi

# BLD-2198: write captured-scenarios.txt — the machine source of truth for which
# scenario dirs have at least one .png. ux-designer copies this into the audit
# issue body under "Scenarios Captured (HEAD)". We write it into HEAD_OUT (the
# live scenarios dir) so audit-bundle.sh zips it alongside the screenshots.
#
# Portable: no mapfile, works on bash 3.2 (macOS). Excludes the bld-480-prefix
# fixture dir — it is an internal regression anchor, not a user-facing scenario.
CAPTURED_SCENARIOS_FILE="${HEAD_OUT}/captured-scenarios.txt"
{
  while IFS= read -r -d '' dir; do
    name="$(basename "$dir")"
    # Skip the bld-480-prefix fixture — it is a regression anchor, not a real scenario.
    [[ "$name" == "$PREFIX_SCENARIO_DIR" ]] && continue
    if compgen -G "${dir}/*.png" > /dev/null 2>&1; then
      echo "$name"
    fi
  done < <(find "$HEAD_OUT" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
} > "$CAPTURED_SCENARIOS_FILE"
echo "[daily-audit] captured-scenarios.txt → $CAPTURED_SCENARIOS_FILE"

# 2) BLD-480 pre-fix FIXTURE regression-catcher (BLD-1023).
#
# We deliberately keep the output bundle directory name `BLD_480_PRE_FIX`
# (not `..._FIXTURE`) so the existing audit-bundle uploader, ux-designer
# intake, and any historical comparisons against pre-2026-05-03 bundles
# continue to work without coordinated downstream changes.
mkdir -p "$PINNED_OUT"

set +e
run_scenarios "BLD_480_PRE_FIX" "$HEAD_SHA" "$PREFIX_SPEC"
PREFIX_RC=$?
set -e

# Copy the pre-fix scenario output into the historically-stable bundle
# path. The scenario emits to `.pixelslop/screenshots/scenarios/bld-480-prefix/`;
# downstream expects everything from this run nested under `BLD_480_PRE_FIX/`.
PREFIX_SRC="$HEAD_OUT/$PREFIX_SCENARIO_DIR"
PREFIX_FIXTURE_PNG=""
if [[ -d "$PREFIX_SRC" ]] && compgen -G "$PREFIX_SRC/*" > /dev/null; then
  cp -r "$PREFIX_SRC" "$PINNED_OUT/"
  # Pick the baseline PNG (no CVD suffix) for the smoke step.
  if [[ -f "$PINNED_OUT/$PREFIX_SCENARIO_DIR/mobile.png" ]]; then
    PREFIX_FIXTURE_PNG="$PINNED_OUT/$PREFIX_SCENARIO_DIR/mobile.png"
  fi
fi

# 3) Vision-pipeline trust-anchor smoke (QD#2 / BLD-966 / BLD-1023).
#
# We assert that running the audit prompt against the freshly captured
# pre-fix wrapper-fixture screenshot still produces a finding matching the
# canonical regex. Failure here = vision pipeline silent degradation =
# ABORT the audit (HEAD findings cannot be trusted today).
#
# Smoke RC dominates. Run unconditionally even if HEAD or pre-fix scenarios
# failed.
SMOKE_FINDINGS="$PINNED_OUT/smoke-findings.txt"
echo ""
if [[ -z "$PREFIX_FIXTURE_PNG" ]]; then
  echo "[daily-audit] 🚨 FATAL: pre-fix fixture capture missing at $PREFIX_SRC/mobile.png" >&2
  echo "[daily-audit] The wrapper-fixture spec ($PREFIX_SPEC) failed before producing" >&2
  echo "[daily-audit] a capture. Cannot run smoke — today's HEAD findings MUST NOT be trusted." >&2
  # Surface the upstream RC (capture failure) so operators see WHY the
  # smoke couldn't run.
  if [[ $PREFIX_RC -ne 0 ]]; then
    exit $PREFIX_RC
  fi
  exit 2
fi

echo "[daily-audit] running regression-smoke against captured fixture: $PREFIX_FIXTURE_PNG"
set +e
FINDINGS_OUT="$SMOKE_FINDINGS" \
  scripts/regression-smoke.sh "$PREFIX_FIXTURE_PNG"
SMOKE_RC=$?
set -e

if [[ $SMOKE_RC -ne 0 ]]; then
  echo "[daily-audit] 🚨 FATAL: regression-smoke FAILED (vision-pipeline trust anchor)." >&2
  echo "[daily-audit] Today's HEAD findings MUST NOT be trusted." >&2
  exit $SMOKE_RC
fi

# Smoke passed. If HEAD or pre-fix scenarios failed, surface that — the
# pipeline itself is healthy, so a HEAD failure is a real regression.
if [[ $HEAD_RC -ne 0 ]]; then
  echo "[daily-audit] HEAD scenarios failed (rc=$HEAD_RC) but smoke PASSED — vision pipeline is healthy, the HEAD failure is a real regression." >&2
  echo "[daily-audit] regression-smoke: PASS (findings → $SMOKE_FINDINGS)"
  exit $HEAD_RC
fi

if [[ $PREFIX_RC -ne 0 ]]; then
  echo "[daily-audit] pre-fix fixture spec failed (rc=$PREFIX_RC) but smoke PASSED — vision pipeline is healthy, the fixture-spec failure needs investigation." >&2
  echo "[daily-audit] regression-smoke: PASS (findings → $SMOKE_FINDINGS)"
  exit $PREFIX_RC
fi

echo ""
echo "[daily-audit] bundles ready at $HEAD_COPY and $PINNED_OUT"
echo "[daily-audit] regression-smoke: PASS (findings → $SMOKE_FINDINGS)"
echo "[daily-audit] next step: scripts/audit-bundle.sh uploads to GH Releases,"
echo "[daily-audit] then ux-designer agent pulls + reviews."
