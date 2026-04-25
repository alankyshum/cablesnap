# Feature Plan: Swipe-right gesture to mark set as done

**Issue**: BLD-646  **Author**: CEO  **Date**: 2026-04-25
**Status**: DRAFT
**Implementation target**: BLD-614 (existing owner-filed todo)

## Problem Statement

Marking a set complete on the session screen currently requires tapping a small (~24px) circular checkmark on the right edge of `SetRow.tsx`. During a workout the phone is sweaty, the user is mid-rest, and one-handed precision-tap is a hostile UX. Meanwhile, swipe-LEFT on the same row already deletes the set via `SwipeToDelete` (`components/SwipeToDelete.tsx` → `components/session/SetRow.tsx:103`). Completion is the dominant action (every set ends with it); deletion is rare. Owner correctly identified the asymmetry and filed BLD-614.

User-facing benefit: completing a set becomes a fat-thumb-friendly horizontal flick on the entire row instead of a precision tap.

## Behavior-Design Classification (MANDATORY)

- [x] **NO** — purely functional input affordance. Swipe-right is a faster way to perform an action (set.completed = true) the user can already perform via tap. No streaks, no rewards, no notifications, no progression visualisation, no motivational copy, no goal-setting, no re-engagement. The gesture only fires when the user explicitly performs it on a set they are already viewing.

(If implementation drifts toward adding celebration animations / haptic flourish stacking / "X sets in a row!" toasts → flip Classification and book psychologist review per §3.2.)

## User Stories

- As a lifter mid-workout, I want to swipe right on a set row to mark it done, so I don't have to lift my thumb to a tiny checkmark.
- As a lifter who completed the wrong set, I want swipe-right on an already-complete row to either be a no-op or to toggle it back to incomplete (decided below).
- As a left-handed / RTL user, I want swipe direction to map to my locale.

## Proposed Solution

### Overview

1. Generalise `SwipeToDelete` → `SwipeRowAction` supporting both left-swipe (existing delete) and right-swipe (new complete) on the same row, with independent thresholds, colours, icons, and callbacks.
2. Wire the right-swipe at `SetRow.tsx` to call a new `onMarkComplete(set.id)` prop that ultimately runs the same DB write as tapping the checkmark (single source of truth for completion: `useSessionActions.completeSet` or equivalent — confirm during impl).
3. Right-swipe behaviour on an already-complete row: **toggle to incomplete** (symmetric with the existing tap-checkmark UX which is a toggle). This matches user expectation that "the gesture and the tap do the same thing."
4. Right-swipe reveals a green check action background (mirroring the existing red trash-can on the left), but the row does NOT animate-out / dismiss; it snaps back after the action commits and shows the existing completion outline (BLD-613-style highlight if landed; otherwise the current `primaryContainer + "40"` background).
5. Haptic: light impact on commit (NOT medium — medium is reserved for delete; we want completion to feel softer than destruction).

### UX Design

**Flow:**
- Touch row → drag right past threshold → release → row snaps back, set toggles complete, light haptic, green "✓" briefly visible during the swipe arc.
- If user releases under threshold → spring back, no action.
- Already-complete row + swipe-right → toggles to incomplete (same as tapping checkmark today). Same haptic.
- Vertical scroll must NOT be intercepted: gesture must require horizontal-dominant motion (`activeOffsetX: [-10, 10]` style) — already the case in `SwipeToDelete`'s `Gesture.Pan`.

**Threshold parity with delete (avoid asymmetry confusion):**
- `dismissThresholdFraction: 0.4` (slightly less than delete's 0.5 — completion is reversible, deletion is destructive, friction asymmetry is intentional).
- `minDismissPx: 100`.
- `velocityDismissPxPerSec: 1500`, `velocityMinTranslatePx: 80`.

**Visual:**
- Background revealed during right-swipe: `colors.primary` (theme green) with white check icon centered on the right side of the revealed area (since the row moves right, the action lives on the LEFT side of the visible track — verify with implementation; same pattern as delete in mirror).
- Existing completion outline (the highlight row treatment) is unchanged and continues to work after gesture commits.

**A11y:**
- Add `accessibilityActions: [{name: 'complete', label: 'Mark complete'}, {name: 'delete', label: 'Delete set'}]` to the row container — VoiceOver/TalkBack users can trigger the same action without gesture.
- Existing `accessibilityLabel`/`accessibilityState` on the checkmark Pressable stay (still primary tap target).
- The swipe is a CONVENIENCE; the tap target remains canonical.

**Empty / error / edge:**
- Row currently animating in/out (e.g., set just added) → swipe disabled until layout settles (use existing `enabled` prop pattern).
- Set is read-only (e.g., session is finished and viewing as history) → right-swipe disabled (mirror current delete-disabled logic). Confirm read-only flag exists during impl.
- RTL (`I18nManager.isRTL`) → swap left/right semantics so swipe-toward-leading-edge = delete and swipe-toward-trailing-edge = complete (preserves muscle memory in either locale). `SwipeToDelete` already handles RTL — extend uniformly.

### Technical Approach

**Files touched:**
- `components/SwipeToDelete.tsx` → rename or split to `components/SwipeRowAction.tsx` (preferred) and re-export the old name as a thin wrapper for non-set callers (TemplateExerciseRow, FoodLogCard, MealTemplatesSheet) — they only use left-swipe and must not regress.
- `components/session/SetRow.tsx` → swap `<SwipeToDelete>` for the new component, pass both `onDelete` and `onMarkComplete`.
- `hooks/useSessionActions.ts` (or wherever current tap-checkmark write lives) → expose `toggleSetCompleted(setId)` if not already exposed; gesture must call the same function as the tap (no parallel write path).
- `app/session/[id].tsx` → wire the new prop down.

**Architecture rule (CRITICAL):**
- The gesture and the checkmark tap MUST converge to the same DB write function. No duplicate INSERT/UPDATE logic. This is the recurring pattern from BLD-630 (multiple-surfaces-of-same-action causing drift).

**Reanimated / GH:**
- Keep using `react-native-gesture-handler` `Gesture.Pan` + `react-native-reanimated`. No new deps.
- Translation X drives both action backgrounds (left positive → right reveals; right negative → left reveals). Single shared value, two `useAnimatedStyle` consumers.

**Performance:**
- 50+ sets on screen for high-volume sessions. The gesture overhead is per-row already; no change in cost. Animated values stay on UI thread.

**Testing:**
- Component test: render `<SwipeRowAction onDelete onMarkComplete>`, simulate Pan rightward past threshold, assert `onMarkComplete` called.
- Component test: simulate Pan leftward → `onDelete` called (regression).
- Component test: simulate Pan rightward under threshold → neither callback called.
- Acceptance test (`__tests__/acceptance/...`): on session screen, swipe-right on incomplete set → row shows completion treatment AND DB row `set.completed = 1`. Swipe-right again → `set.completed = 0`.
- Lock-in test: SwipeToDelete remains backwards-compatible (TemplateExerciseRow swipe-left still triggers delete).

## Scope

**In:**
- New right-swipe gesture on session-screen set rows that toggles `set.completed`.
- Generalised `SwipeRowAction` component supporting bidirectional actions with backwards-compatible `SwipeToDelete` export.
- A11y custom action on row.
- RTL parity.

**Out:**
- Changing the tap-checkmark UX (still works as today).
- Applying the new bidirectional pattern to other rows (TemplateExerciseRow, FoodLog, etc.) — separate ticket if requested.
- Visual completion-outline polish — that is BLD-613, separate issue.
- Multi-touch / multi-row gestures.
- Animations beyond the existing snap-back / haptic.

## Acceptance Criteria

- [ ] **GIVEN** an incomplete set row on the session screen, **WHEN** the user swipes the row right past the threshold and releases, **THEN** the set toggles to complete (DB `set.completed = 1`), the row shows the existing completion treatment, and a light haptic fires.
- [ ] **GIVEN** a complete set row, **WHEN** the user swipes the row right past the threshold and releases, **THEN** the set toggles to incomplete (`set.completed = 0`).
- [ ] **GIVEN** any set row, **WHEN** the user swipes left past the existing delete threshold, **THEN** delete still fires (regression check).
- [ ] **GIVEN** any set row, **WHEN** the user swipes right under the threshold and releases, **THEN** the row springs back with no DB write.
- [ ] **GIVEN** a vertical scroll of the session list, **WHEN** the user drags vertically with no horizontal dominance, **THEN** the list scrolls and no row swipe activates.
- [ ] **GIVEN** an RTL locale, **WHEN** the user swipes toward the trailing edge, **THEN** complete fires (and toward leading edge → delete fires).
- [ ] **GIVEN** a screen reader user, **WHEN** they activate the row's "Mark complete" custom a11y action, **THEN** the same toggle write fires as the gesture.
- [ ] All existing tests pass; new component + acceptance tests added.
- [ ] No new lint warnings; typecheck clean.
- [ ] Same DB write function used by tap-checkmark and gesture (no duplicate path).

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Already complete + swipe right | Toggles to incomplete |
| Read-only session (history) | Right-swipe disabled (mirror delete-disabled) |
| Mid-add row (animating in) | Swipe disabled until layout settles |
| Concurrent swipes on two rows | Each row owns its gesture; second activation cancels first's incomplete drag (existing GH behaviour) |
| Set with PR badge | PR badge unaffected by completion toggle (does not invalidate `is_pr`) |
| RTL | Direction semantics swap; same actions |
| Very fast horizontal fling under min translate | No action (`velocityMinTranslatePx: 80` floor) |
| Tap on checkmark during partial drag | Gesture cancels, tap wins (use `Gesture.Exclusive` or hitSlop priority) |
| Network/DB write fails | Optimistic UI flip + rollback toast (match current tap-checkmark error handling — confirm during impl) |
| 50+ sets on screen scroll perf | No regression — single shared value per row, same as today |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regression in left-swipe-delete on TemplateExerciseRow / FoodLogCard | Medium | High | Keep `SwipeToDelete` export; new component is additive. Lock-in tests on each consumer. |
| Two write paths drift (gesture vs tap) | High if not policed | High (data corruption if one-side adds side-effect) | Architecture rule: both call same `toggleSetCompleted` function. Code review must enforce. |
| Vertical scroll captured | Medium | High (unusable) | Existing `Gesture.Pan` activeOffsetX gating; manual QA on long sessions; component test simulating dominant-Y motion. |
| RTL flip incorrect | Low | Medium | Reuse `SwipeToDelete`'s existing RTL handling; add explicit RTL test. |
| Haptic spam on accidental swipes | Low | Low | Haptic only fires on commit, not on activation. |
| User confusion: tap and swipe both toggle | Low | Low | Symmetric behaviour matches existing affordances; documented in release notes. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### CEO Decision
_Pending_
