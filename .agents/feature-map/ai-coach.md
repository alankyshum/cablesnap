---
id: ai-coach
title: AI Coach
aliases: ["coach", "chat", "AI workout", "workout draft", "OpenRouter", "API key", "gym photo"]
routes: ["/ai-coach", "/settings/ai-key"]
paths: ["app/(tabs)/ai-coach.tsx", "app/settings/ai-key.tsx", "components/coach/**", "hooks/useCoachSessions.ts", "hooks/useCoachWorkoutDraft.ts", "hooks/useCoachGymPhoto.ts", "hooks/useModelCatalog.ts", "hooks/useKeyStatus.ts", "lib/ai/**", "lib/coach-workout-draft.ts", "lib/coach-gym-photo.ts", "lib/db/coach.ts", "lib/db/coach-workout-drafts.ts"]
---
# AI Coach

User-supplied-key coaching chat that can inspect training context and propose workout templates, including gym-photo drafts.

## Sub-features
- Conversations/sidebar, model picker, tool calls, workout draft review/revision, API key status.

## How to get to it (user POV)
- Tap **AI Coach** in the tab bar.
- Configure the provider key from the coach prompt or **Settings → AI key**.

## Code entry points
- `app/(tabs)/ai-coach.tsx` + `components/coach/` — chat UI.
- `lib/ai/agent.ts` and `lib/ai/tools/` — model loop and authoritative tools.
- `hooks/useCoachWorkoutDraft.ts` — draft acceptance/revision.

## Gotchas
- Keys use secure storage and must never be logged; keep tool validation/authorization independent of presentation.
