# Feature Plan: Personal Exercise Stats in Workout Detail Drawer

**Issue**: BLD-401
**Author**: CEO
**Date**: 2026-04-19
**Status**: APPROVED

## Problem Statement
When a user taps the info/detail button on an exercise during a workout, the `ExerciseDetailDrawer` shows only static metadata: category, difficulty, equipment, muscles targeted, and instructions. This is helpful for beginners learning exercises, but experienced users — the majority of active gym-goers — already know what a bench press is. What they DON'T know at a glance is: "What did I lift last time? What's my best ever? Am I progressing?"

This data exists on the full exercise detail page (`app/exercise/[id].tsx`), but navigating there means **leaving the workout session** — losing context, breaking flow, and adding friction during a time-pressured gym session.

## User's Emotional Journey
**Without this feature:** "I know I did bench press last week... was it 100kg or 102.5? Let me navigate to the exercise page... wait, where was I in my workout?" → Frustration, context loss, wasted time between sets.

**After this feature:** User taps the exercise info button → instantly sees "PB: 105kg × 5 • Last: 102.5kg × 6 • 23 sessions" → "OK, I'll go for 105 today" → Confident, informed, motivated. The drawer becomes a personal coach whispering in their ear.

## User Stories
- As a gym-goer mid-workout, I want to see my personal records and recent performance for the current exercise so that I can make informed weight decisions without leaving my workout.
- As a returning user, I want to see how many sessions I've logged for an exercise so that I feel a sense of progress and commitment.

## Proposed Solution

### Overview
Add a "Your Stats" section to the existing `ExerciseDetailDrawer` component. This section appears at the top of the drawer (before the static metadata) and shows the user's personal performance data for that exercise. The data is fetched lazily when the drawer opens.

### UX Design

#### Layout (phone — single column)
```
┌─────────────────────────────────────┐
│  Exercise Name                   ✕  │
├─────────────────────────────────────┤
│  📊 YOUR STATS                      │
│  ┌─────────┬─────────┬───────────┐  │
│  │ Best    │ e1RM    │ Sessions  │  │
│  │ 105kg×5 │ 121kg   │ 23        │  │
│  └─────────┴─────────┴───────────┘  │
│                                     │
│  Last Session (Apr 17):             │
│  Best: 102.5kg × 6 • 3 sets        │
│  Volume: 1,525kg                    │
│                                     │
├─────────────────────────────────────┤
│  [existing: category, muscles,      │
│   equipment, instructions, etc.]    │
└─────────────────────────────────────┘
```

#### Layout (tablet — two column, already supported)
Stats section appears in the left column above the existing metadata.

#### Key UX Decisions
- **Stats at the top** — this is what the user actually wants to see. Static metadata moves below.
- **Compact 3-stat row** — Best weight×reps, estimated 1RM, total sessions. Glanceable in <1 second.
- **Last session summary** — The most recent completed session's aggregates: best set (max_weight × max_reps), set count, total volume. "Best: 102.5kg × 6 • 3 sets • Volume: 1,525kg" — simple, glanceable, accurate.
- **Loading state** — Show skeleton/placeholder while data loads (it's an async DB query). Use a subtle shimmer or "—" placeholders.
- **Empty state** — If no history exists for this exercise, show "No history yet — complete your first set!" in a muted style. Don't show the stats row at all if empty (avoid "0" values that look broken).
- **Bodyweight exercises** — If exercise is bodyweight-only (weight=0 in all sets), show reps-based stats instead of weight (max reps, last session reps).
- **Duration exercises** — If tracking mode is "duration", show max duration instead of weight.
- **Unit awareness** — Display in user's preferred unit (kg/lb), using existing `toDisplay` helper.

#### Accessibility
- Stats section has `accessibilityRole="summary"` 
- Each stat has a clear accessibility label: "Personal best: 105 kilograms for 5 reps"
- Last session has label: "Last session on April 17th: 3 sets, best set 102.5 kilograms for 6 reps"
- Loading state announces: "Loading your exercise stats"

### Technical Approach

#### Data Fetching
Reuse existing DB functions — NO new queries needed:
- `getExerciseRecords(exerciseId)` → returns `{ max_weight, max_reps, max_volume, est_1rm, total_sessions, is_bodyweight, max_duration }`
- `getBestSet(exerciseId)` → returns `{ weight, reps } | null` — the single set with highest e1RM. **This is the accurate "Best" display** (TL fix #1: `max_weight`/`max_reps` from records are independent maxima from potentially different sets).
- `getExerciseHistory(exerciseId, 1, 0)` → returns most recent session **aggregates** (max_weight, max_reps, total_reps, set_count, volume). **Simplified to aggregates** (TL fix #2: no per-set detail in v1).

Create a small hook `useExerciseDrawerStats(exerciseId: string | null)` that:
1. Takes exerciseId (null when drawer is closed)
2. Fetches records + bestSet + lastSession in parallel via `Promise.all`
3. Returns `{ records, bestSet, lastSession, loading, error }`
4. ~~Caches per exerciseId~~ **No caching in v1** (TL fix #3: drawer is conditionally rendered so hook state is lost on close; queries are ~10ms indexed, no user-visible delay)

#### Component Changes
- `ExerciseDetailDrawer.tsx` — Add `exerciseId` prop and render `ExerciseDrawerStats` above existing content
- New component: `components/session/ExerciseDrawerStats.tsx` — Renders the stats section
- Parent (`app/session/[id].tsx`) — Pass exerciseId to the drawer

#### No New Dependencies
All data and UI primitives already exist. Uses:
- `Text`, `View` from existing UI components
- `toDisplay` from `lib/units` for unit conversion
- `getExerciseRecords`, `getExerciseHistory` from `lib/db`
- Theme colors from `useThemeColors`

### Scope
**In Scope:**
- "Your Stats" section in ExerciseDetailDrawer with: best weight×reps (from `getBestSet`), e1RM, total sessions, last session aggregates
- Loading and empty states
- Bodyweight exercise variant (show reps/duration instead of weight)
- Unit-aware display (kg/lb)
- Accessibility labels (including `accessibilityLiveRegion="polite"` per QD recommendation)

**Out of Scope:**
- Charts/sparklines in the drawer (too complex for a glanceable summary — users can tap through to full exercise detail page for charts)
- Editing or navigating to exercise detail page from the drawer (separate feature)
- Historical trend arrows (requires comparing current month vs previous — out of scope for v1)
- PR badges in the stats section
- Per-set detail in "Last Session" (show aggregates only in v1 — per TL feedback)
- In-session caching (drawer conditionally rendered = state lost on close; not needed since queries are ~10ms)

### Acceptance Criteria
- [ ] Given a user opens the exercise detail drawer during a workout, When the exercise has completed history, Then "Your Stats" section shows: personal best (weight × reps), estimated 1RM, and total sessions count
- [ ] Given a user opens the exercise detail drawer, When the exercise has completed history, Then the most recent session's aggregates are shown below the stats row (e.g., "Best: 102.5kg × 6 • 3 sets • Volume: 1,525kg")
- [ ] Given a user opens the exercise detail drawer, When the exercise has NO completed history, Then the stats section shows "No history yet" message instead of zeros
- [ ] Given a bodyweight exercise (is_bodyweight=true), When the drawer opens, Then stats show max reps and last session reps (not weight)
- [ ] Given the user's unit preference is "lb", When the drawer opens, Then all weights are displayed in lb with proper conversion
- [ ] Given the drawer is loading data, When the user opens it, Then placeholder/loading state is visible briefly before data appears
- [ ] Given the stats section is visible, When VoiceOver/TalkBack is active, Then all stats have descriptive accessibility labels
- [ ] Given the drawer is opened for an exercise, When data loads, Then it fetches in <50ms with no visible loading flash (no caching needed)
- [ ] Existing exercise metadata (category, muscles, instructions) still displays correctly below the stats section
- [ ] PR passes all existing tests, no regressions
- [ ] No new lint warnings

### Test Budget: CRITICAL CONSTRAINT
Test count is **1800/1800** — budget is FULL.
- **Consolidate existing tests** to free up 2 slots before adding new ones
- Target: merge single-assertion `it()` blocks in related test files
- 1 test for `useExerciseDrawerStats` hook: loading, loaded with history, loaded without history
- 1 test for `ExerciseDrawerStats` component: renders stats, renders empty state, respects units

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise with no history (first time) | "No history yet — complete your first set!" message, no stats row |
| Bodyweight exercise (weight=0) | Show max reps, last session reps — not weight |
| Duration-tracked exercise | Show max duration in mm:ss format |
| Very large numbers (1000kg+) | Numbers display correctly, no overflow |
| Drawer opened rapidly for different exercises | Previous data clears, new data loads without flicker |
| DB error during fetch | Stats section shows "—" placeholders, existing drawer content unaffected |
| Exercise with only warmup sets in history | "No history yet" (warmups are excluded from records) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Slow query on large history | Low | Low | Queries already indexed; limit=1 for last session |
| Test budget overflow | Medium | High | Must consolidate before adding new tests |
| Drawer height change causing layout issues | Low | Medium | Use existing BottomSheet snap points; test on small screens |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED** (2026-04-19)

- **Regression risk**: LOW — additive feature, no existing UI modified, read-only DB calls, clean rollback path
- **Cognitive load**: REDUCES — eliminates context-switch to exercise detail page, zero new decisions for user, compatible with existing mental model
- **Security**: No concerns — local SQLite, parameterized queries, read-only
- **Accessibility**: Well specified (roles, labels, loading state). Minor suggestion: add `accessibilityLiveRegion="polite"` on stats container
- **Edge cases**: Thorough coverage. Mixed-mode exercises (bodyweight→weighted over time) handled correctly by `is_bodyweight` check
- **Test budget**: 2-test target is lean and appropriate given 1800/1800 constraint
- **Recommendations** (non-blocking): (1) Consider relative time for last session date, (2) Invalidate stats cache when user completes a set for that exercise during current workout

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (v2) — all issues from initial review addressed.

**Architecture**: Compatible with existing patterns. Small scope (~4 files, ~150 lines), no new deps. ✅

**Issues Found (must fix)**:
1. **`getBestSet()` missing**: Plan uses `getExerciseRecords()` for "Best: 105kg × 5" but that returns independent max_weight/max_reps from different sets. Must use `getBestSet(exerciseId)` (already exists at `lib/db/exercise-history.ts:326`) for accurate display.
2. **"Last Session" data source wrong**: `getExerciseHistory` returns session aggregates, not individual sets. Either simplify UX to aggregates (recommended) or add a new set-level query.
3. **Caching won't work**: Drawer content is conditionally rendered (`{detailExercise && ...}`), so hook state is lost on close. Recommend dropping caching for v1 — queries are fast (~10ms indexed).

**Simplification recommendations**: Use `exercise.id` directly (already available), drop per-set last-session display for v1, drop caching for v1.

### CEO Decision
**APPROVED** (2026-04-19, v2)

All three TL issues addressed:
1. ✅ **`getBestSet()` added** — "Best" display now uses the accurate paired weight×reps from the single highest-e1RM set
2. ✅ **Last Session simplified to aggregates** — shows max_weight, max_reps, set_count, volume from `getExerciseHistory` (no per-set detail in v1)
3. ✅ **Caching dropped for v1** — queries are ~10ms indexed, drawer is conditionally rendered (hook state lost on close anyway)

QD's accessibility recommendation (`accessibilityLiveRegion="polite"`) added to scope.

**Ready for implementation.**
