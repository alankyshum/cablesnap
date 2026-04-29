# Feature Plan: Cable Setup Finder — Exercise Discovery by Equipment Configuration

**Issue**: BLD-873  **Author**: CEO  **Date**: 2026-04-29
**Status**: APPROVED

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
- As a user mid-workout, I want to tap an exercise from the results to view its details so I can decide whether to include it in my workout.
- As a new user exploring cable exercises, I want to browse exercises grouped by muscle group for a given setup so I can build a well-rounded cable workout.

## Proposed Solution

### Overview
Add a "Cable Setup Finder" screen accessible from the existing **Tools** section (`app/tools/`). The screen has two selector rows (mount position picker, attachment picker) and displays a filtered, muscle-group-grouped list of exercises matching the selected configuration. Tapping an exercise navigates to its detail screen.

### UX Design

**Entry point:** New card/button in `app/tools/index.tsx` — "Cable Setup Finder" with cable machine icon.

**Screen layout:**
1. **Header:** "Cable Setup Finder"
2. **Selector row 1:** Mount Position — 4 horizontally scrollable chips: High | Mid | Low | Floor. Default: none selected (show all). Selected chips use filled/highlighted style; unselected use outline style.
3. **Selector row 2:** Attachment — chips shown **dynamically** (only attachments that have >=1 cable exercise in the DB are shown). Default: none selected (show all). Same toggle affordance as mount position.
4. **Results area:** SectionList grouped by `primary_muscles`. Each section header shows muscle name + exercise count. Each row shows: exercise name, difficulty badge, mount position label (if filtering by attachment only), attachment label (if filtering by position only).
5. **Empty state:** "No exercises match this setup. Try a different mount position or attachment."
6. **Tap exercise name:** Navigates to existing exercise detail screen (`app/exercise/[id].tsx`). Back button returns to Cable Setup Finder with filters preserved.

**Accessibility:**
- All selectors use `accessibilityRole="button"` with `accessibilityState={{ selected }}`
- Section headers use `accessibilityRole="header"`
- Results list announces count: `accessibilityLabel="{N} exercises found"`

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
ORDER BY primary_muscles, name
```

**Dependencies:** None new. Uses existing components (Chip, Text, SectionList patterns from exercises.tsx).

**Performance:** Query is trivial — ~50 rows, single table, no joins. < 5ms on any device.

**Storage:** No new tables, columns, or migrations.

## Scope
**In:**
- Cable Setup Finder screen in Tools
- Filter by mount position and/or attachment
- Results grouped by muscle group (`primary_muscles`)
- Dynamic attachment chip visibility (hide chips with 0 exercises)
- Navigate to exercise detail on tap (with back-navigation preserving filters)

**Out:**
- Quick-add to active session (deferred to v2 — requires new `addExerciseToSession` function)
- Bodyweight exercise filtering (separate feature if needed)
- Custom exercise creation from this screen
- Exercise comparison view
- "Suggest a workout" auto-generation (behavior-shaping, would need psych review)
- Mount transition hints (already exist in session screen)

## Acceptance Criteria
- [ ] Given the user navigates to Tools → Cable Setup Finder When they select "High" mount position Then only exercises with mount_position = "high" are shown
- [ ] Given the user selects "Rope" attachment When combined with "Low" mount position Then only exercises matching both filters are shown
- [ ] Given no filters are selected When the screen loads Then all cable exercises are shown grouped by primary muscle group
- [ ] Given a filter combination matches zero exercises When displayed Then the empty state message "No exercises match this setup" is shown
- [ ] Given the user taps an exercise name When navigating Then the exercise detail screen opens
- [ ] Given the user navigates to exercise detail and presses back Then the Cable Setup Finder is shown with previous filters preserved
- [ ] Given the user selects a filter Then deselects it Then all cable exercises are shown again
- [ ] Given an attachment type has 0 exercises in the DB Then its chip is not shown in the attachment selector row
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
| Quick-add conflicts with session state | N/A | N/A | Deferred to v2 |

## Review Feedback
### Quality Director (UX)
**APPROVE WITH CONDITIONS** (2026-04-29)
- BLOCKER: `addExerciseToSession` does not exist — plan must clarify implementation approach (new function vs navigation reuse)
- Resolve "no active session" TBD — recommend hiding '+' button, not auto-starting sessions
- Seed data has 0 exercises for ring_handle, squat_harness, carabiner — consider dynamic chip visibility
- Add chip toggle visual affordance to UX spec
- Add back-navigation test case
### Tech Lead (Feasibility)
**APPROVE WITH CONDITIONS** (2026-04-29)
- BLOCKER: `addExerciseToSession` does not exist — recommend dropping quick-add from v1 scope (Option c)
- BLOCKER: "No active session" TBD unresolved — recommend hiding + button when no session active
- SQL grouping should use `primary_muscles`, not `category`
- Consider dynamic chip visibility for empty attachment types (ring_handle, squat_harness, carabiner have 0 exercises)
- Architecture fit is clean, complexity is low, no new dependencies, performance is trivial
### Psychologist (Behavior-Design)
N/A — Classification = NO. Purely informational exercise lookup tool.
### CEO Decision
**APPROVED** (2026-04-29)

Resolved review conditions:
1. **Quick-add dropped from v1** — `addExerciseToSession` doesn't exist; core value is discovery, not session integration. Quick-add deferred to v2.
2. **No-active-session TBD** — moot (quick-add removed).
3. **Dynamic attachment chips** — only show chips with >=1 exercise. Prevents dead-end UX for ring_handle/squat_harness/carabiner.
4. **SQL grouping** — changed to `primary_muscles` per techlead.
5. **Chip toggle affordance** — added filled/outline visual spec per QD.
6. **Back-navigation** — added acceptance criterion per QD.
