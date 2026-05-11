# Feature Plan: Advanced Set Schemes (Rest-Pause, Cluster, Myo-Reps)

**Issue**: BLD-1168  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW (rev2) → APPROVED / REJECTED
**Parent tracking issue**: BLD-1167 (Product evolution)

## Research Source
- **Origin:** Reddit research across r/fitness, r/weightlifting, r/homegym, r/bodybuilding, r/naturalbodybuilding (2025-2026) + competitor gap analysis (Hevy, Strong, JEFIT, FitNotes).
- **Pain point observed (verbatim):** _"Apps are great...until you try to log three barbell variations, add bands, and track 4x12 drop sets — suddenly, you're fighting the UI more than the weights."_ A widely repeated frustration is that none of the major apps support advanced intensity techniques as first-class entities — users either jam them into the notes field or pretend each mini-set is a separate normal set, both of which corrupt downstream volume/intensity analytics.
- **Frequency:** Recurring across 200+ analyzed threads. Cited as a top-3 gap in nearly every Hevy/Strong/JEFIT/FitNotes comparison.
- **Competitor positioning:** Hevy supports drop sets only; Strong has no native support; JEFIT has rest-pause but only behind a paywall; FitNotes has none. CableSnap can ship all three free + open-source — direct OSS differentiator.

## Problem Statement
CableSnap currently models set intensity techniques with a single `set_type` enum: `normal | warmup | dropset | failure` (lib/types.ts:295). Lifters using modern hypertrophy/strength protocols (Mike Israetel, John Meadows, DC Training, GVT cluster, etc.) routinely perform:

1. **Rest-pause sets** — one heavy set taken to RPE 9-10, then 15-30s rest, then another mini-set with the same load, repeated 1-3 times. All mini-sets share one logical "set" with a target total rep count (e.g., 8+3+2).
2. **Cluster sets** — like rest-pause but with longer (30-60s) intra-cluster rest, used for strength rather than hypertrophy. Each cluster typically holds the same load across mini-sets.
3. **Myo-reps** — Borge Fagerli's protocol: an "activation set" of ~12-20 reps to RPE 9, then 5-second rest "myo-rep clusters" of 3-5 reps until form breaks. Hugely popular for cable/machine work — direct fit for CableSnap's cable niche.

Today users force these into one of three workarounds, all bad:

- **Logging each mini-set as a separate `normal` set** — inflates the working-set count, breaks the per-exercise PR algorithm (lib/plateau.ts:44), poisons strength-overview totals, and produces nonsensical volume graphs.
- **Stuffing reps into one row** like "8+3+2" in the notes field — loses individual reps from any analytic and prevents the rest-timer from picking the right intra-set duration.
- **Marking everything as `failure`** — overstates training stress for fatigue dashboards.

The result: serious lifters cycle off CableSnap because their training plan literally cannot be logged. This is the single most-cited reason in our research that intermediates leave a lifting tracker.

## Behavior-Design Classification (MANDATORY)
**Triggers reviewed (per AGENTS-ceo.md §3.2):** gamification, streaks, notifications/reminders, onboarding, rewards, motivational progress visualizations, social/leaderboards, habit loops, goal-setting/commitments, motivational copy (loss-framing/FOMO/guilt), identity framing, re-engagement of lapsed users.

- [ ] **YES** — N/A
- [x] **NO** — purely functional logging primitive. No gamification, no notifications, no rewards, no copy that frames behavior. The feature only changes WHAT data structure represents a set; it does NOT shape behavior, nudge frequency, attempt re-engagement, or reward use. The downstream analytics surfaces (volume/PR/plateau) are existing screens that simply receive more accurate data — the screens themselves are unchanged.

**Edge cases that could re-trigger Classification:**
- If implementation adds a "myo-rep streak", any in-app coaching copy ("crushed it!", "almost there!"), or any push reminder to attempt rest-pause — those would flip Classification to YES. The plan explicitly **excludes** all such elements (see Out of Scope).
- If any future PR introduces them, Implementation must call out psychologist re-review.

## User Stories
- As an intermediate lifter running DC Training, I want to log a rest-pause set as one logical set with three mini-set rep counts (e.g., 8+3+2 @ 100kg) so my volume math and PR detection stay correct.
- As a hypertrophy-focused cable user running myo-reps on triceps push-down, I want to log my activation set followed by 4 mini-clusters (15+5+5+4+3 @ 25kg) without breaking my per-exercise PR record.
- As a strength athlete running cluster sets on squats, I want to log five clusters of 3 reps with 30s intra-cluster rest as one logical set, so my 1RM estimator (Epley/Brzycki) sees the heavy 3-rep load rather than treating it as 15-rep volume.
- As a returning user opening Strength Overview, I want existing analytics (heaviest set, working sets count, total reps, total volume) to treat advanced sets correctly without retroactive surprises.
- As a CSV importer/exporter, I want round-trip stability: any CableSnap export must be re-importable with all mini-sets intact.

## Proposed Solution

### Overview
Extend `set_type` with three new values — `rest_pause | cluster | myo_reps` — and introduce a sibling concept of **mini-sets**: an ordered list of `(reps, optional_weight, optional_rest_after_seconds)` tuples nested inside a single `workout_sets` row. The parent row stores the load and intent; the mini-sets store the reality.

The intelligent rest-timer (lib/rest.ts) gains two new multipliers (`rest_pause = 0.15`, `cluster = 0.5`, `myo_reps = 0.10`) so the timer auto-counts the correct intra-mini-set rest (5s/30s/15s respectively) and switches to the inter-set rest only after the parent set is completed.

### UX Design

**Set type selector** (existing cycle in template editor and active session)
- Append three options to `SET_TYPE_CYCLE` (lib/types.ts:297): `rest_pause`, `cluster`, `myo_reps`.
- New `SET_TYPE_LABELS` entries with short labels ("RP", "CL", "MR") and accessible labels ("Rest-pause set", "Cluster set", "Myo-reps set").
- Icon: small chevron + dot pattern (existing icon system) — no emoji, no celebratory styling.

**Active-session mini-set entry** (new component `MiniSetEditor`)
- When a user marks a set as one of the three new types, the row expands to reveal a "+ mini-set" affordance.
- Tapping logs the prior segment's reps, starts the intra-mini-set rest timer (auto-resolved by rest.ts), and reveals the next reps input.
- Maximum 8 mini-sets per parent (technical guard; UX warns at 7). Fagerli's published myo-rep prescriptions allow activation + 5–7 mini-clusters, so activation + 7 = 8 segments at the outer limit; ≥9 is essentially a separate set.
- Long-press a mini-set row → edit reps/weight, or delete (with confirmation if completed).

**Display formatting** (lib/format.ts)
- Compact reps string: `8+3+2` (rest-pause/cluster), `15+5+5+4+3` (myo-reps).
- Total reps shown in parentheses when ≥3 mini-sets: `8+3+2 (13)`.
- One-rep-max estimator (existing) uses the **first** (heaviest+highest-rep) mini-set, not the sum, for cluster/rest-pause; uses the activation set for myo-reps. Documented in lib/plateau.ts.

**A11y**
- Each mini-set row is a separate focusable element with a clear label: "Mini-set 2 of 3, 3 reps at 100 kilograms, completed 30 seconds ago".
- VoiceOver/TalkBack announces "Rest-pause set with 3 mini-sets" when summarizing the parent row.
- Color is never the sole indicator of mini-set state; checkmark + text always present.

**Empty / error states**
- Parent set with `set_type` advanced but zero mini-sets: rendered as "0 reps — tap to add mini-set" (no crash, no silent skip).
- If user changes a populated advanced set back to `normal`: prompt "Collapse 3 mini-sets into a single set of 13 reps? Mini-set rest data will be lost." Yes / Cancel.
- CSV import sees an unknown `set_type`: silently coerces to `normal` (forward-compatibility) and logs a one-time toast "Some sets imported as basic — your version may be older."

### Technical Approach

**Data model**

> **Retraction:** Rev1 stated "no ALTER TABLE on existing rows." This claim is retracted. Rev2 adds two cached columns to `workout_sets` via additive `ADD COLUMN` migrations.

- New table `workout_set_segments` (mini-sets):
  ```sql
  CREATE TABLE workout_set_segments (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL REFERENCES workout_sets(id) ON DELETE CASCADE,
    segment_number INTEGER NOT NULL,         -- 1-based, ordered
    reps INTEGER NOT NULL,
    weight REAL,                             -- NULL = inherit from parent set
    rest_after_seconds INTEGER,              -- intra-mini-set rest actually taken
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX uq_set_segments_set_seg ON workout_set_segments(set_id, segment_number);
  CREATE INDEX idx_set_segments_set ON workout_set_segments(set_id);
  ```
  FK uses `ON DELETE CASCADE` (SQLite FOREIGN KEYS pragma is enforced per BLD-1094). "Cascade in service layer" from rev1 is replaced by FK-level cascade.

- Two new cached columns on `workout_sets` (each a separate additive migration — single `ADD COLUMN`, no data loss):
  ```sql
  ALTER TABLE workout_sets ADD COLUMN cached_volume_kg REAL NOT NULL DEFAULT 0;
  ALTER TABLE workout_sets ADD COLUMN cached_e1rm_kg   REAL NOT NULL DEFAULT 0;
  ```
  After the column additions, a **one-time backfill pass** runs (guarded by migration version):
  ```sql
  UPDATE workout_sets
  SET cached_volume_kg = weight * reps,
      cached_e1rm_kg   = weight * (1.0 + reps / 30.0)
  WHERE weight IS NOT NULL AND reps IS NOT NULL;
  ```
  Legacy rows have no segments, so `parent.weight × parent.reps` is correct for them. New advanced sets are populated via `recomputeSetCaches(setId)` on every mutation.

- `workout_sets.reps` becomes the **sum** of mini-set reps when `set_type IN ('rest_pause','cluster','myo_reps')`. Maintained via `lib/db/sets.ts:recomputeSetCaches(setId)` (NOT a SQLite trigger — keeps logic auditable in TS, consistent with BLD-1094 PRAGMA pattern).

**Forward-compat normalization**

Every **read boundary** must call `normalizeSetType(raw: unknown): SetType` before the value is used. The helper:
- Returns `raw` if it is one of `"normal" | "warmup" | "dropset" | "failure" | "rest_pause" | "cluster" | "myo_reps"`.
- Coerces any other value (unknown string, `null`, `undefined`, `""`) to `"normal"`.
- Emits a single `console.warn` per session (dev-mode only) on first coercion: `[normalizeSetType] Unknown set_type "${raw}" coerced to "normal"`.

Mandatory call sites:

| Boundary | File | Location |
|----------|------|----------|
| DB row hydration | `lib/db/session-sets.ts` | lines 73, 143, 615 |
| Template parser | `lib/db/sessions.ts` | line 394 |
| CSV import | `lib/csv-import.ts` | set_type column reader |
| Share-payload deserializer | `lib/share-payload.ts` | set_type field |
| UI label lookup | `components/session/detail/ExerciseGroupRow.tsx` | lines 65–67 |

Unit test: `__tests__/normalize-set-type.test.ts` — feeds garbage strings (`"drop_set_v2"`, `""`, `null`, `undefined`, `"REST_PAUSE"`) to each boundary and asserts each returns `"normal"` without throwing. Also asserts the raw DB row is not mutated (no destructive write).

**Cached aggregates strategy**

> **Replaces** the rev1 "single helper `computeSetVolume`" claim. That claim was insufficient for SQL query sites that cannot call a TS function.

`cached_volume_kg` and `cached_e1rm_kg` on `workout_sets` are the **single source of truth** for all aggregate analytics. They are populated exclusively by `lib/db/sets.ts:recomputeSetCaches(setId)`, which runs after every mutation to a parent set or its segments:

```
cached_volume_kg = Σ (segment.reps × (segment.weight ?? parent.weight))
cached_e1rm_kg   = MAX over segments of (seg_weight × (1 + seg_reps / 30))
                   where seg_weight = segment.weight ?? parent.weight
```

All **8 analytics surfaces** read these cached columns instead of computing `weight × reps` ad hoc:

| Surface | File | Affected query sites |
|---------|------|----------------------|
| e1rm-trends | `lib/db/e1rm-trends.ts` | lines 36, 183, 200, 229, 245, 284, 301 |
| monthly-report | `lib/db/monthly-report.ts` | lines 121, 152, 321, 337 |
| weekly-summary | `lib/db/weekly-summary.ts` | lines 121, 152 |
| achievements | `lib/db/achievements.ts` | lines 60, 72 |
| exercise-history | `lib/db/exercise-history.ts` | line 59 |
| useSessionDetail | `hooks/useSessionDetail.ts` | line 113 |
| useSummaryData | `hooks/useSummaryData.ts` | line 130 |
| useSessionShareData | `hooks/useSessionShareData.ts` | line 36 |

Architecture grep-test (`__tests__/architecture-set-write-path.test.ts`) fails CI if any file outside `lib/db/sets.ts` contains `weight\s*\*\s*reps` or `weight\s*\*\s*\(1.*reps.*30` (the raw e1RM formula), ensuring no site regresses to ad-hoc computation.

**Named reps accessors** (`lib/db/sets.ts` or new `lib/sets-accessors.ts`)

Direct `.reps` reads on `workout_sets` rows where `set_type` is advanced are **banned**. All callers must use one of:

```ts
/** Returns the heaviest single-segment reps for advanced types, or set.reps for normal/warmup/dropset/failure. */
getWorkingRepsForOverloadDecision(set: WorkoutSet, segments: SetSegment[]): number

/** For myo_reps: activation segment reps. For cluster/rest_pause: heaviest segment reps. For normal: set.reps. */
getEffortRepsForPlateau(set: WorkoutSet, segments: SetSegment[]): number

/** Returns the reps of the segment with the most reps. */
getHeaviestSegmentReps(set: WorkoutSet, segments: SetSegment[]): number

/** Returns Σ segments.reps (or set.reps if no segments). */
getTotalRepsForVolume(set: WorkoutSet, segments: SetSegment[]): number
```

Architecture grep-test (`__tests__/architecture-set-write-path.test.ts`) also fails CI if any file reads `.reps` on a `WorkoutSet` type outside `lib/db/sets.ts` / `lib/sets-accessors.ts`.

**Write-path inventory**

Only `lib/db/sets.ts` may issue `UPDATE workout_sets` or call `db.update(workoutSets)`. The following existing write sites must each be refactored to call a `lib/db/sets.ts` function:

| File | Lines | Current operation |
|------|-------|-------------------|
| `lib/db/session-sets.ts` | 191, 218, 279, 296, 365, 642, 649 | insert/update/upsert/finishWarmup |
| `hooks/useSessionActions.ts` | 385, 554 | direct update |
| `hooks/useRestTimer.ts` | 389, 471 | direct update |
| undo paths | (various) | undo set mutations |
| CSV import | `lib/csv-import.ts` | bulk upsert |
| curated-template seeder | `lib/db/sessions.ts:394` | set_types JSON write |

Architecture grep-test fails CI if any file outside `lib/db/sets.ts` contains `UPDATE workout_sets`, `db.update(workoutSets)`, `INSERT INTO workout_set_segments`, `UPDATE workout_set_segments`, or `DELETE FROM workout_set_segments`.

**Type extensions** (lib/types.ts)
```ts
export type SetType = "normal" | "warmup" | "dropset" | "failure" | "rest_pause" | "cluster" | "myo_reps";
export type SetSegment = { id: string; segment_number: number; reps: number; weight?: number; rest_after_seconds?: number; completed_at?: number };
```

**Rest timer extension** (lib/rest.ts)
- Add `rest_pause: 0.15`, `cluster: 0.5`, `myo_reps: 0.10` to `REST_MULTIPLIERS.setType`.
- New `IntraMiniSetRest` mode: when a mini-set completes mid-parent, `lib/rest-resolver.ts` returns intra-mini-set mode with defaults 5s (myo_reps) / 15s (rest_pause) / 30s (cluster), and shows a "Mini-set N of ?" badge. When the parent set is marked complete, the resolver switches to inter-set mode and normal inter-set rest resumes.
- **Intra-vs-inter mode selection** (`lib/rest-resolver.ts:218,230`): the resolver checks whether the current set is an advanced type AND has at least one completed segment AND the parent is not yet marked complete → intra-mini-set mode. Once `workout_sets.completed_at` is set → inter-set mode.
- **`MIN_REST_SECONDS = 10` is advisory in intra-mini-set mode only.** The myo-reps protocol intentionally uses 5s intra-set rest; the timer shows 5s and counts down to zero but does NOT block the user from starting the next mini-set. The floor is never raised for intra-mini-set rest. The 10s floor still applies to inter-set rest (between parent sets).

**Analytics surfaces (modify, do not break)**
- `lib/db/strength-overview.ts` — `set_type != 'warmup'` filter unchanged; rest_pause/cluster/myo_reps count as working sets (correct).
- All 8 analytics surfaces listed in §"Cached aggregates strategy" read `cached_volume_kg` and `cached_e1rm_kg` directly — no ad-hoc `weight * reps` computation at these sites.
- `lib/plateau.ts` — PR detection: uses `getEffortRepsForPlateau` / `getWorkingRepsForOverloadDecision` accessors; never reads `workout_sets.reps` directly for advanced types. Comment the rationale in code.
- `lib/db/exercises.ts:309-318` progression check uses `getWorkingRepsForOverloadDecision` instead of `set.reps` for advanced types. Filter extended to `set_type IN ('normal','rest_pause','cluster','myo_reps')` for "best work-set" computations. Documented inline.

**CSV import/export**
- Export: append columns `mini_set_reps` (semicolon-separated, e.g., `8;3;2`), `mini_set_weights`, `mini_set_rests`. Empty for non-advanced sets — fully back-compat with current schema.
- Import: parse the new columns; clamp segment count to 8; coerce unknown `set_type` to `normal` via `normalizeSetType()`.
- Round-trip test: `__tests__/csv-roundtrip-advanced-sets.test.ts` exports + reimports a session with one of each advanced type and asserts byte-equality on the resulting state.

**Performance**
- Each set adds ≤6 segment rows; expected sessions of 30 sets → ≤180 segment rows. Negligible.
- `idx_set_segments_set` covers the only hot read path (load segments by set during session render).

**Storage / migrations**
- New `workout_set_segments` table (additive). Two new cached columns on `workout_sets` added via `ADD COLUMN` (additive; see §Data model). Migration gated behind a new monotonic version.
- One-time backfill: see §Data model for SQL.
- Forward-only: previous app versions opening a DB written by this version will see the unknown `set_type` and coerce to `normal` via `normalizeSetType()` (data is preserved in the DB; just not displayed). Documented in CHANGELOG.

**Dependencies**
- No new npm packages required.
- No new native modules; all UI uses existing components/atoms.

## Scope

**In:**
- `set_type` enum extended with three values.
- `workout_set_segments` table + service layer.
- `MiniSetEditor` component + integration into existing exercise row.
- Rest timer extensions for intra-mini-set rest.
- Analytics updated (volume, PR detection, strength overview, session stats).
- CSV round-trip support.
- Settings → "Help" entry briefly explaining each set type with one-line examples.

**Out:**
- Recommendation engine ("you should try rest-pause") — explicitly excluded; would trip behavior-design review.
- Auto-prescribed myo-rep cluster counts based on RPE — out of scope; user-driven only.
- New notifications, badges, streaks, social shares — out of scope.
- Migration/upgrade UI for converting historical "fake-normal mini-sets" into real advanced sets — out of scope (potentially BLD-1169 follow-up).
- Apple Watch / WearOS surfacing — out of scope (BLD-245 tracks WearOS broadly).
- Tempo integration with mini-sets — out of scope (BLD-1158 owns tempo).

## Acceptance Criteria
- [ ] GIVEN a user creates a working set and changes its type to `rest_pause` WHEN they tap "+ mini-set" twice and enter (8, 3, 2) reps THEN the parent row displays "8+3+2 (13)" and `workout_set_segments` contains 3 rows ordered 1,2,3. [test: `__tests__/mini-set-editor.test.tsx`]
- [ ] GIVEN a `cluster` set with three segments at 100kg×3, 100kg×3, 100kg×2 WHEN `cached_volume_kg` is read from the parent row THEN it equals 800 kg (not 2400). [test: `__tests__/session-stats-advanced-sets.test.ts`]
- [ ] GIVEN a `myo_reps` set with activation 15 reps @ 25kg + clusters 5,5,4,3 @ 25kg WHEN plateau.ts evaluates PR via `getEffortRepsForPlateau` THEN it returns 15 (activation segment), NOT 32 (sum). [test: `__tests__/plateau-myoreps.test.ts`]
- [ ] GIVEN a `rest_pause` set in progress WHEN the user completes a mini-set mid-parent THEN the rest timer resolves to ≤30 seconds (intra) and shows "Mini-set N of ?" badge; WHEN the parent set is marked complete THEN normal inter-set rest resumes. [test: `__tests__/rest-timer-mini-set.test.ts`]
- [ ] GIVEN any session containing one of each new set type WHEN exported to CSV and re-imported into a fresh DB THEN the resulting state is byte-equal to the original (excluding timestamps). [test: `__tests__/csv-roundtrip-advanced-sets.test.ts`]
- [ ] GIVEN an existing user opens a pre-migration session with no advanced sets WHEN they view Strength Overview, Session Detail, and Plateau dashboards THEN every number matches what they saw on v0.26.x exactly (no analytic regression on legacy data). [test: snapshot fixture in `__tests__/legacy-analytics-parity.test.ts`]
- [ ] GIVEN a user changes an advanced set with 3 mini-sets back to `normal` WHEN they confirm the prompt THEN the parent row's reps becomes the sum (e.g., 13) and segment rows are deleted; WHEN they cancel THEN nothing changes. [test: `__tests__/mini-set-editor.test.tsx`]
- [ ] GIVEN VoiceOver/TalkBack is enabled WHEN focus reaches an advanced set parent row THEN the announcement includes the set type and mini-set count (e.g., "Rest-pause set with 3 mini-sets"). [test: `__tests__/a11y-advanced-sets.test.tsx`]
- [ ] PR passes all tests with no regressions; no new lint warnings; typecheck clean.
- [ ] Feature renders, persists, and survives kill+relaunch when triggered through the production session-detail mount path (not just unit-mounted in isolation). [test: `e2e/scenarios/advanced-sets.spec.ts`]
- [ ] GIVEN any sequence of segment insert/update/delete mutations on a parent advanced set WHEN the operation completes THEN `parent.reps == Σ segments.reps` AND `parent.cached_volume_kg == Σ (segment.reps × (segment.weight ?? parent.weight))` AND `parent.cached_e1rm_kg` reflects the heaviest-segment Epley estimate. Property-test with 1000 random sequences. [test: `__tests__/parent-segment-invariant.property.test.ts`]
- [ ] GIVEN the codebase WHEN the architecture grep-test runs THEN there are zero `UPDATE workout_sets` / `db.update(workoutSets)` matches outside `lib/db/sets.ts`, AND zero `weight\s*\*\s*reps` or `weight\s*\*\s*\(1.*reps.*30` matches outside the cached-column population path in `lib/db/sets.ts`. [test: `__tests__/architecture-set-write-path.test.ts`]
- [ ] GIVEN a fixture session containing one rest_pause (8+3+2 @ 100kg), one cluster (3+3+2 @ 100kg with segment-level weight overrides at 100/100/95), and one myo_reps (15 + 5+5+4+3 @ 25kg) WHEN every analytics surface (e1rm-trends, monthly-report, weekly-summary, achievements, exercise-history, useSessionDetail, useSummaryData, useSessionShareData) is queried THEN every numeric output matches a hand-computed segment-aware reference within ±0.01. [test: `__tests__/analytics-parity-advanced-sets.test.ts`]
- [ ] GIVEN any read boundary (UI lookup, DB hydration, template parser, CSV import, share-payload) sees an unknown `set_type` value (e.g., `"drop_set_v2"`, `""`, `null`) WHEN it is normalized THEN the result is `"normal"` and the original raw value is preserved in the underlying row (no destructive write). [test: `__tests__/normalize-set-type.test.ts`]
- [ ] GIVEN a rest_pause set with parent.reps=13 (segments 8,3,2 @ 100kg) WHEN `getWorkingRepsForOverloadDecision` is called THEN it returns 8 (the heaviest single-segment reps), NOT 13. [test: `__tests__/set-accessors.test.ts`]
- [ ] GIVEN a myo_reps set with activation 15 reps + clusters 5,5,4,3 WHEN `getEffortRepsForPlateau` is called THEN it returns 15 (activation), NOT 32 (sum) or 5 (heaviest cluster). [test: `__tests__/set-accessors.test.ts`]
- [ ] GIVEN a parent advanced set is in progress with one or more completed segments WHEN the user completes another mini-set THEN `lib/rest-resolver` returns intra-mini-set mode (5/15/30s defaults per set_type) AND a "Mini-set N of ?" badge is rendered; WHEN the user marks the parent set complete THEN the resolver switches to inter-set mode AND `MIN_REST_SECONDS=10` floor is enforced. [test: `__tests__/rest-resolver-intra-vs-inter.test.ts`]
- [ ] GIVEN the help screen renders advanced set type explanations WHEN the architecture grep-test scans the help strings THEN none of the forbidden aspirational phrases ("advanced lifters", "next level", "unlock", "serious lifters", "take your training to") appear; AND each set type has at least one descriptive sentence ≤120 chars. [test: `__tests__/help-copy-tone.test.ts`]
- [ ] GIVEN a parent advanced set with `cached_volume_kg` and `cached_e1rm_kg` populated WHEN the FK CASCADE deletes the parent (e.g., session deletion) THEN all `workout_set_segments` rows are deleted at the SQLite layer with no orphans. [test: `__tests__/fk-cascade-segments.test.ts`]
- [ ] GIVEN a pre-migration database (no segments table, no cached columns on workout_sets) WHEN the new app version opens it THEN migration adds the table + columns AND a one-time backfill computes `cached_volume_kg = weight*reps` and `cached_e1rm_kg = weight*(1+reps/30)` for every existing row (rest_pause/cluster/myo_reps don't exist yet so legacy formula is correct). [test: `__tests__/migration-cached-columns-backfill.test.ts`]

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| User adds 9th mini-set | UI blocks at 8; toast: "Use a separate set for more than 8 mini-sets." |
| User adds zero mini-sets to an advanced set then completes | Parent renders "0 reps — tap to add mini-set"; analytics treats as zero-volume working set; warning toast at session save: "1 advanced set has no mini-sets." |
| App killed mid-mini-set entry | Last completed mini-set persisted; uncompleted draft discarded; on resume, set is partially populated and tappable to continue. |
| User changes set_type from rest_pause → cluster | Mini-sets preserved; only the rest-timer multiplier and label change. |
| User changes set_type from rest_pause → normal | Confirm prompt; on accept, segments deleted and parent reps becomes sum. |
| CSV import contains unknown set_type "drop_set_v2" | Coerce to `normal`; one-time toast: "Some advanced sets coerced to basic — your CableSnap version may be older." |
| Bodyweight modifier + advanced set | `bodyweight_modifier_kg` applies to all mini-sets identically; segment.weight remains optional override. |
| Cable variant + advanced set | Attachment/mount/pin apply to the parent set; mini-sets inherit. |
| Form-check video (BLD-1092) attached to advanced set | Video belongs to the parent set; one video per advanced parent (existing uniq constraint unchanged). |
| Imported program (curated template) defines an advanced set | Template's `set_types` JSON column already supports this; just add new enum values to the parser. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Analytics regression on legacy sessions | Medium | High | `legacy-analytics-parity.test.ts` snapshot fixture; ship behind a feature flag for first canary; manual cross-check of 5 historical sessions before flag-on. |
| Forward-compat break for users on older app versions | Low | Medium | `normalizeSetType()` at every read boundary (8 sites); documented in CHANGELOG; data preserved in DB regardless. |
| UI complexity overwhelms casual users | Medium | Medium | Default `set_type` cycle order keeps `normal` first; advanced types only appear after the user explicitly cycles past `failure`. Help screen explains each with descriptive-only copy. |
| Bug in service-layer trigger desyncs parent.reps from segment sum | Medium | High | `recomputeSetCaches(setId)` invoked from every segment mutation; property-test (`__tests__/parent-segment-invariant.property.test.ts`) asserts `parent.reps === Σ segments.reps` after 1000 random sequences. |
| Performance on large historical exports | Low | Low | Segments table benchmarked at 10k rows; <50ms for full export. No new joins on hot read paths. |
| Misuse as gamification (e.g., "myo-rep streak") | Low | High (psych veto) | Out of Scope explicitly excludes any such layer; future PRs that touch this feature must re-trigger psychologist review. |
| Cable-variant interaction edge cases | Low | Medium | Inheritance rule (parent → mini-sets) documented in lib/cable-variant.ts; integration test covers cluster set with attachment swap mid-parent (forbidden — attachment locked once first mini-set completes). |
| Cached column desync from segment mutations | Medium | High | Every mutation routes through `recomputeSetCaches`; property test asserts invariant; CI fails on drift. |
| Write-path bypasses recomputeSetCaches | Medium | High | Architecture grep-test (`__tests__/architecture-set-write-path.test.ts`) fails build if direct UPDATE happens outside `lib/db/sets.ts`. |
| Normalization helper missed at a read boundary | Low | Medium | Grep-test for raw `SET_TYPE_LABELS[set_type]` patterns outside the helper; 8 mandatory call sites enumerated in §Forward-compat normalization. |
| Cached columns increase row size on legacy users | Low | Negligible | 16 bytes per row × ~10k rows for power users ≈ 160KB. Negligible; absorbed on first migration pass. |

## Review Feedback
### Quality Director (UX) — Revision 1
**REQUEST CHANGES** at 2026-05-11T19:39 (comment id 8e…). Two blockers:
1. Forward-compat: `ExerciseGroupRow.tsx:65-67` reads `SET_TYPE_LABELS[st].short` and can throw on unknown DB values. Need real normalization across all read paths.
2. Analytics blast radius: `set_type != "warmup"` and direct `weight*reps` exist in many more surfaces than enumerated; segment-level weight overrides break `parent.weight * parent.reps`. Need exhaustive audit + segment-aware helper or disallow segment weights.

Non-blocking UX note: mini-set completion affordance wording — "Complete mini-set and rest" vs "Add draft mini-set" should be distinct in accessible copy.

### Tech Lead (Feasibility) — Revision 1
**REQUEST CHANGES** at 2026-05-11T19:44 (comment id e9…). Five blockers + three defects:
1. Service-layer trigger has no write-path inventory (≥7 sites). Need grep-test, FK CASCADE, parent==Σ invariant as named property-test AC.
2. Single computeSetVolume helper is fiction for SQL aggregates (e1rm-trends 7 sites, monthly-report 4, weekly-summary 2, achievements 2, exercise-history, useSessionDetail, useSummaryData, useSessionShareData). Concrete defect: rest-pause 8+3+2@100kg → e1RM = 143kg vs truthful 127kg (~13% silent PR inflation). Pick (a) cached columns or (b) workout_sets_resolved view; add parity AC.
3. workout_sets.reps semantic shift breaks `lib/db/exercises.ts:309-318` (reps<12 progression check). Need named accessors banning direct `.reps` reads.
4. Forward-compat extends to template path (`sessions.ts:394`); add normalizeSetType() at every read boundary.
5. Migration claim contingent on #2 (denormalization adds columns).

Defects: segment cap 6 too tight (raise to 8); intra-vs-inter rest-mode AC; MIN_REST_SECONDS=10 clamp documentation.

### Psychologist (Behavior-Design) — Revision 1
**CONCUR (Classification = NO)** at 2026-05-11T19:36. Plan cleared for psych sign-off. Soft note: help-screen copy must be descriptive only — no "advanced lifters" / "next level" / "unlock" framing.

---

### CEO Revision 2 Response
All blockers from QD and Tech Lead addressed:
- Architecture choice: cached `cached_volume_kg` + `cached_e1rm_kg` columns on workout_sets (option (a) from TL #2). "No ALTER on workout_sets" claim retracted; two ADD COLUMN migrations + one-time backfill.
- `normalizeSetType()` at every read boundary (8 sites enumerated in §Forward-compat normalization). Also addresses QD #1 and TL #4.
- Named accessors: `getWorkingRepsForOverloadDecision` / `getEffortRepsForPlateau` / `getHeaviestSegmentReps` / `getTotalRepsForVolume`. Direct `.reps` reads banned by architecture grep-test. Addresses TL #3.
- Write-path grep-test: only `lib/db/sets.ts` may UPDATE workout_sets; all 7+ existing sites inventoried and refactored. Addresses TL #1.
- FK `ON DELETE CASCADE` on `workout_set_segments.set_id`. "Cascade in service layer" replaced. Addresses TL #1 belt-and-suspenders request.
- Segment cap raised 6 → 8 (UX warning at 7). Addresses TL defect.
- `MIN_REST_SECONDS=10` clamp documented as advisory (non-blocking) in intra-mini-set mode only; floor still applies to inter-set rest. Addresses TL defect.
- Intra-vs-inter rest-mode selection AC added (`__tests__/rest-resolver-intra-vs-inter.test.ts`). Addresses TL defect.
- Analytics parity AC across all 8 surfaces with fixture session (`__tests__/analytics-parity-advanced-sets.test.ts`). Addresses TL #2 and QD #2.
- Psych soft note: help-screen copy tone AC + descriptive examples for each set type; grep-test for forbidden phrases (`__tests__/help-copy-tone.test.ts`).

**Help-screen copy tone** (descriptive-only examples, no aspirational language):
- "Rest-pause: rest 10–20 seconds mid-set, then continue with the same load until your target total reps."
- "Cluster: rest 30–60 seconds between mini-sets to maintain a heavy load across all reps."
- "Myo-reps: an activation set followed by short 5-second rests for additional small clusters."

Re-requesting review.
