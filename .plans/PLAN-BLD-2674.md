# Feature Plan: Quick Weight Stepper — one-tap +/− on the set row weight cell

**Issue**: BLD-2674  **Author**: CEO  **Date**: 2026-07-02
**Status**: APPROVED  <!-- DRAFT → IN_REVIEW (rev 2) → **APPROVED** 2026-07-02: QD APPROVED (BLD-2676), techlead APPROVED w/ conditions (b)+(d) folded in (BLD-2677), psychologist N/A -->

> **APPROVED 2026-07-02.** All reviews complete. QD APPROVED, techlead APPROVED with two required plan edits — Case B suppression (b) and the Case C + RPE height rule (d) — now folded into this plan. Implementation issue created assigned to claudecoder. Reviewers: this plan is frozen; implement exactly as specified below.

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
- **Cable calibrated manual/legacy rows (Case B) — DECIDED: suppress the stepper footer (techlead verdict, resolves QD point 3 + TL condition (b)):** In `SetWeightCell` Case B the row already shows `WeightPicker + ↕` upsell inline (`components/session/SetWeightCell.tsx:165-184`) **and always carries a cable variant footer** — every Case B row satisfies `isCableExercise(...)`, which is the exact gate that renders the variant footer (`components/session/SetRow.tsx:644`), and that footer already merges the RPE strip via `footerWithRpe`. Therefore:
  - **The stepper footer is SUPPRESSED on calibrated-cable manual/legacy rows.** Rationale (techlead): merging `−/+` into the single-`Pressable` variant footer fights its gesture surface and a11y label; stacking risks breaching 96 dp with variant+RPE+PlateHint. The primary affordance on calibrated cable is the `↕` marker path (marker-logging, not raw-kg stepping); keyboard entry via the existing `WeightPicker` stays available. Zero collision, zero height risk, smallest diff.
  - **DECISION (encode in PR): Option (b) — suppress on Case B.** The inline `↕` upsell button stays where it is; **at no point may `WeightPicker + ↕ + − + +` share the narrow `pickerCol`.**
- **Non-cable / manual numeric rows (Case C):** footer stepper renders below the main row (default path). This is the primary target of the feature. **(TL condition (d) — completed Case C + RPE height rule, see below.)**
- **Completed Case C rows with RPE capture on — DECIDED: merge or suppress to hold ≤96 dp (techlead condition (d)):** A standalone RPE row (height 32, `styles.standaloneRpe`) already renders on plain rows when `set.completed && captureRpe` (`components/session/SetRow.tsx:849-857`, BLD-1110 budget `main 48 + standalone-RPE 32 + PlateHint ~14 = ≤96 dp`). Adding a **separate** stepper band (28-32 dp) on such a row → ~122-126 dp, **breaching 96 dp** (`hitSlop` does not help — it expands tap area, not visual height). **DECISION (encode in PR — pick ONE):**
  - (i) **Merge** the stepper `−/+` into the standalone-RPE footer band (stepper left-aligned, RPE chips right-aligned, single 28-32 dp band) reusing the existing `footerWithRpe`/`footerFlex` merge topology (`SetRow.tsx:916-923`) — budget holds; **OR**
  - (ii) **Suppress** the stepper on completed+RPE rows (stepping is a pre-completion action; RPE is captured post-completion, so temporal overlap is small — but "complete then bump weight to fix a typo" is a real path, so the rule must exist).
  Either is acceptable; the PR must pick one **and add a Case C + RPE height-budget AC** symmetric to the Case B AC.
- **Bodyweight / time-based / calibrated-cable-marker (StackMarkerPill / Case A) rows:** **out of scope / unchanged.** No stepper footer. Routing in `components/session/SetWeightCell.tsx:133-152` (pill) and `components/session/SetRow.tsx:456-463` (bodyweight) is untouched. **Confirm the stepper stays hidden for Case A pill rows** (`shouldRenderMarkerPill` true) — it will, since those aren't plain numeric rows.
- **Haptics:** light `expo-haptics` impact on each successful step (consistent with existing session haptics; skip if `reduceMotion`/unavailable — must degrade gracefully and never throw). *(Veto-able noise; light impact only.)*
- **Empty/null value:** if `value` is null and prefill candidate is also null, `+` starts from 0 → first tap yields `step`; `−` stays disabled at/under min. Existing prefill display (`displayedWeight = set.weight ?? candidate?.weight`) is unaffected — stepping commits a concrete value via the existing `onValueChange`.
- **Error/empty states:** no new network or async paths; no new error states.

### Technical Approach
> **Path correction (QD + TL):** the components live under `components/session/` — use `components/session/SetRow.tsx` and `components/session/SetWeightCell.tsx` (the rev-1 plan text said `components/SetRow.tsx`; ACs are otherwise correct). All line refs below verified by techlead at commit `c6b492c3`.
- **Component boundary:** introduce a thin `components/session/SessionWeightStepper.tsx` (footer-row) component rendered as a **sibling below the main set row**, alongside the existing footer siblings in `SetRow.tsx`. It drives the same `onValueChange` the `WeightPicker` uses. **Do NOT wrap `WeightPicker` with inline buttons** — the center editable value stays in `pickerCol` untouched; the stepper is a separate footer control.
- **Insertion point (TL-confirmed, condition (a)):** place `{showWeightStepper && <SessionWeightStepper .../>}` **immediately after `</SwipeRowAction>` (`SetRow.tsx:611`) and BEFORE `StackMarkerHint` (`SetRow.tsx:625`)** — the stepper is the primary weight affordance so it sits closest to the input row; hints/variant/RPE/tempo/plate read as secondary metadata below it. It MUST be a **sibling of the footers, never a child of `pickerCol`** (`SetRow.tsx:998`, `flex:1, marginHorizontal:12` — the ~25px column that forced BLD-1841).
- **Gating:** `showWeightStepper` is computed in `SetRow` from signals it already has (`isCable` :319, `hasCalibration` :323, `isBodyweight`/duration routing) — do not recompute routing. It is TRUE only for plain numeric rows (Case C), FALSE for Case A (pill), Case B (suppressed per decision above), bodyweight, and duration rows. **Caveat (TL note 1):** `SetWeightCell.keypadOverride` is component-internal (`SetWeightCell.tsx:76`) and invisible to `SetRow`; with Case B suppression this is a non-issue, and Case A pill rows are already excluded.
- **Increment logic:** lift the pure step math out of `NumericStepper` into a tiny tested helper (`lib/weight-step.ts` → `stepWeight(value, step, dir, {min,max})`) so both `NumericStepper` and the session stepper share one float-safe implementation (`Math.round(x*10)/10`, clamp). **Refactor blast radius = 2 consumers only** (TL condition (c)): `components/home/QuickAddSheet.tsx` (2×) and `components/exercise/GoalSetForm.tsx`. ⚠️ **Do NOT touch** `components/muscle-volume/VolumeLandmarksSheet.tsx` — it defines its own **local** `NumericStepper`, a different component. **Require a characterization test** pinning current `NumericStepper` rounding + clamp boundaries so the extraction is provably no-op.
- **Clamp/max source of truth (TL note 2):** `WeightPicker` defaults `min=0, max=500` (`WeightPicker.tsx:18`). `stepWeight` MUST be called with the **same** bounds (`{min:0, max:500}`) so the stepper and free-text entry agree.
- **Data model:** **no schema change.** No migration. Stepping calls the same `onValueChange(num)` → `onUpdate(setId, "weight", num)` → `useSessionActions.handleUpdate` write path already in place.
- **Deps:** none new (`expo-haptics` already a dependency).
- **Perf:** `WeightPicker` stays `memo`-wrapped and unchanged. New `SessionWeightStepper` is `memo`-wrapped with `useCallback` handlers. It lives inside the existing `SetRow` footer region — no new list re-render surface.
- **Feature-flag / rollout:** none needed (additive, reversible UI change).

## Scope
**In:**
- Add a **full-width footer-row `− / +` stepper** (BLD-1841 pattern) below the numeric-weight set row on the active session screen — **Case C (plain numeric) only**; suppressed on Case B (calibrated-cable manual/legacy) per the techlead-decided coexistence rule.
- Shared float-safe `stepWeight` helper + unit tests; refactor `NumericStepper` to reuse it.
- Respect equipment/unit `step`, min/max clamp, disabled states, a11y labels, optional light haptic.
- Keep the center value as the existing editable free-text `WeightPicker` field in `pickerCol`, untouched.

**Out:**
- Bodyweight modifier chip, calibrated-cable StackMarkerPill, time/duration cells (unchanged).
- Per-exercise or per-machine custom increments / machine base-resistance modeling (separate future idea — noted below, NOT this issue).
- Reps stepper (reps already use `WeightPicker` with step 1; a reps stepper could follow but is **out of scope** to keep this bounded — reviewers may recommend including it if trivial, CEO decision at approval).
- Long-press "big jump" acceleration (nice-to-have; explicitly deferred to keep scope tight unless techlead says it's near-free).

## Acceptance Criteria
- [ ] Given a plain-weight set row with unit=kg and value=20 (step 2.5), When the user taps **+**, Then the weight becomes 22.5 and is persisted (survives navigating away and back). [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] Given unit=lb and value=45 (step 5), When the user taps **−**, Then the weight becomes 40. [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] Given value at min (0), When the user taps **−**, Then nothing happens and the **−** button is in a disabled state (dimmed + `accessibilityState.disabled=true`). [test: `__tests__/components/session/SessionWeightStepper.test.tsx`]
- [ ] Given value at max (500), When the user taps **+**, Then nothing happens and **+** is disabled. [test: `__tests__/components/session/SessionWeightStepper.test.tsx`]
- [ ] Given an off-grid value 47.5 (step 5), When the user taps **+**, Then the value becomes 52.5 (adds step; does not snap to grid). [test: `__tests__/lib/weight-step.test.ts`]
- [ ] Given the user wants an exact value, When they tap the center field, Then the numeric keyboard opens and free text entry works exactly as today (regression guard). [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] Given repeated taps, Then no floating-point drift accumulates (2.5 × 4 taps from 0 = 10.0 exactly). [test: `__tests__/lib/weight-step.test.ts`]
- [ ] Given VoiceOver/TalkBack, Then **+** announces "Increase by {step}", **−** announces "Decrease by {step}", and the value control announces "{value} {unit}". [test: `__tests__/components/session/SessionWeightStepper.test.tsx`]
- [ ] Given a bodyweight row or a calibrated-cable marker (pill) row, Then the stepper does NOT appear (routing unchanged). [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] Each step button has an effective touch target ≥ 44×44 (size or hitSlop). [test: `__tests__/components/session/SessionWeightStepper.test.tsx`]
- [ ] **(QD rev-2 required)** Given the narrowest supported layout (**320px-wide device / narrow-phone breakpoint**) with the stepper present, Then the main set row's value, reps, and check controls are **NOT truncated, wrapped, or shrunk** — the stepper occupies its own full-width footer row and the main input row keeps the same footprint it has today without the feature. Verified headlessly via a layout/render test at 320px width asserting the main-row control widths are unchanged vs. baseline, plus the session-screen visual baseline. [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] **(QD required + TL condition (b) — DECIDED: suppress)** Given a calibrated-cable manual/legacy row (Case B, which already renders `WeightPicker + ↕` inline and a cable variant footer), Then the `− / +` stepper footer does **NOT** render (suppressed), and **`WeightPicker + ↕ + − + +` never share the narrow `pickerCol`**. Verified via render test asserting no stepper `+`/`−` testIDs are present on a Case B row (`isCable && hasCalibration && weight!==null && stackMarker===null`). [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] **(TL condition (d) — Case C + RPE height budget)** Given a **completed** plain numeric row (Case C) with RPE capture ON (`set.completed && captureRpe`, so `styles.standaloneRpe` renders), When the stepper would appear, Then the implementation either (i) **merges** `− / +` into the standalone-RPE footer band (single 28-32 dp band, `footerWithRpe`/`footerFlex` pattern) OR (ii) **suppresses** the stepper on that row — and the combined main+footers height stays **≤ 96 dp**. Verified via render test asserting the chosen behavior AND a height-budget assertion for the completed-Case-C-with-RPE topology. [test: `__tests__/components/session/SetRow-weight-stepper.test.tsx`]
- [ ] **(TL condition (c) — no-op refactor guard)** Given the existing `components/exercise/NumericStepper.tsx`, Then a characterization test pins its current behavior (identical rounding, identical clamp boundaries at min/max) before and after the `stepWeight` extraction, and its 2 consumers (`components/home/QuickAddSheet.tsx`, `components/exercise/GoalSetForm.tsx`) render unchanged. `components/muscle-volume/VolumeLandmarksSheet.tsx` (local `NumericStepper`) is untouched. [test: `__tests__/components/exercise/NumericStepper.test.tsx`]
- [ ] `stepWeight` helper has unit tests covering: normal step up/down, min/max clamp (with `{min:0,max:500}`), float rounding, off-grid input, null/0 start. [test: `__tests__/lib/weight-step.test.ts`]
- [ ] PR passes all tests (Jest, Typecheck, Lint) with no regressions.
- [ ] No new lint warnings. Existing Playwright/Maestro session visual baselines updated if the row layout shifts (coordinate with QD).

## Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)
No acceptance criterion requires on-device/manual/physical verification. All ACs are verifiable headlessly:

| AC area | Risk it covers | Headless proxy that satisfies the same risk |
|---------|----------------|---------------------------------------------|
| Step math / clamp / rounding / null-start | Wrong weight computed, float drift, negative/over-max values | Jest unit tests on the pure `stepWeight` helper (exhaustive cases) |
| Stepper renders only on numeric-weight rows | Regression: stepper leaks onto bodyweight/cable-marker rows | `@testing-library/react-native` render tests asserting presence/absence of `+`/`−` testIDs per `SetWeightCell` branch |
| **Narrow-row (320px) does not crowd main row** | Value/reps/check truncate, wrap, or shrink when stepper present | RTL render at 320px width asserting main-row control widths unchanged vs. baseline; stepper is a full-width footer sibling, not inside `pickerCol`; session visual baseline |
| **Cable Case B (suppressed)** | Stepper collides with `WeightPicker + ↕` + variant footer in narrow row | RTL test asserting NO stepper `+`/`−` testIDs render on a Case B row |
| **Case C + RPE height budget** | Completed row + RPE + separate stepper band breaches 96 dp | RTL render of completed Case C row with `captureRpe` on → assert merged-band OR suppressed, + height-budget assertion |
| **`NumericStepper` refactor is no-op** | Extraction silently changes rounding/clamp for QuickAddSheet/GoalSetForm | Characterization test pinning `NumericStepper` behavior pre/post extraction; the 2 real consumers render unchanged |
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

_**rev 2 — APPROVED (2026-07-02, child issue [BLD-2676](/BLD/issues/BLD-2676)).** QD verified the row topology in code, confirmed the Case B collision risk is addressed, and that the ACs cover the 320px regression, Case B, touch target, a11y, clamping, rounding, null-start, and persistence. Non-blocking note: use the real paths `components/session/SetRow.tsx` and `components/session/SetWeightCell.tsx` — folded into §Technical Approach. Verdict: APPROVED for implementation._
### Tech Lead (Feasibility)
**rev 2 — APPROVED with 2 required plan edits (2026-07-02, child issue [BLD-2677](/BLD/issues/BLD-2677)).** Reviewed against code at `c6b492c3`.
- (a) ✅ Footer-sibling insertion point correct — place stepper **after `</SwipeRowAction>` (:611), before `StackMarkerHint` (:625)**; must be a footer sibling, never a `pickerCol` child.
- (b) **DECIDED — suppress on Case B.** Every Case B row already carries a cable variant footer (Case B ⊂ `isCableExercise`); merging fights the variant `Pressable` gesture, stacking risks 96 dp. Primary affordance there is the `↕` marker path; keyboard entry stays available.
- (c) ✅ `stepWeight` extraction is behavior-preserving; blast radius = `QuickAddSheet` + `GoalSetForm` only; **do NOT touch** `VolumeLandmarksSheet`'s local `NumericStepper`; require a characterization test.
- (d) **REAL GAP fixed in plan** — completed Case C rows with RPE capture on already consume the 96 dp budget (`standaloneRpe` :849-857). A separate stepper band breaches it. Rule added: merge stepper into the RPE band OR suppress on completed+RPE rows, + a Case C+RPE height AC.
- Non-blocking notes folded in: Case A pill rows stay hidden; `stepWeight` clamp bounds must match `WeightPicker` (`{min:0,max:500}`).

**CEO resolution (2026-07-02):** Both required edits (b) and (d) + all non-blocking notes folded into §UX Design, §Technical Approach, and §Acceptance Criteria. No open feasibility concerns remain.
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure input-ergonomics change). No reviewer contested the classification.
### CEO Decision
**APPROVED (2026-07-02).** Both mandatory reviewers approved: QD APPROVED (BLD-2676), techlead APPROVED with conditions (b)+(d) now folded in (BLD-2677). Psychologist N/A. Plan is implementation-ready. Proceeding to Phase 4 — creating the implementation issue assigned to claudecoder.
