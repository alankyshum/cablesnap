#!/usr/bin/env bash
# audit-acceptance-criteria.sh — Enforce that every AC in a plan has a
# corresponding test reference. (BLD-1123 — replaces the global test-count
# cap removed from scripts/audit-tests.sh.)
#
# Policy
# ------
# Every `## Acceptance Criteria` bullet in a plan (`.plans/PLAN-BLD-*.md`)
# must satisfy ONE of the following:
#
#   1. The bullet contains an explicit `[test: <path>[::"<test name>"]]`
#      annotation pointing at an existing file under `__tests__/` or
#      `e2e/scenarios/`.
#   2. There is at least one test file under `__tests__/acceptance/` or
#      `e2e/scenarios/` whose contents reference the plan's BLD ticket
#      (header comment `// BLD-XXXX:` or similar) AND the AC label
#      (`AC1`, `AC2a`, etc.) in a `describe` / `it` / `test` name.
#
# Modes
# -----
#   <no args>                        — audit every plan in `.plans/`
#   --since <git-rev>                — audit plans whose ticket landed since
#                                      <git-rev> (e.g. `7.days.ago`)
#   --plan <path-or-BLD-id>          — audit a single plan
#   --shipped-window <N>             — audit plans for tickets shipped in the
#                                      past N days (default: 7) — used by
#                                      daily-audit.sh and the rolling UX gate
#   --changed-vs <git-rev>           — audit ONLY plans modified vs <git-rev>
#                                      (e.g. `origin/main`). Pre-push uses
#                                      this so legacy plans don't block dev.
#   --warn-only                      — print findings but always exit 0
#                                      (use during the migration grace period
#                                      since most existing plans pre-date this
#                                      convention)
#
# Legacy plan opt-out
# -------------------
# Plans containing the marker `<!-- ac-audit: legacy -->` anywhere in the file
# are skipped (grandfathered). Use sparingly; the goal is to backfill, not to
# permanently exempt plans.
#
# Exit codes
# ----------
#   0   — all ACs satisfied (or --warn-only)
#   1   — at least one AC lacks a test reference
#   2   — usage error / missing file
#
# Refs: BLD-1123, BLD-1124. Companion: scripts/audit-tests.sh.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

PLANS_DIR=".plans"
TESTS_DIR="__tests__"
E2E_DIR="e2e/scenarios"

MODE="all"
SINCE=""
SINGLE_PLAN=""
SHIPPED_WINDOW="7"
CHANGED_VS=""
WARN_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --since)            SINCE="$2"; MODE="since"; shift 2 ;;
    --plan)             SINGLE_PLAN="$2"; MODE="single"; shift 2 ;;
    --shipped-window)   SHIPPED_WINDOW="$2"; MODE="shipped"; shift 2 ;;
    --changed-vs)       CHANGED_VS="$2"; MODE="changed-vs"; shift 2 ;;
    --warn-only)        WARN_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,55p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ─── Plan discovery ──────────────────────────────────────────────────────
declare -a PLANS
case "$MODE" in
  all)
    while IFS= read -r -d '' p; do PLANS+=("$p"); done \
      < <(find "$PLANS_DIR" -maxdepth 1 -name 'PLAN-BLD-*.md' -print0 2>/dev/null | sort -z)
    ;;
  single)
    if [ -f "$SINGLE_PLAN" ]; then
      PLANS=("$SINGLE_PLAN")
    elif [ -f "$PLANS_DIR/PLAN-${SINGLE_PLAN}.md" ]; then
      PLANS=("$PLANS_DIR/PLAN-${SINGLE_PLAN}.md")
    elif [ -f "$PLANS_DIR/PLAN-BLD-${SINGLE_PLAN#BLD-}.md" ]; then
      PLANS=("$PLANS_DIR/PLAN-BLD-${SINGLE_PLAN#BLD-}.md")
    else
      echo "plan not found: $SINGLE_PLAN" >&2; exit 2
    fi
    ;;
  since)
    # Plans modified since <rev>
    while IFS= read -r line; do
      [ -n "$line" ] && [ -f "$line" ] && PLANS+=("$line")
    done < <(git diff --name-only "$SINCE" -- "$PLANS_DIR/PLAN-BLD-*.md" 2>/dev/null | sort -u)
    ;;
  shipped)
    # Tickets shipped in past N days = BLD-XXXX refs in commit messages
    since_date="${SHIPPED_WINDOW} days ago"
    TICKETS=()
    while IFS= read -r t; do
      [ -n "$t" ] && TICKETS+=("$t")
    done < <(git log --since="$since_date" --pretty=format:'%s%n%b' \
      | grep -oE 'BLD-[0-9]+' | sort -u)
    for t in "${TICKETS[@]}"; do
      p="$PLANS_DIR/PLAN-${t}.md"
      [ -f "$p" ] && PLANS+=("$p")
    done
    ;;
  changed-vs)
    # Plans modified vs <git-rev> — used by pre-push so legacy plans don't
    # block dev. New convention only enforced when the plan itself is touched.
    while IFS= read -r line; do
      [ -n "$line" ] && [ -f "$line" ] && PLANS+=("$line")
    done < <(git diff --name-only "$CHANGED_VS"...HEAD -- "$PLANS_DIR/PLAN-BLD-*.md" 2>/dev/null | sort -u)
    ;;
esac

if [ ${#PLANS[@]} -eq 0 ]; then
  echo "no plans selected — nothing to audit"
  exit 0
fi

echo "=== Acceptance-Criteria audit (BLD-1123) ==="
echo "  Mode: $MODE"
[ "$MODE" = "shipped" ] && echo "  Window: past ${SHIPPED_WINDOW} days"
echo "  Plans: ${#PLANS[@]}"
echo "  Warn-only: $WARN_ONLY"
echo ""

# ─── Per-plan audit ──────────────────────────────────────────────────────
TOTAL_AC=0
TOTAL_MISSING=0
SKIPPED_LEGACY=0
declare -a MISSING_REPORT
declare -a LEGACY_PLANS

for plan in "${PLANS[@]}"; do
  ticket=$(basename "$plan" .md | sed 's/^PLAN-//')          # e.g. BLD-1105

  # Legacy opt-out marker (sparingly used — backfill is the goal)
  if grep -q '<!-- ac-audit: legacy -->' "$plan" 2>/dev/null; then
    SKIPPED_LEGACY=$((SKIPPED_LEGACY + 1))
    LEGACY_PLANS+=("$ticket")
    continue
  fi

  # Extract the "## Acceptance Criteria" block (until next "##" heading)
  ac_block=$(awk '
    /^##[[:space:]]+Acceptance Criteria/ { in_block=1; next }
    in_block && /^##[[:space:]]/ { in_block=0 }
    in_block { print }
  ' "$plan")

  if [ -z "$ac_block" ]; then
    # No AC section — skip (informational plans, drafts)
    continue
  fi

  # Each AC bullet starts with `- [ ]` or `- [x]` and contains `**ACn**`
  AC_LINES=()
  while IFS= read -r line; do
    [ -n "$line" ] && AC_LINES+=("$line")
  done < <(echo "$ac_block" | grep -E '^\s*-\s*\[[ x]\]' || true)

  if [ ${#AC_LINES[@]} -eq 0 ]; then
    continue
  fi

  plan_missing=0
  for line in "${AC_LINES[@]}"; do
    TOTAL_AC=$((TOTAL_AC + 1))
    # Extract AC label (e.g. AC1, AC2a, AC10)
    ac_label=$(echo "$line" | grep -oE '\*\*AC[0-9]+[a-z]?\*\*' | head -1 | tr -d '*' || true)
    [ -z "$ac_label" ] && ac_label="AC?"

    # 0) Gate annotation `[gate: ...]` → CI/process-verified, no file check needed
    gate_ref=$(echo "$line" | grep -oE '\[gate:[^]]+\]' | head -1 || true)
    if [ -n "$gate_ref" ]; then
      continue   # ✅ CI/process gate — verified by CI, not a test file
    fi

    # 1) Inline annotation `[test: path]` → check file exists
    test_ref=$(echo "$line" | grep -oE '\[test:[^]]+\]' | head -1 || true)
    if [ -n "$test_ref" ]; then
      path=$(echo "$test_ref" | sed -E 's/\[test:\s*//; s/\s*\]$//; s/::.*$//; s/^`//; s/`$//; s/\s.*$//')
      if [ -f "$path" ]; then
        continue   # ✅ explicit ref + file exists
      else
        MISSING_REPORT+=("  X $ticket $ac_label -- annotation [$test_ref] points at missing file: $path")
        plan_missing=$((plan_missing + 1))
        TOTAL_MISSING=$((TOTAL_MISSING + 1))
        continue
      fi
    fi

    # 2) Inferred — test file under __tests__/acceptance/ OR e2e/scenarios/
    #    that references this ticket AND mentions this AC label
    matched=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      if grep -q "$ticket" "$f" 2>/dev/null && grep -q "\b${ac_label}\b" "$f" 2>/dev/null; then
        matched=1
        break
      fi
    done < <(
      find "$TESTS_DIR/acceptance" "$E2E_DIR" \
        \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) \
        2>/dev/null
    )

    if [ "$matched" -eq 0 ]; then
      snippet=$(echo "$line" | sed -E 's/^\s*-\s*\[[ x]\]\s*//; s/^[*]+AC[0-9]+[a-z]?[*]+\s*//' | cut -c1-80)
      MISSING_REPORT+=("  X $ticket $ac_label -- no test references this AC. ${snippet}...")
      plan_missing=$((plan_missing + 1))
      TOTAL_MISSING=$((TOTAL_MISSING + 1))
    fi
  done

  if [ "$plan_missing" -gt 0 ]; then
    echo "$ticket: $plan_missing/${#AC_LINES[@]} ACs lacking test coverage"
  else
    echo "$ticket: ✅ all ${#AC_LINES[@]} ACs covered"
  fi
done

echo ""
echo "=== Summary ==="
echo "  Total ACs inspected: $TOTAL_AC"
echo "  Missing test refs:   $TOTAL_MISSING"
echo "  Plans skipped (legacy marker): $SKIPPED_LEGACY"
if [ "$SKIPPED_LEGACY" -gt 0 ]; then
  echo "    -> ${LEGACY_PLANS[*]}"
fi

if [ "$TOTAL_MISSING" -gt 0 ]; then
  echo ""
  echo "Findings:"
  for line in "${MISSING_REPORT[@]}"; do
    echo "$line"
  done
  echo ""
  echo "Fix: add an explicit annotation to the AC bullet:"
  echo "    - [ ] **AC1** ... [test: __tests__/acceptance/foo.test.tsx::\"opens sheet\"]"
  echo "  OR add a test under __tests__/acceptance/ or e2e/scenarios/ that"
  echo "  references both the BLD ticket (in a header comment) and the AC label"
  echo "  (in a describe/it name)."
  if [ "$WARN_ONLY" -eq 1 ]; then
    echo ""
    echo "⚠️  --warn-only mode — exiting 0 despite findings."
    exit 0
  fi
  exit 1
fi

echo "✅ All inspected ACs have test coverage."
exit 0
