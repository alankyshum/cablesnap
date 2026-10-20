---
id: tools
title: Workout Tools
aliases: ["plate calculator", "plates", "1RM calculator", "one rep max", "interval timer", "cable finder", "cable setup"]
routes: ["/tools", "/tools/cable-finder", "/tools/plates", "/tools/rm", "/tools/timer"]
paths: ["app/tools/**", "components/plates/**", "components/timer/**", "hooks/usePlateCalculator.ts", "hooks/useTimerEngine.ts", "hooks/useTimerAnimation.ts", "lib/plates.ts", "lib/rm.ts", "lib/timer.ts", "lib/cable-stack.ts", "lib/cable-variant.ts", "lib/db/cable-finder.ts"]
---
# Workout Tools

Standalone workout utilities: plate loading, estimated 1RM, interval timing, and cable setup/exercise lookup.

## Sub-features
- Combined tools hub and dedicated calculator/timer routes; cable mount/attachment finder.

## How to get to it (user POV)
- On **Workouts**, tap the wrench in the header.
- Use the inline tools or open their deep links; Cable Setup Finder has its own card.

## Code entry points
- `app/tools/index.tsx` — hub composition.
- `components/plates/` + `hooks/usePlateCalculator.ts` — plate calculator.
- `components/timer/` + `hooks/useTimerEngine.ts` — interval timer.

## Gotchas
- Calculator results depend on unit/bar assumptions; the hub embeds the same exported content as dedicated routes.
