#!/usr/bin/env bash
# Test Audit Script — detects duplicate/overlapping tests and guards runtime.
# Run: ./scripts/audit-tests.sh
#
# Policy update (BLD-1123, 2026-05-09):
#   - The previous global hard cap on total test count (MAX_TESTS=2500/2800) is
#     REMOVED. Acceptance-criteria test enforcement (scripts/audit-acceptance-
#     criteria.sh) will only grow the suite legitimately, and a global cap
#     creates perverse incentives to skip AC tests. The runtime budget remains
#     because slow CI is bad regardless of test count.
#   - Per-ticket test count is REPORTED (informational only) — grouped by the
#     BLD-XXXX reference parsed from changed test file headers, so reviewers
#     can spot pathological per-feature growth at a glance.
#
# Flags / env:
#   --detail                 show extended mock-overlap matrix
#   --skip-runtime           skip the npm test runtime check (fast audit)
#   RUNTIME_BUDGET_SECONDS   override runtime ceiling (default: 150)
#   PER_TICKET_WARN_TESTS    soft warn threshold per BLD ticket (default: 50)
#   SKIP_RUNTIME=1           same as --skip-runtime

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/__tests__"

# ─── Configuration ───────────────────────────────────────────────
RUNTIME_BUDGET_SECONDS="${RUNTIME_BUDGET_SECONDS:-150}" # wall-time ceiling for `npm test`
RUNTIME_WARN_SECONDS="${RUNTIME_WARN_SECONDS:-120}"     # warning threshold
PER_TICKET_WARN_TESTS="${PER_TICKET_WARN_TESTS:-50}"    # soft per-ticket warn (informational)
# ─────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────

# Parse flags and file arguments
SKIP_RUNTIME="${SKIP_RUNTIME:-0}"
DETAIL=0
CHANGED_FILES=()
for arg in "$@"; do
  case "$arg" in
    --skip-runtime) SKIP_RUNTIME=1 ;;
    --detail)       DETAIL=1 ;;
    *)              CHANGED_FILES+=("$arg") ;;
  esac
done
SCOPED=$( [ ${#CHANGED_FILES[@]} -gt 0 ] && echo 1 || echo 0 )

echo "=== CableSnap Test Audit ==="
echo ""

# 1. Count total test cases (informational — no global cap as of BLD-1123)
TOTAL=$(grep -r "^\s*\(it\|test\)(" "$TEST_DIR" --include='*.ts' --include='*.tsx' | wc -l | tr -d ' ')
echo "Total test cases (it/test): $TOTAL"
echo "  (No global cap. Per-ticket counts shown below.)"
OVER_BUDGET=0

echo ""

# Helper: run grep against scoped files or full TEST_DIR
# Usage: scoped_grep [grep-flags...] PATTERN
# When SCOPED=1, searches only CHANGED_FILES; otherwise searches TEST_DIR recursively.
scoped_grep() {
  if [ "$SCOPED" -eq 1 ]; then
    grep "$@" "${CHANGED_FILES[@]}" 2>/dev/null || true
  else
    grep -r "$@" "$TEST_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null || true
  fi
}

SCOPE_LABEL=""
if [ "$SCOPED" -eq 1 ]; then
  SCOPE_LABEL=" (scoped to ${#CHANGED_FILES[@]} changed file(s))"
fi

# 2. Count tests per file (top 20)
echo "=== Tests per file (top 20)${SCOPE_LABEL} ==="
scoped_grep -c "^\s*\(it\|test\)(" \
  | sed "s|$PROJECT_ROOT/||" \
  | sort -t: -k2 -rn \
  | head -20

echo ""

# 3. Find describe blocks that appear in multiple files (potential overlap)
echo "=== Repeated describe topics (potential overlap)${SCOPE_LABEL} ==="
scoped_grep -oh "describe(['\"][^'\"]*['\"]" \
  | sed "s/describe(['\"]//;s/['\"]$//" \
  | sort | uniq -c | sort -rn \
  | awk '$1 > 1 { print "  " $1 "x: " substr($0, index($0,$2)) }'

echo ""

# 4. Find test descriptions that appear in multiple files
echo "=== Duplicate test names (exact matches across files)${SCOPE_LABEL} ==="
scoped_grep -oh "\(it\|test\)(['\"][^'\"]*['\"]" \
  | sed "s/\(it\|test\)(['\"]//;s/['\"]$//" \
  | sort | uniq -c | sort -rn \
  | awk '$1 > 1 { print "  " $1 "x: " substr($0, index($0,$2)) }' \
  | head -30

echo ""

# 5. Detect structural/source-reading tests (fs.readFileSync in tests)
echo "=== Source-reading tests (fs.readFileSync in test files)${SCOPE_LABEL} ==="
if [ "$SCOPED" -eq 1 ]; then
  for f in "${CHANGED_FILES[@]}"; do
    if grep -q "readFileSync" "$f" 2>/dev/null; then
      count=$(grep -c "readFileSync" "$f" || true)
      tests=$(grep -c "^\s*\(it\|test\)(" "$f" || true)
      relf=$(echo "$f" | sed "s|$PROJECT_ROOT/||")
      echo "  $relf ($tests tests, $count file reads)"
    fi
  done
else
  grep -rl "readFileSync" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
    | sed "s|$PROJECT_ROOT/||" \
    | while read -r f; do
      count=$(grep -c "readFileSync" "$PROJECT_ROOT/$f" || true)
      tests=$(grep -c "^\s*\(it\|test\)(" "$PROJECT_ROOT/$f" || true)
      echo "  $f ($tests tests, $count file reads)"
    done
fi

echo ""

# 6. Show beforeEach duplication (files with very similar setup)
echo "=== beforeEach block count per file (top 15)${SCOPE_LABEL} ==="
scoped_grep -c "beforeEach" \
  | sed "s|$PROJECT_ROOT/||" \
  | sort -t: -k2 -rn \
  | head -15

echo ""

# 7. Detail mode: show which files share mocked modules
if [[ "$DETAIL" -eq 1 ]]; then
  echo "=== Mock overlap matrix ==="
  echo "(files that mock the same modules — candidates for shared setup)"
  echo ""

  # Extract mocked modules per file
  TMP=$(mktemp -d)
  grep -rl "jest.mock(" "$TEST_DIR" --include='*.ts' --include='*.tsx' | while read -r f; do
    relpath=$(echo "$f" | sed "s|$PROJECT_ROOT/||")
    grep -oh "jest.mock(['\"][^'\"]*['\"]" "$f" \
      | sed "s/jest.mock(['\"]//;s/['\"]$//" \
      | sort -u > "$TMP/$(echo "$relpath" | tr '/' '_')"
  done

  # Find pairs with high overlap
  echo "Files sharing 5+ mocked modules:"
  for a in "$TMP"/*; do
    for b in "$TMP"/*; do
      [[ "$a" < "$b" ]] || continue
      overlap=$(comm -12 "$a" "$b" | wc -l | tr -d ' ')
      if [ "$overlap" -ge 5 ]; then
        fa=$(basename "$a" | tr '_' '/')
        fb=$(basename "$b" | tr '_' '/')
        echo "  $overlap shared mocks: $fa  ↔  $fb"
      fi
    done
  done

  rm -rf "$TMP"
  echo ""
fi

# 8. Per-ticket test count (BLD-1123 — replaces global cap)
echo "=== Per-ticket test counts (BLD-XXXX header references)${SCOPE_LABEL} ==="
echo "  (Test files declare ownership via a header comment like:"
echo "    // BLD-1108: covers AC1, AC5, AC6 from PLAN-BLD-1105.md"
echo "  ; informational — soft warn at ${PER_TICKET_WARN_TESTS} tests/ticket)"
echo ""
PER_TICKET_TMP=$(mktemp)
TARGET_FILES=()
if [ "$SCOPED" -eq 1 ]; then
  TARGET_FILES=("${CHANGED_FILES[@]}")
else
  while IFS= read -r f; do
    [ -n "$f" ] && TARGET_FILES+=("$f")
  done < <(find "$TEST_DIR" \( -name '*.test.ts' -o -name '*.test.tsx' \) 2>/dev/null)
fi
for f in "${TARGET_FILES[@]}"; do
  [ -f "$f" ] || continue
  ticket=$(head -20 "$f" 2>/dev/null | grep -oE "BLD-[0-9]+" | head -1 || true)
  [ -z "$ticket" ] && ticket="UNTAGGED"
  test_count=$(grep -c "^\s*\(it\|test\)(" "$f" || true)
  echo "$ticket $test_count" >> "$PER_TICKET_TMP"
done
if [ -s "$PER_TICKET_TMP" ]; then
  awk '{tickets[$1] += $2; files[$1]++} END {for (t in tickets) printf "%s\t%d tests across %d file(s)\n", t, tickets[t], files[t]}' "$PER_TICKET_TMP" \
    | sort -t$'\t' -k2 -rn \
    | while IFS=$'\t' read -r ticket info; do
        count=$(echo "$info" | grep -oE "^[0-9]+" || echo "0")
        if [ "${count:-0}" -gt "$PER_TICKET_WARN_TESTS" ]; then
          echo "  ⚠️  $ticket: $info  (over per-ticket warn: $PER_TICKET_WARN_TESTS)"
        else
          echo "  $ticket: $info"
        fi
      done
else
  echo "  (no test files inspected)"
fi
rm -f "$PER_TICKET_TMP"
echo ""

# 9. Summary recommendations
echo "=== Consolidation opportunities ==="
echo "  1. Extract shared router/infra mocks → __tests__/helpers/screen-harness.ts"
echo "  2. Create domain mock factories → __tests__/helpers/mock-nutrition.ts, etc."
echo "  3. Merge flows/* ↔ acceptance/* suites with overlapping coverage"
echo "  4. Replace source-string tests with behavioral assertions where possible"
echo "  5. Move jest.setTimeout(10000) to jest.config.js: testTimeout: 10000"
echo ""

# 9. Runtime budget check — time `npm test` wall-clock and compare to ceiling
OVER_RUNTIME=0
RUNTIME_SECONDS=""
if [ "$SKIP_RUNTIME" -eq 1 ]; then
  echo "=== Runtime budget (skipped) ==="
  echo "  ⏭  Skipped (--skip-runtime or SKIP_RUNTIME=1)"
  echo ""
else
  echo "=== Runtime budget ==="
  echo "  Budget: warn=${RUNTIME_WARN_SECONDS}s, max=${RUNTIME_BUDGET_SECONDS}s"
  echo "  Running: npm test --silent (this may take a couple of minutes)…"
  RUNTIME_LOG="$(mktemp)"
  START_EPOCH=$(date +%s)
  set +e
  ( cd "$PROJECT_ROOT" && NODE_ENV=test npx jest --silent ) >"$RUNTIME_LOG" 2>&1
  TEST_EXIT=$?
  set -e
  END_EPOCH=$(date +%s)
  RUNTIME_SECONDS=$((END_EPOCH - START_EPOCH))

  if [ "$TEST_EXIT" -ne 0 ]; then
    echo "  ❌ npm test FAILED (exit $TEST_EXIT) — last 40 lines:"
    tail -n 40 "$RUNTIME_LOG" | sed 's/^/    /'
    rm -f "$RUNTIME_LOG"
    echo ""
    echo "❌ Test audit FAILED — npm test did not pass"
    exit 1
  fi
  rm -f "$RUNTIME_LOG"

  echo "  Wall-time: ${RUNTIME_SECONDS}s"
  if [ "$RUNTIME_SECONDS" -gt "$RUNTIME_BUDGET_SECONDS" ]; then
    echo "  ❌ OVER RUNTIME BUDGET by $((RUNTIME_SECONDS - RUNTIME_BUDGET_SECONDS))s"
    OVER_RUNTIME=1
  elif [ "$RUNTIME_SECONDS" -gt "$RUNTIME_WARN_SECONDS" ]; then
    echo "  ⚠️  Approaching runtime budget ($((RUNTIME_BUDGET_SECONDS - RUNTIME_SECONDS))s remaining)"
  else
    echo "  ✅ Within runtime budget ($((RUNTIME_BUDGET_SECONDS - RUNTIME_SECONDS))s remaining)"
  fi
  echo ""
fi

if [ "$OVER_BUDGET" -eq 1 ] || [ "$OVER_RUNTIME" -eq 1 ]; then
  echo "❌ Test audit FAILED — runtime budget breached"
  [ "$OVER_RUNTIME" -eq 1 ] && echo "   • runtime ceiling breached (${RUNTIME_SECONDS}s > ${RUNTIME_BUDGET_SECONDS}s)"
  exit 1
else
  echo "✅ Test audit passed (runtime within budget; per-ticket counts informational)"
  exit 0
fi
