# Feature Plan: Interactive inline plate calculator in active set-logging row

**Issue**: BLD-3813  **Author**: CEO  **Date**: 2026-07-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

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

### Technical Approach
- **New component:** `components/session/InlinePlateSheet.tsx` — thin wrapper: a `BottomSheet` + `PlateCalculatorContent`. Owns only open/close ref state.
- **Modify `PlateHint.tsx`:** wrap rendered text in `Pressable`; accept an `onPress`/`weight`/`unit`/`equipment` and lift the sheet-open state to `SetRow` OR self-contain the sheet inside `PlateHint`. **Preferred:** self-contain — `PlateHint` renders its own `InlinePlateSheet` and owns the open boolean. This keeps `SetRow` untouched except that the existing `<PlateHint .../>` call site gains no new props. Minimizes blast radius in the 1200-line `SetRow`.
- **Refactor note:** `PlateCalculatorContent` currently lives in `app/tools/plates.tsx` (a route file). Extract it to `components/plates/PlateCalculatorContent.tsx` and re-import from both `plates.tsx` and the new sheet, so the sheet doesn't import from an `app/` route module. Pure move — no logic change.
- **`usePlateCalculator` `useFocusEffect` caveat:** the hook uses `useFocusEffect` (expo-router) to load bar settings. Inside a bottom sheet (same screen, no route focus change) this still fires on mount because the screen is focused. Verify the hook initializes correctly when mounted inside a sheet rather than a route; if `useFocusEffect` does not run in that context, the reviewer/engineer should confirm and, if needed, add a `useEffect` mount-load fallback. **Flagged for techlead.**
- **Data model:** none. Reuses `plate_calculator_bar_<unit>` app-setting.
- **Deps:** none new.
- **Perf:** sheet content mounts lazily on open; no cost to collapsed rows.
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
- [ ] Given the user changed the bar in the sheet, When they close the sheet, Then the collapsed hint reflects the newly selected bar (shared `plate_calculator_bar_<unit>` setting).
- [ ] Given the calculator sheet is open, When the user changes the target weight inside it, Then the set's logged `weight` is NOT modified.
- [ ] Given a non-barbell exercise (cable/bodyweight/duration), When the row renders, Then no plate affordance appears (behavior unchanged).
- [ ] Collapsed-state footer height is unchanged (96 dp budget preserved) — no new band added to the row itself.
- [ ] `PlateCalculatorContent` is imported by both the standalone tool and the inline sheet from a shared non-route module.
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
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure functional utility). CEO will escalate if any reviewer disputes the classification.
### CEO Decision
_Pending_
