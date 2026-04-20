# Phase 52 — Workout Calendar View

**Issue**: BLD-340 (PLAN)
**Author**: CEO
**Date**: 2026-04-18
**Status**: REVISED — addressing QD + TL feedback

---

## Problem Statement

Users have no visual overview of their training history. The app shows workout lists and progress charts, but lacks a **calendar view** — one of the most intuitive ways to understand training consistency. Users want to:
- See at a glance which days they worked out
- Identify gaps in their training
- Understand weekly/monthly training frequency
- See what muscle groups they trained on each day

Every major fitness app (Strong, JEFIT, Hevy) includes a calendar view. CableSnap should too.

## Proposed Solution

Add a **Calendar/List view toggle** inside the existing Workouts segment of the Progress tab. This avoids adding a 5th segment to the SegmentedControl (which would cause cramped touch targets). The calendar shows:
1. A month grid with a single filled dot on workout days (no color-coded muscle group dots)
2. Tap a day → show session summary with muscle groups in the detail section below
3. Streak indicator (current streak, longest streak)
4. Today indicator and Today navigation button

## Detailed Design

### UI Layout

The Workouts segment gains a toggle button (list icon / calendar icon) in the top-right corner. Default view remains the existing workout list. Tapping the calendar icon switches to:

```
┌─────────────────────────────────┐
│  < April 2026 >        [Today] │  ← Month nav + Today button
├──┬──┬──┬──┬──┬──┬──┤
│Su│Mo│Tu│We│Th│Fr│Sa│            ← Week start follows device locale
├──┼──┼──┼──┼──┼──┼──┤
│  │  │ 1│ 2│ 3│ 4│ 5│
│  │  │  │ ●│  │ ●│  │           ← ● = trained that day (single dot)
│ 6│ 7│ 8│ 9│10│11│12│
│  │ ●│  │  │ ●│  │  │
│...                    [18]     │  ← today: bold ring outline
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Current Streak: 3 days          │
│ Longest Streak: 12 days         │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ April 9 — Upper Body Push       │  ← tapped day detail
│ 45 min • 5 exercises • 12,400 kg│
│ Chest, Shoulders, Triceps       │  ← muscle groups as text labels
└─────────────────────────────────┘
```

### Key UX Decisions (from QD review)

1. **View toggle, not 5th segment**: Calendar is a view mode of Workouts, not a separate segment. This preserves 4-segment SegmentedControl and avoids touch target issues.

2. **Single dot indicator**: Workout days get a single filled dot (theme accent color). No color-coded muscle group dots — this eliminates the a11y violation where color was the sole indicator. Muscle groups are shown as text labels in the tap-to-expand detail section.

3. **Today indicator**: Current day has a bold ring/outline (distinct from workout dot). Always visually identifiable regardless of whether a workout was logged.

4. **Today button**: A "Today" button in the header bar jumps back to the current month from any distant month.

5. **Device locale week start**: Week start day follows `expo-localization` / device locale (Sunday-first in US/CA/JP, Monday-first in EU, etc.). Not hardcoded.

6. **Default view**: List view remains default. Calendar view preference is NOT persisted — users return to list on re-open (simpler for v1).

### Touch Targets

- **Minimum cell size**: 48dp × 48dp (WCAG/SKILL minimum)
- **On 320pt-wide screens (iPhone SE)**: (320 - 32 padding) / 7 = 41pt per cell → **use full-width grid with no horizontal padding on the grid itself** (only outer container has 16px padding). This gives (320 - 0) / 7 = 45.7pt. Still tight — add `hitSlop={{ top: 4, bottom: 4 }}` to reach effective 48dp.
- **Cell height**: Fixed at 48dp minimum, with content centered vertically.

### Accessibility

- **Day cells**: `accessibilityRole="button"`, `accessibilityState={{ selected: isSelectedDay }}`, `accessibilityLabel="April 9, 1 workout session, Upper Body Push"` (or "April 10, no workout" for empty days)
- **Month navigation**: `accessibilityRole="button"`, `accessibilityLabel="Previous month"` / `"Next month"`
- **Today button**: `accessibilityRole="button"`, `accessibilityLabel="Go to current month"`
- **Streak display**: `accessibilityLabel="Current training streak: 3 days. Longest streak: 12 days"` (no emoji in a11y labels)
- **Day detail section**: `accessibilityLiveRegion="polite"` so screen readers announce content changes on day tap
- **Future dates**: `accessibilityState={{ disabled: true }}`, not tappable

### Data Layer

Query existing `workout_sessions` table — no schema changes needed.

All date queries use `'localtime'` modifier to respect user timezone:

```sql
-- Get all workout dates for a given month
SELECT
  date(started_at / 1000, 'unixepoch', 'localtime') as workout_date,
  COUNT(*) as session_count,
  SUM(duration_seconds) as total_duration
FROM workout_sessions
WHERE completed_at IS NOT NULL
  AND started_at >= ? AND started_at < ?
GROUP BY workout_date;
```

Muscle groups for a tapped day (note: `primary_muscles` is a JSON array column):
```sql
SELECT e.primary_muscles
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE date(s.started_at / 1000, 'unixepoch', 'localtime') = ?
  AND s.completed_at IS NOT NULL;
```
Then in JS: `JSON.parse()` each row's `primary_muscles`, flatten all arrays, deduplicate with `[...new Set(flat)]`.

Streak calculation (bounded to last 365 days for current streak):
```sql
SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') as d
FROM workout_sessions
WHERE completed_at IS NOT NULL
  AND started_at >= ?  -- bound: 365 days ago in epoch ms
ORDER BY d DESC;
```
Then calculate current streak and longest streak as pure JS functions (tested independently).

### New Files

| File | Purpose |
|------|---------|
| `components/progress/CalendarView.tsx` | Main calendar view component (replaces CalendarSegment) |
| `components/progress/CalendarGrid.tsx` | Month grid with day cells |
| `components/progress/CalendarDayDetail.tsx` | Tapped-day workout summary |
| `components/progress/CalendarStreaks.tsx` | Streak display card |
| `lib/db/calendar.ts` | DB queries for calendar data |
| `__tests__/calendar.test.ts` | Unit tests for streak calculation and date utilities |

### Modified Files

| File | Change |
|------|--------|
| `components/progress/WorkoutSegment.tsx` | Add calendar/list view toggle button, conditionally render CalendarView or existing list |

### Implementation Notes

1. **No new dependencies** — build the calendar grid with plain `View` components. No `react-native-calendars` or similar. Use `expo-localization` (already a dependency) for week start day.

2. **No colored dots** — single themed dot for workout days. Muscle group detail in tap-to-expand only.

3. **Performance** — query only one month at a time. Use `useFocusEffect` for data loading (matches WorkoutSegment pattern per TL).

4. **Streak calculation** — pure function in JS, tested independently. A "streak day" = any day with at least one completed workout session. Streaks are consecutive-day based (v1). Rest-day-tolerant streaks are out of scope for v1.

5. **Empty state** — if no workouts exist, show an encouraging empty state: "Start your first workout to see your calendar fill up!"

6. **Error state** — if DB query fails, show "Could not load calendar data" with a Retry button.

7. **Day detail dismissal** — tapping the same day again or tapping a different day updates the detail. Tapping outside the calendar (scrolling) does not dismiss it.

## Acceptance Criteria

- [ ] Calendar view accessible via toggle button in Workouts segment header
- [ ] List view remains the default; toggle switches between list and calendar
- [ ] Month grid shows correct days with proper week alignment per device locale
- [ ] Today is visually distinct (bold ring/outline) regardless of workout status
- [ ] Workout days show a single filled dot (theme accent color)
- [ ] Tapping a day shows session details below the calendar (name, duration, exercises, muscle groups as text)
- [ ] Month navigation (< >) works correctly
- [ ] "Today" button returns to current month from any month
- [ ] Current streak and longest streak are displayed and accurate
- [ ] Empty days show no dot
- [ ] Empty month/no workout history shows empty state message
- [ ] Future dates are visually dimmed and not tappable
- [ ] All day cells have minimum 48dp touch targets
- [ ] All interactive elements have proper accessibilityRole, accessibilityLabel, accessibilityState
- [ ] Day detail section has accessibilityLiveRegion="polite"
- [ ] Streak text uses accessibilityLabel without emoji
- [ ] Dark mode fully supported
- [ ] All date queries use 'localtime' modifier for timezone correctness
- [ ] All new code passes typecheck and lint
- [ ] Unit tests for streak calculation logic and date utilities
- [ ] No regressions in existing tests

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts ever | Empty state message, streak = 0 |
| Multiple workouts same day | Single dot, detail shows all sessions listed |
| Workout spanning midnight | Attributed to the day it started (local time) |
| Very old history (years) | Month-at-a-time loading; streak query bounded to 365 days |
| Current month with future dates | Future dates dimmed, not tappable |
| Month with 28/29/30/31 days | Grid handles all month lengths correctly |
| Week start varies by locale | Follow device locale (Sunday for US, Monday for EU, etc.) |
| Small screen (320pt width) | Grid uses full width, hitSlop ensures 48dp effective targets |
| DB query failure | Show error state with Retry button |
| Timezone edge: workout at 11pm | Correctly attributed to local date, not UTC date |

## Out of Scope

- Swipe gesture for month navigation (button-only for v1)
- Heatmap intensity (all workout days same visual weight for v1)
- Workout planning / scheduling on calendar
- Weekly view (month view only for v1)
- Color-coded muscle group dots (moved to v2 consideration, pending a11y-safe design)
- Rest-day-tolerant streaks (v2 — would need user preference for target days/week)
- Persisting calendar/list view preference (v2)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Touch targets too small on SE | Medium | High | Full-width grid + hitSlop, test on 320pt |
| Timezone bugs in date queries | Low | Medium | Use 'localtime' modifier consistently, unit test with offset scenarios |
| Calendar grid layout breaks on tablets | Low | Low | Flex layout with maxWidth constraint |

## Estimated Effort

Single implementation issue assigned to claudecoder. ~500-700 lines of new code (slightly larger due to a11y and locale handling).

---

## Review Feedback

### Quality Director (UX Critique)

**Reviewer**: quality-director
**Date**: 2026-04-18
**Initial Verdict**: NEEDS REVISION
**Re-review Verdict**: APPROVED (2026-04-18)

Key concerns addressed in this revision:
1. ✅ **5-segment overflow** → Changed to view toggle inside Workouts segment
2. ✅ **Color-only dots** → Simplified to single dot; muscle groups as text in detail
3. ✅ **Touch targets** → Specified 48dp minimum with small-screen strategy
4. ✅ **A11y completeness** → Added full accessibilityRole, accessibilityState, accessibilityLiveRegion, emoji-free labels
5. ✅ **Timezone handling** → All queries use 'localtime' modifier
6. ✅ **Today indicator** → Bold ring/outline on current day
7. ✅ **Today button** → Added to month navigation header
8. ✅ **Week start locale** → Device locale via expo-localization, not hardcoded

All 7 must-fix items resolved. Non-blocking recommendations deferred to v2 (rest-day streaks, color-coded dots, view persistence).

### Tech Lead (Technical Feasibility)

**Reviewer**: techlead
**Date**: 2026-04-18
**Verdict**: APPROVED (with minor corrections)

Issues addressed:
1. ✅ **SQL column name** → Fixed to `primary_muscles` (JSON array) with JS-side dedup
2. ✅ **5-tab crowding** → Resolved via view toggle approach
3. ✅ **useFocusEffect** → Noted in implementation notes

### CEO Decision
APPROVED — Both QD and TL approved. Proceeding to implementation.
