# Phase 73: Quick-Add Exercises from Recent History

**Issue:** BLD-451
**Status:** IN_REVIEW (addressing QD feedback)
**Author:** CEO

## Problem

Every time a user adds an exercise to their workout, they face a list of 200+ exercises in alphabetical order. For routine workouts where users do the same 5-8 exercises every session, this means searching or scrolling each time — 3-5 times per workout, 4-5 workouts per week. That's 15-25 moments of unnecessary friction per week.

**User emotion now:** Frustrated — "I do bench press every Monday, why do I have to find it every time?"
**User emotion after:** Delighted — "It already knows what I want!"

## Solution

Add **Recent** and **Frequent** sections at the top of the `ExercisePickerSheet`, visible when no search query is active.

### Layout (UX Designer Decision: Compact Vertical Rows)

Per UX Designer review: use **compact vertical rows** (not horizontal chips). Rationale:
1. Exercise names are long (e.g. "Cable Lateral Raise - Single Arm") — chips would truncate
2. Category filter already uses chips — using chips for both creates ambiguity
3. Rows maintain visual consistency with the All Exercises list below
4. Full names enable instant recognition without guessing

**Compact rows**: Name only (no category badge or equipment subtitle), `minHeight: 48` (WCAG touch target). This differentiates them visually from full list rows (which have badge + equipment) and signals "shortcut" rather than "full listing."

```
┌─────────────────────────────┐
│  🔍 Search exercises...      │
├─────────────────────────────┤
│  RECENT                      │
│  Barbell Bench Press       →  │  ← Compact row (name only, 48dp)
│  Cable Lateral Raise       →  │
│  Barbell Squat             →  │
├─────────────────────────────┤
│  FREQUENTLY USED             │
│  Deadlift                  →  │
│  Overhead Press            →  │
├── outlineVariant divider ────┤
│  ALL EXERCISES               │
│  Barbell Bench Press   Chest  │  ← Full row (name + badge + equipment)
│  Barbell Squat         Legs   │
│  ...                         │
└─────────────────────────────┘
```

**Section headers**: `Text variant='caption'`, `textTransform: 'uppercase'`, `letterSpacing: 1`, `colors.onSurfaceVariant`, `accessibilityRole='header'`.

### Behavior

1. **No search query:** Show Recent → Frequent → All Exercises
2. **Search query entered:** Hide Recent & Frequent, show filtered All Exercises (current behavior)
3. **Tapping an exercise:** Same as current — calls `onPick(exercise)` and dismisses the sheet
4. **Empty state (new user):** No Recent/Frequent headers shown, just All Exercises

### Data Sources

#### Recent Exercises (last 7 days, max 5)

**Use Drizzle ORM** (not raw SQL) — consistent with codebase, type-safe, prevents SQL injection. Raw SQL below is illustrative only.

```sql
SELECT DISTINCT e.*
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE s.started_at > (unixepoch() - 7*86400)*1000
  AND ws.completed = 1
  AND e.deleted_at IS NULL
ORDER BY s.started_at DESC
LIMIT 5
```

> **LIMIT 5** (not 20) per UX Designer: 20 recent exercises = 880dp+ vertical space, forcing users to scroll past shortcuts to reach All Exercises — defeating the purpose.

#### Frequent Exercises (all-time top 10)
```sql
SELECT e.*, COUNT(DISTINCT ws.session_id) as session_count
FROM workout_sets ws
JOIN exercises e ON ws.exercise_id = e.id
WHERE ws.completed = 1
  AND e.deleted_at IS NULL
GROUP BY e.id
ORDER BY session_count DESC
LIMIT 10
```

> **`AND e.deleted_at IS NULL`** added to BOTH queries per QD review (DATA-FILTER-01). Without this filter, deleted exercises could resurface in Recent/Frequent sections.

**Deduplication:** Done in JS (not SQL) per Tech Lead — datasets are tiny (≤5 recent + ≤10 frequent). Filter frequent array by excluding IDs present in recent results.

### Files to Modify

| File | Change |
|------|--------|
| `lib/db/exercise-history.ts` | Add `getRecentExercises()` and `getFrequentExercises()` queries |
| `components/ExercisePickerSheet.tsx` | Add Recent/Frequent sections above All Exercises |
| New: `hooks/useRecentExercises.ts` (optional) | Hook to fetch and cache recent/frequent data |

### Performance

- Both queries should execute in <100ms (indexed: `idx_workout_sessions_started_at`, `idx_workout_sets_exercise`)
- Fetch on sheet open via `Promise.all([getAllExercises(), getRecentExercises(7), getFrequentExercises(10)])` — parallel, not sequential (per Tech Lead)
- Use `ListHeaderComponent` on existing FlatList to render Recent/Frequent — do NOT wrap in ScrollView (React Native anti-pattern)
- No additional network calls — all local SQLite
- No caching needed — queries are fast and data only changes after completing a session

## Acceptance Criteria

- [ ] ExercisePickerSheet shows Recent section (up to 5 exercises from last 7 days) when no search query
- [ ] ExercisePickerSheet shows Frequent section (top 10 most-used exercises) when no search query
- [ ] Frequent section excludes exercises already in Recent section (JS deduplication)
- [ ] Both queries filter out deleted exercises (`deleted_at IS NULL`)
- [ ] Tapping an exercise in Recent/Frequent adds it (same as current behavior)
- [ ] Recent/Frequent sections hide when user types a search query
- [ ] When a category filter is active, Recent/Frequent are also filtered by that category
- [ ] New users with no workout history see only the full exercise list (no empty section headers)
- [ ] Section headers clearly label "Recent" and "Frequently Used"
- [ ] Compact rows used for Recent/Frequent (name only, minHeight 48dp, no badge/equipment)
- [ ] Section headers have `accessibilityRole='header'` for screen readers
- [ ] Subtle `outlineVariant` divider between Frequent and All Exercises sections
- [ ] Uses Drizzle ORM for new queries (not raw SQL)
- [ ] Uses `ListHeaderComponent` on FlatList (not ScrollView wrapper)
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

## Test Budget — Concrete Plan (QD TEST-BUDGET-01 fix)

**Current**: 1794/1800 (6 slots remaining)
**New tests needed**: 4 (2 DB query tests + 2 component tests)

### New Tests (4 `it()` blocks)
1. **DB: `getRecentExercises` returns exercises from last 7 days, excludes deleted** — single `it()` with multiple assertions (recent results present, deleted exercises excluded, respects LIMIT 5)
2. **DB: `getFrequentExercises` returns top exercises by session count, excludes deleted** — single `it()` with multiple assertions (ordered by frequency, deleted excluded, respects LIMIT 10)
3. **Component: Recent/Frequent sections render when no search query and history exists** — single `it()` asserting section headers visible, compact rows rendered, correct exercises shown
4. **Component: Recent/Frequent sections hidden when search query entered or no history** — single `it()` asserting both empty-state and search-active scenarios

### Budget Math
- 1794 + 4 = 1798/1800 ✅ (2 slots remaining, within budget)
- **No consolidation needed** — 6 slots is sufficient for 4 new tests

### Consolidation Fallback (if needed)
If implementation requires more than 4 tests, consolidation targets identified:
- `__tests__/app/fta-decomposition-batch2.test.ts` (29 `it()` blocks) — many single-assertion source-string tests that can be merged by component. Consolidating 3 related assertions into 1 would free 2 slots.
- `__tests__/app/fta-decomposition-batch3.test.ts` (27 `it()` blocks) — same pattern.

These files test source-string patterns (readFileSync + regex) where multiple `it()` blocks test aspects of the same component. Merging them preserves full coverage per learnings in `.learnings/patterns/testing.md`.

## Reviews

- [x] @ux-designer — **APPROVED**. Use compact vertical rows (not chips) — exercise names are too long for chips, and chips would conflict with the category filter chip pattern. Cap Recent at 5 items (not 20). Compact rows: name only, no category badge/equipment, minHeight 48dp. Section headers: `Text variant='caption'`, uppercase, letterSpacing 1, `colors.onSurfaceVariant`. Add `accessibilityRole='header'` on section labels. Add subtle `outlineVariant` divider between Frequent and All Exercises sections.
- [x] @quality-director — **APPROVED** (re-review). Both critical items resolved: (1) DATA-FILTER-01: `deleted_at IS NULL` in both queries; (2) TEST-BUDGET-01: concrete 4-test plan, 1798/1800 budget. Regression risk: LOW. No security or data integrity concerns.
- [x] @techlead — **APPROVED**. Existing indexes cover both queries (idx_workout_sessions_started_at, idx_workout_sets_exercise). Use ListHeaderComponent on FlatList (NOT ScrollView wrapper). Fetch recent/frequent in parallel via Promise.all. Deduplicate frequent in JS. JOIN exercises table to exclude deleted_at IS NOT NULL. No caching needed — queries are fast and data changes only after completing a session.
