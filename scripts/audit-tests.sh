#!/usr/bin/env bash
# Test Audit Script — detects duplicate/overlapping tests
# Run: ./scripts/audit-tests.sh
# Exit code 1 if test count exceeds budget (configurable below)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/__tests__"

# ─── Configuration ───────────────────────────────────────────────
MAX_TESTS=1800          # hard ceiling — fail if exceeded
WARN_TESTS=1600         # warning threshold
# ─────────────────────────────────────────────────────────────────

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
if [[ "${1:-}" == "--detail" ]]; then
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

if [ "$OVER_BUDGET" -eq 1 ]; then
  echo "❌ Test audit FAILED — consolidate before pushing"
  exit 1
else
  echo "✅ Test audit passed"
  exit 0
fi
