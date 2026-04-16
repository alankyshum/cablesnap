# Feature Plan: Smart Exercise Substitutions

**Issue**: BLD-240
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT

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

Selecting an alternative replaces the exercise in the current session (keeping existing set structure) and optionally remembers the swap for future template use.

### UX Design

#### Entry Point
- Each exercise card in the active workout (`app/session/[id].tsx`) gets a "Swap" icon button (swap-horizontal icon) in the exercise header, next to the existing "Details" button
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
- Optional "Equipment" filter chips at the top (show only exercises using selected equipment)
- Tap an alternative → confirmation: "Replace {Old} with {New}?" → swap

#### After Swap
- The exercise in the current session is replaced: exercise_id changes, sets keep their structure (weight/reps cleared if the movement pattern is very different, preserved if similar)
- Rest timer seconds transfer from the original exercise's template setting (or default 90s)
- A subtle toast: "Swapped to {New Exercise}"
- The swap is NOT propagated back to the template — it's session-local only

#### Empty State
- If no alternatives found (unlikely but possible for very niche exercises): "No alternatives found. Try adding the exercise manually."

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
- **Equipment match** (15 pts max): Same equipment = 15, same category (free weight, machine, cable, bodyweight) = 8, different = 0
- **Category match** (10 pts max): Same category (compound/isolation) = 10, different = 0
- **Difficulty proximity** (5 pts max): Same difficulty = 5, ±1 level = 3, ±2 = 1, more = 0

Minimum threshold: 30 points (below this, exercises are too dissimilar to suggest)

#### Equipment Grouping

For the equipment match scoring, group equipment types:
- **Free weights**: barbell, dumbbell, kettlebell, ez_bar
- **Machines**: machine, smith_machine, cable
- **Bodyweight**: bodyweight, suspension
- **Other**: band, medicine_ball, other

Same group = 8pts, same exact equipment = 15pts.

#### Database/Query Layer (`lib/db/exercises.ts`)

Add a function to fetch all non-deleted exercises (already exists as `getAllExercises` or similar). The scoring runs client-side since the exercise library is bounded (typically 200-500 exercises) and the scoring is O(n) with small constant factors.

No new database tables or schema changes needed.

#### UI Components

1. **SwapButton** — icon button added to exercise group header in `app/session/[id].tsx`
2. **SubstitutionSheet** — new bottom sheet component (`components/SubstitutionSheet.tsx`)
   - Uses `@gorhom/bottom-sheet` (already a dependency)
   - Accepts: `sourceExercise`, `onSelect`, `onDismiss`
   - Internally calls `findSubstitutions()` and renders the ranked list
3. **MatchBadge** — small component showing match percentage with color coding:
   - 80-100%: green
   - 60-79%: amber
   - 30-59%: red/orange

#### Session Swap Logic (`lib/db/sessions.ts`)

Add `swapExerciseInSession(sessionId, oldExerciseId, newExerciseId)`:
- Updates all `workout_sets` rows for this session+exercise: changes `exercise_id` from old to new
- If the new exercise has very different movement pattern (different category), clear weight values but keep rep targets
- If similar (same category + primary muscles), preserve weight and rep values

### Scope

**In Scope:**
- Swap button on exercise cards in active workout screen
- Substitution scoring algorithm with 5-factor ranking
- Bottom sheet with ranked alternatives list
- Equipment filter chips in the bottom sheet
- Session-local swap (changes exercise_id on workout_sets)
- Toast confirmation after swap
- Accessibility labels on all interactive elements

**Out of Scope:**
- Propagating swaps back to templates (future phase)
- User-defined swap preferences/favorites (future phase)
- "Swap history" tracking (future phase)
- Machine learning or collaborative filtering for recommendations (overkill for this scope)
- Swap during template editing (template already has full exercise picker)

### Acceptance Criteria

- [ ] Given an active workout with exercises, When user taps the swap icon on an exercise card, Then a bottom sheet opens showing ranked alternatives
- [ ] Given the swap bottom sheet is open, When alternatives are displayed, Then each shows name, match percentage, equipment, muscles, and difficulty
- [ ] Given an exercise with primary_muscles=["chest", "triceps"], When finding substitutions, Then exercises with chest+triceps score highest (>80%)
- [ ] Given the alternative list, When user taps an alternative, Then a confirmation dialog appears: "Replace {Old} with {New}?"
- [ ] Given user confirms the swap, When the swap completes, Then the exercise in the current session changes, sets are preserved, and a toast confirms the swap
- [ ] Given user confirms a swap for exercises with the same category, When weight/rep values exist on sets, Then values are preserved (not cleared)
- [ ] Given user confirms a swap for exercises with different categories, When weight values exist, Then weight values are cleared but rep targets are preserved
- [ ] Given the swap bottom sheet, When equipment filter chips are tapped, Then the list filters to show only exercises with matching equipment
- [ ] Given an exercise with no good alternatives (score < 30 for all), When swap sheet opens, Then an empty state message is shown
- [ ] Given a screen reader is active, When navigating the swap flow, Then all buttons, list items, and badges have descriptive accessibility labels
- [ ] Given the swap is performed, When the rest timer auto-starts, Then it uses the new exercise's configured rest seconds (or default 90s)
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
| Swap mid-set (some sets completed) | Swap applies to ALL sets (completed and pending). Completed set data is preserved as-is (weight/reps stay). |
| Same exercise selected as swap | No-op — dismiss sheet, no toast |
| Very large exercise library (500+) | Scoring is O(n) — should compute in <50ms. No pagination needed. |
| Swap cancellation (user dismisses sheet) | No changes to session |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Scoring algorithm produces poor suggestions | Medium | Medium | Tune weights via manual testing with common exercises. Primary muscle overlap dominates (50/100). |
| Performance on large exercise libraries | Low | Low | O(n) scoring with ~500 exercises = negligible. Could add memoization if needed. |
| User accidentally swaps and loses set data | Low | High | Confirmation dialog before swap. Weight/reps preserved when possible. |
| Equipment grouping doesn't match user expectations | Medium | Low | Conservative grouping. Can be refined based on feedback. |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
