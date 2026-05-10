# Feature Plan: Stack Marker Quick-Pick

**Issue**: BLD-1126  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW (rev 3) → APPROVED / REJECTED

## Research Source

- **Origin:** r/homegym + r/cablecrossover threads (2025–2026), aggregated via web research on 2026-05-10. Cross-checked against r/fitness "missing tracker features" reviews (Replog, GainzPro, JEFIT 2026 comparison guides).
- **Pain point observed:** "No mainstream app records the **exact stack weight setting** in a user-friendly way. Most users track pin position and stack marker manually in app Notes fields or spreadsheets."
- **Frequency:** Recurring theme. CableSnap already has the underlying data model (BLD-1060 calibration, BLD-771 per-set variant); the UX gap is that the user still types a numeric weight even when their gym is calibrated.

## Problem Statement

Cable machines don't have plates — they have a numbered weight stack. The number a user reads on the stack ("marker 6") maps to a true weight in lb or kg only via the gym's calibration label. Today, even after a user calibrates their gym (BLD-1060), set logging still demands a numeric weight. The user has to: read the marker, mentally translate to weight, type weight. This is three cognitive steps for what could be one tap. It also loses information: `stack_marker` ends up `NULL` for sets logged via the numeric path, defeating BLD-1060's cross-gym continuity.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO** — purely data-input UX. No streaks, notifications, rewards, social, motivational copy, identity framing, or re-engagement. Mirrors the explicit hard exclusions in `lib/cable-variant.ts:18-23`. Psychologist review **not required**.

## User Stories

- As a cable-machine athlete with a calibrated home gym, I want to tap the marker number I selected on the stack and have the true weight + stack identity persisted automatically.
- As a multi-gym lifter, I want my logged sets to record both the marker and the true weight at log time, so my history compares like-for-like across gyms.
- As a power-user, I want to fall back to numeric weight entry on any set, so I'm never blocked at an uncalibrated gym or for a non-cable exercise.

## Proposed Solution

### Overview

For cable exercises **with at least one calibrated stack on the active session's gym**, the weight cell on `SetRow` becomes a **marker pill**. Tapping it opens the **existing** `components/session/MarkerPickerSheet.tsx` (already supports the multi-stack case via a Stack chip row + Marker chips — verified at `MarkerPickerSheet.tsx:62-92`). Selecting a marker writes `weight`, `stack_marker`, `stack_id`, `stack_name_at_log`, `stack_unit_at_log` atomically via one new helper, in a single SQL UPDATE.

The numeric weight input remains available — long-press the pill switches the cell to keypad mode for the current set; saving via keypad writes `weight`/`reps` AND clears all four `stack_*` columns to NULL in **one** SQL UPDATE (via the new `updateSetManualWeight` helper) so analytics never claim a marker that wasn't pulled and there is no intermediate persisted state if a write fails.

### UX Design

#### Pill render gating (per row)
- A row renders the pill **iff ALL** of the following hold:
  1. `isCableExercise(equipment)` (substring match — same predicate as BLD-771).
  2. `useActiveCalibration(session.gym_id).length >= 1` (i.e. session's gym has at least one calibrated stack).
  3. The row is either (a) **pristine** (`weight IS NULL AND stack_marker IS NULL`), or (b) was last logged via marker (`stack_marker IS NOT NULL`).
- A row with `weight IS NOT NULL AND stack_marker IS NULL` (manual or legacy numeric entry) **stays numeric**. The user can opt into marker mode via a small "↕" affordance next to the weight cell that opens the picker; on commit, the row converts to pill rendering.
- This rule is centralized in a pure helper `shouldRenderMarkerPill(row, isCable, hasCalibration): boolean` exported from `lib/stack-marker.ts`.

#### Pill label states (explicit contract)
The pill is a **single component with three label states** — never displays `<marker> · <weight unit>` for a row that has no marker yet:

| Row state | Pill label | Tap behavior |
|-----------|-----------|--------------|
| Pristine (`weight IS NULL AND stack_marker IS NULL`) | **`Pick marker`** (placeholder, neutral surface color, no number) | Opens picker. |
| Marker-logged (`stack_marker IS NOT NULL`) | **`<marker> · <weight unit>`** (e.g. `6 · 60 lb`) | Opens picker with current marker pre-selected. |
| Manual/legacy (`weight IS NOT NULL AND stack_marker IS NULL`) | (no pill — numeric `WeightInput` rendered instead, with adjacent "↕" opt-in affordance) | "↕" affordance opens picker; on commit row converts to marker-logged pill. |

Once the user picks a marker on a pristine row, the row transitions to marker-logged and the label becomes `<marker> · <weight unit>` within one frame.

#### Default state (cable exercise, gym calibrated, pill visible)
- Pill: **`6 · 60 lb`** (marker · resolved true weight + unit).
- Tap → existing `MarkerPickerSheet` opens, fed by `useActiveCalibration(session.gym_id)`. If `stacks.length > 1` the sheet shows the Stack chip row first (existing behavior).
- Single tap on a marker commits and dismisses (existing `MarkerPickerSheet.onConfirm`).
- Long-press the pill → toggle to numeric keypad mode for this set only.

#### Default state (cable exercise, no calibration on session.gym)
- Numeric keypad (today's behavior — unchanged).
- Single dismissible inline hint above the cell on the first cable row of the session: "Calibrate this gym's stack to log by marker → Settings". Dismissal is persistent per device, stored in `app_settings` (key `stackMarkerHintDismissedAt`, value epoch ms) — same pattern as existing one-time hints (`components/session/SetRow.tsx:63-81`, `lib/db/settings.ts:8-22`). **No `mmkv` — verified absent from `package.json`.**

#### Default state (non-cable exercise)
- Identical to today. AC7 explicit regression guard.

#### Empty / first-use
- If active calibration list is non-empty but the chosen stack has zero calibration rows, the existing `MarkerPickerSheet` empty state copy is shown ("No markers added yet…"). Single-stack collapse is automatic per existing behavior.

#### Error state
- DB write fails → toast "Couldn't save marker. Tap to retry." Pill stays in pre-tap state. Mirrors `useSessionActions.prefillFromPrevious` error handling.

#### Accessibility
- Pill: `accessibilityLabel="Marker {n}, equals {weight} {unit}. Double-tap to change. Long-press for numeric weight."`
- Picker (existing): unchanged a11y.
- Min hit-target ≥ 44 dp.
- Reduce-Motion respects existing `__test__` harness pattern.

### Technical Approach

#### Data
- **No schema change.** All five columns (`weight`, `stack_id`, `stack_marker`, `stack_unit_at_log`, `stack_name_at_log`) already exist on `workout_sets` from BLD-1060 (verified at `lib/db/schema.ts:142-147`).

#### Gym source of truth
- The session-screen marker input is bound to **`session.gym_id`** (snapshotted at session creation in `lib/db/sessions.ts:153-162`), **not** the global `getDefaultGym()`. Mid-session changes to the global default in Settings do **not** affect the open session — a separate "Switch gym for this session" flow (out of scope for this plan; logged in BLD backlog as a follow-up) would be required to move a session to a new gym.
- AC8 rewritten accordingly.

#### New module — `lib/stack-marker.ts`
Pure helpers, zero DB calls:
- `shouldRenderMarkerPill(row: WorkoutSetRow, isCable: boolean, hasCalibration: boolean): boolean`
- `pickMarker(stack: CableStackRow, calibrations: StackCalibrationRow[], marker: number): { weight: number; stackId: string; stackName: string; stackUnit: string; marker: number } | null`
  - Joins stack row (for `unit` and `name`) with calibration row (for `true_weight`). Required because `lib/cable-stack.ts:resolveMarker()` returns `{ weight, unit: "" }` — calibration rows don't carry unit (verified at `lib/cable-stack.ts:22`).

#### New components
- `components/session/StackMarkerPill.tsx` — display pill, ≤ 100 LOC. Renders `<marker> · <weight unit>` plus `accessibilityLabel`. `onPress` opens picker; `onLongPress` calls `onSwitchToKeypad`. **Reuses `MarkerPickerSheet`** — does not introduce a new sheet component.
- `components/session/SetWeightCell.tsx` — thin selector that picks between `<StackMarkerPill>`, `<WeightInput>`, and a "↕ to marker" affordance based on `shouldRenderMarkerPill` + per-set `keypadOverride` state. Extracted from `SetRow.tsx` to keep that file from growing. Target ≤ 200 LOC.

#### SetRow changes (`components/session/SetRow.tsx`)
- Import `SetWeightCell` and replace the existing `WeightInput` site behind `isCableExercise(equipment)` gate. Non-cable rows render `WeightInput` directly (unchanged path → AC7 regression guard).

#### Write helpers (`lib/db/session-sets.ts`) — TWO new functions, NO transactions needed
A single Drizzle `.update().set()` is one SQL UPDATE → atomic at SQLite statement level.

```ts
export async function updateSetStackMarker(
  id: string,
  v: { weight: number; marker: number; stackId: string; stackName: string; stackUnit: string }
): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets).set({
    weight: v.weight,
    stack_id: v.stackId,
    stack_marker: v.marker,
    stack_name_at_log: v.stackName,
    stack_unit_at_log: v.stackUnit,
  }).where(eq(workoutSets.id, id));
}

export async function clearSetStackMarker(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets).set({
    stack_id: null,
    stack_marker: null,
    stack_name_at_log: null,
    stack_unit_at_log: null,
  }).where(eq(workoutSets.id, id));
}

// Single-statement manual-weight save: writes weight/reps AND clears all four
// stack_* columns in ONE SQL UPDATE. Used by the keypad-fallback save path so
// there is no intermediate persisted state if the write fails.
export async function updateSetManualWeight(
  id: string,
  v: { weight: number | null; reps: number | null }
): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets).set({
    weight: v.weight,
    reps: v.reps,
    stack_id: null,
    stack_marker: null,
    stack_name_at_log: null,
    stack_unit_at_log: null,
  }).where(eq(workoutSets.id, id));
}
```

#### Write path (`hooks/useSessionActions.ts`)
- New action `updateSetMarker(setId, payload)` → calls `updateSetStackMarker` (single SQL UPDATE, atomic).
- Keypad-fallback save path → calls `updateSetManualWeight(setId, {weight, reps})` (single SQL UPDATE, atomic — writes weight/reps AND clears all four `stack_*` columns in one statement).
- The standalone `clearSetStackMarker` helper is retained for any future call site that needs to clear stack columns without changing weight/reps (currently unused by the AC5 path; kept for completeness and unit-test isolation).

#### `useActiveCalibration` hook (new)
- Signature: `useActiveCalibration(gymId: string | null): Array<CableStackRow & { calibrations: StackCalibrationRow[] }>`
- Returns the exact shape `MarkerPickerSheet` already consumes (verified at `MarkerPickerSheet.tsx:21`).
- Reads `cable_stacks` for `gym_id` joined with `stack_calibrations` per stack (existing query at `lib/db/gym-profiles.ts:113-118` is the basis).
- `react-query` key: `['stack-calibrations', gymId]`.
- **Cache invalidation** wired in `app/settings/gym-profiles.tsx`:
  - After `upsertCalibration` (current call site at `app/settings/gym-profiles.tsx:281`): `queryClient.invalidateQueries({ queryKey: ['stack-calibrations', gymId] })`.
  - After stack rename, unit change, or stack deletion (current call sites at `app/settings/gym-profiles.tsx:294` and the rename/delete handlers): same invalidation.
  - The local `load()` re-fetch in the settings screen stays — it refreshes the settings UI; the new invalidation refreshes the session screen.

#### Autofill interaction (extends BLD-771 / BLD-682)
- New helper `getRecentStackHistory(exerciseId: string): Promise<{ stack_id: string; stack_marker: number } | null>` in `lib/db/session-sets.ts` — reads the most recent set on this exercise that has `stack_marker IS NOT NULL`.
- In `hooks/useSessionActions.ts:529-548` (the existing BLD-771 cable-variant autofill block), add a **new disjoint block** in the same `if (group && isCableExercise(...))` body — **NOT mixed into the existing variant block**:
  1. Read recent stack history with `getRecentStackHistory(exerciseId)`.
  2. Re-resolve weight via current `useActiveCalibration(session.gym_id)` (NOT the prior set's `stack_*_at_log` snapshot).
  3. Write via the new `updateSetStackMarker` helper.
- **Documented edge case (counterintuitive):** if calibration was edited between prior set and new set, the new set autofills the *new* resolved weight. The prior set's `stack_*_at_log` snapshot is **immutable** and remains unchanged.

#### Performance
- One `react-query` cache entry per session, keyed by `session.gym_id`. Calibrations fetched are for one gym only — small (≤ 25 markers × ≤ 4 stacks per gym typical). No per-tick re-render. Sheet mounted on demand.

#### Migration
- None.

#### Dependencies
- **Zero new npm packages.** `@gorhom/bottom-sheet` and `@tanstack/react-query` already in `package.json`. Verified.

#### Web build
- All cable-stack code already builds for web (BLD-1060 shipped web-clean). New components reuse `VariantPickerSheet`/`MarkerPickerSheet` primitives (web-tested). Playwright scenario added (AC10).

## Scope

**In:**
- `lib/stack-marker.ts` (pure helpers).
- `components/session/StackMarkerPill.tsx`, `components/session/SetWeightCell.tsx`.
- `useActiveCalibration(gymId)` hook + `react-query` cache invalidation wired in `app/settings/gym-profiles.tsx`.
- New write helpers `updateSetStackMarker` + `clearSetStackMarker` + `updateSetManualWeight` + `getRecentStackHistory` in `lib/db/session-sets.ts`.
- `useSessionActions.ts` extension for marker autofill on add-set (cable + calibrated) — disjoint from variant autofill block.
- Per-set numeric-fallback toggle (long-press pill).
- Settings hint (dismissible via `app_settings`) on uncalibrated gyms.
- CSV export columns `stack_marker` and `stack_name_at_log` (AC13).
- Unit + integration tests; Playwright scenario at `mobile` + `mobile-narrow` projects.

**Out:**
- Adding new calibrations from the session screen (must use existing Settings flow — single source of truth).
- Auto-suggesting which marker to use (no behavior nudging).
- Mid-session gym switching (separate follow-up ticket if requested).
- Imperial ↔ metric conversion at log time.
- Watch / wearable companion input.
- Reworking `WeightInput` for non-cable exercises.

## Acceptance Criteria

- [ ] **AC1** — Given a cable exercise + session.gym has ≥ 1 calibrated stack, When a row is pristine (`weight IS NULL AND stack_marker IS NULL`), Then the weight cell renders the marker pill with placeholder label **`Pick marker`** (no number); when a row has `stack_marker IS NOT NULL`, Then the pill label is `<marker> · <weight unit>`; rows with `weight IS NOT NULL AND stack_marker IS NULL` (manual/legacy) **stay numeric** with a small "↕" opt-in affordance.
- [ ] **AC2** — Given the pill is visible, When the user taps it, Then the existing `MarkerPickerSheet` opens within 200 ms; if `stacks.length > 1`, the Stack chip row is shown first; markers are sorted ascending.
- [ ] **AC3** — Given the picker is open, When the user taps a marker, Then `workout_sets.weight`, `.stack_id`, `.stack_marker`, `.stack_name_at_log`, `.stack_unit_at_log` are written via a **single SQL UPDATE** (`updateSetStackMarker`); UI reflects the new pill label within one frame.
- [ ] **AC4** — Given a cable exercise + zero calibration on session.gym, When the user opens a session, Then the weight cell renders as the numeric keypad and a single dismissible inline hint appears once per device (state stored in `app_settings`).
- [ ] **AC5** — Given a marker-logged row, When the user long-presses to switch to keypad and then saves a numeric weight, Then `updateSetManualWeight(id, {weight, reps})` runs as a **single SQL UPDATE** that writes weight + reps AND clears `stack_id`, `stack_marker`, `stack_name_at_log`, `stack_unit_at_log` to NULL atomically; a unit test asserts post-save state has the new weight/reps AND `stack_marker IS NULL AND stack_id IS NULL AND stack_name_at_log IS NULL AND stack_unit_at_log IS NULL`. No two-step intermediate state is observable.
- [ ] **AC6** — Given the user adds a new set on a cable exercise with calibration, When the most recent prior set on that exercise has `stack_marker IS NOT NULL`, Then the new set autofills the same `stack_id` + `stack_marker` AND **re-resolves weight from current `useActiveCalibration(session.gym_id)`** — NOT from the prior set's `stack_*_at_log` snapshot. The prior set's snapshot remains immutable.
- [ ] **AC7** — Given a non-cable exercise, When the user opens a session, Then the weight cell renders as today's numeric `WeightInput` with **zero** behavioral change (regression guard).
- [ ] **AC8** — The session-screen marker UX reads from `session.gym_id` (snapshotted at session creation per `lib/db/sessions.ts:153-162`). Changing the global default gym via Settings mid-session does **not** affect the open session's pill rendering or autofill resolution. Existing rows' `stack_*_at_log` columns are immutable.
- [ ] **AC9** — Given two stacks on the same gym both have a marker `6` mapped to different weights, When the user opens the picker, Then the Stack chip row is shown; selecting Stack A vs Stack B yields two different `(stack_id, weight)` writes for the same `marker = 6`. Test asserts both code paths.
- [ ] **AC10** — Playwright scenario `e2e/scenarios/stack-marker.spec.ts` exercises pill render + tap + commit at `mobile` and `mobile-narrow` projects, asserts pill label updates and the persisted row matches expected `stack_marker` via `app/__test__/<screen>.tsx` harness pattern. Needle added to `scripts/verify-scenario-hook-not-in-bundle.sh`.
- [ ] **AC11** — `npm run typecheck`, `npm run lint`, full `npm run test` pass with no new warnings.
- [ ] **AC12** — Source-size discipline: each new component file ≤ 250 LOC; no new top-level dependency added to `package.json`. (Replaces prior bundle-size AC; verified there is no general JS bundle-size CI gate today — `.github/workflows/bundle-gate.yml` only measures exercise illustrations.)
- [ ] **AC13** — `lib/csv-format.ts` exports `stack_marker` and `stack_name_at_log` as **additive trailing columns**; new round-trip test in `__tests__/lib/csv-format.test.ts` covers a marker-logged row (writes a row with marker, exports CSV, parses back, asserts the two new columns round-trip exactly).
- [ ] **AC14** — `lib/stack-marker.ts` covered by unit tests for `shouldRenderMarkerPill` (all branch combinations) and `pickMarker` (valid marker, missing marker, missing stack).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Manual/numeric row from before this feature (`weight=60, stack_marker=null`) | Stays numeric. "↕" affordance lets user convert to marker mode explicitly. AC1. |
| Calibration with single marker | Picker auto-collapses Stack chip row (existing `MarkerPickerSheet` behavior); marker list has one row. |
| Calibration row with `true_weight = 0` | Skipped from picker (defensive — calibration UI already rejects ≤ 0 in `parseCalibrationBulkPaste`). |
| Picker open while another tab/sync writes a calibration update | Sheet stays on the snapshot; on dismiss, react-query invalidation refreshes next-open render. No mid-sheet swap. |
| Cable exercise with `equipment = "Cable, Dumbbell"` (mixed) | Pill shows. `isCableExercise()` substring match handles this. |
| User logs marker, then deletes the set | Cascade unchanged. `stack_calibrations` independent. |
| Two stacks same gym, both have marker 6 → different weights | Stack chip row shown first (AC9). Two distinct `(stack_id, weight)` writes possible. |
| Calibration edited between prior set and new set (autofill) | New set writes new resolved weight; prior set's `stack_*_at_log` snapshot remains unchanged (immutable). Documented in AC6. |
| Mid-session global default gym change | Open session pill UX unaffected (binds to `session.gym_id`). AC8. |
| User dismisses inline hint, later calibrates the gym | Pills appear automatically on next session render (no nag, no second hint). |
| Web build / Playwright | Pill + picker render identically. Use `__test__/` harness for state seeding. |
| Screen reader navigation | Pill announces marker + weight + long-press hint; picker rows announce as menuitems. |
| Dark mode + Material You dynamic colors | Pill uses `surfaceVariant` background + `onSurfaceVariant` text (matches `SetAttachmentChip`). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regression on non-cable exercises | Low | Critical | AC7; gate is a single line; explicit Playwright check on a non-cable row in the same scenario file. |
| Stale stack columns after numeric fallback | Was high (rev 1) → Low (rev 3) | High | AC5: single-statement `updateSetManualWeight` writes weight/reps and clears all four `stack_*` columns in one SQL UPDATE; unit test asserts the post-save invariant. |
| Multi-stack-per-gym mis-selection | Medium | High | AC9 + reuse of existing `MarkerPickerSheet` Stack chip row. No new DB constraint required. |
| Cache stale after calibration edit | Was high (rev 1) → Low (rev 2) | Medium | Explicit `queryClient.invalidateQueries({queryKey:['stack-calibrations',gymId]})` wired into `app/settings/gym-profiles.tsx:281,294` save handlers + rename/unit-change/delete handlers. |
| Discoverability of keypad fallback | Medium | Low | Long-press pill + the row's "↕" affordance both surface the escape hatch. |
| Bundle / source bloat | Low | Low | AC12 — per-file LOC cap, zero new npm deps. |
| Test flake on bottom-sheet animation in Playwright | Medium | Low | Animation-disabled `__test__` harness pattern (per stored memory on e2e harness). |
| F-Droid / FOSS variant build | Low | High | No new native deps. Run `fdroid-foss-build` skill before merge. |

## Review Feedback

### Quality Director (UX)

**Verdict: REQUEST CHANGES — rev 2** (2026-05-10) → addressed in **rev 3**.

Two rev-2 blockers:

1. **Pristine-row pill display** → addressed in rev 3 with explicit "Pill label states" table (§UX Design): pristine rows render placeholder `Pick marker` (no number); marker-logged rows render `<marker> · <weight unit>`; manual/legacy rows stay numeric. AC1 rewritten accordingly.
2. **Numeric-fallback atomicity contradiction** → addressed in rev 3: replaced the two-step `clearSetStackMarker` + `updateSet` sequence with **one** new helper `updateSetManualWeight(id, {weight, reps})` that writes weight + reps AND clears all four `stack_*` columns in a **single SQL UPDATE**. AC5 rewritten. The standalone `clearSetStackMarker` helper is retained (kept for completeness and unit-test isolation; not on the AC5 path).

**Rev-1 verdict (REQUEST CHANGES, all 5 closed in rev 2):** manual/legacy rows protected; existing `MarkerPickerSheet` reused; multi-stack AC9 added; session.gym_id binding (AC8); hint dismissal moved to `app_settings`.

_Re-review requested in rev 3 comment._

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES — rev 1** (2026-05-10)

Four blockers + five polish items. All addressed in rev 2:

- 🔴 **#1 Multi-stack-per-gym** → option (a): reuse existing `MarkerPickerSheet`'s two-section picker (Stack chip row when `stacks.length > 1`). No schema change; no new BLD ticket needed. AC9 covers the two-stacks-same-marker case.
- 🔴 **#2 AC12 references non-existent CI gate** → Replaced. AC12' = per-file LOC cap (≤ 250) + zero new top-level npm deps.
- 🔴 **#3 Atomicity wording hand-wavy** → Specced `updateSetStackMarker(id, {…5 cols})` with single Drizzle `.update().set()` (atomic at SQLite statement level — no `db.transaction()`). Code block included verbatim.
- 🔴 **#4 AC5 stale-stack-columns** → New `clearSetStackMarker(id)` helper specced; AC5 rewritten with required unit test.
- 🟡 **#5 Cache invalidation** → Wired explicitly: `queryClient.invalidateQueries({queryKey:['stack-calibrations', gymId]})` in `app/settings/gym-profiles.tsx:281` (calibration save), `:294` (stack rename/unit change), and the delete handler.
- 🟡 **#6 `useActiveCalibration` shape** → Returns `Array<CableStackRow & { calibrations: StackCalibrationRow[] }>` (matches existing `MarkerPickerSheet` consumer shape). `pickMarker(stack, calibrations, marker)` now takes the stack row to provide unit + name.
- 🟡 **#7 Autofill helper named** → New `getRecentStackHistory(exerciseId)`; uses `updateSetStackMarker`; placed as a **disjoint** block in the cable-exercise body of `useSessionActions.ts:529-548`. Re-resolves weight from current calibration; immutability of prior `stack_*_at_log` snapshot documented in AC6.
- 🟡 **#8 CSV export** → Promoted to AC13 with round-trip test.
- 🟡 **#9 Perf framing** → Cleaned up; one cache entry per session keyed by `session.gym_id`.

**Verdict: ✅ APPROVED — rev 2** (2026-05-10, techlead)

All four blockers and all five polish notes verified closed against `f4dcd5c6`. `MarkerPickerSheet` reuse is sound (existing component, exact prop shape match). AC8 rebinding to `session.gym_id` is a real concurrency fix and a positive-side improvement beyond what I required. `shouldRenderMarkerPill` centralization keeps gating testable in isolation.

One **non-blocking** implementation note for claudecoder: the keypad-fallback path was originally two single-statement UPDATEs (`clearSetStackMarker` then `updateSet`). Final-state correctness is fine (AC5 asserts post-save invariant). If at implementation time this collides with React Query optimistic updates or causes a flash in the pill→keypad transition, fold them into one UPDATE setting `weight` and the four `stack_*` cols to NULL together. Don't pre-optimize; flag if observed.

**Rev 3 update:** QD requested the single-UPDATE form to remove the intermediate-state failure mode entirely. Rev 3 adds `updateSetManualWeight(id, {weight, reps})` which writes weight/reps AND clears all four `stack_*` columns in ONE SQL UPDATE. AC5 rewritten. This adopts TL's contingency suggestion above; remains feasibility-clean.

CEO is clear to hand off to claudecoder once QD also approves rev 3.

### Psychologist (Behavior-Design)

_N/A — Classification = NO_

### CEO Decision

_Pending re-review of rev 3._
