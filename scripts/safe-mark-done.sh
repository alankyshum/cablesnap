#!/usr/bin/env bash
# safe-mark-done.sh — Defense-in-depth guard for marking issues done (BLD-1251)
#
# Usage: safe-mark-done.sh <ISSUE_IDENTIFIER> <PR_NUMBER> <REPO>
#
# Verifies that the linked PR is merged (mergedAt != null) AND CI checks pass
# before calling `clip.sh update-issue --status done`. Rejects if PR is still
# OPEN or DRAFT, protecting against premature done marking (HARD RULE #0).
#
# Example:
#   /projects/cablesnap/scripts/safe-mark-done.sh BLD-1235 607 alankyshum/cablesnap
#
# Exit codes:
#   0 — PR verified merged, issue marked done
#   1 — PR not merged or CI failing — done marking REJECTED
#   2 — Usage error

set -euo pipefail

ISSUE_ID="${1:-}"
PR_NUMBER="${2:-}"
REPO="${3:-alankyshum/cablesnap}"

if [[ -z "$ISSUE_ID" || -z "$PR_NUMBER" ]]; then
  echo "Usage: safe-mark-done.sh <ISSUE_IDENTIFIER> <PR_NUMBER> [REPO]" >&2
  echo "Example: safe-mark-done.sh BLD-1235 607 alankyshum/cablesnap" >&2
  exit 2
fi

echo "🔍 [safe-mark-done] Verifying PR #${PR_NUMBER} on ${REPO} before marking ${ISSUE_ID} done..."

# Step 1 — Confirm PR merged
MERGED=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json mergedAt -q .mergedAt 2>/dev/null || true)
if [[ -z "$MERGED" || "$MERGED" == "null" ]]; then
  echo "❌ [safe-mark-done] REJECTED: PR #${PR_NUMBER} is NOT merged (mergedAt=null)." >&2
  echo "   Cannot mark ${ISSUE_ID} as done. Status stays in_review." >&2
  exit 1
fi

# Step 2 — Confirm CI green on merged commit
# Use exit code: gh pr checks --required exits 0 when all pass, 1 otherwise.
# Do not rely on stdout text — gh pr checks omits summary lines when piped (non-TTY).
echo "✅ [safe-mark-done] PR #${PR_NUMBER} merged at ${MERGED}. Checking CI..."
if ! gh pr checks "$PR_NUMBER" --repo "$REPO" --required >/dev/null 2>&1; then
  echo "❌ [safe-mark-done] REJECTED: Required CI checks not all passing on PR #${PR_NUMBER}." >&2
  echo "   Run: gh pr checks ${PR_NUMBER} --repo ${REPO} --required" >&2
  exit 1
fi

# Step 3 — Both pass; safe to mark done
# Set CLIP_ALLOW_DONE=1 to bypass the HARD RULE #0 gate in clip.sh.
# This is the ONLY authorized path for marking issues done.
echo "✅ [safe-mark-done] PR merged + CI green. Marking ${ISSUE_ID} done..."
CLIP_ALLOW_DONE=1 bash /skills/scripts/clip.sh update-issue "$ISSUE_ID" --status done
echo "✅ [safe-mark-done] ${ISSUE_ID} marked done."
