# Feature Plan: Inline Previous Performance on Exercise Cards

**Issue**: BLD-445 (planning)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

During a workout, the #1 question gym-goers ask themselves before each exercise is: **"What did I do last time?"** CableSnap already answers this — but it requires tapping "Details" to open the ExerciseDrawerStats drawer. That's an extra tap per exercise, multiplied across 5-8 exercises per session, for every single workout.

The data exists. The infrastructure exists (`getExerciseHistory` in `lib/db/exercise-history.ts`). But it's hidden behind a tap. Surfacing it inline — directly on the exercise card — eliminates that friction entirely.

## User's Emotional Journey

**Without this feature:**
- User starts bench press → pauses → "What weight did I use last time?" → taps Details → reads stats → closes drawer → enters weight
- This happens for EVERY exercise. 5-8 extra taps per workout, each one breaking flow.
- The user feels uncertain: "Am I progressing? Am I using the right weight?"

**After this feature:**
- User starts bench press → immediately sees "Last: 3 sets · 80kg × 8" below the exercise name
- Instantly knows what to match or beat
- Feels confident and in control — no guessing, no extra taps

## User Stories

- As a gym-goer, I want to see what I did last time for each exercise at a glance so that I can decide my working weight without tapping into details.
- As a user tracking progressive overload, I want instant context on my previous performance so that I can ensure I'm progressing each session.

## Proposed Solution

### Overview

Add a single line of text below each exercise name in the workout session view, showing a compact summary of the last completed session for that exercise. Format: `Last: 3 sets · 80kg × 8` (or `Last: 3 sets · 8 reps` for bodyweight exercises).

### UX Design

- **Position**: Below exercise name in `GroupCardHeader`, above the "Details" button row
- **Format**: `Last: {set_count} sets · {max_weight}{unit} × {max_reps}` for weighted exercises
  - Bodyweight: `Last: {set_count} sets · {max_reps} reps`
  - Duration-based: `Last: {set_count} sets · {formatted_duration}`
- **Styling**: `fontSizes.xs`, `colors.onSurfaceVariant`, no bold — subtle, not competing with primary content
- **Empty state**: No text shown (no "No previous data" — that adds clutter)
- **Loading**: No spinner — the text appears when data loads, or not at all
- **Accessibility**: `accessibilityLabel` like "Last session: 3 sets, best 80 kilograms for 8 reps"

### Technical Approach

#### 1. New hook: `usePreviousPerformance`

Create `hooks/usePreviousPerformance.ts`:
- Input: array of exercise IDs (all exercises in the current session)
- Output: `Record<string, PreviousPerformance | null>`
- Uses existing `getExerciseHistory(exerciseId, 1, 0)` to fetch the last completed session
- Batches fetches with `Promise.all` for efficiency
- Caches results for the session duration (no refetching on re-render)

```typescript
type PreviousPerformance = {
  setCount: number;
  maxWeight: number;
  maxReps: number;
  isBodyweight: boolean;
  maxDuration?: number | null;
};
```

#### 2. New pure function: `formatPreviousPerformance`

In `lib/format.ts`:
- Input: `PreviousPerformance | null`, `unit: "kg" | "lb"`
- Output: `string | null`
- Returns formatted string like "Last: 3 sets · 80kg × 8" or null if no data

#### 3. Modified `GroupCardHeader`

- Accept optional `previousPerformance?: string | null` prop
- Render below exercise name when non-null
- Minimal visual footprint

#### 4. Modified `ExerciseGroupCard` and `app/session/[id].tsx`

- Thread `previousPerformance` data from hook through to GroupCardHeader

### Scope

**In Scope:**
- Compact "Last: X sets · Ykg × Z" text on exercise cards during workout
- Fetching last session data for all exercises in the workout (batch)
- Formatting for weighted, bodyweight, and duration-based exercises
- Accessibility labels
- 1 test for `formatPreviousPerformance` (multiple assertions in one `it()` block)
- Test consolidation: net ≤0 new tests (consolidate 2+ existing tests)

**Out of Scope:**
- Showing individual set breakdowns (just aggregate summary)
- Tapping the text for navigation or expanded view
- Showing performance from more than 1 previous session
- Comparison indicators (arrows, colors, percentages)
- Loading spinners or skeleton states

### Acceptance Criteria

- [ ] Given a weighted exercise with ≥1 completed session → "Last: N sets · Wkg × R" appears below exercise name
- [ ] Given a bodyweight exercise with ≥1 completed session → "Last: N sets · R reps" appears below exercise name
- [ ] Given a duration-based exercise with ≥1 completed session → "Last: N sets · M:SS" appears below exercise name
- [ ] Given an exercise never done before → no previous performance text shown
- [ ] Text uses `onSurfaceVariant` color, `fontSizes.xs`
- [ ] accessibilityLabel describes the previous performance clearly
- [ ] No regressions on existing session UI behavior
- [ ] No new lint warnings or TS errors
- [ ] PR passes all tests
- [ ] Test budget: ≤1799 after changes (must consolidate to get from 1801 → ≤1799)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise never performed | No text shown (empty state) |
| Only warmup sets completed last time | No text shown (warmups are filtered out) |
| Very heavy weight (e.g., 300kg) | Shows correctly: "Last: 5 sets · 300kg × 5" |
| Bodyweight exercise | Shows "Last: 3 sets · 12 reps" (no weight) |
| Duration exercise | Shows "Last: 3 sets · 1:30" |
| User switches unit system | Displays in current user unit preference |
| Multiple exercises in session | Each shows its own previous performance |
| App backgrounded and resumed | Data persists (cached in hook state) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Extra DB queries slow session load | Low | Medium | Batch fetches with Promise.all; data is small |
| Visual clutter on exercise cards | Low | Medium | Subtle styling (xs font, variant color); empty state = no text |
| Test budget exceeded | Medium | High | Must consolidate 3 tests (1801 → 1798 + 1 new = 1799) |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**Verdict: APPROVED** — No blocking UX issues.

**Cognitive Load**: This is a load *reduction*, not an addition. Eliminates 5-8 taps per session. Zero new decisions for the user. Mental model is compatible with existing card structure.

**Visual Hierarchy**: Correct subordination — `fontSizes.xs` + `onSurfaceVariant` keeps it secondary to the exercise name. Position between name and Details row is the natural reading flow.

**Design System**: Uses theme tokens (`colors.onSurfaceVariant`, `fontSizes.xs`). Extends `GroupCardHeader` via optional prop — clean, consistent.

**Accessibility**: a11y label is well-specified. Use Unicode × (U+00D7) in visual text. Contrast meets AA at 12dp.

**Recommendations (non-blocking)**:
1. Sub-minute durations: show "45s" not "0:45"; use "1:30" for >= 1 min
2. Decimal weights: "22.5kg" (1 decimal when non-zero), "80kg" (no ".0")
3. Set `lineHeight: 16` on the text for adequate vertical spacing
4. Use `numberOfLines={1}` with ellipsis to prevent wrapping on narrow screens

### Quality Director (Release Safety)
**Verdict: APPROVED** — 2026-04-20

**Regression risk: LOW.** Feature is additive and read-only. Modifies core session UI components (`GroupCardHeader`, `ExerciseGroupCard`, `app/session/[id].tsx`) but only adds an optional prop — no behavioral changes to existing controls. Warmup filtering verified in `getExerciseHistory` source. Rollback is trivial (remove optional prop).

**Security: No concerns.** Read-only Drizzle ORM queries, no user inputs, no external APIs.

**Data integrity: No concerns.** No writes, no schema changes.

**Test budget: CRITICAL constraint.** At 1799/1800 — consolidation plan is adequate but must be verified at PR review.

**Implementation note:** `ExerciseSession` type from `getExerciseHistory` lacks `is_bodyweight` and `max_duration` fields. Recommend inferring `is_bodyweight` from `max_weight === 0` to avoid extra DB queries.

**No blocking issues found.**

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (with simplification recommendations)

**Key Simplification:** Skip the proposed `usePreviousPerformance` hook. `useSessionData` already calls `getPreviousSetsBatch(exerciseIds, id)` which loads all previous sets. Derive aggregate summary (`set_count`, `max_weight`, `max_reps`) directly from `prevCache` — zero new DB queries, one fewer file.

**Recommended approach:**
1. Compute aggregate from `prevCache` in `useSessionData`
2. Add `previousSummary?: string` field to `ExerciseGroup`
3. Thread through `ExerciseGroupCard` → `GroupCardHeader`
4. Keep `formatPreviousPerformance` pure function in `lib/format.ts`

**Technical concerns:**
- Warmup set filtering: `getPreviousSetsBatch` does NOT filter `set_type != 'warmup'`. Verify and filter if needed.
- Unit conversion: Use `toDisplay()` from `lib/units.ts` — don't display raw stored values.
- Bodyweight: Use existing `is_bodyweight` on `ExerciseGroup`, not a new boolean.

**Effort:** Small (with simplification). **Risk:** Low. **New deps:** None.

_Reviewed 2026-04-20_

### CEO Decision
_Pending reviews_
