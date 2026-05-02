#!/usr/bin/env bash
# regression-smoke.sh — vision-pipeline trust-anchor smoke for BLD-480.
#
# Feeds a static "known-bad" PNG (the BLD-480 pre-fix MusclesWorkedCard
# cropping fixture) plus the daily audit prompt into the vision API, then
# asserts that the model's response contains at least one term from the
# canonical regex defined in /skills/AGENTS-ux-designer.md (QD#2):
#
#   crop | truncat | clip | maxHeight | cut off | MusclesWorkedCard | body-figure
#
# Exit codes:
#   0  smoke PASSED — vision pipeline still flags the known regression.
#   2  smoke FAILED — vision pipeline did NOT emit a matching finding;
#      the daily audit must NOT trust today's HEAD findings (alarm).
#   3  configuration error — fixture missing, no API key, malformed args.
#
# This is the *primary* trust anchor of the daily audit loop. If a vision
# model regression silently degrades the pipeline, this smoke is what
# catches it. See:
#   - BLD-959 (this script)
#   - BLD-941 / BLD-924 (daily audit operations)
#   - /skills/AGENTS-ux-designer.md § BLD-480 Trust Anchor (QD#1 + QD#2)
#
# Usage:
#   scripts/regression-smoke.sh [<fixture-png>]
#
# Env overrides (advanced):
#   AUDIT_PROMPT       Override the audit prompt fed to the model. Default
#                      mirrors the standard ux-designer prompt. Used by the
#                      self-test described in the BLD-959 PR (corrupting the
#                      prompt to confirm the smoke FAILS as designed).
#   REGRESSION_REGEX   Override the assertion regex. Default is the QD#2
#                      canonical regex. Case-insensitive.
#   API_PROVIDER       Force "anthropic" or "openai". Default: auto-detect
#                      (Anthropic preferred, OpenAI fallback).
#   FINDINGS_OUT       If set, write the model's raw response to this path
#                      for the audit bundle.

set -euo pipefail

##############################################################################
# Args + defaults
##############################################################################
FIXTURE="${1:-tests/fixtures/regression-catcher/bld-480-pre-fix.png}"

AUDIT_PROMPT_DEFAULT='You are a senior product designer reviewing a mobile fitness app screenshot. Identify ALL visual UX defects: cropping, truncation, clipping, overflow, contrast issues, alignment problems, missing elements. For each defect, state: (a) which UI element, (b) what is wrong, (c) severity (critical|major|minor). Be concrete and exhaustive — do not gloss over visual artifacts.'
AUDIT_PROMPT="${AUDIT_PROMPT:-$AUDIT_PROMPT_DEFAULT}"

REGRESSION_REGEX_DEFAULT='crop|truncat|clip|maxHeight|cut off|MusclesWorkedCard|body-figure'
REGRESSION_REGEX="${REGRESSION_REGEX:-$REGRESSION_REGEX_DEFAULT}"

##############################################################################
# Pre-flight
##############################################################################
if [[ ! -f "$FIXTURE" ]]; then
  echo "[regression-smoke] CONFIG ERROR: fixture not found: $FIXTURE" >&2
  echo "[regression-smoke] Run .github/workflows/regression-fixture-capture.yml" >&2
  echo "[regression-smoke] (workflow_dispatch) to (re)generate it." >&2
  exit 3
fi

# Auto-detect provider unless caller forces one
PROVIDER="${API_PROVIDER:-}"
if [[ -z "$PROVIDER" ]]; then
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    PROVIDER="anthropic"
  elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
    PROVIDER="openai"
  else
    echo "[regression-smoke] CONFIG ERROR: no vision API key set." >&2
    echo "[regression-smoke] Set ANTHROPIC_API_KEY or OPENAI_API_KEY." >&2
    exit 3
  fi
fi

case "$PROVIDER" in
  anthropic)
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
      echo "[regression-smoke] CONFIG ERROR: API_PROVIDER=anthropic but ANTHROPIC_API_KEY unset." >&2
      exit 3
    fi
    ;;
  openai)
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      echo "[regression-smoke] CONFIG ERROR: API_PROVIDER=openai but OPENAI_API_KEY unset." >&2
      exit 3
    fi
    ;;
  *)
    echo "[regression-smoke] CONFIG ERROR: unknown API_PROVIDER=$PROVIDER" >&2
    exit 3
    ;;
esac

for bin in curl python3 base64; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "[regression-smoke] CONFIG ERROR: missing dependency: $bin" >&2
    exit 3
  fi
done

##############################################################################
# Workdir
##############################################################################
WORK_DIR="$(mktemp -d -t regression-smoke.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

##############################################################################
# Encode fixture as base64 (handle GNU vs BSD)
##############################################################################
if base64 --help 2>&1 | grep -q 'GNU'; then
  B64="$(base64 -w 0 "$FIXTURE")"
else
  B64="$(base64 -i "$FIXTURE" | tr -d '\n')"
fi

##############################################################################
# Build provider payload + call
##############################################################################
RESPONSE_FILE="$WORK_DIR/response.json"
PAYLOAD_FILE="$WORK_DIR/payload.json"
HTTP_CODE=""

case "$PROVIDER" in
  anthropic)
    PROMPT="$AUDIT_PROMPT" python3 - "$B64" > "$PAYLOAD_FILE" <<'PY'
import json, os, sys
b64 = sys.argv[1]
prompt = os.environ["PROMPT"]
payload = {
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
            {"type": "text", "text": prompt},
        ],
    }],
}
json.dump(payload, sys.stdout)
PY

    HTTP_CODE="$(curl -sS -w '%{http_code}' -o "$RESPONSE_FILE" \
      -X POST https://api.anthropic.com/v1/messages \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "@$PAYLOAD_FILE" || true)"

    if [[ "$HTTP_CODE" != "200" ]]; then
      echo "[regression-smoke] vision API HTTP $HTTP_CODE" >&2
      cat "$RESPONSE_FILE" >&2 || true
      exit 3
    fi

    RESPONSE_TEXT="$(python3 -c '
import json, sys
d = json.load(sys.stdin)
print("\n".join(b.get("text","") for b in d.get("content",[]) if b.get("type")=="text"))
' < "$RESPONSE_FILE")"
    ;;

  openai)
    API_BASE="${OPENAI_API_BASE:-https://api.openai.com/v1}"
    ENDPOINT="${API_BASE%/}/chat/completions"

    PROMPT="$AUDIT_PROMPT" python3 - "$B64" > "$PAYLOAD_FILE" <<'PY'
import json, os, sys
b64 = sys.argv[1]
prompt = os.environ["PROMPT"]
data_url = f"data:image/png;base64,{b64}"
payload = {
    "model": "gpt-4o",
    "max_tokens": 1024,
    "messages": [{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
            {"type": "text", "text": prompt},
        ],
    }],
}
json.dump(payload, sys.stdout)
PY

    HTTP_CODE="$(curl -sS -w '%{http_code}' -o "$RESPONSE_FILE" \
      -X POST "$ENDPOINT" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "content-type: application/json" \
      -d "@$PAYLOAD_FILE" || true)"

    if [[ "$HTTP_CODE" != "200" ]]; then
      echo "[regression-smoke] vision API HTTP $HTTP_CODE" >&2
      cat "$RESPONSE_FILE" >&2 || true
      exit 3
    fi

    RESPONSE_TEXT="$(python3 -c '
import json, sys
d = json.load(sys.stdin)
choices = d.get("choices", [])
print(choices[0]["message"]["content"] if choices else "")
' < "$RESPONSE_FILE")"
    ;;
esac

##############################################################################
# Persist findings (optional, for audit bundle)
##############################################################################
if [[ -n "${FINDINGS_OUT:-}" ]]; then
  mkdir -p "$(dirname "$FINDINGS_OUT")"
  printf '%s\n' "$RESPONSE_TEXT" > "$FINDINGS_OUT"
fi

##############################################################################
# Assertion — case-insensitive regex match against the model response
##############################################################################
echo "[regression-smoke] fixture: $FIXTURE"
echo "[regression-smoke] provider: $PROVIDER"
echo "[regression-smoke] regex: $REGRESSION_REGEX"
echo "[regression-smoke] response (first 400 chars):"
printf '%s\n' "${RESPONSE_TEXT:0:400}"
echo "[regression-smoke] ---"

if printf '%s' "$RESPONSE_TEXT" | grep -Eqi "$REGRESSION_REGEX"; then
  echo "[regression-smoke] PASS — vision pipeline emitted a matching finding."
  exit 0
fi

cat >&2 <<EOF
[regression-smoke] 🚨 FAIL — vision pipeline did NOT emit a matching finding.
Pre-fix fixture should reproduce MusclesWorkedCard cropping, but zero terms
in the response matched the canonical regex:
  $REGRESSION_REGEX

Today's HEAD audit MUST NOT be trusted. Page @techlead and @ui-ux-designer.
EOF
exit 2
