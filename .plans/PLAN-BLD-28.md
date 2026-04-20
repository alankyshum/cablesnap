# Feature Plan: Exercise History & Performance Trends (Phase 12)

**Issue**: BLD-2
**Author**: CEO
**Date**: 2026-04-13
**Status**: APPROVED

## Problem Statement

CableSnap tracks every set users perform, but there's NO way to view the history for a specific exercise. The exercise detail page (`app/exercise/[id].tsx`) shows only static info — name, muscles, equipment, instructions. Users cannot see:

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

#### 1. `getExerciseHistory(exerciseId: string, limit: number, offset: number)`
Returns paginated sessions where the exercise was performed, with set summaries.
**[Rev 2 — TL-C3]**: Added `limit`/`offset` params for server-side pagination.
```sql
SELECT wss.id AS session_id,
       wss.name AS session_name,
       wss.started_at,
       MAX(ws.weight) AS max_weight,
       MAX(ws.reps) AS max_reps,
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
LIMIT ? OFFSET ?
```

Return type:
```ts
type ExerciseSession = {
  session_id: string
  session_name: string
  started_at: number
  max_weight: number
  max_reps: number
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
- Highest volume in a single session — **[Rev 2 — TL-C1]** use subquery instead of nested aggregate:
  ```sql
  SELECT MAX(sv) FROM (
    SELECT SUM(ws.weight * ws.reps) AS sv
    FROM workout_sets ws
    JOIN workout_sessions wss ON ws.session_id = wss.id
    WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL
    GROUP BY wss.id
  )
  ```
- Estimated 1RM (Epley formula): `MAX(ws.weight * (1.0 + ws.reps / 30.0))` where weight > 0 and reps > 0 and reps <= 12 (cap at 12 reps for formula accuracy)
- **[Rev 2 — QD-C3]** `is_bodyweight`: Boolean flag — true if ALL completed sets for this exercise have weight=0. Derived via: `NOT EXISTS (SELECT 1 FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND weight > 0)`

#### 3. `getExerciseChartData(exerciseId: string, limit?: number)`
Returns max weight per session for charting. **[Rev 2 — TL-C2]** Fixed to return LAST N sessions (newest), re-ordered ASC for chart rendering:
```sql
SELECT * FROM (
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
  ORDER BY wss.started_at DESC
  LIMIT ?
) ORDER BY date ASC
```

**[Rev 2 — QD-C3]** For bodyweight exercises (all weight=0), this query returns 0 rows. The UI detects `is_bodyweight` from records and falls back to a **max reps per session chart** instead:
```sql
SELECT * FROM (
  SELECT wss.started_at AS date,
         MAX(ws.reps) AS reps
  FROM workout_sets ws
  JOIN workout_sessions wss ON ws.session_id = wss.id
  WHERE ws.exercise_id = ?
    AND ws.completed = 1
    AND wss.completed_at IS NOT NULL
  GROUP BY wss.id
  ORDER BY wss.started_at DESC
  LIMIT ?
) ORDER BY date ASC
```

### UI Changes

#### Exercise Detail Page (`app/exercise/[id].tsx`)

**[Rev 2 — QD-C1] Scroll Architecture**: Convert the entire page from `ScrollView` to `FlatList` (or `SectionList`). The exercise info (name, muscles, equipment, instructions) + records card + chart render as `ListHeaderComponent`. The session history list becomes the FlatList's data. This avoids the nested-scroll anti-pattern (FlatList-inside-ScrollView).

**[Rev 2 — QD-M1] Loading States**: Each async section (records, chart, history) independently shows a skeleton/shimmer while loading. Use a simple `ActivityIndicator` inside a card placeholder. Never show stale data from a previous exercise.

**[Rev 2 — QD-M2] Error Handling**: If any DB query fails, show an error card for that section with message "Failed to load [section name]" and a "Retry" button. Do NOT crash the entire page — isolate failures per section.

Currently shows: exercise info (name, category, muscles, equipment, difficulty, instructions) + edit/delete for custom exercises.

Add below the existing content (all rendered inside ListHeaderComponent except history list):

##### 1. Personal Records Card
- Horizontal row of stat boxes. **For weighted exercises**: Max Weight, Max Reps, Est. 1RM, Total Sessions. **[Rev 2 — QD-C3] For bodyweight exercises** (`is_bodyweight=true`): Max Reps (prominent, primary stat), Total Sessions, Best Volume — hide Max Weight and Est. 1RM (show "—" if displayed at all).
- Use theme colors + `semantic` constants
- Empty state: "No workout data yet — start a session to build your history"
- Accessibility: each stat has `accessibilityLabel` (e.g., "Maximum weight: 100 kilograms")
- **[Rev 2]** Loading state: show `ActivityIndicator` inside card while query runs

##### 2. Performance Chart
- `LineChart` from `react-native-chart-kit` (already in project)
- **[Rev 2 — QD-M4]** X-axis: session dates formatted with locale-aware `Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })` instead of hardcoded MM/DD
- Y-axis: max weight (or max reps for bodyweight exercises — **[Rev 2 — QD-C3]**)
- Show last 20 sessions by default
- Respect user's weight unit preference (kg/lb) from `body_settings`
- Empty state: hidden when fewer than 2 data points
- **[Rev 2 — QD-C2] Chart Accessibility**: Below the chart, render a text summary: "Your [exercise name] progressed from [start]kg to [end]kg over [N] sessions ([+/- %]%)". For screen reader users, this provides the actual data trend. Add `accessibilityLabel` on the chart container that includes this summary text.
- **[Rev 2]** Loading state: show skeleton placeholder while chart data loads

##### 3. Session History List (FlatList data)
- Chronological list (most recent first) — rendered as the FlatList's main data (NOT inside ListHeaderComponent)
- Each entry shows: date, session name, sets x reps summary, max weight (or max reps for bodyweight)
- Tapping navigates to `/session/detail/[id]` for full session review
- **[Rev 2 — TL-C3]** Server-side pagination: `getExerciseHistory(id, 10, offset)`. Load More increments offset by 10. Each page is 10 items.
- **[Rev 2 — QD-M3]** Hard cap: max 50 items loaded (5 pages). After 50 items, show "View all sessions" which navigates to a dedicated full-history screen (or simply stops loading more).
- Each row minimum height 48dp (**[Rev 2]** touch target compliance)
- Empty state: "No sessions recorded for this exercise"
- Accessibility: each row has descriptive label (e.g., "Bench Press session on April 10, 3 sets, max weight 80 kilograms")
- **[Rev 2]** Loading state: show `ActivityIndicator` at list footer while loading next page

### Weight Unit Handling

**[Rev 2 — TL-M1]** Extract `toDisplay` and `KG_TO_LB` from `app/(tabs)/progress.tsx` into a shared utility `lib/units.ts`:
```ts
export const KG_TO_LB = 2.20462
export function toDisplay(kg: number, unit: string): number {
  return unit === "lb" ? Math.round(kg * KG_TO_LB * 10) / 10 : kg
}
```

Use `getBodySettings()` to determine the user's preferred unit (kg/lb). Import `toDisplay` from `lib/units.ts`. All DB queries use kg internally; convert only at display layer. Update `progress.tsx` to import from `lib/units.ts` too (eliminate duplication).

### Database Index

**[Rev 2 — TL-M2]** Add a migration to create an index for query performance:
```sql
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);
```
Add this in the `migrateDatabase()` function in `lib/db.ts`. This is critical for the 500ms performance target with 100+ sessions.

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
| Exercise with only bodyweight sets (weight=0) | Records: show Max Reps prominently, hide Max Weight/1RM or show "—". Chart: show max reps per session instead of weight. |
| Deleted exercise being viewed | Should not happen (detail page requires valid exercise) |
| Session with all incomplete sets | Session excluded from history (completed=1 filter) |
| Very long history (100+ sessions) | Server-side pagination (10 per page, max 50 loaded). Chart shows last 20. |
| Custom exercise with history then soft-deleted | Exercise detail page inaccessible after delete — no issue |
| DB query failure | Show error card per section with "Retry" button; don't crash page |
| Loading state | Each section shows ActivityIndicator independently while loading |

## Out of Scope

- Editing past sets from the history view (users must go to session detail)
- Comparing exercises against each other
- Volume charts (only weight progression for Phase 12; volume charts can be Phase 13)
- Export exercise history to CSV (already have full CSV export)
- Estimated 1RM chart over time (just show current best)

## Files Modified

1. `lib/db.ts` — Add `getExerciseHistory`, `getExerciseRecords`, `getExerciseChartData`; add index migration
2. `app/exercise/[id].tsx` — Convert ScrollView to FlatList; add personal records card, chart, history list
3. `lib/types.ts` — Add `ExerciseSession` and `ExerciseRecords` types (if needed)
4. **[Rev 2]** `lib/units.ts` — NEW: extract `toDisplay`, `KG_TO_LB` from progress.tsx
5. **[Rev 2]** `app/(tabs)/progress.tsx` — Update to import from `lib/units.ts`

## Complexity Assessment

- **Risk**: Low — no schema changes, no new dependencies, additive-only UI
- **Effort**: Medium — 3 new queries + substantial UI additions to exercise detail
- **Testing**: Verify with exercises that have 0, 1, 2, 10+ sessions

---

## Reviews

### Tech Lead (Technical Feasibility)

**Reviewer**: techlead
**Date**: 2026-04-13
**Verdict**: NEEDS REVISION → **APPROVED** (Rev 2 addresses all findings)

#### Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| C1 | Critical | Volume query MAX(SUM(...)) uses nested aggregates — will not work in SQLite. Must use subquery. | ✅ FIXED in Rev 2 |
| C2 | Critical | Chart data ORDER BY ASC LIMIT returns oldest N sessions, not newest. Must subquery with DESC then re-order ASC. | ✅ FIXED in Rev 2 |
| C3 | Critical | getExerciseHistory has no limit/offset — loads all sessions, contradicts 500ms target and 10-per-page UI. | ✅ FIXED in Rev 2 |
| M1 | Major | toDisplay weight conversion is local to progress.tsx, not shared. Plan should specify extraction to lib/units.ts. | ✅ FIXED in Rev 2 |
| M2 | Major | No indexes on workout_sets.exercise_id. Add CREATE INDEX migration for 500ms performance target. | ✅ FIXED in Rev 2 |

**Re-review (2026-04-13)**: All fixes verified. Plan technically sound. APPROVED.

### Quality Director (UX Critique)

**Reviewer**: quality-director
**Date**: 2026-04-13
**Verdict**: ~~NEEDS REVISION~~ → **APPROVED (Rev 2)**

#### Critical Issues

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| C1 | Critical | Nested Scroll Architecture — FlatList-in-ScrollView anti-pattern | ✅ FIXED — converted to FlatList with ListHeaderComponent |
| C2 | Critical | Chart Accessibility — screen readers get zero data | ✅ FIXED — added text summary below chart with trend data |
| C3 | Critical | Bodyweight Exercise Handling undefined | ✅ FIXED — specified reps-based display, reps chart fallback |

#### Major Issues

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| M1 | Major | Missing loading states | ✅ FIXED — ActivityIndicator per section |
| M2 | Major | Missing error handling | ✅ FIXED — error card with Retry per section |
| M3 | Major | Pagination memory growth | ✅ FIXED — hard cap at 50 items (5 pages) |
| M4 | Major | Date format US-centric | ✅ FIXED — locale-aware Intl.DateTimeFormat |

### CEO Decision
Rev 2 addresses all Critical and Major findings from both reviewers. Re-requesting review.
