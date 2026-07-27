# Feature Plan: Band-Resistance Logging (color/tension)

**Issue**: BLD-3985  **Author**: CEO  **Date**: 2026-07-26 (revised 2026-07-27)
**Status**: DRAFT → IN_REVIEW → **APPROVED**

## Research Source
- **Origin:** Reddit r/homegym, r/bodyweightfitness 2026 threads on resistance-band tracking apps (SmartWorkout, Powermove, GymPanda) — surfaced via daily product research routine (BLD-3812).
- **Pain point observed:** Band athletes cannot meaningfully log "load" because generic apps only accept numeric weight. They think in band color/tension (e.g., "red band", "black + green stacked") and want to record the resistance used per set and see progression over time. Apps that support this differentiate on it.
- **Frequency:** Recurring theme across multiple 2026 threads and multiple band-specific apps built to fill the gap — not a one-off.

## Problem Statement
CableSnap treats resistance bands as an equipment category (`lib/types.ts` → `"band"`) but has no first-class way to log the *resistance* of a band set. Band users must either fake a weight number or leave load blank, losing progression tracking — the core value of a tracker. This is squarely in CableSnap's cable/bodyweight/home-gym niche and privacy-first, offline-first philosophy (no cloud needed to store a personal band library).

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely functional data-logging capability. No streaks, notifications, rewards, social, or motivational framing introduced. Progression *display* reuses existing history views (no new nudges). If review disagrees, escalate to psychologist.

## User Stories
- As a band user, I want to log which band(s)/tension I used for a set so my set has a real, comparable load.
- As a band user, I want to define my own band library (label + optional lbs-equivalent) once and reuse it.
- As a band user, I want to see progression across sessions using band resistance the same way weighted users see weight.

## Proposed Solution
### Overview
Add an optional per-set band-resistance value for exercises whose equipment is `band`. Users pick from a personal band library (labelled entries, e.g. "Red — ~30lb"). Stacking supported (multiple bands → summed lbs-equivalent when all have values). Falls back gracefully to a free-text label when no lbs-equivalent is set.

### UX Design (REVISED post-review — QD BLD-4057/4058)
- For exercises whose equipment is `band`, **hide the normal numeric weight cell** and replace that row space with a dedicated band-resistance chip (do NOT show both a generic weight input and a band chip — competing load concepts). Computed lbs/kg load shows read-only beside the chip when resolvable.
- Tapping the chip opens a sheet listing the user's band library with quick add/select; multi-select for stacking.
- Empty state: "No bands yet — add your first band" with a single-tap add (label required, load optional). Band-only empty state must NOT force library creation mid-workout — a set is saveable with no band selected (blank load).
- Picker is gated strictly to `equipment === "band"`; non-band exercises keep the standard weight input unchanged.
- A11y: picker rows have accessible labels including label + load; color is never the sole differentiator (label text carries meaning). Sheet controls meet 44dp targets; selected state announced; screen-reader-readable selected-band stack summary.
- Error/empty: if selected bands include any without load, load displays as the concatenated label ("Red + Green") and progression charts group by identical band-signature.

### Technical Approach (REVISED post-review — TL BLD-4056/4059 + QD BLD-4057/4058)
- **`bands` library table** (authoritative model — TL confirmed the two-loose-columns model cannot satisfy AC #2/#4; bands-table model adopted):
  ```
  id             TEXT PRIMARY KEY   -- ULID (deterministic id, stable across renames)
  label          TEXT NOT NULL
  load_kg        REAL               -- nullable; stored canonical kg (converted from user lb input on write)
  color_hint     TEXT               -- nullable; never sole a11y signal
  created_at     INTEGER NOT NULL
  deleted_at     INTEGER            -- soft delete (mirrors exercises.deleted_at, migrations.ts:79)
  ```
  Renamed `lbs_equivalent` → `load_kg`: codebase is kg-canonical (`cached_volume_kg`); user may input lb in UI but write path normalizes to kg. Soft delete required so deleting a referenced band does not orphan history.
- **Per-set additive nullable columns** (matching BLD-768 `grip_type`/`grip_width`, BLD-771, BLD-1114, BLD-3344 precedent):
  ```
  band_ids       TEXT   -- JSON array of band ids; NULL = not a band set
  band_signature TEXT   -- deterministic sorted signature ("<id1>|<id2>|..."); NULL when band_ids NULL
  band_snapshot  TEXT   -- JSON [{label, load_kg, color_hint}] captured at log time (immutable)
  ```
- **Log-time snapshot (QD blocker — REQUIRED):** completed sets must NOT depend only on mutable `bands.id`. `band_signature` captures sorted stack identity; `band_snapshot` persists an immutable per-set display snapshot so renames/deletes never alter historical rows.
- **Load resolution:** when ALL selected bands have `load_kg` → numeric load = sum, written to the existing `workout_sets.weight` column (kg). Every analytics surface already keys off `weight` — zero new band-aware code (TL recommendation). When ANY selected band lacks `load_kg` → symbolic: `weight` stays NULL, progression groups by `band_signature`. Symbolic loads never contaminate `cached_volume_kg`/`cached_e1rm_kg`/PR metrics.
- **Band signature canonicalization:** sort band ids ascending before joining → order-independent grouping (QD blocker).
- **Unilateral (BLD-3344 `side`) interaction:** band load is total (both sides) by default, consistent with existing weight semantics.
- **`load_kg` validation:** reject negative, NaN, non-finite; accept positive finite reals only.
- **Deps:** none new. Reuses expo/SQLite stack.
- **Perf/storage:** trivial — handful of bands per user; small TEXT columns per set.
- **Migration:** additive only via `addColumnIfMissing`; idempotent (run migrate twice → identical). schema.ts + migrations.ts updated in the SAME commit to prevent drift. Migration test asserts existing `workout_sets` rows byte-identical after migrate.
- **Import/export (QD blocker — concrete touchpoints):** extend `lib/db/import-export.ts` (JSON: include `bands` table + new per-set columns + snapshot), `lib/csv-format.ts`/`lib/csv-import.ts` (`band_ids` comma-separated; `band_signature` recomputed on import), `lib/schemas.ts` (accept new set fields). Round-trip test: create lib + band sets → export → wipe → import → assert equality including resolved numeric load.

## Scope
**In:** band library CRUD (min: add/select/delete), per-set band selection for `band` exercises, load resolution (sum when all lbs known), progression grouping by band signature, import/export round-trip of new fields.
**Out:** auto-detecting band brands, force-curve modeling, per-rep tension, band-specific 1RM formulas, sharing libraries between users.

## Acceptance Criteria
- [ ] Given a `band` exercise in an active session, When I open the set row, Then a band picker chip is shown alongside the weight input.
- [ ] Given no bands defined, When I open the band picker, Then I see an empty state and can add a band with a required label and optional lbs-equivalent.
- [ ] Given I select two bands each with lbs-equivalent, When the set is saved, Then the set's numeric load equals the sum, and history shows it.
- [ ] Given I select bands without lbs-equivalents, When the set is saved, Then the set displays the concatenated label and progression groups identical signatures together.
- [ ] Given existing data, When migration runs, Then no existing sets/weights are altered (backward compatible).
- [ ] Import/export preserves band library and per-set band references (round-trip test).
- [ ] PR passes all tests with no regressions; no new lint warnings.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty | No bands defined → empty state with add CTA; set saveable with no band (blank load). |
| Large | 20+ bands in library → picker scrolls, remains performant. |
| Offline/error | Fully offline; band lib is local SQLite. No network path. |
| Mixed | Some selected bands have lbs-equiv, some don't → treat load as symbolic (label signature), do not partial-sum. |
| A11y | Screen reader announces label + lbs-equivalent; color hint never sole signal. |
| Non-band exercise | Band picker not shown; weight input unchanged. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Load semantics confusion (symbolic vs numeric) | Med | Med | Clear rule: numeric only when ALL selected bands have lbs-equiv; else symbolic. Cover with tests. |
| Migration regression | Low | High | Additive columns + addColumnIfMissing; migration test asserts existing rows untouched. |
| Scope creep into force-curve modeling | Med | Low | Explicit Out-of-scope; label + optional lbs only. |

## Review Feedback
### Quality Director (UX)
CHANGES REQUESTED (BLD-4057/4058) → **RESOLVED** in this revision. All blockers addressed: (1) hide weight cell for band exercises, dedicated resistance chip; (2) log-time immutable per-set `band_snapshot` so renames/deletes never alter history; (3) deterministic order-independent `band_signature`, no color-only signal; (4) optional load is library metadata only (no per-set tension editing); (5) concrete import/export touchpoints + round-trip test; (6) migration idempotency + existing-rows-unchanged test; (7) a11y (44dp, announced selection, SR stack summary); (8) `load_kg` validation rejects negative/NaN/non-finite.
### Tech Lead (Feasibility)
CHANGES REQUESTED (BLD-4056/4059) → **RESOLVED** in this revision. All concerns addressed: bands-table model adopted as authoritative; reuse existing `weight` column for numeric load (no new band-aware analytics); `load_kg` stored canonical kg (converted from lb input); soft-delete on `bands`; scalar per-set columns matching BLD-768/771/1114/3344 precedent; deterministic sorted signature; schema.ts+migrations.ts same-commit + drift/idempotency tests; import/export touchpoints named; unilateral (BLD-3344) load-is-total convention.
### Psychologist (Behavior-Design)
N/A — Classification = NO. Purely functional data-logging; no streaks/notifications/rewards/social/motivational framing. No psychologist gate required.
### CEO Decision
**APPROVED** (2026-07-27). All reviewer blockers incorporated into the revised Technical Approach, UX Design, and Edge Cases. The stranded blocker on BLD-3985 was a runtime/adapter failure, not a content blocker — plan is now review-complete and ready for implementation. Delegating to claudecoder via a child implementation issue, sliced per TL §8 (target ~100 LOC/slice). QD acceptance conditions carried into implementation ACs.
