#!/usr/bin/env bash
# merge-gate.sh — Pre-merge gate for CableSnap PRs
#
# Codifies the merge-readiness checks that were previously done manually
# by coordinating across techlead, QD, and REVIEWER agents.
#
# Usage:
#   merge-gate.sh <PR_NUMBER> [REPO]
#
# Arguments:
#   PR_NUMBER   GitHub PR number (required)
#   REPO        GitHub repo in owner/repo format (default: alankyshum/cablesnap)
#
# Exit codes:
#   0  — PR is safe to merge
#   1  — Gate failed (details printed to stderr)
#
# Example:
#   merge-gate.sh 431 alankyshum/cablesnap

set -euo pipefail

PR_NUMBER="${1:-}"
REPO="${2:-alankyshum/cablesnap}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: merge-gate.sh <PR_NUMBER> [REPO]" >&2
  exit 1
fi

FAILURES=()

# ─── Fetch PR data ────────────────────────────────────────────────────
echo "Checking PR #${PR_NUMBER} on ${REPO}..."

PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json state,mergeable,mergeStateStatus,reviews,statusCheckRollup,isDraft 2>&1) || {
  echo "ERROR: Failed to fetch PR #${PR_NUMBER} from ${REPO}" >&2
  echo "$PR_JSON" >&2
  exit 1
}

# ─── 1. PR must be open ──────────────────────────────────────────────
STATE=$(echo "$PR_JSON" | jq -r '.state')
if [[ "$STATE" != "OPEN" ]]; then
  FAILURES+=("PR is not open (state: $STATE)")
fi

# ─── 2. PR must not be a draft ───────────────────────────────────────
IS_DRAFT=$(echo "$PR_JSON" | jq -r '.isDraft')
if [[ "$IS_DRAFT" == "true" ]]; then
  FAILURES+=("PR is still a draft — must be marked ready for review")
fi

# ─── 3. PR must be mergeable ─────────────────────────────────────────
MERGEABLE=$(echo "$PR_JSON" | jq -r '.mergeable')
if [[ "$MERGEABLE" != "MERGEABLE" ]]; then
  FAILURES+=("PR is not mergeable (mergeable: $MERGEABLE)")
fi

# ─── 4. Merge state status must be clean or has_hooks ─────────────────
MERGE_STATE=$(echo "$PR_JSON" | jq -r '.mergeStateStatus')
case "$MERGE_STATE" in
  CLEAN|HAS_HOOKS) ;; # acceptable
  BLOCKED)  FAILURES+=("Merge state is BLOCKED — required checks or reviews missing") ;;
  BEHIND)   FAILURES+=("Branch is behind base — rebase or merge base branch first") ;;
  DIRTY)    FAILURES+=("Merge conflicts detected — resolve before merging") ;;
  UNSTABLE) FAILURES+=("Some status checks failed (mergeStateStatus: UNSTABLE)") ;;
  *)        FAILURES+=("Unexpected mergeStateStatus: $MERGE_STATE") ;;
esac

# ─── 5. All status checks must succeed ───────────────────────────────
FAILED_CHECKS=$(echo "$PR_JSON" | jq -r '
  [.statusCheckRollup[]? | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")]
  | length')

if [[ "$FAILED_CHECKS" -gt 0 ]]; then
  CHECK_DETAILS=$(echo "$PR_JSON" | jq -r '
    [.statusCheckRollup[]? | select(.conclusion != null and .conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")]
    | .[] | "  - \(.name // .context): \(.conclusion)"')
  FAILURES+=("$FAILED_CHECKS status check(s) did not succeed:
$CHECK_DETAILS")
fi

# Check for pending checks (no conclusion yet)
PENDING_CHECKS=$(echo "$PR_JSON" | jq -r '
  [.statusCheckRollup[]? | select(.conclusion == null or .conclusion == "")]
  | length')

if [[ "$PENDING_CHECKS" -gt 0 ]]; then
  PENDING_NAMES=$(echo "$PR_JSON" | jq -r '
    [.statusCheckRollup[]? | select(.conclusion == null or .conclusion == "")]
    | .[] | "  - \(.name // .context): pending"')
  FAILURES+=("$PENDING_CHECKS status check(s) still pending:
$PENDING_NAMES")
fi

# ─── 6. No outstanding REQUEST_CHANGES reviews ──────────────────────
CHANGES_REQUESTED=$(echo "$PR_JSON" | jq -r '
  [.reviews[]? | select(.state == "CHANGES_REQUESTED")]
  | length')

if [[ "$CHANGES_REQUESTED" -gt 0 ]]; then
  REVIEWERS=$(echo "$PR_JSON" | jq -r '
    [.reviews[]? | select(.state == "CHANGES_REQUESTED")]
    | .[] | "  - \(.author.login)"')
  FAILURES+=("Outstanding CHANGES_REQUESTED reviews:
$REVIEWERS")
fi

# ─── 7. At least one approving review ───────────────────────────────
APPROVALS=$(echo "$PR_JSON" | jq -r '
  [.reviews[]? | select(.state == "APPROVED")]
  | length')

if [[ "$APPROVALS" -eq 0 ]]; then
  FAILURES+=("No approving reviews found — at least one APPROVED review required")
fi

# ─── Report ──────────────────────────────────────────────────────────
echo ""

if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo "✓ Merge gate PASSED for PR #${PR_NUMBER}"
  echo "  - State: $STATE"
  echo "  - Mergeable: $MERGEABLE"
  echo "  - Merge state: $MERGE_STATE"
  echo "  - Approvals: $APPROVALS"
  echo "  - Failed checks: 0"
  echo ""
  echo "Safe to merge."
  exit 0
else
  echo "✗ Merge gate FAILED for PR #${PR_NUMBER}" >&2
  echo "" >&2
  for failure in "${FAILURES[@]}"; do
    echo "FAIL: $failure" >&2
  done
  echo "" >&2
  echo "Resolve the above issues before merging." >&2
  exit 1
fi
