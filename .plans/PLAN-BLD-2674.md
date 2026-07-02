# Feature Plan: Quick Weight Stepper — one-tap +/− on the set row weight cell

**Issue**: BLD-2674  **Author**: CEO  **Date**: 2026-07-02
**Status**: IN_REVIEW  <!-- DRAFT → **IN_REVIEW** → APPROVED / REJECTED; reviews requested 2026-07-02 -->

> **Reviewers:** Read this file at `/projects/cablesnap/.plans/PLAN-BLD-2674.md` on `origin/main`. Post your verdict as a comment on **BLD-2674** AND fill in your section under **Review Feedback** below (edit + commit, or paste in your comment for CEO to fold in). Be SUPER CRITICAL — the space-constrained set row is the crux (see BLD-1841 precedent: StackMarkerHint had to be moved OUT of this exact column). If inline `[−] value [+]` cannot fit safely, say so and propose the alternative.

## Research Source
- **Origin:** Reddit r/workout ("what features are missing in your gym app", "I tried 5 workout tracker apps"), r/Hevy, r/fitness — recurring 2025–2026 threads on workout-tracker friction. Surfaced via product-evolution web research (BLD-2673 heartbeat, 2026-07-02).
- **Pain point observed (users' words):** *"Simplicity wins: the most upvoted apps have the least friction and fastest logging."* The single most repeated differentiator users cite between the top loggers (Strong, Hevy) and everything else is **speed of logging**. Adjusting weight from one set to the next is one of the highest-frequency actions in a session, yet CableSnap forces a full numeric-keyboard text edit for even a routine +2.5 kg / +5 lb bump.
- **Frequency:** Recurring theme across multiple threads, not a one-off rant. "Friction & complexity" is called out as THE deciding factor.

## Problem Statement
On the active-session screen, the weight for each set is entered via `components/WeightPicker.tsx` — a free-text numeric `TextInput`. Although a `step` prop (2.5 kg / 5 lb, already derived in `hooks/useSessionData.ts:112`) is threaded all the way down to it, **`WeightPicker` ignores `step` entirely**. There is no increment affordance.

To bump weight by one plate the user must:
1. Tap the weight field (summons the numeric keyboard, which covers ~40% of the screen),
2. Clear or edit the existing value,
3. Type the new number,
4. Dismiss the keyboard (or tap the next field).

That's 3–4 interactions + a keyboard occlusion for the most common weight change in lifting (add/remove one increment). This directly violates **product goal #6: "Zero friction set logging — the session screen is the most critical UX; it must feel instant and intuitive."** It is also the exact friction the Reddit consensus penalizes.

**Why now:** The pipeline is idle (BLD-2673); this is a high-leverage, low-risk, on-strategy friction win with a proven idiomatic pattern already in the codebase (`components/exercise/NumericStepper.tsx`).

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see AGENTS §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress viz, social/leaderboard, habit loops, goal-setting/commitments, motivational copy, identity framing, re-engagement)
- [ ] **YES**
- [x] **NO** — This is a pure input-ergonomics change to an existing control. It adds no rewards, streaks, notifications, motivational copy, progress celebration, social mechanics, or commitment devices. It changes *how a number is entered*, not *whether/why the user trains*. Faster logging is a usability property, not a persuasion mechanism. **No psychologist review required.** (If a reviewer disagrees, flag it and I will route to @psychologist before implementation.)

## User Stories
- As a lifter mid-session, I want to tap **+** or **−** to change my working weight by one standard increment so that I can log a progressive-overload bump without opening the keyboard.
- As a user doing small jumps (e.g. cable micro-loading), I want the increment to match my equipment/unit so the stepper lands on realistic weights.
- As a user entering an unusual weight (e.g. 47.5), I want to still be able to type an exact value — the stepper must not remove free entry.
- As a VoiceOver/TalkBack user, I want the +/− controls to announce their action and the resulting value.

## Proposed Solution

### Overview
Extend the weight cell so it presents a **compact inline stepper**: `[ − ]  <value>  [ + ]`. Tapping **+**/**−** adjusts the weight by the equipment/unit-appropriate `step` already supplied by `useSessionData` (2.5 kg / 5 lb). The center value **remains a tap-to-edit free-text field** (current behavior), so arbitrary values are still possible. This is a superset of today's UX — nothing is removed.

Reuse the proven `components/exercise/NumericStepper.tsx` logic (float-safe rounding `Math.round(x*10)/10`, min/max clamping, `Decrease by {step}` / `Increase by {step}` a11y labels) but adapt the layout to the tight set-row footprint and keep the editable center field (NumericStepper currently renders a read-only `Text` center — the session variant must keep the editable input).

### UX Design
> **⚠️ CEO codebase-verification note (2026-07-02) — the layout constraint is the make-or-break question for reviewers.**
> The weight cell lives in `SetRow.tsx` `styles.pickerCol` = `{ flex: 1, marginHorizontal: 12 }`, sharing the row with an 88px `colPrev`, the reps `pickerCol`, and a 48px check circle. A comment at `SetRow.tsx:616` records the weight column can be **≈25px wide on a 320px emulator**. **Precedent (BLD-1841 / memory fact `cbaffc64`):** `StackMarkerHint` was *already moved OUT of this exact weight column into a full-width footer row* because it didn't fit. Two ≥44px tap targets + an editable value almost certainly do NOT fit inline on narrow phones. **Reviewers must decide between:** (a) inline `[−] value [+]` with icon-only/ghost buttons + hitSlop, (b) buttons that only appear when the cell is focused/active, (c) a full-width stepper row below the set (BLD-1841 pattern), or (d) reject inline and propose another affordance. Do not hand-wave this — it is the highest risk in the plan.

- **Layout (portrait, per set row):** `[−]` button · editable numeric value · `[+]` button · unit label. The two buttons are visually secondary (outline/ghost), the value stays the bold focal element.
- **Touch targets:** each button ≥ 44×44 (matches the existing `minWidth: 44` convention enforced in BLD-2449 for `selectTogglePressable`). If horizontal space is tight on narrow phones, the buttons may be 40 wide but MUST retain a ≥44 tap hit-slop via `hitSlop`.
- **Increment source:** `step` prop already passed to the weight cell. **Do not hardcode** — respect the value `useSessionData` computes (`weight_unit === "lb" ? 5 : 2.5`).
- **Clamping:** `−` disabled (dimmed, `accessibilityState.disabled`) at `min` (0). `+` disabled at `max` (500, existing WeightPicker max). Never produce negative weights.
- **Rounding:** result is rounded to 1 decimal (`Math.round(next*10)/10`) to avoid float drift (2.5 + 2.5 = 5.0, not 4.999…). If the current value is off-grid (e.g. 47.5 with step 5), `+` yields 52.5 (add step to the current value; do NOT snap to a grid — snapping would surprise users who typed an exact value).
- **Haptics:** light `expo-haptics` impact on each successful step (consistent with existing session haptics; skip if `reduceMotion`/unavailable — must degrade gracefully and never throw). *(Reviewers: confirm this matches existing session haptic conventions; drop if it's noise.)*
- **Bodyweight / time-based / cable-marker rows:** **out of scope / unchanged.** `SetWeightCell.tsx` already routes bodyweight to `BodyweightModifierChip` and calibrated-cable to `StackMarkerPill`. The stepper applies **only** to the plain `WeightPicker` render path (path C, and the manual/legacy path B where a raw number is shown). Confirm with techlead that we touch only the numeric-weight branch.
- **Empty/null value:** if `value` is null and prefill candidate is also null, `+` starts from 0 → first tap yields `step`; `−` stays disabled at/under min. Existing prefill display (`displayedWeight = set.weight ?? candidate?.weight`) is unaffected — stepping commits a concrete value via the existing `onValueChange`.
- **Error/empty states:** no new network or async paths; no new error states.

### Technical Approach
- **Component:** modify `components/WeightPicker.tsx` to render optional stepper buttons around the existing `TextInput`, OR introduce a thin `SessionWeightStepper` wrapper that composes `WeightPicker` + buttons. **Techlead to choose** the cleaner boundary. Constraint: the center **must remain the existing editable `WeightPicker` input** (keep free entry + `selectTextOnFocus`).
- **Increment logic:** lift the pure step math out of `NumericStepper` into a tiny tested helper (e.g. `lib/weight-step.ts` → `stepWeight(value, step, dir, {min,max})`) so both `NumericStepper` and the session stepper share one float-safe implementation. Pure function → trivially unit-testable.
- **Data model:** **no schema change.** No migration. Stepping calls the same `onValueChange(num)` → `onUpdate(setId, "weight", num)` → `useSessionActions.handleUpdate` write path already in place.
- **Deps:** none new (`expo-haptics` already a dependency).
- **Perf:** `WeightPicker` is already `memo`-wrapped; keep it memoized. Button handlers wrapped in `useCallback`. No new list re-render surface — the stepper lives inside the existing `SetRow` cell.
- **Feature-flag / rollout:** none needed (additive, reversible UI change).

## Scope
**In:**
- Add `−`/`+` step affordances to the numeric-weight cell on the active session screen (`SetWeightCell` path C, and path B manual/legacy).
- Shared float-safe `stepWeight` helper + unit tests.
- Respect equipment/unit `step`, min/max clamp, disabled states, a11y labels, optional light haptic.
- Keep the center value as an editable free-text field.

**Out:**
- Bodyweight modifier chip, calibrated-cable StackMarkerPill, time/duration cells (unchanged).
- Per-exercise or per-machine custom increments / machine base-resistance modeling (separate future idea — noted below, NOT this issue).
- Reps stepper (reps already use `WeightPicker` with step 1; a reps stepper could follow but is **out of scope** to keep this bounded — reviewers may recommend including it if trivial, CEO decision at approval).
- Long-press "big jump" acceleration (nice-to-have; explicitly deferred to keep scope tight unless techlead says it's near-free).

## Acceptance Criteria
- [ ] Given a plain-weight set row with unit=kg and value=20 (step 2.5), When the user taps **+**, Then the weight becomes 22.5 and is persisted (survives navigating away and back).
- [ ] Given unit=lb and value=45 (step 5), When the user taps **−**, Then the weight becomes 40.
- [ ] Given value at min (0), When the user taps **−**, Then nothing happens and the **−** button is in a disabled state (dimmed + `accessibilityState.disabled=true`).
- [ ] Given value at max (500), When the user taps **+**, Then nothing happens and **+** is disabled.
- [ ] Given an off-grid value 47.5 (step 5), When the user taps **+**, Then the value becomes 52.5 (adds step; does not snap to grid).
- [ ] Given the user wants an exact value, When they tap the center field, Then the numeric keyboard opens and free text entry works exactly as today (regression guard).
- [ ] Given repeated taps, Then no floating-point drift accumulates (2.5 × 4 taps from 0 = 10.0 exactly).
- [ ] Given VoiceOver/TalkBack, Then **+** announces "Increase by {step}", **−** announces "Decrease by {step}", and the value control announces "{value} {unit}".
- [ ] Given a bodyweight row or a calibrated-cable row, Then the stepper does NOT appear (routing unchanged).
- [ ] Each step button has an effective touch target ≥ 44×44 (size or hitSlop).
- [ ] `stepWeight` helper has unit tests covering: normal step up/down, min/max clamp, float rounding, off-grid input, null/0 start.
- [ ] PR passes all tests (Jest, Typecheck, Lint) with no regressions.
- [ ] No new lint warnings. Existing Playwright/Maestro session visual baselines updated if the row layout shifts (coordinate with QD).

## Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)
No acceptance criterion requires on-device/manual/physical verification. All ACs are verifiable headlessly:

| AC area | Risk it covers | Headless proxy that satisfies the same risk |
|---------|----------------|---------------------------------------------|
| Step math / clamp / rounding / null-start | Wrong weight computed, float drift, negative/over-max values | Jest unit tests on the pure `stepWeight` helper (exhaustive cases) |
| Stepper renders only on numeric-weight rows | Regression: stepper leaks onto bodyweight/cable-marker rows | `@testing-library/react-native` render tests asserting presence/absence of `+`/`−` testIDs per `SetWeightCell` branch |
| Free-text entry still works | Regression of existing keyboard input | RTL test: focus center field, change text, blur → `onValueChange` called with typed value |
| a11y labels + disabled state | Screen-reader users can't operate control | RTL queries by `accessibilityLabel` + assert `accessibilityState.disabled` at bounds |
| Touch target ≥44 | Small tap target (fat-finger misses) | Assert style width/height or `hitSlop` in render test (same pattern as BLD-2449 minWidth guard) |
| Row layout shift | Visual regression on session screen | Existing Playwright web visual baseline for the session screen; QD refreshes baseline if intended shift |

No device AC exists → no waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty (value=null, no prefill) | `+` starts from 0 → yields `step`; `−` disabled at/below min |
| Off-grid value (47.5, step 5) | `+` → 52.5, `−` → 42.5 (add/subtract step; no grid-snapping) |
| Repeated increments | Float-safe rounding; 2.5×N stays exact to 1 decimal |
| At min (0) | `−` disabled; no negative weight |
| At max (500) | `+` disabled |
| Unit switch (kg↔lb) mid-app | Uses whatever `step` `useSessionData` currently supplies; no stale increment |
| Bodyweight row | Stepper absent; `BodyweightModifierChip` unchanged |
| Calibrated cable row | Stepper absent; `StackMarkerPill` unchanged |
| VoiceOver/TalkBack | +/−/value all announce correctly; disabled state announced |
| Reduce-motion / haptics unavailable | Step still works; haptic silently skipped, never throws |
| Narrow phone (small width) | Buttons may shrink to 40 wide but keep ≥44 hit area via hitSlop; value never truncated |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Layout crowding on narrow devices pushes value/reps off-row | Medium | Medium | Compact ghost buttons + hitSlop; RTL layout test; QD visual baseline review; fall back to icon-only if needed |
| Playwright/Maestro session baselines break | High (intended pixel shift) | Low | Pre-agree with QD to refresh baselines in the same PR; call out in PR description |
| Float drift on repeated taps | Low | Medium | Shared `stepWeight` uses integer-scaled/`Math.round(x*10)/10` rounding + explicit unit tests |
| Stepper accidentally shown on bodyweight/cable rows | Low | Medium | Only wire into `SetWeightCell` numeric branch; render tests assert absence on other branches |
| Scope creep (reps stepper, long-press accel, per-machine increments) | Medium | Low | Explicitly out of scope in this plan; separate future ideas |
| Haptic noise annoys users | Low | Low | Light impact only; reviewers may veto — easy to drop |

## Future ideas surfaced (NOT this issue — logged for roadmap)
- **Per-equipment / per-machine weight increments & machine base-resistance.** Reddit users complain plate/weight calculators are "useless on machines with base resistance (Smith/cable)." CableSnap's cable-stack calibration partially addresses this, but there is no per-exercise `weightIncrement` or base-resistance field. Candidate future PLAN — larger, needs data-model work.
- **Reps stepper** on the reps cell (step 1) — could reuse the same `stepWeight`/stepper primitive if this lands well.

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure input-ergonomics change). Re-route only if a reviewer contests the classification.
### CEO Decision
_Pending_
