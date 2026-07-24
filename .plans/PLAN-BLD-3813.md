# Feature Plan: Inline plate calculator in active set-logging row

**Issue**: BLD-3813  **Author**: CEO  **Date**: 2026-07-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** reddit.com/r/workout, r/naturalbodybuilding, r/WorkoutRoutines threads (2026) synthesized via Perplexity search.
- **Pain point observed:** "Logging feels too slow or disruptive during workouts." Plate math is a separate context-switch; users leave the log to compute plates, then return.
- **Frequency:** Recurring theme — identified as the #1 complaint across all workout tracker apps in 2026 roundups.

## Problem Statement
CableSnap already has a solid barbell plate calculator (`app/tools/plates.tsx`, `hooks/usePlateCalculator.ts`) and prefill-from-previous-set logic (`hooks/resolvePrefillCandidate.ts`). But the plate calculator lives **only** in the standalone Tools screen. During an active session, a barbell/plate-loaded lifter who wants to know "what plates make up 102.5 kg per side?" must:
1. Leave the active session log,
2. Open Tools → Plates,
3. Type the target weight,
4. Read the result,
5. Navigate back to the session,
6. Resume logging.

This is exactly the mid-workout friction users complain about. The calculator hook is already built — the gap is purely that it is not surfaced where the weight is entered.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely functional convenience. No gamification, streaks, notifications, rewards, motivational copy, or re-engagement. It surfaces an existing deterministic calculation inline. No psychologist review required. (CEO to confirm with @psychologist if any reviewer disagrees.)

## User Stories
- As a barbell lifter mid-session, I want to see the plate breakdown for the weight I just entered without leaving the log, so I don't break my rest-period flow.
- As a plate-loaded machine user, I want the same inline plate math, so setup is faster.

## Proposed Solution

### Overview
Add a lightweight, opt-in inline plate hint to the set-logging weight cell in `components/session/SetRow.tsx`. When the exercise's equipment is barbell/plate-loaded and a valid weight is entered, show a compact tappable "plates" affordance (e.g. a small chip reading `20 · 20 · 10 /side` or an icon). Tapping expands a small inline popover/bottom-sheet reusing the existing `usePlateCalculator` hook and `BarbellDiagram` component — no navigation away from the session.

### UX Design
- **Trigger visibility:** Only render the affordance when the exercise equipment is a plate-loaded type (barbell / plate-loaded machine). Respect existing equipment metadata (`lib/types.ts`, equipment field). Non-plate exercises (cable stack, dumbbell, bodyweight) do NOT show it — avoids clutter.
- **Compact state:** Small chip beside the weight input showing grouped plates per side. Uses existing `grouped` output from `usePlateCalculator`.
- **Expanded state:** Tap → inline sheet with `BarbellDiagram` + remainder/rounding status messages (reuse `StatusMessage` logic from plates.tsx, extracted to a shared component).
- **Unit-aware:** Honor the user's kg/lb preference and bar-weight setting already used by the tool.
- **A11y:** Chip has an accessible label ("Plate breakdown: 20, 20, 10 per side"). Expanded sheet is focus-managed and dismissible.
- **Empty/error states:** If weight ≤ bar weight or not divisible, show the same "no plates needed" / "weight must exceed bar weight" copy already in plates.tsx. Chip hidden when weight is empty/invalid.

### Technical Approach
- **Reuse, don't reinvent:** `hooks/usePlateCalculator.ts` already returns `{ plates, remainder, grouped, achieved, rounded }`. No new calc logic.
- **Extract shared UI:** Pull `StatusMessage` and the plate-grouping render out of `app/tools/plates.tsx` into `components/plates/` so both the tool screen and the inline chip share one implementation (no divergence).
- **Bar weight source:** Read the default bar weight from existing settings/gym-profile config. If per-exercise bar weight isn't stored, default to the global bar-weight setting the tool uses.
- **State:** Local component state only — no persistence, no DB migration. Zero new dependencies.
- **Performance:** Calc is synchronous and cheap; memoize on `(weight, barWeight, unit)`.

## Scope
**In:**
- Inline plate chip in `SetRow.tsx` for plate-loaded equipment.
- Tap-to-expand inline sheet reusing `BarbellDiagram` + status messages.
- Extraction of shared plate-render/status component.
- Unit + bar-weight awareness consistent with the existing tool.

**Out:**
- Cable/pin-stack "closest achievable weight" solving (separate future idea).
- Photo/AI plate recognition (conflicts with offline-first/privacy).
- Per-exercise custom bar weights if not already modeled (use global default; note as follow-up).
- Any change to the standalone Tools → Plates screen behavior beyond the shared-component refactor.

## Acceptance Criteria
- [ ] Given a barbell exercise in an active session When the user enters a valid weight above bar weight Then a compact plate chip appears beside the weight cell showing grouped plates per side.
- [ ] Given the plate chip is shown When the user taps it Then an inline sheet expands with the BarbellDiagram and status message, without navigating away from the session.
- [ ] Given a cable/dumbbell/bodyweight exercise Then NO plate chip is shown.
- [ ] Given weight ≤ bar weight Then the chip is hidden and (on expand, if triggered) the "weight must exceed bar weight" message shows.
- [ ] Unit preference (kg/lb) and bar weight match the standalone tool's output for the same input.
- [ ] Shared plate-render/status component is used by BOTH tools/plates.tsx and the inline chip (no duplicated logic).
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings. No new runtime dependencies.

### Headless Verification Path
| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| Tap chip expands sheet in-session | Navigation-free interaction, no route push | Component/unit test asserting expand toggles local state and does NOT call router.push/navigate; render test asserts sheet mounts in-tree |
| Chip only shows for plate-loaded equipment | Correct conditional render | Parameterized render test across equipment types asserting chip presence/absence |
| Calc matches standalone tool | Parity / no logic divergence | Shared-component import assertion + snapshot/equality test feeding identical inputs to both call sites |

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty weight | Chip hidden |
| Weight not divisible into available plates | Show remainder/rounding status (reuse existing logic) |
| Weight ≤ bar weight | Chip hidden; expand shows guard message |
| lb unit | Plate groups and bar weight in lb, matching tool |
| Very large weight | Grouped list renders without overflow (truncate/scroll in sheet) |
| A11y | Chip labeled; sheet focus-managed and dismissible |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Refactor of plates.tsx introduces regression in Tools screen | Med | Med | Extract to shared component with tests; QD verifies tool screen unchanged |
| SetRow becomes visually cluttered | Med | Low | Chip only for plate-loaded equipment; compact default; opt-in expand |
| Bar weight not modeled per-exercise → wrong breakdown | Low | Med | Use documented global default; list per-exercise bar weight as explicit out-of-scope follow-up |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
_Pending_
