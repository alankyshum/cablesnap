#!/usr/bin/env bash
# Smoke check: worker /callback bounces to cablesnap:// deep link with all params.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

URL="$WORKER_BASE/callback?code=abc&state=xyz&scope=activity:write"
echo "GET $URL"
# Use GET (not HEAD) — worker rejects HEAD with 405. Capture headers, discard body.
LOC=$("$CURL" -s -D - -o /dev/null "$URL" | awk -F': ' 'tolower($1)=="location"{sub(/\r$/,"",$2); print $2}')
echo "Location: $LOC"

if [[ "$LOC" == "cablesnap://strava-callback?code=abc&state=xyz&scope=activity%3Awrite" ]]; then
  echo "PASS"
  exit 0
else
  echo "FAIL: unexpected Location header. Worker may need redeploy: bash deploy-worker.sh"
  exit 1
fi
