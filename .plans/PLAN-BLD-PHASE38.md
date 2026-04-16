# Feature Plan: Smart Exercise Substitutions

**Issue**: BLD-240
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT → IN_REVIEW (v2 — addressing QD + Techlead feedback)

## Problem Statement

When a gym machine is occupied or unavailable, users need to quickly find an equivalent exercise targeting the same muscles. Currently, the only option is to browse the full exercise library and mentally filter by muscle group, equipment, and difficulty — this is high cognitive overhead during an active workout when focus should be on training, not searching.

This directly serves FitForge's core goals:
- **Zero friction set logging** — swap should be 2 taps, not a 30-second browse
- **Minimal cognitive overload** — the app does the thinking, not the user

## User Stories

- As a gym user, I want to swap an exercise mid-workout when a machine is taken, so that I can continue training the same muscles without interruption
- As a beginner, I want to see alternatives ranked by similarity so I don't accidentally swap to a completely different movement pattern
- As a home gym user, I want to filter swaps by equipment I have so I only see exercises I can actually do

## Proposed Solution

### Overview

Add a "Swap" button on each exercise card in the active workout screen. Tapping it opens a bottom sheet showing ranked alternatives. The ranking algorithm scores exercises by:
1. Primary muscle overlap (highest weight)
2. Secondary muscle overlap
3. Equipment match
4. Category match (compound vs isolation)
5. Difficulty proximity

Selecting an alternative replaces **only pending (uncompleted) sets** in the current session. Completed sets retain their original exercise for history accuracy. An undo snackbar provides a 5-second recovery window.

### UX Design

#### Entry Point
- Each exercise card in the active workout (`app/session/[id].tsx`) gets a "Swap" icon button (swap-horizontal icon) in the exercise header, next to the existing "Details" button
- Touch target: **minimum 56×56dp** per active workout accessibility rules
- Also available from exercise detail view (info modal) via a "Find Alternatives" button

#### Swap Bottom Sheet
- Opens a bottom sheet (reusing existing `@gorhom/bottom-sheet` pattern)
- Header: "Alternatives for {Exercise Name}"
- Subheader: "Targeting: {primary muscles}" (chips showing target muscles)
- List of alternatives, each showing:
  - Exercise name
  - Match percentage badge (e.g., "92% match")
  - Equipment tag (e.g., "Dumbbell", "Barbell", "Cable")
  - Primary + secondary muscles (small chips)
  - Difficulty indicator
- List sorted by match score descending
- Maximum 20 results shown
- **Equipment filter chips** at the top (show only exercises using selected equipment)
- **Equipment filter empty state**: "No alternatives with this equipment. Try removing the filter."
- Tap an alternative → confirmation: "Replace {Old} with {New}?" → swap

#### After Swap
- **Only pending (uncompleted) sets** have their `exercise_id` changed to the new exercise. Completed sets retain the original `exercise_id` to preserve workout history accuracy.
- Weight and rep values on pending sets are preserved** **always the user adjusts manually if needed. (Simplicity over magic — per Techlead recommendation.) 
- Rest timer uses the **new exercise's** configured rest seconds (or default 90s).
- **Undo snackbar**: A Snackbar appears for 5 seconds with "Swapped to {New Exercise} — UNDO" action. Tapping Undo reverts all pending sets back to the original exercise_id and restores any changed values. Uses existing `SnackbarProvider`.
- A subtle "Swapped from {Original}" label appears on the exercise group header in history view, so users can see what was originally programmed.
- The swap is NOT propagated back to the template — it's session-local only.

#### Empty States
- **No alternatives found** (unlikely for most exercises): "No alternatives found. Try adding the exercise manually."
- **No primary muscles defined** on the source exercise: "No muscle data for this exercise — can't suggest alternatives."

### Technical Approach

#### Scoring Algorithm (`lib/exercise-substitutions.ts`)

```typescript
type SubstitutionScore = {
  exercise: Exercise;
  score: number; // 0-100
  matchDetails: {
    primaryOverlap: number;   // 0-50 points
    secondaryOverlap: number; // 0-20 points
    equipmentMatch: number;   // 0-15 points
    categoryMatch: number;    // 0-10 points
    difficultyProx: number;   // 0-5 points
  };
};

function scoreSubstitution(source: Exercise, candidate: Exercise): number;
function findSubstitutions(source: Exercise, allExercises: Exercise[], limit?: number): SubstitutionScore[];
```

Scoring breakdown:
- **Primary muscle overlap** (50 pts max): `(intersection of primary muscles / union of primary muscles) * 50`. Full overlap = 50, partial = proportional
- **Secondary muscle overlap** (20 pts max): Same formula as primary, scaled to 20
- **Equipment match** (15 pts max): Same equipment = 15, same equipment group (see grouping below) = 8, different = 0
- **Category match** (10 pts max): Same category = 10, different = 0
- **Difficulty proximity** (5 pts max): Same difficulty = 5, ±1 level = 3, ±2 = 1, more = 0

**Minimum threshold: 20 points** (lowered from 30 per QD recommendation — cable fly scores ~28 vs bench press but IS a valid substitute).

**Source exercise exclusion**: The source exercise is always excluded from results (per Techlead recommendation).

#### Equipment Grouping (matches `lib/types.ts` Equipment type exactly)

| Group | Equipment Values |
|-------|-----------------|
| Free weights | `barbell`, `dumbbell`, `kettlebell` |
| Machines | `machine`, `cable` |
| Bodyweight | `bodyweight` |
| Accessories | `band`, `other` |

Same group = 8pts, same exact equipment = 15pts, different group = 0pts.

#### Database/Query Layer (`lib/db/exercises.ts`)

Use existing `getAllExercises` function to fetch all non-deleted exercises. The scoring runs client-side since the exercise library is bounded (typically 200-500 exercises) and the scoring is O(n) with small constant factors.

No new database tables or schema changes needed.

#### UI Components

1. **SwapButton** — icon button added to exercise group header in `app/session/[id].tsx`
   - Minimum touch target: 56×56dp
   - Icon: `swap-horizontal` from Material Community Icons
2. **SubstitutionSheet** — new bottom sheet component (`components/SubstitutionSheet.tsx`)
   - Uses `@gorhom/bottom-sheet` (already a dependency)
   - Accepts: `sourceExercise`, `onSelect`, `onDismiss`
   - Internally calls `findSubstitutions()` and renders the ranked list
   - Uses `useMemo` to cache scored results; equipment filter filters the pre-scored array (no re-scoring on filter change)
3. **MatchBadge** — small component showing match percentage with color coding:
   - 80-100%: green
   - 60-79%: amber
   - 20-59%: red/orange

#### Session Swap Logic (`lib/db/sessions.ts`)

Add `swapExerciseInSession(sessionId, oldExerciseId, newExerciseId)`:
- Updates only **uncompleted** `workout_sets` rows for this session+exercise: changes `exercise_id` from old to new
- Completed sets (where `completed = 1`) are **never modified** — they retain the original `exercise_id` for history accuracy
- Weight and rep values are **always preserved** on swapped sets (user adjusts manually if needed)
- Returns the list of modified set IDs (for undo support)

Add `undoSwapInSession(setIds, originalExerciseId)`:
- Reverts the specified sets back to `originalExerciseId`
- Called by the undo snackbar action within 5s window

### Scope

**In Scope:**
- Swap button on exercise cards in active workout screen (56×56dp touch target)
- Substitution scoring algorithm with 5-factor ranking
- Bottom sheet with ranked alternatives list
- Equipment filter chips in the bottom sheet (with empty state)
- Session-local swap (changes exercise_id on **uncompleted** workout_sets only)
- Undo snackbar (5s window) using existing SnackbarProvider
- "Swapped from {Original}" indicator in session history
- Accessibility labels on all interactive elements
- Source exercise excluded from substitution results

**Out of Scope:**
- Propagating swaps back to templates (future phase)
- User-defined swap preferences/favorites (future phase)
- "Swap history" tracking beyond the session-local indicator (future phase)
- Machine learning or collaborative filtering for recommendations (overkill for this scope)
- Swap during template editing (template already has full exercise picker)
- Weight-clearing logic based on equipment/category change (user adjusts manually — simpler, less error-prone)

### Acceptance Criteria

- [ ] Given an active workout with exercises, When user taps the swap icon (56×56dp touch target) on an exercise card, Then a bottom sheet opens showing ranked alternatives
- [ ] Given the swap bottom sheet is open, When alternatives are displayed, Then each shows name, match percentage, equipment, muscles, and difficulty
- [ ] Given an exercise with primary_muscles=["chest", "triceps"], When finding substitutions, Then exercises with chest+triceps score highest (>80%)
- [ ] Given the alternative list, When user taps an alternative, Then a confirmation dialog appears: "Replace {Old} with {New}?"
- [ ] Given user confirms the swap, When the swap completes, Then only uncompleted sets change exercise_id, completed sets retain the original, weight/reps are preserved, and an undo snackbar appears for 5s
- [ ] Given the undo snackbar is visible, When user taps "Undo" within 5s, Then all swapped sets revert to the original exercise
- [ ] Given the swap is performed, When viewing the session history, Then a "Swapped from {Original}" label is visible on the exercise group
- [ ] Given the swap bottom sheet, When equipment filter chips are tapped, Then the list filters to show only exercises with matching equipment
- [ ] Given equipment filter is active and no exercises match, When viewing the list, Then an empty state message appears: "No alternatives with this equipment. Try removing the filter."
- [ ] Given an exercise with no good alternatives (score < 20 for all), When swap sheet opens, Then an empty state message is shown
- [ ] Given an exercise with no primary_muscles defined, When swap icon is tapped, Then an empty state message: "No muscle data — can't suggest alternatives"
- [ ] Given a screen reader is active, When navigating the swap flow, Then all buttons, list items, and badges have descriptive accessibility labels
- [ ] Given the swap is performed, When the rest timer auto-starts, Then it uses the new exercise's configured rest seconds (or default 90s)
- [ ] Given the source exercise, When substitution results are computed, Then the source exercise itself is NOT in the results list
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise has no primary muscles defined | Show empty state: "No muscle data — can't suggest alternatives" |
| Only 1-2 alternatives exist (small library) | Show whatever exists, even if low scores. No minimum count. |
| User has custom exercises | Include custom exercises in substitution candidates |
| Deleted exercises | Exclude soft-deleted exercises from substitution candidates |
| Swap mid-set (some sets completed) | Only pending sets get the new exercise_id. Completed sets keep original exercise for history. |
| Same exercise selected as swap | No-op — dismiss sheet, no toast |
| Very large exercise library (500+) | Scoring is O(n) — should compute in <50ms. useMemo caches results. |
| Swap cancellation (user dismisses sheet) | No changes to session |
| Equipment filter shows no results | "No alternatives with this equipment. Try removing the filter." |
| User taps Undo after 5s window expires | Snackbar dismissed, swap is permanent |
| All sets for an exercise are completed | Swap button still available but swap is effectively a no-op (no pending sets to change). Show info toast: "All sets completed — nothing to swap." |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Scoring algorithm produces poor suggestions | Medium | Medium | Tune weights via manual testing with common exercises. Primary muscle overlap dominates (50/100). Threshold lowered to 20 for edge cases. |
| Performance on large exercise libraries | Low | Low | O(n) scoring with ~500 exercises = negligible. useMemo caches results. |
| User accidentally swaps and loses set data | Low | Medium | Confirmation dialog before swap. 5s undo snackbar. Completed sets never modified. |
| Equipment grouping doesn't match user expectations | Medium | Low | Conservative grouping matching actual Equipment type. Can be refined based on feedback. |
| Undo window too short | Low | Low | 5s is standard Material Design pattern. Completed sets are safe regardless. |

## Changes from v1 (addressing reviewer feedback)

### QD Critical Issues — All Resolved
1. **[C1] Destructive swap corrupts history** — FIXED: Only uncompleted sets are swapped. Completed sets retain original exercise_id.
2. **[C2] Rest timer contradiction** — FIXED: Plan body now consistently says "new exercise's rest seconds".
3. **[C3] No undo** — FIXED: Added 5s undo snackbar using existing SnackbarProvider.
4. **[C4] Weight clearing too coarse** — RESOLVED DIFFERENTLY: Dropped weight-clearing entirely (per Techlead recommendation). User adjusts manually. Simpler and less error-prone.
5. **[C5] Touch target size** — FIXED: Swap icon explicitly specifies 56×56dp minimum.

### QD Major Recommendations — Addressed
- Threshold lowered from 30→20 ✅
- Equipment filter empty state added ✅
- "Swapped from {X}" indicator in history added ✅
- Re: extending ExercisePickerSheet — decided AGAINST. ExercisePickerSheet handles category-based browsing with search. SubstitutionSheet has fundamentally different UX: ranked scoring, match badges, equipment filters, confirmation flow. Sharing would over-complicate both components.

### Techlead Recommendations — All Addressed
1. Equipment grouping fixed to match actual `lib/types.ts` Equipment type ✅
2. Weight-clearing logic dropped (always preserve) ✅
3. Source exercise excluded from results ✅
4. useMemo for caching scored results ✅

## Review Feedback

### Quality Director (UX Critique)
**v1 Verdict: NEEDS REVISION** — Reviewed 2026-04-16
See v1 issues above — all 5 critical issues addressed in v2.

**v2 Review: APPROVED** — Reviewed 2026-04-16. All 5 critical issues resolved. C4 alternative (always preserve weights) is superior to original suggestion. Minor implementation notes: verify `accessibilityViewIsModal`, respect `useReducedMotion()`, match badge text >=14pt bold.

### Tech Lead (Technical Feasibility)
**v1 Verdict: APPROVED** (with minor recommendations) — Reviewed 2026-04-16
All 4 recommendations incorporated into v2.

**v2 Review**: **APPROVED** — All 4 recommendations incorporated. No blocking issues. Ready for implementation.

### CEO Decision
All v1 feedback addressed in v2. Awaiting re-review from Quality Director and confirmation from Tech Lead.
