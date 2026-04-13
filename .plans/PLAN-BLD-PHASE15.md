# Phase 15: Weekly Muscle Group Volume Analysis

**Issue**: BLD-23
**Author**: CEO
**Date**: 2026-04-13
**Status**: IN_REVIEW — Rev 1 (addressing QD + techlead feedback)

## Problem Statement
Users can see total weekly volume and personal records, but have no way to analyze training balance across muscle groups. They cannot tell if they are neglecting back work, over-training chest, or under-training legs. This is one of the most common training mistakes, especially for intermediate lifters.

FitForge already stores `primary_muscles` and `secondary_muscles` on every exercise — this data is unused for analysis. Surfacing muscle group volume gives users actionable insight to improve their training programs.

## User Stories
- As a lifter, I want to see how many sets per muscle group I did this week so I can identify undertrained areas
- As a program user, I want to verify my program provides balanced muscle coverage
- As a returning user, I want to see muscle volume trends over multiple weeks so I can track programming improvements

## Proposed Solution

### Overview
Add a "Muscles" segment to the existing Progress tab that shows weekly set volume broken down by muscle group. Show custom View-based horizontal bars of sets per muscle group for the current week, a weekly trend line chart for a selected muscle group, and science-based volume landmarks (minimum effective volume, maximum recoverable volume). Extract the entire Muscles segment into a standalone component (`components/MuscleVolumeSegment.tsx`) to keep `progress.tsx` under 900 lines.

### UX Design

#### Navigation
- Add a third segment to Progress tab: "Workouts | Body | Muscles"
- Default to "Workouts" segment (no change to existing behavior)

#### Muscles Segment — Layout

**1. Week Selector**
- Shows current week by default ("This Week: Apr 7 – Apr 13")
- Left/right chevron buttons to navigate weeks
- Right chevron hidden/disabled on current week (cannot navigate into future)
- **Today pill button**: appears when navigating away from current week — tapping resets to current week (replaces "tap label to reset" which was not discoverable)

**2. Muscle Volume Card (custom View-based horizontal bars)**
- **Custom View-based horizontal bars** — NOT react-native-chart-kit BarChart (which only supports vertical bars). Each bar is a themed `View` with width proportional to `sets / maxSets`. This is simpler, more accessible, and gives full control over layout and touch targets.
- Each bar is a `Pressable` with clear accessibilityLabel
- One bar per muscle group that has >0 sets this week
- Bar label: muscle group name (left-aligned)
- Bar value: set count (right of bar)
- Bars sorted by volume descending
- Color coding: bar fills use theme.colors.primary
- **Loading state**: Show a skeleton/spinner while data loads
- **Error state**: Show error message with "Retry" button if query fails
- Empty state: "No workouts this week. Complete a session to see muscle volume."

**3. Volume Landmarks (vertical reference lines on custom bars)**
- Show subtle dotted **vertical** reference lines overlaid on the bar area at:
  - MEV (Minimum Effective Volume): ~10 sets/week for most muscle groups
  - MRV (Maximum Recoverable Volume): ~20 sets/week for most muscle groups
- These are general guidelines, shown as faint reference markers (not hard rules)
- Label: "MEV" and "MRV" in small text at top of reference lines

**4. Weekly Trend (line chart)**
- Tapping a muscle group bar selects it
- Shows an 8-week line chart of sets per week for the selected muscle group
- X-axis: week labels (e.g., "W1", "W2", ... "W8")
- Y-axis: sets
- Default selection: the muscle group with highest volume
- Uses react-native-chart-kit `LineChart` (which it handles well — unlike BarChart)
- **New user guard**: If fewer than 2 weeks of data exist, show message "Keep training to see your trends" instead of a chart with one data point and 7 empty weeks
- Respect `useReducedMotion()` — disable or simplify chart animations for users who request it

**5. Muscle Group List (detail)**
- Below the charts, show a FlatList of all muscle groups trained
- Each row: muscle group name, set count, exercise count
- Tapping a row selects it for the trend chart (same as tapping bar)

#### Accessibility
- All charts have accessibilityLabel summarizing the data (e.g., "Chest: 16 sets this week")
- Bar chart bars have accessibilityRole="image" with descriptive label
- **accessibilityHint on tappable bars**: "Double tap to see weekly trend" so VoiceOver users know the interaction
- Week navigation buttons have accessibilityLabel ("Previous week", "Next week")
- **accessibilityLiveRegion="polite" on week label**: When user taps chevron and chart data updates, VoiceOver announces the new week
- Minimum touch target 48x48dp for all interactive elements
- Respect `useReducedMotion()` — disable chart animations when system setting is on

### Technical Approach

#### Data Source
- Query `workout_sets` joined with `workout_sessions` and `exercises`
- Filter by session `completed_at` within the target week (Mon 00:00 to Sun 23:59, device local timezone)
- **Only count completed sets**: filter `workout_sets.completed = 1` (not just sessions with completed_at IS NOT NULL). Partially completed sessions should not inflate volume.
- Parse `primary_muscles` JSON array from exercises table
- Count sets per muscle group (each set counts toward all primary muscles of the exercise)
- Secondary muscles are out of scope for v1

**IMPORTANT — Week Boundary Inconsistency (techlead M1):**
The existing `getWeeklySessionCounts()` and `getWeeklyVolume()` in lib/db.ts use `(started_at / 604800000) * 604800000` which produces Thursday-aligned weeks (Unix epoch started on Thursday). This Phase 15 feature uses correct Mon-Sun weeks. This means a Monday workout might show in different weeks depending on which tab the user is viewing. 

**Decision**: Ship Phase 15 with correct Mon-Sun boundaries. Create a follow-up issue to fix existing Workouts tab queries to also use Mon-Sun alignment. The existing queries are technically buggy — fixing them is the right long-term approach, but out of scope for this feature.

#### New DB Functions (in lib/db.ts)
```typescript
// Get sets per muscle group for a given week
export async function getMuscleVolumeForWeek(
  weekStart: number // epoch ms of Monday 00:00
): Promise<{ muscle: MuscleGroup; sets: number; exercises: number }[]>

// Get weekly muscle volume trend (last N weeks)
export async function getMuscleVolumeTrend(
  muscle: MuscleGroup, // use MuscleGroup type for type safety
  weeks: number // how many weeks back
): Promise<{ week: string; sets: number }[]>
```

#### Query Strategy
Single query approach — join workout_sets to workout_sessions to exercises, filter by date range AND `workout_sets.completed = 1`, parse primary_muscles JSON in JS (not SQL), aggregate in memory. The data set is bounded (one week of workouts = typically 3-6 sessions x 20-30 sets = under 200 rows). Use `useMemo` to cache the aggregated results and avoid recomputing on every render.

#### New/Modified Files
| File | Change |
|------|--------|
| lib/db.ts | Add getMuscleVolumeForWeek(), getMuscleVolumeTrend() |
| app/(tabs)/progress.tsx | Add "Muscles" segment selector, render MuscleVolumeSegment component |
| **components/MuscleVolumeSegment.tsx** | **NEW** — extracted Muscles segment component (week selector, custom bars, trend chart, detail list). Keeps progress.tsx under 900 lines. |

No new screens needed — this is an addition to the existing Progress tab.

#### Performance Requirements
- `useMemo` for all data processing (JSON parsing, aggregation, sorting)
- `React.memo` on FlatList `renderItem` component for muscle group detail list
- `keyExtractor` with stable IDs (muscle group name) on FlatList
- Avoid re-renders when switching weeks — memoize chart data per week

#### Dependencies
- react-native-chart-kit (already installed — used for existing charts)
- No new dependencies

### Scope
**In Scope:**
- Custom View-based horizontal bars for muscle volume (NOT chart-kit BarChart)
- Muscle group volume bar chart (current week)
- Week selector (navigate between weeks) with Today pill button
- Volume landmarks (MEV/MRV vertical reference lines on custom bars)
- Weekly trend line chart for selected muscle group (8 weeks, using chart-kit LineChart)
- Muscle group detail list
- Primary muscles counting only (secondary muscles out of scope)
- Loading, error, and empty states
- Component extraction to components/MuscleVolumeSegment.tsx

**Out of Scope:**
- Secondary muscle contribution (0.5x counting)
- Muscle heatmap visualization (body outline)
- Custom volume landmarks per muscle group
- Exercise filtering by muscle group (tap to navigate)
- Volume recommendations or AI-powered suggestions
- Push notifications for volume targets
- Fixing existing Workouts tab week boundary bug (follow-up issue)
- Expanding "full_body" exercises to individual muscle groups (known limitation for v1)

### Acceptance Criteria
- [ ] GIVEN user opens Progress tab WHEN tapping Muscles segment THEN see muscle volume bar chart for current week
- [ ] GIVEN no workouts this week WHEN viewing Muscles segment THEN show empty state message
- [ ] GIVEN data is loading WHEN viewing Muscles segment THEN show loading spinner/skeleton
- [ ] GIVEN query fails WHEN viewing Muscles segment THEN show error message with Retry button
- [ ] GIVEN user has workouts WHEN viewing bar chart THEN bars sorted by volume descending
- [ ] GIVEN user taps left chevron WHEN on current week THEN previous week data loads
- [ ] GIVEN user taps right chevron WHEN on previous week THEN next week data loads (no future beyond current week)
- [ ] GIVEN user navigates away from current week WHEN viewing week selector THEN Today pill button appears
- [ ] GIVEN user taps Today pill WHEN on previous week THEN resets to current week
- [ ] GIVEN user taps a muscle group bar WHEN trend chart visible THEN trend updates to show 8-week history for that muscle
- [ ] GIVEN fewer than 2 weeks of data WHEN viewing trend chart THEN show "Keep training to see your trends" message
- [ ] GIVEN a workout with bench press (primary: chest, anterior deltoid, triceps) WHEN viewing muscle volume THEN each primary muscle group gets +1 set per completed set
- [ ] GIVEN partially completed session WHEN viewing volume THEN only sets with completed=1 are counted
- [ ] GIVEN volume landmarks enabled WHEN bar exceeds MEV (10 sets) THEN vertical dotted reference line visible at 10
- [ ] GIVEN volume landmarks enabled WHEN bar exceeds MRV (20 sets) THEN vertical dotted reference line visible at 20
- [ ] GIVEN muscle group detail list WHEN viewing THEN each row shows muscle name, set count, exercise count
- [ ] Muscles segment extracted to components/MuscleVolumeSegment.tsx (progress.tsx stays under 900 lines)
- [ ] useMemo used for data processing (JSON parsing, aggregation)
- [ ] React.memo on FlatList renderItem component
- [ ] keyExtractor with stable IDs on FlatList
- [ ] All interactive elements have accessibilityLabel
- [ ] accessibilityHint on tappable bars ("Double tap to see weekly trend")
- [ ] accessibilityLiveRegion="polite" on week label for VoiceOver
- [ ] Week navigation buttons have 48x48dp minimum touch target
- [ ] All colors use theme tokens (no hardcoded hex)
- [ ] Charts respect useReducedMotion() — disable animations when system setting is on
- [ ] FlatList used for muscle group list (not ScrollView+map)
- [ ] PR passes typecheck with zero errors
- [ ] No new lint warnings

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts this week | Show empty state with message |
| Exercise with no primary_muscles | Skip (do not count toward any muscle group) |
| Very long muscle group name | Truncate with ellipsis in bar labels |
| 20+ muscle groups in one week | FlatList scrolls, bar chart shows all |
| Only 1 workout this week | Still show bar chart with whatever muscles were hit |
| Cancelled session (no completed_at) | Exclude from volume count |
| Week boundary (timezone) | Use device local timezone for week boundaries (Mon 00:00 to Sun 23:59) |
| Exercise deleted after logging | Sets still count (join on exercise_id, show "Unknown" if exercise deleted) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| JSON parsing primary_muscles slow for large datasets | Low | Low | Bounded by 1 week of data (under 200 sets typical). useMemo prevents recomputation. |
| Week boundary inconsistency with Workouts tab | Med | Med | Ship Phase 15 with correct Mon-Sun. Follow-up issue to fix existing Workouts queries. |
| Muscle group naming inconsistency across exercises | Med | Med | Normalize muscle names to lowercase during aggregation. MuscleGroup typed union enforces valid names. |
| progress.tsx file size | High | Med | Mandatory extraction to components/MuscleVolumeSegment.tsx |
| "full_body" meta-category showing alongside specific muscles | Low | Low | Known limitation for v1. Document in-app or exclude in v2. |

### Known Limitations (v1)
- **full_body exercises**: Exercises with `primary_muscles: ["full_body"]` will show a single "Full Body" bar instead of distributing to individual muscles. This is semantically imperfect (a burpee trains chest, back, legs, etc.) but acceptable for v1.
- **Week boundary mismatch**: Muscles tab uses correct Mon-Sun weeks. Workouts tab uses Thursday-aligned weeks (existing bug). Follow-up issue needed.

## Review Feedback

### Quality Director (UX Critique)

#### Rev 0 — APPROVED (2026-04-13T14:30Z)
**Verdict**: APPROVED — No Critical issues. 6 Major recommendations, none individually blocking.

**Major findings:**
- M1: "Tap This Week to reset" not discoverable → add Today pill button
- M2: Horizontal bar chart not native to chart-kit → specify custom View-based fallback (aligns with techlead M2)
- M3: 8-week trend empty for new users → show helpful message for <2 weeks data
- M4: accessibilityLiveRegion missing for week changes → add polite live region
- M5: Count only completed sets (ws.completed=1), not just sessions with completed_at
- M6: Loading/error states not specified → add to plan alongside empty state

**Minor findings:**
- m1: full_body muscle group semantics unclear (expand to all groups or exclude?)
- m2: useMemo/React.memo/keyExtractor not specified for performance
- m3: accessibilityHint on tappable bars ("Double tap to see weekly trend")
- m4: useReducedMotion for chart animations
- m5: Three-segment bar — monitor label truncation on small screens

**SKILL alignment**: All Critical criteria covered in plan. 4 Major SKILL criteria (loading/error states, useMemo, React.memo, keyExtractor) not explicitly mentioned — should be added to acceptance criteria.

### Tech Lead (Technical Feasibility)

#### Rev 0 — NEEDS REVISION (2026-04-13T14:23Z)
**Major**: M1 (week boundary inconsistency — existing Workouts uses Thursday-aligned epochs, plan specifies Mon-Sun), M2 (horizontal bar chart not available in react-native-chart-kit — use custom View-based bars), M3 (progress.tsx already 866 lines — extract Muscles segment to component).
**Minor**: m1 (full_body meta-category limitation), m2 (MuscleGroup type safety), m3 (MEV/MRV reference line orientation with custom bars).

**TODO before approval:**
- [ ] M1: Acknowledge week boundary inconsistency, specify option C (ship correct Mon-Sun, follow-up ticket for existing queries)
- [ ] M2: Replace chart-kit BarChart with custom View-based horizontal bars
- [ ] M3: Extract to components/MuscleVolumeSegment.tsx

### CEO Decision
**Rev 1 addresses all feedback:**

**Techlead M1 (week boundary)**: Acknowledged. Ship with correct Mon-Sun, follow-up issue for existing queries. Added to Known Limitations.
**Techlead M2 (horizontal bars)**: Replaced chart-kit BarChart with custom View-based horizontal bars throughout plan. Only LineChart uses chart-kit.
**Techlead M3 (file extraction)**: Added mandatory extraction to components/MuscleVolumeSegment.tsx. In scope, in acceptance criteria, in files table.
**Techlead m2 (MuscleGroup type)**: Updated function signatures to use MuscleGroup type.
**Techlead m3 (reference line orientation)**: Clarified as vertical reference lines on custom bar area.

**QD M1 (Today button)**: Replaced "tap to reset" with Today pill button. Added acceptance criteria.
**QD M3 (empty trend)**: Added "Keep training to see your trends" message for <2 weeks data.
**QD M4 (accessibilityLiveRegion)**: Added polite live region on week label.
**QD M5 (completed sets)**: Added ws.completed=1 filter. In data source, query strategy, and acceptance criteria.
**QD M6 (loading/error)**: Added loading spinner and error+retry state to bar chart section.
**QD minor (useMemo/memo/keyExtractor)**: Added performance requirements section and acceptance criteria.
**QD minor (accessibilityHint)**: Added hint on tappable bars.
**QD minor (useReducedMotion)**: Added to trend chart and acceptance criteria.
