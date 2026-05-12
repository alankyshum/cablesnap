#!/usr/bin/env bash
# post-merge-gate-verdict.sh — Post GitHub sentinel for merge-gate.sh
#
# Posts a MERGE-GATE: <role> <verdict> sentinel comment on the GitHub PR
# linked to a Paperclip issue. Does NOT write to Paperclip; reviewer agents
# continue to post their authoritative verdict via the Paperclip issue-comment
# endpoint (clip.sh's read-write path). This helper is GitHub-only.
#
# Usage:
#   post-merge-gate-verdict.sh <role> <verdict> <issue-identifier>
#
# Arguments:
#   <role>             techlead | quality-director
#   <verdict>          APPROVE | PASS | BLOCK | FAIL | REQUEST_CHANGES
#   <issue-identifier> Paperclip identifier, e.g. BLD-1163
#
# Verdict normalisation (done inside helper):
#   APPROVE | PASS             → APPROVE
#   BLOCK | FAIL | REQUEST_CHANGES → BLOCK
#
# Environment:
#   MERGE_GATE_REPO      Override target repo (default: alankyshum/cablesnap)
#                        Set this in tests only.
#   MERGE_GATE_CLIP_CMD  Override clip.sh get-issue invocation for tests.
#                        Value is the script to run (without the "get-issue" arg);
#                        the helper appends the issue identifier as the sole arg.
#
# Exit codes:
#   0 — completed (including non-fatal skips and gh-failure paths)
#   1 — unknown role or unknown verdict (usage error)
#
# Trace log: /tmp/merge-gate-verdict-trace.log (append-only, TSV)
# Columns: iso8601-utc  role  verdict-raw  verdict-normalized  issue  pr-or-none  outcome  error-msg

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────
REPO="${MERGE_GATE_REPO:-alankyshum/cablesnap}"
TRACE_LOG="/tmp/merge-gate-verdict-trace.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Allow full-command override for tests; otherwise use clip.sh in same dir
CLIP_CMD="${MERGE_GATE_CLIP_CMD:-}"
# Allow skills dir override for tests (default: /skills)
_SKILLS_DIR="${MERGE_GATE_SKILLS_DIR:-/skills}"

# ─── Trace state (defaults ensure crash row is always written) ────────
_role=""
_verdict_raw=""
_verdict_norm=""
_issue=""
_pr="none"
_outcome="crash"
_errmsg=""

_ts() { date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%FT%TZ"; }

_write_trace() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(_ts)" "$_role" "$_verdict_raw" "$_verdict_norm" \
    "$_issue" "$_pr" "$_outcome" "$_errmsg" \
    >> "$TRACE_LOG"
}

trap '_write_trace' EXIT

# ─── Argument parsing ────────────────────────────────────────────────
if [[ $# -ne 3 ]]; then
  echo "Usage: post-merge-gate-verdict.sh <role> <verdict> <issue-identifier>" >&2
  echo "Example: post-merge-gate-verdict.sh techlead APPROVE BLD-1163" >&2
  _outcome="error-unknown-verdict"
  _errmsg="wrong-arg-count:$#"
  exit 1
fi

_role="$1"
_verdict_raw="$2"
_issue="$3"

# ─── Role validation ─────────────────────────────────────────────────
case "$_role" in
  techlead|quality-director) ;;
  *)
    echo "error: unknown role '$_role' — expected techlead or quality-director" >&2
    _outcome="error-unknown-verdict"
    _errmsg="unknown-role:$_role"
    exit 1
    ;;
esac

# ─── Verdict normalisation ───────────────────────────────────────────
case "$_verdict_raw" in
  APPROVE|PASS)
    _verdict_norm="APPROVE"
    ;;
  BLOCK|FAIL|REQUEST_CHANGES)
    _verdict_norm="BLOCK"
    ;;
  *)
    echo "error: unknown verdict '$_verdict_raw' — expected APPROVE|PASS|BLOCK|FAIL|REQUEST_CHANGES" >&2
    _outcome="error-unknown-verdict"
    _errmsg="unknown-verdict:$_verdict_raw"
    exit 1
    ;;
esac

# ─── Clip helper ─────────────────────────────────────────────────────
_run_clip_get_issue() {
  local issue_id="$1"
  if [[ -n "$CLIP_CMD" ]]; then
    $CLIP_CMD "$issue_id" 2>/dev/null
  elif command -v clip.sh >/dev/null 2>&1; then
    clip.sh get-issue "$issue_id" 2>/dev/null
  elif [[ -f "${_SKILLS_DIR}/scripts/clip.sh" ]]; then
    # Use `bash` explicitly — the file may not be executable in this environment
    bash "${_SKILLS_DIR}/scripts/clip.sh" get-issue "$issue_id" 2>/dev/null
  elif [[ -f "$(dirname "$0")/clip.sh" ]]; then
    bash "$(dirname "$0")/clip.sh" get-issue "$issue_id" 2>/dev/null
  else
    return 1
  fi
}

# ─── PR resolution ───────────────────────────────────────────────────
# Step 1: Authoritative Paperclip linkage (best-effort; fall through on failure)
_pr_number=""
_paperclip_candidates=()

if issue_json=$(_run_clip_get_issue "$_issue" 2>/dev/null); then
  # Walk relatedWork.outbound[].sources + relatedWork.inbound[].sources + comments
  while IFS= read -r ref_text; do
    if [[ "$ref_text" =~ https://github\.com/${REPO}/pull/([0-9]+) ]]; then
      _paperclip_candidates+=("${BASH_REMATCH[1]}")
    elif [[ "$ref_text" =~ PR\ \#([0-9]+) ]]; then
      _paperclip_candidates+=("${BASH_REMATCH[1]}")
    fi
  done < <(echo "$issue_json" | jq -r '
    [
      (.relatedWork.outbound // [])[] | (.sources // [])[] | (.matchedText // "")
    ] +
    [
      (.relatedWork.inbound // [])[] | (.sources // [])[] | (.matchedText // "")
    ] +
    [
      (.comments // [])[] | .body // ""
    ]
    | .[]
  ' 2>/dev/null || true)

  # Deduplicate
  if [[ ${#_paperclip_candidates[@]} -gt 0 ]]; then
    mapfile -t _paperclip_candidates < <(printf '%s\n' "${_paperclip_candidates[@]}" | sort -u)
  fi

  if [[ ${#_paperclip_candidates[@]} -eq 1 ]]; then
    _state=$(gh pr view "${_paperclip_candidates[0]}" --repo "$REPO" \
      --json state --jq '.state' 2>/dev/null || true)
    if echo "$_state" | grep -qi "open"; then
      _pr_number="${_paperclip_candidates[0]}"
    fi
  elif [[ ${#_paperclip_candidates[@]} -ge 2 ]]; then
    _pr="none"
    _outcome="skip-ambiguous-${#_paperclip_candidates[@]}-candidates"
    echo "skip: ambiguous — ${#_paperclip_candidates[@]} PR candidates from Paperclip for $_issue" >&2
    exit 0
  fi
fi

# Step 2: GitHub search fallback
if [[ -z "$_pr_number" ]]; then
  _gh_candidates=()
  while IFS= read -r num; do
    [[ -n "$num" ]] && _gh_candidates+=("$num")
  done < <(gh pr list --repo "$REPO" --search "$_issue in:body" --state open \
    --json number,createdAt,headRefName,isDraft 2>/dev/null \
    | jq -r '.[].number' 2>/dev/null || true)

  if [[ ${#_gh_candidates[@]} -eq 1 ]]; then
    _pr_number="${_gh_candidates[0]}"
  elif [[ ${#_gh_candidates[@]} -ge 2 ]]; then
    _pr="none"
    _outcome="skip-ambiguous-${#_gh_candidates[@]}-candidates"
    echo "skip: ambiguous — ${#_gh_candidates[@]} open PRs match '$_issue' in:body" >&2
    exit 0
  fi
fi

# No PR found
if [[ -z "$_pr_number" ]]; then
  _pr="none"
  _outcome="skip-no-pr"
  echo "skip: no open PR found for $_issue" >&2
  exit 0
fi

_pr="$_pr_number"

# ─── Idempotency check ───────────────────────────────────────────────
# Fetch the first line of each comment body, newest-first.
# Using jq to extract first line per comment ensures multiline bodies
# cannot smuggle a MERGE-GATE token via a later line.
_existing_verdict=""
while IFS= read -r _first_line; do
  if [[ "$_first_line" =~ ^MERGE-GATE:\ (techlead|quality-director)\ (APPROVE|BLOCK)$ ]]; then
    if [[ "${BASH_REMATCH[1]}" == "$_role" ]]; then
      _existing_verdict="${BASH_REMATCH[2]}"
      break
    fi
  fi
done < <(gh pr view "$_pr_number" --repo "$REPO" --json comments \
  --jq '.comments | sort_by(.createdAt) | reverse | .[].body | split("\n")[0]' 2>/dev/null || true)

if [[ -n "$_existing_verdict" ]] && [[ "$_existing_verdict" == "$_verdict_norm" ]]; then
  _outcome="skip-idempotent"
  echo "skip: idempotent — PR #$_pr_number already has MERGE-GATE: $_role $_verdict_norm" >&2
  exit 0
fi

_outcome=$([[ -n "$_existing_verdict" ]] && echo "posted-flip" || echo "posted-first")

# ─── Post sentinel ───────────────────────────────────────────────────
_sentinel_body="MERGE-GATE: $_role $_verdict_norm

Posted by post-merge-gate-verdict.sh on behalf of @${_role}.
Full verdict and rationale: Paperclip issue ${_issue}."

_gh_stderr_file=$(mktemp)
if ! gh pr comment "$_pr_number" --repo "$REPO" --body "$_sentinel_body" 2>"$_gh_stderr_file"; then
  _errmsg=$(tr '\n' ' ' < "$_gh_stderr_file")
  rm -f "$_gh_stderr_file"
  _outcome="error-gh-failure"
  echo "warning: gh pr comment failed — $_errmsg" >&2
  exit 0
fi
rm -f "$_gh_stderr_file"

echo "posted: MERGE-GATE: $_role $_verdict_norm on PR #$_pr_number ($_outcome)"
