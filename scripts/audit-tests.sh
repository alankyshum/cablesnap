#!/usr/bin/env bash
# Test Audit Script — detects duplicate/overlapping tests and guards runtime
# Run: ./scripts/audit-tests.sh
# Exit code 1 if test count or wall-time exceeds budget (configurable below).
#
# Flags / env:
#   --detail                 show extended mock-overlap matrix
#   --skip-runtime           skip the npm test runtime check (fast audit)
#   RUNTIME_BUDGET_SECONDS   override runtime ceiling (default: 150)
#   MAX_TESTS                override count ceiling (default: 1800)
#   SKIP_RUNTIME=1           same as --skip-runtime

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/__tests__"

# ─── Configuration ───────────────────────────────────────────────
MAX_TESTS="${MAX_TESTS:-1800}"                          # hard ceiling — fail if exceeded
WARN_TESTS="${WARN_TESTS:-1600}"                        # warning threshold
RUNTIME_BUDGET_SECONDS="${RUNTIME_BUDGET_SECONDS:-150}" # wall-time ceiling for `npm test`
RUNTIME_WARN_SECONDS="${RUNTIME_WARN_SECONDS:-120}"     # warning threshold
# ─────────────────────────────────────────────────────────────────

# Parse flags
SKIP_RUNTIME="${SKIP_RUNTIME:-0}"
DETAIL=0
for arg in "$@"; do
  case "$arg" in
    --skip-runtime) SKIP_RUNTIME=1 ;;
    --detail)       DETAIL=1 ;;
  esac
done

echo "=== CableSnap Test Audit ==="
echo ""

# 1. Count total test cases
TOTAL=$(grep -r "^\s*\(it\|test\)(" "$TEST_DIR" --include='*.ts' --include='*.tsx' | wc -l | tr -d ' ')
echo "Total test cases (it/test): $TOTAL"
echo "  Budget: warn=$WARN_TESTS, max=$MAX_TESTS"

if [ "$TOTAL" -gt "$MAX_TESTS" ]; then
  echo "  ❌ OVER BUDGET by $((TOTAL - MAX_TESTS)) tests"
  echo ""
  echo "  Before adding new tests, consolidate overlapping suites."
  echo "  Run: ./scripts/audit-tests.sh --detail"
  echo ""
  OVER_BUDGET=1
elif [ "$TOTAL" -gt "$WARN_TESTS" ]; then
  echo "  ⚠️  Approaching budget ($((MAX_TESTS - TOTAL)) remaining)"
  OVER_BUDGET=0
else
  echo "  ✅ Within budget ($((MAX_TESTS - TOTAL)) remaining)"
  OVER_BUDGET=0
fi

echo ""

# 2. Count tests per file (top 20)
echo "=== Tests per file (top 20) ==="
grep -rc "^\s*\(it\|test\)(" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
  | sed "s|$PROJECT_ROOT/||" \
  | sort -t: -k2 -rn \
  | head -20

echo ""

# 3. Find describe blocks that appear in multiple files (potential overlap)
echo "=== Repeated describe topics (potential overlap) ==="
grep -roh "describe(['\"][^'\"]*['\"]" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
  | sed "s/describe(['\"]//;s/['\"]$//" \
  | sort | uniq -c | sort -rn \
  | awk '$1 > 1 { print "  " $1 "x: " substr($0, index($0,$2)) }'

echo ""

# 4. Find test descriptions that appear in multiple files
echo "=== Duplicate test names (exact matches across files) ==="
grep -roh "\(it\|test\)(['\"][^'\"]*['\"]" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
  | sed "s/\(it\|test\)(['\"]//;s/['\"]$//" \
  | sort | uniq -c | sort -rn \
  | awk '$1 > 1 { print "  " $1 "x: " substr($0, index($0,$2)) }' \
  | head -30

echo ""

# 5. Detect structural/source-reading tests (fs.readFileSync in tests)
echo "=== Source-reading tests (fs.readFileSync in test files) ==="
grep -rl "readFileSync" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
  | sed "s|$PROJECT_ROOT/||" \
  | while read -r f; do
    count=$(grep -c "readFileSync" "$PROJECT_ROOT/$f" || true)
    tests=$(grep -c "^\s*\(it\|test\)(" "$PROJECT_ROOT/$f" || true)
    echo "  $f ($tests tests, $count file reads)"
  done

echo ""

# 6. Show beforeEach duplication (files with very similar setup)
echo "=== beforeEach block count per file (top 15) ==="
grep -rc "beforeEach" "$TEST_DIR" --include='*.ts' --include='*.tsx' \
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

# 8. Summary recommendations
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
  ( cd "$PROJECT_ROOT" && npm test --silent -- --silent ) >"$RUNTIME_LOG" 2>&1
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
  echo "❌ Test audit FAILED — consolidate before pushing"
  [ "$OVER_BUDGET" -eq 1 ]  && echo "   • count ceiling breached ($TOTAL > $MAX_TESTS)"
  [ "$OVER_RUNTIME" -eq 1 ] && echo "   • runtime ceiling breached (${RUNTIME_SECONDS}s > ${RUNTIME_BUDGET_SECONDS}s)"
  exit 1
else
  echo "✅ Test audit passed"
  exit 0
fi
