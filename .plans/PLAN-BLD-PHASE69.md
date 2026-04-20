# Feature Plan: Post-Workout Muscle Coverage Map on Session Summary

**Issue**: BLD-441 (planning), BLD-442 (implementation)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

After completing a workout, the session summary shows sets completed, PRs, weight increases, and comparison to the previous session. However, there's no **visual representation of which muscles were trained**. Users finish a workout wondering "Did I hit everything I intended?" or "What should I train next?" The muscle map — already used in the recovery heatmap and exercise detail screens — would provide instant visual feedback on workout coverage.

This is especially valuable for:
- **Non-program users** who train ad-hoc and need to track muscle balance manually
- **Users building their own splits** who want to verify they're covering all target muscle groups
- **Users planning their next workout** — seeing what was just trained helps decide what to train tomorrow

## User's Emotional Journey

**WITHOUT this feature**: "I just finished chest and shoulders... did I hit any back? I think I did some rows. Let me scroll through the summary... hard to tell which muscle groups were actually covered."

**AFTER**: "Nice — the muscle map lights up exactly what I hit. Chest and front delts are solid, but I see my back isn't lit up much. I'll plan a pull workout for tomorrow." The user feels informed, in control, and confident about their training balance.

## User Stories

- As a gym-goer who just finished a workout, I want to see which muscles I trained so I can feel satisfied and plan my next session
- As a user building my own split routine, I want visual confirmation that I hit all intended muscle groups so I can identify any gaps

## Proposed Solution

### Overview

Add a `MusclesWorkedCard` component to the session summary screen. The card renders the existing `MuscleMap` component with muscles highlighted based on the exercises performed during the session. Primary muscles show at high intensity, secondary muscles at lower intensity. The card appears between the ComparisonCard and the SetsCard in the summary flow.

### UX Design

- **Position**: After the ComparisonCard (or after PRsCard/WeightIncreasesCard if no comparison), before the SetsCard
- **Layout**: A Card containing:
  - Title: "Muscles Worked"
  - MuscleMap body visualization (front view, using existing component)
  - Below the map: a compact text list of muscle groups grouped by intensity (e.g., "Primary: Chest, Shoulders · Secondary: Triceps, Core")
- **Interactions**: View-only — no taps needed. The card is informational.
- **Accessibility**: accessibilityLabel listing all muscle groups worked (e.g., "Muscles worked: primary chest, shoulders. Secondary triceps, core.")
- **Empty state**: If no exercises have muscle data (unlikely but possible with custom exercises), don't show the card
- **Dark/light mode**: MuscleMap already handles theming via gender-based body SVG

### Technical Approach

#### Data Pipeline

1. The summary already loads `grouped` data (exercise groups with sets) via `useSummaryData`
2. Each exercise has `primary_muscles` and `secondary_muscles` in the exercises table
3. Need to query muscle groups for all exercises in the completed session
4. Aggregate: if a muscle appears as primary in ANY exercise, it's primary; otherwise secondary
5. Pass aggregated muscle groups to MuscleMap component

#### New Files (1)

1. **`components/session/summary/MusclesWorkedCard.tsx`**
   - Props: `exerciseIds: string[]`, `colors: ThemeColors`, `unit: "kg" | "lb"` (for consistency)
   - Internally queries exercise muscle data using the existing `getExercisesByIds` function
   - Or better: receives pre-computed muscle data from useSummaryData to avoid extra queries
   - Renders MuscleMap + muscle group text list

#### Modified Files (2)

1. **`hooks/useSummaryData.ts`** — Add muscle group aggregation to the data loading:
   - After loading grouped exercises, extract unique exercise IDs
   - Query exercise records to get primary/secondary muscles (may already be available from existing queries)
   - Compute `primaryMuscles: MuscleGroup[]` and `secondaryMuscles: MuscleGroup[]`
   - Return in the summary data object

2. **`app/session/summary/[id].tsx`** — Add MusclesWorkedCard to the FlatList:
   - Add `{ key: "muscles" }` to the listData array (always show if there are exercises)
   - Render MusclesWorkedCard with the computed muscle data

### Scope

**In Scope:**
- MusclesWorkedCard component with MuscleMap visualization
- Aggregation of primary/secondary muscles from session exercises
- Text summary of muscle groups below the map
- Accessibility labels
- Dark/light mode support (via existing MuscleMap theming)
- ~5 tests: card renders with muscles, empty state, primary/secondary aggregation logic, a11y

**Out of Scope:**
- Muscle volume/set count per muscle (exists in progress tab already)
- Tappable muscles (no navigation from summary)
- Rear body view (front view only — matches existing MuscleMap usage)
- Comparison of muscles worked vs last session
- Integration with recovery heatmap (separate feature)

### Acceptance Criteria

- [ ] Given a completed workout with exercises → MusclesWorkedCard appears in summary
- [ ] Given exercises with primary_muscles [chest, shoulders] and secondary [triceps] → map highlights chest/shoulders at high intensity and triceps at lower intensity
- [ ] Given all exercises have no muscle data → MusclesWorkedCard is NOT shown
- [ ] Card has accessibilityLabel listing all worked muscle groups
- [ ] MuscleMap renders correctly in both dark and light mode
- [ ] Text list below map shows "Primary: X, Y · Secondary: Z" format
- [ ] Card appears after PRs/comparison cards, before the SetsCard
- [ ] No regressions on existing summary behavior
- [ ] ~5 tests covering: render, muscle aggregation, empty state, a11y
- [ ] No new lint warnings or TS errors

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| All exercises bodyweight (e.g., push-ups, pull-ups) | Normal rendering — bodyweight exercises have muscle data |
| Custom exercise with no muscles defined | Skip that exercise in aggregation; if ALL have no muscles, hide card |
| Single exercise workout | Show only that exercise's muscles |
| Superset exercises | All exercises contribute to the map |
| Same muscle primary in one exercise, secondary in another | Show as primary (highest wins) |
| Very many muscle groups (full-body workout) | All light up — looks great, no layout issues |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| MuscleMap performance on summary | Low | Low | Already renders fine in exercise detail and recovery heatmap |
| Extra DB query on summary load | Low | Low | Can piggyback on existing exercise metadata query |
| Gender-based body model mismatch | Low | Low | Already handled by existing MuscleMap + useProfileGender |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
_Pending review_

### Quality Director (Release Safety)
**Verdict: APPROVED** (2026-04-20T13:37Z)

- **Regression risk**: Low — additive, read-only feature. No schema changes, no writes. Existing summary cards untouched.
- **Security**: No concerns — read-only, no user input, no external data.
- **Data integrity**: No risk — no migrations, no writes.
- **Edge cases**: Well covered (empty muscles, primary-wins-over-secondary, single exercise).
- **Test coverage**: ~5 tests planned; adequate for scope. Test budget tight (7 remaining) — keep to ≤5.
- **Recommendation**: Wrap MusclesWorkedCard in error boundary for defensive safety.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
