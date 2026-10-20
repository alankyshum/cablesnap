---
id: integrations
title: Strava Integration and Sharing
aliases: ["Strava", "connect Strava", "sync workout", "share workout", "activity upload", "Strava callback"]
routes: ["/strava-callback"]
paths: ["app/strava-callback.tsx", "components/share/**", "components/ShareCard.tsx", "components/ShareSheet.tsx", "hooks/useSessionShareData.ts", "lib/strava.ts", "lib/strava-callback.ts", "lib/strava-error.ts", "lib/strava-telemetry.ts", "lib/share-payload.ts", "lib/db/strava.ts"]
---
# Strava Integration and Sharing

Connect Strava, return through OAuth, upload completed activities, and render native/social workout share cards.

## Sub-features
- OAuth callback/error handling, activity upload status, session/monthly/achievement share cards.

## How to get to it (user POV)
- Open **Settings → Integrations → Connect Strava**; the browser returns to `/strava-callback`.
- Share from session detail/summary or report cards.

## Code entry points
- `app/strava-callback.tsx` + `lib/strava-callback.ts` — OAuth return.
- `lib/strava.ts` and `lib/db/strava.ts` — connection/upload state.
- `components/share/` — visual share payloads.

## Gotchas
- OAuth state and tokens are security boundaries; callback failures must remain visible and retryable.
