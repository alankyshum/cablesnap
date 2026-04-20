# Feature Plan: Workout Calendar & Streak Heatmap

**Issue**: BLD-113
**Author**: CEO
**Date**: 2026-04-15
**Status**: APPROVED

## Problem Statement

CableSnap's history screen (`app/history.tsx`) shows a basic monthly calendar with dot indicators and a session list. The progress tab shows weekly bar charts. Neither provides a **motivational, at-a-glance view of long-term workout consistency** — the #1 predictor of fitness results.

Users who track workouts want to SEE their consistency pattern over months. GitHub's contribution heatmap proves this pattern: a color-coded grid creates positive reinforcement loops. Currently, CableSnap's streak counter (shown on the Workouts tab) is a single number with no visual context.

## User Stories

- As a user, I want to see a color-coded heatmap of my workout history so I can visualize my consistency over months
- As a user, I want to see my current and longest streaks prominently displayed so I feel motivated to maintain them
- As a user, I want to tap a day on the heatmap to see what I did that day so I can review past workouts
- As a user, I want month and year navigation so I can look back at my history

## Proposed Solution

### Overview

**Replace the existing `app/history.tsx` screen** with an enhanced version that adds a GitHub-style contribution heatmap above the existing session list. This approach:
- Reuses the existing history screen navigation (already registered as stack screen)
- Keeps the existing monthly calendar + session list functionality
- Adds heatmap + streak summary as a new section at the top
- No new tabs, no new navigation — just an enhanced existing screen

### UX Design

**Entry point**: Same as today — navigate to `/history` from the Workouts tab.

**Screen layout (top to bottom):**

1. **Streak Summary Bar** (always visible)
   - Current streak (weeks): `whatshot` Material Icon + count + "weeks" label + `accessibilityLabel="Current streak: N weeks"`
   - Longest streak (weeks): `emoji-events` Material Icon + count + "weeks" label + `accessibilityLabel="Longest streak: N weeks"`
   - Total workouts: `fitness-center` Material Icon + count + `accessibilityLabel="Total workouts: N"`
   - Horizontal row, evenly spaced, using `Card` surface

2. **Heatmap Section** (collapsible, default expanded)
   - Header: "Last 16 Weeks" with expand/collapse toggle
   - 7 rows (Mon–Sun) × 16 columns (weeks), newest on right
   - Each cell colored by session count that day (with dot count as secondary indicator):
     - 0 sessions: `theme.colors.surfaceVariant` (no dot)
     - 1 session: `theme.colors.primaryContainer` (1 dot)
     - 2 sessions: `theme.colors.primary` at 70% opacity (2 dots)
     - 3+ sessions: `theme.colors.primary` at 100% ("3+" text)
   - Day labels (M, T, W, T, F, S, S) on left column
   - Tapping a cell navigates the monthly calendar to that cell's month (auto-navigating if needed) and highlights/filters to that day
   - Each cell has `hitSlop` padding to reach 48dp touch target minimum
   - Color legend row below grid: "Less ▫️ ● ●● ●●● More"

3. **Monthly Calendar** (existing — enhanced)
   - Same month navigation as today (prev/next arrows)
   - Same dot indicators on workout days
   - Same tap-to-filter behavior
   - NEW: Cells with workouts get a subtle background tint (consistent with heatmap colors)

4. **Session List** (existing — unchanged)
   - Same filtered list with search
   - Same session cards showing name, duration, set count

### Data Model

**No new tables needed.** All data comes from existing `workout_sessions` table.

**New DB queries needed:**

```typescript
// Get all session dates in a date range (for heatmap)
// Returns Map<YYYY-MM-DD, count>
async function getSessionCountsByDay(
  startTs: number, 
  endTs: number
): Promise<Map<string, number>>

// Get longest streak (weeks) — similar to computeStreak but finds max
function computeLongestStreak(timestamps: number[]): number

// Get total completed sessions count
async function getTotalSessionCount(): Promise<number>
```

### Implementation Details

#### Heatmap Grid Component

Create a reusable `WorkoutHeatmap` component:

```
components/WorkoutHeatmap.tsx
```

**Props:**
- `data: Map<string, number>` — day → session count
- `weeks: number` — how many weeks to show (default 16)
- `onDayPress?: (date: string) => void` — callback for cell tap

**Rendering:**
- Pure React Native `View` components (no chart library needed — it's a simple grid)
- 7 rows × N columns, each cell is a rounded square
- Cell size calculated from screen width: `Math.floor((width - dayLabelWidth - padding) / weeks)`
- Visual cell size: 14–24px (rounded square with colored fill)
- **Each cell wrapped in a `Pressable` with `hitSlop` to ensure 48dp minimum touch target** (per CableSnap SKILL a11y requirement). Visual size stays compact; interactive area expands invisibly.
- Gap between cells: 2px

**Color scale (with secondary visual indicator for colorblind accessibility):**
```typescript
function heatmapColor(count: number, theme: MD3Theme): string {
  if (count === 0) return theme.colors.surfaceVariant;
  if (count === 1) return theme.colors.primaryContainer;
  if (count === 2) return withOpacity(theme.colors.primary, 0.7);
  return theme.colors.primary;
}
```

**Secondary visual channel:** Each cell displays a small dot count inside the cell to indicate session count (no dots for 0, 1 dot for 1 session, 2 dots for 2, "3+" text for 3+). This ensures color is NEVER the sole indicator — colorblind users can distinguish levels via dot count. Dots are rendered as tiny filled circles (3px diameter) centered in the cell.

**Accessibility labels:** Every heatmap cell includes:
- `accessibilityLabel="[Day name] [Date], [N] workout(s)"` (e.g., "Monday April 14, 2 workouts")  
- `accessibilityRole="button"` (since cells are tappable)
- Heatmap container: `accessibilityRole="grid"`
- Streak summary items: `accessibilityLabel="Current streak: N weeks"`, etc.

**Color legend:** Below the heatmap grid, render a legend row: `"Less"  ▫️ ● ●● ●●●  "More"` showing the scale with both colors and dot counts.

#### Streak Calculation Enhancement

Add `computeLongestStreak` to `lib/format.ts`:

```typescript
export function computeLongestStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const weeks = new Set(timestamps.map((ts) => mondayOf(new Date(ts))));
  const sorted = Array.from(weeks).sort((a, b) => a - b);
  let max = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff === 7 * 24 * 60 * 60 * 1000) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 1;
    }
  }
  return max;
}
```

#### New DB Query

Add to `lib/db/sessions.ts`:

```typescript
export async function getSessionCountsByDay(
  startTs: number,
  endTs: number
): Promise<{ date: string; count: number }[]> {
  return query<{ date: string; count: number }>(
    `SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS date,
            COUNT(*) AS count
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ? AND started_at < ?
     GROUP BY date
     ORDER BY date ASC`,
    [startTs, endTs]
  );
}

export async function getTotalSessionCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workout_sessions WHERE completed_at IS NOT NULL"
  );
  return row?.count ?? 0;
}
```

### Acceptance Criteria

- [ ] Streak summary bar shows current streak, longest streak, and total workouts (with Material Icons, not emoji)
- [ ] Heatmap shows last 16 weeks of workout data with 4-level color scale AND dot-count secondary indicator
- [ ] Heatmap cells are tappable — tapping auto-navigates to the correct month and highlights that day
- [ ] All heatmap cells have `accessibilityLabel` with day name, date, and workout count
- [ ] Heatmap container has `accessibilityRole="grid"`
- [ ] Each cell touch target meets 48dp minimum via `hitSlop`
- [ ] Color legend row shown below heatmap
- [ ] Heatmap respects theme (light/dark mode) — colors derive from theme tokens
- [ ] Monthly calendar cells get subtle background tint on workout days (consistent with heatmap)
- [ ] All existing history.tsx functionality preserved (search, month nav, session list)
- [ ] Responsive: heatmap scales on tablet (larger cells, more spacing)
- [ ] Empty state: heatmap shows all-grey grid with encouraging message
- [ ] Loading state: skeleton/shimmer placeholder while heatmap data loads
- [ ] Longest streak calculation is accurate (handles gaps correctly)
- [ ] Screen loads fast — heatmap data fetched with single query
- [ ] PR passes all existing tests with no regressions
- [ ] New tests: streak summary rendering, heatmap color logic, date calculations, accessibility labels

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts ever | Heatmap all grey (no dots), streaks = 0, total = 0, encouraging CTA |
| First workout today | Heatmap shows 1 colored cell with 1 dot, streak = 1 week |
| Multiple workouts same day | Cell uses darkest color level, shows dot count (2 dots or "3+") |
| Very old account (years) | Only last 16 weeks shown by default, heatmap doesn't load all history |
| Timezone edge | Use local timezone for date bucketing (matching existing behavior) |
| Screen resize (rotation) | Heatmap re-renders with recalculated cell sizes |
| 3+ sessions in a day | Uses max color intensity + "3+" text overlay |
| Data loading | Skeleton/shimmer placeholder shown while DB query executes |
| Cross-month cell tap | If tapped cell is in a different month than currently displayed, auto-navigate monthly calendar to that month first, then highlight/filter the day |
| Screen reader active | VoiceOver/TalkBack reads each cell as "[Day] [Date], N workouts" and streak summary with counts |
| Colorblind user | Dot count inside cells provides non-color distinction between workout levels |

### Out of Scope

- Yearly heatmap view (GitHub-style full year) — future enhancement
- Sharing heatmap as image — future enhancement
- Daily streak (vs weekly) — keep consistent with existing computeStreak
- Workout type filtering on heatmap — future enhancement
- Swipe gestures on heatmap — too complex for first iteration

### Dependencies

- None — all infrastructure exists (DB queries, format helpers, theming)

### File Changes

| File | Change |
|------|--------|
| `components/WorkoutHeatmap.tsx` | NEW — reusable heatmap grid component |
| `app/history.tsx` | MODIFY — add streak summary + heatmap section above existing calendar |
| `lib/format.ts` | MODIFY — add `computeLongestStreak` function |
| `lib/db/sessions.ts` | MODIFY — add `getSessionCountsByDay`, `getTotalSessionCount` |
| `__tests__/lib/format.test.ts` | MODIFY — add tests for `computeLongestStreak` |
| `__tests__/components/WorkoutHeatmap.test.tsx` | NEW — unit tests for heatmap component |

### Risk Assessment

**Low risk** — this feature:
- Adds no new dependencies
- Modifies only one existing screen (history.tsx) with additive changes
- Adds 2 simple DB queries using existing patterns
- Uses only standard React Native Views (no complex graphics)
- Cannot break existing functionality if implemented as additive sections

### Estimated Complexity

- **Implementation**: Medium (1 new component, 1 screen enhancement, 2 DB queries)
- **Testing**: Low (pure functions + component rendering)
- **Review risk**: Low (no architectural changes)

---

## Review: Tech Lead (Technical Feasibility)

**Reviewer**: techlead
**Date**: 2026-04-15
**Verdict**: APPROVED

### Technical Feasibility
Fully buildable with the current stack. All proposed changes are additive — no refactoring, no new deps, no schema changes.

### Architecture Fit
- Current patterns: **Compatible** — DB queries use `query`/`queryOne`, components use `useTheme()` + `useLayout()`, screen wraps in `ErrorBoundary`
- Required refactoring: **None**

### Complexity Assessment
- Estimated effort: **Medium**
- Risk level: **Low**
- New dependencies: **None**

### Minor Implementation Notes
1. `withOpacity` helper needs to be created — extend existing `hexToRgb` in `lib/format.ts`
2. Heatmap tap → month navigation is sufficient; don't over-engineer auto-scroll
3. `computeLongestStreak` loading all timestamps is consistent with existing `computeStreak` pattern
4. Collapsible state is fine as ephemeral `useState`
5. Export new DB functions from `lib/db/index.ts`
6. Follow `.learnings/pitfalls/sql-queries.md` re: bounded queries (BLD-79/80)

### Decision
**APPROVED** — Technically sound, follows existing patterns, well-scoped, low risk. Ready for implementation.

---

## Review: Quality Director (UX Critique)

**Reviewer**: quality-director
**Date**: 2026-04-15
**Verdict**: ~~NEEDS REVISION~~ → APPROVED (Rev 2)

### UX Assessment
Good concept — GitHub-style heatmap is proven for motivation. Additive approach to the existing history screen is safe. However, three Critical accessibility issues must be fixed before approval.

### Accessibility — 3 Critical Issues

**[C] A11Y-TT-01: Heatmap cell touch targets too small.** Plan specifies cells at 14–24px. CableSnap SKILL requires minimum 48×48dp on ALL interactive elements. Users with motor impairments cannot tap these reliably.

**Required fix**: Either (a) increase cell size to ≥48dp and reduce weeks displayed, (b) remove tap-to-navigate from individual cells, or (c) add invisible expanded hit areas (48dp Pressable wrapping smaller visual cells).

**[C] A11Y-COLOR-01: Color is the sole indicator of workout count.** The heatmap uses ONLY color intensity to convey data. Colorblind users (up to 8% of males) cannot distinguish intensity levels.

**Required fix**: Add a secondary visual indicator — small dot count, number overlay on cells, or pattern fills.

**[C] A11Y-LABEL-01: No accessibilityLabel on heatmap cells.** Plan does not mention screen reader support. A grid of colored squares with no labels is invisible to screen reader users.

**Required fix**: Each cell needs `accessibilityLabel="Monday April 14, 2 workouts"`. Container needs `accessibilityRole="grid"`. Streak summary items need labels.

### Edge Cases — 2 Missing

**[M] No loading state.** Plan doesn't specify what users see while `getSessionCountsByDay` executes. Add a skeleton/shimmer placeholder.

**[M] Month navigation on cell tap.** If the tapped cell is in a different month, auto-navigate to the correct month first.

### Recommendations (Nice to Have)

- Replace emoji icons with Material Icons for consistent cross-device rendering
- Add `useReducedMotion()` check for heatmap animations
- Consider a color legend below the heatmap

### Issues Found (Must Fix)

- [ ] **[C]** Touch targets: heatmap cells must meet 48dp minimum
- [ ] **[C]** Color-only encoding: add secondary visual indicator for colorblind users
- [ ] **[C]** Screen reader: add accessibilityLabel to all heatmap cells and streak items
- [ ] **[M]** Add loading/skeleton state for heatmap data fetch
- [ ] **[M]** Specify month auto-navigation when tapping cells in different months

### Decision
~~**NEEDS REVISION** — Three Critical accessibility violations must be addressed. Fix the items above and re-submit.~~

**APPROVED (Rev 2)** — All 3 Critical and 2 Major issues addressed in revision. Plan now meets CableSnap SKILL a11y and UX standards. Ready for implementation.
