---
id: tools
title: Workout Tools
aliases: ["workout tools", "wrench", "plate calculator", "plates", "barbell loading", "bar weight", "1RM calculator", "one rep max", "% 1RM table", "interval timer", "tabata", "EMOM", "AMRAP", "cable finder", "cable setup"]
routes: ["/tools", "/tools/cable-finder", "/tools/plates", "/tools/rm", "/tools/timer"]
paths: ["app/tools/**", "components/plates/**", "components/timer/**", "hooks/usePlateCalculator.ts", "hooks/useTimerEngine.ts", "hooks/useTimerAnimation.ts", "lib/plates.ts", "lib/rm.ts", "lib/timer.ts", "lib/cable-stack.ts", "lib/cable-variant.ts", "lib/db/cable-finder.ts"]
---
# Workout Tools

Standalone workout utilities: plate loading, estimated 1RM, interval timing, and cable setup/exercise lookup.

## Sub-features
- Hub (`/tools`): Cable Setup Finder link card, then inline Interval Timer, 1RM Calculator, Plate Calculator, each in an error boundary with "Tap to retry".
- Plate Calculator: one row "[Total] with bar [Bar]" — bar field accepts a custom value, followed by preset chips; bar remembered per unit. Shows per-side math, always-visible barbell diagram, color-swatched plate list, and "Total: X (bar + 2×side)"; rounds to nearest achievable load. Target ≤ bar shows "must exceed bar" / "no plates needed". `/tools/plates?weight=` prefills the target.
- 1RM Calculator: weight × reps → Epley, Brzycki, Lombardi, and average; % 1RM table where each row's weight icon opens the plate calculator; warning above 12 reps.
- Interval Timer: Tabata (work/rest/rounds), EMOM, AMRAP (round counter) with ring, phase colors, haptics, and audio cues.
- Cable Setup Finder: filter cable exercises by mount position and attachment (only attachments that exist); results grouped by primary muscle, tap to open exercise detail.

## How to get to it (user POV)
- On **Workouts**, tap the wrench ("Workout tools") in the header.
- Use the inline tools on the hub, or tap **Cable Setup Finder**. Dedicated routes exist for each tool.

## Code entry points
- `app/tools/index.tsx` — hub composition; `app/tools/_layout.tsx` — shared safe-area layout.
- `components/plates/PlateCalculatorContent.tsx` + `hooks/usePlateCalculator.ts` + `lib/plates.ts` — plate calculator.
- `app/tools/rm.tsx` (`RMCalculatorContent`) + `lib/rm.ts` — 1RM.
- `app/tools/timer.tsx` (`TimerContent`) + `components/timer/` + `hooks/useTimerEngine.ts` + `lib/timer.ts` — interval timer.
- `app/tools/cable-finder.tsx` + `lib/db/cable-finder.ts` — cable finder.

## Gotchas
- Unit (kg/lb) comes from body settings; bar presets and plate denominations follow it. Bar choice persists (debounced) in app setting `plate_calculator_bar_<unit>`; clearing the bar field falls back to the heaviest preset.
- The hub embeds the same exported content components as the dedicated routes; on the hub, the 1RM plate icon still navigates to `/tools/plates`.
