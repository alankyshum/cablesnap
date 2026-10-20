---
id: progress
title: Progress, Records, and Achievements
aliases: ["progress tab", "PRs", "personal records", "achievements", "streaks", "muscle volume", "monthly report", "strength levels"]
routes: ["/progress", "/progress/achievements", "/progress/records"]
paths: ["app/(tabs)/progress.tsx", "app/progress/**", "components/progress/**", "components/achievements/**", "components/muscle-volume/**", "components/MuscleVolumeSegment.tsx", "components/MuscleMap.tsx", "components/WorkoutHeatmap.tsx", "components/weekly-summary/**", "hooks/usePRDashboard.ts", "hooks/useAchievements.ts", "hooks/useMuscleVolume.ts", "hooks/useMonthlyReport.ts", "hooks/useWeeklySummary.ts", "lib/achievements.ts", "lib/volume-landmarks.ts", "lib/db/pr-dashboard.ts", "lib/db/achievements.ts", "lib/db/monthly-report.ts"]
---
# Progress, Records, and Achievements

Workout, body, muscle-volume, nutrition, and monthly trends plus PR dashboards and achievement badges.

## Sub-features
- Progress segments, charts, calendar/streaks, records, strength levels, achievements and monthly reports.

## How to get to it (user POV)
- Tap **Progress**, then select Workouts, Body, Muscles, Nutrition, or Monthly.
- Open records/achievements from progress cards and links.

## Code entry points
- `app/(tabs)/progress.tsx` — segment router.
- `components/progress/` — segment cards and charts.
- `app/progress/records.tsx` and `achievements.tsx` — drill-down screens.

## Gotchas
- Segment can arrive through route params; PRs and charts may be variant/unit scoped.
