# Feature Plan: Intensity Metric Choice — Log by RIR or RPE

**Issue**: BLD-2699  **Author**: CEO  **Date**: 2026-07-03
**Status**: IN_REVIEW
**Parent**: BLD-2698 (Product evolution) — sourced from daily research

---

## Problem Statement

CableSnap logs set intensity today using **RPE (Rate of Perceived Exertion), scale 6–10**, via the `RpeChipStrip` (Easy/Moderate/Hard/Max chips) and the precise `RpeSheet` (6.0–10.0 in 0.5 steps). This is a solid, opt-in feature (BLD-1110).

But there is a well-established split in how serious lifters *think* about proximity to failure:

- **RPE crowd** — "That was an 8." Popularized by Mike Tuchscherer / powerlifting.
- **RIR crowd** — "I left 2 reps in the tank." **Reps In Reserve** is the dominant vocabulary in modern hypertrophy/bodybuilding coaching (Jeff Nippard, Renaissance Periodization, Dr. Mike Israetel). RP's entire volume-landmark system is expressed in RIR.

The two scales encode the **same underlying quantity** — distance from momentary muscular failure — related by the identity:

> **RPE = 10 − RIR**  (equivalently **RIR = 10 − RPE**)

A user who thinks in RIR must currently do this conversion in their head on every set ("I left 2 reps, so that's an RPE 8, tap Hard"). That is exactly the kind of cognitive friction our north-star goal (BLD-2698: *minimal cognitive load*) exists to eliminate. Reddit hypertrophy communities (`r/naturalbodybuilding`, `r/weightlifting`) overwhelmingly discuss training in RIR; several competitor-app complaints center on being forced into RPE-only entry.

**Why now:** The intensity subsystem is mature and stable. Adding a *display-mode preference* is low-risk because it introduces **no new per-set data dimension** — we reuse the existing `workout_sets.rpe REAL` column and convert at the UI boundary. This is a high-value, low-complexity win.

---

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see AGENTS §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress viz, social/leaderboard, habit loops, goal-setting/commitments, motivational copy, identity framing, re-engagement)

- [x] **NO** — purely functional/informational.

**Rationale:** This feature changes the *label and numeric scale* used to record an intensity value the user already logs. It:
- Adds **no** reminders, notifications, or re-engagement.
- Adds **no** streaks, XP, rewards, or progress-motivation visualizations.
- Adds **no** goal-setting, commitment, or social/leaderboard surface.
- Adds **no** onboarding step (the default mode is unchanged; the toggle lives in existing Settings).
- Uses **no** motivational, loss-framing, FOMO, or identity copy. Labels are neutral units ("RIR", "RPE").

It is a units/terminology preference, directly analogous to kg-vs-lb weight units. **Psychologist review is therefore NOT required.** (If any reviewer disagrees with this classification, flag it and I will route to `@psychologist` for a scoping verdict before implementation — cheap insurance.)

---

## User Stories

- As a **hypertrophy-focused lifter who thinks in RIR**, I want to tap "2 RIR" directly, so that I don't have to mentally convert to RPE on every set.
- As an **existing RPE user**, I want the app to keep working exactly as it does today, so that this change is invisible to me unless I opt in.
- As a **user who switches modes**, I want my historical sets to re-render in my chosen unit, so that my whole history is consistent and comparable.
- As a **coach reviewing a client's exported data**, I want the CSV to clearly indicate which scale was used, so that the numbers aren't ambiguous.

---

## Proposed Solution

### Overview

Introduce a single user preference, **`session.intensityMode`** with values `"rpe"` (default) or `"rir"`, stored in the existing `app_settings` key/value table. The **stored value in `workout_sets.rpe` never changes** — it is always the RPE-scale REAL (6–10). RIR is a pure *presentation transform* applied at read (display) and write (input) boundaries:

- **Display:** `rir = 10 − rpe`
- **Input:** `rpe = 10 − rir`

This means **every downstream consumer** — rest-timer recompute, plateau/deload logic, overreaching detection, `rm.ts`, `useSessionData.maxRpeSafe`, analytics charts — continues to operate on the RPE scale **unchanged**. Zero risk to existing analytics correctness. This is the entire architectural bet of the plan and must be preserved.

### UX Design

**1. Settings toggle (segmented control, not a boolean Switch)**
In `components/settings/PreferencesCard.tsx`, add a labeled segmented control **"Intensity scale"** with two options: `RPE` | `RIR`. Placed adjacent to the existing "Capture set RPE during workouts" switch (they are conceptually linked). Include a one-line helper caption: *"RIR = reps left in reserve. RPE = 10 − RIR."*

- Default: **RPE** (unchanged behavior for all existing users).
- Persists via `setAppSetting("session.intensityMode", "rpe"|"rir")` following the exact hydrate → local-state → persist-with-error-toast pattern used by the other toggles.
- Only meaningful when RPE capture is enabled; when capture is OFF the control may be shown disabled with the caption, or hidden — **reviewer input requested** (see Open Questions Q1).

**2. Live set-logging chips (`RpeChipStrip`)**
The 4 chips must relabel and re-value based on mode. The underlying stored RPE values stay identical:

| Chip label | RPE mode shows | RIR mode shows | Stored `rpe` |
|------------|----------------|----------------|--------------|
| Easy       | RPE 6          | 4 RIR          | 6            |
| Moderate   | RPE 7.5        | 2.5 RIR        | 7.5          |
| Hard       | RPE 9          | 1 RIR          | 9            |
| Max        | RPE 10         | 0 RIR          | 10           |

The qualitative labels (Easy/Moderate/Hard/Max) stay the same across modes; only the numeric a11y label and any numeric chip annotation flips. Component stays controlled; `onChange` still emits the **RPE-scale** number so the persistence path (`updateSetRPE`, clamp 6–10) is untouched.

**3. Precise picker (`RpeSheet`)**
In RIR mode, the sheet presents RIR steps `[4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.0]` (descending; 0 RIR = hardest), with a title "Reps in Reserve". On selection it converts back to RPE (`10 − rir`) before calling `onChange`. Same 9 discrete steps, just relabeled and reversed. Header/units reflect the mode.

**4. Read-back surfaces (§ display audit)**
Every place that currently renders `RPE {value}` must render in the active mode. This is the largest surface of the change:
- Active-session completed-set summary (`components/session/summary/SetsCard.tsx`)
- Session detail history rows (`components/session/detail/ExerciseGroupRow.tsx`)
- Home recent-workouts badges (`components/home/RecentWorkoutsList.tsx`)
- Progress chart (`components/progress/TrendCards.tsx` → `RPETrendCard`) — axis label + domain flip. **Reviewer input requested** on chart direction (see Q3).
- Post-session edit input (`components/session/detail/EditableSetRow.tsx`) — free-text field must accept/emit in the active mode.
- Suggestion explainer copy (`components/session/SuggestionExplainerModal.tsx`) — currently references RPE thresholds; must render in mode.

A shared formatter (see Technical Approach) centralizes the label/convert logic so no surface hardcodes "RPE" or the 6–10 assumption.

**5. Accessibility**
- Segmented control: `role="radiogroup"` with two `radio` children, selected state announced.
- Chips/sheet: a11y labels flip to the active unit ("2 RIR, moderate" vs "RPE 7.5, moderate").
- Color coding (`rpeColor`) is intensity-direction-preserving and unit-agnostic (higher effort = "advanced" color) — must remain correct after the RIR flip (RIR 0 = hardest = advanced color). The helper takes the stored RPE value, so colors stay correct with **no change** to `lib/rpe.ts`.

**6. Error / empty states**
- No logged intensity → renders as today (no badge), regardless of mode.
- Switching mode with existing history → all historical values re-render instantly in the new unit on next read (no data migration, no write).

### Technical Approach

**Architecture principle:** *Store RPE, display the user's chosen unit.* Never persist RIR.

**New shared module `lib/intensity.ts`** (centralizes the scale — none exists today, the report flagged this gap):
```
export type IntensityMode = "rpe" | "rir";
export const RPE_MIN = 6, RPE_MAX = 10, RPE_STEP = 0.5;      // canonical
export function rpeToRir(rpe: number): number  // 10 - rpe
export function rirToRpe(rir: number): number  // 10 - rir
export function formatIntensity(rpe: number|null, mode: IntensityMode): string  // "RPE 8" | "2 RIR" | ""
export function intensityUnitLabel(mode): string             // "RPE" | "RIR"
```
`RpeChipStrip` and `RpeSheet` import their scale constants from here instead of duplicating inline arrays.

**Preference plumbing:**
- Read `session.intensityMode` via `getAppSetting` (same as `session.captureRpe`).
- Thread the mode into `SetRow` alongside the existing `captureRpe` prop, down the existing prop-drill chain (`ExerciseGroupCard` → `ExerciseGroupSetTable` → `SetRow`).
- For read-back surfaces that don't have session context (home list, history, progress), read the setting where they fetch data (they already do async reads) or via a small `useIntensityMode()` hook backed by react-query so a mode change invalidates and re-renders.

**Data model:** **No schema change. No migration.** `workout_sets.rpe` REAL stays the single source of truth. This is the key de-risking decision and must survive review.

**CSV export/import:** The export currently writes a `set_rpe` column (`lib/csv-format.ts`, `lib/db/csv.ts`). To avoid ambiguity we keep exporting the **RPE value** in the `set_rpe` column (stable, matches Strong/Hevy import expectations) regardless of display mode. **Reviewer input requested** on whether to add an informational `intensity_mode` column or a second `set_rir` column (see Q2). Import continues to parse `set_rpe`/`rpe` as RPE.

**Performance:** All conversions are single arithmetic ops; formatter is trivial. No new queries, no new columns, no migration cost. Negligible perf impact.

**Storage:** One new `app_settings` row (`session.intensityMode`). Nothing else.

---

## Scope

**In:**
- `session.intensityMode` preference (`app_settings`), default `"rpe"`.
- Segmented control in `PreferencesCard`.
- `lib/intensity.ts` shared conversion/format module + centralized scale constants.
- Mode-aware `RpeChipStrip`, `RpeSheet`, and all 6 read-back surfaces listed above.
- Mode-aware post-session edit input.
- a11y label flips.
- Unit tests for conversion, formatter, chip relabeling, and settings persistence; update existing RPE tests that assert on labels.

**Out:**
- Changing what is **stored** (always RPE).
- Any schema/migration change.
- Per-set mode override (mode is a global preference, not per-set).
- Auto-detecting mode from imported data.
- Changing the 6–10 clamp on the live-capture write path.
- Any behavior-shaping additions (streaks, nudges to log RIR, etc.).
- Onboarding step for the new toggle.

---

## Acceptance Criteria

- [ ] Given a fresh install (no `session.intensityMode` set) When the user opens Settings Then "Intensity scale" shows **RPE** selected (default unchanged).
- [ ] Given RPE mode When a user completes a set and taps the "Hard" chip Then `workout_sets.rpe` is stored as `9` (unchanged from today).
- [ ] Given RIR mode When a user completes a set and taps the "Hard" chip Then `workout_sets.rpe` is still stored as `9`, and the chip a11y label reads "1 RIR".
- [ ] Given RIR mode When viewing history for a set stored with `rpe=8` Then the badge renders "2 RIR".
- [ ] Given RPE mode When viewing that same set Then the badge renders "RPE 8".
- [ ] Given a user switches from RPE to RIR When they return to any history/summary/home surface Then all previously logged intensities re-render in RIR with no data mutation (verify `workout_sets.rpe` values are byte-identical before/after in a DB assertion).
- [ ] Given RIR mode When opening the precise picker Then steps are labeled 4.0 … 0.0 RIR (descending) and selecting "2.0 RIR" stores `rpe=8`.
- [ ] Given the post-session edit field in RIR mode When the user types "2" Then the stored `rpe` becomes `8`; when in RPE mode typing "8" stores `8`.
- [ ] Given any mode When CSV is exported Then the `set_rpe` column contains the RPE-scale value (import round-trip preserved).
- [ ] Color coding of an intensity badge is identical for a given stored `rpe` regardless of display mode.
- [ ] PR passes all tests with no regressions in the existing RPE test suite (updated for label assertions).
- [ ] No new lint warnings.

## Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)

All acceptance criteria above are headless-verifiable via Jest unit/integration tests and the existing test harness. No on-device or manual-only verification is required.

| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| (none) | Visual chip relabeling on real device | Component test asserting rendered chip text + a11yLabel per mode (`@testing-library/react-native`) |
| (none) | Historical re-render after mode switch | Integration test: seed sets, flip `session.intensityMode`, assert formatter output changes while DB `rpe` values are unchanged |
| (none) | Progress chart axis/domain flip | Component test asserting axis label + domain props on `RPETrendCard` per mode |

No device-only AC exists; no waiver needed.

---

## Edge Cases

| Scenario | Expected |
|----------|----------|
| No intensity logged | No badge shown, both modes (unchanged). |
| Legacy set with `rpe` out of 6–10 (post-session edit allowed 0–10) | RIR conversion still applies (`10 − rpe`); e.g. `rpe=5` → "5 RIR". Formatter must not clamp on display. |
| `rpe = 10` in RIR mode | Renders "0 RIR" (hardest), not "−0" or blank. |
| `rpe = 7.5` in RIR mode | Renders "2.5 RIR" (half-steps preserved). |
| Mode changed mid-active-session | Chips/sheet/summary in the live screen reflect new mode on next render; already-stored sets unaffected. |
| CSV imported from Strong/Hevy (RPE columns) | Parsed as RPE, stored as RPE; displays in user's chosen mode. |
| RPE capture toggled OFF | Intensity-scale control has no runtime effect; see Q1 for whether to disable/hide it. |
| A11y screen reader in RIR mode | Announces RIR values and unit correctly. |
| Reduced-motion | Unchanged (chip strip animation already respects it). |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| A downstream analytic accidentally consumes a RIR value instead of stored RPE | Low | High (wrong deload/plateau logic) | Architectural invariant: RIR never persisted, conversion only at UI boundary. Add a unit test asserting `updateSetRPE` still receives RPE-scale from chips in RIR mode. Reviewers (techlead) verify no consumer reads the display value. |
| Missed a read-back surface → shows "RPE" in RIR mode | Medium | Low (cosmetic) | Centralized `formatIntensity`; grep audit for hardcoded "RPE"/`set.rpe` renders during review; the 6 surfaces enumerated in scope. |
| Users confused by two scales / accidental toggle | Low | Low | Neutral helper caption ("RIR = reps left in reserve. RPE = 10 − RIR."); default stays RPE; no forced choice. |
| CSV ambiguity for coaches | Low | Medium | Keep `set_rpe` as canonical RPE column; optional `intensity_mode` metadata (Q2). |
| Chart domain flip introduces a confusing axis | Medium | Low | Reviewer decision on chart handling (Q3); may keep chart in RPE always with a labeled note. |
| Scale-constant duplication drift (`RpeChipStrip` vs `RpeSheet` vs `session-sets`) worsens | Low | Low | Consolidate into `lib/intensity.ts` as part of this work (net debt reduction). |

---

## Open Questions for Reviewers

- **Q1 (QD/UX):** When RPE capture is OFF, should the "Intensity scale" control be **hidden** or **shown-disabled with caption**? (Discoverability vs. clutter.)
- **Q2 (techlead):** CSV — keep only `set_rpe` (recommended for import stability), or add an informational `intensity_mode` column and/or a derived `set_rir` column?
- **Q3 (QD/UX):** Progress `RPETrendCard` — flip to a "RIR trend" (inverted axis, lower = harder) in RIR mode, or always display the chart in RPE with a small note? Inverted axes can be confusing.
- **Q4 (techlead):** Preferred mechanism to propagate the mode to context-less read surfaces (home/history/progress): a `useIntensityMode()` react-query-backed hook vs. reading `getAppSetting` inline at each fetch site.

---

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO (units/terminology preference, no behavior-shaping triggers). Re-route only if a reviewer contests the classification.

### CEO Decision
_Pending — awaiting QD + techlead verdicts._
