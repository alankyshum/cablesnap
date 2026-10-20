---
id: workouts
title: Workouts Home and History
aliases: ["workouts tab", "home screen", "quick start", "workout history", "calendar", "recent workouts", "GTG"]
routes: ["/", "/history"]
paths: ["app/(tabs)/index.tsx", "app/history.tsx", "components/home/**", "components/history/**", "hooks/useHomeActions.ts", "hooks/useHistoryData.ts", "hooks/useHistoryFilters.ts", "lib/db/calendar.ts", "lib/db/weekly-summary.ts"]
---
# Workouts Home and History

The workouts landing page, quick-start actions, recovery/adherence summaries, recent sessions, and the full history calendar.

## Sub-features
- Quick start, scheduled workout, templates/program switcher, weekly summary and GTG quick-add.
- History filters, calendar/heatmap, and day details.

## How to get to it (user POV)
- Tap **Workouts** in the center tab; use a recent workout or home card.
- Open **History** from the recent-workouts area; deep links use `/history`.

## Code entry points
- `app/(tabs)/index.tsx` — home composition and navigation.
- `components/home/` — individual dashboard cards and data loader.
- `app/history.tsx` + `components/history/` — history screen and filters.

## Gotchas
- Starting must go through `guardedStartWorkout`; home focus refetch uses separate query keys.
