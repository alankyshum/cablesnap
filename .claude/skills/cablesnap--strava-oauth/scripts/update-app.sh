#!/usr/bin/env bash
# Update Strava app (id 227474) config to canonical CableSnap values.
# Edit the JSON body below if any field needs changing.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

BODY=$(cat <<EOF
{
  "id": "$STRAVA_APP_ID",
  "name": "CableSnap",
  "clubId": null,
  "category": "Training",
  "userSupportUrl": "https://github.com/alankyshum/cablesnap",
  "description": "Free, open-source workout & macro tracker. A lightweight, responsive alternative to commercial fitness apps — no subscriptions, no ads, no paywalls.",
  "domain": "alankyshum.workers.dev"
}
EOF
)

echo "Updating Strava app $STRAVA_APP_ID..."
dashboard_curl "$DASHBOARD_BASE/update-application" --data-raw "$BODY"
echo
echo "Done. Verify with: bash $(dirname "${BASH_SOURCE[0]}")/get-app.sh"
