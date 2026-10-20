---
id: onboarding
title: Onboarding and Starter Recommendations
aliases: ["first run", "welcome", "setup", "beginner plan", "recommend workout", "starter templates"]
routes: ["/onboarding/recommend", "/onboarding/setup", "/onboarding/welcome"]
paths: ["app/onboarding/**", "components/onboarding/**", "lib/onboarding-context.ts", "lib/starter-templates.ts", "lib/seed.ts", "lib/seed-community.ts"]
---
# Onboarding and Starter Recommendations

First-run welcome, profile/training setup, and beginner or advanced starter recommendations.

## Sub-features
- Local-only privacy introduction, setup answers, recommended templates/programs, finish/seed flow.

## How to get to it (user POV)
- New installs open **Welcome → Setup → Recommendations** automatically.
- Routes can be deep-linked during development, but completion normally returns to Workouts.

## Code entry points
- `app/onboarding/` — three-step route flow.
- `components/onboarding/` — recommendation variants and finish hook.
- `lib/onboarding-context.ts` — temporary setup state.

## Gotchas
- Finish must be idempotent and seed starter data once; do not bypass first-run persistence.
