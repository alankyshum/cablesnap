# Feature Plan: Exercise Reorder in Active Workout Session (Phase 62)

**Issue**: BLD-410
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT → IN_REVIEW (Rev 2 — addressing QD + TL feedback)

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

**Interaction**: Always-visible ↑/↓ buttons in the GroupCardHeader, right-aligned. No tap-to-reveal — permanently visible is more discoverable for tired gym users and requires less state management. (Rev 2: accepted TL recommendation to drop toolbar reveal pattern.)

**Alternative considered and rejected**:
- Long-press drag-and-drop: difficult one-handed with sweaty fingers, poor a11y
- Tap-to-reveal toolbar: less discoverable, more state complexity (TL feedback)

**Chosen approach**: Compact ↑/↓ buttons always visible in group header.

**Flow**:
1. User sees ↑/↓ buttons on each exercise group header (always visible)
2. Tapping ↑ or ↓ instantly reorders the exercise with haptic feedback
3. First exercise disables ↑, last exercise disables ↓
4. Superset exercises: ↑/↓ buttons are hidden (superset reorder deferred — see Out of Scope)

**Touch targets**: ↑/↓ buttons are ≥56×56dp (gym context: sweaty hands). (Rev 2: QD requirement.)

**Accessibility**:
- Move buttons have clear labels: "Move [exercise name] up" / "Move [exercise name] down"
- After move, use `AccessibilityInfo.announceForAccessibility("[exercise name] moved to position [N]")` AND keep screen reader focus on the moved exercise card
- Disabled buttons are marked `accessibilityState={{ disabled: true }}`
- Respect `useReducedMotion()` for animations

**Haptic feedback**: Trigger a light haptic pulse on each successful move (React Native `Haptics.impactAsync(ImpactFeedbackStyle.Light)`).

### Technical Approach

**State management**: Exercise groups are stored in the `groups` state array in `useSessionData`. Reordering means swapping array positions — instant UI update.

**Persistence** (Rev 2 — critical fix per QD + TL):
- ~~Original: Update `set_number` values~~ WRONG — `set_number` is intra-exercise set ordering
- **Fix**: Add `exercise_position INTEGER` column to `workout_sets` table via schema migration
- All sets for the same exercise share one `exercise_position` value
- Change `getSessionSets` ORDER BY from `asc(exercise_id), asc(set_number)` to `asc(exercise_position), asc(set_number)`
- Schema migration uses established `PRAGMA table_info` guard pattern (per BLD-376 learning):
  ```sql
  -- Only add if column doesn't exist
  PRAGMA table_info(workout_sets);
  -- If exercise_position not found:
  ALTER TABLE workout_sets ADD COLUMN exercise_position INTEGER DEFAULT 0;
  ```
- Default value 0 means pre-existing sets render in original order (upgrade-safe)
- On session load, if all positions are 0, auto-assign positions based on current UUID sort order

**Implementation**:
1. Add schema migration for `exercise_position` column in `lib/db/schema.ts` (or migration file)
2. Add `onMoveUp(exerciseId)` and `onMoveDown(exerciseId)` callbacks to `useSessionActions`
3. These callbacks: (a) swap `exercise_position` values in state (instant UI), (b) batch-update `exercise_position` in DB
4. Pass callbacks through `ExerciseGroupCard` → `GroupCardHeader`
5. Add `extraData` version counter on FlashList to trigger re-renders on reorder (TL recommendation)
6. Use transaction for the batch position update to prevent conflicts

**Files to modify**:
| File | Change |
|------|--------|
| `lib/db/schema.ts` (or migration) | Add `exercise_position` column migration with PRAGMA guard |
| `lib/db/session-sets.ts` | Update `getSessionSets` ORDER BY; add `updateExercisePositions` batch function; add position auto-assignment for sessions with all-zero positions |
| `hooks/useSessionActions.ts` | Add `handleMoveUp`, `handleMoveDown` callbacks |
| `components/session/GroupCardHeader.tsx` | Add always-visible ↑/↓ buttons (≥56×56dp), haptic feedback |
| `components/session/ExerciseGroupCard.tsx` | Pass move callbacks, hide buttons for superset exercises |
| `app/session/[id].tsx` | Wire new callbacks, add `extraData` counter to FlashList |

**No new files needed** — this integrates into existing components.

### Scope

**In Scope**:
- Move exercise up/down in active session via always-visible ↑/↓ buttons
- All logged sets travel with the exercise
- Persisted via `exercise_position` column (survives app restart)
- Schema migration with PRAGMA guard for `exercise_position`
- Auto-assign positions for pre-existing sessions (upgrade-safe)
- Accessibility labels, announcements, and focus management
- Haptic feedback on move
- ≥56×56dp touch targets

**Out of Scope**:
- Drag-and-drop reordering (complex, poor gym UX)
- Reorder individual sets within an exercise (already have this via set_number)
- **Superset reorder** — exercises with `link_id` (supersets) will NOT show reorder buttons in this phase. Superset block-move ships in a follow-up. (Rev 2: TL recommendation — contiguity enforcement is complex, defer to avoid scope creep.)
- Undo reorder (user can just move back)
- Reorder in template editor (already exists)

### Acceptance Criteria

- [ ] Given an active session with 3+ non-superset exercises, ↑/↓ buttons are always visible on each exercise header
- [ ] Given user taps ↑ on exercise 2, then it moves to position 1 and all its sets come with it, with haptic feedback
- [ ] Given user taps ↓ on exercise 1, then it moves to position 2 and all its sets come with it, with haptic feedback
- [ ] Given exercise is first, ↑ button is disabled; given exercise is last, ↓ button is disabled
- [ ] Given a superset (linked exercises), ↑/↓ buttons are NOT shown (deferred to follow-up)
- [ ] Given user reorders then backgrounds the app, when they return the order is preserved (via `exercise_position` column)
- [ ] Given an existing session from before this update (all `exercise_position` = 0), exercises render in their original order
- [ ] Given screen reader active, move buttons have descriptive labels, position is announced via `AccessibilityInfo.announceForAccessibility`, and focus stays on moved exercise
- [ ] ↑/↓ buttons are ≥56×56dp touch targets
- [ ] Existing session functionality unaffected (set logging, rest timer, PR detection, plate hints, etc.)
- [ ] Schema migration is idempotent (safe to run multiple times)
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint . --ext .ts,.tsx --quiet` → 0 errors
- [ ] `npx jest` → all existing tests pass

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Single exercise session | No move buttons shown (nothing to reorder) |
| Two exercises | ↑ on first disabled, ↓ on first works, vice versa for second |
| Superset group | ↑/↓ buttons hidden on superset exercises (deferred) |
| Move during rest timer | Timer continues unaffected |
| Move then complete set | Set logs to the correct (moved) exercise |
| Move then add new set | New set added to correct exercise at new position |
| Completed exercises | Can still be reordered |
| Rapid sequential moves | Each move processes in order, no race conditions (transactional writes) |
| Move with active rest timer | Rest timer continues counting, unaffected by position change |
| Move while keyboard is open | Dismiss keyboard first, then perform move |
| Reorder then undo last completed set | Undo targets correct exercise regardless of position change |
| Pre-migration session (all positions = 0) | Auto-assign positions from current UUID sort, preserving original order |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Schema migration fails on some devices | Low | High | Idempotent migration with PRAGMA guard; DEFAULT 0 for upgrade safety |
| `exercise_position` update conflicts with other writes | Low | Medium | Use transaction for batch update |
| FlashList key stability during reorder | Medium | Low | Use exercise_id as key (stable); `extraData` counter for re-renders |
| Pre-existing sessions with all positions = 0 | Certain | Low | Auto-assign positions on load based on current UUID sort order |

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
**Verdict: NEEDS REVISION** — Critical persistence design flaw

**CRITICAL — Persistence mechanism is wrong:**
- `set_number` is per-exercise (orders sets within one exercise), NOT inter-exercise ordering
- `getSessionSets` query: `orderBy(asc(exercise_id), asc(set_number))` — exercise group order comes from UUID sort, not set_number
- **Fix:** Add `exercise_position` column to `workout_sets`. All sets for same exercise share one position value. ORDER BY changes to `asc(exercise_position), asc(set_number)`.
- Requires schema migration using established `PRAGMA table_info` guard pattern.

**MAJOR — Superset block-move mechanics undefined:**
- Plan says supersets move as a group but doesn't detail contiguity enforcement
- What if superset exercises are non-contiguous after partial moves?
- Recommendation: Initially disable reorder on superset exercises; ship block-move in follow-up

**Simplification recommendations:**
1. Drop tap-to-reveal toolbar — add ↑/↓ buttons permanently in GroupCardHeader (more discoverable, less state)
2. Skip auto-hide timer — use toggle instead if keeping reveal pattern
3. Use `extraData` version counter on FlashList to handle reorder re-renders

**Architecture fit:** Compatible with existing patterns once schema is fixed.
**Effort:** Medium. **Risk:** Medium (schema migration). **New deps:** None.

### CEO Decision
**Rev 2 addresses all feedback** — 2026-04-20

Changes made:
1. ✅ **CRITICAL (QD + TL): Schema fix** — Replaced `set_number` approach with `exercise_position` column + idempotent migration with PRAGMA guard. Auto-assign for pre-existing sessions.
2. ✅ **MAJOR (TL): Superset deferred** — Reorder buttons hidden on superset exercises. Block-move ships in follow-up phase.
3. ✅ **TL: Always-visible buttons** — Dropped tap-to-reveal toolbar. ↑/↓ buttons permanently visible in header (more discoverable, less state).
4. ✅ **QD: Touch targets** — ≥56×56dp specified.
5. ✅ **QD: Focus management** — `AccessibilityInfo.announceForAccessibility()` + keep focus on moved card.
6. ✅ **QD: Additional edge cases** — Added rest timer, keyboard dismiss, undo set scenarios.
7. ✅ **QD: Haptic feedback** — Added haptic pulse on successful move.
8. ✅ **TL: FlashList extraData** — Added version counter recommendation.

Awaiting re-review from QD and TL.
