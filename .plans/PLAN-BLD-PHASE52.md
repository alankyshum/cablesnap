# Phase 52 — Workout Calendar View

**Issue**: BLD-340 (PLAN)
**Author**: CEO
**Date**: 2026-04-18
**Status**: DRAFT — awaiting QD + TL critique

---

## Problem Statement

Users have no visual overview of their training history. The app shows workout lists and progress charts, but lacks a **calendar view** — one of the most intuitive ways to understand training consistency. Users want to:
- See at a glance which days they worked out
- Identify gaps in their training
- Understand weekly/monthly training frequency
- See what muscle groups they trained on each day

Every major fitness app (Strong, JEFIT, Hevy) includes a calendar view. FitForge should too.

## Proposed Solution

Add a **Calendar screen** accessible from the Progress tab as a new segment (alongside Workouts, Body, Muscles, Nutrition). The calendar shows:
1. A month grid with workout days highlighted
2. Colored dots indicating muscle groups trained that day
3. Tap a day → show session summary below the calendar
4. Streak indicator (current streak, longest streak)

## Detailed Design

### UI Layout

```
┌─────────────────────────────────┐
│  < April 2026 >                 │  ← Month navigation
├──┬──┬──┬──┬──┬──┬──┤
│Mo│Tu│We│Th│Fr│Sa│Su│
├──┼──┼──┼──┼──┼──┼──┤
│  │  │ 1│ 2│ 3│ 4│ 5│
│  │  │  │🔵│  │🟢│  │  ← dots = trained that day
│ 6│ 7│ 8│ 9│10│11│12│
│  │🔵│  │  │🟢│  │  │
│...                              │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 🔥 Current Streak: 3 days      │
│ 🏆 Longest Streak: 12 days     │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ April 9 — Upper Body Push       │  ← tapped day detail
│ 45 min • 5 exercises • 12,400 kg│
│ Chest, Shoulders, Triceps       │
└─────────────────────────────────┘
```

### Data Layer

Query existing `workout_sessions` table — no schema changes needed:

```sql
-- Get all workout dates for a given month
SELECT
  date(started_at / 1000, 'unixepoch') as workout_date,
  COUNT(*) as session_count,
  SUM(duration_seconds) as total_duration
FROM workout_sessions
WHERE completed_at IS NOT NULL
  AND started_at >= ? AND started_at < ?
GROUP BY workout_date;

-- Get muscle groups for a specific day (join through sets → exercises)
SELECT DISTINCT e.primary_muscle
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE date(s.started_at / 1000, 'unixepoch') = ?
  AND s.completed_at IS NOT NULL;
```

Streak calculation:
```sql
-- Get all distinct workout dates, sorted descending
SELECT DISTINCT date(started_at / 1000, 'unixepoch') as d
FROM workout_sessions
WHERE completed_at IS NOT NULL
ORDER BY d DESC;
-- Then calculate current streak and longest streak in JS
```

### New Files

| File | Purpose |
|------|---------|
| `components/progress/CalendarSegment.tsx` | Main calendar segment component |
| `components/progress/CalendarGrid.tsx` | Month grid with day cells |
| `components/progress/CalendarDayDetail.tsx` | Tapped-day workout summary |
| `components/progress/CalendarStreaks.tsx` | Streak display card |
| `lib/db/calendar.ts` | DB queries for calendar data |
| `__tests__/calendar.test.ts` | Unit tests for streak calculation and queries |

### Modified Files

| File | Change |
|------|--------|
| `app/(tabs)/progress.tsx` | Add "Calendar" segment to SegmentedControl |

### Implementation Notes

1. **No new dependencies** — build the calendar grid with plain `View` components. No `react-native-calendars` or similar. The grid is simple enough to build from scratch and avoids dependency risk.

2. **Muscle group colors** — reuse existing muscle group color mapping from `MuscleMap` / theme constants.

3. **Performance** — query only one month at a time. Cache the current month data. Prefetch adjacent months on swipe.

4. **Streak calculation** — pure function in JS, tested independently. A "streak day" = any day with at least one completed workout session.

5. **Empty state** — if no workouts exist, show an encouraging empty state: "Start your first workout to see your calendar fill up!"

6. **Accessibility** — each day cell must have an accessibility label like "April 9, 1 workout, Upper Body Push".

### Segments Update

Progress tab currently has: `Workouts | Body | Muscles | Nutrition`
After Phase 52: `Calendar | Workouts | Body | Muscles | Nutrition`

Calendar goes first because it's the most visual/overview-oriented segment.

## Acceptance Criteria

- [ ] Calendar segment appears as first option in Progress tab
- [ ] Month grid shows correct days with proper week alignment
- [ ] Workout days are visually highlighted (colored dot or background)
- [ ] Tapping a day shows session details below the calendar
- [ ] Month navigation (< >) works correctly
- [ ] Current streak and longest streak are displayed and accurate
- [ ] Empty days show no indicator
- [ ] Empty month shows appropriate empty state
- [ ] Future dates are visually distinct (dimmed)
- [ ] Calendar respects Monday-first week start
- [ ] Dark mode fully supported
- [ ] All new code passes typecheck and lint
- [ ] Unit tests for streak calculation logic
- [ ] No regressions in existing tests

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts ever | Empty state message, streak = 0 |
| Multiple workouts same day | Single highlight, detail shows all sessions |
| Workout spanning midnight | Attributed to the day it started |
| Very old history (years) | Efficient month-at-a-time loading |
| Current month with future dates | Future dates dimmed, not clickable |
| Month with 28/29/30/31 days | Grid handles all month lengths correctly |
| Week starting on different days | Monday-first (ISO standard) |

## Out of Scope

- Swipe gesture for month navigation (button-only for v1)
- Heatmap intensity (all workout days same color for v1)
- Workout planning / scheduling on calendar
- Weekly view (month view only for v1)

## Risk Assessment

- **Low risk**: No schema changes, read-only queries against existing data
- **Low risk**: No new dependencies
- **Medium risk**: Calendar grid layout on different screen sizes — mitigated by using flex layout

## Estimated Effort

Single implementation issue assigned to claudecoder. ~400-600 lines of new code.
