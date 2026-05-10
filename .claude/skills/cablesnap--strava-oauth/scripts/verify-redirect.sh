#!/usr/bin/env bash
# Smoke check: Strava accepts our HTTPS redirect_uri.
# Expected: HTTP/2 302 (redirected to login). Bad: 400 (redirect_uri rejected).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

URL="https://www.strava.com/oauth/authorize?response_type=code&client_id=$STRAVA_APP_ID&redirect_uri=https%3A%2F%2Fstrava-proxy.alan200994.workers.dev%2Fcallback&scope=activity%3Awrite&approval_prompt=auto"

echo "GET $URL"
CODE=$("$CURL" -s -o /dev/null -w '%{http_code}' "$URL")
echo "HTTP $CODE"

if [[ "$CODE" == "302" ]]; then
  echo "PASS: Strava accepts redirect_uri."
  exit 0
else
  echo "FAIL: expected 302, got $CODE. Run get-app.sh and check 'domain' field."
  exit 1
fi
