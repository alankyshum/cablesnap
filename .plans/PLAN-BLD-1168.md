# Feature Plan: Advanced Set Schemes (Rest-Pause, Cluster, Myo-Reps)

**Issue**: BLD-1168  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
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
- Maximum 6 mini-sets per parent (technical guard; UX warns at 5). DC training and myo-reps both fit comfortably under this cap; ≥7 is essentially a separate set.
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
- New table `workout_set_segments` (mini-sets):
  ```sql
  CREATE TABLE workout_set_segments (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL,                    -- FK → workout_sets.id (cascade in service layer)
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
- `workout_sets.reps` becomes the **sum** of mini-set reps when `set_type IN ('rest_pause','cluster','myo_reps')`. Maintained via a service-layer trigger in lib/db/sets.ts (NOT a SQLite trigger — keeps logic auditable in TS, consistent with BLD-1094 PRAGMA pattern).
- Migration: additive only — existing sets keep the empty segments list and behave identically.

**Type extensions** (lib/types.ts)
```ts
export type SetType = "normal" | "warmup" | "dropset" | "failure" | "rest_pause" | "cluster" | "myo_reps";
export type SetSegment = { id: string; segment_number: number; reps: number; weight?: number; rest_after_seconds?: number; completed_at?: number };
```

**Rest timer extension** (lib/rest.ts)
- Add `rest_pause: 0.15`, `cluster: 0.5`, `myo_reps: 0.10` to `REST_MULTIPLIERS.setType`.
- New `IntraMiniSetRest` mode: when a mini-set completes mid-parent, the timer resolves intra-rest (5s/15s/30s defaults) and shows a "Mini-set 3 of ?" badge. When the parent set completes, normal inter-set rest resumes.
- Preserve `MIN_REST_SECONDS = 10` as a floor for safety even on aggressive myo-reps (i.e., 5s default ceil-clamps up to 10s minimum).

**Analytics surfaces (modify, do not break)**
- `lib/db/strength-overview.ts` — `set_type != 'warmup'` filter unchanged; rest_pause/cluster/myo_reps count as working sets (correct).
- `lib/db/session-stats.ts` — total volume = `Σ (segment.reps × (segment.weight ?? parent.weight))` for advanced types; Σ (parent.reps × parent.weight) otherwise. Single helper `computeSetVolume(set, segments)` consumed everywhere — single point of change.
- `lib/plateau.ts` — PR detection: for cluster/rest-pause, evaluate the heaviest segment by `weight × reps`. For myo-reps, evaluate the activation segment only. Comment the rationale in code.
- `lib/db/exercises.ts:314,329` queries (`set_type = 'normal'`) become `set_type IN ('normal','rest_pause','cluster','myo_reps')` for "best work-set" computations. Documented inline.

**CSV import/export**
- Export: append columns `mini_set_reps` (semicolon-separated, e.g., `8;3;2`), `mini_set_weights`, `mini_set_rests`. Empty for non-advanced sets — fully back-compat with current schema.
- Import: parse the new columns; clamp segment count to 6; coerce unknown `set_type` to `normal`.
- Round-trip test: `__tests__/csv-roundtrip-advanced-sets.test.ts` exports + reimports a session with one of each advanced type and asserts byte-equality on the resulting state.

**Performance**
- Each set adds ≤6 segment rows; expected sessions of 30 sets → ≤180 segment rows. Negligible.
- `idx_set_segments_set` covers the only hot read path (load segments by set during session render).

**Storage / migrations**
- New table only; no ALTER TABLE on existing rows. Migration in lib/db/migrations.ts gated behind a new monotonic version.
- Forward-only: previous app versions opening a DB written by this version will see the unknown `set_type` and coerce to `normal` (data is preserved in the DB; just not displayed). Documented in CHANGELOG.

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
- [ ] GIVEN a `cluster` set with three segments at 100kg×3, 100kg×3, 100kg×2 WHEN session-stats computes total volume THEN it returns 800 kg (3+3+2 × 100), not 2400 (8 × 100 × 3). [test: `__tests__/session-stats-advanced-sets.test.ts`]
- [ ] GIVEN a `myo_reps` set with activation 15 reps @ 25kg + clusters 5,5,4,3 @ 25kg WHEN plateau.ts evaluates PR THEN it considers only the 15-rep activation segment, NOT the 28-rep sum. [test: `__tests__/plateau-myoreps.test.ts`]
- [ ] GIVEN a `rest_pause` set in progress WHEN the user completes a mini-set mid-parent THEN the rest timer resolves to ≤30 seconds (intra) and shows "Mini-set N of ?" badge; WHEN the parent set is marked complete THEN normal inter-set rest resumes. [test: `__tests__/rest-timer-mini-set.test.ts`]
- [ ] GIVEN any session containing one of each new set type WHEN exported to CSV and re-imported into a fresh DB THEN the resulting state is byte-equal to the original (excluding timestamps). [test: `__tests__/csv-roundtrip-advanced-sets.test.ts`]
- [ ] GIVEN an existing user opens a pre-migration session with no advanced sets WHEN they view Strength Overview, Session Detail, and Plateau dashboards THEN every number matches what they saw on v0.26.x exactly (no analytic regression on legacy data). [test: snapshot fixture in `__tests__/legacy-analytics-parity.test.ts`]
- [ ] GIVEN a user changes an advanced set with 3 mini-sets back to `normal` WHEN they confirm the prompt THEN the parent row's reps becomes the sum (e.g., 13) and segment rows are deleted; WHEN they cancel THEN nothing changes. [test: `__tests__/mini-set-editor.test.tsx`]
- [ ] GIVEN VoiceOver/TalkBack is enabled WHEN focus reaches an advanced set parent row THEN the announcement includes the set type and mini-set count (e.g., "Rest-pause set with 3 mini-sets"). [test: `__tests__/a11y-advanced-sets.test.tsx`]
- [ ] PR passes all tests with no regressions; no new lint warnings; typecheck clean.
- [ ] Feature renders, persists, and survives kill+relaunch when triggered through the production session-detail mount path (not just unit-mounted in isolation). [test: `e2e/scenarios/advanced-sets.spec.ts`]

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| User adds 7th mini-set | UI blocks at 6; toast: "Use a separate set for more than 6 mini-sets." |
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
| Forward-compat break for users on older app versions | Low | Medium | Coerce unknown set_type to `normal`; documented in CHANGELOG; data preserved in DB regardless. |
| UI complexity overwhelms casual users | Medium | Medium | Default `set_type` cycle order keeps `normal` first; advanced types only appear after the user explicitly cycles past `failure`. Help screen explains each. |
| Bug in service-layer "trigger" desyncs parent.reps from segment sum | Medium | High | Single helper `recomputeParentReps(setId)` invoked from every segment mutation; property-test asserts `parent.reps === Σ segments.reps` after random sequences of insert/delete/update. |
| Performance on large historical exports | Low | Low | Segments table benchmarked at 10k rows; <50ms for full export. No new joins on hot read paths. |
| Misuse as gamification (e.g., "myo-rep streak") | Low | High (psych veto) | Out of Scope explicitly excludes any such layer; future PRs that touch this feature must re-trigger psychologist review. |
| Cable-variant interaction edge cases | Low | Medium | Inheritance rule (parent → mini-sets) documented in lib/cable-variant.ts; integration test covers cluster set with attachment swap mid-parent (forbidden — attachment locked once first mini-set completes). |

## Review Feedback
### Quality Director (UX)
**REQUEST CHANGES (2026-05-11):**

1. **Blocker — forward-compat / unknown `set_type` claim is unsafe.** The plan says older app versions will coerce unknown `set_type` values to `normal` (§129, §174), but current display paths are not defensive enough to make that true. Example: `components/session/detail/ExerciseGroupRow.tsx` indexes `SET_TYPE_LABELS[st]` and immediately reads `label.short`; an unknown DB value such as `rest_pause` in an older build can throw instead of rendering as normal. Revise the plan to either (a) state downgrade is unsupported and protect current-version import/display code with explicit `normalizeSetType` guards, or (b) specify a real compatibility layer that every DB/template/import read path uses before UI access. Do not rely on a future enum extension to protect already-shipped app versions.
2. **Blocker — analytics blast radius is under-enumerated.** The plan lists `strength-overview`, `session-stats`, `plateau`, and two `exercises.ts` queries, but a grep of the current codebase shows many more working-set and PR/volume surfaces using `set_type != 'warmup'` or direct `weight * reps` math: `e1rm-trends`, `monthly-report`, `achievements`, `exercise-history`, `pr-dashboard`, `hooks/useSummaryData.ts`, `hooks/useSessionDetail.ts`, and `hooks/useSessionActions.ts`. Because the new segment model allows per-segment `weight`, parent `weight * parent.reps` is wrong whenever segment weights differ. Add an AC requiring an exhaustive source audit plus tests proving every analytics/export/summary/PR surface either uses the shared segment-aware helper or intentionally rejects segment-level weight overrides.
3. **Non-blocking UX note — mini-set completion affordance needs sharper wording.** "`+ mini-set` logs the prior segment's reps" combines add, complete, and rest-start semantics into one control. For zero-friction logging, implementation should make the committed state explicit in accessible copy, e.g. "Complete mini-set and rest" versus "Add draft mini-set", so users do not accidentally start an intra-set rest timer.

The feature direction is strong and the production-path, a11y, CSV round-trip, and legacy-parity ACs are the right shape. I will approve after the two data-integrity blockers above are reflected in the plan.

### Tech Lead (Feasibility)
**REQUEST CHANGES (2026-05-11):**

Direction is sound — additive table, single-helper volume, intra-mini-set rest, CSV columns are all defensible. But several feasibility/architecture defects must land in the plan before claudecoder picks this up. Concurs with QD blockers #1 and #2; adds the following:

1. **Blocker — service-layer "trigger" is unsafe without a write-path inventory.** The plan picks a TS-level `recomputeParentReps(setId)` over a SQLite trigger, citing BLD-1094 PRAGMA pattern. That's defensible, but it only works if **every** mutation path for `workout_set_segments` and `workout_sets.reps` routes through the helper. Today, set writes happen from at least: `lib/db/session-sets.ts` (insert/update/upsert/finishWarmup at lines 191/218/279/296/365/642/649), `hooks/useSessionActions.ts` (385, 554), `hooks/useRestTimer.ts` (389, 471), undo paths, CSV import, and the curated-templates seeder (`lib/db/sessions.ts:394` writes `set_types` JSON). The plan must:
   - List every write-path that can mutate a parent's `reps` or any segment, and assert each goes through the helper.
   - Add a CI/lint guard (e.g., grep test in `__tests__/architecture/`) that fails if any file outside `lib/db/sets.ts` directly UPDATEs `workout_sets.reps` for an advanced `set_type`, or directly INSERTs/UPDATEs/DELETEs into `workout_set_segments`.
   - Add a property test that drives random sequences of (insert segment / update segment / delete segment / change set_type / collapse-to-normal) and asserts `parent.reps === Σ segments.reps` after each step. Plan §186 already mentions this — promote it to an **acceptance criterion** with a named test file, not just a risk-table mitigation.
   - Recommend belt-and-suspenders: declare `FOREIGN KEY (set_id) REFERENCES workout_sets(id) ON DELETE CASCADE` on the new table (FK enforcement is on per the recent changelog). Do not rely solely on "cascade in service layer".

2. **Blocker — SQL aggregate analytics will silently inflate e1RM and volume even with the "single helper" approach.** The plan promises `computeSetVolume(set, segments)` as the one source of truth, but a large fraction of analytics is computed in raw SQL and cannot call a TS helper:
   - `lib/db/e1rm-trends.ts` lines 36, 183, 200, 229, 245, 284, 301 → `MAX(ws.weight * (1.0 + ws.reps / 30.0))`. For a rest-pause set logged as 8+3+2 @ 100kg, parent.reps becomes 13 → e1RM = 100·(1+13/30) = **143 kg**, vs the truthful first-mini-set e1RM of 100·(1+8/30) = **127 kg**. ~13% inflation on every PR for every advanced lifter. This is a silent regression on an existing PR-history surface — far worse than the analytics deltas the plan currently scopes.
   - `lib/db/monthly-report.ts:121,152,321,337`, `lib/db/weekly-summary.ts:121,152`, `lib/db/achievements.ts:60,72`, `lib/db/exercise-history.ts:59`, `hooks/useSessionDetail.ts:113`, `hooks/useSummaryData.ts:130`, `hooks/useSessionShareData.ts:36` all do `weight * reps` (or its SQL equivalent) on the parent. As soon as a segment carries its own `weight` override, parent.weight·parent.reps is wrong.

   The plan must pick one of these two architectures and document tradeoffs:
   - **(a) Denormalize:** add `workout_sets.cached_volume` (REAL) and `workout_sets.cached_e1rm_weight` / `_reps` columns, populated by the same service-layer helper that maintains `reps`. SQL aggregates use the cached columns. **Pros:** zero touch to existing SQL aggregates. **Cons:** new columns on `workout_sets` (additive, but the plan currently claims "no ALTER on workout_sets" — that claim has to be retracted).
   - **(b) View-or-CTE rewrite:** introduce a `workout_sets_resolved` SQL view (or inline CTE in every query) that joins segments and exposes `effective_volume` and `effective_e1rm_input`. Every analytics query is rewritten to read from the view. **Pros:** no schema growth. **Cons:** rewrites ~10 query sites and changes their query plans; performance must be benchmarked.

   Either way: enumerate every query site as part of the plan, add an architecture test that greps for `weight * reps` and `weight * (1.0 + reps / 30.0)` outside the chosen abstraction, and add a parity AC: "for any session containing one rest-pause and one cluster set with ≥1 segment-level weight override, `monthly-report`, `weekly-summary`, `achievements`, `exercise-history`, `e1rm-trends`, `useSessionDetail`, `useSummaryData`, and `useSessionShareData` produce values that match a hand-computed segment-aware reference within ±0.01."

3. **Blocker — `workout_sets.reps` semantic shift breaks downstream filters that read it as a per-set count.** Today `reps` is the count for that one set; after this change it can be a SUM across mini-sets, which silently changes the meaning of every filter and threshold that compares it. Concrete example: `lib/db/exercises.ts:309-318` decides "does the user need to progress to the next exercise" by checking `reps IS NULL OR reps < 12` on `set_type='normal'`. The plan does extend that filter to include the new types (§116) — but a rest-pause logged as 8+3+2 will have `reps=13`, so the failing-set check (`reps < 12`) will silently classify it as a passing 13-rep set when the lifter actually only hit 8 reps before failure. That's a behavioral regression on the progressive-overload suggestion path. Plan must either:
   - Audit every consumer of `workout_sets.reps` (including the suggestion engine, plateau, e1rm, recommendation rules) and decide per-site whether parent.reps or first-segment.reps or activation-segment.reps is the correct quantity, OR
   - Treat parent.reps as opaque-sum-only and add explicit named accessors (`getWorkingRepsForOverloadDecision`, `getEffortRepsForPlateau`, etc.) used at every consumer.

   Pick one and document it. Add an AC: "no consumer reads `workout_sets.reps` directly when `set_type` is advanced; all advanced-set consumers route through a named accessor."

4. **Forward-compat (concurs with QD #1) — plus the template path needs the same guard.** `lib/db/sessions.ts:394` writes `set_types: JSON.stringify(group.map((s) => s.set_type ?? "normal"))` to a curated-templates JSON column. When an older app reads a template authored by a newer app, `useHomeActions.ts:67` and the template parser will encounter unknown enum values. Add `normalizeSetType(raw: unknown): SetType` and use it at every read boundary: DB row hydration (`session-sets.ts` lines 73, 143, 615), template parser, CSV import, share-payload deserializer. Add a unit test that feeds garbage strings and confirms each boundary returns `'normal'` without throwing.

5. **Migration claim — "no ALTER TABLE on existing rows" is fragile and contingent on the architecture choice in #2.** If the plan adopts denormalization (option 2a), this claim is wrong and must be retracted. If it adopts the view approach (option 2b), the claim stands but only because the cost moves to query rewrites. Either way, restate the migration block once #2 is decided.

6. **6-segment cap — too tight for myo-reps.** Borge Fagerli's published myo-rep prescriptions sometimes go activation + 5–7 mini-clusters on cable/machine work (the very niche this plan calls out as CableSnap's wedge). Activation + 6 mini-sets = 7 segments. Raise the cap to **8** (still a sane technical guard; arbitrary anyway).

7. **Rest-resolver coverage missing from plan.** `lib/rest-resolver.ts:218,230` filters historical inter-set rest by `set_type = ?`. With three new enum values this query is fine, but the resolver also needs to know whether to use intra-mini-set or inter-set rest for "next rest" suggestions. Plan needs an AC: "rest-resolver returns intra-rest defaults (5/15/30s clamped to MIN_REST_SECONDS) when called mid-parent for an advanced set, and inter-rest defaults when called between parent sets."

8. **Concurs with QD #2 (analytics blast radius)** — covered by my blocker #2 above with concrete query sites.

9. **Non-blocking nits:**
   - `MIN_REST_SECONDS = 10` clamp on a 5s myo-rep intra-rest defeats the purpose of myo-reps (the protocol *requires* sub-10s rest). Either lower the floor for the intra-mini-set mode only, or document that the timer is advisory (the user can ignore it) and don't auto-pause set entry on it.
   - The "+ mini-set" combined affordance (QD non-blocking #3) — agree with QD; a two-tap pattern (Complete-and-rest vs Add-blank-mini-set) is safer.
   - CSV semicolon separator is fine but document the escape rule for sets where someone embeds a literal `;` in a (theoretical future) per-segment note. For v1 with no per-segment notes this is a non-issue.

**Verdict:** REQUEST CHANGES. Direction is right; the data-integrity story and analytics blast-radius story are not yet credible. Once #1–#5 land in the plan with concrete ACs, I'll re-review for APPROVE.

— techlead, 2026-05-11

### Psychologist (Behavior-Design)
_N/A — Classification = NO. Reviewers may opt-in if they want a sanity check on the "no gamification" claim._

### CEO Decision
_Pending_
