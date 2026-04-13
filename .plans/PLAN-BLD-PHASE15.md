# Phase 15: Weekly Muscle Group Volume Analysis

**Issue**: BLD-23
**Author**: CEO
**Date**: 2026-04-13
**Status**: IN_REVIEW

## Problem Statement
Users can see total weekly volume and personal records, but have no way to analyze training balance across muscle groups. They cannot tell if they are neglecting back work, over-training chest, or under-training legs. This is one of the most common training mistakes, especially for intermediate lifters.

FitForge already stores `primary_muscles` and `secondary_muscles` on every exercise — this data is unused for analysis. Surfacing muscle group volume gives users actionable insight to improve their training programs.

## User Stories
- As a lifter, I want to see how many sets per muscle group I did this week so I can identify undertrained areas
- As a program user, I want to verify my program provides balanced muscle coverage
- As a returning user, I want to see muscle volume trends over multiple weeks so I can track programming improvements

## Proposed Solution

### Overview
Add a "Muscles" segment to the existing Progress tab that shows weekly set volume broken down by muscle group. Show a horizontal bar chart of sets per muscle group for the current week, a weekly trend chart for a selected muscle group, and science-based volume landmarks (minimum effective volume, maximum recoverable volume).

### UX Design

#### Navigation
- Add a third segment to Progress tab: "Workouts | Body | Muscles"
- Default to "Workouts" segment (no change to existing behavior)

#### Muscles Segment — Layout

**1. Week Selector**
- Shows current week by default ("This Week: Apr 7 – Apr 13")
- Left/right chevron buttons to navigate weeks
- Tapping "This Week" label resets to current week

**2. Muscle Volume Card (horizontal bar chart)**
- One bar per muscle group that has >0 sets this week
- Bar label: muscle group name (left-aligned)
- Bar value: set count (right of bar)
- Bars sorted by volume descending
- Color coding: bar fills use theme.colors.primary
- Empty state: "No workouts this week. Complete a session to see muscle volume."

**3. Volume Landmarks (optional reference lines)**
- Show subtle dotted reference lines at:
  - MEV (Minimum Effective Volume): ~10 sets/week for most muscle groups
  - MRV (Maximum Recoverable Volume): ~20 sets/week for most muscle groups
- These are general guidelines, shown as faint reference markers (not hard rules)
- Label: "MEV" and "MRV" in small text

**4. Weekly Trend (line chart)**
- Tapping a muscle group bar selects it
- Shows an 8-week line chart of sets per week for the selected muscle group
- X-axis: week labels (e.g., "W1", "W2", ... "W8")
- Y-axis: sets
- Default selection: the muscle group with highest volume

**5. Muscle Group List (detail)**
- Below the charts, show a FlatList of all muscle groups trained
- Each row: muscle group name, set count, exercise count
- Tapping a row selects it for the trend chart (same as tapping bar)

#### Accessibility
- All charts have accessibilityLabel summarizing the data (e.g., "Chest: 16 sets this week")
- Bar chart bars have accessibilityRole="image" with descriptive label
- Week navigation buttons have accessibilityLabel ("Previous week", "Next week")
- Minimum touch target 48x48dp for all interactive elements

### Technical Approach

#### Data Source
- Query `workout_sets` joined with `workout_sessions` and `exercises`
- Filter by session `completed_at` within the target week (Mon-Sun)
- Parse `primary_muscles` JSON array from exercises table
- Count sets per muscle group (each set counts toward all primary muscles of the exercise)
- Secondary muscles are out of scope for v1

#### New DB Functions (in lib/db.ts)
```typescript
// Get sets per muscle group for a given week
export async function getMuscleVolumeForWeek(
  weekStart: number // epoch ms of Monday 00:00
): Promise<{ muscle: string; sets: number; exercises: number }[]>

// Get weekly muscle volume trend (last N weeks)
export async function getMuscleVolumeTrend(
  muscle: string,
  weeks: number // how many weeks back
): Promise<{ week: string; sets: number }[]>
```

#### Query Strategy
Single query approach — join workout_sets to workout_sessions to exercises, filter by date range, parse primary_muscles JSON in JS (not SQL), aggregate in memory. The data set is bounded (one week of workouts = typically 3-6 sessions x 20-30 sets = under 200 rows).

#### New/Modified Files
| File | Change |
|------|--------|
| lib/db.ts | Add getMuscleVolumeForWeek(), getMuscleVolumeTrend() |
| app/(tabs)/progress.tsx | Add "Muscles" segment, MuscleVolume component |

No new screens needed — this is an addition to the existing Progress tab.

#### Dependencies
- react-native-chart-kit (already installed — used for existing charts)
- No new dependencies

### Scope
**In Scope:**
- Muscle group volume bar chart (current week)
- Week selector (navigate between weeks)
- Volume landmarks (MEV/MRV reference lines)
- Weekly trend line chart for selected muscle group (8 weeks)
- Muscle group detail list
- Primary muscles counting only (secondary muscles out of scope)

**Out of Scope:**
- Secondary muscle contribution (0.5x counting)
- Muscle heatmap visualization (body outline)
- Custom volume landmarks per muscle group
- Exercise filtering by muscle group (tap to navigate)
- Volume recommendations or AI-powered suggestions
- Push notifications for volume targets

### Acceptance Criteria
- [ ] GIVEN user opens Progress tab WHEN tapping Muscles segment THEN see muscle volume bar chart for current week
- [ ] GIVEN no workouts this week WHEN viewing Muscles segment THEN show empty state message
- [ ] GIVEN user has workouts WHEN viewing bar chart THEN bars sorted by volume descending
- [ ] GIVEN user taps left chevron WHEN on current week THEN previous week data loads
- [ ] GIVEN user taps right chevron WHEN on previous week THEN next week data loads (no future beyond current week)
- [ ] GIVEN user taps a muscle group bar WHEN trend chart visible THEN trend updates to show 8-week history for that muscle
- [ ] GIVEN a workout with bench press (primary: chest, anterior deltoid, triceps) WHEN viewing muscle volume THEN each primary muscle group gets +1 set per bench press set
- [ ] GIVEN volume landmarks enabled WHEN bar exceeds MEV (10 sets) THEN dotted reference line visible at 10
- [ ] GIVEN volume landmarks enabled WHEN bar exceeds MRV (20 sets) THEN dotted reference line visible at 20
- [ ] GIVEN muscle group detail list WHEN viewing THEN each row shows muscle name, set count, exercise count
- [ ] All interactive elements have accessibilityLabel
- [ ] Week navigation buttons have 48x48dp minimum touch target
- [ ] All colors use theme tokens (no hardcoded hex)
- [ ] Charts use accessibilityLabel for VoiceOver summary
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
| JSON parsing primary_muscles slow for large datasets | Low | Low | Bounded by 1 week of data (under 200 sets typical) |
| Chart rendering performance with many muscle groups | Low | Low | react-native-chart-kit handles this fine for under 20 bars |
| Muscle group naming inconsistency across exercises | Med | Med | Normalize muscle names to lowercase during aggregation |

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
_Pending reviews_
