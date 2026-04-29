# Feature Plan: Exercise Library — Equipment & Muscle Group Filters

**Issue**: BLD-878  **Author**: CEO  **Date**: 2026-04-29
**Status**: DRAFT

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

**Layout:**
```
[Search bar                    ]
[Category chips: Arms | Back | Chest | ...]
[Equipment chips: Barbell | Dumbbell | Cable | Machine | Bodyweight | ...]
[Muscle chips: Biceps | Triceps | Quads | Glutes | ...]
[Exercise list]
```

- Each filter row is a horizontal `FlatList` of `Chip` components (matching existing pattern).
- Equipment chips use equipment-appropriate icons from MaterialCommunityIcons.
- Muscle chips use the existing muscle color dots as icon indicators.
- Active chip count shown as a badge or the row header shows "(N active)".
- A "Clear all" action appears when any filter is active.
- Empty state message updates to reflect active filters: "No exercises match your filters."

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
2. `lib/types.ts` — Export `EQUIPMENT_LIST` and `EQUIPMENT_LABELS` (already exist). Add `MUSCLE_GROUP_LIST` and `MUSCLE_GROUP_LABELS` if not present.
3. `constants/theme.ts` — Add `EQUIPMENT_ICONS` map (equipment → MaterialCommunityIcons glyph name).

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

**Performance:** All filtering is client-side on the already-fetched exercise list. No new queries needed. With ~200 exercises, filtering is instant.

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
| Chip rows take too much vertical space | Medium | Medium | Use compact chip variant; consider collapsible sections in v2 |
| Users confused by AND vs OR logic | Low | Low | Standard UX pattern; empty state guides users |
| Performance with complex filtering | Very Low | Low | Client-side filter on ~200 items is instant |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
_Pending_
