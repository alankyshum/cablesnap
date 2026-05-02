#!/usr/bin/env bash
# merge-gate.sh — Pre-merge gate for CableSnap PRs
#
# Codifies the merge-readiness checks that were previously done manually
# by coordinating across techlead, QD, and REVIEWER agents.
#
# ─── Approval model ──────────────────────────────────────────────────
# All Builder agents share the `alankyshum` GitHub identity, and GitHub
# blocks self-approval, so formal APPROVED reviews are often impossible
# to obtain even when the PR is fully reviewed internally.
#
# Branch protection on `main` therefore does NOT require formal reviews
# (only required status checks). To stay aligned with what GitHub itself
# enforces, this gate uses a two-mode approval check:
#
#   STRICT  — branch protection requires N >= 1 formal approving reviews.
#             This script requires the same: at least one APPROVED review.
#
#   LENIENT — branch protection requires 0 formal approving reviews.
#             This script accepts EITHER:
#               (a) at least one formal APPROVED review, OR
#               (b) the latest merge-gate verdict from BOTH:
#                     - techlead         → APPROVE
#                     - quality-director → APPROVE
#
# Verdicts are detected from PR comments (issue thread) using two layers:
#
#   1. Explicit sentinel (preferred, unambiguous):
#         MERGE-GATE: techlead APPROVE
#         MERGE-GATE: techlead BLOCK
#         MERGE-GATE: quality-director APPROVE
#         MERGE-GATE: quality-director BLOCK
#      One sentinel per comment. Latest sentinel per role wins.
#
#   2. Legacy prose heuristic (compat for older PRs):
#         techlead         — comment header `## techlead` / `## Tech Lead`
#                            with verdict word APPROVE / APPROVED / LGTM /
#                            "Ship it" on a non-blank line; or BLOCK / NEEDS
#                            CHANGES / REQUEST CHANGES.
#         quality-director — comment header `## quality-director` /
#                            `## Quality Director` / `## QA` / `## QD`
#                            with verdict word PASS / PASSED / APPROVE /
#                            APPROVED; or BLOCK / FAIL.
#
# Sentinel takes precedence over prose. Latest verdict per role wins.
# A BLOCK verdict newer than any APPROVE counts as missing approval.
#
# ─── Usage ───────────────────────────────────────────────────────────
#   merge-gate.sh <PR_NUMBER> [REPO]
#
# Arguments:
#   PR_NUMBER   GitHub PR number (required)
#   REPO        GitHub repo in owner/repo format (default: alankyshum/cablesnap)
#
# Environment:
#   MERGE_GATE_DEBUG=1   Print verdict resolution detail to stderr
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

debug() {
  if [[ "${MERGE_GATE_DEBUG:-0}" == "1" ]]; then
    echo "DEBUG: $*" >&2
  fi
}

FAILURES=()

# ─── Fetch PR data ────────────────────────────────────────────────────
echo "Checking PR #${PR_NUMBER} on ${REPO}..."

PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json state,mergeable,mergeStateStatus,reviews,statusCheckRollup,isDraft,comments 2>&1) || {
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

# ─── 7. Approval requirement (mode-aware) ────────────────────────────
# Determine branch protection mode for `main`. Failures (e.g. lacking
# admin scope on the token) default to STRICT to avoid weakening the gate.
PROTECTION_REQ=$(gh api "repos/$REPO/branches/main/protection" \
  --jq '.required_pull_request_reviews.required_approving_review_count // 0' 2>/dev/null || echo "STRICT_FALLBACK")

if [[ "$PROTECTION_REQ" == "STRICT_FALLBACK" ]]; then
  MODE="STRICT"
  debug "branch protection lookup failed — defaulting to STRICT"
elif [[ "$PROTECTION_REQ" -gt 0 ]] 2>/dev/null; then
  MODE="STRICT"
  debug "branch protection requires $PROTECTION_REQ formal reviews — STRICT mode"
else
  MODE="LENIENT"
  debug "branch protection requires 0 formal reviews — LENIENT mode (comment-fallback enabled)"
fi

APPROVALS=$(echo "$PR_JSON" | jq -r '
  [.reviews[]? | select(.state == "APPROVED")]
  | length')

TL_LATEST=""        # latest techlead verdict: APPROVE | BLOCK | ""
TL_LATEST_AT=""
QD_LATEST=""
QD_LATEST_AT=""

# classify_comment <body> → echoes one of:
#   "techlead APPROVE" | "techlead BLOCK"
#   "qd APPROVE"       | "qd BLOCK"
#   ""                 (no role/verdict identified)
classify_comment() {
  local body="$1"

  # ── Sentinel layer (preferred) ──
  # Pattern: MERGE-GATE: <role> <verdict>
  local sentinel
  sentinel=$(printf '%s\n' "$body" | grep -iE '^[[:space:]]*MERGE-GATE:[[:space:]]+(techlead|quality-director|qd)[[:space:]]+(APPROVE|BLOCK)' | tail -n1 || true)
  if [[ -n "$sentinel" ]]; then
    local role verdict
    # Normalize whitespace and case
    role=$(echo "$sentinel" | sed -E 's/.*MERGE-GATE:[[:space:]]+([A-Za-z-]+)[[:space:]]+.*/\1/I' | tr '[:upper:]' '[:lower:]')
    verdict=$(echo "$sentinel" | sed -E 's/.*MERGE-GATE:[[:space:]]+[A-Za-z-]+[[:space:]]+([A-Za-z]+).*/\1/I' | tr '[:lower:]' '[:upper:]')
    case "$role" in
      techlead)              echo "techlead $verdict" ;;
      quality-director|qd)   echo "qd $verdict" ;;
    esac
    return
  fi

  # ── Legacy prose layer ──
  # Detect a role header anywhere in the comment, then a verdict keyword.
  local has_tl_header=0 has_qd_header=0
  if printf '%s\n' "$body" | grep -qiE '(^|\n)#{1,3}[[:space:]]*(tech[[:space:]]*lead|techlead)\b'; then
    has_tl_header=1
  fi
  if printf '%s\n' "$body" | grep -qiE '(^|\n)#{1,3}[[:space:]]*(quality[[:space:]]*director|quality[[:space:]]*assurance|qa|qd)\b'; then
    has_qd_header=1
  fi

  # Verdict scan — search for explicit approve / block words. Prefer block (newer
  # block in same comment overrides approve).
  local has_block=0 has_approve=0
  if printf '%s\n' "$body" | grep -qiE '\b(BLOCK|NEEDS[[:space:]]+CHANGES|REQUEST[[:space:]]+CHANGES|FAIL(ED)?|REJECT(ED)?)\b'; then
    has_block=1
  fi
  if printf '%s\n' "$body" | grep -qiE '\b(APPROVE[D]?|LGTM|PASS(ED)?|SHIP[[:space:]]+IT)\b'; then
    has_approve=1
  fi

  local verdict=""
  if [[ "$has_block" == "1" ]]; then
    verdict="BLOCK"
  elif [[ "$has_approve" == "1" ]]; then
    verdict="APPROVE"
  fi

  if [[ -z "$verdict" ]]; then
    return
  fi

  if [[ "$has_tl_header" == "1" ]]; then
    echo "techlead $verdict"
  elif [[ "$has_qd_header" == "1" ]]; then
    echo "qd $verdict"
  fi
}

# Stream comments using jq per-comment to handle embedded newlines in bodies.
NUM_COMMENTS=$(echo "$PR_JSON" | jq -r '.comments | length')

for ((i = 0; i < NUM_COMMENTS; i++)); do
  CTIME=$(echo "$PR_JSON" | jq -r --argjson idx "$i" '.comments | sort_by(.createdAt) | .[$idx].createdAt')
  CBODY=$(echo "$PR_JSON" | jq -r --argjson idx "$i" '.comments | sort_by(.createdAt) | .[$idx].body')

  result=$(classify_comment "$CBODY" || true)
  [[ -z "$result" ]] && continue

  role=$(echo "$result" | awk '{print $1}')
  verdict=$(echo "$result" | awk '{print $2}')

  case "$role" in
    techlead)
      TL_LATEST="$verdict"
      TL_LATEST_AT="$CTIME"
      debug "techlead verdict at $CTIME → $verdict"
      ;;
    qd)
      QD_LATEST="$verdict"
      QD_LATEST_AT="$CTIME"
      debug "qd verdict at $CTIME → $verdict"
      ;;
  esac
done

INTERNAL_APPROVED="false"
if [[ "$TL_LATEST" == "APPROVE" && "$QD_LATEST" == "APPROVE" ]]; then
  INTERNAL_APPROVED="true"
fi

case "$MODE" in
  STRICT)
    if [[ "$APPROVALS" -eq 0 ]]; then
      FAILURES+=("No approving reviews found — branch protection requires at least one formal APPROVED review")
    fi
    ;;
  LENIENT)
    if [[ "$APPROVALS" -eq 0 && "$INTERNAL_APPROVED" != "true" ]]; then
      missing=()
      [[ "$TL_LATEST" != "APPROVE" ]] && missing+=("techlead (latest=${TL_LATEST:-none})")
      [[ "$QD_LATEST" != "APPROVE" ]] && missing+=("quality-director (latest=${QD_LATEST:-none})")
      FAILURES+=("No formal APPROVED review and missing internal approvals: ${missing[*]}.
  Internal approval requires BOTH techlead and quality-director to post
  'MERGE-GATE: <role> APPROVE' (preferred) or a clearly-headed approval comment
  with a non-blocking latest verdict.")
    fi
    ;;
esac

# ─── Report ──────────────────────────────────────────────────────────
echo ""

if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo "✓ Merge gate PASSED for PR #${PR_NUMBER}"
  echo "  - State: $STATE"
  echo "  - Mergeable: $MERGEABLE"
  echo "  - Merge state: $MERGE_STATE"
  echo "  - Approval mode: $MODE"
  echo "  - Formal approvals: $APPROVALS"
  if [[ "$MODE" == "LENIENT" ]]; then
    echo "  - techlead verdict: ${TL_LATEST:-none}${TL_LATEST_AT:+ ($TL_LATEST_AT)}"
    echo "  - quality-director verdict: ${QD_LATEST:-none}${QD_LATEST_AT:+ ($QD_LATEST_AT)}"
  fi
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
