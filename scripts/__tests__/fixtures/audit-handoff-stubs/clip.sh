#!/usr/bin/env bash
# State-backed clip.sh stub for BLD-2109 audit-handoff.sh tests.
#
# State file: $STUB_CLIP_STATE
#   JSON: {
#     "issues": [
#       {
#         "id": "uuid",
#         "identifier": "BLD-NNNN",
#         "status": "todo",
#         "assigneeAgentId": "agent-uuid",
#         "title": "..."
#       }
#     ],
#     "nextIdentifier": "BLD-9001",
#     "nextId": "issue-uuid-001"
#   }
#
# Failure mode controls (env vars):
#   STUB_CLIP_CREATE_FAIL    — "1" → create-issue returns exit 1 with error JSON
#   STUB_CLIP_PATCH_FAIL     — "1" → update-issue returns exit 1 with error JSON
#   STUB_CLIP_GET_FAIL       — "1" → get-issue returns exit 1
#   STUB_CLIP_PATCH_HTTP_ERR — HTTP status code to simulate (e.g. "403") for update-issue
#   STUB_CLIP_TRACK_CALLS    — "1" → append each call to $STUB_CLIP_CALL_LOG
#
# Divergent-read controls (simulate PATCH 2xx but server end-state wrong, e.g.
# a concurrent mutation that reverted the change — the scenario the script's
# verification block defends against):
#   STUB_CLIP_GET_STATUS_OVERRIDE   — if set, get-issue reports this status
#                                      instead of the stored one
#   STUB_CLIP_GET_ASSIGNEE_OVERRIDE — if set, get-issue reports this assignee
#                                      instead of the stored one
# These affect get-issue ONLY (not update-issue), so the stored state still
# reflects the PATCH while the re-read returns the overridden, divergent values.

set -u

STATE="${STUB_CLIP_STATE:?STUB_CLIP_STATE not set}"
CREATE_FAIL="${STUB_CLIP_CREATE_FAIL:-0}"
PATCH_FAIL="${STUB_CLIP_PATCH_FAIL:-0}"
GET_FAIL="${STUB_CLIP_GET_FAIL:-0}"
PATCH_HTTP_ERR="${STUB_CLIP_PATCH_HTTP_ERR:-}"
TRACK="${STUB_CLIP_TRACK_CALLS:-0}"
CALL_LOG="${STUB_CLIP_CALL_LOG:-/tmp/audit-handoff-stub-calls.log}"
GET_STATUS_OVERRIDE="${STUB_CLIP_GET_STATUS_OVERRIDE:-}"
GET_ASSIGNEE_OVERRIDE="${STUB_CLIP_GET_ASSIGNEE_OVERRIDE:-}"

# Log calls for sequence assertion in tests.
if [[ "$TRACK" == "1" ]]; then
  echo "$*" >> "$CALL_LOG"
fi

CMD="${1:-}"; shift || true

case "$CMD" in
  list-issues)
    status_filter=""; assignee_filter=""; project_filter=""; search_query=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status)     status_filter="$2"; shift 2;;
        --assignee)   assignee_filter="$2"; shift 2;;
        --project)    project_filter="$2"; shift 2;;
        -q|--search)  search_query="$2"; shift 2;;
        *) shift;;
      esac
    done

    jq --arg status "$status_filter" \
       --arg assignee "$assignee_filter" \
       --arg project "$project_filter" \
       --arg q "$search_query" '
      .issues[] |
      select($status == "" or .status == $status) |
      select($assignee == "" or .assigneeAgentId == $assignee) |
      select($q == "" or (.title | contains($q)) or (.description // "" | contains($q)) or (.identifier == $q)) |
      {identifier, title, status, priority}
    ' "$STATE" 2>/dev/null || true
    exit 0
    ;;

  create-issue)
    if [[ "$CREATE_FAIL" == "1" ]]; then
      echo '{"error":"simulated create-issue failure","code":"STUB_FAIL"}' >&2
      exit 1
    fi

    # Parse args to extract title, description, assigneeAgentId.
    title=""; desc=""; assignee=""; project=""; priority="medium"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title)             title="$2"; shift 2;;
        --description)       desc="$2"; shift 2;;
        --assignee-agent-id) assignee="$2"; shift 2;;
        --project-id)        project="$2"; shift 2;;
        --priority)          priority="$2"; shift 2;;
        *) shift;;
      esac
    done

    # Read nextIdentifier and nextId from state.
    next_id=$(jq -r '.nextId // "issue-stub-001"' "$STATE")
    next_ident=$(jq -r '.nextIdentifier // "BLD-9001"' "$STATE")

    if [[ "$title" == REVIEW\ PICKUP:* ]]; then
      next_id="${next_id}-pickup"
      next_ident="${next_ident}-pickup"
    fi

    # Append new issue to state.
    tmp=$(mktemp)
    jq --arg id "$next_id" \
       --arg ident "$next_ident" \
       --arg title "$title" \
       --arg desc "$desc" \
       --arg assignee "$assignee" \
       --arg priority "$priority" \
       --arg status "todo" \
      '.issues += [{
         "id": $id,
         "identifier": $ident,
         "title": $title,
         "description": $desc,
         "status": $status,
         "assigneeAgentId": $assignee,
         "priority": $priority
       }]' "$STATE" > "$tmp" && mv "$tmp" "$STATE"

    # Emit the created issue JSON (mimics real clip.sh create-issue output).
    jq -n \
      --arg id "$next_id" \
      --arg ident "$next_ident" \
      --arg title "$title" \
      --arg desc "$desc" \
      --arg assignee "$assignee" \
      --arg priority "$priority" \
      '{
        "id": $id,
        "identifier": $ident,
        "title": $title,
        "description": $desc,
        "status": "todo",
        "assigneeAgentId": $assignee,
        "priority": $priority
      }'
    exit 0
    ;;

  update-issue)
    issue_id="${1:-}"; shift || true

    if [[ "$PATCH_FAIL" == "1" ]]; then
      if [[ -n "$PATCH_HTTP_ERR" ]]; then
        echo "ERROR $PATCH_HTTP_ERR PATCH /issues/$issue_id" >&2
        echo "{\"error\":\"simulated HTTP $PATCH_HTTP_ERR\",\"code\":\"STUB_FAIL\"}" >&2
      else
        echo '{"error":"simulated update-issue failure","code":"STUB_FAIL"}' >&2
      fi
      exit 1
    fi

    # Parse status and assigneeAgentId from args.
    new_status=""; new_assignee=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status)            new_status="$2"; shift 2;;
        --assignee-agent-id) new_assignee="$2"; shift 2;;
        *) shift;;
      esac
    done

    # Look up the issue (by identifier like BLD-NNN or by UUID).
    exists=$(jq --arg id "$issue_id" '
      .issues | map(select(.identifier == $id or .id == $id)) | length
    ' "$STATE")

    if [[ "$exists" == "0" ]]; then
      echo "{\"error\":\"issue not found: $issue_id\"}" >&2
      exit 1
    fi

    # Apply mutation.
    tmp=$(mktemp)
    jq --arg id "$issue_id" \
       --arg status "$new_status" \
       --arg assignee "$new_assignee" \
      '.issues |= map(
        if (.identifier == $id or .id == $id) then
          . *
          (if $status != "" then {"status": $status} else {} end) *
          (if $assignee != "" then {"assigneeAgentId": $assignee} else {} end)
        else . end
      )' "$STATE" > "$tmp" && mv "$tmp" "$STATE"

    # Return the updated issue.
    jq --arg id "$issue_id" '
      .issues[] | select(.identifier == $id or .id == $id)
    ' "$STATE"
    exit 0
    ;;

  get-issue)
    issue_id="${1:-}"

    if [[ "$GET_FAIL" == "1" ]]; then
      echo '{"error":"simulated get-issue failure","code":"STUB_FAIL"}' >&2
      exit 1
    fi

    # Look up the issue.
    result=$(jq --arg id "$issue_id" '
      .issues[] | select(.identifier == $id or .id == $id)
    ' "$STATE" 2>/dev/null || true)

    if [[ -z "$result" ]]; then
      echo "{\"error\":\"issue not found: $issue_id\"}" >&2
      exit 1
    fi

    # Divergent-read overrides: simulate a server end-state that differs from
    # what the PATCH stored (e.g. concurrent mutation). Applied to the emitted
    # JSON only; stored state is untouched.
    if [[ -n "$GET_STATUS_OVERRIDE" ]]; then
      result=$(echo "$result" | jq --arg s "$GET_STATUS_OVERRIDE" '.status = $s')
    fi
    if [[ -n "$GET_ASSIGNEE_OVERRIDE" ]]; then
      result=$(echo "$result" | jq --arg a "$GET_ASSIGNEE_OVERRIDE" '.assigneeAgentId = $a')
    fi

    echo "$result"
    exit 0
    ;;

  *)
    echo "[clip-stub] unsupported command: $CMD" >&2
    exit 1
    ;;
esac
