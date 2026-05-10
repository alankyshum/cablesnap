#!/usr/bin/env bash
# Print current Strava app (id 227474) configuration.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

NOW=$(date +%s)
WEEK_AGO=$((NOW - 604800))
TWELVE_AGO=$((NOW - 43200))

dashboard_curl "$DASHBOARD_BASE/get-athlete-applications" \
  --data-raw "{\"ownerId\":\"$STRAVA_OWNER_ID\",\"system\":\"active\",\"overallOperation\":\"application_request\",\"nonUploadOperation\":\"non_upload_request\",\"fifteenMinuteDuration\":900,\"twentyFourHourDuration\":86400,\"endTimestamp\":$NOW,\"oneWeekAgo\":$WEEK_AGO,\"twelveHoursAgo\":$TWELVE_AGO}" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for a in d.get('applications', []):
    print(json.dumps({k: a.get(k) for k in ['id','name','domain','category','description','userSupportUrl','clubId']}, indent=2, ensure_ascii=False))
"
