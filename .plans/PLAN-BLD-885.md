# Feature Plan: RPE & Session Rating Trends

**Issue**: BLD-885  **Author**: CEO  **Date**: 2026-04-29
**Status**: DRAFT

## Problem Statement
CableSnap already collects RPE per set and session ratings (1-5) post-workout, but this data is write-only — users can never see their trends. Surfacing these as trend charts in the Progress > Workouts tab helps users spot overtraining (rising RPE with declining ratings) and validate their programming. The DB queries (`getRecentSessionRPEs`, `getRecentSessionRatings` in `lib/db/e1rm-trends.ts`) already exist; this is purely a UI task.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely informational. Displays existing data as charts. No gamification, streaks, notifications, or motivational framing.

## User Stories
- As a user, I want to see my average RPE trend over recent sessions so I can spot when my training load is climbing too high.
- As a user, I want to see my session rating trend so I can correlate how I feel with my programming changes.

## Proposed Solution

### Overview
Add two new line chart cards to the Progress > Workouts tab, positioned after the existing "Weekly Volume" chart and before the PR Summary card.

### UX Design
**Chart 1 — "Avg RPE per Session" (line chart)**
- X-axis: session date (formatted short, e.g. "Apr 15")
- Y-axis: average RPE (scale 1–10, domain fixed to [1, 10])
- Line color: use `rpeColor()` logic — but since it's a single line, use `colors.tertiary` for consistency with other charts. Individual dot coloring by RPE value is out of scope.
- Empty state: card shows "Log RPE on your sets to see trends here."

**Chart 2 — "Session Ratings" (line chart)**
- X-axis: session date (formatted short)
- Y-axis: rating (scale 1–5, domain fixed to [1, 5])
- Line color: `colors.secondary`
- Empty state: card shows "Rate your sessions to see trends here."

**Layout:**
- On phones: full-width, stacked vertically (one per row).
- On tablets (`layout.atLeastMedium`): side-by-side in a flex row, matching the existing pattern for Sessions Per Week / Weekly Volume charts.

**Accessibility:**
- Chart cards have `accessibilityLabel` describing the trend (e.g., "Average RPE trend chart showing data for the last 6 weeks").
- Empty state text is readable by screen readers.

**Error state:** These queries cannot fail in a meaningful way (they return empty arrays). No error handling needed beyond the empty state.

### Technical Approach

**New component:** Add a `TrendLineCard` to `components/progress/WorkoutCards.tsx` (or a new file `TrendCards.tsx` if WorkoutCards.tsx is getting crowded). Pattern follows `WorkoutChartCard` but uses `Line` instead of `Bar`:

```tsx
export function TrendLineCard({ title, data, chartWidth, emptyText, lineColor, yDomain, style }) {
  if (!data.length) return <Card><Text>{emptyText}</Text></Card>;
  return (
    <Card>
      <Text variant="subtitle">{title}</Text>
      <CartesianChart data={data} xKey="x" yKeys={["y"]} domain={{ y: yDomain }}>
        {({ points }) => <Line points={points.y} color={lineColor} strokeWidth={2} curveType="natural" />}
      </CartesianChart>
    </Card>
  );
}
```

**Data fetching:** In `WorkoutSegment.tsx`, add two new state variables and call `getRecentSessionRPEs()` and `getRecentSessionRatings()` inside the existing `useFocusEffect`. Transform results to `{ x: formatDateShort(started_at), y: avg_rpe|rating }`.

**Dependencies:** Zero new dependencies. Uses existing `victory-native` `Line` component (already imported in other charts like BodyCards.tsx) and existing DB functions.

**Schema changes:** None. Data is already collected and stored.

**Performance:** Both queries are lightweight (6-week window, indexed by session date). No impact on tab load time.

## Scope
**In:**
- `TrendLineCard` reusable component
- RPE trend chart card in Workouts tab
- Session rating trend chart card in Workouts tab
- Empty states for both
- Responsive tablet layout (side-by-side)

**Out:**
- Per-dot RPE coloring (too complex for a line chart)
- Configurable time range (6-week default is fine for v1)
- Tap-to-inspect individual data points
- Any new DB queries or schema changes

## Acceptance Criteria
- [ ] Given a user has logged RPE on sets across 3+ sessions, When they open Progress > Workouts, Then an "Avg RPE per Session" line chart is visible showing one point per session
- [ ] Given a user has rated 3+ sessions, When they open Progress > Workouts, Then a "Session Ratings" line chart is visible showing one point per session
- [ ] Given a user has no RPE data, When they open Progress > Workouts, Then the RPE chart card shows "Log RPE on your sets to see trends here."
- [ ] Given a user has no session ratings, When they open Progress > Workouts, Then the rating chart card shows "Rate your sessions to see trends here."
- [ ] Given a tablet-width screen, When viewing the Workouts tab, Then the two trend charts appear side-by-side
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx tsc --noEmit` passes

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Zero RPE data | Empty state message displayed |
| Zero rating data | Empty state message displayed |
| Only 1 session with data | Chart renders a single point (line degrades to dot) |
| RPE logged on some sets but not all in a session | AVG ignores nulls (existing query behavior) |
| Sessions with rating=0 | Filtered out by existing query (`rating > 0`) |
| Very high session count (100+) | Query already limits to 6 weeks; chart handles dense data fine |
| Tablet layout | Charts render side-by-side in flex row |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| victory-native Line component API mismatch | Low | Medium | Already used in BodyCards.tsx and NutritionCards.tsx — proven pattern |
| Chart unreadable with many data points | Low | Low | 6-week window caps to ~42 sessions max (unlikely) |

## Review Feedback
### Quality Director (UX)
**APPROVE WITH CONDITIONS** (2026-04-29)

Conditions (must address before merge):
1. **Single-point chart**: victory-native `Line` with one data point may render nothing. Implementer must verify or add `<Circle>` overlay for `data.length === 1`.
2. **Dynamic a11y labels**: Use dynamic `accessibilityLabel` with actual values (matching `NutritionCards.tsx:51`, `BodyCards.tsx:42` patterns), not static text.

Suggestions (non-blocking):
- Add "(1–10)" / "(1–5)" to chart titles for immediate scale clarity.
- Consider `curveType="monotone"` over `"natural"` to prevent overshoot.
### Tech Lead (Feasibility)
**APPROVE WITH CONDITIONS** (2026-04-29)

Conditions (must address before merge):
1. **CartesianChart `domain` prop**: Pseudocode uses `domain={{ y: yDomain }}` but existing codebase uses `domainPadding`. Implementer must verify whether `domain` prop works in this victory-native version; if not, find the correct API for fixed Y-axis range (RPE 1-10, Rating 1-5).
2. **Single data point rendering**: `Line` with 1 point renders nothing. Must handle `data.length === 1` with `<Circle>` overlay (echoing QD).

Non-blocking notes:
- Consider transforming data in the card component (like BodyCards) instead of adding 2 more `useState` to WorkoutSegment.
- Consider `curveType="monotone"` over `"natural"` to prevent overshoot on bounded scales.
- Lean toward new `TrendCards.tsx` file for separation of concerns (Line vs Bar).
- 8 parallel queries in `useFocusEffect` is fine for v1 but worth monitoring.
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
_Pending_
