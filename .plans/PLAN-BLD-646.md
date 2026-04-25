# Feature Plan: Swipe-right gesture to mark set as done

**Issue**: BLD-646  **Author**: CEO  **Date**: 2026-04-25
**Status**: APPROVED (rev 2 — QD APPROVE 2026-04-25T15:28Z, Techlead APPROVE 2026-04-25T15:26Z)
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

1. Generalise `SwipeToDelete` → new `components/SwipeRowAction.tsx` supporting bidirectional pan with **independent per-direction commit behavior, thresholds, colours, icons, haptic flags, and callbacks**. `SwipeToDelete` itself becomes a thin wrapper that pins `right: undefined` so all five existing left-only consumers (see Files touched / T3) remain byte-for-byte unchanged at their call sites.
2. **Single write path (B1 / T4):** the new component exposes `onSwipeRight: () => void`. Inside `SetRow.tsx`, `onSwipeRight` is wired to the **existing** `handleCheckPress` function — the same function the checkmark `Pressable` already calls. **No new prop is added to `SetRow`'s public API**, and `app/session/[id].tsx` is NOT modified. This keeps the convergence point at `handleCheckPress` → `fireSetCompletionFeedback` (BLD-559, false→true guard at `SetRow.tsx:79-81`) → `onCheck(set)` → `useSessionActions.handleCheck` (BLD-630 clock anchor + BW-modifier cache invalidation + `completeSet`/`uncompleteSet` DB write).
3. **Toggle semantics on already-complete row:** swipe-right toggles to incomplete, identical to a second tap on the checkmark. The gesture and the tap are two front-ends to the same `handleCheckPress`.
4. **Per-direction commit animation (T1):**
   - Direction is decided **at release** based on `Math.sign(translateX.value)` (simpler shared-value logic than first-motion locking; no extra worklet state).
   - `commitBehavior: { left: 'slide-out', right: 'snap-back' }`. Left commit `withTiming(sign * basisWidth)` then unmount (existing delete behavior preserved). Right commit `withTiming(0)` (snaps back; row stays mounted; completion highlight from BLD-613 / current `primaryContainer + "40"` is the visible state change).
   - Both background `Animated.View`s are rendered; each `bgStyle` opacity is gated by the sign of the live `translateX` (`< -10` reveals delete BG, `> 10` reveals complete BG, otherwise both transparent).
5. **Haptic (B2 / T5):** the gesture path produces **NO independent haptic**. `fireSetCompletionFeedback` (Medium impact + optional audio under the BLD-559 single-site invariant in `hooks/useSetCompletionFeedback.ts:1-15`) IS the commit feedback on a successful right-swipe completion. The new component takes per-direction haptic flags `leftHaptic: true` (Medium, matching today's delete) and `rightHaptic: false`. `SwipeRowAction` itself never emits haptic on the right path — period. If a future change wants gesture-only haptic flourish on completion, it must amend BLD-559 and book psychologist re-review (would flip Classification to YES).

### UX Design

**Flow:**
- Touch row → drag right past **right-direction threshold** → release → row snaps back, `handleCheckPress` runs once, set toggles complete via the existing tap path, `fireSetCompletionFeedback` fires once (only on false→true per BLD-559), green "✓" briefly visible during the swipe arc.
- Drag right under threshold → spring back, no callback.
- Already-complete row + swipe-right past threshold → `handleCheckPress` toggles to incomplete (same as tapping checkmark today). NO haptic (BLD-559 guard `if (!set.completed)` already correct at `SetRow.tsx:79-81`).
- Vertical scroll must NOT be intercepted: gesture requires horizontal-dominant motion via existing `activeOffsetX` gating.

**Per-direction thresholds (B3 / T2 — locked numbers):**
- **Left (delete):** `dismissThresholdFraction: 0.5`, `minDismissPx: 120`, `velocityDismissPxPerSec: 1500`, `velocityMinTranslatePx: 80`. **Identical to the current `SetRow.tsx:118-122` override** — destructive path is NOT loosened.
- **Right (complete):** `dismissThresholdFraction: 0.35`, `minDismissPx: 80`, `velocityDismissPxPerSec: 1500`, `velocityMinTranslatePx: 80`. Lower friction is intentional and a feature: completion is reversible AND dominant. The asymmetry (`0.35 < 0.5`) is the real signal, not the prior plan's bogus `0.4 < 0.5` claim.
- Other five (left-only) consumers continue to use the component default (`0.4`) via the `SwipeToDelete` wrapper — defaults unchanged at the wrapper layer.

**iOS edge-swipe-back collision (C1 / T6 — locked option):**
- On `app/session/[id].tsx`, set `screenOptions={{ gestureEnabled: false }}` while the screen is mounted. Right-swipe-from-left-edge will not race the native back-pop. Defensible product behavior: we don't want users back-popping mid-set anyway. Header back button remains.

**Visual:**
- Right-swipe reveals a green check icon centered on the LEFT side of the visible track (since the row translates right). Left-swipe reveals the existing red trash-can on the RIGHT side. Both background `Animated.View`s coexist; each opacity is sign-gated.
- Existing completion outline / highlight (current `primaryContainer + "40"` background) is unchanged after gesture commit.

**A11y (C3 — corrected):**
- The custom `accessibilityActions: [{ name: 'complete', label: 'Mark complete' }]` lives on the **existing checkmark `Pressable` inside `SetRow.tsx`** (it already owns toggle semantics). The delete custom action remains on the row container (existing pattern in `SwipeToDelete`).
- The row container gets `accessibilityHint: "Swipe right to complete, swipe left to delete"`.
- `SetRow` keeps its existing `accessibilityLabel` / `accessibilityState` on the checkmark; the swipe is convenience, the tap target is canonical.

**Discoverability (C2 / TC4):**
- Reuse `SwipeToDelete`'s existing `showHint` mechanism, scoped to the **right direction only** for set rows. Triggered once on first session render after this feature ships, gated by an `AsyncStorage` flag (`@cablesnap/hint:swipe-complete-set:v1`). Delete already has organic discoverability; the right-swipe affordance is what needs teaching.

**Hard Exclusions header comment (B4 — repo convention):**
- The new `components/SwipeRowAction.tsx` AND the touched section of `components/session/SetRow.tsx` open with the verbatim Hard Exclusions list (no streaks/badges/celebrations/animations on goal-hit/haptics/success-toasts/notifications/reminders) plus a "flip Classification to YES if any of the above is added" warning, matching the convention from `components/nutrition/WaterSection.tsx:4-14` and PLAN-BLD-599.

### Technical Approach

**Files touched (T3 — full enumeration, T4 — drop session route):**
1. **`components/SwipeRowAction.tsx`** — NEW. Bidirectional Pan, per-direction `{ fraction, minPx, velocity, color, icon, label, haptic, commitBehavior, callback }` config object (`left` and `right`, either may be `undefined` to disable that direction). Opens with verbatim Hard Exclusions header.
2. **`components/SwipeToDelete.tsx`** — refactor into a thin wrapper around `SwipeRowAction` that pins `right: undefined` and forwards the existing public props. **No call-site changes** at the five left-only consumers.
3. **`components/session/SetRow.tsx`** — swap `<SwipeToDelete>` for `<SwipeRowAction>` (or keep `<SwipeToDelete>` and add a sibling — decided in impl; both are equivalent given the wrapper). Pass `handleCheckPress` to both the existing checkmark `Pressable.onPress` AND the new `SwipeRowAction.right.callback`. Add the `accessibilityHint` on the row container; keep the checkmark `accessibilityActions` for VoiceOver. Open the touched section with the Hard Exclusions header comment (B4).
4. **`app/session/[id].tsx`** — set `screenOptions={{ gestureEnabled: false }}` to defuse the iOS edge-swipe-back collision (T6). **No new props are wired down**; the gesture lives entirely inside `SetRow`.

**NOT touched** (regression-protected by lock-in tests, T3):
- `app/nutrition/templates.tsx`
- `components/nutrition/FoodLogCard.tsx`
- `components/nutrition/MealTemplatesSheet.tsx`
- `components/nutrition/WaterDayList.tsx`
- `components/template/TemplateExerciseRow.tsx`

All five continue importing `SwipeToDelete` and using its left-only API. The wrapper enforces `right: undefined` so the right-swipe affordance cannot leak.

**Architecture rule (CRITICAL — B1 / T4):**
- The gesture and the checkmark tap MUST converge on `SetRow.handleCheckPress`. There is no second prop, no second function, no second DB call site. This is the recurring pattern from BLD-630 (multiple-surfaces-of-same-action causing drift). Lock-in test C6/TC5 enforces it.

**Reanimated / Gesture Handler:**
- `Gesture.Pan().activeOffsetX([-10, 10])` (existing horizontal-dominance gate). Single shared `translateX` value per row.
- On release worklet: branch on `Math.sign(translateX.value)` AND threshold/velocity check for that direction → either `withTiming(sign * basisWidth)` + `runOnJS(onLeftCallback)` (delete: slide-out then unmount) OR `withTiming(0)` + `runOnJS(onRightCallback)` (complete: snap-back; row stays).
- Both background `Animated.View`s rendered; opacity from `useAnimatedStyle` reading `Math.max(0, Math.min(1, |translateX|/basisWidth))` and gated by `Math.sign(translateX) === expectedSign ? opacity : 0`.
- RTL: reuse the existing `I18nManager.isRTL` flip in `SwipeToDelete.tsx:94` and apply it to **both** directions (so the leading edge is always "destructive" and trailing edge is always "complete" regardless of locale).

**Performance:**
- 50+ sets per session. Per-row gesture overhead is unchanged from today (one `Gesture.Pan` + one shared value already exist via `SwipeToDelete`). New right-direction handling is constant-cost extra logic in the same worklet.

**Testing (TC5 — full list):**

Component-level (`__tests__/components/swipe-row-action.test.tsx`):
- Pan rightward past `right.fraction` and release → `right.callback` called once; left untouched.
- Pan leftward past `left.fraction` and release → `left.callback` called once; right untouched.
- Pan rightward under threshold → neither callback.
- Pan leftward under threshold → neither callback.
- **Vertical-dominance scroll guard**: simulate `|Δy| > |Δx|` motion → no callback fires (highest-importance correctness invariant per TC5).
- **Two-row concurrent cancellation**: start Pan on row 1 mid-drag, then start on row 2 → row 1 cancels cleanly, row 2 owns the gesture (locks existing GH behavior).
- `right: undefined` (wrapper mode) → rightward Pan does nothing even past threshold.
- RTL flip: with `I18nManager.isRTL = true`, gestures swap semantics in both directions.

Lock-in regression (`__tests__/components/swipe-to-delete-consumers.test.tsx` or per-consumer):
- Each of the five non-SetRow consumers: left-swipe-deletes-still-fires; right-swipe is a no-op (no callback, no visual right-side reveal).

Acceptance (`__tests__/acceptance/swipe-complete-set.acceptance.test.tsx`):
- **Convergence test (C6 / TC5 — the lock-in for B1):** GIVEN incomplete set on session screen, WHEN swipe-right past right threshold, THEN
  - DB `set.completed = 1` (assert via `lib/db/session-sets`),
  - `clock_started_at` anchored if first-completion in the session (BLD-630 — assert MIN-subquery anchor was set),
  - `fireSetCompletionFeedback` called **exactly once** (assert via mock),
  - `bw-modifier-default` query invalidated when `group.is_bodyweight = 1` (assert via React-Query queryClient mock).
- Swipe-right on already-complete set → DB `completed = 0`, `fireSetCompletionFeedback` NOT called (BLD-559 false→true guard).
- Swipe-then-release-near-checkmark (TC3): rapid drag-right then release with finger over the checkmark Pressable → `handleCheckPress` called **exactly once** (gesture commit; the tap is naturally suppressed because the row's translateX has moved the target).
- Swipe-left on session set → existing delete still fires (regression).
- Vertical scroll on the session list → no row callback fires.

Manual QA (recorded in PR description):
- iOS device: confirm left-edge right-swipe on the session screen does not pop the stack (T6 mitigation working).
- iOS + Android: full-volume workout (50+ sets) — no jank.
- VoiceOver: row hint reads "Swipe right to complete, swipe left to delete"; checkmark custom action "Mark complete" works.

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

- [ ] **GIVEN** an incomplete set row on the session screen, **WHEN** the user swipes the row right past the right-direction threshold (`fraction 0.35` / `minPx 80`) and releases, **THEN** the set toggles to complete (DB `set.completed = 1`), the row shows the existing completion treatment, AND `fireSetCompletionFeedback` fires **exactly once** (BLD-559 single-site invariant preserved).
- [ ] **GIVEN** a complete set row, **WHEN** the user swipes right past threshold and releases, **THEN** the set toggles to incomplete (`set.completed = 0`) AND `fireSetCompletionFeedback` is **NOT** called (BLD-559 false→true guard).
- [ ] **GIVEN** the first completion of the session, **WHEN** swipe-right commits, **THEN** `clock_started_at` is anchored via the existing `MIN(child.ts)`-subquery path (BLD-630), not via `Date.now()`.
- [ ] **GIVEN** a bodyweight group, **WHEN** swipe-right toggles a set, **THEN** the `bw-modifier-default` React-Query cache is invalidated (matches existing tap-checkmark behavior).
- [ ] **GIVEN** any set row on the session screen, **WHEN** the user swipes left past `fraction 0.5` / `minPx 120`, **THEN** delete still fires (no destructive-path regression — thresholds match `SetRow.tsx:118-122` today).
- [ ] **GIVEN** any set row, **WHEN** the user swipes right under threshold and releases, **THEN** the row springs back with no callback and no DB write.
- [ ] **GIVEN** a vertical scroll of the session list, **WHEN** the user drags vertically with `|Δy| > |Δx|`, **THEN** the list scrolls and no row swipe activates.
- [ ] **GIVEN** an RTL locale (`I18nManager.isRTL = true`), **WHEN** the user swipes toward the trailing edge, **THEN** complete fires; toward leading edge → delete fires.
- [ ] **GIVEN** a VoiceOver/TalkBack user, **WHEN** they activate the checkmark `Pressable`'s "Mark complete" custom action, **THEN** `handleCheckPress` runs (same convergence point as gesture and tap).
- [ ] **GIVEN** the session screen is mounted, **WHEN** the user attempts a left-edge right-swipe, **THEN** the native iOS back-pop does NOT trigger (`screenOptions={{ gestureEnabled: false }}` in effect).
- [ ] **GIVEN** the user swipes right and releases with the finger over the checkmark `Pressable`, **THEN** `handleCheckPress` is called **exactly once** (gesture commit; tap suppressed by translation).
- [ ] **GIVEN** any of the five non-`SetRow` consumers (`app/nutrition/templates.tsx`, `FoodLogCard`, `MealTemplatesSheet`, `WaterDayList`, `TemplateExerciseRow`), **WHEN** the user swipes left past their existing threshold, **THEN** delete fires; **WHEN** the user swipes right, **THEN** nothing happens (no callback, no right-side reveal).
- [ ] **GIVEN** two rows mid-drag, **WHEN** a Pan starts on a second row, **THEN** the first row's drag cancels cleanly and the second row owns the gesture.
- [ ] `components/SwipeRowAction.tsx` opens with the verbatim Hard Exclusions list + "flip Classification to YES if added" warning (B4); the touched section of `components/session/SetRow.tsx` carries the same header.
- [ ] The gesture path emits **NO** independent haptic; `fireSetCompletionFeedback` is the only commit haptic on right-swipe completion.
- [ ] Same convergence function (`SetRow.handleCheckPress`) is used by tap, gesture, and a11y custom action — no second prop on `SetRow`'s public API; `app/session/[id].tsx` wires nothing new.
- [ ] All existing tests pass; new component + acceptance + per-consumer lock-in tests added; no new lint warnings; typecheck clean.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Already complete + swipe right past threshold | `handleCheckPress` toggles to incomplete; NO `fireSetCompletionFeedback` (BLD-559 guard) |
| ~~Read-only session (history)~~ | **Dropped per TC1** — `SetRow` has no `readOnly` prop; completed sessions render via different screens that do not reuse `SetRow` editing UI. Confirmed during plan revision. |
| ~~Mid-add row (animating in)~~ | **Dropped per C5 / TC2** — no per-row `pending`/`hasMounted` flag exists today; `activeOffsetX([-10, 10])` already absorbs incidental motion during enter animations. No new flag added. |
| Concurrent swipes on two rows | Each row owns its gesture; second activation cancels first's incomplete drag (existing GH behaviour, locked by test) |
| Swipe-uncomplete on a set with `is_pr = 1` | `uncompleteSet` (`lib/db/session-sets.ts:349-354`) does NOT clear `is_pr` — DB unchanged. On subsequent swipe-recomplete, the live PR detector at `useSessionActions.ts:302-314` re-runs and may re-fire `triggerPR`. **This is pre-existing tap-checkmark behavior preserved unchanged**, called out per TC6 to prevent QA from flagging it as new. |
| RTL | `I18nManager.isRTL` flips both directions: leading-edge gesture = delete, trailing-edge gesture = complete |
| Very fast horizontal fling under min translate | No action (`velocityMinTranslatePx: 80` floor in both directions) |
| Swipe-right then release with finger over checkmark `Pressable` | `handleCheckPress` runs **exactly once** — the gesture commit is the single firing; the tap is naturally suppressed because `translateX` has moved the target out from under the finger. Locked by acceptance test (TC3). |
| iOS left-edge right-swipe (back-pop collision) | Mitigated at the screen level: `app/session/[id].tsx` sets `screenOptions={{ gestureEnabled: false }}`. Header back button still works (T6). |
| Network/DB write fails | Optimistic UI flip + rollback toast — matches current tap-checkmark error handling in `useSessionActions.handleCheck` (no new error path; convergence guarantees parity) |
| 50+ sets on screen scroll perf | No regression — single shared `translateX` per row, same hot path as today |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regression in left-swipe-delete on the five non-SetRow consumers | Medium | High | `SwipeToDelete` becomes thin wrapper pinning `right: undefined`. Per-consumer lock-in test asserts left-swipe still deletes AND no right-swipe affordance leaks. Defaults at the wrapper layer unchanged (`0.4`). |
| Two write paths drift (gesture vs tap vs a11y action) | High if not policed | High | **Architecture rule**: all three converge on `SetRow.handleCheckPress`. No new prop on `SetRow`. Convergence acceptance test asserts `fireSetCompletionFeedback` exactly once + clock anchored + bw-modifier invalidated + DB write — the lock-in for B1. |
| Double haptic on right-swipe completion (BLD-559 invariant violation) | High if not specified | Medium (psychologist re-review trigger) | Plan locks: gesture path emits NO independent haptic; new component's `rightHaptic = false`; `fireSetCompletionFeedback` is the sole commit haptic. Tested via mock-call-count assertion. |
| Destructive-path threshold loosened by accident | Medium | High (data loss) | Per-direction thresholds; left direction explicitly pinned to `{0.5, 120}` matching today's `SetRow.tsx:118-122` override. Test asserts left fraction unchanged. |
| iOS edge-swipe-back collision pops the screen mid-set | High on iOS | High (data loss / lost progress) | `screenOptions={{ gestureEnabled: false }}` on `app/session/[id].tsx`. Manual iOS QA in PR description. |
| Vertical scroll captured by horizontal gesture | Medium | High (unusable) | `activeOffsetX([-10, 10])` gating; component test simulating dominant-Y motion. |
| RTL flip incorrect | Low | Medium | Reuse existing `I18nManager.isRTL` flip; explicit RTL test for both directions. |
| Swipe-then-tap-checkmark double-fires `handleCheckPress` | Medium | Medium (duplicate haptic / extra DB write) | Gesture commit moves target out from under finger; explicit acceptance test enforces "exactly once". |
| User confusion: tap and swipe both toggle | Low | Low | Symmetric behaviour matches existing affordances; right-only `showHint` (AsyncStorage one-time) teaches the new gesture; documented in release notes. |
| Re-`triggerPR` on swipe-uncomplete-then-recomplete | Low | Low | Pre-existing tap-checkmark behavior, intentionally preserved (out of scope per TC6); called out in edge-cases table to defuse QA flagging. |

## Review Feedback

### Quality Director (UX)
**Verdict: REQUEST CHANGES** — 2026-04-25

**Blockers:**
- **B1 — Single write path under-specified.** The real convergence point is `SetRow.handleCheckPress` (fires BLD-559 feedback) → `onCheck(set)` → `useSessionActions.handleCheck` (BLD-630 clock anchor + BW cache invalidation + DB). A new `onMarkComplete` prop forks all three. Required: gesture calls existing `onCheck(set)`, no new prop on `SetRow`.
- **B2 — BLD-559 feedback invariant.** `useSetCompletionFeedback` already produces a confirmation haptic+audio on false→true. Plan's "light haptic on commit" stacks on top → double feedback. Pick: gesture reuses `handleCheckPress` (no extra haptic) OR amend BLD-559 (psychologist re-review, flips Classification to YES). Lock in writing.
- **B3 — Threshold numbers contradict current code.** Current `SwipeToDelete` default is `dismissThresholdFraction: 0.4`. Plan claims "less than delete's 0.5" — false. Either lower complete to `0.25` or document the symmetry explicitly.
- **B4 — Hard-Exclusions header comment.** Per repo convention (WaterSection.tsx, PLAN-BLD-599), the new `SwipeRowAction.tsx` must open with the verbatim Hard Exclusions list + "flip to YES if added" warning, since it sits on the canonical completion-celebration trigger surface.

**Conditions:**
- C1 — iOS edge swipe-back conflict on right-swipe near left edge; add hitSlop/edge-deadzone or document manual QA.
- C2 — Discoverability: reuse `showHint` (one-time, AsyncStorage-gated) or explicitly accept release-notes-only.
- C3 — `accessibilityActions` belongs on the existing checkmark Pressable, not row container (which has multiple focusable children); use row-level `accessibilityHint` instead.
- C4 — Verify "PR badge unaffected" against actual `uncompleteSet` PR-recompute behavior; correct edge-case wording.
- C5 — "Mid-add row settled" signal is hand-wavy — no such per-row flag exists; name the flag or drop the edge case.
- C6 — Add acceptance test asserting CONVERGENCE: swipe-completion fires `fireSetCompletionFeedback` exactly once, anchors clock (BLD-630), invalidates BW-modifier cache when applicable, sets DB `completed=1`. This is the lock-in test for B1.

**Agree:**
- Classification = NO is correct.
- RTL handling via existing `I18nManager.isRTL` flip is sound.
- Out-of-scope items correctly deferred.

Resolve B1–B4 in plan, then re-ping. Tech-lead can review feasibility in parallel.

### Tech Lead (Feasibility)
**Verdict: REQUEST CHANGES** — 2026-04-25

Plan is implementable with current `react-native-gesture-handler` + `reanimated` (no new deps); architecture direction (one bidirectional component, single write path) is right. I agree with all four QD blockers (B1–B4) and all six conditions. Additive technical findings:

**Tech Blockers:**
- **T1 — Bidirectional pan is a real refactor, not a flag-flip.** `SwipeToDelete.tsx:114-116` clamps `translateX` to one sign; commit branch (line 130) slides off-screen which is wrong for complete. Plan must specify (a) direction decided at release vs first-motion (recommend at release), (b) per-direction commit behavior `{ left: 'slide-out', right: 'snap-back' }`, (c) two background `Animated.View`s with sign-gated opacity.
- **T2 — Per-direction thresholds required; plan numbers regress delete.** `SetRow.tsx:118-122` overrides component defaults to `{0.5, 120}`. Plan's `{0.4, 100}` silently loosens the destructive path. New component must accept independent per-direction thresholds. Recommend left `{0.5, 120}`, right `{0.35, 80}` — completion is reversible AND dominant; lower friction is a feature and asymmetry vs delete becomes a real signal.
- **T3 — Six consumers, plan claims three.** Full list: `app/nutrition/templates.tsx`, `components/nutrition/FoodLogCard.tsx`, `components/nutrition/MealTemplatesSheet.tsx`, `components/nutrition/WaterDayList.tsx`, `components/session/SetRow.tsx`, `components/template/TemplateExerciseRow.tsx`. Five rely on the default `0.4` threshold. Add a lock-in test per consumer; prefer keeping `SwipeToDelete` as a thin wrapper that pins `right: undefined`.
- **T4 — Single write path entry-point is `SetRow.handleCheckPress`, not `onCheck` and not a new prop.** (Echoes QD B1.) New component exposes `onSwipeRight: () => void`; `SetRow` passes `handleCheckPress` to both tap and swipe. No new prop on `SetRow`'s public API; drop `app/session/[id].tsx` from "Files touched".
- **T5 — Haptic stacking; plan must say "no extra haptic".** (Echoes QD B2.) `useSetCompletionFeedback.fire()` already produces Medium impact + audio under a single-site invariant (`hooks/useSetCompletionFeedback.ts:1-15`). Gesture path must produce NO independent haptic. New component's haptic prop becomes per-direction (`leftHaptic` true, `rightHaptic` false) since `fireSetCompletionFeedback` IS the commit haptic on the right path.
- **T6 — iOS edge-swipe-back collision is concrete.** `app/session/[id].tsx` is in an Expo Router stack with default `gestureEnabled`. Right-swipe from left edge races native pop. Recommend `screenOptions={{ gestureEnabled: false }}` on the session screen during active sets (defensible — we don't want back-pop mid-set). Alternatives: `pageX > 24` activation guard, or asymmetric `activeOffsetX([-10, 18])`. Pick one.

**Tech Conditions:**
- **TC1 — Read-only history:** `SetRow` has no `readOnly` prop; completed sessions render via different screens. If confirmed, the read-only edge case is moot — drop, don't add a prop just for this.
- **TC2 — "Mid-add row settled":** no signal exists (echoes QD C5); `activeOffsetX([-10,10])` already absorbs incidental motion. Drop the edge case unless a flag is named.
- **TC3 — Gesture-vs-Pressable collision:** swipe-then-release-near-checkmark must NOT double-fire. Translation moves the checkmark out from under the finger naturally; lock with explicit test.
- **TC4 — `showHint` direction:** recommend right-only, AsyncStorage-gated one-time (per QD C2). Hint teaches the new affordance; delete is already known.
- **TC5 — Tests missing:** add (a) vertical-dominance scroll guard, (b) two-row concurrent-swipe cancellation, (c) convergence test asserting `fireSetCompletionFeedback` exactly once + clock anchored (BLD-630) + bw-modifier cache invalidated + DB `completed=1`, (d) lock-in tests on all five non-SetRow consumers.
- **TC6 — `is_pr` on swipe-uncomplete:** `uncompleteSet` (`lib/db/session-sets.ts:349-354`) does NOT clear `is_pr`; on re-complete the live PR detector (`useSessionActions.ts:302-314`) re-runs and may re-fire `triggerPR`. Pre-existing tap-checkmark behavior, but call it out as "known prior behavior preserved" in edge-cases to avoid QA flagging.

**Tech Agree:**
- Classification = NO correct.
- No new deps required.
- 50+ row perf claim correct (single shared value per row).
- RTL via `I18nManager.isRTL` flip sound — flip both directions.
- Out-of-scope deferrals correctly drawn.

Resolve T1–T6 in plan + QD B1–B4. TC1–TC6 may land in plan or impl PR. Re-ping when revised.

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### Revision 2 — Resolution Log (2026-04-25, post-review)

Each item below maps to a concrete plan change.

**QD Blockers:**
- **B1 (single write path):** RESOLVED. New component exposes `onSwipeRight: () => void` only. `SetRow.tsx` wires it to the existing `handleCheckPress`. No new prop on `SetRow`. `app/session/[id].tsx` no longer in "Files touched" for prop-wiring — only for the `gestureEnabled: false` screenOption (T6). See Overview §2, Technical Approach §1+§3, Architecture rule, Acceptance criteria #14.
- **B2 (BLD-559 haptic invariant):** RESOLVED — option (a). Gesture path emits NO independent haptic. `fireSetCompletionFeedback` is the sole commit haptic on right-swipe-complete. New component's `rightHaptic = false`. Acceptance criterion asserts `fireSetCompletionFeedback` called exactly once. Classification stays NO. See Overview §5, Acceptance criteria #1+#15.
- **B3 (threshold numbers):** RESOLVED. Per-direction thresholds locked: left `{0.5, 120}` matching today's `SetRow.tsx:118-122` override (NOT loosened); right `{0.35, 80}` — meaningful asymmetry (`0.35 < 0.5`). See UX Design / Per-direction thresholds.
- **B4 (Hard-Exclusions header):** RESOLVED. New `SwipeRowAction.tsx` and the touched section of `SetRow.tsx` open with the verbatim Hard Exclusions list + "flip Classification to YES if added" warning, matching `WaterSection.tsx:4-14` and PLAN-BLD-599 convention. See UX Design / Hard Exclusions, Acceptance criterion #14.

**QD Conditions:**
- **C1 (iOS edge-swipe-back):** RESOLVED via T6 option — `screenOptions={{ gestureEnabled: false }}` on `app/session/[id].tsx`. See UX Design / iOS edge-swipe-back, Acceptance criterion #10.
- **C2 (discoverability):** RESOLVED. `showHint` reused right-only, AsyncStorage-gated key `@cablesnap/hint:swipe-complete-set:v1`, one-time on first session render after ship. See UX Design / Discoverability.
- **C3 (a11y placement):** RESOLVED. Custom `accessibilityActions` lives on the existing checkmark `Pressable` (which already owns toggle semantics). Row container gets `accessibilityHint`. See UX Design / A11y, Acceptance criterion #9.
- **C4 (`is_pr` wording):** RESOLVED via TC6 — edge-case row rewritten to describe DB unchanged + live PR detector re-fire on swipe-recomplete as "pre-existing tap-checkmark behavior preserved unchanged". See Edge Cases / `is_pr`.
- **C5 (mid-add row):** RESOLVED — edge case dropped. No flag exists, `activeOffsetX` already absorbs incidental motion. See Edge Cases / dropped row.
- **C6 (convergence acceptance test):** RESOLVED. New acceptance test in `__tests__/acceptance/swipe-complete-set.acceptance.test.tsx` asserts the four convergence invariants (DB write, BLD-630 clock anchor, BLD-559 feedback exactly once, BW-modifier cache invalidation). See Testing / Acceptance, Acceptance criteria #1–#4.

**Tech Lead Blockers:**
- **T1 (bidirectional pan refactor specifics):** RESOLVED. Direction decided **at release** via `Math.sign(translateX.value)`. Per-direction commit behavior `{ left: 'slide-out', right: 'snap-back' }`. Both background `Animated.View`s rendered with sign-gated opacity. See Overview §4, Technical Approach / Reanimated.
- **T2 (per-direction thresholds, no destructive regression):** RESOLVED — see B3. Left pinned to `{0.5, 120}`; right `{0.35, 80}`. Test asserts left fraction unchanged.
- **T3 (six consumers, not three):** RESOLVED. Full enumeration in Technical Approach / NOT touched. `SwipeToDelete` becomes thin wrapper pinning `right: undefined`. Per-consumer lock-in test (`__tests__/components/swipe-to-delete-consumers.test.tsx`). See Acceptance criterion #12.
- **T4 (entry-point is `handleCheckPress`):** RESOLVED — see B1. No new prop on `SetRow`; `app/session/[id].tsx` not modified for prop wiring.
- **T5 (no extra haptic):** RESOLVED — see B2. `rightHaptic: false` on the bidirectional component.
- **T6 (iOS edge-swipe-back):** RESOLVED — see C1. Option chosen: `screenOptions={{ gestureEnabled: false }}` on `app/session/[id].tsx`.

**Tech Lead Conditions:**
- **TC1 (read-only history):** RESOLVED — edge case dropped. `SetRow` has no `readOnly` prop; history uses different screens. No new prop introduced.
- **TC2 (mid-add row):** RESOLVED — see C5.
- **TC3 (gesture-vs-Pressable collision):** RESOLVED. Acceptance test "swipe-right then release with finger over checkmark Pressable → `handleCheckPress` called exactly once". See Testing / Acceptance, Acceptance criterion #11.
- **TC4 (`showHint` direction):** RESOLVED — see C2. Right-only, AsyncStorage one-time.
- **TC5 (missing tests):** RESOLVED. Testing section now lists vertical-dominance guard, two-row concurrent-cancel, convergence invariants, per-consumer lock-ins.
- **TC6 (`is_pr` re-fire on recomplete):** RESOLVED — see C4. Called out in edge-cases as "pre-existing behavior preserved".

### Re-review Request

@quality-director @techlead — plan revised per all blockers and conditions above. Please re-review the diff and either APPROVE or post any remaining concerns. The revision log maps each finding to the section that addresses it.

### CEO Decision
**APPROVED** — 2026-04-25T15:28Z

Both gates cleared:
- Tech Lead: APPROVE rev 2 (2026-04-25T15:26:22Z, comment a260fb21).
- Quality Director: APPROVE rev 2 (2026-04-25T15:28:36Z, comment 4362868e).
- Psychologist: N/A (Behavior-Design Classification = NO).

Implementation proceeds at BLD-614 (existing owner-filed todo, linked as child of BLD-646). Engineer follows the plan exactly — no scope creep, no extra haptics on the gesture path, no destructive-threshold changes.

Non-blocking impl notes carried from reviewers (must show up in PR):
1. **Wrapper prop mapping (techlead):** `SwipeToDelete` wrapper maps every existing public prop (`dismissThresholdFraction`, `minDismissPx`, `velocityDismissPxPerSec`, `velocityMinTranslatePx`, `haptic`, `widthBasis`, `showHint`, `onDelete`, `enabled`) onto `SwipeRowAction.left.{...}` so the five non-SetRow call sites stay byte-for-byte unchanged. Wrapper defaults remain `{fraction: 0.4, minPx: 0}` to preserve current behavior.
2. **File-level Hard Exclusions header (techlead):** place the verbatim Hard Exclusions list at the **top of `components/session/SetRow.tsx`** (file-level, matching `components/nutrition/WaterSection.tsx:4-14`), not only the touched section. New `components/SwipeRowAction.tsx` carries the same file-level header.
3. **Sign-gated opacity (QD spot-check):** right-side reveal `Animated.View` opacity gated by `Math.sign(translateX.value) > 0` (not absolute value), to prevent right-side background leaking into wrapper-mode (`right: undefined`) layouts. The per-consumer lock-in test catches the regression.
4. **JSX tree invariant for acceptance #11:** the checkmark `Pressable` must be a descendant of the translated content (i.e., it moves with `translateX`); if it ends up as a sibling-not-descendant, the "swipe-then-release-near-checkmark fires `handleCheckPress` exactly once" guarantee collapses. PR review verifies the JSX tree.
