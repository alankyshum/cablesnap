#!/usr/bin/env bash
# audit-handoff.sh — BLD-3256: create the daily AUDIT issue and a separate
# REVIEW PICKUP issue to wake ux-designer under the new in_review constraints.
#
# ## The Two-Issue REVIEW PICKUP Pattern (BLD-3188, BLD-3256)
#
# To avoid HTTP 422 errors due to the in_review 'real review path' constraints (BLD-3254),
# the daily UX audit is handed off using a reliable two-issue pattern:
#
#   1. Create the AUDIT issue assigned to the creating agent (claudecoder), status=todo.
#   2. PATCH the AUDIT issue: status=todo + assigneeAgentId=ux-designer.
#      This is safe because the pre-mutation assignee is still claudecoder.
#   3. Create a separate todo issue titled "REVIEW PICKUP: <AUDIT title>"
#      assigned to ux-designer, referencing the AUDIT issue in its description.
#      This fresh todo issue wakes ux-designer (assignment-wake) reliably.
#
# ## Idempotency
#
# If the AUDIT issue already exists for today's date (detected by the --issue-id override),
# and its status is already todo/in_progress/done, and it is assigned to ux-designer,
# the script is a no-op and exits 0 to prevent clobbering ux-designer.
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
#   0  — Issues created-or-reused and VERIFIED at status=todo/in_progress/done
#          assigned to ux-designer (or already ≥ todo; no-op)
#   1  — Usage error
#   2  — clip.sh create-issue failed
#   3  — clip.sh PATCH or REVIEW PICKUP issue creation failed (exits loudly)
#   4  — post-PATCH verification failed: re-read errored, OR status is backlog,
#          OR assignee != ux-designer. Any unverifiable/wrong end-state is fatal
#          because it means ux-designer's assignment-wake will not fire.
#
# Refs: BLD-3256, BLD-3254, BLD-3188, BLD-2109.

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

Creates (or reuses) the daily AUDIT issue, assigns it to ux-designer,
and creates a separate REVIEW PICKUP issue to wake ux-designer (BLD-3256).

The --issue-id flag is for the partial-rerun case (issue already created in a
prior attempt; skip create and go straight to the transition).

Exit codes:
  0  success (issues VERIFIED at todo/in_progress assigned to ux-designer)
  1  usage error
  2  create-issue failed
  3  PATCH (status + assignee transition) or REVIEW PICKUP creation failed
  4  post-PATCH verify failed: read errored, status is backlog, or
     assignee != ux-designer (any unverifiable/wrong end-state is fatal)
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

existing_status=""
existing_assignee=""

# ─── Step 0: Check if already at todo or further (idempotency) ───
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

    # If already ≥ todo and assigned to ux-designer, we also require that
    # the corresponding REVIEW PICKUP issue exists before we can no-op.
    case "$existing_status" in
      todo|in_review|in_progress|done|cancelled)
        if [[ "$existing_assignee" == "$UX_DESIGNER_AGENT_ID" ]]; then
          echo "[audit-handoff] Issue $ISSUE_ID is already $existing_status assigned to ux-designer."
          echo "[audit-handoff] Checking if corresponding REVIEW PICKUP issue exists..."
          set +e
          candidates_json=$(run_clip list-issues --assignee "$UX_DESIGNER_AGENT_ID" -q "$ISSUE_ID" 2>&1)
          list_rc=$?
          set -e

          if [[ $list_rc -eq 0 ]]; then
            has_pickup=$(echo "$candidates_json" | python3 -c '
import sys, json
def check():
    text = sys.stdin.read().strip()
    if not text:
        return False
    decoder = json.JSONDecoder()
    pos = 0
    while pos < len(text):
        text = text[pos:].strip()
        if not text:
            break
        try:
            obj, pos = decoder.raw_decode(text)
            title = obj.get("title", "")
            status = obj.get("status", "")
            if "REVIEW PICKUP" in title and status in ("todo", "in_progress", "in_review", "done"):
                return True
        except Exception:
            break
    return False

if check():
    print("true")
else:
    print("false")
')
            if [[ "$has_pickup" == "true" ]]; then
              echo "[audit-handoff] Found existing REVIEW PICKUP issue assigned to ux-designer — no-op."
              exit 0
            else
              echo "[audit-handoff] No active REVIEW PICKUP issue found for $ISSUE_ID assigned to ux-designer."
            fi
          else
            echo "[audit-handoff] WARN: could not search issues for REVIEW PICKUP — proceeding." >&2
          fi
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

# ─── Step 2: PATCH — status=todo + assignee=ux-designer ───
#
# AUTH BOUNDARY: At this point, the issue's assigneeAgentId == CREATING_AGENT_ID
# (claudecoder), because either:
#   (a) we just created it with --assignee-agent-id CREATING_AGENT_ID, or
#   (b) caller passed --issue-id for a prior partial-create, and step 0 confirmed
#       the issue is NOT yet assigned to ux-designer.
#
# The Paperclip auth check evaluates the PRE-MUTATION assignee:
#   actor (claudecoder) == pre-mutation assignee (claudecoder) → ALLOWED
#
# After this PATCH: assignee=ux-designer AND status=todo.

if [[ "$existing_assignee" == "$UX_DESIGNER_AGENT_ID" ]]; then
  echo "[audit-handoff] AUDIT issue $ISSUE_ID is already assigned to ux-designer — skipping Step 2 PATCH."
else
  echo "[audit-handoff] PATCH $ISSUE_ID: status=todo + assigneeAgentId=ux-designer ..."

  patch_json=""
  set +e
  patch_json=$(run_clip update-issue "$ISSUE_ID" \
    --status "todo" \
    --assignee-agent-id "$UX_DESIGNER_AGENT_ID" 2>&1)
  patch_rc=$?
  set -e

  if [[ $patch_rc -ne 0 ]]; then
    echo "[audit-handoff] FATAL: PATCH failed (rc=$patch_rc). Issue $ISSUE_ID may still be in backlog." >&2
    echo "[audit-handoff] PATCH output: $patch_json" >&2
    echo "[audit-handoff] ACTION REQUIRED: board must manually advance $ISSUE_ID to todo and assign ux-designer." >&2
    # Exit 3 — caller should surface this loudly (set -e / CI failure).
    exit 3
  fi

  echo "[audit-handoff] PATCH succeeded."
fi

# ─── Step 2b: Create the REVIEW PICKUP issue ───
#
# Create a separate todo issue titled `REVIEW PICKUP: <AUDIT title>` assigned to ux-designer
# that references the AUDIT issue. This is the reliable assignment-wake per BLD-3188.

echo "[audit-handoff] Creating separate REVIEW PICKUP issue..."

if [[ "$ISSUE_ID" =~ ^BLD-[0-9]+$ ]]; then
  REVIEW_DESC="ux-designer: please review [${ISSUE_ID}](/BLD/issues/${ISSUE_ID}) and mark it done once your audit findings are filed."
else
  REVIEW_DESC="ux-designer: please review issue ${ISSUE_ID} and mark it done once your audit findings are filed."
fi
if [[ -n "$BUNDLE_URL" ]]; then
  REVIEW_DESC="${REVIEW_DESC}

Bundle URL: ${BUNDLE_URL}"
fi

pickup_json=""
set +e
pickup_json=$(run_clip create-issue \
  --title "REVIEW PICKUP: $TITLE" \
  --description "$REVIEW_DESC" \
  --status "todo" \
  --priority "$PRIORITY" \
  --assignee-agent-id "$UX_DESIGNER_AGENT_ID" \
  --project-id "$PROJECT_ID" 2>&1)
pickup_rc=$?
set -e

if [[ $pickup_rc -ne 0 ]]; then
  echo "[audit-handoff] FATAL: REVIEW PICKUP issue creation failed (rc=$pickup_rc)." >&2
  echo "[audit-handoff] create-issue output: $pickup_json" >&2
  exit 3
fi

PICKUP_ISSUE_ID=$(json_field "$pickup_json" "identifier")
if [[ -z "$PICKUP_ISSUE_ID" ]]; then
  PICKUP_ISSUE_ID=$(json_field "$pickup_json" "id")
fi

if [[ -z "$PICKUP_ISSUE_ID" ]]; then
  echo "[audit-handoff] ERROR: REVIEW PICKUP issue created but could not extract issue ID from response." >&2
  echo "[audit-handoff] Response: $pickup_json" >&2
  exit 3
fi

echo "[audit-handoff] REVIEW PICKUP issue created: $PICKUP_ISSUE_ID"

# ─── Step 3: Verify — re-read both issues and confirm end-state ─────────
#
# We never trust the responses alone. Re-reading and asserting is the only way to
# guarantee the downstream wake fires.
#
# The verified end-state must satisfy:
#   (a) the re-read of AUDIT issue must succeed, and status must be todo/in_progress/done, and assignee must be ux-designer.
#   (b) the re-read of REVIEW PICKUP issue must succeed, and status must be todo/in_progress/done, and assignee must be ux-designer.

echo "[audit-handoff] Verifying end-state for AUDIT issue $ISSUE_ID ..."

verify_json=""
set +e
verify_json=$(run_clip get-issue "$ISSUE_ID" 2>&1)
verify_rc=$?
set -e

if [[ $verify_rc -ne 0 ]]; then
  echo "[audit-handoff] FATAL: could not re-read AUDIT issue $ISSUE_ID for verification (rc=$verify_rc)." >&2
  echo "[audit-handoff] Output: $verify_json" >&2
  echo "[audit-handoff] End-state is UNVERIFIABLE; refusing to report success." >&2
  echo "[audit-handoff] ACTION REQUIRED: board must confirm AUDIT issue $ISSUE_ID is todo/in_progress assigned to ux-designer." >&2
  exit 4
fi

final_status=$(json_field "$verify_json" "status")
final_assignee=$(json_field "$verify_json" "assigneeAgentId")

case "$final_status" in
  todo|in_progress|done)
    # Status is fine.
    ;;
  *)
    echo "[audit-handoff] FATAL: $ISSUE_ID status=$final_status after PATCH (expected todo/in_progress)." >&2
    if [[ "$final_status" == "backlog" ]]; then
      echo "[audit-handoff] Issue is STILL in backlog — ux-designer will NOT be woken." >&2
    fi
    echo "[audit-handoff] ACTION REQUIRED: board must manually advance $ISSUE_ID to todo." >&2
    exit 4
    ;;
esac

if [[ "$final_assignee" != "$UX_DESIGNER_AGENT_ID" ]]; then
  echo "[audit-handoff] FATAL: $ISSUE_ID status=$final_status but assignee=$final_assignee (expected ux-designer $UX_DESIGNER_AGENT_ID)." >&2
  echo "[audit-handoff] ux-designer will NOT be woken on the audit." >&2
  echo "[audit-handoff] ACTION REQUIRED: board must reassign $ISSUE_ID to ux-designer." >&2
  exit 4
fi

echo "[audit-handoff] Verifying end-state for REVIEW PICKUP issue $PICKUP_ISSUE_ID ..."

verify_pickup_json=""
set +e
verify_pickup_json=$(run_clip get-issue "$PICKUP_ISSUE_ID" 2>&1)
verify_pickup_rc=$?
set -e

if [[ $verify_pickup_rc -ne 0 ]]; then
  echo "[audit-handoff] FATAL: could not re-read REVIEW PICKUP issue $PICKUP_ISSUE_ID for verification (rc=$verify_pickup_rc)." >&2
  echo "[audit-handoff] Output: $verify_pickup_json" >&2
  echo "[audit-handoff] End-state is UNVERIFIABLE; refusing to report success." >&2
  echo "[audit-handoff] ACTION REQUIRED: board must confirm REVIEW PICKUP issue $PICKUP_ISSUE_ID is todo assigned to ux-designer." >&2
  exit 4
fi

pickup_status=$(json_field "$verify_pickup_json" "status")
pickup_assignee=$(json_field "$verify_pickup_json" "assigneeAgentId")

case "$pickup_status" in
  todo|in_progress|done)
    # Status is fine.
    ;;
  *)
    echo "[audit-handoff] FATAL: $PICKUP_ISSUE_ID status=$pickup_status (expected todo/in_progress)." >&2
    if [[ "$pickup_status" == "backlog" ]]; then
      echo "[audit-handoff] REVIEW PICKUP is in backlog — ux-designer will NOT be woken." >&2
    fi
    echo "[audit-handoff] ACTION REQUIRED: board must manually advance $PICKUP_ISSUE_ID to todo." >&2
    exit 4
    ;;
esac

if [[ "$pickup_assignee" != "$UX_DESIGNER_AGENT_ID" ]]; then
  echo "[audit-handoff] FATAL: $PICKUP_ISSUE_ID status=$pickup_status but assignee=$pickup_assignee (expected ux-designer $UX_DESIGNER_AGENT_ID)." >&2
  echo "[audit-handoff] ux-designer will NOT be woken on the REVIEW PICKUP." >&2
  echo "[audit-handoff] ACTION REQUIRED: board must reassign $PICKUP_ISSUE_ID to ux-designer." >&2
  exit 4
fi

echo "[audit-handoff] VERIFIED: $ISSUE_ID status=$final_status assignee=$final_assignee"
echo "[audit-handoff] VERIFIED: $PICKUP_ISSUE_ID status=$pickup_status assignee=$pickup_assignee"
echo "[audit-handoff] DONE: ux-designer will be woken on REVIEW PICKUP issue $PICKUP_ISSUE_ID."
