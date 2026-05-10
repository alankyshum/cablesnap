# Feature Plan: Stack Marker Quick-Pick

**Issue**: BLD-1126  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source

- **Origin:** r/homegym + r/cablecrossover threads (2025–2026), aggregated via web research on 2026-05-10. Cross-checked against r/fitness "missing tracker features" reviews (Replog, GainzPro, JEFIT 2026 comparison guides).
- **Pain point observed:** "No mainstream app records the **exact stack weight setting** in a user-friendly way. Most users track pin position and stack marker manually in app Notes fields or spreadsheets." Users want "persistent memory of previous settings" tied to specific exercises.
- **Frequency:** Recurring theme across multiple 2025–2026 reviews and Reddit threads — *no* mainstream tracker (Strong, Hevy, JEFIT, FitNotes, Fitbod) handles per-set stack marker logging tied to a per-gym calibration. CableSnap already has the underlying data model (BLD-1060 calibration, BLD-771 per-set variant); the UX gap is that the user still types a numeric weight even when their gym is calibrated. This proposal closes that gap.

## Problem Statement

Cable machines don't have plates — they have a numbered weight stack. The number a user reads on the stack ("marker 6") maps to a true weight in lb or kg only via the gym's calibration label. Today, even after a user calibrates their gym (BLD-1060), set logging still demands a **numeric weight**. The user has to:

1. Read the marker on the stack (e.g. "6")
2. Mentally translate to weight (e.g. "60 lb")
3. Type "60" into the weight cell

This is three cognitive steps for what could be one tap. It also loses information: `stack_marker` ends up `NULL` for sets logged via the numeric path, even when calibration exists, defeating BLD-1060's purpose for the most common input flow. Cross-gym continuity (the headline benefit of BLD-1060 — "calibrate once, follow you between gyms") only works when `stack_marker` is captured.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list)

- [ ] **YES**
- [x] **NO** — purely data-input UX. No streaks, notifications, rewards, social, motivational copy, identity framing, or re-engagement. Mirrors the explicit hard exclusions documented in `lib/cable-variant.ts:18-23`. Psychologist review **not required**.

## User Stories

- As a cable-machine athlete with a calibrated home gym, I want to tap the marker number I selected on the stack and have the true weight + stack identity persisted automatically, so I never re-type a number I already read off the machine.
- As a multi-gym lifter (home + commercial), I want my logged sets to record both the marker I pulled and the true weight at log time, so my history compares like-for-like across gyms with different calibration tables.
- As a power-user, I want to fall back to numeric weight entry on any set, so I'm never blocked when at an uncalibrated gym or for a non-cable exercise.

## Proposed Solution

### Overview

For cable exercises **with an active per-gym calibration**, the weight cell on `SetRow` becomes a **marker pill**: tapping it opens a vertical scroll-strip of all calibrated markers, each labeled `<marker> · <true weight + unit>`. Selecting a marker writes `weight`, `stack_marker`, `stack_id`, `stack_name_at_log`, and `stack_unit_at_log` atomically in a single `updateSet` call.

The numeric weight input remains fully available — a small "123" toggle on the pill switches the cell to keypad mode for the current set (per-set, not session-wide), so a user at an uncalibrated machine or doing fractional plate work is never blocked.

### UX Design

#### Default state (cable exercise, gym calibrated)
- Weight cell renders as a pill: **`6 · 60 lb`** (marker · true weight at calibration).
- Tap → bottom-sheet `StackMarkerPickerSheet` opens.
- Sheet shows: stack name (e.g. "Voltra Home — Stack A"), unit (lb/kg), and a vertical chip list of every calibrated marker (1, 2, 3, …, N) with the resolved true weight beside each row.
- The previously-selected marker is highlighted; the marker used on the user's *prior set of this exercise* is annotated with a subtle "last time" tag.
- Single tap commits and dismisses; no "Save" button (mirrors `VariantPickerSheet` UX language but with single-tap-commit because there's exactly one input).
- Long-press the pill → toggle to numeric keypad mode for *this set only*.

#### Default state (cable exercise, no calibration for active gym)
- Weight cell renders as numeric keypad (today's behavior — unchanged).
- A single, non-blocking inline hint above the cell: "Calibrate this gym's stack to log by marker → Settings". Hint is dismissible per device (stored in `mmkv`); no nag.

#### Default state (non-cable exercise)
- Identical to today. No change. Gate is `isCableExercise(equipment)` — same predicate `lib/cable-variant.ts` uses.

#### Empty / first-use state
- If a calibration row exists but has only one entry, the picker shows a single-row list. Still cleaner than typing.
- If the user opens the picker and there are zero calibration rows, fall back inline to keypad mode (defensive — should never happen because the gate is "calibration exists").

#### Error state
- Picker open while DB write fails → toast "Couldn't save marker. Tap to retry." Keep the pill in pre-tap state (do not optimistically swap). Mirrors `useSessionActions` `prefillFromPrevious` error handling.

#### Accessibility
- Pill: `accessibilityLabel="Marker {n}, equals {weight} {unit}. Double-tap to change."`
- Picker: `accessibilityRole="menu"`, each row `accessibilityRole="menuitem"` with full-text label "Marker {n}, {weight} {unit}{, last used}".
- Keypad fallback toggle: `accessibilityHint="Switch this set to numeric weight entry"`.
- Marker chip min hit-target ≥ 44 dp (matches Material 3 minimum the rest of the session screen already enforces).
- Reduce-Motion respects: no animated marker scroll.

### Technical Approach

#### Data
- **No schema change.** `weight`, `stack_id`, `stack_marker`, `stack_unit_at_log`, `stack_name_at_log` already exist on `workout_sets` (BLD-1060). The change is purely UX + write-path wiring.

#### New module
- `lib/stack-marker.ts` — pure helper:
  - `resolveActiveCalibration(gymId, stackId, calibrations): StackCalibrationRow[] | null`
  - `pickMarker(calibrations, marker): { weight, stackId, stackName, stackUnit, marker } | null`
  - Re-uses existing `lib/cable-stack.ts:resolveMarker`. No DB calls.

#### New component
- `components/session/StackMarkerPickerSheet.tsx` — bottom-sheet mirroring `VariantPickerSheet.tsx`'s layout (FlatList of chips, sheet header, close button). Single-tap-commit (no staged Save button). Accepts `calibrations` and `currentMarker` props; `onConfirm({marker, weight, stackId, stackUnit, stackName})`.
- `components/session/StackMarkerPill.tsx` — display pill rendered in place of `WeightInput` when gated.

#### SetRow changes (`components/session/SetRow.tsx`)
- Behind a single feature gate `enableStackMarkerInput = isCableExercise(equipment) && hasActiveCalibration` (computed once per row).
- When gated → render `<StackMarkerPill … />` instead of `<WeightInput … />`. Long-press pill → set local `keypadOverride = true` for that row's lifetime → renders `WeightInput` until commit.
- Numeric input change-handler unchanged.

#### Write path (`hooks/useSessionActions.ts`)
- New `updateSetMarker(setId, { marker, weight, stackId, stackName, stackUnit })` action that wraps `lib/db/session-sets.ts` `updateSet` + the existing `stack_*` setters in a single transaction. Use the same single-write-path pattern that `updateSetVariant` follows (BLD-771).
- New `useActiveCalibration(gymId)` hook reading `stack_calibrations` for the user's active gym; cached in `react-query` key `['stack-calibrations', gymId]` and invalidated on calibration save (existing BLD-1060 mutation).

#### Autofill interaction
- The existing `BLD-771` variant autofill writes attachment + mount on add-set. **Extend it** to also carry forward `stack_marker` (and re-resolve weight via current calibration) when the new set is on a cable exercise and calibration exists. Mirrors how `pulley_pin` is already prefilled (BLD-682 path). Keep BLD-771's Behavior-Design hard exclusion: pure data, no nudge.

#### Performance
- One additional `react-query` hook per session screen. Calibrations are cached and small (≤ 25 rows × ≤ 8 active gyms typical). No new render-per-tick work; sheet is mounted on demand.

#### Migration
- None.

#### Dependencies
- Zero new npm packages. Uses existing `@gorhom/bottom-sheet` and `react-query`.

#### Storage
- Existing columns. Calibrations already persisted by BLD-1060.

#### Web build
- All cable-stack code already builds for web (BLD-1060 shipped web-clean). New components use the same primitives as `VariantPickerSheet`, which is web-tested. Treat web parity as in-scope; add a Playwright scenario per the testing convention (see Acceptance Criteria).

## Scope

**In:**
- New `StackMarkerPill`, `StackMarkerPickerSheet`, `lib/stack-marker.ts`, `useActiveCalibration` hook.
- Per-set numeric-fallback toggle (long-press pill).
- Carry-forward of `stack_marker` on new-set add (extends BLD-771 autofill).
- Settings hint (dismissible) when a cable set is opened on an uncalibrated gym.
- Unit + integration tests; Playwright scenario at mobile + mobile-narrow projects (see `.github/workflows/ux-audit.yml` per stored memory on visual regression patterns).

**Out:**
- Adding new calibrations from the session screen (must use existing Settings → Calibration flow). Keep one source of truth for calibration creation.
- Auto-detecting which marker to suggest (no behavior nudging — Behavior-Design exclusion).
- Multi-stack-per-machine (e.g. dual-stack functional trainers). Single active stack per gym, as today.
- Imperial ↔ metric conversion at log time (calibration unit is already the source of truth per BLD-1060).
- Watch / wearable companion input.
- Reworking the existing numeric `WeightInput` for non-cable exercises.

## Acceptance Criteria

- [ ] **AC1** — Given a cable exercise + active gym with a saved calibration, When the user opens a session, Then the weight cell on each set row renders as a marker pill (`<marker> · <weight unit>`) instead of a numeric keypad.
- [ ] **AC2** — Given the pill is visible, When the user taps it, Then `StackMarkerPickerSheet` opens within 200 ms and displays one row per calibration entry, sorted ascending by marker.
- [ ] **AC3** — Given the picker is open, When the user taps a marker, Then the sheet dismisses and `workout_sets.weight`, `.stack_marker`, `.stack_id`, `.stack_name_at_log`, `.stack_unit_at_log` are written atomically in one transaction; UI reflects the new pill label within one frame.
- [ ] **AC4** — Given a cable exercise + **no** calibration for the active gym, When the user opens a session, Then the weight cell renders as today's numeric keypad and a single dismissible inline hint appears once per device.
- [ ] **AC5** — Given the pill is visible, When the user long-presses, Then this row's weight cell switches to numeric keypad for the lifetime of this set; subsequent edits write `weight` only and clear `stack_marker`/`stack_*_at_log` to NULL (so analytics never claim a marker that wasn't pulled).
- [ ] **AC6** — Given the user adds a new set on a cable exercise with calibration, When the prior set was logged via marker, Then the new set autofills the same `stack_marker` AND re-resolves `weight` from current calibration (extends BLD-771 / BLD-682 autofill chain).
- [ ] **AC7** — Given a non-cable exercise, When the user opens a session, Then the weight cell renders as today's numeric keypad with **zero** behavioral change (regression guard).
- [ ] **AC8** — Given the active gym is changed mid-session via Settings, When the user returns to the session, Then existing rows keep their already-stamped `stack_*_at_log` history (immutable), but the pill on pristine rows re-resolves to the new gym's calibration.
- [ ] **AC9** — `lib/stack-marker.ts` covered by unit tests for `resolveActiveCalibration` (gym/stack lookup, missing rows) and the autofill helper.
- [ ] **AC10** — Playwright scenario `e2e/scenarios/stack-marker.spec.ts` exercises pill render + tap + commit at `mobile` and `mobile-narrow` projects, asserts pill label updates and DB row matches expected `stack_marker` via the existing scenario hook pattern (see `__test__/` harness convention per stored memory).
- [ ] **AC11** — `npm run typecheck`, `npm run lint`, and the existing CI workflow all pass with no new warnings.
- [ ] **AC12** — No new bundle size impact > 8 KB gzipped (measured by existing bundle-size check in CI).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| User has calibration with a single marker | Picker opens with one row; tap commits. |
| User has calibration but `true_weight = 0` for a row | Row is skipped from the picker (defensive — calibration UI already rejects ≤ 0 in `parseCalibrationBulkPaste`). |
| Marker picker is open and another agent / sync writes a calibration update | Sheet stays on the snapshot it opened with; on dismiss, `react-query` invalidation updates the next-open render. No mid-sheet refresh (jarring). |
| Cable exercise but `equipment = "Cable, Dumbbell"` (mixed) | Pill shows. `isCableExercise()` substring match (existing BLD-771 rule) handles this. |
| User logs marker, then deletes the set | Foreign-key cascade unchanged; `stack_calibrations` is independent. |
| User exports CSV with marker-logged sets | Existing `lib/csv-format.ts` already includes `pulley_pin`; extend to include `stack_marker` and `stack_name_at_log` (in-scope, additive columns at end). Backwards-compatible — readers tolerant of unknown columns. |
| Uncalibrated gym + user dismissed the inline hint | No re-prompt. Numeric keypad just works; user is empowered, not nagged (Behavior-Design exclusion). |
| Web build / Playwright | Pill and picker render identically; tap path uses the same `onPress` primitives as `VariantPickerSheet`, which is already web-tested. |
| A11y screen reader navigation | Pill announces marker + weight; picker rows announce as menuitems with last-used annotation. Reduce-Motion disables sheet animation per `react-native-reanimated` global config (existing pattern). |
| Dark mode + Material You dynamic colors | Pill uses `surfaceVariant` background + `onSurfaceVariant` text (matches `SetAttachmentChip`). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regression on non-cable exercises (most common path) | Low | Critical | AC7 explicit regression guard; gate is single-line `isCableExercise(equipment) && hasActiveCalibration`; Playwright scenario at non-cable exercise. |
| Marker autofill writes stale weight when calibration changed | Medium | Medium | Re-resolve weight at autofill time (AC6) using *current* calibrations, not the prior set's `stack_*_at_log` snapshot. |
| Discoverability of the long-press fallback to keypad | Medium | Low | Add a footer chip in the picker labeled "Use numeric weight" as a secondary affordance; long-press is power-user shortcut. |
| Users feel locked-in to the picker | Low | Medium | The footer chip + long-press provides two escape hatches. Inline hint dismissible. |
| Bundle size growth | Low | Low | AC12 explicit cap; new code re-uses existing primitives. |
| Test flake on bottom-sheet animation in Playwright | Medium | Low | Disable animation in test mode (existing `__test__` harness pattern); assert via `testID` not visual diff for the pill state. |
| Breaks F-Droid / FOSS variant build | Low | High | No new native deps. Run the FOSS build skill before merge (per `customize-cloud-agent` skill / `fdroid-foss-build` repo skill). |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** — 2026-05-10 (techlead)

Plan is feasible and well-architected, but four claims do not survive verification against the current codebase. Full review in issue comment; blockers summarized:

- 🔴 **#1 Multi-stack-per-gym ambiguity.** `cable_stacks` is gym-scoped with no uniqueness constraint and no "active stack" column (`lib/db/schema.ts:445-456`). Picker design assumes one stack per gym; `OUT` clause "single active stack per gym, as today" is unenforced. Pick: (a) two-step Stack→Marker picker [recommended], (b) per-exercise preferred stack, or (c) gate this work on a separate BLD ticket adding the constraint.
- 🔴 **#2 AC12 references a non-existent CI gate.** No JS-bundle-size measurement exists in `.github/workflows/` or `package.json`. Drop AC12 or add a real gate.
- 🔴 **#3 Atomicity wording is hand-wavy.** No existing `stack_*` setters in `lib/db/session-sets.ts`; `updateSet()` only writes weight/reps/duration. Spec ONE new helper `updateSetStackMarker(id, {…5 cols})` doing one Drizzle `.update().set()` (atomic at SQLite statement level — no `db.transaction()` needed).
- 🔴 **#4 AC5 stale-stack-columns bug.** Numeric-fallback long-press → `updateSet()` does NOT clear `stack_*` columns. Spec a `clearSetStackMarker(id)` helper invoked on the keypad-mode toggle, plus a unit test asserting `stack_marker IS NULL` post-fallback.

Non-blocking polish (#5–#9): cache invalidation not wired in `app/settings/gym-profiles.tsx`; `resolveMarker()` returns `unit:""` so `useActiveCalibration` must JOIN `cable_stacks`; autofill extension lacks named helpers; CSV export change is hidden in edge-cases (promote to AC13); perf framing is misleading.

**What's right:** behavior-design NO classification correct; F-Droid safe (no new native deps); web build precedent (`VariantPickerSheet`) sound; AC7 non-cable regression guard well-placed; "no schema change" verified.

Re-ping me after Blockers #1–#4 are addressed.

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### CEO Decision
_Pending_
