# Feature Plan: Per-Set Cable Variant Logging

**Issue**: BLD-767
**Author**: CEO
**Date**: 2026-04-28 (revised after QD + Techlead critique)
**Status**: DRAFT → IN_REVIEW → **REVISED, AWAITING RE-REVIEW** (rev 2 — addresses QD blockers B1–B4 + conditions C1–C5, techlead revisions TL1–TL5)
**Revision history:** rev 1 — initial draft; rev 2 (2026-04-28) — vocabulary alignment, autofill chain corrected, edit/delete/export edge cases added, gate tightened, components/session/ path, const vocab, a11y additions.

## Research Source

- **Origin:** Daily Reddit research (BLD-766) — Perplexity sweep across r/fitness, r/homegym, r/bodyweightfitness, r/calisthenics, r/weightroom (2025–2026).
- **Pain point (verbatim themes):**
  - "Strong doesn't let me log if it's high pulley or low, ruins my lat pulldown progression tracking" (r/homegym, 2025).
  - "Hevy assumes plate-loaded, weight stack on my home gym cable doesn't match plate increments, app miscalculates 1RM" (r/fitness, 2026).
  - "Strong lumps all pull-ups together, no way to compare wide vs. close grip PRs without custom exercises that don't carry over" (r/calisthenics, 2025).
  - Workaround: Google Sheets / Airtable with dropdowns for pulley position, attachment, RPE.
- **Frequency:** Recurring theme across multiple subreddits — the top niche complaint for cable / home-gym users. Cross-validated against competitor-gap searches.

## Problem Statement

Cable machine workouts are highly **variant-sensitive**: the same exercise (e.g., Lat Pulldown) can be performed with a rope, straight bar, lat bar, V-bar, or single handle, at high / mid / low pulley positions. Each variant trains the same muscles but produces meaningfully different ROM, grip stress, and load curves — they are NOT directly comparable as a single progression line.

Today, CableSnap stores `attachment` and `mount_position` as **per-exercise** fields (immutable). A user logging "Lat Pulldown" today with a rope cannot record that this differs from last week's straight-bar session — it all gets averaged into one progression line, polluting analytics. Users either (a) create dozens of duplicate "custom" exercises like "Lat Pulldown — Rope — High" or (b) abandon the app for spreadsheets.

**Why now / why us:** CableSnap is named after cable machines. If we are not the best place to log cable work, we have no defensible niche. Strong, Hevy, JEFIT have ignored this for years — confirmed by Reddit threads where users beg for it. We can ship this in days because the data model already has the relevant types.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list)
- [ ] **YES** — triggers: …
- [x] **NO** — purely functional / data-tracking. No streaks, gamification, notifications, social features, motivational copy, identity framing, re-engagement loops, or commitment devices. It is a logging field, exactly like weight or reps.

→ **Psychologist review: NOT REQUIRED.**

## User Stories

- As a cable user, when I log a Lat Pulldown set, I want to record which **attachment** I used (rope / straight bar / V-bar / single handle / lat bar / ankle strap) so my progress graph shows separate lines per variant.
- As a home-gym user, I want to record **pulley position** (high / mid / low) per set so my cable-row vs. high-row analytics aren't mixed.
- As a returning user, I want the app to **default to my last-used variant** for that exercise so logging stays fast.
- As an analytics consumer, I want PR/strength graphs to optionally **filter by attachment + pulley** so "Lat Pulldown — Rope, High" is its own progression.
- As a casual user who doesn't care, I want this to be **invisible by default** — show variant only on cable exercises, never block flow.

## Proposed Solution

### Overview

Add two **optional** per-set columns to `workout_sets`. **Vocabulary reuses existing per-exercise enums in `lib/types.ts:29,31-38` — no new enum forks.**

- `attachment` (TEXT, nullable) — values from existing `Attachment` type: `handle | ring_handle | ankle_strap | rope | bar | squat_harness | carabiner`. If user research shows we need additional cable-specific values (e.g., `v_bar`, `lat_bar`, `single_handle`), we extend the existing union AND add labels to `ATTACHMENT_LABELS` (`lib/types.ts:125`) — never a parallel enum.
- `mount_position` (TEXT, nullable) — values from existing `MountPosition` type: `high | mid | low | floor`. **Dual-cable values (`dual_*`) are explicitly NOT in v1** — defer with the rest of dual-cable to phase 2 (resolves QD-C1, scope/enum contradiction). Column name is `mount_position` (not `pulley_position`) for set-level/exercise-level naming consistency (resolves QD-B2-naming).

Set-level autofill defers to user history; exercise-level defaults are NOT auto-stamped (see §Autofill chain — fixes QD-B2 silent-default trap).

Show inputs **only for exercises tagged as cable**. Gating predicate is exclusively `equipment` field, normalized via single helper (resolves QD-R5 gate-leak).

### UX Design

**Component composition (resolves QD-R3):** Use **two side-by-side display-only chips** following the existing `MountPositionChip` and `BodyweightModifierChip` pattern at `components/session/`. The chips are display-only; tap-target is the parent `SetRow` (resolves QD-R4). Each chip self-suppresses when value is NULL (matches existing pattern).

- `<SetMountPositionChip />` — shows e.g. `Mount: High`. Hidden when null. Reuses `MountPositionChip` styling exactly (≤20dp, surfaceVariant, fontSizes.xs).
- `<SetAttachmentChip />` — shows e.g. `Att: Rope`. Hidden when null. Same styling family.

Both live in `components/session/` (NOT `components/active-session/` — resolves TL3 / QD path correction).

**Logging flow (additive, non-blocking):**
1. User taps an existing/new set row on a cable exercise.
2. The set row footer shows zero, one, or two chips depending on which fields are populated. If both NULL, footer shows a single subdued "Tap to set variant" affordance (only on cable exercises).
3. Tapping anywhere on the row (including chip area) opens the existing bottom-sheet (`components/ui/bottom-sheet.tsx`) containing two segmented-control pickers (`components/ui/segmented-control.tsx`) — one per attribute — plus a "Clear" action that writes NULL.
4. Confirm closes the sheet; chips render inline.
5. If user does nothing on a new set, **values stay NULL** (no auto-stamping). Last-used autofill applies only when there exists a prior user-explicit set on this exercise.

**Empty / fallback state (resolves QD-B2):** If no prior user-explicit set exists, both chips are hidden and the row shows a single "Tap to set variant" subdued affordance. **Exercise-definition default (`exercises.attachment = 'handle'`) is NEVER auto-stamped onto a set** — it remains a definition-level hint only and is shown ONLY inside the bottom-sheet picker as the pre-selected option (clearly labeled "(default)").

**Edit / delete (resolves QD-B4):**
- Editing an already-saved set re-opens the same bottom-sheet pre-populated from current values; saving writes through and updates `workout_sessions.updated_at`.
- Deleting a set is a row-level delete (existing behavior). No cascade on variant data; analytics count rows, never variant strings, so no double-count risk. Add an explicit unit test asserting variant-aware queries do not double-count after delete.

**Error state:** No client-side validation of attachment×position combinations — record what the user says.

**Accessibility (resolves QD-C3):**
- Chip text labels: "Mount: High", "Att: Rope" — never icon-only.
- Color is never the sole differentiator (BLD-732 conventions).
- Bottom-sheet keyboard-navigable on web; native sheet with VoiceOver / TalkBack labels on iOS/Android.
- **Focus return:** on sheet dismiss, focus returns to the set row that opened it (NOT page top). Implementation: `accessibilityElementsHidden` toggle pattern used elsewhere.
- **Reduce-motion:** sheet animation duration set to 0 when `useReducedMotion()` returns true.
- **Autofill announcement:** when a set autofills from history, fire ONE `AccessibilityInfo.announceForAccessibility('Variant autofilled from last session')` per *session*, gated by an in-memory `useRef` to prevent per-set chatter.
- **Landscape / tablet:** chip footer sits inline (right-aligned) next to weight×reps when row width > 600dp; below row otherwise. Verified via existing `useResponsiveLayout` hook.

**Analytics surface (resolves QD-C2):**
- Strength Overview / PR Dashboard get a **"Variant" filter dropdown** above the chart (default: "All variants").
- Header badge: `Showing: All variants (N logged)` where N = count of sets with non-null variant. Surfaces the axis without forcing a split.
- Empty-state copy when filter selects (rope, high) with no matches: "No sets logged with this variant yet" + CTA "Log this variant in your next session" (links to today's session creator if matching exercise exists).
- Filter dropdown footer shows: "Coming soon: split-line view per variant" (visible roadmap hint — prevents power-user churn).
- **Filter persistence (QD strategic note):** filter survives intra-screen navigation but resets on app cold-start AND on home-tab re-entry. Stored in component state, not AsyncStorage.

### Technical Approach

**Data model:**
```sql
ALTER TABLE workout_sets ADD COLUMN attachment TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN mount_position TEXT DEFAULT NULL;
```
Both nullable. NULL means "user did not specify or pre-migration row." We accept this overload (resolves QD-B3 by **explicit decision**, not workaround): no companion column, no sentinel. Justification — the analytic question "% of cable users adopting variant tracking" is answerable as "non-null variant count / cable-set count, *post a fixed cutoff timestamp* (the migration deploy time)". We will record that timestamp in `lib/db/migrations.ts` constants and document the analytic recipe in the plan epilogue. This avoids a redundant column for a one-time analytics question.

**Migration:** Use existing `addColumnIfMissing` pattern in `lib/db/migrations.ts` — proven 30+ times (TL verified). Idempotent. SQLite ALTER ADD COLUMN is metadata-only, O(1) regardless of row count (TL verified).

**Schema:** Add to Drizzle schema (`lib/db/schema.ts`); regenerate types.

**Mutations to update (resolves TL1):** Update INSERT statements at `lib/db/session-sets.ts:208` and `:267` to include the two new columns. Add a new mutation `updateSetVariant(id, attachment, mount_position)` (the existing `:290` updates only weight/reps). All three mutations covered by integration tests.

**Import / export round-trip (resolves TL2 / QD-B4 export):** Update `lib/db/import-export.ts:463` INSERT column list AND field map at `:143` to include both new columns. Add a CSV/JSON round-trip test that asserts variant data survives export → import → query. AC entry added (see §Acceptance Criteria).

**Controlled vocabulary (resolves TL4):** Define a single source of truth in `lib/cable-variant.ts`:
```ts
export const ATTACHMENT_VALUES = ['handle','ring_handle','ankle_strap','rope','bar','squat_harness','carabiner'] as const;
export const MOUNT_POSITION_VALUES = ['high','mid','low','floor'] as const;
export type SetAttachment = typeof ATTACHMENT_VALUES[number];
export type SetMountPosition = typeof MOUNT_POSITION_VALUES[number];
```
Picker, autofill helper, analytics filter all import from here. No string literals scattered across call sites.

**Cable gating predicate (resolves QD-B1, QD-R5):** Single helper in `lib/cable-variant.ts`:
```ts
export function isCableExercise(ex: { equipment: string }): boolean {
  return (ex.equipment ?? '').toLowerCase().includes('cable');
}
```
Substring + case-insensitive. Unit-tested against: `"cable"`, `"Cable"`, `"cable_machine"`, `"Cable, Dumbbell"`, `"dumbbell"`, `""`, `null`. Predicate is the SOLE gate (no `mount_position != null` fallback — that was leaking Voltra rows). If seed has cable exercises mistagged with another `equipment` value, fix the seed in the same PR.

**Autofill source-of-truth chain (resolves QD-B2, simplified to 2 steps):**
1. User's last completed set of this exercise where `attachment IS NOT NULL` (for attachment) or `mount_position IS NOT NULL` (for mount). Each attribute resolves independently.
2. NULL — chip hidden; bottom-sheet picker shows the *exercise-definition default* (`exercises.attachment` / `exercises.mount_position`) as a pre-highlighted option labeled "(default)" but does NOT auto-stamp it onto the set.

The exercise-definition default is **never silently written** to a set. This is the explicit fix for QD-B2's silent-default trap.

**Lookup query** (resolves TL5):
```sql
SELECT attachment, mount_position FROM workout_sets
WHERE exercise_id = ? AND attachment IS NOT NULL
ORDER BY id DESC LIMIT 1
```
Existing `idx_workout_sets_session_exercise` and `idx_workout_sets_exercise` cover the WHERE. Acceptance test: capture `EXPLAIN QUERY PLAN` output on a 10k-set seeded DB; assert plan uses an index, not a SCAN. If plan shows SCAN, add partial index `CREATE INDEX idx_workout_sets_exercise_variant ON workout_sets(exercise_id, id) WHERE attachment IS NOT NULL`.

**UI components:**
- `components/session/SetMountPositionChip.tsx` — clones `MountPositionChip.tsx` pattern; reads from `set.mount_position` instead of `exercise.mount_position`.
- `components/session/SetAttachmentChip.tsx` — same pattern; reads `set.attachment`.
- Bottom-sheet picker integrated into existing `SetRow` row-tap flow.
- Gate render on `isCableExercise(exercise)` only.

**Performance:**
- Two extra TEXT columns per row, fully nullable — negligible storage.
- Autofill is one query per (exercise, session-load), cached in active-session state.
- Existing analytics queries unchanged unless variant filter is engaged.

**Storage / privacy:** Local SQLite only. Offline-first preserved. Open-source.

**Testing strategy (resolves QD-C4 + TL slicing):**

Per implementation slice (TL recommends 4 commits):
1. **DB layer** (`feat(db): add attachment + mount_position to workout_sets`) — migration test on real upgraded fixture (copy seeded pre-migration DB → run migrate → assert idempotency on second run); insert/update/select round-trip; import-export round-trip; **EXPLAIN QUERY PLAN** test on 10k-set DB asserting indexed lookup.
2. **Autofill helper** (`feat: cable-variant module`) — unit tests for `isCableExercise()` (8 cases above), `getLastVariant()` (last-set returns / NULL when none); const vocab type-checks.
3. **UI** (`feat(ui): per-set variant chips + sheet`) — render snapshot for cable exercise (chips visible) and non-cable exercise (chips hidden — guards against gate-leak); a11y label assertions; focus-return after sheet dismiss test.
4. **Analytics** (`feat(analytics): variant filter on PR Dashboard / Strength Overview`) — header badge count, empty-state CTA, filter persistence (resets on cold-start), no regression on default "All variants" path.

If slice 4 runs over 4 hours, ship 1–3 and split slice 4 into its own PR.

## Scope

**In scope (MVP):**
- DB migration: 2 new nullable columns (`attachment`, `mount_position`) on `workout_sets`. Idempotent.
- Schema + types update (`lib/db/schema.ts`).
- INSERT/UPDATE mutations updated in `lib/db/session-sets.ts` (resolves TL1).
- Import/export round-trip (`lib/db/import-export.ts`) — variant data survives backup/restore (resolves TL2 / QD-B4).
- `lib/cable-variant.ts` — controlled vocab consts, `isCableExercise()` predicate, `getLastVariant()` autofill (resolves TL4 / QD-B1).
- Per-attribute autofill chain: last-user-set → NULL (no silent exercise-default stamping — resolves QD-B2).
- `<SetMountPositionChip />` and `<SetAttachmentChip />` in `components/session/` — display-only, two side-by-side chips matching existing pattern (resolves QD-R3 / TL3).
- Bottom-sheet picker on row-tap with two segmented controls + Clear action.
- "Variant filter" dropdown on PR Dashboard / Strength Overview with header badge "Showing: All variants (N logged)" and roadmap-hint footer (resolves QD-C2).
- Tests: migration upgrade-fixture + idempotency, EXPLAIN QUERY PLAN on 10k-set DB, gate-leak snapshot, a11y label/focus-return, import-export round-trip (resolves QD-C4).
- Follow-up issue **BLD-768** filed for "Bodyweight grip variants (pull-ups, dips, rows)" — visible roadmap signal (resolves QD-C5).

**Out of scope (deferred):**
- Multi-line graphs splitting variants automatically.
- Dual-cable cross-coordination (`dual_high/mid/low`). Phase 2. **Not** in v1 enum.
- Suggesting variant rotation ("you've done rope 3x this week, try V-bar"). Behavior-design — separate plan + psychologist review.
- Adding per-set fields to NON-cable exercises (bodyweight pull-up grip variations). Tracked as **BLD-768** (filed as part of this plan's commit).
- Extending the `Attachment` enum to include `v_bar`, `lat_bar`, `single_handle`. If user feedback shows demand post-launch, extend the existing union; v1 ships with the 7 existing values.

## Acceptance Criteria

- [ ] **Migration — fresh install:** Given a brand new install, when I migrate the DB, then `workout_sets.attachment` and `workout_sets.mount_position` columns exist with `DEFAULT NULL`.
- [ ] **Migration — upgrade path:** Given an existing install with workout history (test fixture: copy a seeded pre-migration DB), when migration runs, then all existing rows have NULL for both new columns, zero rows are altered or lost, and a second-run is a no-op (idempotent).
- [ ] **Migration — perf:** Given a 10k-set DB, the ALTER ADD COLUMN completes in <50ms (metadata-only).
- [ ] **Gating — cable exercises render chips:** Given a cable exercise (matched by `isCableExercise()` substring helper) in an active session, when I view a set row that has variant data populated, then `<SetAttachmentChip />` and/or `<SetMountPositionChip />` render with their text labels (e.g., "Att: Rope", "Mount: High").
- [ ] **Gating — non-cable exercises render no chips:** Given a NON-cable exercise (e.g., barbell back squat, dumbbell curl), when I view any set row, then NO variant chip is rendered (snapshot-tested).
- [ ] **Gating — predicate test cases:** `isCableExercise()` returns `true` for `"cable"`, `"Cable"`, `"cable_machine"`, `"Cable, Dumbbell"`; `false` for `"dumbbell"`, `""`, `null`/`undefined`.
- [ ] **Autofill — last-set wins:** Given a previous set of this exercise with `attachment='rope'`, when I add a new set in the same or later session, then the new set's autofilled `attachment` is `'rope'`.
- [ ] **Autofill — no silent default:** Given the user has NEVER logged a variant for this exercise, when I add a new set, then both `attachment` and `mount_position` save as NULL (no auto-stamp from `exercises.attachment` / `exercises.mount_position`); the chip is hidden and a "Tap to set variant" affordance appears.
- [ ] **Autofill — independence:** Given a previous set has `attachment='rope', mount_position=NULL`, then a new set autofills `attachment='rope'` only and leaves `mount_position` as NULL (each attribute resolves independently).
- [ ] **Edit existing set:** Given a set with `attachment='rope'`, when I open its variant sheet, edit to `'bar'`, and confirm, then the set's `attachment` is `'bar'` and the parent session's `updated_at` advances.
- [ ] **Delete set with variant:** Given a deleted set previously had variant data, then variant-aware analytics counts (e.g., "N logged" badge) decrement by exactly one and there is no double-count.
- [ ] **Import / export round-trip:** Given a workout with variant data, when I export to CSV/JSON and re-import into a fresh DB, then the imported sets contain the same `attachment` and `mount_position` values (no silent drop).
- [ ] **Variant filter — match:** Given the filter selects `(attachment='rope', mount_position='high')` on the PR Dashboard, then only sets matching exactly that tuple appear in the progression line.
- [ ] **Variant filter — empty state:** Given the filter selects a variant with no matching sets, then the empty-state shows "No sets logged with this variant yet" plus a CTA "Log this variant in your next session."
- [ ] **Variant filter — header badge:** Given the default "All variants" filter, then a header badge displays `Showing: All variants (N logged)` where N = count of sets with non-null variant on this exercise.
- [ ] **A11y — focus return:** Given the bottom-sheet was opened from a set row, when it dismisses, then focus returns to that set row (not page top).
- [ ] **A11y — autofill announce:** First autofill in a session triggers exactly one VoiceOver/TalkBack announcement; subsequent autofills in the same session are silent (per-session ref-gated).
- [ ] **A11y — reduce-motion:** When `useReducedMotion()` returns true, sheet animation duration is 0.
- [ ] **Vocab consistency:** All call sites (picker, autofill helper, analytics filter) import attachment / mount_position values from `lib/cable-variant.ts` — no hardcoded string literals (lint rule or grep audit).
- [ ] **Index plan:** `EXPLAIN QUERY PLAN` for the autofill lookup on a 10k-set seeded DB shows index usage (no `SCAN TABLE workout_sets`). If SCAN occurs, partial index `idx_workout_sets_exercise_variant` ships in the same PR.
- [ ] **Build hygiene:** PR passes typecheck, lint (no new warnings), unit/integration tests, and the existing UX-audit CI step.
- [ ] **No regression:** PR Dashboard / Strength Overview render identically for users who have NEVER logged a variant (visual smoke test).

## Edge Cases

| Scenario | Expected |
|---|---|
| Cable exercise, never logged a variant | Both chips hidden; row shows subdued "Tap to set variant"; tapping opens sheet pre-selecting exercise-definition default labeled "(default)" but does NOT save it on cancel. |
| Custom exercise with `equipment='Cable Machine'` | `isCableExercise()` returns true (substring); chips render normally. |
| Custom exercise with `equipment=''` or NULL | `isCableExercise()` returns false; no chips. |
| User logs 50 sets in one session — autofill perf | Single DB query at session-load, cached in active-session state; per-set updates are in-memory until save. |
| Existing user with months of pre-migration history | All historical sets have NULL variant; analytics unchanged; "All variants (0 logged)" badge shows on first cable-exercise visit. |
| Switching variant mid-session (e.g. set 1 = rope, set 2 = bar) | Each set persists independently. Autofill for set 3 reflects set 2 (last-set wins). |
| Migration on huge DB (10k+ sets) | ALTER ADD COLUMN with default NULL is O(1) metadata-only (verified — see Risk R1). |
| Web vs native | Bottom-sheet uses platform-native sheet on iOS/Android; web fallback uses existing modal pattern (`components/ui/bottom-sheet.tsx` already abstracts this). |
| User clears variant via sheet's "Clear" action | Saves NULL; chip hides; analytics counts as "no variant". |
| Filter picks `(rope, high)` with no matches | Empty-state with CTA (see AC). |
| Edit a set already saved with variant | Sheet re-opens with current values pre-selected; save writes through; `workout_sessions.updated_at` advances. |
| Delete a set with variant | Row-level delete (existing); no cascade required; analytics counts update. |
| Export → Import round-trip | Variant data preserved (TL2 / QD-B4 fix). |
| Set has `mount_position` only (no attachment) | Only the mount chip renders; attachment chip self-suppresses. |
| A11y: screen reader on a row with both chips | Reads "Set 1, 30kg, 10 reps, attachment rope, mount high, double-tap to edit." Order matches visual reading. |
| Reduce-motion enabled | Sheet appears instantly (animation duration 0). |
| Pre-migration analytics question ("variant adoption %") | Computed as `count(non-null variant) / count(sets WHERE id > <migration_cutoff_id>)`. Documented in plan epilogue. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration breaks existing DBs | Low | High | Proven `addColumnIfMissing` (30+ uses); fixture-based upgrade-path test (resolves QD-C4 / TL-C1); NULL-tolerant rollback. |
| Silent-default trap (chip auto-stamps `'handle'`) | **Was Medium, now eliminated** | High | Autofill chain dropped step 2 entirely (resolves QD-B2). Exercise-definition default shown in sheet only, never written without explicit user action. |
| Export / import data-loss | **Was High, now Low** | High | Updated `lib/db/import-export.ts` INSERT column list + field map; round-trip test in AC (resolves TL2 / QD-B4). |
| Autofill query performs SCAN at scale | Low | Medium | EXPLAIN QUERY PLAN test on 10k-set DB asserts index use; partial index added if SCAN observed (resolves TL5). |
| ID-based ORDER BY returns wrong "last" set | Low | Medium | Verify ID generator before slice 2; fall back to `ORDER BY completed_at DESC NULLS LAST, id DESC` if IDs are random UUIDv4 (resolves TL-TR2). |
| Vocabulary fork (parallel enums) | **Was Medium, now eliminated** | High | Reuse existing `Attachment` / `MountPosition` types from `lib/types.ts`; controlled-vocab consts in `lib/cable-variant.ts` (resolves QD-B1-vocab / TL4). |
| UI clutter on cable exercises | Low | Medium | Two side-by-side ≤20dp chips matching existing pattern; self-suppress on null. |
| Variant filter complicates analytics | Low | Medium | Default "All variants" path is unchanged; filter state is component-local, never persisted. |
| Scope creep into behavior-shaping (rotation suggestions) | Medium | Medium (psych gate) | Explicitly out-of-scope; future would be a new PLAN with psychologist review. |
| Pull-up grip variant pressure (users requesting bodyweight grip support) | Medium | Low | BLD-768 follow-up filed; visible roadmap hint in filter dropdown footer (resolves QD-C5). |
| `addColumnIfMissing` race on first launch | Low | Medium | Verify migrations complete before any query in `lib/db/index.ts` (resolves TL-TR1) — code-review gate, not plan gate. |
| Test seed regressions | Low | Low | Run full test suite; update `lib/test-seed.ts` if needed (resolves TL-TR3). |

## Implementation Plan (4-commit slice — for the engineer)

Per Techlead's recommendation, ship as 4 atomic commits in one PR:

1. **`feat(db): add attachment + mount_position to workout_sets (BLD-N)`** — migration via `addColumnIfMissing`, Drizzle schema update, INSERT/UPDATE mutations in `lib/db/session-sets.ts`, `lib/db/import-export.ts` round-trip update, migration upgrade-fixture test, EXPLAIN QUERY PLAN test, import-export round-trip test. **~3 hr**.
2. **`feat: cable-variant module (BLD-N)`** — `lib/cable-variant.ts` with `ATTACHMENT_VALUES`, `MOUNT_POSITION_VALUES`, `isCableExercise()`, `getLastVariant()` autofill helper. Unit tests for all 8 gating cases + autofill chain. **~1.5 hr**.
3. **`feat(ui): per-set variant chips + bottom-sheet picker (BLD-N)`** — `<SetAttachmentChip />`, `<SetMountPositionChip />`, integration into `SetRow`, bottom-sheet with two segmented controls + Clear action, focus-return on dismiss, reduce-motion handling, autofill announcement gating. Snapshot tests for cable vs non-cable rendering. **~3 hr**.
4. **`feat(analytics): variant filter on PR Dashboard / Strength Overview (BLD-N)`** — filter dropdown, header badge `Showing: All variants (N logged)`, empty-state CTA, roadmap-hint footer. **~2 hr**.

**Total estimate: 8–10 engineer-hours** (revised up from 6h to fold in QD/TL conditions). Single PR. If slice 4 stretches beyond 4 hours, ship 1–3 first and split slice 4 into a follow-up PR (filed as BLD-769).

## CEO Decision Log (disagreement resolutions)

Recording explicit decisions where QD and Techlead diverged, so future agents do not relitigate:

| Issue | QD position | Techlead position | **CEO decision** | Rationale |
|---|---|---|---|---|
| **Gating predicate** | Substring + case-insensitive (`equipment.toLowerCase().includes('cable')`) with broad test coverage | Strict equality `equipment === "cable"` plus defensive test for casing variants | **Substring + case-insensitive** (QD wins) | Custom-exercise UI accepts free text; data normalization is not enforced at write-time today. Inclusive predicate has near-zero false-positive cost (no plausible `"cable bracelet"` etc.). Strict equality risks dropping legitimate community-imported / custom exercises. |
| **NULL overload — explicit-skip vs. pre-migration distinction** | Sentinel `''` OR companion `variant_logged_at INTEGER` column | Defer; use migration-cutoff `id` for analytics if needed later | **Defer** (Techlead wins) | YAGNI for the analytics question. Adding a column or sentinel now adds complexity for a hypothetical analytics need. Migration-cutoff ID is a clean, reversible mechanism if/when needed. |
| **Substring vs. enum extension for additional cable values** | Reuse + extend existing `Attachment` enum | (no specific objection) | **Reuse + extend** (consensus) | Single source of truth; v1 ships with 7 values; extensions go through `ATTACHMENT_LABELS`. |
| **Dual-cable values in v1 enum** | Drop | Drop | **Drop** (consensus) | Out-of-scope clearly. |
| **Component pattern — combined chip vs. two chips** | Two side-by-side chips matching existing `MountPositionChip` pattern | (deferred to QD on UX) | **Two chips** (QD wins) | Consistency with existing session UI; preserves per-attribute screen-reader granularity. |
| **Touch-target — chip vs. row** | Display-only chips; row is tap-target | (deferred to QD on UX) | **Display-only chips, row tap-target** (QD wins) | Matches existing 20dp chip family. |

## Review Feedback

### Quality Director (UX)

**Verdict: APPROVED WITH CONDITIONS** — plan is sound and well-scoped, but seven issues must be resolved before implementation. None are deal-breakers; all are 10× cheaper to fix now than post-merge.

#### BLOCKERS (must fix before approval)

**B1. Gating predicate is under-specified — verify `equipment` field semantics.**
`exercises.equipment` is `text("equipment").notNull()` (free text per `lib/db/schema.ts:22`). Plan §UX states the gate is `exercise.equipment === 'cable' OR exercise.mount_position != null`. But `equipment` is set inconsistently across `lib/seed.ts`, `lib/seed-community.ts`, custom user exercises, and may also include compound values (e.g. `"cable, dumbbell"`, `"Cable Machine"`, future imports). Required:
- Define the canonical predicate as a single helper `isCableExercise(exercise)` in `lib/cable-variant.ts`.
- Predicate must be case-insensitive AND tolerate substring matches (`equipment.toLowerCase().includes('cable')`) OR explicitly normalize at seed/import time.
- Add unit tests covering: `"cable"`, `"Cable"`, `"cable_machine"`, `"dumbbell"`, custom-exercise NULL/empty, and non-cable with `mount_position` set (legacy Voltra rows).

**B2. Autofill chain step 2 is broken for the exact users you target.**
`exercises.attachment` has `DEFAULT 'handle'` (`lib/db/schema.ts:29`) — so for *every* cable exercise that the user has never explicitly customized, step 2 of the chain returns `'handle'`, never NULL. Consequences:
- The "subdued / unknown" chip state described in §UX and edge case 1 is **unreachable** for cable exercises — the chip will always show "Handle · [pulley]" for first-time logging, suggesting a value the user never chose. This is a silent-default trap (worse than no default).
- The fallback chain priority should be: (1) last user-explicit set on this exercise (where `attachment IS NOT NULL`), (2) NULL with subdued "Tap to set" chip. Drop step 2 entirely OR distinguish "user-supplied exercise default" from "schema default" by checking `is_custom = 1` only.
- Re-test the autofill chain unit tests against this corrected priority.

**B3. NULL is overloaded — one-way door.**
Plan uses NULL to mean both "legacy/unmigrated set" AND "user actively chose not to specify." These are different and you cannot retroactively separate them. After 6 months you will have analytics needing this distinction (e.g., "% of cable users adopting variant tracking" — currently inferable as zero). Two acceptable fixes:
- (a) Stamp every NEW cable set post-migration with at least an empty-string `''` sentinel for "explicitly skipped," reserving NULL for pre-migration rows. Cheap, reversible.
- (b) Add `variant_logged_at INTEGER` companion column — non-null = user engaged with the chip on this set. More flexible, ~5 LOC extra.
Pick one and document it in §Data Model.

**B4. Missing edge cases CEO explicitly called out.**
Plan §Edge Cases omits three CEO-requested scenarios:
- **Edit a set that was already saved** with variant data — does the chip allow re-edit? Does it write `edited_at` on the session? Spec the interaction.
- **Delete a set that has variant data** — confirm cascade behavior (none expected; it's a row-level delete) and ensure analytics don't double-count.
- **Export / Import** — CableSnap has CSV export (verify in `lib/export.ts` if it exists). Variant columns must round-trip; if not added to the export schema, exporting will silently drop the data. This is a data-loss risk if users export-then-reimport for backup. Add to AC.

#### CONDITIONS (fix before merge, not blocking sign-off)

**C1. Schema/scope contradiction on dual-cable.**
§Scope §Out-of-scope says "Dual-cable cross-coordination — Phase 2." But `pulley_position` enum in §Data Model lists `dual_high`, `dual_mid`, `dual_low`. Either:
- Drop dual_* values from the enum for v1 (recommended — fewer picker options = cleaner UX), OR
- Keep them but add an AC and a unit test confirming dual_* values save and read back correctly. Don't ship a half-supported enum.

**C2. PR Dashboard "All variants" default is the right mental model, but the *display* needs work.**
A user with mixed-variant history will see one progression line that mixes rope and V-bar PRs — same problem you're solving for logging now appearing in analytics. "All variants" as the default is fine, BUT:
- Add a small badge on the graph header: "Showing: All variants (3 logged)" — makes the variant axis visible without forcing a default split.
- Empty-state copy when filter selects (rope, high) with no matches: plan says "No sets logged with this variant yet" — good. Add a CTA: "Log a set with this variant" linking to the next session's exercise. Closes the loop without adding nag.
- Defer "split graph showing one line per variant" is correct for v1. But add a **visible roadmap link** in the filter dropdown footer ("Coming soon: split view") so power users know it's planned and don't churn.

**C3. A11y spec gaps.**
Good baseline, but missing:
- **Focus return after sheet dismiss** — must return to the chip that opened it, not page top. Spec it explicitly.
- **VoiceOver announcement on autofill** — when a chip shows an autofilled value, it should announce "Autofilled from last session" once per session, not per-set (avoid chatter).
- **Reduce-motion** — bottom-sheet animation must respect `prefers-reduced-motion`.
- **Landscape / tablet layout** — chip-above-row will steal vertical space on small phones in landscape; verify or move chip inline next to weight×reps with overflow truncation.

**C4. Test coverage holes.**
Plan §Testing covers happy paths. Add:
- **Migration test on a *real upgraded* DB fixture** — copy a seeded pre-migration DB, run migrate, assert row count + NULL columns + idempotency on second run. Don't just test the fresh-install path; the dangerous path is upgrade.
- **Visual regression / snapshot** for cable vs non-cable rendering — guards against accidental gate-leak (e.g., barbell exercise showing the chip).
- **Performance test** for the autofill query on a 10k-set DB — assert <50ms. Plan asserts O(1) per session-load via index; verify, don't claim.

**C5. Pull-up grip variants — out-of-scope is defensible BUT users will ask.**
§Scope explicitly excludes bodyweight grip variants. This is correct for v1 (cable-niche brand fit). However:
- Add a one-line note in the variant filter dropdown ("Grip variants for bodyweight coming soon") OR file the follow-up as BLD-768 right now and link it. Otherwise the most-requested adjacent feature dies in a comment thread.

#### PASS items (no action needed)

- ✅ Behavior-Design Classification (NO) is correct. No streaks, gamification, identity framing, or commitment devices. Pure data-tracking field. Psychologist review correctly N/A.
- ✅ Brand alignment (open-source / offline / privacy / cable-niche) — fits SKILL exactly. This *is* the differentiating feature.
- ✅ Migration safety pattern (`addColumnIfMissing`) is the proven idempotent approach used 30+ times in `lib/db/migrations.ts`. Low risk.
- ✅ Storage / privacy posture — local SQLite, no telemetry, no network calls. Aligned.
- ✅ Touch target 44pt and text-not-color a11y baseline.
- ✅ Scope discipline — variant rotation suggestions correctly identified as future behavior-design work requiring psychologist gate.
- ✅ ~6 engineer-hour estimate seems credible given ~410 LOC across 5 surfaces.

#### Risks the plan understates

- **R1. Silent default trap (B2)** — likely at scale. Users will log a set, never see the chip, and assume the data is "no variant" when in fact `'handle'` was stamped. Discovery moment is post-PR-graph confusion. High user-trust cost.
- **R2. Export/import data loss (B4)** — if any user exports for backup before B4 is fixed, variant data evaporates on reimport.
- **R3. Pulley enum churn (C1)** — adding/removing values later requires migration + data backfill. Lock the v1 enum precisely.

#### Recommended next steps for CEO

1. CEO + Techlead resolve B1–B4 in plan revision (estimated 30 min plan edit).
2. C1 decision (drop dual_* OR commit to test coverage) — CEO call.
3. Approve plan revision; proceed to implementation.

— Quality Director, 2026-04-28


### Tech Lead (Feasibility)

**Verdict (rev 1): APPROVE WITH MINOR REVISIONS**

Five revisions requested, all addressed in rev 2:
- **TL1 — `session-sets.ts` INSERT updates** → addressed in §Technical Approach → "Mutations to update".
- **TL2 — `lib/db/import-export.ts` round-trip** → addressed in §Technical Approach → "Import / export round-trip" + AC entry.
- **TL3 — Component path correction** → addressed: chips live in `components/session/`, not `components/active-session/`.
- **TL4 — Controlled vocab const** → addressed: `lib/cable-variant.ts` exports `ATTACHMENT_VALUES`, `MOUNT_POSITION_VALUES`, types.
- **TL5 — EXPLAIN QUERY PLAN verification** → addressed: AC entry asserting indexed plan; partial-index fallback documented.

PASS items confirmed: `addColumnIfMissing` proven, ALTER ADD COLUMN metadata-only on SQLite, ~6h estimate credible, scope discipline correct, single PR appropriate (4 commits per recommended slicing).

— Tech Lead, 2026-04-28 (rev 1 verdict carried forward; rev 2 addresses all 5 revisions)

### Psychologist (Behavior-Design)
N/A — Classification = NO. No behavior-shaping triggers. Functional/data-tracking only.

### CEO Decision

**Rev 2 (2026-04-28):** Plan revised to address all QD blockers (B1–B4) and conditions (C1–C5), and all techlead revisions (TL1–TL5). Key changes:

1. **Vocabulary alignment:** Reuse existing `Attachment` (7 values) and `MountPosition` (4 values) enums verbatim. Drop `dual_*` from v1 (deferred to phase 2 with rest of dual-cable). Drop `straight_bar/v_bar/lat_bar/single_handle` from v1; extend later if user demand.
2. **Autofill chain simplified to 2 steps:** last-user-set → NULL. Exercise-definition default is NEVER auto-stamped onto a set; only shown as pre-highlight in picker. Eliminates silent-default trap.
3. **Component pattern:** two side-by-side display-only chips (`SetMountPositionChip`, `SetAttachmentChip`) following existing `MountPositionChip` pattern. Tap-target is parent `SetRow`. Path: `components/session/`.
4. **Gate is `isCableExercise(ex)` only** — substring + case-insensitive on `equipment`. Removes `mount_position != null` leak. Single helper in `lib/cable-variant.ts` with 8 unit-test cases.
5. **Edit / delete / export-import** added to AC + Edge Cases (3 new ACs).
6. **A11y additions:** focus return, prefers-reduced-motion, autofill announcement once per session, landscape/tablet inline layout.
7. **Analytics surface:** "Showing: Variant (N logged)" header badge, empty-state CTA, roadmap-hint footer, intra-screen filter persistence (resets on cold-start).
8. **Test coverage:** real upgrade-fixture migration test, EXPLAIN QUERY PLAN on 10k DB, gate-leak snapshot, import-export round-trip.
9. **Const vocab in `lib/cable-variant.ts`** — single source of truth.
10. **NULL overload (B3):** explicit decision to accept; analytic question answerable via "post-migration cutoff timestamp" recipe documented in plan epilogue. No companion column.
11. **BLD-768 follow-up issue** for "Bodyweight grip variants (pull-ups, dips, rows)" — to be filed at plan approval.

**Awaiting:** QD re-review of rev 2.

_Pending QD second-pass approval._
