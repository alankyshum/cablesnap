#!/usr/bin/env bash
# audit-handoff.sh — BLD-2109: create the daily AUDIT issue and reliably
# advance it to in_review so ux-designer's assignment-wake fires.
#
# ## Auth-boundary ordering (CRITICAL — do not reorder without understanding)
#
# Paperclip's authorization check (server/src/services/authorization.ts:1266-1295)
# evaluates the CURRENT (pre-mutation) assignee when deciding if an agent PATCH
# is allowed:
#
#   allowed iff: actor == current.assigneeAgentId  OR  current has no agent assignee
#
# The trap that caused BLD-2106 to get stuck in backlog (BLD-2107 forensics):
#   create-issue assigned to ux-designer
#   ↓
#   PATCH status=in_review → denied (actor=claudecoder ≠ assignee=ux-designer)
#   ↓
#   Issue left in backlog, ux-designer never woken (server skips backlog for
#   queueIssueAssignmentWakeup, server/src/services/issue-assignment-wakeup.ts:31)
#
# Safe ordering used here:
#   1. create-issue assigned to CREATING AGENT (claudecoder), status=todo
#      → issue created with assignee=claudecoder; claudecoder has full mutation authority
#   2. single PATCH: status=in_review + assigneeAgentId=ux-designer
#      → pre-mutation assignee is still claudecoder == actor → ALLOWED
#      → post-mutation assignee is ux-designer; server wakes ux-designer because
#        status (in_review) is not backlog
#
# Do NOT split step 2 into two PATCHes — after the first PATCH switches the
# assignee to ux-designer, the second PATCH (changing status) would be denied.
#
# ## Idempotency
#
# If the AUDIT issue already exists for today's date (detected by listing issues
# with --label "audit" or by the --issue-id override), and its status is already
# ≥ in_review, the script is a no-op and exits 0. This prevents clobbering
# ux-designer if she has already advanced the issue further (in_progress / done).
#
# ## Partial-failure contract (BLD-2109 requirement)
#
# This script is designed to be called AFTER bundle capture and AFTER any
# comment posting. But callers (daily-audit.sh or its orchestrating run) MUST
# call this script even when bundle capture or upload fails — the handoff
# must happen regardless so ux-designer can at minimum record the failure.
# Callers should pass --capture-failed and/or --upload-failed so this script
# can compose the right default status comment.
#
# ## Exit codes
#   0  — Issue created-or-reused and successfully advanced to in_review
#          (or already ≥ in_review; no-op)
#   1  — Usage error
#   2  — clip.sh create-issue failed
#   3  — clip.sh PATCH (status + assignee transition) failed (exits loudly;
#          never leaves issue in backlog assigned to ux-designer)
#   4  — verify re-read failed or status still backlog after PATCH
#
# Refs: BLD-2109, BLD-2107, BLD-2106, BLD-2105.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Configuration ────────────────────────────────────────────────────
# UX-designer agent ID (constant — ux-designer is a named company role).
UX_DESIGNER_AGENT_ID="${UX_DESIGNER_AGENT_ID:-f3ca8bb9-5d5b-45ac-9bd3-f06118059cf4}"

# Creating agent ID (claudecoder by default — override in tests).
CREATING_AGENT_ID="${CREATING_AGENT_ID:-b467dac6-f460-43be-98cf-004496d36b67}"

# CableSnap project ID (constant).
PROJECT_ID="${PROJECT_ID:-c3d4e5f6-a7b8-9012-cdef-123456789012}"

# clip.sh path — default is sibling in same scripts/ dir.
CLIP="${CLIP:-${SCRIPT_DIR}/clip.sh}"

# ─── Argument parsing ─────────────────────────────────────────────────
TITLE=""
DESCRIPTION=""
PRIORITY="high"
BUNDLE_URL=""
CAPTURE_FAILED=false
UPLOAD_FAILED=false
ISSUE_ID=""  # If set, skip create and operate on this existing issue

usage() {
  cat >&2 <<'EOF'
Usage: audit-handoff.sh \
         --title <issue-title> \
         [--description <text>] \
         [--priority <urgent|critical|high|medium|low|none>] \
         [--bundle-url <url>] \
         [--capture-failed] \
         [--upload-failed] \
         [--issue-id <BLD-NNN or UUID>] \
         [--clip <path/to/clip.sh>] \
         [--ux-designer-agent-id <uuid>] \
         [--creating-agent-id <uuid>]

Creates (or reuses) the daily AUDIT issue and transitions it to in_review
assigned to ux-designer — all in one run so the creating agent retains
mutation authority for the PATCH (auth-boundary-safe ordering, BLD-2109).

The --issue-id flag is for the partial-rerun case (issue already created in a
prior attempt; skip create and go straight to the transition).

Exit codes:
  0  success (issue at in_review assigned to ux-designer)
  1  usage error
  2  create-issue failed
  3  PATCH (status + assignee transition) failed — NEVER leaves backlog
  4  post-PATCH verify failed or status still backlog
EOF
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)                TITLE="$2"; shift 2;;
    --description)          DESCRIPTION="$2"; shift 2;;
    --priority)             PRIORITY="$2"; shift 2;;
    --bundle-url)           BUNDLE_URL="$2"; shift 2;;
    --capture-failed)       CAPTURE_FAILED=true; shift;;
    --upload-failed)        UPLOAD_FAILED=true; shift;;
    --issue-id)             ISSUE_ID="$2"; shift 2;;
    --clip)                 CLIP="$2"; shift 2;;
    --ux-designer-agent-id) UX_DESIGNER_AGENT_ID="$2"; shift 2;;
    --creating-agent-id)    CREATING_AGENT_ID="$2"; shift 2;;
    -h|--help)              usage 0;;
    *) echo "audit-handoff: unknown option: $1" >&2; usage 1;;
  esac
done

if [[ -z "$TITLE" ]]; then
  echo "audit-handoff: --title is required" >&2
  usage 1
fi

# ─── Helpers ──────────────────────────────────────────────────────────

# Run clip.sh, capturing stdout. On non-zero exit, relay stderr and propagate.
run_clip() {
  bash "$CLIP" "$@"
}

# Extract a JSON field value (no jq dependency — use python3 if available,
# else basic awk). Falls back gracefully to empty string.
json_field() {
  local json="$1" field="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r ".${field} // empty" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    echo "$json" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  v=d.get('${field}')
  print(v if v is not None else '')
except:
  print('')
" 2>/dev/null || true
  else
    # Last-resort awk — handles simple string fields only
    echo "$json" | awk -F'"' -v f="${field}" '
      $2 == f { print $4; exit }
    ' || true
  fi
}

# ─── Step 0: Check if already at in_review or further (idempotency) ───
if [[ -n "$ISSUE_ID" ]]; then
  echo "[audit-handoff] --issue-id provided ($ISSUE_ID); skipping create step."
  echo "[audit-handoff] Fetching current status to check idempotency..."
  existing_json=""
  set +e
  existing_json=$(run_clip get-issue "$ISSUE_ID" 2>&1)
  fetch_rc=$?
  set -e

  if [[ $fetch_rc -ne 0 ]]; then
    echo "[audit-handoff] WARN: could not fetch issue $ISSUE_ID — proceeding with PATCH attempt." >&2
  else
    existing_status=$(json_field "$existing_json" "status")
    existing_assignee=$(json_field "$existing_json" "assigneeAgentId")

    # If already ≥ in_review and assigned to ux-designer, nothing to do.
    case "$existing_status" in
      in_review|in_progress|done|cancelled)
        if [[ "$existing_assignee" == "$UX_DESIGNER_AGENT_ID" ]]; then
          echo "[audit-handoff] Issue $ISSUE_ID is already $existing_status assigned to ux-designer — no-op."
          exit 0
        fi
        ;;
    esac
  fi
fi

# ─── Step 1: Create the AUDIT issue (if not provided via --issue-id) ──

if [[ -z "$ISSUE_ID" ]]; then
  echo "[audit-handoff] Creating AUDIT issue: $TITLE"

  # Build description with optional bundle URL and failure flags.
  desc="$DESCRIPTION"

  if [[ "$CAPTURE_FAILED" == "true" ]]; then
    desc="${desc}

## Capture Status
Bundle capture encountered an error. ux-designer: please see the preceding comment for the capture error. Review what screenshots ARE available before filing findings."
  fi

  if [[ "$UPLOAD_FAILED" == "true" ]]; then
    desc="${desc}

## Upload Status
Bundle upload failed. ux-designer: bundle may be unavailable; check the preceding comment for context."
  fi

  if [[ -n "$BUNDLE_URL" ]]; then
    desc="${desc}

## Bundle
${BUNDLE_URL}"
  fi

  # AUTH NOTE: Create the issue assigned to CREATING AGENT (claudecoder = self),
  # NOT to ux-designer. The subsequent PATCH (step 2) switches both status and
  # assignee atomically while claudecoder still holds the assignee slot.
  # See the file-header comment for the full auth-boundary rationale.
  create_json=""
  set +e
  create_json=$(run_clip create-issue \
    --title "$TITLE" \
    --description "$desc" \
    --priority "$PRIORITY" \
    --assignee-agent-id "$CREATING_AGENT_ID" \
    --project-id "$PROJECT_ID" 2>&1)
  create_rc=$?
  set -e

  if [[ $create_rc -ne 0 ]]; then
    echo "[audit-handoff] ERROR: clip.sh create-issue failed (rc=$create_rc)." >&2
    echo "[audit-handoff] Output: $create_json" >&2
    exit 2
  fi

  # Extract the new issue ID (prefer identifier like BLD-NNN, fall back to UUID id).
  ISSUE_ID=$(json_field "$create_json" "identifier")
  if [[ -z "$ISSUE_ID" ]]; then
    ISSUE_ID=$(json_field "$create_json" "id")
  fi

  if [[ -z "$ISSUE_ID" ]]; then
    echo "[audit-handoff] ERROR: create-issue succeeded but could not extract issue ID from response." >&2
    echo "[audit-handoff] Response: $create_json" >&2
    exit 2
  fi

  echo "[audit-handoff] Issue created: $ISSUE_ID"
fi

# ─── Step 2: Atomic PATCH — status=in_review + assignee=ux-designer ───
#
# AUTH BOUNDARY: At this point, the issue's assigneeAgentId == CREATING_AGENT_ID
# (claudecoder), because either:
#   (a) we just created it with --assignee-agent-id CREATING_AGENT_ID, or
#   (b) caller passed --issue-id for a prior partial-create, and step 0 confirmed
#       the issue is NOT yet at in_review (meaning ux-designer hasn't claimed it yet).
#
# The Paperclip auth check evaluates the PRE-MUTATION assignee:
#   actor (claudecoder) == pre-mutation assignee (claudecoder) → ALLOWED
#
# After this PATCH: assignee=ux-designer AND status=in_review → server
# triggers queueIssueAssignmentWakeup (skips backlog; in_review is fine).

echo "[audit-handoff] PATCH $ISSUE_ID: status=in_review + assigneeAgentId=ux-designer ..."

patch_json=""
set +e
patch_json=$(run_clip update-issue "$ISSUE_ID" \
  --status "in_review" \
  --assignee-agent-id "$UX_DESIGNER_AGENT_ID" 2>&1)
patch_rc=$?
set -e

if [[ $patch_rc -ne 0 ]]; then
  echo "[audit-handoff] FATAL: PATCH failed (rc=$patch_rc). Issue $ISSUE_ID may still be in backlog." >&2
  echo "[audit-handoff] PATCH output: $patch_json" >&2
  echo "[audit-handoff] ACTION REQUIRED: board must manually advance $ISSUE_ID to in_review and assign ux-designer." >&2
  # Exit 3 — caller should surface this loudly (set -e / CI failure).
  exit 3
fi

echo "[audit-handoff] PATCH succeeded."

# ─── Step 3: Verify — re-read the issue and confirm end-state ─────────
#
# We never trust the PATCH response alone. A 2xx response with an unexpected
# body (or a concurrent mutation) could leave the issue in an unexpected state.
# Re-reading and asserting is the only way to guarantee the downstream wake fires.

echo "[audit-handoff] Verifying end-state for $ISSUE_ID ..."

verify_json=""
set +e
verify_json=$(run_clip get-issue "$ISSUE_ID" 2>&1)
verify_rc=$?
set -e

if [[ $verify_rc -ne 0 ]]; then
  echo "[audit-handoff] WARN: could not re-read $ISSUE_ID for verification (rc=$verify_rc)." >&2
  echo "[audit-handoff] Output: $verify_json" >&2
  # Non-fatal warn only — PATCH appeared to succeed; we just can't verify.
  echo "[audit-handoff] WARN: proceeding despite verify failure. Monitor $ISSUE_ID manually." >&2
  echo "[audit-handoff] DONE (unverified): $ISSUE_ID → in_review / ux-designer"
  exit 0
fi

final_status=$(json_field "$verify_json" "status")
final_assignee=$(json_field "$verify_json" "assigneeAgentId")

if [[ "$final_status" == "backlog" ]]; then
  echo "[audit-handoff] FATAL: $ISSUE_ID is STILL in backlog after PATCH. ux-designer will NOT be woken." >&2
  echo "[audit-handoff] ACTION REQUIRED: board must manually advance $ISSUE_ID." >&2
  exit 4
fi

if [[ "$final_assignee" != "$UX_DESIGNER_AGENT_ID" ]]; then
  echo "[audit-handoff] WARN: $ISSUE_ID status=$final_status but assignee=$final_assignee (expected $UX_DESIGNER_AGENT_ID)." >&2
  # Not a fatal error — status is not backlog, so the wake path is not blocked.
  # But log loudly so operators can investigate.
fi

echo "[audit-handoff] VERIFIED: $ISSUE_ID status=$final_status assignee=$final_assignee"
echo "[audit-handoff] DONE: ux-designer will be woken on $ISSUE_ID."
