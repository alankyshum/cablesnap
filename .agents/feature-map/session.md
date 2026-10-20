---
id: session
title: Workout Session and Rest Timer
aliases: ["active workout", "logging sets", "rest timer", "workout timer", "finish workout", "session summary", "edit workout", "quick add session"]
routes: ["/day-session/[id]", "/session/[id]", "/session/detail/[id]", "/session/summary/[id]"]
paths: ["app/session/**", "app/day-session/**", "components/session/**", "hooks/useSessionActions.ts", "hooks/useSessionData.ts", "hooks/useSessionDetail.ts", "hooks/useSessionEdit.ts", "hooks/useSessionTimer.ts", "hooks/useRestTimer.ts", "hooks/rest-timer-state.ts", "hooks/rest-timer-feedback.ts", "hooks/useSetTimer.ts", "lib/rest.ts", "lib/rest-resolver.ts", "lib/session-display.ts", "lib/media/**", "lib/db/session-sets.ts", "lib/db/sessions.ts", "lib/db/day-session.ts"]
---
# Workout Session and Rest Timer

Live workout logging from the first set through rest timing, completion, summary, later review, and editing.

## Sub-features
- Exercise groups, sets, RPE/tempo/variants, notes, attachments, form clips and substitutions.
- Rest countdown/notifications, session pacing, PR celebration, summary and detail editing.

## How to get to it (user POV)
- Start or resume from **Workouts**, a template, or a program day.
- Finish the session for its summary; tap a recent/history item for session detail.

## Code entry points
- `app/session/[id].tsx` — active logger.
- `hooks/useRestTimer.ts` + `hooks/rest-timer-state.ts` — rest lifecycle.
- `app/session/summary/[id].tsx` and `app/session/detail/[id].tsx` — post-workout views.

## Gotchas
- Preserve timer behavior across backgrounding and notification permissions; set writes feed summary, PR, and history queries.
