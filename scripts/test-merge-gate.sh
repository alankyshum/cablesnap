#!/usr/bin/env bash
# test-merge-gate.sh — Unit tests for scripts/merge-gate.sh
#
# Tests two layers:
#   1. classify_comment() — sourced from merge-gate.sh, exercised on fixed
#      comment bodies covering sentinel + legacy prose conventions.
#   2. End-to-end gate with mocked `gh` — fakes the PR JSON + branch protection
#      response so we can verify mode-aware approval logic without hitting
#      GitHub.
#
# Run:
#   ./scripts/test-merge-gate.sh
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GATE_SCRIPT="$SCRIPT_DIR/merge-gate.sh"

if [[ ! -f "$GATE_SCRIPT" ]]; then
  echo "ERROR: $GATE_SCRIPT not found" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED_NAMES=()

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
    echo "  ✓ $name"
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$name")
    echo "  ✗ $name" >&2
    echo "      expected: '$expected'" >&2
    echo "      actual:   '$actual'" >&2
  fi
}

# ─── Layer 1: classify_comment ────────────────────────────────────────
# Source the function from merge-gate.sh by extracting just its definition,
# avoiding execution of the rest of the script. We use a small wrapper that
# defines the prerequisite globals (none required for classify_comment) and
# evals only the function body.

extract_classify_comment() {
  awk '
    /^classify_comment\(\)[[:space:]]*\{/ { in_fn=1 }
    in_fn { print }
    in_fn && /^\}[[:space:]]*$/ { in_fn=0 }
  ' "$GATE_SCRIPT"
}

# Source classify_comment into a subshell-friendly form
eval "$(extract_classify_comment)"

if ! declare -F classify_comment >/dev/null; then
  echo "ERROR: failed to extract classify_comment from $GATE_SCRIPT" >&2
  exit 1
fi

echo
echo "── Layer 1: classify_comment ──"

# 1a — sentinel: techlead APPROVE
assert_eq "sentinel techlead APPROVE" \
  "techlead APPROVE" \
  "$(classify_comment 'Some preamble.
MERGE-GATE: techlead APPROVE
trailing stuff')"

# 1b — sentinel: techlead BLOCK
assert_eq "sentinel techlead BLOCK" \
  "techlead BLOCK" \
  "$(classify_comment 'MERGE-GATE: techlead BLOCK')"

# 1c — sentinel: quality-director APPROVE
assert_eq "sentinel quality-director APPROVE" \
  "qd APPROVE" \
  "$(classify_comment 'MERGE-GATE: quality-director APPROVE')"

# 1d — sentinel: qd alias
assert_eq "sentinel qd alias APPROVE" \
  "qd APPROVE" \
  "$(classify_comment 'MERGE-GATE: qd APPROVE')"

# 1e — legacy prose: techlead APPROVE
assert_eq "legacy techlead APPROVE" \
  "techlead APPROVE" \
  "$(classify_comment '## techlead Code Review — APPROVE ✅
(Posted as comment because GitHub blocks self-approve on the bot account.)
**Root cause correctly identified**: parent `<View>` is `flexDirection: row`...
**Recommendation**: Mark PR ready-for-review and merge once @quality-director confirms.')"

# 1f — legacy prose: Tech Lead Review APPROVED variant
assert_eq "legacy Tech Lead APPROVED variant" \
  "techlead APPROVE" \
  "$(classify_comment '## Tech Lead Review
Verdict: APPROVED — ship it.')"

# 1g — legacy prose: techlead BLOCK
assert_eq "legacy techlead BLOCK" \
  "techlead BLOCK" \
  "$(classify_comment '## techlead Code Review
NEEDS CHANGES — see comments.')"

# 1h — legacy prose: QD pass
assert_eq "legacy QD PASS" \
  "qd APPROVE" \
  "$(classify_comment '## Quality Director
QA verification PASS. All gates green.')"

# 1i — legacy prose: QD block
assert_eq "legacy QD BLOCK" \
  "qd BLOCK" \
  "$(classify_comment '## QA
BLOCK — fixture missing seed hook.')"

# 1j — sentinel takes precedence over prose
assert_eq "sentinel beats prose" \
  "techlead BLOCK" \
  "$(classify_comment '## techlead Code Review — APPROVE
But updated:
MERGE-GATE: techlead BLOCK
needs another pass.')"

# 1k — neither role nor verdict → empty
assert_eq "no role no verdict" \
  "" \
  "$(classify_comment 'just a regular comment with no markers')"

# 1l — verdict without role → empty (we will not infer role)
assert_eq "verdict without role" \
  "" \
  "$(classify_comment 'LGTM personally, but no formal review.')"

# 1m — role without verdict → empty
assert_eq "role without verdict" \
  "" \
  "$(classify_comment '## techlead
Will review tomorrow.')"

# 1n — sentinel case insensitive
assert_eq "sentinel mixed case" \
  "techlead APPROVE" \
  "$(classify_comment 'merge-gate: techlead approve')"

# 1o — block keyword wins over approve in same comment (legacy prose)
assert_eq "legacy block beats approve in same comment" \
  "techlead BLOCK" \
  "$(classify_comment '## techlead
APPROVE the direction, but BLOCK on this PR.')"

# ─── Layer 2: end-to-end gate with mocked gh ──────────────────────────
echo
echo "── Layer 2: end-to-end gate (mocked gh) ──"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# Build a fake `gh` binary on PATH that returns canned JSON depending on args.
make_fake_gh() {
  local pr_json_file="$1" protection_count="$2"
  cat > "$WORKDIR/gh" <<EOF
#!/usr/bin/env bash
# Fake gh — args drive which fixture is returned.
if [[ "\$1" == "pr" && "\$2" == "view" ]]; then
  cat "$pr_json_file"
  exit 0
fi
if [[ "\$1" == "api" ]]; then
  if [[ "\$*" == *"branches/main/protection"* ]]; then
    if [[ "$protection_count" == "ERROR" ]]; then
      exit 1
    fi
    echo "$protection_count"
    exit 0
  fi
fi
echo "fake gh: unhandled args: \$*" >&2
exit 1
EOF
  chmod +x "$WORKDIR/gh"
}

run_gate() {
  PATH="$WORKDIR:$PATH" bash "$GATE_SCRIPT" 999 alankyshum/cablesnap 2>&1
}

# Base PR JSON (clean, mergeable, all checks green, no formal reviews)
base_pr_json() {
  local comments_json="$1"
  cat <<EOF
{
  "state": "OPEN",
  "isDraft": false,
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "CLEAN",
  "reviews": [],
  "statusCheckRollup": [
    {"name": "Verify scenario hook not in production bundle", "conclusion": "SUCCESS"}
  ],
  "comments": $comments_json
}
EOF
}

# Helper: write base PR JSON to a temp file and configure fake gh to serve it.
fixture_pr() {
  local comments_json="$1" protection_count="$2"
  local f="$WORKDIR/pr-$RANDOM.json"
  base_pr_json "$comments_json" > "$f"
  make_fake_gh "$f" "$protection_count"
}

# 2a — LENIENT mode + sentinels for both roles → PASS
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"},
  {"createdAt": "2026-05-02T02:00:00Z", "body": "MERGE-GATE: quality-director APPROVE"}
]' "0"
out=$(run_gate); rc=$?
assert_eq "LENIENT + tl+qd sentinels → exit 0" "0" "$rc"
if echo "$out" | grep -q "Merge gate PASSED"; then
  PASS=$((PASS + 1)); echo "  ✓ LENIENT pass message present"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("LENIENT pass message"); echo "  ✗ LENIENT pass message missing" >&2; echo "$out" >&2
fi

# 2b — LENIENT mode + only techlead APPROVE (QD missing) → FAIL
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"}
]' "0"
out=$(run_gate); rc=$?
assert_eq "LENIENT + tl-only → exit 1" "1" "$rc"
if echo "$out" | grep -q "quality-director (latest=none)"; then
  PASS=$((PASS + 1)); echo "  ✓ LENIENT missing-QD message present"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("LENIENT missing-QD message"); echo "  ✗ LENIENT missing-QD message" >&2; echo "$out" >&2
fi

# 2c — LENIENT mode + latest QD verdict is BLOCK (after earlier APPROVE) → FAIL
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"},
  {"createdAt": "2026-05-02T02:00:00Z", "body": "MERGE-GATE: quality-director APPROVE"},
  {"createdAt": "2026-05-02T03:00:00Z", "body": "MERGE-GATE: quality-director BLOCK"}
]' "0"
out=$(run_gate); rc=$?
assert_eq "LENIENT + latest QD BLOCK → exit 1" "1" "$rc"
if echo "$out" | grep -q "quality-director (latest=BLOCK)"; then
  PASS=$((PASS + 1)); echo "  ✓ LENIENT latest-block message present"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("LENIENT latest-block message"); echo "  ✗ LENIENT latest-block message" >&2; echo "$out" >&2
fi

# 2d — STRICT mode + no formal reviews → FAIL with strict message
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"},
  {"createdAt": "2026-05-02T02:00:00Z", "body": "MERGE-GATE: quality-director APPROVE"}
]' "1"
out=$(run_gate); rc=$?
assert_eq "STRICT + sentinels-only → exit 1" "1" "$rc"
if echo "$out" | grep -q "branch protection requires at least one formal APPROVED review"; then
  PASS=$((PASS + 1)); echo "  ✓ STRICT failure message references branch protection"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("STRICT failure message"); echo "  ✗ STRICT failure message" >&2; echo "$out" >&2
fi

# 2e — STRICT mode + formal APPROVED review → PASS
PR_WITH_FORMAL=$(cat <<'EOF'
{
  "state": "OPEN",
  "isDraft": false,
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "CLEAN",
  "reviews": [
    {"state": "APPROVED", "author": {"login": "human-reviewer"}}
  ],
  "statusCheckRollup": [
    {"name": "Verify scenario hook not in production bundle", "conclusion": "SUCCESS"}
  ],
  "comments": []
}
EOF
)
echo "$PR_WITH_FORMAL" > "$WORKDIR/pr.json"
make_fake_gh "$WORKDIR/pr.json" "1"
out=$(run_gate); rc=$?
assert_eq "STRICT + formal APPROVED → exit 0" "0" "$rc"

# 2f — Branch protection lookup fails → defaults to STRICT
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"},
  {"createdAt": "2026-05-02T02:00:00Z", "body": "MERGE-GATE: quality-director APPROVE"}
]' "ERROR"
out=$(run_gate); rc=$?
assert_eq "Protection lookup fail → STRICT default → exit 1" "1" "$rc"

# 2g — LENIENT + legacy prose for both → PASS (real-world PR #481-style)
fixture_pr '[
  {"createdAt": "2026-05-02T01:00:00Z", "body": "## techlead Code Review — APPROVE\n(Posted as comment because GitHub blocks self-approve on the bot account.)\n**Recommendation**: Mark PR ready-for-review and merge once @quality-director confirms."},
  {"createdAt": "2026-05-02T02:00:00Z", "body": "## Quality Director\nQA verification PASS. All gates green."}
]' "0"
out=$(run_gate); rc=$?
assert_eq "LENIENT + legacy prose both → exit 0" "0" "$rc"

# 2h — LENIENT + outstanding CHANGES_REQUESTED still blocks
PR_WITH_CR=$(cat <<'EOF'
{
  "state": "OPEN",
  "isDraft": false,
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "CLEAN",
  "reviews": [
    {"state": "CHANGES_REQUESTED", "author": {"login": "human-reviewer"}}
  ],
  "statusCheckRollup": [
    {"name": "Verify scenario hook not in production bundle", "conclusion": "SUCCESS"}
  ],
  "comments": [
    {"createdAt": "2026-05-02T01:00:00Z", "body": "MERGE-GATE: techlead APPROVE"},
    {"createdAt": "2026-05-02T02:00:00Z", "body": "MERGE-GATE: quality-director APPROVE"}
  ]
}
EOF
)
echo "$PR_WITH_CR" > "$WORKDIR/pr.json"
make_fake_gh "$WORKDIR/pr.json" "0"
out=$(run_gate); rc=$?
assert_eq "LENIENT + CHANGES_REQUESTED still blocks → exit 1" "1" "$rc"
if echo "$out" | grep -q "Outstanding CHANGES_REQUESTED reviews"; then
  PASS=$((PASS + 1)); echo "  ✓ CHANGES_REQUESTED still surfaced under LENIENT"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("CHANGES_REQUESTED surfaced"); echo "  ✗ CHANGES_REQUESTED missing" >&2; echo "$out" >&2
fi

# ─── Summary ──────────────────────────────────────────────────────────
echo
echo "── Summary ──"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  echo "Failed tests:" >&2
  for n in "${FAILED_NAMES[@]}"; do
    echo "  - $n" >&2
  done
  exit 1
fi
echo "All tests passed."
exit 0
