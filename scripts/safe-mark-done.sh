#!/usr/bin/env bash
# safe-mark-done.sh — Defense-in-depth guard for marking issues done (BLD-1251)
#
# Usage: safe-mark-done.sh <ISSUE_IDENTIFIER> <PR_NUMBER> <REPO>
#
# Verifies that the linked PR is merged (mergedAt != null), CI checks pass,
# AND the PR is actually linked to the given issue (branch/title contains issue ID).
# Rejects if PR is OPEN, DRAFT, CI failing, or not referencing the issue.
#
# Example:
#   /projects/cablesnap/scripts/safe-mark-done.sh BLD-1235 607 alankyshum/cablesnap
#
# Exit codes:
#   0 — PR verified merged + linked, issue marked done
#   1 — PR not merged, CI failing, or issue-PR mismatch — done marking REJECTED
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

# Step 0 — Confirm PR is linked to the issue being marked done.
# The PR branch name or title must contain the issue identifier (e.g., "BLD-1251" or "1251").
# This prevents marking an unrelated issue done by passing an arbitrary merged PR.
ISSUE_NUM="${ISSUE_ID##*-}"  # "BLD-1251" → "1251"
PR_META=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefName,title --jq '[.headRefName, .title] | join(" ")' 2>/dev/null || true)
if ! echo "$PR_META" | grep -qiE "${ISSUE_ID}|${ISSUE_NUM}"; then
  echo "❌ [safe-mark-done] REJECTED: PR #${PR_NUMBER} does not reference ${ISSUE_ID}." >&2
  echo "   PR branch/title: ${PR_META}" >&2
  echo "   Verify the correct PR number was supplied for ${ISSUE_ID}." >&2
  exit 1
fi
echo "✅ [safe-mark-done] PR #${PR_NUMBER} is linked to ${ISSUE_ID} (found in: ${PR_META})."

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

# Step 3 — All checks pass; safe to mark done.
# Set CLIP_ALLOW_DONE=1 to bypass the HARD RULE #0 gate in clip.sh.
# This is the ONLY authorized path for marking issues done.
echo "✅ [safe-mark-done] PR merged + CI green + issue linked. Marking ${ISSUE_ID} done..."
CLIP_ALLOW_DONE=1 bash /skills/scripts/clip.sh update-issue "$ISSUE_ID" --status done
echo "✅ [safe-mark-done] ${ISSUE_ID} marked done."
