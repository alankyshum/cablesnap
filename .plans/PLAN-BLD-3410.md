# Feature Plan: Per-Gym Cable Stack Profiles — Generative (Start + Increment) Stacks

**Issue**: BLD-3410  **Author**: CEO  **Date**: 2026-07-17
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

> **⚠️ SCOPE CORRECTION (post-research).** The core per-gym cable-stack infrastructure
> already shipped under **BLD-1059 / BLD-1060 / BLD-1126 / BLD-1130**. What exists today:
> `gym_profiles`, `cable_stacks`, `stack_calibrations` tables; full CRUD in
> `lib/db/gym-profiles.ts`; a management screen at `app/settings/gym-profiles.tsx`;
> session tagging via `workout_sessions.gym_id` (+ `gym_name_at_log` snapshot);
> denormalized set snapshots `workout_sets.stack_id/stack_marker/stack_unit_at_log/stack_name_at_log`;
> marker-based logging UI (`MarkerPickerSheet.tsx`, `SetWeightCell.tsx`, `StackMarkerPill.tsx`);
> and **cross-gym analytics already filter by `gym_id`** in `lib/db/e1rm-trends.ts`.
>
> Therefore this plan is **NOT** a greenfield build. It is a focused extension addressing the
> one genuine gap in the existing model (see Problem Statement). The original greenfield draft
> (new `gyms`/`cable_stack_profiles` tables) is **withdrawn** — building it would duplicate
> shipped infra.

## Problem Statement
The shipped model stores calibration as an **explicit per-marker lookup table**
(`stack_calibrations`: one row per `(stack_id, marker) → true_weight`). To calibrate a
typical machine a user must hand-enter every marker's true weight (or bulk-paste them). But
the overwhelming majority of real cable stacks are a simple **arithmetic progression**:
a starting/base plate weight plus a fixed increment per pin (e.g. base 5 kg, +5 kg per pin,
15 pins). Requiring users to enumerate every marker is high-friction setup — the single
biggest barrier to adoption of the (otherwise complete) per-gym feature, and directly counter
to CableSnap's "minimal cognitive load / frictionless" north star.

**The gap:** there is no way to define a stack generatively as
`{ start_weight, increment, marker_count }`. Users who train at several gyms must manually
transcribe dozens of calibration rows per stack.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely a data-entry/functional convenience. It changes how a stack is
  *defined* (generative vs. enumerated), not how the user is nudged to behave. No streaks,
  notifications, gamification, rewards, onboarding hooks, or motivational framing.

## User Stories
- As a lifter setting up a new gym, I want to enter a stack's start weight, increment, and
  number of pins **once** and have the app generate all marker weights, instead of typing
  each one.
- As a user with a non-linear stack (add-on plates, odd top pin), I want the generated values
  as a starting point that I can then edit per-marker.
- As an existing user with hand-calibrated stacks, I want my current calibrations untouched.

## Proposed Solution
### Overview
Add an **optional generative definition** to a cable stack. When a user chooses "Generate
from start + increment", the app computes marker → true_weight for `marker_count` pins and
persists them as ordinary `stack_calibrations` rows. This keeps **100% of downstream code
unchanged** (logging, snapshots, analytics all continue to read `stack_calibrations` /
resolved true weights). Generation is a convenience layer on top of the existing table, not a
new resolution path.

### UX Design
- In `app/settings/gym-profiles.tsx`, when adding/editing a cable stack, add a segmented
  control: **"Generate"** (default for new stacks) vs **"Manual entry"** (today's behavior).
- **Generate mode** inputs: `Start weight`, `Increment`, `Number of pins` (+ existing `unit`).
  A live preview list shows the computed markers (`Pin 1 → 5 kg`, `Pin 2 → 10 kg`, …).
  A "Generate & save" action writes the calibration rows.
- After generation, the stack drops into the **existing manual calibration editor** so any
  single marker can be tweaked (non-linear top pins, add-on plates). Generation is a
  bootstrap, not a lock.
- **Bulk-paste** (existing `parseCalibrationBulkPaste`) remains available as a third path.
- **Empty/opt-out:** users who prefer manual entry pick "Manual entry" and see exactly
  today's UI. Existing stacks are unaffected and open in manual mode.
- **A11y:** all inputs have `accessibilityLabel`; preview uses `role=text`; validation errors
  are text, not color-only.

### Technical Approach
- **Pure generator** (new, unit-tested): `generateCalibrations({ startWeight, increment, count }) → Array<{ marker, trueWeight }>`
  in `lib/cable-stack.ts` (alongside existing `resolveMarker` / `parseCalibrationBulkPaste`).
  Marker numbering follows the existing convention used by `resolveMarker`/`pickMarker`.
- **Optional persisted definition (recommended):** add three nullable columns to
  `cable_stacks` so a generated stack can be *re-generated/edited later* and round-trips
  through export:
  - `gen_start_weight REAL NULL`, `gen_increment REAL NULL`, `gen_marker_count INTEGER NULL`.
  - Added via `addColumnIfMissing(...)` in the correct phase of `lib/db/migrations.ts`
    (4-phase idempotent runner), mirrored in `lib/db/schema.ts` (`cableStacks`) and the
    runtime DDL in `lib/db/tables.ts`. **Register the new columns in
    `lib/db/import-export.ts`** (`cable_stacks` is already exported — add columns to keep
    round-trip lossless).
  - These columns are pure metadata; `stack_calibrations` remains the single source of truth
    for resolution, so all analytics/logging code is untouched.
- **DB helper:** extend `lib/db/gym-profiles.ts` with
  `generateStackCalibrations(stackId, {startWeight, increment, count})` that (a) writes the
  gen_* metadata on `cable_stacks` and (b) upserts the derived `stack_calibrations` rows in a
  single transaction via the existing `upsertCalibration` ON CONFLICT path.
- **Query invalidation:** reuse the existing `["stack-calibrations", gymId]` react-query key
  (`hooks/useActiveCalibration.ts`) — invalidate after generation exactly as the current
  manual-edit mutations do in `gym-profiles.tsx`.
- **Units:** honor the stack's existing `unit` column; store `true_weight` in the same unit
  convention the current calibration path uses (no new conversion path introduced).

## Scope
**In:**
- Pure `generateCalibrations` function + unit tests.
- `cable_stacks` gen_* metadata columns (idempotent migration + schema + DDL + import/export).
- `generateStackCalibrations` DB helper (transactional; upserts calibration rows).
- Generate/Manual segmented UI in `app/settings/gym-profiles.tsx` with live preview,
  falling through to the existing per-marker editor for tweaks.

**Out:**
- Any change to logging UI (`SetWeightCell`, `MarkerPickerSheet`) — unchanged.
- Any change to analytics / e1RM / normalization — already gym-aware, unchanged.
- New tables or a new resolution path (explicitly rejected — reuse `stack_calibrations`).
- Cloud sync / crowd-sourced machine specs / GPS gym detection / pulley-ratio modeling.
- Non-cable equipment.

## Acceptance Criteria
- [ ] Given start=5, increment=5, count=3 (kg), When I tap "Generate & save", Then
  `stack_calibrations` contains markers resolving to 5, 10, 15 kg for that stack.
- [ ] Given a generated stack, When I edit a single marker's true weight in the existing
  editor, Then only that row changes and the gen_* metadata is preserved.
- [ ] Given an existing (pre-feature) manually-calibrated stack, When I open it, Then it opens
  in Manual mode with its calibrations intact and no data migration alters it.
- [ ] Given a generated stack, When I export then import the backup, Then gen_* columns and
  all calibrations round-trip losslessly.
- [ ] Migration is idempotent — running `migrate(db)` twice does not error and adds columns
  only if missing.
- [ ] Logging a cable set against a generated stack produces the same
  `stack_*` snapshots and `cached_e1rm_kg` as an equivalent manually-calibrated stack.
- [ ] PR passes all tests with no regressions. No new lint warnings.

## Headless Verification Path (device/manual ACs)
| Device/Manual AC | Risk it covers | Headless proxy |
|------------------|----------------|----------------|
| Generate preview correct on-device | Progression/rounding math wrong | Unit tests on `generateCalibrations` across increments (2.5/5/7.5/10), counts, and non-integer starts |
| Migration runs on real DB | Schema corruption on upgrade | In-memory SQLite: run `migrate(db)` twice, assert gen_* columns present via PRAGMA + pre-existing rows untouched |
| Generated stack logs like a manual one | Divergent snapshot/e1RM path | Integration test: generate stack, log a set, assert `stack_*` snapshots + `recomputeSetCaches` output equal the manual-calibration baseline |
| Export/import round-trip | Lossy backup | Serialize → deserialize test asserting gen_* + calibrations equality |
| Segmented control / preview a11y | Screen-reader gaps | Component test asserting `accessibilityLabel` presence and non-color-only validation |
No AC requires physical hardware.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| count = 0 or negative | Validation error (text); no rows written |
| increment = 0 | Validation error (all markers equal is invalid) |
| Non-integer start/increment (e.g. 2.5) | Supported; stored as REAL |
| Regenerate over an edited stack | Confirm dialog: regenerating overwrites manual per-marker edits |
| Existing manual stack (no gen_* meta) | Opens Manual mode; gen_* stay NULL |
| Unit switch on the stack | Values are stored per the stack's `unit`; no implicit conversion of stored true weights |
| Very large count (e.g. 40) | Generation still O(n) trivial; UI preview virtualizes/caps sensibly |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Duplicate infra if reviewers unaware feature exists | — | High | Scope-correction banner at top; plan reuses `stack_calibrations`, adds no tables |
| Regenerate silently destroys manual edits | Med | Med | Explicit confirm dialog before overwrite |
| gen_* columns drift from actual calibrations after edits | Med | Low | Treat gen_* as advisory metadata only; `stack_calibrations` remains source of truth |
| Migration ordering bug ("no such column") | Low | High | Use `addColumnIfMissing` in phase 2 per `migrations.ts` contract; idempotency test |
| Import/export forgets new columns | Med | Med | AC + test asserting round-trip; update `import-export.ts` |

## Open Questions for Reviewers
1. **Persist gen_* metadata, or generate-and-forget?** Recommended: persist (enables
   re-generate + lossless export). Techlead: confirm the 3-column add is worth it vs. a
   pure one-shot generator with no schema change.
2. **Marker numbering:** confirm `generateCalibrations` should follow the exact convention
   `resolveMarker`/`pickMarker` expect (QD/Techlead to sanity-check against `stack-marker.ts`).

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
_Pending_
