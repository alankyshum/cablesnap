# Feature Plan: Per-Variant PRs in Global PR Dashboard & Strength Levels

**Issue**: BLD-1085  **Author**: CEO  **Date**: 2026-05-07
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

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

## Proposed Solution

### Overview

Extend the same variant-aware aggregation already used on the per-exercise screen (`exercise-history.ts` `VariantScope`) into the **global** record/strength queries, then surface variant-tagged PR cards in the existing PR Dashboard UI without inventing new screens.

### UX Design

#### All-Time Bests / Recent PRs cards (records page)

- A cable exercise that has logged sets across **multiple distinct (attachment[, mount_position]) tuples in the last N days** renders one PR card per tuple, ordered by most recent PR.
- Card title: `Cable Triceps Pushdown` with a small **variant chip** below: `Rope · Single-handle · No mount`. Existing typography, no new card style.
- Non-cable exercises and cable exercises with only one logged variant render exactly as today (no behavior change).
- An info row at the top of the records page surfaces a one-line note when variants are present: "Cable exercises now show per-attachment records. [Why?](info popover)" — copy is neutral, not motivational.

#### Strength Levels card

- Compute the strength level from the **best matched variant** per exercise (i.e. apply per-variant best to threshold tables) — not from the merged best.
- If the user has no variant data for a cable exercise (legacy logs), fall back to the merged best, with a small "(unspecified)" caption so the discrepancy is explainable.

#### Empty / Edge states

- A user with 0 cable sets sees an unchanged dashboard — no UI regression.
- A user with cable sets but only one variant per exercise (e.g. always rope) sees one card per exercise, indistinguishable from today except for the small variant chip — net-zero noise.
- A user mid-migration (some sets variant-tagged, some null) sees a "Variants partially logged — older sets aggregated under (unspecified)" caption on affected cards. No data is hidden.

#### A11y

- Variant chip must include an `accessibilityLabel` like `"Variant: Rope, no mount position"` so screen readers disambiguate.
- Per-variant cards must each have a unique `accessibilityLabel` containing both exercise name and variant.

### Technical Approach

1. **Extend `pr-dashboard.ts`** with a variant-aware mode:
   - New helper `bestPerVariant(exerciseId)` that returns `{ attachment, mount_position, weight, reps, e1rm, achievedAt }[]` ordered by achievedAt DESC, computed from `workout_sets` grouped by `(exercise_id, attachment, mount_position)`.
   - Existing `loadPRDashboard()` keeps its current shape but appends a `variants?: VariantBest[]` field per record so existing consumers ignore it harmlessly (additive, non-breaking).
   - Use the SAME `buildVariantSqlFragment` helper from `exercise-history.ts` (factor it out into a shared `lib/db/variant-scope.ts` if not already shared) to avoid duplicate logic.

2. **Strength levels (`lib/db/strength-overview.ts`)**: extend the per-exercise best lookup to compute per-variant max, then take the max across variants for the threshold check. Keep a `bestVariantTuple` field for UI display so the card can caption which variant achieved the level.

3. **Records UI (`components/progress/records/AllTimeBestsSection.tsx`, `RecentPRList.tsx`)**:
   - When `record.variants?.length > 1`, render one card per variant.
   - When `record.variants?.length <= 1`, render today's single card.
   - Add a `<VariantChip />` micro-component (reuse `ATTACHMENT_LABELS` / `MOUNT_LABELS` from `lib/cable-variant.ts`).

4. **No new tables, no migration.** Pure read-side feature on existing data.

5. **Performance**: PR dashboard is loaded once per visit. Per-variant grouping adds at most ~5–10 extra rows per cable exercise; aggregate query stays under the existing index on `workout_sets(exercise_id, completed_at)`. Add a benchmark in `__tests__/db/pr-dashboard.bench.ts` to confirm <30 ms for a 5,000-set fixture.

6. **Settings flag (low-friction kill switch)**: `settings.show_variant_prs` defaults `true`. Hidden in dev settings only — not surfaced in the main settings UI. Lets QD or a future bug-fix PR disable the new behavior without code revert if a regression slips.

### Storage / data

No schema change. All logic is read-side aggregation over existing columns.

### Dependencies

None new. All needed primitives exist:
- `lib/cable-variant.ts` (vocabulary + labels)
- `lib/db/exercise-history.ts` (variant scope helper)
- `components/exercise/ExerciseVariantFilter.tsx` (UX precedent)

## Scope

**In:**
- Per-variant PR cards on the global PR Dashboard for cable exercises.
- Per-variant strength-level computation on the Strength Levels card.
- Variant chip micro-component reused across both surfaces.
- One info popover/help link.
- Tests for: aggregation correctness, fallback for null-attachment legacy rows, single-variant exercises rendering unchanged, perf regression bench.

**Out:**
- Sharing the variant breakdown to other surfaces (home screen StatsRow, weekly summary). Defer to follow-up.
- New analytics/charts beyond what records.tsx already shows.
- Cloning or splitting exercises in the catalog (not needed — variants are dimensions, not exercises).
- Editing variant data on existing sets retroactively (separate feature).
- Bodyweight grip width as a PR dimension (defer; bodyweight has its own modifier_kg axis).

## Acceptance Criteria

- [ ] **Given** a user has logged Cable Triceps Pushdown with rope (max 30 kg) and straight bar (max 40 kg), **When** they open Progress → Records, **Then** they see exactly two PR cards for that exercise, each labeled with its variant chip and showing the correct max for that variant.
- [ ] **Given** a user has logged Cable Triceps Pushdown only with the rope, **When** they open Progress → Records, **Then** they see exactly one PR card (variant chip optional but allowed), and the card looks visually identical to a non-cable single-record card aside from the chip.
- [ ] **Given** a user has only legacy (null-attachment) cable sets, **When** they open Progress → Records, **Then** they see one card labeled "(unspecified)" with a one-line caption explaining variant tagging.
- [ ] **Given** a user with no cable sets at all, **When** they open Progress → Records, **Then** the rendered output byte-matches the pre-change snapshot (no regression).
- [ ] Strength Levels card shows the correct level for a user whose rope-only progression would land them in `Intermediate` even though their straight-bar number would push them to `Advanced` — the level is the **per-variant** best, not the merged best, and the card captions which variant achieved it.
- [ ] PR aggregation query for a 5,000-set fixture completes in <30 ms on the slowest supported device (Pixel 4a equivalent).
- [ ] No new lint warnings, no new TS errors, all existing tests pass.
- [ ] Web build at 390px viewport renders the records page without overflow.

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
| Same `(attachment, mount)` but different `grip_type` | Phase 1: collapse on (attachment, mount) only — grip is a finer dimension we'll address later if user feedback demands it. Document this explicitly. |
| Imported (CSV) sets without variant data | Same as legacy — "(unspecified)". |
| Strength level threshold table indexed by exercise — no per-variant thresholds exist | We use the SAME thresholds; variant-aware logic only changes which best lift we feed in. No threshold table changes needed. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users perceive "more cards" as more clutter, not more accuracy | Medium | Medium | Single-variant exercises don't multiply; chip is small; one-time info popover explains the change. Settings kill switch (`show_variant_prs`) lets us roll back. |
| Some users have inconsistent attachment tagging → confusing "(unspecified)" cards | Medium | Low | Caption explains why, pointing to the per-set variant editor we already ship. |
| Strength level *drops* for some users when computed per-variant | Low | Medium | Add release-notes copy explaining the correction; user-facing comms emphasize "more accurate" not "downgrade". |
| Aggregate query slowdown on large datasets | Low | Medium | Bench gate at 30 ms; existing index covers grouping; fall back to merged best if query exceeds budget. |
| Snapshot/screenshot tests break on records page | High (expected) | Low | Update snapshots in same PR; QD verifies visual regression. |
| Variant vocabulary expansion (e.g., new attachment) requires UI updates | Low | Low | Already abstracted in `lib/cable-variant.ts`. |

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
**REQUEST CHANGES — 2026-05-07**

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
_Pending_
