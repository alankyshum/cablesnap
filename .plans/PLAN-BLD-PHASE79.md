# Feature Plan: Weekly Training Summary Card (Compact Home Screen Version)

**Issue**: BLD-470
**Author**: CEO
**Date**: 2026-04-21
**Status**: APPROVED

## Problem Statement

Users open CableSnap daily — before, during, and after workouts. The home screen shows streak, weekly workout count, and recent PRs in StatsRow, plus workout dots in AdherenceBar. But two key metrics are **missing from the home screen**: total training volume (with week-over-week comparison) and total training duration. These are the metrics that answer "am I training harder than last week?"

Currently, users must navigate to the Progress tab to see volume trends. For the busy gym-goer, glanceable volume delta on the home screen provides instant motivational feedback.

**User emotion today**: "I can see I did 3 workouts, but I have no idea if my training load is going up or down."

**User emotion after**: "I see volume is up 8% this week — nice, I'm progressing."

## Changes from V1 Draft (Addressing Review Feedback)

### TL Feedback — Reuse Existing Infrastructure ✅
- **NO new `lib/db/weekly-summary.ts`** — reuse existing `getWeeklyWorkouts()` which already returns `totalVolume`, `previousWeekVolume`, and `totalDurationSeconds`
- **NO new `hooks/useWeeklySummary.ts`** — add data fetching to existing `loadHomeData()` following the `["home"]` React Query pattern
- **NO new React Query key** — data flows through the existing `["home"]` query, invalidated by `useFocusRefetch(["home"])`

### UX Designer Feedback — Eliminate Information Duplication ✅ (Option B)
- Card shows **ONLY volume delta + duration** — the genuinely new information
- Sessions count, goal fraction, and PR count are **NOT duplicated** (already in StatsRow + AdherenceBar)
- Card becomes: `"12,450 kg ↑8%  ·  3h 45m this week"`
- **Smaller card footprint** — mitigates scroll depth concern

### QD Feedback — Data Correctness ✅
- **`set_type` (not `is_warmup`)**: Existing `getWeeklyWorkouts()` already uses `ne(workoutSets.set_type, 'warmup')` — correct
- **PR detection**: Existing `getWeeklyPRs()` uses max-weight comparison (not a non-existent `is_pr` column) — correct
- **Duration**: Existing `getWeeklyWorkouts()` returns `totalDurationSeconds` from `SUM(duration_seconds)` — correct (not julianday)
- **Volume formatting**: Use `toDisplay()` from `lib/units.ts` (existing unit conversion) + `toLocaleString()` for number formatting
- **Frequency goal**: Not needed in card (already in StatsRow) — removed from scope
- **`completed_at IS NOT NULL` filter**: Existing query already filters with `isNotNull(workoutSessions.completed_at)` — correct
- **Timezone week boundaries**: Existing `mondayOf()` from `lib/format.ts` handles local timezone — reuse it

## Proposed Solution

### Overview
A compact, read-only card on the home screen showing **volume (with week-over-week delta) and training duration** — the two metrics not currently visible on the home screen. All data reuses existing query functions.

### Scope — 3 Files Changed

#### 1. `components/home/loadHomeData.ts` — Add weekly workout data to home batch

Add `getWeeklyWorkouts(mondayOf(Date.now()))` to the existing `Promise.all` in `loadHomeData()`. The return type gains `weeklyWorkouts: WeeklyWorkoutSummary`.

```typescript
// Add to imports
import { getWeeklyWorkouts } from "../../lib/db";
import type { WeeklyWorkoutSummary } from "../../lib/db";
import { mondayOf } from "../../lib/format";

// Add to the first Promise.all batch:
getWeeklyWorkouts(mondayOf(Date.now()))

// Add to return object:
weeklyWorkouts
```

#### 2. `components/home/WeeklySummaryCard.tsx` — New compact card (ONLY new file)

Compact card showing volume + delta + duration. Receives data as props (no hooks, no queries).

**Layout:**
```

  This Week                           │
  12,450 kg  ↑8%  ·  3h 45m          │

```

**Empty state** (no workouts this week):
```

  This Week                           │
  No training data yet                │

```

**Design tokens:**
- Card: `borderRadius: 12`, `paddingVertical: 12`, `paddingHorizontal: 16`, `marginBottom: 12`, `backgroundColor: colors.surface`
- Title "This Week": `variant="caption"`, `fontWeight: "600"`, `color: colors.onSurfaceVariant`
- Volume: `fontSizes.sm`, `fontWeight: "700"`, `color: colors.onBackground`
- Delta: `fontSizes.xs`, green (`colors.success`) for positive, red (`colors.error`) for negative
- Duration: `fontSizes.sm`, `color: colors.onSurfaceVariant`
- Delta indicator: Arrow character (↑/↓) + percentage text — satisfies WCAG 1.4.1 (not color-only)

**Accessibility:**
- `accessibilityRole="summary"` on card container
- `accessibilityLabel`: "This week: 12,450 kilograms total volume, up 8 percent from last week, 3 hours 45 minutes total training time"
- Empty state: `accessibilityLabel`: "This week: no training data yet"
- No emoji in empty state — plain text only

**Props interface:**
```typescript
type Props = {
  colors: ThemeColors;
  totalVolume: number;
  previousWeekVolume: number | null;
  totalDurationSeconds: number;
  sessionCount: number; // used for empty state check only
  unitSystem: 'metric' | 'imperial';
};
```

#### 3. `app/(tabs)/index.tsx` — Integration

Add `WeeklySummaryCard` below AdherenceBar and above the QuickStart/template section. Pass data from `loadHomeData()` result.

### Data Flow

```
Home screen mounts
  ↓
loadHomeData() → existing Promise.all + getWeeklyWorkouts(mondayOf(Date.now()))
  ↓
React Query ["home"] caches result (existing stale/refetch behavior)
  ↓
WeeklySummaryCard receives weeklyWorkouts as props
  ↓
Renders volume + delta + duration (pure presentational component)
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts this week | Card shows "No training data yet" (no emoji) |
| No workouts last week | Volume shows absolute value, no delta arrow |
| Volume unchanged from last week | No delta shown (delta = 0%) |
| Very large volume (100,000+ kg) | Format with K suffix: "102K kg" |
| Zero volume (bodyweight-only workouts) | Shows "0 kg" — card still shows duration |
| Monday (fresh week) | Shows card with zero or minimal data |
| Mid-workout (active session) | Card shows stats WITHOUT current incomplete session (existing filter: `completed_at IS NOT NULL`) |
| Duration with NULL completed_at | Filtered out by existing `isNotNull(completed_at)` in query |
| User in imperial units | Volume shows lbs via `toDisplay()` unit conversion |

### Acceptance Criteria

- [ ] Given the home screen loads When the user has completed workouts this week Then the card shows total volume and duration
- [ ] Given the user completed workouts last week When this week's volume is higher Then a green ↑ arrow with percentage is shown
- [ ] Given the user completed workouts last week When this week's volume is lower Then a red ↓ arrow with percentage is shown
- [ ] Given the user has no workouts this week When the home screen loads Then "No training data yet" is shown
- [ ] Given no workouts last week When the card renders Then volume shows absolute value without delta
- [ ] Given the user completes a workout When they return to home Then the card updates (via existing `["home"]` query invalidation)
- [ ] Card has proper `accessibilityRole` and `accessibilityLabel`
- [ ] Card does NOT duplicate session count, goal fraction, or PR count (those stay in StatsRow)
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings

### User Experience Considerations

- [ ] Card is glanceable — 1 line of metrics
- [ ] Volume delta provides instant "am I progressing?" feedback
- [ ] Empty state is neutral and informational, not punitive or using emoji
- [ ] Respects user's unit preference (kg/lbs)
- [ ] No tap interaction needed — passive information display
- [ ] Minimal scroll depth impact — single compact card

### Out of Scope (V1)

- Session count in card (already in StatsRow)
- PR count in card (already in StatsRow)
- Goal fraction in card (already in StatsRow + AdherenceBar)
- Tap to expand/detail view
- Share weekly summary
- Week-over-week navigation
- Workout type breakdown
- Volume per muscle group

### Dependencies

- `lib/db/weekly-summary.ts` → existing `getWeeklyWorkouts()` (already tested)
- `components/home/loadHomeData.ts` → existing batch load pattern
- `lib/units.ts` → `toDisplay()` for unit conversion
- `lib/format.ts` → `mondayOf()` for week boundary

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scroll depth increase | Low (card is compact) | Low | Single line of metrics, small padding |
| Query performance | Very Low | Low | `getWeeklyWorkouts` is bounded by 7-day window |
| Test budget (44 remaining) | Low | Medium | Target 5-6 tests for card component only (existing query tests cover data layer) |

### Test Plan

| Test | Type | Description |
|------|------|-------------|
| `WeeklySummaryCard` renders volume + duration | Unit | Pass workout data, verify text output |
| `WeeklySummaryCard` renders positive delta | Unit | previousWeekVolume < totalVolume → green ↑N% |
| `WeeklySummaryCard` renders negative delta | Unit | previousWeekVolume > totalVolume → red ↓N% |
| `WeeklySummaryCard` hides delta when no previous week | Unit | previousWeekVolume = null → no delta shown |
| `WeeklySummaryCard` renders empty state | Unit | sessionCount = 0 → "No training data yet" |
| `WeeklySummaryCard` accessibility label | Unit | Verify accessibilityLabel contains all metrics as text |

**Estimated test count**: 6 new tests
**Current budget**: 1756/1800 (44 remaining) — fits within budget with margin

### Implementation Notes

- Reuse `mondayOf()` from `lib/format.ts` for week boundary (handles local timezone)
- Volume formatting: `toDisplay(volume, unitSystem)` → `toLocaleString()` → append unit label
- Large number formatting: if volume >= 100,000, format as `${Math.round(volume/1000)}K`
- Duration formatting: use existing `formatDuration()` from `lib/format.ts`
- Delta calculation: `Math.round(((current - previous) / previous) * 100)` — same as existing `volumeChangePercent()` in `useWeeklySummary.ts`

## Review Feedback

### Tech Lead (Technical Feasibility) — APPROVED ✅

**All original concerns addressed. Architecture compatible, scope right-sized, follows existing patterns.**
1. ✅ No new DB module — reusing `getWeeklyWorkouts()` from existing `lib/db/weekly-summary.ts`
2. ✅ No new hook — adding data to `loadHomeData()` following `["home"]` query pattern
3. ✅ No new React Query key — uses existing home data flow
4. ✅ Scope reduced to ~3 files, ~100-150 lines
5. ✅ Test count reduced to 5-6 (card component only)

### UX Designer (Design & A11y Critique) — APPROVED ✅

**Re-reviewed**: 2026-04-21 | All 5 original concerns addressed.

1. ✅ [C-1] No information duplication — card shows ONLY volume delta + duration
2. ✅ [C-2] No triple-display — session count stays exclusively in StatsRow
3. ✅ [M-1] Accessibility labels specified — `accessibilityRole="summary"` + comprehensive `accessibilityLabel`
4. ✅ [M-2] No emoji in empty state — plain text "No training data yet"
5. ✅ [M-3] Typography specified with design tokens

**Implementation note**: Plan references `colors.success` but this token doesn't exist. Use `useColor('green')` from `hooks/useColor.ts` instead (matches badge.tsx, switch.tsx, button.tsx patterns). `colors.error` for red delta is correct.

### Quality Director (Release Safety) — ✅ APPROVED

**Re-reviewed**: 2026-04-21 (commit 53e33cd)

**All 5 original concerns resolved:**
1. ✅ CRITICAL: `is_warmup` → existing `getWeeklyWorkouts()` uses `ne(set_type, 'warmup')` — verified
2. ✅ CRITICAL: `is_pr` column → removed from scope entirely
3. ✅ MAJOR: Duration → existing query uses `duration_seconds` column directly — verified
4. ✅ MAJOR: `formatWeight()` → using `toDisplay()` from `lib/units.ts` — verified
5. ✅ MAJOR: `frequency_goal` → removed from scope (stays in StatsRow only)
6. ✅ Edge case: `completed_at IS NOT NULL` → existing query already filters
7. ✅ Edge case: Timezone → `mondayOf()` handles local timezone

**Risk assessment**: LOW — reuses existing infrastructure, pure presentational component, trivial rollback.
**Minor note**: Plan shows `mondayOf(Date.now())` but should be `mondayOf(new Date())` — TypeScript will catch.

### CEO Decision
Awaiting re-reviews. All reviewer concerns have been addressed by fundamentally restructuring the plan to reuse existing infrastructure and eliminate information duplication.
