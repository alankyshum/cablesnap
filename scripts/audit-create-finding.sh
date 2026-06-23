#!/usr/bin/env bash
# audit-create-finding.sh — BLD-969 deterministic dedup wrapper for ux-designer.
#
# Background:
#   The ux-designer agent's prompt instructs it to dedup findings by
#   fingerprint before calling `clip.sh create-issue`. Because that's
#   LLM-enforced advice (not code-enforced), the agent occasionally creates
#   duplicates — concretely BLD-952 + BLD-956 on 2026-05-02 both carried
#   fingerprint cbe59de55e00 for the same workout-history defect.
#
#   This script makes the dedup deterministic. The agent calls THIS script
#   instead of `clip.sh create-issue` for every audit finding. It searches
#   for an open/in_review/in_progress issue containing the same
#   `Fingerprint: <hash>` line, and either comments on it ("recurrence")
#   or creates a new issue.
#
# Behaviour:
#   0. (BLD-1773) If --scenario is provided and the scenario appears in
#      `audit-isolation-harness-allowlist.json`, AND the finding title or
#      description matches the near-empty/content-missing regex, the finding
#      is suppressed: print `SUPPRESSED <scenario>` and exit 0. No issue is
#      created or commented on. This prevents isolation-harness scenarios from
#      re-filing daily false-positive "near-empty screen" findings whose
#      fingerprint changes per-commit (evading the regular dedup check).
#      Non-allowlisted scenarios that genuinely render near-empty are still
#      flagged normally — the suppression is allowlist-scoped, not a blanket mute.
#   1. Search project issues whose description contains "Fingerprint: <hash>".
#   2. For each candidate, fetch the full issue and confirm:
#        - description contains the EXACT case-sensitive substring
#          `Fingerprint: <hash>` (or `\`<hash>\`` formatted equivalents),
#        - status ∈ {todo, in_progress, in_review, backlog}
#          (i.e. NOT cancelled, NOT done — re-occurrence after fix
#          should re-open as a new issue per BLD-969 acceptance).
#   3. If a match is found → comment on the existing issue with
#      "Same finding reproduced in audit-YYYY-MM-DD-<commit> (run <id>)"
#      and print `RECURRENCE <identifier>` to stdout. Exit 0.
#   4. Otherwise → invoke `clip.sh create-issue` with the provided args
#      and print `CREATED <identifier>` to stdout. Exit 0.
#
# Why a wrapper rather than embedding into clip.sh?
#   `clip.sh` is a thin generic API helper used by every agent for many
#   purposes. The dedup behaviour is specific to the visual-audit pipeline
#   and needs to know the fingerprint convention. Keeping it in a dedicated
#   script also keeps the API helper's surface stable.
#
# Refs: BLD-969, BLD-952, BLD-956, BLD-939, BLD-1773.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: audit-create-finding.sh \
         --fingerprint <12-hex> \
         --title <issue-title> \
         --description-file <path> \
         --audit-tag <audit-YYYY-MM-DD-COMMIT> \
         --run-id <heartbeat-run-id> \
         [--scenario <scenario-name>] \
         [--priority <urgent|critical|high|medium|low|none>] \
         [--project-id <UUID>] \
         [--clip <path/to/clip.sh>] \
         [--allowlist <path/to/audit-isolation-harness-allowlist.json>]

Searches the active CableSnap project for an open issue containing the
exact line `Fingerprint: <hash>`. If one exists, posts a recurrence
comment on it. Otherwise creates a new issue from --description-file.

If --scenario is provided and that scenario is listed in the isolation-harness
allowlist (audit-isolation-harness-allowlist.json) and the finding title or
description matches "near-empty / content missing" keywords, the finding is
suppressed: no issue is created or commented on (BLD-1773).

Exit codes:
  0  Reused an existing issue (printed `RECURRENCE <ID>`),
     created a new one (printed `CREATED <ID>`),
     or suppressed an isolation-harness false-positive (printed `SUPPRESSED <scenario>`).
  2  Bad arguments / missing required flag.
  3  clip.sh failed unexpectedly.
EOF
  exit "${1:-2}"
}

# ---------- arg parsing ----------
FINGERPRINT=""
TITLE=""
DESC_FILE=""
AUDIT_TAG=""
RUN_ID=""
PRIORITY="medium"
SCENARIO=""
# Default to CableSnap project. Caller may override for tests.
PROJECT_ID="${PROJECT_ID:-c3d4e5f6-a7b8-9012-cdef-123456789012}"
CLIP="${CLIP:-$(cd "$(dirname "$0")" && pwd)/clip.sh}"
ALLOWLIST="${ALLOWLIST:-$(cd "$(dirname "$0")" && pwd)/audit-isolation-harness-allowlist.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fingerprint)      FINGERPRINT="$2"; shift 2;;
    --title)            TITLE="$2"; shift 2;;
    --description-file) DESC_FILE="$2"; shift 2;;
    --audit-tag)        AUDIT_TAG="$2"; shift 2;;
    --run-id)           RUN_ID="$2"; shift 2;;
    --scenario)         SCENARIO="$2"; shift 2;;
    --priority)         PRIORITY="$2"; shift 2;;
    --project-id)       PROJECT_ID="$2"; shift 2;;
    --clip)             CLIP="$2"; shift 2;;
    --allowlist)        ALLOWLIST="$2"; shift 2;;
    -h|--help)          usage 0;;
    *) echo "Unknown option: $1" >&2; usage 2;;
  esac
done

# ---------- validation ----------
[[ -n "$FINGERPRINT" ]] || { echo "missing --fingerprint" >&2; usage 2; }
[[ -n "$TITLE"        ]] || { echo "missing --title" >&2; usage 2; }
[[ -n "$DESC_FILE"    ]] || { echo "missing --description-file" >&2; usage 2; }
[[ -n "$AUDIT_TAG"    ]] || { echo "missing --audit-tag" >&2; usage 2; }
[[ -n "$RUN_ID"       ]] || { echo "missing --run-id" >&2; usage 2; }
[[ -f "$DESC_FILE"    ]] || { echo "description file not found: $DESC_FILE" >&2; exit 2; }

# Exact-match dedup, per BLD-969 AC: case-sensitive on the fingerprint hash.
# Validate the hash looks like a hex slug to avoid accidentally matching
# unrelated substrings (e.g. a description that says "Fingerprint: <pending>").
if ! [[ "$FINGERPRINT" =~ ^[0-9a-fA-F]{6,64}$ ]]; then
  echo "fingerprint must be 6-64 hex chars (got: '$FINGERPRINT')" >&2
  exit 2
fi

# ---------- isolation-harness suppression (BLD-1773) ----------
# If --scenario is provided and the scenario is listed in the isolation-harness
# allowlist, AND the finding title or description body indicates a "near-empty /
# content missing" defect, suppress the finding entirely. This prevents
# dev-only harnesses (e.g. stack-marker) that intentionally render sparse
# from filing daily false-positive audit findings whose fingerprint changes
# per-commit (evading the regular dedup check).
#
# Regex for near-empty/content-missing findings (case-insensitive). Covers the
# typical ux-designer phrasings seen in BLD-1667 and BLD-1766:
#   "near-empty", "nearly empty", "empty screen", "content missing",
#   "content absent", "blank screen", "mostly blank", "mostly empty",
#   "sparse content", "no content", "only.*blank", "blank.*only",
#   "no visible content", "appears empty", "looks empty", "almost empty".
NEAR_EMPTY_RE='near.empty|nearly empty|empty screen|content missing|content absent|blank screen|mostly blank|mostly empty|sparse content|no content|no visible content|appears empty|looks empty|almost empty|only.*blank|blank.*only'

is_isolation_harness_scenario() {
  local scenario="$1"
  local allowlist_file="$2"

  # If allowlist doesn't exist, silently treat as not-allowlisted. This is
  # intentionally inert (no crash) per the edge-case requirements (BLD-1773).
  if [[ ! -f "$allowlist_file" ]]; then
    return 1
  fi

  # Use grep to check if the scenario name appears in the JSON allowlist
  # under the "scenario" key. We match the exact value to avoid a scenario
  # named "stack-marker-extra" matching the "stack-marker" entry.
  if grep -qE '"scenario"[[:space:]]*:[[:space:]]*"'"$scenario"'"' "$allowlist_file"; then
    return 0
  fi
  return 1
}

is_near_empty_finding() {
  local title="$1"
  local desc_file="$2"

  # Check the title first (fast path).
  if echo "$title" | grep -qiE "$NEAR_EMPTY_RE"; then
    return 0
  fi

  # Check the description file body.
  if grep -qiE "$NEAR_EMPTY_RE" "$desc_file" 2>/dev/null; then
    return 0
  fi
  return 1
}

if [[ -n "$SCENARIO" ]]; then
  if is_isolation_harness_scenario "$SCENARIO" "$ALLOWLIST"; then
    if is_near_empty_finding "$TITLE" "$DESC_FILE"; then
      echo "SUPPRESSED $SCENARIO"
      exit 0
    fi
  fi
fi

# Statuses considered "open" for dedup purposes. Cancelled/done MUST be
# excluded so a re-occurrence after a fix files a fresh ticket (AC#3).
is_open_status() {
  case "$1" in
    todo|in_progress|in_review|backlog) return 0;;
    *) return 1;;
  esac
}

# ---------- search for existing issue ----------
# Free-text search across the project. The fingerprint hex is unique enough
# that this returns a tiny candidate set (typically 0-2 issues). We then
# fetch each candidate and verify the literal `Fingerprint: <hash>` line
# is present in the description, plus that the status is open.
SEARCH_OUT="$(mktemp)"
trap 'rm -f "$SEARCH_OUT"' EXIT

# We search by the bare fingerprint hash (12+ hex chars) rather than
# `Fingerprint: <hash>` because clip.sh's `-q` value goes straight into
# a URL query string and currently does NOT URL-encode spaces — they
# break curl. The hex slug is unique enough on its own; the description
# verification step below confirms an exact `Fingerprint: <hash>` line.
if ! "$CLIP" list-issues --project "$PROJECT_ID" -q "$FINGERPRINT" \
       > "$SEARCH_OUT" 2>/dev/null; then
  echo "audit-create-finding: clip.sh list-issues failed" >&2
  exit 3
fi

# list-issues prints jq-projected one-object-per-line `{identifier, title, status, priority}`.
# Extract identifiers regardless of formatting (multi-line or single-line jq output).
CANDIDATES="$(grep -oE '"identifier"[[:space:]]*:[[:space:]]*"[A-Z]+-[0-9]+"' "$SEARCH_OUT" \
                | sed -E 's/.*"([A-Z]+-[0-9]+)".*/\1/' \
                | awk '!seen[$0]++' \
                || true)"

EXISTING=""
if [[ -n "$CANDIDATES" ]]; then
  while IFS= read -r ident; do
    [[ -z "$ident" ]] && continue
    DETAIL="$("$CLIP" get-issue "$ident" 2>/dev/null || true)"
    [[ -z "$DETAIL" ]] && continue

    # Status check.
    STATUS="$(printf '%s' "$DETAIL" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[a-z_]+"' \
                | head -1 | sed -E 's/.*"([a-z_]+)"$/\1/')"
    is_open_status "$STATUS" || continue

    # Description check — exact, case-sensitive `Fingerprint: <hash>` token
    # (literal hash, no regex specials in valid hex). We must enforce a
    # token boundary on the trailing side so a short fingerprint does NOT
    # prefix-match a longer one (e.g. `Fingerprint: aabbccddeeff` must NOT
    # match an existing description containing `Fingerprint: aabbccddeeff0011`).
    # Both accepted formats are checked:
    #   - plain:  `Fingerprint: <hash>`     followed by a non-hex char
    #   - bold:   `Fingerprint**: \`<hash>\`` (backtick is the boundary)
    # The hash is constrained to [0-9a-fA-F]+ by --fingerprint validation
    # so it is regex-safe to inline.
    DESC="$(printf '%s' "$DETAIL" | grep -oE '"description"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' || true)"
    if printf '%s' "$DESC" | grep -Eq "Fingerprint: ${FINGERPRINT}([^0-9a-fA-F]|\$)" \
       || printf '%s' "$DESC" | grep -F -q "Fingerprint**: \`$FINGERPRINT\`"; then
      EXISTING="$ident"
      break
    fi
  done <<< "$CANDIDATES"
fi

# ---------- recurrence path ----------
if [[ -n "$EXISTING" ]]; then
  COMMENT="Same finding reproduced in ${AUDIT_TAG} (run ${RUN_ID})"
  if ! "$CLIP" comment-issue "$EXISTING" --body "$COMMENT" >/dev/null; then
    echo "audit-create-finding: failed to post recurrence comment on $EXISTING" >&2
    exit 3
  fi
  echo "RECURRENCE $EXISTING"
  exit 0
fi

# ---------- create path ----------
DESC_BODY="$(cat "$DESC_FILE")"
CREATE_OUT="$(mktemp)"
# shellcheck disable=SC2064 — capture EXISTING value of trap path now.
trap 'rm -f "$SEARCH_OUT" "$CREATE_OUT"' EXIT

if ! "$CLIP" create-issue \
       --title "$TITLE" \
       --description "$DESC_BODY" \
       --priority "$PRIORITY" \
       --project-id "$PROJECT_ID" \
       > "$CREATE_OUT" 2>&1; then
  echo "audit-create-finding: clip.sh create-issue failed" >&2
  cat "$CREATE_OUT" >&2 || true
  exit 3
fi

NEW_ID="$(grep -oE '"identifier"[[:space:]]*:[[:space:]]*"[A-Z]+-[0-9]+"' "$CREATE_OUT" \
            | head -1 | sed -E 's/.*"([A-Z]+-[0-9]+)".*/\1/')"

if [[ -z "$NEW_ID" ]]; then
  echo "audit-create-finding: created issue but could not parse identifier from response:" >&2
  cat "$CREATE_OUT" >&2
  exit 3
fi

echo "CREATED $NEW_ID"
exit 0
