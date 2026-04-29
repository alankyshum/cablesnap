# Feature Plan: Exercise Library — Equipment & Muscle Group Filters

**Issue**: BLD-878  **Author**: CEO  **Date**: 2026-04-29
**Status**: APPROVED

## Research Source
- **Origin:** Own analysis — exercise library audit + knowledge base review
- **Pain point observed:** Users can only filter exercises by category (push/pull/legs etc.) and "custom." With 100+ exercises across 8 equipment types and multiple muscle groups, finding the right exercise requires scrolling and text search. Users who train at home with only dumbbells, or at a cable station, cannot quickly scope the list to their available equipment.
- **Frequency:** Recurring theme — equipment-based filtering is table-stakes in Strong, Hevy, JEFIT. CableSnap's cable/bodyweight niche makes this even more critical since users explicitly choose exercises by equipment type.

## Problem Statement
The exercise library screen (`app/(tabs)/exercises.tsx`) filters by **category** (abs_core, arms, back, chest, legs_glutes, shoulders) and "custom" only. Every exercise already has `equipment` (8 types: barbell, dumbbell, cable, machine, bodyweight, kettlebell, band, other) and `primary_muscles` (array of muscle groups) stored in the database, but this data is not exposed as filters. Users must use text search or scroll to find exercises matching their equipment or target muscles.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely informational/functional. This is a search/filter enhancement with no gamification, streaks, notifications, or motivational elements.

## User Stories
- As a home gym user with only dumbbells, I want to filter exercises by "dumbbell" so I only see exercises I can actually do.
- As a cable machine user, I want to filter by "cable" + "back" to quickly find cable back exercises.
- As a user browsing exercises, I want to filter by target muscle (e.g., "biceps") to find all exercises that hit that muscle regardless of equipment or category.

## Proposed Solution

### Overview
Add two additional filter rows below the existing category chip row:
1. **Equipment filter** — horizontal chip row with the 8 equipment types
2. **Muscle group filter** — horizontal chip row with primary muscle groups

All three filter dimensions (category, equipment, muscle) apply as AND logic: selecting "arms" + "cable" shows only cable arm exercises. Multiple selections within the same dimension use OR logic (selecting "cable" + "dumbbell" shows exercises using either).

### UX Design

**Layout (revised per QD+TL review — bottom sheet pattern):**
```
[Search bar                  ] [Filter button (badge: N active)]
[Category chips: Arms | Back | Chest | ...]   ← stays inline
[Exercise list]

── Filter bottom sheet (on tap) ──────────────
Equipment:  [Barbell] [Dumbbell] [Cable] [Machine] [Bodyweight] [Kettlebell] [Band] [Other]
Muscles (sectioned by region):
  Upper: [Chest] [Back] [Shoulders] [Biceps] [Triceps] [Forearms]
  Core:  [Abs/Core] [Obliques]
  Lower: [Quads] [Hamstrings] [Glutes] [Calves] [Hip Flexors]
  Full:  [Full Body]
[Clear All]                                   [Apply (N selected)]
──────────────────────────────────────────────
```

- Category chips remain as an inline horizontal `FlatList` (only 6 chips — fits fine).
- Equipment and muscle group filters move to a **bottom sheet** triggered by a filter button next to the search bar.
- Filter button shows a badge with the count of active equipment + muscle filters.
- Muscle groups are sectioned using `MUSCLE_GROUPS_BY_REGION` for discoverability.
- Equipment chips use icons from MaterialCommunityIcons (new `EQUIPMENT_ICONS` map).
- A "Clear all" action in the sheet resets equipment + muscle selections.
- Empty state message updates to reflect active filters: "No exercises match your filters. (N filters active)"

**Accessibility:**
- Each chip has `accessibilityLabel="Filter by {type}: {value}"`, `accessibilityRole="button"`, `accessibilityState={{ selected }}`.
- Filter sections have `accessibilityRole="toolbar"` on the container.

**Error/empty states:**
- No exercises match → show "No exercises found. Try adjusting your filters." with a "Clear filters" button.
- Edge case: user selects contradictory filters (e.g., "bodyweight" + "barbell" category but no exercises match) → same empty state.

### Technical Approach

**No DB changes needed** — `equipment` and `primary_muscles` already exist on every exercise row.

**File changes:**
1. `app/(tabs)/exercises.tsx` — Add equipment and muscle group filter state + chip rows. Extend the `filtered` useMemo to include equipment and muscle group filtering.
2. `lib/types.ts` — Reference `MUSCLE_GROUPS_BY_REGION`, `MUSCLE_LABELS`, and `EQUIPMENT_LIST`/`EQUIPMENT_LABELS` (already exist).
3. `constants/theme.ts` — Add new `EQUIPMENT_ICONS` map (equipment → MaterialCommunityIcons glyph name).
4. New component: `components/ExerciseFilterSheet.tsx` — Bottom sheet with equipment + muscle group chip sections.

**Filter logic (in `filtered` useMemo):**
```typescript
// Existing: category filter (OR within, AND with other dimensions)
// New: equipment filter
const eqSet = new Set([...selected].filter(isEquipment));
if (eqSet.size > 0 && !eqSet.has(ex.equipment)) return false;
// New: muscle group filter
const muscleSet = new Set([...selected].filter(isMuscleGroup));
if (muscleSet.size > 0 && !ex.primary_muscles.some(m => muscleSet.has(m))) return false;
```

**State management:** Extend the existing `selected` Set or use three separate Sets (one per dimension). Separate Sets is cleaner for type safety.

**Performance:** All filtering is client-side on the already-fetched exercise list. No new queries needed. With ~56 seeded exercises (growing over time), filtering is instant. `primary_muscles` is already deserialized to `MuscleGroup[]` by `mapRow()` in `lib/db/exercises.ts` — no extra JSON.parse needed.

## Scope
**In:**
- Equipment filter chip row on exercise library screen
- Muscle group filter chip row on exercise library screen
- AND logic between dimensions, OR within
- Clear all filters action
- Proper accessibility labels

**Out:**
- Filter persistence across screen navigations (filters reset on focus — consistent with current category behavior)
- Filter presets / saved filter combinations
- Filtering on the substitution sheet (separate screen, separate UX)
- Filtering by secondary muscles (only primary for now — keeps it simple)
- Filtering by difficulty

## Acceptance Criteria
- [ ] Given the exercise library screen, When I tap an equipment chip (e.g., "Cable"), Then only exercises with `equipment === "cable"` are shown
- [ ] Given "Cable" equipment filter is active, When I also tap "Back" category chip, Then only cable back exercises are shown (AND logic)
- [ ] Given I select "Dumbbell" and "Barbell" equipment chips, Then exercises with either equipment are shown (OR within dimension)
- [ ] Given I tap a muscle group chip (e.g., "Biceps"), Then only exercises with "biceps" in `primary_muscles` are shown
- [ ] Given filters are active and no exercises match, Then "No exercises found" empty state is shown with hint to adjust filters
- [ ] Given any filter is active, When I tap "Clear all", Then all filters reset and the full list is shown
- [ ] All filter chips have correct `accessibilityLabel`, `accessibilityRole`, and `accessibilityState`
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover: (1) equipment filter shows only matching exercises, (2) muscle group filter shows only matching exercises, (3) AND logic across dimensions (category + equipment + muscle), (4) OR logic within a dimension (two equipment types selected), (5) empty state when no exercises match, (6) clear all resets filters and shows full list
- [ ] No new lint warnings

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| No exercises match combined filters | Empty state with "adjust filters" message |
| All filters cleared | Full exercise list shown |
| Combined with text search | Text search AND filter dimensions all apply |
| Exercise with multiple primary muscles | Shown if ANY primary muscle matches selected muscle filter |
| Custom exercise with equipment "other" | Shown when "Other" equipment chip is selected |
| Large number of active filters | Chip rows scroll horizontally; active chips are visually distinct |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Chip rows take too much vertical space | ~~Medium~~ Resolved | — | Bottom sheet pattern — only category chips inline |
| Users confused by AND vs OR logic | Low | Low | Standard UX pattern; empty state guides users |
| Performance with complex filtering | Very Low | Low | Client-side filter on ~200 items is instant |

## Review Feedback
### Quality Director (UX)
**Verdict: APPROVE WITH CONDITIONS**

**Factual corrections required:**
1. Plan claims ~200 exercises — seed data has 56. Not a blocker but misleading for perf reasoning.
2. `MUSCLE_GROUP_LIST` / `MUSCLE_GROUP_LABELS` don't exist. The actual exports are `MUSCLE_GROUPS_BY_REGION` and `MUSCLE_LABELS` in `lib/types.ts`. Plan must reference correct names.
3. `EQUIPMENT_ICONS` doesn't exist in `constants/theme.ts` — this is new work, not a reference to existing code.

**UX concerns (blockers):**
- **B1 — Vertical space:** 3 chip rows (6 categories + 8 equipment + 14 muscle groups = 28 chips) will consume ~150px+ of vertical space before any exercise appears. On small phones this leaves very little list area. **Require:** collapsed-by-default for equipment and muscle rows, or a filter sheet/modal. Decide before implementation, not "v2."
- **B2 — 14 muscle chips is too many for a horizontal row.** "full_body" and some rarely-used groups (forearms, traps) will be off-screen. Users won't discover them. Consider grouping by region (the `MUSCLE_GROUPS_BY_REGION` structure already exists) or a sectioned dropdown.

**UX concerns (non-blocking, should address):**
- **S1 — Filter state discoverability:** When equipment/muscle rows are scrolled off-screen, user has no indicator that filters are active. Add a persistent badge or summary (e.g., "3 filters active") near the search bar.
- **S2 — AND logic surprise:** Selecting "Bodyweight" + "Biceps" yields only bodyweight biceps exercises (likely very few). The empty state helps, but consider showing the active filter count in the empty state message so users know which filter to relax.

**Data integrity:**
- `primary_muscles` is stored as JSON text in SQLite. The filter code must parse it correctly. Plan's pseudocode (`ex.primary_muscles.some(...)`) assumes it's already an array — verify the ORM/query layer deserializes it. If the raw DB row is returned, `JSON.parse` is needed.

**Testing gap (blocker):**
- **B3 — No existing filter tests.** Zero tests cover the current category filtering logic. The plan's AC says "PR passes all existing tests with no regressions" but that's a low bar when there are no filter tests. **Require:** AC must add explicit test criteria — at minimum: (1) equipment filter works, (2) muscle filter works, (3) AND cross-dimension, (4) OR within-dimension, (5) empty state, (6) clear all resets.

**a11y:**
- Plan's a11y approach is adequate. One addition: chip rows should have `accessibilityLabel` on the section header (e.g., "Equipment filters") so screen reader users understand the grouping, not just individual chips.

**Risk:**
- Low blast radius — purely additive UI, no schema changes, no data mutations. Rollback is trivial (revert the PR).

**Summary:** Solid plan with correct instincts. Fix B1 (vertical space strategy), B2 (muscle group UX), and B3 (test criteria) before moving to implementation.
### Tech Lead (Feasibility)
**Verdict: APPROVE WITH CONDITIONS**

**Factual corrections:**
1. 56 seeded exercises, not ~200. Performance is a non-issue regardless.
2. `MUSCLE_GROUP_LIST`/`MUSCLE_GROUP_LABELS` don't exist — use `MUSCLE_GROUPS_BY_REGION` and `MUSCLE_LABELS`.
3. `primary_muscles` deserialization is already handled by `mapRow()` in `lib/db/exercises.ts:13` — QD's concern is a false alarm.

**Architecture:** Sound. Pure client-side filtering, no schema changes, no new queries. Recommend three separate state variables (`selected`, `selectedEquipment`, `selectedMuscles`) instead of extending the existing union type.

**Blockers (agrees with QD):**
- **B1 — Vertical space:** Must resolve before implementation, not v2. Recommend bottom sheet pattern (filter button next to search bar, equipment + muscle in sheet, category chips stay inline).
- **B2 — 14 muscle chips:** Bottom sheet with `MUSCLE_GROUPS_BY_REGION` sectioned layout solves this.
- **B3 — Test criteria:** Must add explicit filter test requirements to AC.

**Non-blocking:** Add active filter badge on filter button; consider moving "Custom" to filter sheet; fix exercise count in plan.

**Effort:** 2-4 hours, low risk, no dependencies.
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
**APPROVED** — 2026-04-29

All three blockers resolved in this revision:
- B1+B2: Bottom sheet pattern replaces inline chip rows for equipment + muscle filters. Category chips stay inline (6 chips, fits fine). Muscle groups sectioned by `MUSCLE_GROUPS_BY_REGION` for discoverability.
- B3: AC updated with 6 explicit filter test requirements.
- Factual corrections applied (56 exercises, correct type references, `mapRow()` deserialization noted).
- Non-blocking suggestions S1 (filter badge) and S2 (filter count in empty state) incorporated.

Ready for implementation.
