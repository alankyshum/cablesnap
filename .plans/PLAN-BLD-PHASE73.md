# Phase 73: Quick-Add Exercises from Recent History

**Issue:** BLD-451
**Status:** PLANNING
**Author:** CEO

## Problem

Every time a user adds an exercise to their workout, they face a list of 200+ exercises in alphabetical order. For routine workouts where users do the same 5-8 exercises every session, this means searching or scrolling each time — 3-5 times per workout, 4-5 workouts per week. That's 15-25 moments of unnecessary friction per week.

**User emotion now:** Frustrated — "I do bench press every Monday, why do I have to find it every time?"
**User emotion after:** Delighted — "It already knows what I want!"

## Solution

Add **Recent** and **Frequent** sections at the top of the `ExercisePickerSheet`, visible when no search query is active.

### Layout

```
┌─────────────────────────────┐
│  🔍 Search exercises...      │
├─────────────────────────────┤
│  RECENT                      │
│  ┌─────┐ ┌─────┐ ┌─────┐   │
│  │Bench│ │Squat│ │ OHP │   │ ← Horizontal scroll chips
│  └─────┘ └─────┘ └─────┘   │
├─────────────────────────────┤
│  FREQUENTLY USED             │
│  ┌─────┐ ┌─────┐ ┌─────┐   │
│  │Dead │ │Row  │ │Curl │   │ ← Horizontal scroll chips
│  └─────┘ └─────┘ └─────┘   │
├─────────────────────────────┤
│  ALL EXERCISES               │
│  Barbell Bench Press     →   │
│  Barbell Squat           →   │
│  ...                         │
└─────────────────────────────┘
```

**Alternative layout:** Vertical list rows (consistent with full list below). The UX Designer should decide which layout reduces cognitive load — chips are compact but rows are more consistent.

### Behavior

1. **No search query:** Show Recent → Frequent → All Exercises
2. **Search query entered:** Hide Recent & Frequent, show filtered All Exercises (current behavior)
3. **Tapping an exercise:** Same as current — calls `onPick(exercise)` and dismisses the sheet
4. **Empty state (new user):** No Recent/Frequent headers shown, just All Exercises

### Data Sources

#### Recent Exercises (last 7 days)
```sql
SELECT DISTINCT e.*
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE s.started_at > (unixepoch() - 7*86400)*1000
  AND ws.completed = 1
ORDER BY s.started_at DESC
LIMIT 20
```

#### Frequent Exercises (all-time top 10)
```sql
SELECT e.*, COUNT(DISTINCT ws.session_id) as session_count
FROM workout_sets ws
JOIN exercises e ON ws.exercise_id = e.id
WHERE ws.completed = 1
GROUP BY e.id
ORDER BY session_count DESC
LIMIT 10
```

**Deduplication:** Frequent list excludes any exercise IDs already in the Recent list.

### Files to Modify

| File | Change |
|------|--------|
| `lib/db/exercise-history.ts` | Add `getRecentExercises()` and `getFrequentExercises()` queries |
| `components/ExercisePickerSheet.tsx` | Add Recent/Frequent sections above All Exercises |
| New: `hooks/useRecentExercises.ts` (optional) | Hook to fetch and cache recent/frequent data |

### Performance

- Both queries should execute in <100ms (indexed on `exercise_id`, `session_id`, `started_at`)
- Fetch on sheet open (same as current `getAllExercises()` call)
- No additional network calls — all local SQLite

## Acceptance Criteria

- [ ] ExercisePickerSheet shows Recent section (exercises from last 7 days) when no search query
- [ ] ExercisePickerSheet shows Frequent section (top 10 most-used exercises) when no search query
- [ ] Frequent section excludes exercises already in Recent section
- [ ] Tapping an exercise in Recent/Frequent adds it (same as current behavior)
- [ ] Recent/Frequent sections hide when user types a search query
- [ ] New users with no workout history see only the full exercise list
- [ ] Section headers clearly label "Recent" and "Frequently Used"
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workout history | Only show full exercise list, no section headers |
| Only 1-2 recent exercises | Show them; Frequent section shows remaining top exercises |
| Exercise deleted from library | Don't show in Recent/Frequent (JOIN ensures this) |
| 200+ sessions of history | Frequent query still fast (<100ms) |
| Category filter active | Recent/Frequent also filtered by selected category |
| Same exercise in both lists | Deduplicated — only appears in Recent |

## Out of Scope

- AI-powered exercise suggestions
- "Add all from last session" bulk action (future phase)
- Per-muscle-group recommendations
- Custom pinned/favorite exercises (future phase)

## Test Budget

Current: 1794/1800 (6 remaining)
Estimated new tests: 4-5 (2 DB query tests + 2-3 component tests)
Strategy: May need to consolidate 1-2 existing tests to stay under budget.

## Reviews

- [ ] @ux-designer — Layout decision (chips vs rows), visual hierarchy, section labeling
- [ ] @quality-director — Release safety, test coverage requirements
- [ ] @techlead — Query performance, caching strategy, data model
