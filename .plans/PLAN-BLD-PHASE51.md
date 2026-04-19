# Phase 51 — Nutrition Progress & Trends

**Issue**: BLD-336
**Author**: CEO
**Date**: 2026-04-18
**Status**: APPROVED

## Problem Statement

Users track macros daily via the Nutrition tab but have NO way to visualize their nutrition trends over time. The Progress tab has three segments — Workouts, Body, and Muscles — but no Nutrition segment. This means:

- Users can't see if they're consistently hitting macro targets
- There's no weekly/monthly calorie trend visualization
- No adherence percentage or streak tracking for nutrition
- No way to identify patterns (e.g., weekend overconsumption, protein deficiency)

The Nutrition tab shows only the current day's data. The WeeklySummary widget on the home screen shows a single week's averages. Neither provides trend analysis.

**Data supports this**: The app already stores daily_log entries with dates and food_entries with macro values. The `getWeeklyNutrition()` function in `lib/db/weekly-summary.ts` already computes weekly averages and target comparisons — but only for one week at a time. The infrastructure exists; the visualization doesn't.

## User Stories

- As a user tracking macros, I want to see my calorie and macro trends over weeks so that I can identify patterns and adjust my diet
- As a user with macro targets, I want to see my adherence percentage so that I know how consistently I'm hitting my goals
- As a user, I want to see my nutrition streak (consecutive days meeting targets) so that I stay motivated
- As a user, I want to quickly compare my actual intake vs targets over time so that I can make informed dietary decisions

## Proposed Solution

### Overview

Add a **Nutrition** segment to the existing Progress tab (fourth option in the SegmentedControl). This segment displays:

1. **Calorie Trend Chart** — Line chart showing daily calorie intake vs target over the last 4 weeks (28 days)
2. **Macro Breakdown Chart** — Stacked or grouped bar chart showing protein/carbs/fat daily averages per week
3. **Adherence Card** — Percentage of days where the user met their calorie target (within ±10%)
4. **Nutrition Streak Card** — Current and longest streak of days meeting calorie target (within ±10%). Calorie-only criterion avoids unrealistic all-4-macro threshold that would show perpetual 0-1 day streaks.
5. **Weekly Averages Card** — Average calories, protein, carbs, fat for the current week vs previous week with delta indicators

### UX Design

#### Navigation
- Progress tab → SegmentedControl gains a 4th button: "Nutrition"
- Existing segments: `workouts | body | muscles | nutrition`
- Default segment remains "workouts" (no change to existing behavior)

#### Screen Layout (scrollable)
```
┌─────────────────────────────────┐
│  [Workouts] [Body] [Muscles] [Nutrition]  ← SegmentedControl
├─────────────────────────────────┤
│  ┌──── Calorie Trend ────────┐  │
│  │  Line chart (28 days)     │  │
│  │  Daily calories (blue)    │  │
│  │  Target line (dashed)     │  │
│  │  [4W] [8W] [12W] period  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌── Weekly Averages ────────┐  │
│  │  This Week    Last Week   │  │
│  │  2,150 cal    2,300 cal   │  │
│  │  ↓ -150 (-6.5%)          │  │
│  │  P: 145g  C: 260g  F: 70g│  │
│  └───────────────────────────┘  │
│                                 │
│  ┌── Adherence ──────────────┐  │
│  │  78% of days on target    │  │
│  │  ████████░░ (last 28 days)│  │
│  │  Current streak: 5 days   │  │
│  │  Longest streak: 12 days  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌── Macro Trends ───────────┐  │
│  │  Weekly avg P/C/F bars    │  │
│  │  4 weeks of grouped bars  │  │
│  │  Color-coded per macro    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

#### Period Selector
- Chip group above the calorie trend chart: `4W | 8W | 12W`
- Default: 4W (28 days)
- Affects all cards on the screen (one period selector, not per-card)

#### Color Scheme
- Calories: `colors.primary` (blue)
- Protein: `semantic.protein` (already defined in constants/theme.ts)
- Carbs: `semantic.carbs` (already defined)
- Fat: `semantic.fat` (already defined)
- Target line: `colors.outline` with dashed style
- Adherence good (≥80%): `colors.primary`
- Adherence warning (50-79%): `semantic.warning` or `colors.tertiary`
- Adherence poor (<50%): `colors.error`

#### Accessibility
- All charts must have `accessibilityLabel` with summary text (e.g., "Calorie trend chart showing 28 days. Average 2,150 calories per day. Target is 2,000.")
- Chart containers need `accessibilityRole="image"` to prevent screen readers from traversing SVG internals
- Adherence progress bar needs `accessibilityRole="progressbar"` with `accessibilityValue={{ min: 0, max: 100, now: N }}`
- Delta arrows (↓/↑) need natural-language `accessibilityLabel` (e.g., "decreased by 150 calories" not "↓ -150")
- Streak and adherence cards must announce values via `accessibilityLabel`
- Period selector chips must have `accessibilityRole="button"` and `accessibilityState={{ selected: true/false }}`
- Period selector chips must have explicit ≥48dp touch targets
- All numerical values must be screen-reader friendly (no raw chart-only data)

#### Loading State
- Show skeleton placeholders matching card layout while data loads (same pattern as BodySegment)
- Skeleton for chart area: rounded rect with shimmer animation
- Skeleton for stat cards: text-width placeholders
- Duration: show skeleton until all queries resolve

#### Error State
- On DB query failure, show a centered error card: "Couldn't load nutrition data" with a "Retry" button
- Retry button calls the hook's refetch function
- Error card replaces all content (not inline per-card)

#### Empty States
Priority order (show highest priority match only):
1. **No nutrition data at all** (highest): Show card with text: "Start tracking your meals in the Nutrition tab to see trends here." with a button "Go to Nutrition" that navigates to the nutrition tab.
2. **Fewer than 3 days of data**: Show the charts with available data + info text: "Track for a few more days to see meaningful trends."
3. **No macro targets set** (lowest): Show data but with info banner: "Set your macro targets to see adherence tracking." with a link to the targets screen.

#### Reduced Motion
- All chart animations must respect `useReducedMotion()` from react-native-reanimated
- When reduced motion is enabled: disable victory-native chart entry animations (set `animate={false}` or equivalent)
- Static rendering of charts is acceptable — data visibility is not degraded

### Technical Approach

#### Data Layer — `lib/db/nutrition-progress.ts` (new file)

```typescript
// Query daily nutrition totals for a date range
export async function getDailyNutritionTotals(
  startDate: string,  // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
): Promise<{ date: string; calories: number; protein: number; carbs: number; fat: number }[]>

// Query weekly averages for a date range
export async function getWeeklyNutritionAverages(
  weeks: number  // number of weeks back from today
): Promise<{ weekStart: string; avgCalories: number; avgProtein: number; avgCarbs: number; avgFat: number; daysTracked: number }[]>

// Query adherence stats — only counts days with ≥1 food entry (tracked days)
export async function getNutritionAdherence(
  days: number,  // lookback period
  targets: MacroTargets,
  tolerancePercent: number  // e.g., 10 for ±10%
): Promise<{ trackedDays: number; onTargetDays: number; currentStreak: number; longestStreak: number }>
// Note: adherence = onTargetDays / trackedDays (NOT calendar days)
// Display as "X of Y tracked days on target"
// Streak = consecutive tracked days meeting calorie target within ±tolerancePercent (calorie-only)
```

SQL pattern for daily totals (mirrors existing getWeeklyNutrition but for arbitrary ranges):
```sql
SELECT dl.date,
       SUM(f.calories * dl.servings) AS calories,
       SUM(f.protein * dl.servings) AS protein,
       SUM(f.carbs * dl.servings) AS carbs,
       SUM(f.fat * dl.servings) AS fat
FROM daily_log dl
JOIN food_entries f ON dl.food_entry_id = f.id
WHERE dl.date BETWEEN ? AND ?
GROUP BY dl.date
ORDER BY dl.date ASC
```

#### Hook — `hooks/useNutritionProgress.ts` (new file)

Fetches data on focus, supports period switching:
```typescript
export function useNutritionProgress() {
  const [period, setPeriod] = useState<4 | 8 | 12>(4);
  // ... fetch dailyTotals, weeklyAverages, adherence, targets
  // Returns: { dailyTotals, weeklyAverages, adherence, targets, period, setPeriod, loading, error, refetch }
  // loading: true while any query is in flight (show skeleton)
  // error: Error | null (show error state with retry)
  // refetch: () => void (retry after error)
}
```

Use `useFocusEffect` + `useCallback` pattern (same as WorkoutSegment/BodySegment).
Check `useReducedMotion()` and pass to chart components to disable animations.

#### Components

| Component | File | Description |
|-----------|------|-------------|
| `NutritionSegment` | `components/progress/NutritionSegment.tsx` | Main container, renders all cards |
| `CalorieTrendCard` | `components/progress/NutritionCards.tsx` | Line chart with victory-native CartesianChart |
| `WeeklyAveragesCard` | `components/progress/NutritionCards.tsx` | This week vs last week comparison |
| `AdherenceCard` | `components/progress/NutritionCards.tsx` | Adherence % + streak display |
| `MacroTrendCard` | `components/progress/NutritionCards.tsx` | Weekly macro averages (grouped bars or line) |

Follow existing pattern: `WorkoutSegment.tsx` + `WorkoutCards.tsx`.

#### Chart Library
Use `victory-native` (already installed) — specifically:
- `CartesianChart` + `Line` for calorie trend (same as ExerciseChartCard)
- `CartesianChart` + `Bar` for macro trends (if victory-native supports grouped bars; otherwise use line chart with multiple series)

**Check**: Verify victory-native version supports Bar component before planning grouped bars. If not, use multiple Line series with different colors.

#### Progress Tab Integration

Modify `app/(tabs)/progress.tsx`:
- Add "nutrition" to SegmentedControl buttons
- Import and render `NutritionSegment` when segment === "nutrition"
- Keep `accessibilityLabel` pattern consistent with other segments

### Scope

**In Scope:**
- Nutrition segment in Progress tab
- Calorie trend line chart (daily, configurable period)
- Weekly macro averages comparison card
- Adherence percentage and streak tracking
- Period selector (4W/8W/12W)
- Empty states for no data, insufficient data, no targets
- Full accessibility labels
- New DB query functions in separate file
- New hook for data fetching

**Out of Scope:**
- Nutrition goals/reminders/notifications
- Meal-by-meal breakdown in progress view
- Calendar heatmap for nutrition (different from workout heatmap)
- Nutrition data export (CSV export already exists separately)
- AI-powered insights or recommendations
- Comparison with other users / social features
- Weight correlation with calorie trends (cross-metric analysis — future phase)

### Acceptance Criteria

- [ ] Given the user has tracked nutrition for 7+ days WHEN they tap the "Nutrition" segment in Progress THEN they see a calorie trend chart with daily data points and a dashed target line
- [ ] Given the user selects "8W" period WHEN the chart re-renders THEN it shows 56 days of data (or as many as available)
- [ ] Given the user has macro targets set WHEN viewing the adherence card THEN it shows "X of Y tracked days on target" (only counting days with ≥1 food entry)
- [ ] Given the user has hit their calorie target (within ±10%) for 5 consecutive tracked days WHEN viewing the adherence card THEN current streak shows "5 days"
- [ ] Given the user has NO nutrition data WHEN they tap "Nutrition" segment THEN they see an empty state with a "Go to Nutrition" button
- [ ] Given the user has nutrition data but NO macro targets WHEN they view the segment THEN charts show data but an info banner says "Set your macro targets to see adherence tracking"
- [ ] Given screen reader is active WHEN user navigates to the calorie trend card THEN VoiceOver reads a summary label like "Calorie trend: averaging X calories over Y days, target is Z"
- [ ] The SegmentedControl shows 4 options: Workouts, Body, Muscles, Nutrition
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings
- [ ] All new components follow BNA UI patterns (Card, Text, Chip from components/ui/)
- [ ] Given data is loading WHEN the segment is first shown THEN skeleton placeholders are displayed
- [ ] Given a DB query fails WHEN the error state renders THEN an error card with "Retry" button is shown
- [ ] Given reduced motion is enabled WHEN charts render THEN no entry animations play

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No nutrition data at all | Empty state card with "Go to Nutrition" CTA |
| Only 1-2 days of data | Show available data with "Track more days" info text |
| No macro targets set | Show charts without adherence card; show "Set targets" banner |
| User deletes all food entries | Segment shows empty state on next focus |
| 365+ days of data with 12W selected | Query only 84 days — bounded query range |
| All days exactly on target (100% adherence) | Show 100% with celebratory color/icon |
| Zero calories logged on a day | Day excluded from adherence count (untracked day) |
| Weekday-only tracker (5 of 7 days) | Adherence shows "X of 5 tracked days" not "X of 7 days" |
| Multiple meals logged on same day | Correctly aggregated (SUM in SQL handles this) |
| Date boundary near midnight | Use date string (YYYY-MM-DD) not timestamps — already the daily_log pattern |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| victory-native doesn't support grouped bars | Medium | Low | Fall back to multi-line chart for macro trends |
| Performance with 12 weeks of daily data | Low | Low | ~84 data points is trivial; single SQL query |
| SegmentedControl gets crowded with 4 items | Medium | Medium | Use short labels ("Nutrition" → "Nutr." if needed); test on narrow screens |
| Chart rendering performance on low-end devices | Low | Medium | victory-native is performant for small datasets; no animation on reduced motion |

### Dependencies
- victory-native (already installed)
- BNA UI components (Card, Text, Chip, SegmentedControl — all exist)
- macro_targets table (exists)
- daily_log + food_entries tables (exist)
- semantic colors for macros (exist in constants/theme.ts)

## Review Feedback

### Quality Director (UX Critique)
**Verdict: APPROVED** (re-reviewed 2026-04-18 after revision)

Initial review flagged 5 blocking issues (NEEDS REVISION). All addressed in revision:
1. ✅ Streak changed to calorie-only criterion
2. ✅ Adherence counts only tracked days (≥1 food entry), displays as "X of Y tracked days"
3. ✅ Loading state specified (skeleton placeholders)
4. ✅ Error state specified (error card with retry)
5. ✅ Reduced motion specified (useReducedMotion → disable chart animations)
6. ✅ Accessibility gaps addressed (chart roles, progressbar, delta labels, 48dp chips)

**Non-blocking notes for implementation:**
- Test SegmentedControl 4-item layout on 320dp screens
- Fall back to multi-line chart if victory-native grouped bars don't work
- Consider locale-aware number formatting

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Technically sound, low risk, follows all established patterns.

**Feasibility**: Fully buildable with existing infrastructure. All DB tables exist (`food_entries`, `daily_log`, `macro_targets`), `getWeeklyNutrition()` already computes weekly summaries, victory-native v41.20.2 supports Line and Bar charts, SegmentedControl supports 4+ segments. No migrations, no new deps, no breaking changes.

**Architecture Fit**: Pure feature addition following established segment pattern (`WorkoutSegment` → `NutritionSegment`, `WorkoutCards` → `NutritionCards`, `useBodyMetrics` → `useNutritionProgress`). All BNA UI components available. Semantic macro colors defined.

**Effort**: Medium | **Risk**: Low | **New Dependencies**: None

**Minor Concerns** (non-blocking):
1. Grouped bar chart for macro trends — victory-native Bar is single-series; start with stacked bar or multi-line, treat grouped bars as polish
2. SegmentedControl with 4 labels fits at 320px but is snug — abbreviate only if QA flags layout issues
3. Adherence calculation must generate full date range in JS and mark missing dates as "not on target" — SQL GROUP BY won't return dateless rows
4. Streak calculation should be in JS (iterate sorted array), not SQL (avoid window functions/CTEs)

**Recommendations**:
1. Follow `WorkoutSegment.tsx` as structural template
2. New DB queries in `lib/db/nutrition-progress.ts` (keep separate from `weekly-summary.ts`)
3. Generate full date array in JS and left-join with SQL results for adherence
4. Add barrel re-export from `lib/db/index.ts` if one exists

### CEO Decision
All QD feedback addressed in revision:
1. ✅ Streak changed to calorie-only criterion (not all-4-macros)
2. ✅ Adherence counts only tracked days (≥1 food entry), displays as "X of Y tracked days"
3. ✅ Loading state specified (skeleton placeholders)
4. ✅ Error state specified (error card with retry button)
5. ✅ Reduced motion specified (disable chart animations via useReducedMotion)
6. ✅ Accessibility gaps addressed (accessibilityRole on charts/progress bar, natural-language delta labels, 48dp chip targets)

TL approved with no blocking concerns. Re-requesting QD review on updated plan.
