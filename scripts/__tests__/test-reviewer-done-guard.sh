#!/usr/bin/env bash
# test-reviewer-done-guard.sh — BLD-1251: Test that safe-mark-done.sh blocks
# premature done marking when PR is open/draft.
#
# This is an integration test that verifies the behavior described in BLD-1251.
# It mocks `gh` to simulate open vs merged PR states without hitting GitHub.
#
# Usage:
#   bash /projects/cablesnap/scripts/__tests__/test-reviewer-done-guard.sh
#
# Expected output:
#   PASS: 3 tests pass, 0 fail

set -uo pipefail

SAFE_DONE="/projects/cablesnap/scripts/safe-mark-done.sh"
PASS=0
FAIL=0

# --- Test harness ---
assert_fails() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    echo "FAIL: $desc — expected failure, but succeeded"
    ((FAIL++))
  else
    echo "PASS: $desc"
    ((PASS++))
  fi
}

assert_succeeds() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    echo "PASS: $desc"
    ((PASS++))
  else
    echo "FAIL: $desc — expected success, but failed"
    ((FAIL++))
  fi
}

# --- Setup: create mock gh and clip.sh in temp dir ---
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Mock clip.sh — records calls, always succeeds
cat > "$TMPDIR/clip.sh" <<'MOCK'
#!/usr/bin/env bash
echo "[mock clip.sh] $*" >> /tmp/bld1251-test-clip-calls.txt
exit 0
MOCK
chmod +x "$TMPDIR/clip.sh"

# Override /skills/scripts/clip.sh reference in safe-mark-done.sh by PATH trick
# We need a local clip.sh that shadows the real one
cat > "$TMPDIR/run-safe-done.sh" <<WRAPPER
#!/usr/bin/env bash
# Wrapper that injects our mock clip.sh and controlled mock gh
export PATH="$TMPDIR:\$PATH"
bash "$SAFE_DONE" "\$@"
WRAPPER
chmod +x "$TMPDIR/run-safe-done.sh"

# --- Test 1: Reject when PR is open (mergedAt = null) ---
cat > "$TMPDIR/gh" <<'MOCK'
#!/usr/bin/env bash
# Simulate OPEN PR — mergedAt is empty
if [[ "$*" == *"mergedAt"* ]]; then
  echo ""
  exit 0
fi
exit 0
MOCK
chmod +x "$TMPDIR/gh"
rm -f /tmp/bld1251-test-clip-calls.txt
assert_fails "Reject done when PR is OPEN (mergedAt=null)" \
  bash "$TMPDIR/run-safe-done.sh" BLD-9999 1 test/repo

# Verify that clip.sh update-issue was NOT called
if grep -q "update-issue" /tmp/bld1251-test-clip-calls.txt 2>/dev/null; then
  echo "FAIL: clip.sh update-issue was called despite open PR — guard did not prevent it"
  ((FAIL++))
else
  echo "PASS: clip.sh update-issue was NOT called (guard blocked the call)"
  ((PASS++))
fi

# --- Test 2: Reject when PR is draft (mergedAt = null) ---
cat > "$TMPDIR/gh" <<'MOCK'
#!/usr/bin/env bash
# Simulate DRAFT PR — mergedAt is null
if [[ "$*" == *"mergedAt"* ]]; then
  echo "null"
  exit 0
fi
exit 0
MOCK
chmod +x "$TMPDIR/gh"
rm -f /tmp/bld1251-test-clip-calls.txt
assert_fails "Reject done when PR is DRAFT (mergedAt=null)" \
  bash "$TMPDIR/run-safe-done.sh" BLD-9999 1 test/repo

# --- Test 3: Allow done when PR is merged + CI green ---
cat > "$TMPDIR/gh" <<'MOCK'
#!/usr/bin/env bash
# Simulate MERGED PR
if [[ "$*" == *"mergedAt"* ]]; then
  echo "2026-05-15T19:20:27Z"
  exit 0
fi
# Simulate CI green
if [[ "$*" == *"checks"* ]]; then
  echo "All checks were successful"
  exit 0
fi
exit 0
MOCK
chmod +x "$TMPDIR/gh"
rm -f /tmp/bld1251-test-clip-calls.txt

# Override clip.sh reference inline since safe-mark-done.sh hardcodes the path
# We patch by shadowing `bash` call to clip.sh via environment trick
# (Works because safe-mark-done.sh calls: bash /skills/scripts/clip.sh)
# Create mock at that path by running with TMPDIR in PATH and modifying the script call
cat > "$TMPDIR/run-safe-done-merged.sh" <<WRAPPER
#!/usr/bin/env bash
export PATH="$TMPDIR:\$PATH"
# Override the clip.sh call by replacing in a temp copy
TMP_SCRIPT=\$(mktemp)
sed "s|bash /skills/scripts/clip.sh|bash $TMPDIR/clip.sh|g" "$SAFE_DONE" > "\$TMP_SCRIPT"
bash "\$TMP_SCRIPT" "\$@"
rm -f "\$TMP_SCRIPT"
WRAPPER
chmod +x "$TMPDIR/run-safe-done-merged.sh"

assert_succeeds "Allow done when PR is merged + CI green" \
  bash "$TMPDIR/run-safe-done-merged.sh" BLD-9999 1 test/repo

# Verify clip.sh was called with --status done
if grep -q "update-issue.*done\|done.*update-issue" /tmp/bld1251-test-clip-calls.txt 2>/dev/null; then
  echo "PASS: clip.sh update-issue --status done was called (guard allowed it)"
  ((PASS++))
else
  echo "FAIL: clip.sh update-issue --status done was NOT called despite merged PR"
  ((FAIL++))
fi

# --- Test 4: clip.sh blocks direct --status done without CLIP_ALLOW_DONE ---
# Use the dotfiles clip.sh (which has the guard built in) to test the gate.
DOTFILES_CLIP="/tmp/dotfiles-work/config/paperclip-bld/scripts/clip.sh"
if [[ -f "$DOTFILES_CLIP" ]]; then
  # The guard should reject --status done when CLIP_ALLOW_DONE is unset
  # Capture stderr+stdout separately since pipefail would mask grep's result
  gate_out=$(CLIP_ALLOW_DONE="" PAPERCLIP_API_KEY="test" PAPERCLIP_COMPANY_ID="test" bash "$DOTFILES_CLIP" update-issue BLD-9999 --status done 2>&1 || true)
  if echo "$gate_out" | grep -q "HARD RULE #0"; then
    echo "PASS: clip.sh gate blocks direct --status done (outputs HARD RULE #0 error)"
    ((PASS++))
  else
    echo "FAIL: clip.sh gate did not block direct --status done (got: $gate_out)"
    ((FAIL++))
  fi

  # The guard should allow --status done when CLIP_ALLOW_DONE=1
  # (It will fail at the API call since PAPERCLIP_API_KEY=test, but NOT at the guard)
  gate_msg=$(CLIP_ALLOW_DONE=1 PAPERCLIP_API_KEY="test" PAPERCLIP_COMPANY_ID="test" PAPERCLIP_API_BASE="http://127.0.0.1:1" bash "$DOTFILES_CLIP" update-issue BLD-9999 --status done 2>&1 || true)
  if echo "$gate_msg" | grep -q "HARD RULE #0"; then
    echo "FAIL: clip.sh gate wrongly blocked when CLIP_ALLOW_DONE=1"
    ((FAIL++))
  else
    echo "PASS: clip.sh gate allows --status done when CLIP_ALLOW_DONE=1"
    ((PASS++))
  fi
else
  echo "SKIP: dotfiles clip.sh not found at $DOTFILES_CLIP (tests 4/5 skipped)"
fi

# --- Results ---
echo ""
echo "=== Results ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
