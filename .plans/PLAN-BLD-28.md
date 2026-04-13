# Feature Plan: Exercise History & Performance Trends (Phase 12)

**Issue**: BLD-2
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

FitForge tracks every set users perform, but there's NO way to view the history for a specific exercise. The exercise detail page (`app/exercise/[id].tsx`) shows only static info — name, muscles, equipment, instructions. Users cannot see:

- When they last performed the exercise
- How their weight/reps have progressed over time
- What their all-time personal records are
- Volume trends for that exercise

This is one of the most fundamental features in any workout app. Strong, JEFIT, and Hevy all prominently display exercise history with charts. Without it, users can't track progressive overload — the foundation of strength training.

## User Stories

- As a lifter, I want to see my weight progression for Bench Press over time so I know if I'm getting stronger
- As a user viewing an exercise, I want to see all past sessions where I performed it so I can review my recent performance
- As a user, I want to see my personal records (heaviest weight, most reps, best estimated 1RM) for each exercise so I can set goals
- As a user, I want to tap a history entry and navigate to that full session detail so I can review context

## Proposed Solution

### Overview

Extend the exercise detail page (`app/exercise/[id].tsx`) with three new sections:

1. **Personal Records Card** — all-time bests at the top
2. **Performance Chart** — line chart showing max weight per session over time
3. **Session History List** — chronological list of all sessions where this exercise was performed, with set details

### Data Model

No new tables needed. All data comes from existing `workout_sets` + `workout_sessions` tables via new query functions.

### New DB Functions (in `lib/db.ts`)

#### 1. `getExerciseHistory(exerciseId: string)`
Returns all sessions where the exercise was performed, with set summaries:
```sql
SELECT wss.id AS session_id,
       wss.name AS session_name,
       wss.started_at,
       MAX(ws.weight) AS max_weight,
       SUM(ws.reps) AS total_reps,
       COUNT(ws.id) AS set_count,
       SUM(ws.weight * ws.reps) AS volume
FROM workout_sets ws
JOIN workout_sessions wss ON ws.session_id = wss.id
WHERE ws.exercise_id = ?
  AND ws.completed = 1
  AND wss.completed_at IS NOT NULL
GROUP BY wss.id
ORDER BY wss.started_at DESC
```

Return type:
```ts
type ExerciseSession = {
  session_id: string
  session_name: string
  started_at: number
  max_weight: number
  total_reps: number
  set_count: number
  volume: number
}
```

#### 2. `getExerciseRecords(exerciseId: string)`
Returns personal records for the exercise:

Can be combined into a single function that runs multiple queries and returns:
```ts
type ExerciseRecords = {
  max_weight: number | null
  max_reps: number | null
  max_volume: number | null
  est_1rm: number | null
  total_sessions: number
}
```

Key queries:
- Heaviest weight: `MAX(ws.weight)` where completed and weight > 0
- Most reps in a single set: `MAX(ws.reps)` where completed
- Highest volume in a single session: `MAX(SUM(ws.weight * ws.reps))` grouped by session
- Estimated 1RM (Epley formula): `MAX(ws.weight * (1.0 + ws.reps / 30.0))` where weight > 0 and reps > 0

#### 3. `getExerciseChartData(exerciseId: string, limit?: number)`
Returns max weight per session for charting (ordered by date ASC for chart rendering):
```sql
SELECT wss.started_at AS date,
       MAX(ws.weight) AS weight
FROM workout_sets ws
JOIN workout_sessions wss ON ws.session_id = wss.id
WHERE ws.exercise_id = ?
  AND ws.completed = 1
  AND ws.weight IS NOT NULL
  AND ws.weight > 0
  AND wss.completed_at IS NOT NULL
GROUP BY wss.id
ORDER BY wss.started_at ASC
LIMIT ?
```

### UI Changes

#### Exercise Detail Page (`app/exercise/[id].tsx`)

Currently shows: exercise info (name, category, muscles, equipment, difficulty, instructions) + edit/delete for custom exercises.

Add below the existing content:

##### 1. Personal Records Card
- Horizontal row of 4 stat boxes: Max Weight, Max Reps, Est. 1RM, Total Sessions
- Use theme colors + `semantic` constants
- Empty state: "No workout data yet — start a session to build your history"
- Accessibility: each stat has `accessibilityLabel` (e.g., "Maximum weight: 100 kilograms")

##### 2. Performance Chart
- `LineChart` from `react-native-chart-kit` (already in project)
- X-axis: session dates (formatted as MM/DD)
- Y-axis: max weight
- Show last 20 sessions by default
- Respect user's weight unit preference (kg/lb) from `body_settings`
- Empty state: hidden when fewer than 2 data points
- Accessibility: `accessibilityLabel="Weight progression chart showing max weight over time"`

##### 3. Session History List
- Chronological list (most recent first)
- Each entry shows: date, session name, sets x reps summary, max weight
- Tapping navigates to `/session/detail/[id]` for full session review
- Paginated: show 10 at a time with "Load More" button
- Empty state: "No sessions recorded for this exercise"
- Accessibility: each row has descriptive label

### Weight Unit Handling

Use `getBodySettings()` to determine the user's preferred unit (kg/lb). Apply the same `toDisplay` conversion used in the progress tab. All DB queries use kg internally; convert only at display layer.

### Dependencies

- `react-native-chart-kit` — already installed
- `react-native-svg` — already installed
- `getBodySettings()` — already exists in `lib/db.ts`
- `semantic` theme constants — already exist in `constants/theme.ts`

## Acceptance Criteria

- [ ] Given an exercise with workout history, When user views exercise detail, Then personal records card shows max weight, max reps, estimated 1RM, and total sessions
- [ ] Given an exercise with 2 or more sessions, When user views exercise detail, Then a line chart shows max weight progression over time
- [ ] Given an exercise with workout history, When user views exercise detail, Then a scrollable list shows all past sessions with date, name, set count, and max weight
- [ ] Given an exercise with NO workout history, When user views exercise detail, Then empty state message "No workout data yet" is shown instead of records/chart/history
- [ ] Given a session in the history list, When user taps it, Then they navigate to the session detail page
- [ ] Given the user's weight unit is set to "lb", When viewing records/chart/history, Then all weights display in pounds
- [ ] Given the user's weight unit is set to "kg" (default), When viewing records/chart/history, Then all weights display in kilograms
- [ ] All new UI elements have accessibility labels and roles
- [ ] PR builds without TypeScript errors (`tsc --noEmit` passes)
- [ ] No new lint warnings
- [ ] Page loads within 500ms for exercises with 100+ sessions (query efficiency)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise never performed | Show "No workout data yet" empty state; hide chart |
| Exercise performed once | Show records card + history list; hide chart (fewer than 2 points) |
| Exercise with only bodyweight sets (weight=0) | Show records for reps only; max weight shows dash |
| Deleted exercise being viewed | Should not happen (detail page requires valid exercise) |
| Session with all incomplete sets | Session excluded from history (completed=1 filter) |
| Very long history (100+ sessions) | Paginate history list (10 per page); chart shows last 20 |
| Custom exercise with history then soft-deleted | Exercise detail page inaccessible after delete — no issue |

## Out of Scope

- Editing past sets from the history view (users must go to session detail)
- Comparing exercises against each other
- Volume charts (only weight progression for Phase 12; volume charts can be Phase 13)
- Export exercise history to CSV (already have full CSV export)
- Estimated 1RM chart over time (just show current best)

## Files Modified

1. `lib/db.ts` — Add `getExerciseHistory`, `getExerciseRecords`, `getExerciseChartData`
2. `app/exercise/[id].tsx` — Add personal records card, chart, history list
3. `lib/types.ts` — Add `ExerciseSession` and `ExerciseRecords` types (if needed)

## Complexity Assessment

- **Risk**: Low — no schema changes, no new dependencies, additive-only UI
- **Effort**: Medium — 3 new queries + substantial UI additions to exercise detail
- **Testing**: Verify with exercises that have 0, 1, 2, 10+ sessions
