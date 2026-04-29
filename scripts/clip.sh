#!/usr/bin/env bash
# clip.sh — Paperclip API helper for container use
# Adapted from Claude skill tool--paperclip for use inside Paperclip container
# Usage: clip.sh <command> [options]
#
# BLD-846 (2026-04-29): Surface 4xx/5xx error bodies on stderr.
# ----------------------------------------------------------------
# Previously this script used `curl -sf` for write endpoints. With `-f`,
# curl exits non-zero on HTTP errors but discards the response body. That
# silently swallowed real errors like "Issue is checked out by another
# agent" (409) — agents thought their writes succeeded when they did not
# (see BLD-743 incident, BLD-846 root-cause issue).
#
# This version captures both body and HTTP status code, prints the body to
# stderr on non-2xx (so agents see the structured error), and exits
# non-zero so callers using `set -e` or explicit checks can react.
# Happy-path output (2xx) is unchanged.
#
# This file lives in the CableSnap repo as the source of truth. The host
# bind-mounted copy at /skills/scripts/clip.sh should be updated to match.
# Until that happens, agents can invoke this version directly via
# `./scripts/clip.sh` from /projects/cablesnap.
set -euo pipefail

# --- Config (container-aware) ---
# Inside the container, use localhost since we're in the same process
API_BASE="${PAPERCLIP_API_BASE:-http://localhost:3100}"
API_KEY="${PAPERCLIP_API_KEY:-${PAPERCLIP_AGENT_API_KEY:-}}"
COMPANY="${CLIP_COMPANY:-${PAPERCLIP_COMPANY_ID:-}}"
AGENT="${CLIP_AGENT:-${PAPERCLIP_AGENT_ID:-}}"

if [[ -z "$API_KEY" ]]; then
  echo "ERROR: PAPERCLIP_API_KEY (or PAPERCLIP_AGENT_API_KEY) not set" >&2
  exit 1
fi

# --- Helpers ---

# api: invoke the Paperclip HTTP API and surface error bodies.
#
# Usage: api METHOD PATH [extra curl args...]
#
# On 2xx: prints the response body to stdout, exits 0.
# On non-2xx: prints the response body to stderr (with an
#   "ERROR <status>" prefix line), exits 1. The structured error body
#   (e.g. {"error":"Issue is checked out by another agent","holderRunId":...})
#   is preserved verbatim so callers can grep / jq it.
# On curl transport failure (network down, DNS, etc.): prints curl's
#   stderr message and exits with curl's non-zero status.
#
# Implementation notes:
#   - We append `\n<HTTP_STATUS>` to the response body using `-w` and split
#     on the last newline. This avoids a temp-file dance and works with any
#     body content (including bodies that already end with newlines).
#   - We do NOT use `-f` because `-f` discards the body — exactly the bug
#     this function is fixing.
#   - We use `--connect-timeout` to avoid hangs against a dead API.
api() {
  local method="$1" path="$2"; shift 2
  local url="${API_BASE}/api${path}"
  local response status body
  local curl_status=0

  # Capture body+status. `-w` appends "<newline><http_code>" to the body.
  response=$(curl -sS -X "$method" \
    --connect-timeout 10 \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w $'\n%{http_code}' \
    "$@" "$url") || curl_status=$?

  if [[ $curl_status -ne 0 ]]; then
    # Transport failure (curl wrote its own error to stderr via -sS).
    # `response` may be partial or empty; surface what we have.
    if [[ -n "$response" ]]; then
      printf '%s\n' "$response" >&2
    fi
    return "$curl_status"
  fi

  # Split: status is the last line, body is everything before it.
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"

  # Defensive: if response had no body and curl emitted only the code,
  # `body` will equal `status`. Treat that as empty body.
  if [[ "$body" == "$status" ]]; then
    body=""
  fi

  if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
    if [[ -n "$body" ]]; then
      printf '%s\n' "$body"
    fi
    return 0
  fi

  # Non-2xx: surface structured error to stderr.
  printf 'ERROR %s %s %s\n' "$status" "$method" "$path" >&2
  if [[ -n "$body" ]]; then
    printf '%s\n' "$body" >&2
  else
    printf '(empty response body)\n' >&2
  fi
  return 1
}

api_get()    { api GET "$1"; }
api_post()   { api POST "$1" -d "$2"; }
api_patch()  { api PATCH "$1" -d "$2"; }
api_delete() { api DELETE "$1"; }

jq_or_cat() { if command -v jq &>/dev/null; then jq "$@"; else cat; fi; }

# --- Commands ---
cmd="${1:-help}"; shift || true

case "$cmd" in
  # === Issues ===
  list-issues)
    query=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status)       query="${query:+$query&}status=$2"; shift 2;;
        --assignee)     query="${query:+$query&}assigneeAgentId=$2"; shift 2;;
        --project)      query="${query:+$query&}projectId=$2"; shift 2;;
        --label)        query="${query:+$query&}labelId=$2"; shift 2;;
        --search|-q)    query="${query:+$query&}q=$2"; shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_get "/companies/$COMPANY/issues${query:+?$query}" | jq_or_cat '.[] | {identifier, title, status, priority}' 2>/dev/null || api_get "/companies/$COMPANY/issues${query:+?$query}"
    ;;

  get-issue)
    api_get "/issues/$1" | jq_or_cat '.'
    ;;

  create-issue)
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title)             body=$(echo "$body" | jq --arg v "$2" '. + {title: $v}'); shift 2;;
        --description)       body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --status)            body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        --priority)          body=$(echo "$body" | jq --arg v "$2" '. + {priority: $v}'); shift 2;;
        --assignee-agent-id) body=$(echo "$body" | jq --arg v "$2" '. + {assigneeAgentId: $v}'); shift 2;;
        --project-id)        body=$(echo "$body" | jq --arg v "$2" '. + {projectId: $v}'); shift 2;;
        --goal-id)           body=$(echo "$body" | jq --arg v "$2" '. + {goalId: $v}'); shift 2;;
        --parent-id)         body=$(echo "$body" | jq --arg v "$2" '. + {parentId: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/companies/$COMPANY/issues" "$body" | jq_or_cat '.'
    ;;

  update-issue)
    issue_id="$1"; shift
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title)             body=$(echo "$body" | jq --arg v "$2" '. + {title: $v}'); shift 2;;
        --description)       body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --status)            body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        --priority)          body=$(echo "$body" | jq --arg v "$2" '. + {priority: $v}'); shift 2;;
        --assignee-agent-id) body=$(echo "$body" | jq --arg v "$2" '. + {assigneeAgentId: $v}'); shift 2;;
        --project-id)        body=$(echo "$body" | jq --arg v "$2" '. + {projectId: $v}'); shift 2;;
        --goal-id)           body=$(echo "$body" | jq --arg v "$2" '. + {goalId: $v}'); shift 2;;
        --comment)           body=$(echo "$body" | jq --arg v "$2" '. + {comment: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_patch "/issues/$issue_id" "$body" | jq_or_cat '.'
    ;;

  comment-issue)
    issue_id="$1"; shift
    body=""
    reopen="false"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --body)   body="$2"; shift 2;;
        --reopen) reopen="true"; shift;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/issues/$issue_id/comments" "{\"body\":$(echo "$body" | jq -Rs '.'),\"reopen\":$reopen}" | jq_or_cat '.'
    ;;

  checkout-issue)
    issue_id="$1"; shift
    run_id="${1:-$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "manual-$(date +%s)")}"
    # Route through api() so 4xx/5xx bodies surface (BLD-846).
    api POST "/issues/$issue_id/checkout" \
      -H "X-Paperclip-Run-Id: $run_id" \
      -d "{\"agentId\":\"$AGENT\"}" | jq_or_cat '.'
    echo "Run ID: $run_id" >&2
    ;;

  release-issue)
    api_post "/issues/$1/release" "{}" | jq_or_cat '.'
    ;;

  # === Goals ===
  list-goals)
    api_get "/companies/$COMPANY/goals" | jq_or_cat '.'
    ;;

  create-goal)
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title)       body=$(echo "$body" | jq --arg v "$2" '. + {title: $v}'); shift 2;;
        --description) body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --level)       body=$(echo "$body" | jq --arg v "$2" '. + {level: $v}'); shift 2;;
        --status)      body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        --parent-id)   body=$(echo "$body" | jq --arg v "$2" '. + {parentId: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/companies/$COMPANY/goals" "$body" | jq_or_cat '.'
    ;;

  update-goal)
    goal_id="$1"; shift
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title)       body=$(echo "$body" | jq --arg v "$2" '. + {title: $v}'); shift 2;;
        --description) body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --status)      body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_patch "/goals/$goal_id" "$body" | jq_or_cat '.'
    ;;

  # === Projects ===
  list-projects)
    api_get "/companies/$COMPANY/projects" | jq_or_cat '.'
    ;;

  create-project)
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)        body=$(echo "$body" | jq --arg v "$2" '. + {name: $v}'); shift 2;;
        --description) body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --status)      body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        --lead-agent)  body=$(echo "$body" | jq --arg v "$2" '. + {leadAgentId: $v}'); shift 2;;
        --goal-id)     body=$(echo "$body" | jq --arg v "$2" '. + {goalId: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/companies/$COMPANY/projects" "$body" | jq_or_cat '.'
    ;;

  update-project)
    project_id="$1"; shift
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)        body=$(echo "$body" | jq --arg v "$2" '. + {name: $v}'); shift 2;;
        --description) body=$(echo "$body" | jq --arg v "$2" '. + {description: $v}'); shift 2;;
        --status)      body=$(echo "$body" | jq --arg v "$2" '. + {status: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_patch "/projects/$project_id" "$body" | jq_or_cat '.'
    ;;

  # === Labels ===
  list-labels)
    api_get "/companies/$COMPANY/labels" | jq_or_cat '.'
    ;;

  create-label)
    name=""; color=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)  name="$2"; shift 2;;
        --color) color="$2"; shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/companies/$COMPANY/labels" "{\"name\":\"$name\",\"color\":\"$color\"}" | jq_or_cat '.'
    ;;

  # === Agents ===
  create-agent)
    # ENFORCED: All agents MUST use copilot_local adapter with command "copilot"
    body='{"adapterType":"copilot_local"}'
    config='{"command":"copilot","cwd":"/projects/travel-planner"}'
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)                body=$(echo "$body" | jq --arg v "$2" '. + {name: $v}'); shift 2;;
        --role)                body=$(echo "$body" | jq --arg v "$2" '. + {role: $v}'); shift 2;;
        --model)               config=$(echo "$config" | jq --arg v "$2" '. + {model: $v}'); shift 2;;
        --instructions-file)   config=$(echo "$config" | jq --arg v "$2" '. + {instructionsFilePath: $v}'); shift 2;;
        --prompt-template)     config=$(echo "$config" | jq --arg v "$2" '. + {promptTemplate: $v}'); shift 2;;
        --cwd)                 config=$(echo "$config" | jq --arg v "$2" '. + {cwd: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    body=$(echo "$body" | jq --argjson c "$config" '. + {adapterConfig: $c}')
    echo "Creating agent with copilot_local adapter (enforced):" >&2
    echo "$body" | jq '.' >&2
    api_post "/companies/$COMPANY/agents" "$body" | jq_or_cat '.'
    ;;

  list-agents)
    api_get "/companies/$COMPANY/agents" | jq_or_cat '.'
    ;;

  get-me)
    api_get "/agents/me" | jq_or_cat '.'
    ;;

  get-agent)
    api_get "/agents/$1" | jq_or_cat '.'
    ;;

  wake-agent)
    reason="${1:-manual wakeup}"
    api_post "/agents/$AGENT/wakeup" "{\"source\":\"cli\",\"reason\":$(echo "$reason" | jq -Rs '.')}" | jq_or_cat '.'
    ;;

  # === Dashboard & Activity ===
  dashboard)
    api_get "/companies/$COMPANY/dashboard" | jq_or_cat '.'
    ;;

  activity)
    query=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --agent-id)    query="${query:+$query&}agentId=$2"; shift 2;;
        --entity-type) query="${query:+$query&}entityType=$2"; shift 2;;
        --entity-id)   query="${query:+$query&}entityId=$2"; shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_get "/companies/$COMPANY/activity${query:+?$query}" | jq_or_cat '.'
    ;;

  badges)
    api_get "/companies/$COMPANY/sidebar-badges" | jq_or_cat '.'
    ;;

  # === Approvals ===
  list-approvals)
    status="${1:-}"
    api_get "/companies/$COMPANY/approvals${status:+?status=$status}" | jq_or_cat '.'
    ;;

  create-approval)
    body="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --type)    body=$(echo "$body" | jq --arg v "$2" '. + {type: $v}'); shift 2;;
        --payload) body=$(echo "$body" | jq --argjson v "$2" '. + {payload: $v}'); shift 2;;
        --agent)   body=$(echo "$body" | jq --arg v "$2" '. + {requestedByAgentId: $v}'); shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/companies/$COMPANY/approvals" "$body" | jq_or_cat '.'
    ;;

  comment-approval)
    approval_id="$1"; shift
    body=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --body) body="$2"; shift 2;;
        *) echo "Unknown option: $1" >&2; exit 1;;
      esac
    done
    api_post "/approvals/$approval_id/comments" "{\"body\":$(echo "$body" | jq -Rs '.')}" | jq_or_cat '.'
    ;;

  # === Heartbeats ===
  list-runs)
    limit="${1:-20}"
    api_get "/companies/$COMPANY/heartbeat-runs?limit=$limit" | jq_or_cat '.'
    ;;

  live-runs)
    api_get "/companies/$COMPANY/live-runs" | jq_or_cat '.'
    ;;

  # === Health ===
  health)
    api_get "/health" | jq_or_cat '.'
    ;;

  # === Help ===
  help|--help|-h|"")
    cat <<'HELP'
clip.sh — Paperclip API helper (container edition)

ISSUES:
  list-issues [--status S] [--assignee ID] [--project ID] [--label ID] [-q TEXT]
  get-issue <ID>              Get issue by identifier (ZJ-17) or UUID
  create-issue --title T [--description D] [--status S] [--priority P] [--goal-id G]
  update-issue <ID> [--title T] [--status S] [--priority P] [--comment C]
  comment-issue <ID> --body TEXT [--reopen]
  checkout-issue <ID> [run-id]
  release-issue <ID>

GOALS:
  list-goals
  create-goal --title T [--level L] [--status S] [--description D]
  update-goal <ID> [--title T] [--status S]

PROJECTS:
  list-projects
  create-project --name N [--description D] [--status S] [--lead-agent ID]
  update-project <ID> [--name N] [--status S]

LABELS:
  list-labels
  create-label --name N --color C

AGENTS:
  create-agent --name N --model M [--role R] [--instructions-file /skills/AGENTS-X.md]
               Always uses copilot_local adapter (enforced, not overridable)
  list-agents | get-me | get-agent <ID> | wake-agent [reason]

DASHBOARD:
  dashboard | activity [--agent-id ID] | badges

APPROVALS:
  list-approvals [status] | create-approval --type T --payload JSON
  comment-approval <ID> --body TEXT

HEARTBEATS:
  list-runs [limit] | live-runs

OTHER:
  health | help

ERROR HANDLING (BLD-846):
  Non-2xx HTTP responses are surfaced to stderr with the structured
  error body, and the process exits with status 1 (transport errors
  use curl's exit code). Use `set -e` or check $? to detect failures.

  Example (409 from comment-issue when issue is locked):
    $ scripts/clip.sh comment-issue BLD-743 --body "..."
    ERROR 409 POST /issues/.../comments
    {"error":"Issue is checked out by another agent","holderRunId":"..."}
    $ echo $?
    1

ENVIRONMENT:
  PAPERCLIP_API_BASE         API base URL (default: http://localhost:3100)
  PAPERCLIP_AGENT_API_KEY    Agent API key (required)
  CLIP_COMPANY               Company UUID
  CLIP_AGENT                 Agent UUID
HELP
    ;;

  *)
    echo "Unknown command: $cmd. Run 'clip.sh help' for usage." >&2
    exit 1
    ;;
esac
