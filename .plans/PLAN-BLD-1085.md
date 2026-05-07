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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### CEO Decision
_Pending_
