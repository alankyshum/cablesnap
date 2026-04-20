# Feature Plan: Exercise Reorder in Active Workout Session (Phase 62)

**Issue**: BLD-410
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

During a workout, equipment availability changes constantly. The squat rack frees up, the bench gets taken, someone is using the cable machine. Users are forced to complete exercises in the template's fixed order, even when their environment demands flexibility.

Currently, exercises can be reordered in templates (edit mode) but NOT during an active workout session. Users must either:
1. Skip ahead mentally and scroll past exercises (losing track)
2. Wait for equipment (wasting time)
3. Delete and re-add exercises (losing logged sets and data)

None of these are acceptable for a gym-goer between sets with 30 seconds of attention.

## User's Emotional Journey

**Without this feature**: Frustrated. "The squat rack is free NOW but I'm stuck on exercise 3 and squats are exercise 5. I don't want to lose my logged sets by deleting." The app feels rigid, like a checklist that doesn't adapt to the real gym environment.

**After this feature**: Flexible and in control. "I just tapped the move button and dragged squats to the top. Done in 2 seconds. My logged sets are still there." The app adapts to the gym, not the other way around.

## User Stories

- As a gym-goer, I want to move exercises up or down during my workout so that I can adapt to equipment availability
- As a gym-goer, I want my logged sets to stay intact when I reorder exercises so that I never lose data
- As a gym-goer, I want reordering to be fast (< 2 seconds) so that I can do it between sets without losing focus

## Proposed Solution

### Overview

Add up/down move buttons to the exercise group header in the active workout session. Tapping moves the exercise one position up or down. All logged sets, notes, and metadata travel with the exercise.

### UX Design

**Interaction**: Tap the exercise name area in the group header to reveal a compact move toolbar (↑ ↓ buttons). This keeps the default UI clean while making reorder discoverable.

**Alternative considered**: Long-press drag-and-drop. Rejected because:
- Difficult one-handed with sweaty fingers
- Requires significant motor precision
- Harder to implement accessibly
- FlashList drag support adds complexity

**Chosen approach**: Simple ↑/↓ buttons that appear on tap.

**Flow**:
1. User taps the exercise group header (the exercise name area)
2. A compact toolbar slides in with ↑ (move up) and ↓ (move down) buttons
3. Tapping ↑ or ↓ instantly reorders the exercise
4. Toolbar auto-hides after 3 seconds of inactivity, or user taps elsewhere
5. First exercise disables ↑, last exercise disables ↓

**Accessibility**:
- Move buttons have clear labels: "Move [exercise name] up" / "Move [exercise name] down"
- After move, announce: "[exercise name] moved to position [N]"
- Disabled buttons are marked `accessibilityState={{ disabled: true }}`

### Technical Approach

**State management**: Exercise groups are stored in the `groups` state array in `useSessionData`. Reordering means swapping array positions — no database writes needed during the move (groups is a derived client-side array).

**Persistence**: The visual order is derived from the `set_number` ordering in the database. After reorder, update `set_number` values to reflect the new order. Use `updateSetsBatch` for a single batched write.

**Implementation**:
1. Add `onMoveUp(exerciseId)` and `onMoveDown(exerciseId)` callbacks to `useSessionActions`
2. These callbacks reorder the `groups` array in state (instant UI update)
3. Then batch-update `set_number` values in the database to persist the new order
4. Pass callbacks through `ExerciseGroupCard` → `GroupCardHeader`
5. Add a `reorderMode` state (which exercise is showing the toolbar) managed at session level

**Files to modify**:
| File | Change |
|------|--------|
| `hooks/useSessionActions.ts` | Add `handleMoveUp`, `handleMoveDown` callbacks |
| `components/session/GroupCardHeader.tsx` | Add move toolbar UI (↑/↓ buttons on tap) |
| `components/session/ExerciseGroupCard.tsx` | Pass move callbacks and reorder state |
| `app/session/[id].tsx` | Wire new callbacks through to group cards |
| `lib/db/session-sets.ts` | Add `reorderExerciseSets(sessionId, exerciseIds[])` function |

**No new files needed** — this integrates into existing components.

### Scope

**In Scope**:
- Move exercise up/down in active session via ↑/↓ buttons
- All logged sets travel with the exercise
- Persisted to database (survives app restart)
- Works with supersets (linked exercises move as a group)
- Accessibility labels and announcements

**Out of Scope**:
- Drag-and-drop reordering (complex, poor gym UX)
- Reorder individual sets within an exercise (already have this via set_number)
- Reorder across superset boundaries (move entire superset group instead)
- Undo reorder (user can just move back)

### Acceptance Criteria

- [ ] Given an active session with 3+ exercises, when user taps exercise header, then ↑/↓ move buttons appear
- [ ] Given user taps ↑ on exercise 2, then it moves to position 1 and all its sets come with it
- [ ] Given user taps ↓ on exercise 1, then it moves to position 2 and all its sets come with it
- [ ] Given exercise is first, ↑ button is disabled; given exercise is last, ↓ button is disabled
- [ ] Given a superset (linked exercises), the entire superset group moves together
- [ ] Given user reorders then backgrounds the app, when they return the order is preserved
- [ ] Given screen reader active, move buttons have descriptive labels and position is announced after move
- [ ] Existing session functionality unaffected (set logging, rest timer, PR detection, plate hints, etc.)
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint . --ext .ts,.tsx --quiet` → 0 errors
- [ ] `npx jest` → all existing tests pass

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Single exercise session | No move buttons shown (nothing to reorder) |
| Two exercises | ↑ on first disabled, ↓ on first works, vice versa for second |
| Superset group | Entire linked group moves as one unit |
| Move during rest timer | Timer continues unaffected |
| Move then complete set | Set logs to the correct (moved) exercise |
| Move then add new set | New set added to correct exercise at new position |
| Completed exercises | Can still be reordered (user may want to reorganize for next workout reference) |
| Rapid sequential moves | Each move processes in order, no race conditions |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `set_number` update conflicts with other writes | Low | Medium | Use transaction for batch update |
| FlashList key stability during reorder | Medium | Low | Use exercise_id as key (stable across position changes) |
| Move toolbar blocking header content | Low | Low | Compact design, auto-hide after 3s |

## Review Feedback

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** — Reviewed 2026-04-20T00:33:00Z

**CRITICAL issues (must fix before implementation):**
1. **Persistence mechanism is wrong** — `set_number` controls intra-exercise set ordering, NOT inter-exercise position. `getSessionSets()` orders by `exercise_id ASC` (UUID alphabetical). A schema migration adding an explicit `exercise_order` column is required for AC #6 (persist across restart) to work. Use idempotent `ALTER TABLE ADD COLUMN` with `PRAGMA table_info` guard per BLD-376 learning.
2. **Superset adjacency assumption** — `useSessionData.ts` line 51-55 groups exercises by `link_id`. If reorder makes linked exercises non-adjacent in the query result, superset rendering will break. Verify and fix grouping logic.

**MAJOR issues (should fix):**
3. Touch target size: ↑/↓ buttons must be ≥56×56dp for active workout screens (sweaty hands).
4. Focus management: Specify where screen reader focus goes after reorder. Use `AccessibilityInfo.announceForAccessibility()` AND keep focus on the moved exercise.

**Positive notes:**
- Feature concept is sound — genuinely reduces cognitive load
- ↑/↓ buttons superior to drag-and-drop for gym context
- Auto-hide toolbar is good UX
- A11y spec is above average for BLD plans
- No security concerns (local SQLite only)

**Additional edge cases to cover:**
- Move exercise with active rest timer
- Move while keyboard is open (dismiss first)
- Reorder then undo last completed set

**Recommendations:** Add haptic pulse on move, reset auto-hide timer on each tap, animate with `useReducedMotion()` respect.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
