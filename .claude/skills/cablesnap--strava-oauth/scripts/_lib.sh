#!/usr/bin/env bash
# Shared helpers for Strava dashboard scripts.
# Loads .env.local from the cablesnap repo root and validates required vars.
set -euo pipefail

# Resolve repo root (.claude/skills/cablesnap--strava-oauth/scripts/ → repo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: $name not set. Add it to $ENV_FILE (see .env.example)." >&2
    exit 1
  fi
}

# Constants — public, OK to hardcode.
STRAVA_APP_ID="227474"
STRAVA_OWNER_ID="22254762"
WORKER_BASE="https://strava-proxy.alan200994.workers.dev"
DASHBOARD_BASE="https://www.strava.com/api/next/data/athlete-applications"

# Wrap real curl to bypass any shell wrappers that truncate output.
CURL="/usr/bin/curl"

dashboard_curl() {
  require_var STRAVA_DASHBOARD_SESSION
  require_var STRAVA_DASHBOARD_CSRF
  "$CURL" -s \
    -H 'accept: application/json, text/plain, */*' \
    -H 'content-type: application/json' \
    -H 'origin: https://www.strava.com' \
    -H 'referer: https://www.strava.com/settings/api' \
    -H "x-csrf-token: $STRAVA_DASHBOARD_CSRF" \
    -H 'x-requested-with: XMLHttpRequest' \
    -b "_strava4_session=$STRAVA_DASHBOARD_SESSION" \
    "$@"
}
