#!/usr/bin/env bash
# test-post-merge-gate-verdict.sh — Unit tests for scripts/post-merge-gate-verdict.sh
#
# Stubs `gh` and `clip.sh` via PATH shim + MERGE_GATE_CLIP_CMD env override.
# No real GitHub or Paperclip calls are made.
#
# Run:
#   ./scripts/test-post-merge-gate-verdict.sh
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERDICT_SCRIPT="$SCRIPT_DIR/post-merge-gate-verdict.sh"

if [[ ! -f "$VERDICT_SCRIPT" ]]; then
  echo "ERROR: $VERDICT_SCRIPT not found" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED_NAMES=()

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1)); echo "  ✓ $name"
  else
    FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
    echo "  ✗ $name" >&2
    echo "      expected: '$expected'" >&2
    echo "      actual:   '$actual'" >&2
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    PASS=$((PASS + 1)); echo "  ✓ $name"
  else
    FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
    echo "  ✗ $name" >&2
    echo "      expected to contain: '$needle'" >&2
    echo "      actual output: '$haystack'" >&2
  fi
}

assert_trace_outcome() {
  local name="$1" expected_outcome="$2"
  local last_outcome
  last_outcome=$(tail -1 "$REAL_TRACE" | cut -f7)
  if [[ "$last_outcome" == "$expected_outcome" ]]; then
    PASS=$((PASS + 1)); echo "  ✓ $name"
  else
    FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
    echo "  ✗ $name" >&2
    echo "      expected outcome: '$expected_outcome'" >&2
    echo "      actual outcome:   '$last_outcome'" >&2
    tail -3 "$REAL_TRACE" >&2
  fi
}

# ─── Workdir & trace setup ───────────────────────────────────────────
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

export MERGE_GATE_REPO="alankyshum/cablesnap"

REAL_TRACE="/tmp/merge-gate-verdict-trace.log"
> "$REAL_TRACE"

# ─── Mock factories ──────────────────────────────────────────────────

# make_fake_gh <pr_state> <comments_json> <post_should_fail> <pr_list_json>
make_fake_gh() {
  local pr_state="${1:-OPEN}"
  local comments_json="${2:-[]}"
  local post_should_fail="${3:-0}"
  local pr_list_json="${4:-[{\"number\":999}]}"

  printf '%s' "$pr_state"        > "$WORKDIR/fake-pr-state.txt"
  printf '%s' "$comments_json"   > "$WORKDIR/fake-comments.json"
  printf '%s' "$post_should_fail" > "$WORKDIR/fake-post-fail.txt"
  printf '%s' "$pr_list_json"    > "$WORKDIR/fake-pr-list.json"

  cat > "$WORKDIR/gh" <<'GHEOF'
#!/usr/bin/env bash
WDIR="$(dirname "$0")"

if [[ "${1:-}" == "pr" && "${2:-}" == "view" ]]; then
  jq_expr=""
  i=3
  while [[ $i -le $# ]]; do
    arg="${!i}"
    if [[ "$arg" == "--jq" ]]; then
      i=$((i+1)); jq_expr="${!i}"
    fi
    i=$((i+1))
  done
  pr_state=$(cat "$WDIR/fake-pr-state.txt")
  comments_json=$(cat "$WDIR/fake-comments.json")
  full_json="{\"state\":\"$pr_state\",\"comments\":$comments_json}"
  if [[ -n "$jq_expr" ]]; then
    echo "$full_json" | jq -r "$jq_expr"
  else
    echo "$full_json"
  fi
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "list" ]]; then
  cat "$WDIR/fake-pr-list.json"
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "comment" ]]; then
  should_fail=$(cat "$WDIR/fake-post-fail.txt")
  if [[ "$should_fail" == "1" ]]; then
    echo "gh: simulated post failure" >&2; exit 1
  fi
  # Capture posted body for format assertions
  i=3
  while [[ $i -le $# ]]; do
    if [[ "${!i}" == "--body" ]]; then
      i=$((i+1))
      printf '%s' "${!i}" > /tmp/test-last-posted-body.txt
      break
    fi
    i=$((i+1))
  done
  echo "posted ok"; exit 0
fi

echo "fake gh: unhandled args: $*" >&2; exit 1
GHEOF
  chmod +x "$WORKDIR/gh"
}

# make_fake_clip <issue_json> [exit_code]
make_fake_clip() {
  local issue_json="${1:-{}}"
  local clip_exit="${2:-0}"
  printf '%s' "$issue_json" > "$WORKDIR/fake-issue.json"
  printf '%s' "$clip_exit"  > "$WORKDIR/fake-clip-exit.txt"
  cat > "$WORKDIR/fake-clip.sh" <<'CLIPEOF'
#!/usr/bin/env bash
WDIR="$(dirname "$0")"
clip_exit=$(cat "$WDIR/fake-clip-exit.txt")
if [[ "$clip_exit" != "0" ]]; then
  echo "clip.sh: simulated failure" >&2; exit 1
fi
cat "$WDIR/fake-issue.json"; exit 0
CLIPEOF
  chmod +x "$WORKDIR/fake-clip.sh"
}

run_verdict() {
  PATH="$WORKDIR:$PATH" \
  MERGE_GATE_CLIP_CMD="$WORKDIR/fake-clip.sh" \
    bash "$VERDICT_SCRIPT" "$@" 2>&1
}

# ─── JSON fixtures ───────────────────────────────────────────────────
NO_PR_ISSUE='{"relatedWork":{"outbound":[],"inbound":[]},"comments":[]}'

PR_LINKED_ISSUE='{"relatedWork":{"outbound":[{"issue":{"title":""},"sources":[{"matchedText":"https://github.com/alankyshum/cablesnap/pull/999"}]}],"inbound":[]},"comments":[]}'

AMBIGUOUS_ISSUE='{"relatedWork":{"outbound":[{"issue":{"title":""},"sources":[{"matchedText":"https://github.com/alankyshum/cablesnap/pull/999"}]},{"issue":{"title":""},"sources":[{"matchedText":"https://github.com/alankyshum/cablesnap/pull/998"}]}],"inbound":[]},"comments":[]}'

EXISTING_TL_APPROVE='[{"createdAt":"2026-05-01T10:00:00Z","body":"MERGE-GATE: techlead APPROVE\n\nPosted by helper."}]'
EXISTING_QD_APPROVE='[{"createdAt":"2026-05-01T10:00:00Z","body":"MERGE-GATE: quality-director APPROVE\n\nPosted by helper."}]'
# Multiline comment where the MERGE-GATE token appears ONLY on line 2 (not line 1)
MULTILINE_SPOOFED_TL_APPROVE='[{"createdAt":"2026-05-01T10:00:00Z","body":"Just a regular review comment.\nMERGE-GATE: techlead APPROVE\nSome trailing text."}]'

echo
echo "── Layer 1: argument validation ──"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" "[]"
run_verdict "badrole" "APPROVE" "BLD-99" > /dev/null 2>&1 ; rc=$?
assert_eq "unknown role exits non-zero" "1" "$rc"
assert_trace_outcome "unknown role traces error-unknown-verdict" "error-unknown-verdict"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" "[]"
run_verdict "techlead" "WHATEVER" "BLD-99" > /dev/null 2>&1 ; rc=$?
assert_eq "unknown verdict exits non-zero" "1" "$rc"
assert_trace_outcome "unknown verdict traces error-unknown-verdict" "error-unknown-verdict"

PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="$WORKDIR/fake-clip.sh" \
  bash "$VERDICT_SCRIPT" "techlead" > /dev/null 2>&1 ; rc=$?
assert_eq "wrong arg count exits non-zero" "1" "$rc"

echo
echo "── Layer 2: PR resolution ──"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" "[]"
out=$(run_verdict "techlead" "APPROVE" "BLD-1")
assert_trace_outcome "no PR from either source → skip-no-pr" "skip-no-pr"
assert_contains "no PR → output says skip" "skip:" "$out"

make_fake_clip "$AMBIGUOUS_ISSUE"; make_fake_gh "OPEN" "[]" "0" "[]"
run_verdict "techlead" "APPROVE" "BLD-2" > /dev/null 2>&1
last=$(tail -1 "$REAL_TRACE" | cut -f7)
if echo "$last" | grep -q "skip-ambiguous"; then
  PASS=$((PASS + 1)); echo "  ✓ ambiguous Paperclip candidates → skip-ambiguous"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("ambiguous Paperclip candidates → skip-ambiguous")
  echo "  ✗ ambiguous Paperclip candidates → skip-ambiguous (got '$last')" >&2
fi

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999},{"number":998}]'
run_verdict "techlead" "APPROVE" "BLD-3" > /dev/null 2>&1
last=$(tail -1 "$REAL_TRACE" | cut -f7)
if echo "$last" | grep -q "skip-ambiguous"; then
  PASS=$((PASS + 1)); echo "  ✓ ambiguous gh search candidates → skip-ambiguous"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("ambiguous gh search candidates → skip-ambiguous")
  echo "  ✗ ambiguous gh search candidates → skip-ambiguous (got '$last')" >&2
fi

echo
echo "── Layer 3: idempotency ──"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
out=$(run_verdict "techlead" "APPROVE" "BLD-10")
assert_trace_outcome "first post → posted-first" "posted-first"
assert_contains "first post → output says posted" "posted:" "$out"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "$EXISTING_TL_APPROVE" "0" '[{"number":999}]'
out=$(run_verdict "techlead" "APPROVE" "BLD-10")
assert_trace_outcome "same verdict → skip-idempotent" "skip-idempotent"
assert_contains "same verdict → output says skip" "skip:" "$out"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "$EXISTING_TL_APPROVE" "0" '[{"number":999}]'
run_verdict "techlead" "PASS" "BLD-10" > /dev/null 2>&1
assert_trace_outcome "PASS normalised→APPROVE, idempotent" "skip-idempotent"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "$EXISTING_TL_APPROVE" "0" '[{"number":999}]'
out=$(run_verdict "techlead" "BLOCK" "BLD-10")
assert_trace_outcome "APPROVE→BLOCK flip → posted-flip" "posted-flip"
assert_contains "flip post → output says posted" "posted:" "$out"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
run_verdict "quality-director" "PASS" "BLD-20" > /dev/null 2>&1
assert_trace_outcome "QD PASS → posted-first (APPROVE)" "posted-first"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "$EXISTING_QD_APPROVE" "0" '[{"number":999}]'
run_verdict "quality-director" "FAIL" "BLD-20" > /dev/null 2>&1
assert_trace_outcome "QD FAIL normalised→BLOCK, flip" "posted-flip"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
run_verdict "techlead" "REQUEST_CHANGES" "BLD-10" > /dev/null 2>&1
assert_trace_outcome "REQUEST_CHANGES normalised→BLOCK, posted-first" "posted-first"

echo
echo "── Layer 4: gh-failure handling ──"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "1" '[{"number":999}]'
out=$(run_verdict "techlead" "APPROVE" "BLD-30"); rc=$?
assert_eq "gh failure → exit 0 (non-fatal)" "0" "$rc"
assert_trace_outcome "gh failure → error-gh-failure in trace" "error-gh-failure"
assert_contains "gh failure → warning in output" "warning:" "$out"

echo
echo "── Layer 5: trace on every code path ──"

total_rows=$(wc -l < "$REAL_TRACE" | tr -d ' ')
if [[ "$total_rows" -ge 12 ]]; then
  PASS=$((PASS + 1)); echo "  ✓ trace log accumulated ($total_rows rows)"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("trace log accumulated")
  echo "  ✗ trace log has only $total_rows rows (expected >= 12)" >&2
fi

# 5b — crash path: force gh to exit 2 unexpectedly; trap must still write a row
> "$REAL_TRACE"
cat > "$WORKDIR/gh" <<'CRASHEOF'
#!/usr/bin/env bash
exit 2
CRASHEOF
chmod +x "$WORKDIR/gh"
make_fake_clip "$NO_PR_ISSUE"

PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="$WORKDIR/fake-clip.sh" \
  bash "$VERDICT_SCRIPT" "techlead" "APPROVE" "BLD-99" 2>/dev/null || true

crash_rows=$(wc -l < "$REAL_TRACE" | tr -d ' ')
if [[ "$crash_rows" -ge 1 ]]; then
  PASS=$((PASS + 1)); echo "  ✓ crash path: trap wrote trace row ($crash_rows row(s))"
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("crash path trap")
  echo "  ✗ crash path: no trace row written" >&2
fi

echo
echo "── Layer 6: Paperclip linkage path ──"

make_fake_clip "$PR_LINKED_ISSUE"; make_fake_gh "OPEN" "[]" "0" "[]"
out=$(run_verdict "techlead" "APPROVE" "BLD-40")
assert_trace_outcome "Paperclip linkage resolves PR → posted-first" "posted-first"

make_fake_clip "{}" "1"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
out=$(run_verdict "techlead" "APPROVE" "BLD-41")
assert_trace_outcome "clip failure → gh fallback → posted-first" "posted-first"

echo
echo "── Layer 7: sentinel body format ──"

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
rm -f /tmp/test-last-posted-body.txt
PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="$WORKDIR/fake-clip.sh" \
  bash "$VERDICT_SCRIPT" "techlead" "APPROVE" "BLD-55" > /dev/null 2>&1 || true

if [[ -f /tmp/test-last-posted-body.txt ]]; then
  first_line=$(head -1 /tmp/test-last-posted-body.txt)
  assert_eq "sentinel first line exact format" "MERGE-GATE: techlead APPROVE" "$first_line"
  rm -f /tmp/test-last-posted-body.txt
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("sentinel body captured")
  echo "  ✗ sentinel body not captured by fake gh" >&2
fi

make_fake_clip "$NO_PR_ISSUE"; make_fake_gh "OPEN" "[]" "0" '[{"number":999}]'
rm -f /tmp/test-last-posted-body.txt
PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="$WORKDIR/fake-clip.sh" \
  bash "$VERDICT_SCRIPT" "quality-director" "PASS" "BLD-56" > /dev/null 2>&1 || true

if [[ -f /tmp/test-last-posted-body.txt ]]; then
  first_line=$(head -1 /tmp/test-last-posted-body.txt)
  assert_eq "QD PASS → sentinel says APPROVE (normalised)" \
    "MERGE-GATE: quality-director APPROVE" "$first_line"
  rm -f /tmp/test-last-posted-body.txt
else
  FAIL=$((FAIL + 1)); FAILED_NAMES+=("QD PASS sentinel body")
  echo "  ✗ QD PASS sentinel body not captured" >&2
fi

echo
echo "── Layer 8: regression — multiline comment + PATH clip resolution ──"

# Regression: multiline comment whose second line is MERGE-GATE:
# must NOT be treated as an authoritative sentinel (first line only counts)
make_fake_clip "$NO_PR_ISSUE"
make_fake_gh "OPEN" "$MULTILINE_SPOOFED_TL_APPROVE" "0" '[{"number":999}]'
run_verdict "techlead" "APPROVE" "BLD-60" > /dev/null 2>&1
assert_trace_outcome "multiline comment: MERGE-GATE on line 2 ignored → posted-first" "posted-first"

# Regression: clip.sh resolved from PATH (not SCRIPT_DIR) in normal use
# Create a clip.sh shim in WORKDIR so it's on PATH; verify linkage works
make_fake_clip "$PR_LINKED_ISSUE"
make_fake_gh "OPEN" "[]" "0" "[]"
# Override CLIP_CMD to empty to exercise PATH-based lookup; add fake-clip.sh as 'clip.sh' on PATH
cp "$WORKDIR/fake-clip.sh" "$WORKDIR/clip.sh"
chmod +x "$WORKDIR/clip.sh"
out=$(PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="" MERGE_GATE_REPO="alankyshum/cablesnap" \
  bash "$VERDICT_SCRIPT" "techlead" "APPROVE" "BLD-61" 2>/dev/null || true)
assert_trace_outcome "clip.sh from PATH resolves PR → posted-first" "posted-first"
rm -f "$WORKDIR/clip.sh"

# Regression: /skills/scripts/clip.sh exists but is NOT executable (chmod 644).
# The helper must still invoke it via `bash` (uses MERGE_GATE_SKILLS_DIR override).
make_fake_clip "$PR_LINKED_ISSUE"
make_fake_gh "OPEN" "[]" "0" "[]"
FAKE_SKILLS_DIR="$WORKDIR/fake-skills"
mkdir -p "$FAKE_SKILLS_DIR/scripts"
cp "$WORKDIR/fake-clip.sh" "$FAKE_SKILLS_DIR/scripts/clip.sh"
# Copy support files that fake-clip.sh reads relative to its own dir
cp "$WORKDIR/fake-issue.json" "$FAKE_SKILLS_DIR/scripts/fake-issue.json"
cp "$WORKDIR/fake-clip-exit.txt" "$FAKE_SKILLS_DIR/scripts/fake-clip-exit.txt"
chmod 644 "$FAKE_SKILLS_DIR/scripts/clip.sh"  # NOT executable — must be run via bash
out=$(PATH="$WORKDIR:$PATH" MERGE_GATE_CLIP_CMD="" MERGE_GATE_SKILLS_DIR="$FAKE_SKILLS_DIR" \
  MERGE_GATE_REPO="alankyshum/cablesnap" \
  bash "$VERDICT_SCRIPT" "techlead" "APPROVE" "BLD-62" 2>/dev/null || true)
assert_trace_outcome "non-exec skills/clip.sh invoked via bash → posted-first" "posted-first"
rm -rf "$FAKE_SKILLS_DIR"

# ─── Summary ─────────────────────────────────────────────────────────
echo
echo "── Summary ──"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  echo "Failed tests:" >&2
  for n in "${FAILED_NAMES[@]}"; do echo "  - $n" >&2; done
  exit 1
fi
echo "All tests passed."
exit 0
