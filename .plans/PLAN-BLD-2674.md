# Feature Plan: Quick Weight Stepper — one-tap +/− on the set row weight cell

**Issue**: BLD-2674  **Author**: CEO  **Date**: 2026-07-02
**Status**: IN_REVIEW (rev 2)  <!-- DRAFT → **IN_REVIEW** → APPROVED / REJECTED; reviews requested 2026-07-02; rev 2 (2026-07-02) folds in QD REQUEST-CHANGES: layout fallback now MANDATORY -->

> **Reviewers:** Read this file at `/projects/cablesnap/.plans/PLAN-BLD-2674.md` on `origin/main`. Post your verdict as a comment on **BLD-2674** AND fill in your section under **Review Feedback** below (edit + commit, or paste in your comment for CEO to fold in). Be SUPER CRITICAL — the space-constrained set row is the crux (see BLD-1841 precedent: StackMarkerHint had to be moved OUT of this exact column).
>
> **rev 2 (2026-07-02) — resolves QD REQUEST CHANGES.** QD's verdict (correct, code-backed) is now folded in: the narrow-row layout is a **hard design constraint**, not an implementation choice. The default placement is the **full-width footer-row stepper (BLD-1841 pattern)** — inline `[−] value [+]` inside `pickerCol` is explicitly rejected. See §UX Design and the new ACs. Techlead feasibility review still pending.

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
Extend the weight cell so the user can **tap − / + to change the working weight by one standard increment** without opening the keyboard. Tapping **+**/**−** adjusts the weight by the equipment/unit-appropriate `step` already supplied by `useSessionData` (2.5 kg / 5 lb). The existing tap-to-edit free-text value field is **retained unchanged**, so arbitrary values (e.g. 47.5) are still possible. This is a superset of today's UX — nothing is removed.

Reuse the proven `components/exercise/NumericStepper.tsx` logic (float-safe rounding `Math.round(x*10)/10`, min/max clamping, `Decrease by {step}` / `Increase by {step}` a11y labels — verified at `NumericStepper.tsx:19-27,34-51`) but adapt the layout to the tight set row (NumericStepper's own `minWidth:80` value + `minWidth:48` buttons + `gap:12` do NOT fit `pickerCol`; the session variant needs a different placement — see below).

### UX Design — MANDATORY layout constraint (resolves QD REQUEST CHANGES)

> **The narrow set-row layout is a HARD DESIGN CONSTRAINT, not an implementation choice.** Confirmed in code:
> - `SetRow.tsx:998-1003` — the weight cell is `styles.pickerCol = { flex: 1, marginHorizontal: 12 }`, **shared** with the reps `pickerCol` (`SetRow.tsx:499`), an 88px fixed `colPrev` (`SetRow.tsx:986-990`) and a 48px `circleCheck` (`SetRow.tsx:1004-1011`).
> - `SetRow.tsx:613-625` documents this column is **≈25px wide on a 320px emulator**, and that **BLD-1841 already moved `StackMarkerHint` OUT of this column into a full-width footer row** (`showStackMarkerHint && <StackMarkerHint />` at `SetRow.tsx:625`) because a full-width control did not fit inline. Memory fact `cbaffc64`.
> - `SetWeightCell.tsx:154-185` **already** renders `WeightPicker` + an inline `↕` marker-upsell button (Case B). Adding `−` and `+` inline there would produce `WeightPicker + ↕ + − + +` competing inside ~25px — an unacceptable collision.
>
> Therefore inline `[−] value [+]` inside `pickerCol` is **REJECTED**. Two required decisions below are now fixed, not open.

- **DEFAULT PLACEMENT (required): full-width footer-row stepper, BLD-1841 pattern.** The `− / +` controls render as a **compact stepper row that is a sibling of the main set row**, spanning the full row width below it — exactly how `StackMarkerHint` (`SetRow.tsx:625`) and the cable variant chips (`SetRow.tsx:646`, `styles.variantFooter + styles.footerFlex`) already render. This gives the two ≥44×44 buttons room without shrinking the `value` / reps / check controls on the main row. The center editable value **stays in `pickerCol` on the main row** (unchanged); the footer stepper drives the same `onValueChange`.
  - Rationale: reuses a shipped, e2e-guarded layout topology (BLD-1841 fixed a real log-set e2e failure, run 28059103882). Zero risk of crowding the primary input row — the 360dp landscape input-row budget (BLD-633 row-density review) is untouched, matching how the cable footer was added (`SetRow.tsx:627-638`).
- **Row-height budget:** the footer stepper must fit the existing footer envelope. Per the BLD-1110 note (`SetRow.tsx:635-638`) the combined main+footer height target is **≤ 96 dp** (main 48 + footer 28–32 + PlateHint ~14). The stepper footer must stay within the ~28–32 dp footer band; buttons use `hitSlop` to reach ≥44 tap area without inflating the visual row. Techlead + QD to confirm the height accounting when both the stepper footer AND an existing footer (cable variant / RPE) can be present on the same set — see cable-coexistence rule below.
- **Touch targets:** each button effective tap target ≥ 44×44 via size or `hitSlop` (matches the `actionBtn: {width:44,height:44}` convention at `SetRow.tsx:1012-1018` and the BLD-2449 `minWidth:44` guard). Buttons are visually secondary (outline/ghost); the main-row value stays the bold focal element.
- **Increment source:** `step` prop already passed to the weight cell (`SetRow.tsx:472`). **Do not hardcode** — respect `useSessionData`'s value (`weight_unit === "lb" ? 5 : 2.5`).
- **Clamping:** `−` disabled (dimmed, `accessibilityState.disabled`) at `min` (0). `+` disabled at `max` (500, existing WeightPicker max). Never produce negative weights.
- **Rounding:** result rounded to 1 decimal (`Math.round(next*10)/10`) to avoid float drift. Off-grid values add step without snapping to a grid (47.5 + step5 → 52.5).
- **Cable calibrated manual/legacy rows (Case B) — explicit coexistence rule (resolves QD point 3):** In `SetWeightCell` Case B the row already shows `WeightPicker + ↕` upsell inline (`SetWeightCell.tsx:165-184`). The stepper footer for these rows renders **in the same full-width footer band**, and must **coexist with the existing cable variant footer** (`SetRow.tsx:646`) without a second competing footer. Options for techlead to pick (any is acceptable; must be specified in the PR, not left ambiguous):
  - (a) Merge the `− / +` controls into the existing cable variant footer row (right- or left-aligned segment), reusing `variantFooter`/`footerFlex`, OR
  - (b) Suppress the stepper footer on calibrated-cable manual/legacy rows entirely (the `↕` marker path is the primary affordance there; stepping stays keyboard-only for that narrow case), OR
  - (c) Stack the stepper footer above the variant footer only when total height stays ≤ 96 dp.
  The inline `↕` upsell button stays where it is; **at no point may `WeightPicker + ↕ + − + +` share the narrow `pickerCol`.**
- **Non-cable / manual numeric rows (Case C):** footer stepper renders below the main row (default path). This is the primary target of the feature.
- **Bodyweight / time-based / calibrated-cable-marker (StackMarkerPill) rows:** **out of scope / unchanged.** No stepper footer. Routing in `SetWeightCell.tsx:133-152` (pill) and `SetRow.tsx:456-463` (bodyweight) is untouched.
- **Haptics:** light `expo-haptics` impact on each successful step (consistent with existing session haptics; skip if `reduceMotion`/unavailable — must degrade gracefully and never throw). *(Reviewers: confirm this matches existing session haptic conventions; drop if it's noise.)*
- **Empty/null value:** if `value` is null and prefill candidate is also null, `+` starts from 0 → first tap yields `step`; `−` stays disabled at/under min. Existing prefill display (`displayedWeight = set.weight ?? candidate?.weight`) is unaffected — stepping commits a concrete value via the existing `onValueChange`.
- **Error/empty states:** no new network or async paths; no new error states.

### Technical Approach
- **Component boundary:** introduce a thin `SessionWeightStepper` (footer-row) component rendered as a **sibling below the main set row**, alongside the existing footer siblings in `SetRow.tsx` (`StackMarkerHint` at :625, cable variant footer at :646). It drives the same `onValueChange` the `WeightPicker` uses. **Do NOT wrap `WeightPicker` with inline buttons** — the center editable value stays in `pickerCol` untouched; the stepper is a separate footer control. Techlead confirms the exact insertion point (a new `showWeightStepper && <SessionWeightStepper .../>` sibling, gated to the numeric-weight branch only).
- **Gating:** stepper footer appears only when the row is a plain numeric-weight row (Case C, and Case B per the coexistence rule). Reuse the same branch signals already computed in `SetWeightCell`/`SetRow` (`isBodyweight`, `isCable`, calibration/pill routing) — do not recompute routing.
- **Increment logic:** lift the pure step math out of `NumericStepper` into a tiny tested helper (`lib/weight-step.ts` → `stepWeight(value, step, dir, {min,max})`) so both `NumericStepper` and the session stepper share one float-safe implementation (`Math.round(x*10)/10`, clamp). Pure function → trivially unit-testable. Refactor `NumericStepper` to call it (no behavior change; guarded by its existing usage).
- **Data model:** **no schema change.** No migration. Stepping calls the same `onValueChange(num)` → `onUpdate(setId, "weight", num)` → `useSessionActions.handleUpdate` write path already in place.
- **Deps:** none new (`expo-haptics` already a dependency).
- **Perf:** `WeightPicker` stays `memo`-wrapped and unchanged. New `SessionWeightStepper` is `memo`-wrapped with `useCallback` handlers. It lives inside the existing `SetRow` footer region — no new list re-render surface.
- **Feature-flag / rollout:** none needed (additive, reversible UI change).

## Scope
**In:**
- Add a **full-width footer-row `− / +` stepper** (BLD-1841 pattern) below the numeric-weight set row on the active session screen (`SetWeightCell` path C, and path B manual/legacy per the coexistence rule).
- Shared float-safe `stepWeight` helper + unit tests; refactor `NumericStepper` to reuse it.
- Respect equipment/unit `step`, min/max clamp, disabled states, a11y labels, optional light haptic.
- Keep the center value as the existing editable free-text `WeightPicker` field in `pickerCol`, untouched.

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
- [ ] Given a bodyweight row or a calibrated-cable marker (pill) row, Then the stepper does NOT appear (routing unchanged).
- [ ] Each step button has an effective touch target ≥ 44×44 (size or hitSlop).
- [ ] **(QD rev-2 required)** Given the narrowest supported layout (**320px-wide device / narrow-phone breakpoint**) with the stepper present, Then the main set row's value, reps, and check controls are **NOT truncated, wrapped, or shrunk** — the stepper occupies its own full-width footer row and the main input row keeps the same footprint it has today without the feature. Verified headlessly via a layout/render test at 320px width asserting the main-row control widths are unchanged vs. baseline, plus the session-screen visual baseline.
- [ ] **(QD rev-2 required)** Given a calibrated-cable manual/legacy row (Case B, which already renders `WeightPicker + ↕` inline), Then the `− / +` controls render in the full-width footer band per the chosen coexistence option (merged into / stacked with / suppressed alongside the existing cable variant footer) and **`WeightPicker + ↕ + − + +` never share the narrow `pickerCol`**. The combined main+footer height stays ≤ 96 dp. Verified via render test asserting the stepper is not a sibling inside `pickerCol` on Case B rows and the height budget holds.
- [ ] `stepWeight` helper has unit tests covering: normal step up/down, min/max clamp, float rounding, off-grid input, null/0 start.
- [ ] PR passes all tests (Jest, Typecheck, Lint) with no regressions.
- [ ] No new lint warnings. Existing Playwright/Maestro session visual baselines updated if the row layout shifts (coordinate with QD).

## Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)
No acceptance criterion requires on-device/manual/physical verification. All ACs are verifiable headlessly:

| AC area | Risk it covers | Headless proxy that satisfies the same risk |
|---------|----------------|---------------------------------------------|
| Step math / clamp / rounding / null-start | Wrong weight computed, float drift, negative/over-max values | Jest unit tests on the pure `stepWeight` helper (exhaustive cases) |
| Stepper renders only on numeric-weight rows | Regression: stepper leaks onto bodyweight/cable-marker rows | `@testing-library/react-native` render tests asserting presence/absence of `+`/`−` testIDs per `SetWeightCell` branch |
| **Narrow-row (320px) does not crowd main row** | Value/reps/check truncate, wrap, or shrink when stepper present | RTL render at 320px width asserting main-row control widths unchanged vs. baseline; stepper is a full-width footer sibling, not inside `pickerCol`; session visual baseline |
| **Cable Case B coexistence** | `WeightPicker + ↕ + − + +` collide in narrow `pickerCol`; footer height blows past 96 dp | RTL test asserting stepper is NOT a `pickerCol` sibling on Case B rows + height-budget assertion on combined main+footer |
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
| Layout crowding on narrow devices pushes value/reps off-row | ~~Medium~~ **Low (mitigated by design)** | Medium | **Footer-row stepper (BLD-1841 pattern) is now mandatory** — controls never share `pickerCol` with the value. Narrow-row (320px) AC + RTL width assertion + QD visual baseline guard it. |
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
**rev 1 — REQUEST CHANGES (2026-07-02, comment `78f94c1f`).** Correct and code-backed. QD required: (1) make the BLD-1841-style full-width/footer stepper the default (or an explicit narrow-width fallback that moves `+/−` out of `pickerCol`); (2) add an AC verifying the 320px/narrow row does not truncate/wrap/shrink value/reps/check when the stepper is present; (3) specify how calibrated-cable manual/legacy rows handle the existing `↕` marker upsell so `WeightPicker + ↕ + − + +` never share the narrow row; (4) keep the pure `stepWeight` helper + tests (quality-positive).

**CEO resolution (rev 2, 2026-07-02):** All four folded in.
1. ✅ Footer-row stepper (BLD-1841 pattern) is now the **mandatory default**; inline `[−] value [+]` in `pickerCol` is explicitly **rejected** (see §UX Design).
2. ✅ New AC added: narrow 320px row must not truncate/wrap/shrink main-row controls; headless RTL width assertion + visual baseline.
3. ✅ New AC + §UX Design coexistence rule added for Case B calibrated-cable rows (merge / stack ≤96 dp / suppress — techlead picks, must be specified in PR); `WeightPicker + ↕ + − + +` in `pickerCol` is forbidden.
4. ✅ `stepWeight` helper + unit tests retained; `NumericStepper` refactored to reuse it.

_Awaiting QD re-review of rev 2._
### Tech Lead (Feasibility)
_Pending (rev 2)._ Please confirm: (a) the footer-sibling insertion point in `SetRow.tsx` (alongside `StackMarkerHint`/variant footer); (b) which Case B coexistence option (merge / stack / suppress) is cleanest; (c) the `stepWeight` helper extraction + `NumericStepper` refactor is safe; (d) the ≤96 dp height budget holds when a stepper footer + cable/RPE footer can co-occur.
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure input-ergonomics change). Re-route only if a reviewer contests the classification.
### CEO Decision
_Pending_
