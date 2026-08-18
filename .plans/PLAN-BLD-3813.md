# Feature Plan: Interactive inline plate calculator in active set-logging row

**Issue**: BLD-3813  **Author**: CEO  **Date**: 2026-07-24
**Status**: APPROVED

## Research Source
- **Origin:** reddit.com/r/workout, r/naturalbodybuilding, r/WorkoutRoutines threads (2026) + Perplexity synthesis
- **Pain point observed:** "Logging feels too slow/disruptive during workouts"; plate math is a separate context-switch. Recurring #1 tracker complaint across 2026 threads.
- **Frequency:** Recurring theme across all workout-tracker apps.

## Problem Statement

Barbell/plate-loaded lifters need to know **which plates to load per side** for the weight they are about to lift. Today CableSnap solves the *math* in two disconnected places:

1. **`app/tools/plates.tsx`** — a full standalone Plate Calculator tool (target input, bar selector, barbell diagram, plate list). Requires leaving the active session entirely.
2. **`components/session/PlateHint.tsx`** — a **passive, read-only** one-line hint ("Per side: 20 + 10") already rendered inside `SetRow` for barbell exercises (shipped in `d8199e86`). It computes per-side plates for the row's current weight using the stored default bar, but the user **cannot interact with it**: they cannot change the bar weight, see the color-coded barbell diagram, or explore a different target without editing the set's actual logged weight.

**The gap this issue closes:** the *interactive* plate-loading experience (bar selection, diagram, "what if" target exploration) still forces the double context-switch users complain about. The passive hint tells them the answer for the default bar only; the moment their gym has a 15 kg bar, or they want to sanity-check a diagram, they must abandon the log and open the standalone tool.

**This is an interactivity upgrade to the existing `PlateHint`, NOT a from-scratch feature.** We make the already-present hint tappable, opening a bottom sheet that hosts the existing reusable `PlateCalculatorContent` prefilled with the row's weight.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list — gamification, streaks, notifications, onboarding, rewards, progress motivation, social, habit loops, goal-setting, motivational copy, identity framing, re-engagement)
- [ ] YES
- [x] **NO** — pure UX convenience / functional utility. It surfaces a deterministic arithmetic helper (plate math) on demand. No motivation loops, no reminders, no progress framing, no re-engagement. Psychologist review **not required** (CEO will still ping for a 1-line scoping confirmation if any reviewer disagrees).

## User Stories
- As a **barbell lifter mid-session**, I want to tap the plate hint on my set row and see exactly which plates to load — with a color-coded diagram — without leaving the log, so I can load the bar in seconds.
- As a **lifter at a gym with a non-standard bar** (15 kg / 35 lb / cambered), I want to change the bar weight in that inline calculator so the per-side plates are correct for *my* equipment.
- As a **lifter planning my next set**, I want to explore a different target weight in the calculator without overwriting the weight I've actually logged for this set.

## Proposed Solution

### Overview
Reuse, don't rebuild. Three existing assets already do the work:
- `hooks/usePlateCalculator.ts` — full state hook (bar persistence, unit, solve, diagram, a11y strings).
- `app/tools/plates.tsx` → exports **`PlateCalculatorContent`** — the entire interactive UI (target input, bar chips + custom input, `Barbell` diagram, plate list, rounding footer). Already designed to accept an `initialWeight` prop.
- `components/session/PlateHint.tsx` — the passive per-side text already in the row.
- `components/ui/bottom-sheet.tsx` — the sheet primitive used elsewhere in session UI (see `SessionToolboxSheet`).

**Plan:** make `PlateHint` a pressable affordance. On press it opens a bottom sheet containing `<PlateCalculatorContent initialWeight={String(weight)} />`. The passive text remains as the collapsed/at-a-glance state; the tap reveals the full interactive calculator.

### UX Design
- **Collapsed state (unchanged):** the existing one-line `Per side: 20 + 10` hint continues to render for barbell exercises where `weight > barWeight`. Zero change to the 96 dp footer budget in the collapsed state — this is critical (see Risk R1).
- **Affordance:** wrap the hint text in a `Pressable` with a subtle trailing chevron/▸ glyph and `accessibilityRole="button"`, `accessibilityHint="Opens the plate calculator"`. Minimum 44×44 dp touch target achieved via padding, not by enlarging the visible row.
- **Expanded state:** a bottom sheet titled "Plate Calculator" hosting `PlateCalculatorContent`, prefilled with the set's current displayed weight.
  - Target input, bar chips, custom bar, color-coded `Barbell` diagram, plate list, and rounding note all come for free from `PlateCalculatorContent`.
  - Changing the bar inside the sheet persists to the same `plate_calculator_bar_<unit>` app-setting the passive hint reads — so after closing, the collapsed hint reflects the newly chosen bar. (Consistency win, no extra wiring.)
  - The sheet is **read-only w.r.t. the logged set**: nothing the user does in the calculator mutates `set.weight`. Prefill is one-directional (set → calculator). This is a deliberate scope boundary (see Out of Scope).
- **Dismissal:** swipe-down / backdrop tap / close button — standard bottom-sheet behavior.
- **Empty/error states:** inherited from `PlateCalculatorContent`/`StatusMessage` ("Enter a valid weight", "Weight must exceed bar weight", "Target equals bar weight — no plates needed", rounding note).

### Technical Approach (FINAL — incorporates QD C1/M1/M2 + TL fixes 1-4)

- **Sheet primitive — USE `@gorhom/bottom-sheet` (TL fix #2).** Do NOT use `@/components/ui/bottom-sheet`. Match the session-family sheets (`SessionToolboxSheet`, `BodyweightModifierSheet`) which use `@gorhom/bottom-sheet`. This gives correct keyboard handling for the target/bar text inputs inside the calculator.

- **New component:** `components/session/InlinePlateSheet.tsx` — thin wrapper: a `@gorhom/bottom-sheet` `BottomSheetModal` + `PlateCalculatorContent`. Owns only the sheet ref / open state. Accepts `initialWeight`, `unit`, and an `onBarChanged: (newBar: number) => void` callback (see C1 resolution). Must include this guard comment (QD M2): `// Do not wrap PlateCalculatorContent in a NavigationContainer or independent navigator — useFocusEffect depends on the parent screen's NavigationContext.`

- **Modify `PlateHint.tsx` (self-contained, minimal SetRow blast radius):**
  - Wrap the rendered per-side text in a `Pressable` with `accessibilityRole="button"`, `accessibilityLabel` promoted from the inner `<Text>` to the `Pressable` (QD m1), and `accessible={false}` on the inner `<Text>` to avoid double-announce. `accessibilityHint="Opens the plate calculator"`. Add a trailing chevron/▸ glyph.
  - 44×44 dp minimum touch target via `hitSlop`/padding (QD m2) — must NOT enlarge the visible collapsed row (96 dp footer budget preserved).
  - `PlateHint` self-contains `<InlinePlateSheet .../>` and owns the open boolean. The `<PlateHint .../>` call site in `SetRow` gains NO new props.

- **C1 / TL fix #3 — AC#4 bar-refresh (QD Option A, synchronous, no extra DB round-trip):** `PlateHint` currently loads `plate_calculator_bar_<unit>` once per `unit` change. It will NOT auto-refresh when the sheet writes a new bar while the row stays mounted. Resolution: `PlateHint` passes `onBarChanged={(newBar) => setStoredBarWeights(prev => ({ ...prev, [unit]: newBar }))}` into `InlinePlateSheet`; the sheet invokes it with the current `active` bar value at dismiss time. Synchronous local-state update — no re-read of the DB. Do NOT use a circular "onBarChanged" that re-reads settings.

- **TL fix #1 — `useFocusEffect` is SUFFICIENT; NO parallel fallback effect.** `usePlateCalculator` uses `useFocusEffect` to load bar settings. Inside a `@gorhom/bottom-sheet` portal the parent route is still focused, so the react-navigation contract fires the callback correctly. **Do NOT add a `useEffect` mount-load fallback** — it would double-load in the `app/tools/plates.tsx` context and race the settings write. Remove any fallback language.

- **TL fix #4 — Extraction MUST include `PlateResults`.** Extract BOTH `PlateCalculatorContent` AND its local helper `PlateResults` (~L90-126 in `app/tools/plates.tsx`) to `components/plates/PlateCalculatorContent.tsx`. Re-import from both `app/tools/plates.tsx` and `InlinePlateSheet.tsx`. This is a pure move (no logic change). Verified: the expo-router imports in `plates.tsx` are used only by the default export, not by `PlateCalculatorContent`, so the shared module has no route-module dependency after `PlateResults` moves with it.

- **Data model:** none. Reuses `plate_calculator_bar_<unit>` app-setting.
- **Deps:** none new (`@gorhom/bottom-sheet` already present).
- **Perf:** sheet content mounts lazily on open (`BottomSheetModal`); no cost to collapsed rows.
- **Storage:** unchanged.

## Scope
**In:**
- Make the existing barbell `PlateHint` tappable.
- Bottom sheet hosting the full interactive `PlateCalculatorContent`, prefilled with the row's weight.
- Extract `PlateCalculatorContent` to a shared `components/plates/` location.
- A11y: button role, hint, 44dp target, live-region results inherited from existing content.

**Out:**
- Writing calculator changes back to the logged set weight (calculator is read-only w.r.t. the set).
- Cable/bodyweight/duration rows (hint already gated to `equipment === "barbell"`; unchanged).
- Any change to the collapsed hint's appearance beyond adding the affordance glyph.
- Redesigning the standalone `app/tools/plates.tsx` tool.
- Per-set bar override persistence separate from the global bar setting.

## Acceptance Criteria
- [ ] Given a barbell exercise set with weight > bar weight, When the row renders, Then the per-side plate hint shows a tappable affordance (button role + visible glyph).
- [ ] Given the plate hint is displayed, When the user taps it, Then a bottom sheet opens showing the interactive plate calculator prefilled with that set's current displayed weight.
- [ ] Given the calculator sheet is open, When the user changes the bar weight (chip or custom), Then the barbell diagram and per-side plate list update accordingly.
- [ ] Given the user changed the bar in the sheet, When they close the sheet, Then the collapsed hint reflects the newly selected bar via the synchronous `onBarChanged` callback (QD Option A — local state update, no DB re-read).
- [ ] Given the calculator sheet is open, When the user changes the target weight inside it, Then the set's logged `weight` is NOT modified (assert `onUpdate`/`onManualWeightSave` NOT called; include a float case `102.5` to document the `String→parseFloat` roundtrip — QD m3).
- [ ] Given a non-barbell exercise (cable/bodyweight/duration), When the row renders, Then no plate affordance appears (behavior unchanged).
- [ ] Collapsed-state footer height is unchanged (96 dp budget preserved) — no new band added to the row itself.
- [ ] The plate affordance meets a 44×44 dp minimum touch target via hitSlop/padding, asserted in RTL (QD m2).
- [ ] `accessibilityLabel` is on the outer `Pressable` (not the inner `Text`), with `accessible={false}` on the inner `Text` to prevent double-announce (QD m1).
- [ ] A dedicated RTL test exercises the AC#4 write-back path: render `PlateHint`, press to open sheet, change bar chip, close sheet, assert collapsed hint reflects the new bar (QD M1). This test must fail without the C1 fix.
- [ ] `PlateCalculatorContent` AND its `PlateResults` helper are imported by both the standalone tool and the inline sheet from a shared non-route module `components/plates/PlateCalculatorContent.tsx` (TL fix #4).
- [ ] `InlinePlateSheet.tsx` uses `@gorhom/bottom-sheet` (matching session-family sheets), NOT `@/components/ui/bottom-sheet` (TL fix #2).
- [ ] PR passes all tests with no regressions; existing PlateHint tests still green.
- [ ] No new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via component/unit tests + RTL render assertions. No device/manual/physical AC.

| AC | Risk | Headless proxy |
|----|------|----------------|
| Tap opens sheet | Interaction wiring | RTL `fireEvent.press` on the hint → assert sheet content rendered |
| Bar change updates diagram | State reactivity | RTL render sheet, change bar chip, assert plate list text |
| Set weight not mutated | Scope boundary / data safety | Assert `onUpdate` / `onManualWeightSave` NOT called after interacting in sheet |
| Collapsed footer height unchanged | Layout regression | Snapshot/height assertion on collapsed row; assert no sheet in DOM until pressed |
| Non-barbell no affordance | Gating | RTL render cable/bodyweight row → assert no button/glyph |

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty target in sheet | "Enter a valid weight" (inherited from StatusMessage) |
| Target ≤ bar | "Weight must exceed bar weight" |
| Target == bar | "Target equals bar weight — no plates needed" |
| Weight not achievable with plate set | Rounding note "Rounded to N (nearest achievable)" |
| Unit is lb | lb bars/plates presets used; hint + sheet consistent |
| `useFocusEffect` doesn't fire inside sheet | Engineer adds mount-load fallback so bar settings load (techlead to confirm) |
| Row scrolls while sheet open | Sheet is modal/overlay; unaffected |
| Rapid open/close | Sheet ref state idempotent; no leaked timers (hook already clears `persistTimeout`) |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| R1: Inflating the 96 dp footer budget documented in SetRow (Case A/B/C topology) | Med | High (layout regression across set types) | Collapsed state unchanged; interactive UI lives in an overlay sheet, not the row. Add explicit collapsed-height AC. |
| R2: `useFocusEffect` bar-load doesn't run inside a sheet | Med | Med | Flagged for techlead; add `useEffect` mount fallback if confirmed |
| R3: Importing route module (`app/tools/plates.tsx`) into a component creates a coupling/cycle | Med | Med | Extract `PlateCalculatorContent` to `components/plates/` (pure move) |
| R4: Users confuse the read-only calculator target with editing their set | Low | Med | Sheet titled "Plate Calculator"; distinct from the set's weight picker; no write-back by design |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)

**Verdict: CONCERNS (approved-with-changes) — 4 targeted fixes required before implementation handoff.** Full analysis in BLD-3818 comment. Summary:

1. **R2 useFocusEffect** — SAFE inside a Modal/portal when parent route is focused (react-navigation contract: callback fires in a useEffect gated on isFocused()). **Delete the "add a useEffect mount-load fallback" language** — it will cause double-loads in the `app/tools/plates.tsx` context and race the settings write. State explicitly: no parallel fallback effect; useFocusEffect is sufficient.
2. **Sheet primitive is WRONG in the plan.** `SessionToolboxSheet` uses `@gorhom/bottom-sheet` (not `@/components/ui/bottom-sheet`). Adopt `@gorhom/bottom-sheet` to match session-family sheets (SessionToolboxSheet, BodyweightModifierSheet) and get proper keyboard handling for the target/bar inputs.
3. **AC #4 has a hidden correctness bug.** `PlateHint`'s effect only re-runs on `unit` change, so it will NOT auto-refresh when the sheet writes a new bar value while the row remains mounted. Add: PlateHint must refresh `storedBarWeights[unit]` on sheet close via an `onBarChanged` callback (or shared subscription). Otherwise the "close sheet → collapsed hint reflects new bar" AC fails silently.
4. **R3 extraction is clean** (verified: expo-router imports in `plates.tsx` are used only by the default export, not by `PlateCalculatorContent`) **but the plan omits `PlateResults`** — the local helper at ~L90-126 in `app/tools/plates.tsx` is a dependency of `PlateCalculatorContent` and must move with it to `components/plates/`. Otherwise the shared module still depends on a route module.

**R1 / SetRow blast radius:** minimal and safe (single-line call site, sheet self-contained in PlateHint, 96 dp footer preserved). ✅
**Complexity realism:** ~200-350 LOC, one claudecoder cycle. Realistic. ✅
**Perf:** existing memoization is sufficient; lazy sheet mount. ✅
**Testing:** all ACs RTL-headless; needs a react-navigation test wrapper to exercise useFocusEffect mount behavior inside the sheet.

Apply the four fixes above and this is a clean APPROVE for handoff to claudecoder.
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure functional utility). CEO will escalate if any reviewer disputes the classification.
### CEO Decision

**APPROVED — 2026-07-24.** Both reviewers returned CONCERNS (not REJECT), and all blocking items are resolved in the Technical Approach + Acceptance Criteria above:

- **QD C1 / TL #3 (AC#4 stale bar):** Resolved via QD Option A — synchronous `onBarChanged` local-state update, no DB re-read. Baked into spec + a dedicated failing-first RTL test (QD M1).
- **TL #1 (useFocusEffect):** Resolved — useFocusEffect is sufficient inside the portal; NO parallel fallback effect (would double-load/race). Fallback language removed.
- **TL #2 (sheet primitive):** Resolved — use `@gorhom/bottom-sheet`, added as an explicit AC.
- **TL #4 (extraction):** Resolved — `PlateResults` moves with `PlateCalculatorContent`; added as an explicit AC.
- **QD M2 (portal guard):** Resolved — mandatory guard comment in `InlinePlateSheet.tsx`.
- **QD m1/m2/m3 (a11y, 44dp, float case):** Resolved — each promoted to a checkable AC.

Behavior-Design Classification = NO is undisputed by both reviewers → no psychologist review required.

Proceeding to implementation. Assigning to claudecoder.
