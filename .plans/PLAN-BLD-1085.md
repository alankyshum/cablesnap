# Feature Plan: Per-Variant PRs in Global PR Dashboard & Strength Levels

**Issue**: BLD-1085  **Author**: CEO  **Date**: 2026-05-07
**Status**: DRAFT → **IN_REVIEW (rev 2 — addresses all blocking review items)** → APPROVED / REJECTED

## Problem Statement

CableSnap's global **PR Dashboard** (`app/progress/records.tsx`), **All-Time Bests** card, and **Strength Levels** card treat each exercise as a single, undifferentiated record. For cable exercises this produces wrong, confusing data: the "PR" for *Cable Triceps Pushdown* shows whichever attachment moved the most weight (typically a straight bar at ~40 kg) and silently ignores that the user has never come close to that number with the rope (~30 kg) or single-handle (~22 kg).

This is the canonical Reddit complaint about cable tracking, and it directly contradicts our company goal that "cable + bodyweight exercises are first-class citizens" and that we should "leverage … training modes, and mount positions as differentiators."

We already shipped:
- **BLD-788** — per-exercise cable variant analytics filter on the exercise detail page (`components/exercise/ExerciseVariantFilter.tsx`).
- **BLD-1059/1060** — per-gym cable stack calibration (`gym_profiles`, `cable_stacks`, `stack_calibrations`).
- The DB columns `workout_sets.attachment / mount_position / grip_type / grip_width` are already populated on every set.
- `lib/db/exercise-history.ts` already supports a `VariantScope` filter producing correct per-variant aggregations.

What's missing is exposing this dimension in the **global** progress surfaces — exactly where users notice the bug ("but I've never lifted that with the rope!").

**User emotion today**: "The records page says my rope pushdown PR is 40 kg. That's not real — I've only ever done 30 kg with the rope. The app is lying."

**User emotion after**: "I can see my real rope-pushdown PR (32.5 kg, last week) and my straight-bar PR (40 kg, March) as separate cards. The numbers finally match my reality."

## Research Source

- **Origin:** Reddit aggregate (r/fitness, r/homegym, r/weightlifting) Q1 2026 + corroborated by the goal statement of CableSnap.
- **Pain point observed:**
  - "Why can't I log which cable attachment I'm using without an annoying workaround?"
  - "There's no way to differentiate my cable triceps work vs my dumbbell kickbacks unless I add it as a new exercise."
- **Frequency:** Recurring theme across multiple subreddits and competitor reviews (Strong, Hevy, JEFIT, FitNotes); widely cited as a deal-breaker for cable-heavy lifters.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO** — purely informational/functional. No streaks, notifications, rewards, social, habit loops, identity framing, or motivational copy. Does not change re-engagement mechanics. Psychologist review **N/A**.

## User Stories

- As a cable-heavy lifter, I want my PR Dashboard to show my best **per attachment** so the numbers match what I actually did with that attachment.
- As a user, I want to see PR cards for "Cable Triceps Pushdown · Rope" and "Cable Triceps Pushdown · Straight Bar" as distinct entries when both have history, instead of a single merged record.
- As a user, I do **not** want to be forced to clone exercises to track different attachments separately.
- As a user with no attachment data on a set, I want sensible fallback (legacy/unspecified rows aggregate into a "(no attachment)" or default record so I'm not punished for old data).

## Proposed Solution (rev 2 — addresses QD #1–6 + Techlead T1–T8)

### Variant Identity (CANONICAL — referenced everywhere below)

The variant tuple for Phase 1 is exactly:

```
(exercise_id, attachment, mount_position, grip_type, stack_unit_at_log)
```

- `grip_type` is **included** (resolves QD #1, Techlead T13). `grip_width` is **deferred** to a Phase 2 follow-up — most users don't differentiate widths and including it over-segments cards.
- `stack_unit_at_log` is **part of the key** (Techlead T4 option b). A user with two gyms — both with "Rope" but one calibrated in `kg` and one in `plate-marker` — will see them as separate cards, never cross-contaminate.
- NULL is a real, distinct value at every position. The four buckets `(rope, high, neutral, kg)`, `(rope, null, neutral, kg)`, `(null, high, neutral, kg)`, `(null, null, null, kg)` are FOUR rows, never collapsed (resolves QD #3, Techlead T12).

### Overview

Extend the variant-aware aggregation already used on the per-exercise screen (`exercise-history.ts` `VariantScope`) into the **global PR Dashboard** queries — and **only** the PR Dashboard. Strength Levels card is intentionally **out of scope** for per-variant rows (see "Strength Levels" below). All work is read-side; one Phase 0 schema migration adds a covering index.

### Phase 0 — Refactor + Migration (PRECEDES feature work, separate commits)

**Commit 0a — Refactor (no behavior change):** Move `buildVariantSql` (currently `lib/db/exercise-history.ts:111`) and its Drizzle counterpart `variantDrizzleConditions` (line 140) into a new file `lib/db/variant-scope.ts`. Update `VariantScope` shape to include `gripType` and `stackUnitAtLog`. Fix all imports. **No SQL semantic change yet** — existing call sites pass `gripType: undefined, stackUnitAtLog: undefined` so behavior is identical. Verified by all existing tests passing (resolves Techlead T2).

**Commit 0b — Migration `0026_variant_prs_index.sql`:** Add composite index
```sql
CREATE INDEX IF NOT EXISTS idx_workout_sets_variant_pr
  ON workout_sets (exercise_id, attachment, mount_position, grip_type, completed_at);
```
Acceptance: `EXPLAIN QUERY PLAN` for the new aggregation query (Phase 1 below) reports `USING INDEX idx_workout_sets_variant_pr`, NOT `SCAN TABLE workout_sets`. Bench fixture: 5,000 sets across 80 exercises, ~30 distinct variant tuples (resolves Techlead T1).

### Phase 1 — Feature

#### 1. Equipment-gated PR aggregation (`lib/db/pr-dashboard.ts`)

- Detect cable exercises by joining `exercises.equipment IN ('cable')`. Non-cable exercises continue using the existing exercise-keyed query (no GROUP BY widening, no perf cost). Cable exercises take a new variant-keyed branch (resolves Techlead T5).
- New helper `bestPerVariant(exerciseId)` returns
  ```ts
  type VariantBest = {
    attachment: string | null;
    mountPosition: string | null;
    gripType: string | null;
    stackUnitAtLog: string | null;
    weight: number;
    reps: number;
    e1rm: number;
    achievedAt: number;        // session.completed_at
    sessionCount: number;      // count of distinct sessions for this variant
  };
  ```
  Computed via `GROUP BY exercise_id, attachment, mount_position, grip_type, stack_unit_at_log` over completed work sets.
- `loadPRDashboard()` keeps its current return shape; each `RecentPR` / `AllTimeBest` gains an optional `variants?: VariantBest[]` field. **Type-additive, non-breaking** for the no-touch consumers (resolves Techlead T10):
  - **Will not be touched:** `components/share/ShareCard*`, `components/progress/MonthlyReportSegment.tsx`, `components/progress/WeeklySummary*`, `lib/export/*`. They read `RecentPR.weight/reps/e1rm` only and ignore the optional new field.

#### 2. Recent PRs are variant-aware (`getRecentPRsWithDelta`)

- The previous-best correlated subquery in `lib/db/pr-dashboard.ts` (lines 174–200, 219–243) is rewritten so `prev_max` is scoped to the **same variant tuple** as the candidate row. Concretely, the subquery's WHERE clause grows to match all five tuple positions (with `IS NOT DISTINCT FROM`-style NULL-safe comparisons).
- Effect: a 32.5 kg rope PR after a 40 kg straight-bar session is correctly surfaced as a NEW PR with delta vs the previous rope best, not suppressed against the unrelated bar (resolves QD #4).

#### 3. Strength Levels card — STAYS exercise-best (Techlead T3 option A)

- **Per-variant rows are EXPLICITLY OUT OF SCOPE.** The threshold table (`lib/db/strength-overview.ts` + `lib/data/strength-levels.ts`) is exercise-keyed against typical-use lifts. Feeding rope-only e1RM into a `Cable Triceps Pushdown` Intermediate threshold compares apples to oranges; the threshold author assumed straight-bar-typical use.
- Behavior change for cable exercises only: the card adds a small caption — `"best achieved with: Rope · High mount"` — sourced from the variant tuple of the single best set that determined the level. No level recalculation. No level drops. No banner needed (resolves Techlead T3, T11; QD #2).
- Per-variant strength-level thresholds are filed as a Phase 2 follow-up issue (will require a fully rebuilt thresholds dataset).

#### 4. Records UI (`components/progress/records/*`)

- New `<VariantChip variant={tuple} />` micro-component. Renders inside the existing card, BELOW the exercise name. Uses `ATTACHMENT_LABELS` / `MOUNT_LABELS` / `GRIP_LABELS` from `lib/cable-variant.ts` (extend if `grip_type` labels missing).
- Card-rendering rule for cable exercises:
  - `record.variants?.length === 0 || undefined` → unchanged single card (legacy/no-data path).
  - `record.variants.length === 1` → single card with chip.
  - `record.variants.length > 1` → one card per element of `variants`, ordered by `achievedAt` DESC for Recent PRs, by `e1rm` DESC for All-Time Bests.
- `AllTimeBestsSection.tsx`, `RecentPRList.tsx`: only modification points. ShareCard etc. untouched.

#### 5. Variant chip + label rules (concrete a11y / 390px spec — resolves QD #6)

- **Visible chip text** (max 1 line, ellipsizes at viewport-relative width):
  - All four positions present: `"Rope · High · Neutral · kg"`
  - One null: `"Rope · — · Neutral · kg"` (em-dash for null position)
  - All four null: chip omitted; card caption reads `"(unspecified)"`.
- **`accessibilityLabel`** (full sentence, never ellipsizes):
  ```
  "Variant: Rope attachment, high mount, neutral grip, kilograms.
   Best 32.5 kilograms for 8 reps, achieved 2026-05-04."
  ```
  Includes exercise name + variant tuple + value + reps + delta/achievedAt + unspecified state when applicable.
- **390px web viewport:** chip wraps to its own line below the exercise name; max 28 characters before ellipsizing the middle. Card vertical height grows by ~16px when chip is present. Tested in `__tests__/components/progress/records-overflow.test.tsx` with explicit width assertions on the inner Text node AND its wrapper container (per repo memory: assert the FULL parent-to-child width chain, not just the leaf).

#### 6. Kill-switch flag — manual rollback hatch ONLY (resolves QD #5, Techlead T8)

- `settings.show_variant_prs` (boolean, default `true`). Hidden in dev settings only.
- **What it IS:** a manual rollback we can flip via the `settings` table or a `dev menu` if the feature ships broken — disables the variant-aware code path so cable exercises render as merged-best (pre-feature behavior).
- **What it IS NOT:** an auto-fallback when the variant query exceeds time budget. If the variant query throws or exceeds budget, the cable section renders an explicit error state (`"Couldn't load per-variant records — try again or report this."`) and a Sentry breadcrumb. **No silent merged-best fallback** — that would reintroduce the exact data-integrity bug we are fixing.

### Storage / data

One Phase 0 migration (composite index above). No table changes. All feature logic is read-side aggregation over existing columns.

### Dependencies

None new. All needed primitives exist:
- `lib/cable-variant.ts` (vocabulary + labels)
- `lib/db/exercise-history.ts` (variant scope helper)
- `components/exercise/ExerciseVariantFilter.tsx` (UX precedent)

## Scope

**In (Phase 0 + Phase 1):**
- Phase 0: refactor `buildVariantSql` → `lib/db/variant-scope.ts` (separate commit, no behavior change).
- Phase 0: composite index migration `0026_variant_prs_index.sql`.
- Phase 1: per-variant PR cards on the global PR Dashboard (`AllTimeBestsSection`, `RecentPRList`) for cable exercises only — gated by `exercises.equipment IN ('cable')`.
- Phase 1: variant-aware `getRecentPRsWithDelta` (per-variant prev_max scoping).
- Phase 1: Strength Levels card adds `"best achieved with: <variant>"` caption — NO per-variant rows, NO level recalculation.
- Phase 1: `<VariantChip />` micro-component (attachment + mount + grip_type + stack_unit_at_log).
- Phase 1: one neutral info popover/help link on the records page header.
- Phase 1: kill-switch `settings.show_variant_prs` (manual rollback only).
- Tests: aggregation correctness across the four-bucket NULL matrix; non-cable equipment unchanged; single-variant exercises render unchanged; recent-PR variant-scoped delta correct; index used per `EXPLAIN QUERY PLAN`; perf bench under budget.

**Out (deferred / explicit non-goals):**
- Per-variant Strength Levels rows or thresholds — Phase 2 follow-up issue.
- `grip_width` as a variant dimension — Phase 2 follow-up.
- Sharing the variant breakdown via ShareCard / WeeklySummary / MonthlyReportSegment / exports — explicit no-touch list.
- New analytics/charts beyond the records page.
- Cloning or splitting exercises in the catalog (variants are dimensions, not exercises).
- Retroactive variant editing on existing sets.
- Bodyweight grip-width PR dimension (bodyweight has its own modifier_kg axis).
- Auto-fallback to merged best on perf timeout (explicitly rejected — see Technical Approach §6).

## Acceptance Criteria

### PR Dashboard — All-Time Bests

- [ ] **Given** a user has logged Cable Triceps Pushdown with rope (max 30 kg) and straight bar (max 40 kg), **When** they open Progress → Records, **Then** they see exactly two All-Time Bests cards for that exercise, each with the correct variant chip and the variant-correct max.
- [ ] **Given** the user has only logged rope, **Then** exactly one card renders with a rope chip; visually identical to today's card aside from the chip.
- [ ] **Given** the user has only legacy (all-null variant) cable sets, **Then** exactly one card renders with caption `"(unspecified)"` and no chip.
- [ ] **Given** the four-bucket matrix `(rope,high)`, `(rope,null)`, `(null,high)`, `(null,null)` each has at least one logged set, **Then** four distinct cards render (the GROUP BY does not collapse NULL with non-NULL).
- [ ] **Given** the user has logged "Rope" sets at Gym A in `kg` and at Gym B in `plate-marker`, **Then** two distinct cards render (one per `stack_unit_at_log`), never cross-contaminating weight numbers.

### Recent PRs (variant-aware delta)

- [ ] **Given** the user logs 32.5 kg rope after a 40 kg straight-bar session, **When** they open Recent PRs, **Then** the rope PR is shown as a NEW PR with `+2.5 kg` delta vs the previous rope best (not suppressed by the unrelated straight-bar number).
- [ ] **Given** the user logs a new rope PR with no prior rope history, **Then** delta is shown as the value itself, marked as a first PR.

### Strength Levels card (caption-only behavior)

- [ ] **Given** a user has cable PRs split across rope and bar, **Then** the Strength Levels card shows the SAME level it shows today (no level drops), with an added caption `"best achieved with: <variant>"` sourced from the variant tuple of the best set.
- [ ] **Given** a user has only legacy null-variant data, **Then** the caption is omitted and the card matches today's render byte-for-byte.

### No-touch surfaces

- [ ] ShareCard, MonthlyReportSegment, WeeklySummary, and CSV/JSON exports render byte-identically before and after the change for users with cable PRs (snapshot tests confirm).

### Kill-switch / error state

- [ ] **Given** `settings.show_variant_prs = false`, **Then** cable cards render as merged-best (pre-feature behavior).
- [ ] **Given** the variant query throws or exceeds the test-runner budget, **Then** the cable section renders an explicit error state (`"Couldn't load per-variant records…"`); merged-best is **not** silently substituted.

### Empty / regression

- [ ] **Given** a user with zero cable sets, **Then** the entire records page renders byte-identically to pre-change snapshots.
- [ ] No new lint warnings, no new TS errors, all existing tests pass.
- [ ] Web build at 390px viewport renders the records page without horizontal overflow; chip wraps below name; full parent-to-child width chain asserted in `records-overflow.test.tsx`.

### Performance

- [ ] `EXPLAIN QUERY PLAN` for the new variant aggregation reports `USING INDEX idx_workout_sets_variant_pr` (NOT `SCAN TABLE workout_sets`).
- [ ] Bench `__tests__/db/pr-dashboard.bench.ts` — 5,000 sets / 80 exercises / 30 distinct variant tuples — completes in **<30 ms p95 over 50 runs on the `better-sqlite3` test backend**. (Restated from prior "Pixel 4a" wording.)
- [ ] A separate Maestro/EAS device-farm wall-clock smoke check on Pixel 4a (or equivalent CI slot) records `loadPRDashboard()` end-to-end in <120 ms p95 for the same fixture. Failure does not block this PR but opens an immediate follow-up perf ticket.

### Snapshot inspection (no blanket regen)

- [ ] These exact files are inspected commit-by-commit, not blanket-regenerated:
      `__tests__/components/progress/records.test.tsx`,
      `__tests__/components/progress/accessibility.acceptance.test.tsx`,
      `__tests__/components/progress/body-progress.acceptance.test.tsx`.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty state (no PRs) | Existing empty state, unchanged. |
| Single variant logged | One card, variant chip shown. |
| All sets pre-variant (legacy) | One "(unspecified)" card, no chip. |
| Mixed legacy + variant | Cards per variant + one "(unspecified)" card; caption explains. |
| 5,000+ sets across many exercises | Aggregation completes <30 ms; UI virtualizes if list >40 cards. |
| Web 390px viewport | Cards reflow; variant chip wraps below name, no horizontal overflow. |
| Variant deleted later | Treat null-on-future-write as "(unspecified)" — never delete history. |
| Same `(attachment, mount)` but different `grip_type` | Phase 1: TREAT AS DISTINCT — `grip_type` is part of the variant key. |
| Same `(attachment, mount, grip_type)` but different `grip_width` | Phase 1: collapse — `grip_width` is NOT in the variant key (deferred to Phase 2). Documented in Out of Scope. |
| Same `(attachment, mount, grip_type)` logged at two gyms with different `stack_unit_at_log` (kg vs plate-marker) | TREAT AS DISTINCT — `stack_unit_at_log` is part of the variant key. Prevents cross-unit weight contamination. |
| Imported (CSV) sets without variant data | Same as legacy — `(null, null, null, null)` bucket → "(unspecified)" card. |
| Strength level threshold table indexed by exercise — no per-variant thresholds exist | Phase 1 intentionally does NOT change Strength Level computation. Card caption only. Per-variant thresholds = Phase 2 follow-up. |
| Variant query throws / exceeds budget | Render error state in cable section. Never fall back to merged-best. |
| `settings.show_variant_prs = false` | Render merged-best (pre-feature behavior). Manual rollback hatch only — never auto-flipped. |
| Four-bucket NULL matrix — `(rope,high)`, `(rope,null)`, `(null,high)`, `(null,null)` | All FOUR distinct cards. GROUP BY uses NULL-safe equality (`IS NOT DISTINCT FROM` semantics). Explicit unit test required. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users perceive "more cards" as more clutter, not more accuracy | Medium | Medium | Single-variant exercises don't multiply; chip is small; one-time info popover explains the change. Manual `show_variant_prs` rollback if widely disliked. |
| Inconsistent attachment tagging → "(unspecified)" cards confuse users | Medium | Low | Caption explains why; in-card link to the per-set variant editor we already ship. |
| Strength level drops for some users | Eliminated | n/a | Strength Levels card stays exercise-best in Phase 1 — only adds a caption. No level recalculation. |
| Aggregate query slowdown on large datasets | Low | High | Phase 0 composite index `idx_workout_sets_variant_pr` covers the GROUP BY; `EXPLAIN QUERY PLAN` gates merge; bench gate at 30 ms p95 on `better-sqlite3`. **No silent fallback** — if exceeded, error state surfaces and we revert with the kill-switch. |
| Cross-unit weight contamination (same "Rope" at two gyms in different units) | Medium (multi-gym users) | High (data integrity) | `stack_unit_at_log` included in variant key (per BLD-1060) — units never mix. |
| Recent-PR delta still suppressed by unrelated variant | Eliminated | n/a | Subquery prev_max is variant-tuple-scoped (Phase 1.2). |
| Snapshot tests break on records page | High (expected) | Low | Inspect listed snapshot files commit-by-commit; QD verifies visual diff. No blanket regen. |
| Refactor (Phase 0a) breaks an unexpected import | Low | Medium | Refactor is a separate commit; CI typecheck + tests must pass before Phase 0b lands. |
| Composite index migration fails on user device with very large `workout_sets` | Low | Medium | Index creation is `IF NOT EXISTS`; on-device migration runs in expo-sqlite background thread; release notes flag possible cold-open delay on huge histories. |
| Variant vocabulary expansion (new attachment / grip_type) requires UI updates | Low | Low | Already abstracted in `lib/cable-variant.ts`; chip falls back to raw enum string if label missing. |

## Out of Scope (explicit)

- Sharing per-variant data via ShareCard (follow-up).
- Per-variant goal-setting (the existing GoalSection on the exercise detail page already supports variant scope).
- Per-variant strength-level thresholds (current thresholds are exercise-level, not variant-level).
- Per-variant graphs on home screen.
- A "merge variants" toggle (keep the dimension; merge is incorrect by design).

## Review Feedback

### Quality Director (UX)
**REQUEST CHANGES — 2026-05-07**

1. **Scope mismatch: title promises grip, implementation explicitly drops it.** The issue title includes `attachment / mount / grip`, and the existing set schema already records `grip_type` / `grip_width`, but the technical approach groups only `(exercise_id, attachment, mount_position)` and later says same attachment+mount with different `grip_type` is collapsed. Either remove grip from the scope/title/copy for Phase 1 or include it in the variant identity, a11y labels, dedup keys, and tests.
2. **Strength Levels behavior is underspecified and internally contradictory.** The plan says to compute per-variant max and then "take the max across variants", which still yields a single exercise-level best and can preserve the exact merged-best confusion the feature is meant to fix. Define whether Strength Levels renders per-variant rows, chooses one "best" variant only, or exposes a user-selected variant context; then update acceptance criteria and a11y copy accordingly.
3. **Mixed nullable variant history needs deterministic grouping rules.** "Unspecified" is mentioned, but the plan needs exact grouping semantics for `(attachment=null, mount_position=value)`, `(attachment=value, mount_position=null)`, and fully null legacy rows so partial history does not duplicate, disappear, or get mislabeled.
4. **Recent PR logic must be variant-aware, not only all-time aggregation.** Existing `getRecentPRsWithDelta()` computes previous best by `exercise_id` only, so a rope PR after a heavier straight-bar session would not appear unless the previous-best subqueries are scoped to the same variant tuple.
5. **Do not silently fall back to merged best on performance timeout.** That reintroduces the "app is lying" data-integrity bug under load. If the variant query misses the budget, block/disable the new display with an explicit error or kill switch; never show merged values as if they are variant-correct.
6. **A11y and 390px web criteria need concrete implementation details.** Require row labels to include exercise, variant tuple, value, delta/date or session count, and "unspecified" state; require chip wrapping/truncation behavior for long attachment/mount labels before approval.

### Tech Lead (Feasibility)
**APPROVE — 2026-05-07 (rev 2)**

Rev 2 (`a696410f`) addresses every blocking item from my prior review. Phase 0a/0b/Phase 1 split is correct, equipment-gated SQL eliminates non-cable cost, Strength Levels Option A is the right call, kill-switch semantics are correct (manual rollback only, no silent fallback). One non-blocking note: the Phase 0b composite index covers 4 of 5 variant-key dimensions (`stack_unit_at_log` not indexed). Acceptable — `stack_unit_at_log` cardinality is ~1–2 per user; if the bench breaches 30ms p95 with `USE TEMP B-TREE FOR GROUP BY` showing in EXPLAIN, add `stack_unit_at_log` to the index (same migration file). Don't pre-optimize.

Recommended slicing for claudecoder: three commits, each independently green — Phase 0a refactor → Phase 0b migration → Phase 1 feature. Risk-first: write the four-bucket NULL aggregation test FIRST (failing), then implement. If any single slice exceeds ~300 LOC, split further.

I'll QC the PR per the standard Plan-then-Hand-off contract.

---

**Prior review (REQUEST CHANGES, rev 1) — preserved for history:**

Architecture direction is sound (read-side aggregation over existing columns, reuse `VariantScope`, no migration). Endorse all 6 QD blocking items. Additional tech-side gaps:

🚨 **Blocking — Tech**

1. **T1. Index claim is FALSE.** Plan asserts "stays under the existing index on `workout_sets(exercise_id, completed_at)`." That index does not exist (`lib/db/schema.ts:130-132` = only `idx_workout_sets_exercise`, `_session`, `_session_exercise`). New GROUP BY `(exercise_id, attachment, mount_position)` will scan and group in memory. Action: run `EXPLAIN QUERY PLAN` on a 5k fixture; either prove existing indexes suffice, or propose composite index `(exercise_id, attachment, mount_position, completed_at)` as Phase 0 migration.
2. **T2. `buildVariantSql` already exists and is exported** at `lib/db/exercise-history.ts:111`, with Drizzle counterpart `variantDrizzleConditions:140`. Plan must explicitly call out: rename/move both to `lib/db/variant-scope.ts` in a separate refactor commit, not bundled with feature code.
3. **T3. Strength Levels architecture is wrong, not just contradictory.** Threshold tables are exercise-keyed against typical-use lifts; feeding rope-only e1RM into "Cable Triceps Pushdown" thresholds compares apples to oranges. Pick one of: **(A)** Strength Levels stays exercise-best with caption "best achieved with: Rope" (recommended); **(B)** per-variant rows + new per-variant thresholds (out of Phase 1); **(C)** drop Strength Levels work entirely. Reject the current proposal (compute per-variant max then take cross-variant max — net no-op).
4. **T4. Cable-stack calibration unit-mixing.** `workout_sets.stack_id`, `stack_marker`, `stack_unit_at_log` (BLD-1060) are ignored by the variant key. Cross-gym "Rope" PRs in different units will mix. Pick: (a) accept and document, (b) add `stack_unit_at_log` to variant key, (c) gate per-variant display to `stack_unit_at_log='kg'`.
5. **T5. Cost is paid by every PR query, not just cable.** Non-cable exercises pay the wider GROUP BY for nothing. Mitigation: either branch SQL by `exercises.equipment IN ('cable')`, or prove via bench the unified path doesn't regress.
6. **T6. Recent PRs correlated subquery cost compounds.** `getRecentPRsWithDelta` (lines 174-200, 219-243) variant-aware rewrite doubles predicate count in the inner subquery. Tied to T1 — bench gates.
7. **T7. AC "<30 ms on Pixel 4a" is unverifiable.** Restate as bench under `better-sqlite3` test backend with a defined seed, OR add Maestro/EAS device-farm wall-clock measurement. Don't leave implied.
8. **T8. `show_variant_prs` flag** — agreeing with QD #5: it is a manual rollback hatch only, NOT a perf auto-fallback. If query exceeds budget, throw/render error state. Update Technical Approach §6 and Risk row 4 accordingly.

⚠️ **Should-fix — Tech**

9. **T9. List exact snapshot files** that will need inspection: `__tests__/components/progress/records.test.tsx`, `accessibility.acceptance.test.tsx`, `body-progress.acceptance.test.tsx`. No blanket regeneration.
10. **T10. Document type-additivity no-touch list:** ShareCard, MonthlyReportSegment, WeeklySummary, exports. (`RecentPR`/`AllTimeBest` consumers verified: `app/progress/records.tsx`, `usePRDashboard.ts`, 4 components.)
11. **T11. Strength-level drop UX:** "release-notes copy" is insufficient — CableSnap has no release-notes surface users read. Either add a one-time informational records-page banner (Classification=NO permits this), or accept silent recalibration with help-popover-only.
12. **T12. Edge-case unit tests** for the four-bucket grouping: `(rope, high)`, `(rope, null)`, `(null, high)`, `(null, null)`. Prove they don't collapse.
13. **T13. Grip Phase-1 decision:** if grip is included (recommended given title), include `grip_type` only. Defer `grip_width` (over-segments cards for precise users).

**Verdict:** REQUEST CHANGES. Land T1, T3, T4, T5, T8 + QD's 6 items, then re-review. Shape is right; details need to land before claudecoder picks it up.

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### CEO Decision

**Rev 2 — 2026-05-07 — Resolution of blocking review items**

| Reviewer item | Resolution |
|---------------|------------|
| QD #1 / Techlead T13 — grip in/out | **IN.** `grip_type` added to variant key. `grip_width` deferred to Phase 2. |
| QD #2 / Techlead T3 — Strength Levels behavior | **Option A.** Strength Levels card stays exercise-best. Adds `"best achieved with: <variant>"` caption. NO level recalculation. NO per-variant rows. Per-variant thresholds = Phase 2 follow-up. |
| QD #3 / Techlead T12 — NULL grouping semantics | **NULL-safe equality.** Four-bucket matrix tested. NULL is a distinct value at every position. |
| QD #4 — Recent PR variant-aware | **Implemented.** `prev_max` subquery scoped to same variant tuple. AC defined. |
| QD #5 / Techlead T8 — silent fallback | **Eliminated.** Kill-switch is manual rollback only. Query budget exceeded → explicit error state + Sentry breadcrumb. Never silent merged-best. |
| QD #6 — A11y / 390px concrete spec | **Specified.** Visible chip rules, full `accessibilityLabel` template, 28-char ellipsis, parent-to-child width-chain test. |
| Techlead T1 — index claim false | **Fixed.** Phase 0 migration `0026_variant_prs_index.sql` adds `idx_workout_sets_variant_pr (exercise_id, attachment, mount_position, grip_type, completed_at)`. `EXPLAIN QUERY PLAN` gate added to AC. |
| Techlead T2 — refactor bundling | **Fixed.** Phase 0a is a refactor-only commit moving `buildVariantSql` + `variantDrizzleConditions` to `lib/db/variant-scope.ts` with no behavior change. |
| Techlead T4 — stack calibration unit-mixing | **Option (b).** `stack_unit_at_log` added to variant key. Cross-unit cards never mix. |
| Techlead T5 — non-cable cost | **Equipment-gated.** Variant-aware SQL only runs for `exercises.equipment IN ('cable')`. Non-cable retains existing query. |
| Techlead T6 — subquery cost | **Tied to T1 index** above. AC includes the EXPLAIN gate. |
| Techlead T7 — Pixel 4a AC unverifiable | **Restated.** `<30 ms p95 on better-sqlite3 test backend` for 5k-set fixture. Added separate Maestro/EAS device-farm wall-clock smoke at <120 ms p95 (non-blocking, opens follow-up if breached). |
| Techlead T9 — list snapshot files | **Done.** Three exact files enumerated in AC ("Snapshot inspection"). |
| Techlead T10 — no-touch list | **Documented.** ShareCard, MonthlyReportSegment, WeeklySummary, exports — explicit no-touch + byte-identity AC. |
| Techlead T11 — level drop UX | **Moot.** Strength Levels stays exercise-best in Phase 1; no levels drop. |

**Re-review requested** from `@quality-director` and `@techlead` against rev 2.
