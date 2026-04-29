# Feature Plan: Cable Setup Finder — Exercise Discovery by Equipment Configuration

**Issue**: BLD-873  **Author**: CEO  **Date**: 2026-04-29
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Internal analysis of CableSnap's unique data model (50+ cable exercises with `mount_position` and `attachment` metadata) and common workout tracker frustrations
- **Pain point observed:** "I'm at the cable machine with the rope on the high pulley — what exercises can I do?" Users must scroll through the full exercise library and mentally filter. No workout app offers setup-based discovery.
- **Frequency:** Recurring theme — cable machine users frequently change attachments and positions mid-workout and want to discover what's possible from their current setup without leaving the station.

## Problem Statement

CableSnap has rich cable machine metadata (mount position: high/mid/low/floor; attachment: handle/ring_handle/ankle_strap/rope/bar/squat_harness/carabiner) stored on every cable exercise. This data powers the exercise library's display labels but is **not queryable by the user**. Users cannot filter exercises by their current equipment configuration.

Cable machines are uniquely versatile — a single station with different mount positions and attachments enables dozens of different exercises targeting different muscle groups. But discovering this versatility requires either memorization or external research. CableSnap can solve this on-device with zero latency because the data already exists locally.

This is CableSnap's key product differentiator. No competitor (Strong, JEFIT, Hevy, FitNotes) offers equipment-configuration-aware exercise discovery.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely informational/functional. This is an exercise discovery/lookup tool. No gamification, streaks, notifications, motivational pressure, or habit loops. Users explicitly navigate to it when they want to find exercises.

## User Stories
- As a cable machine user, I want to select my current mount position and attachment so that I can see all exercises I can do without changing my setup.
- As a user mid-workout, I want to tap an exercise from the results and add it directly to my current session so I can keep training without navigating away.
- As a new user exploring cable exercises, I want to browse exercises grouped by muscle group for a given setup so I can build a well-rounded cable workout.

## Proposed Solution

### Overview
Add a "Cable Setup Finder" screen accessible from the existing **Tools** section (`app/tools/`). The screen has two selector rows (mount position picker, attachment picker) and displays a filtered, muscle-group-grouped list of exercises matching the selected configuration. Each exercise row has a quick-add button for adding to the current active session (if one exists).

### UX Design

**Entry point:** New card/button in `app/tools/index.tsx` — "Cable Setup Finder" with cable machine icon.

**Screen layout:**
1. **Header:** "Cable Setup Finder"
2. **Selector row 1:** Mount Position — 4 horizontally scrollable chips: High | Mid | Low | Floor. Default: none selected (show all).
3. **Selector row 2:** Attachment — 7 horizontally scrollable chips: Handle | Ring Handle | Ankle Strap | Rope | Bar | Squat Harness | Carabiner. Default: none selected (show all).
4. **Results area:** SectionList grouped by primary muscle group. Each section header shows muscle name + exercise count. Each row shows: exercise name, difficulty badge, mount position label (if filtering by attachment only), attachment label (if filtering by position only).
5. **Empty state:** "No exercises match this setup. Try a different mount position or attachment."
6. **Quick-add button:** If an active session exists, show a "+" icon on each exercise row. Tapping it adds the exercise to the current session (calls existing `addExerciseToSession` logic) and shows a brief toast "Added to session."
7. **Tap exercise name:** Navigates to existing exercise detail screen (`app/exercise/[id].tsx`).

**Accessibility:**
- All selectors use `accessibilityRole="button"` with `accessibilityState={{ selected }}`
- Section headers use `accessibilityRole="header"`
- Results list announces count: `accessibilityLabel="{N} exercises found"`
- Quick-add button: `accessibilityLabel="Add {exercise name} to session"`

**Error states:** None expected — this is a pure local query with no failure modes beyond empty results.

### Technical Approach

**New files:**
- `app/tools/cable-finder.tsx` — screen component
- `lib/db/cable-finder.ts` — DB query module

**DB query** (no schema changes needed — all data exists):
```sql
SELECT id, name, category, primary_muscles, secondary_muscles,
       equipment, difficulty, mount_position, attachment
FROM exercises
WHERE equipment = 'cable'
  AND (mount_position = ? OR ? IS NULL)
  AND (attachment = ? OR ? IS NULL)
ORDER BY category, name
```

**Dependencies:** None new. Uses existing components (Chip, Text, SectionList patterns from exercises.tsx).

**Performance:** Query is trivial — ~50 rows, single table, no joins. < 5ms on any device.

**Storage:** No new tables, columns, or migrations.

## Scope
**In:**
- Cable Setup Finder screen in Tools
- Filter by mount position and/or attachment
- Results grouped by muscle group
- Quick-add to active session
- Navigate to exercise detail on tap

**Out:**
- Bodyweight exercise filtering (separate feature if needed)
- Custom exercise creation from this screen
- Exercise comparison view
- "Suggest a workout" auto-generation (behavior-shaping, would need psych review)
- Mount transition hints (already exist in session screen)

## Acceptance Criteria
- [ ] Given the user navigates to Tools → Cable Setup Finder When they select "High" mount position Then only exercises with mount_position = "high" are shown
- [ ] Given the user selects "Rope" attachment When combined with "Low" mount position Then only exercises matching both filters are shown
- [ ] Given no filters are selected When the screen loads Then all cable exercises are shown grouped by muscle group
- [ ] Given a filter combination matches zero exercises When displayed Then the empty state message "No exercises match this setup" is shown
- [ ] Given an active session exists When the user taps the "+" button on an exercise Then the exercise is added to the session and a toast confirms
- [ ] Given no active session exists When viewing results Then no "+" button is shown (or it starts a quick session — TBD in review)
- [ ] Given the user taps an exercise name When navigating Then the exercise detail screen opens
- [ ] Given the user selects a filter Then deselects it Then all cable exercises are shown again
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] Screen renders correctly in both light and dark themes
- [ ] All interactive elements have appropriate accessibility labels

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| No cable exercises in DB (fresh install before seed) | Empty state with helpful message |
| Custom cable exercise with no mount_position | Shown when no mount filter is active; hidden when any mount filter is active |
| Both filters active, then one deselected | Results update to match remaining filter only |
| Very small screen (320px width) | Chip rows scroll horizontally; results list scrolls vertically |
| Rapid filter toggling | No flicker; query is synchronous-fast (<5ms) |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Exercise seed data has inconsistent mount_position/attachment | Low | Medium | Audit seed data during implementation; add validation test |
| Users don't discover the feature in Tools | Medium | Low | Feature is supplementary; consider home screen shortcut in future iteration |
| Quick-add conflicts with session state | Low | Medium | Use existing addExerciseToSession with proper error handling |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO. Purely informational exercise lookup tool.
### CEO Decision
_Pending_
