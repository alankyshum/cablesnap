# Feature Plan: Weekly Training Summary Card

**Issue**: BLD-470
**Author**: CEO
**Date**: 2026-04-21
**Status**: DRAFT

## Problem Statement

Users open CableSnap daily — before, during, and after workouts. The home screen shows their next scheduled workout and various insights, but there's **no at-a-glance summary of their training week**. The AdherenceBar shows dots for workout days, but doesn't communicate volume, PRs, or how the week compares to last week.

Users who train 4-5x/week want instant feedback: "Am I on track this week? How does this week compare to last?" Currently they have to dig into the Progress tab's monthly report to find aggregated data — and that's monthly, not weekly.

**User emotion today**: "I open the app and see my next workout, but I have no idea if I'm on pace for my weekly goals or if I'm training harder than last week."

**User emotion after**: "Every time I open CableSnap, I instantly see my week — 3 of 5 workouts done, volume up 8% from last week, 2 PRs hit. I feel motivated to keep going."

## Proposed Solution

A **"This Week" summary card** on the home screen that shows key training metrics for the current week at a glance, with week-over-week comparison.

### V1 Scope

#### 1. New Data Layer: `lib/db/weekly-summary.ts`

Pure query functions that aggregate data for the current calendar week (Monday–Sunday):

| Metric | Source | Query Pattern |
|--------|--------|---------------|
| Sessions completed | `workout_sessions` (completed_at in week range) | COUNT |
| Sessions goal | `app_settings` frequency goal | Direct read |
| Total volume (kg/lbs) | `workout_sets` joined to sessions | SUM(weight × reps) for completed, non-warmup sets |
| Volume delta vs last week | Same query for previous week | Percentage change |
| PRs hit this week | `workout_sets.is_pr = 1` in week range | COUNT |
| Total duration | `workout_sessions` | SUM(completed_at - started_at) |

```typescript
export interface WeeklySummary {
  sessionsCompleted: number;
  sessionsGoal: number | null;  // null if no goal set
  totalVolume: number;
  volumeDeltaPercent: number | null;  // null if no previous week data
  prsHit: number;
  totalDurationMinutes: number;
}

export async function getWeeklySummary(weekStartDate: string): Promise<WeeklySummary>;
```

**Key design**: Single function, single query batch. No N+1. Returns all metrics in one call.

#### 2. New Hook: `hooks/useWeeklySummary.ts`

React Query hook wrapping `getWeeklySummary()`:

```typescript
export function useWeeklySummary(): { data: WeeklySummary | null; isLoading: boolean };
```

- Invalidated by `"home"` query version bump (same as other home data)
- Stale time: 5 minutes (home screen is opened frequently)

#### 3. New Component: `components/home/WeeklySummaryCard.tsx`

Compact card showing this week's training snapshot:

```
┌──────────────────────────────────────┐
│  This Week                           │
│                                      │
│  3/5 workouts  ·  12,450 kg  ↑8%    │
│  2 PRs  ·  3h 45m                    │
└──────────────────────────────────────┘
```

| Element | Display |
|---------|---------|
| **Title** | "This Week" |
| **Sessions** | "3/5 workouts" (or "3 workouts" if no goal set) |
| **Volume** | "12,450 kg" with ↑/↓ delta vs last week (green/red) |
| **PRs** | "2 PRs" (or hidden if 0) |
| **Duration** | "3h 45m" total training time |

**Empty state**: If no workouts this week, show "No workouts yet this week — let's go! 💪"

**Design decisions**:
- Single compact card — maximum 2 lines of content
- Uses existing Card/CardContent UI primitives
- Volume delta uses ↑/↓ arrows with green/red color (from theme tokens)
- No tap action in V1 (future: tap → detailed weekly breakdown)
- Respects unit preference (kg/lbs) from app settings

#### 4. Integration: `app/(tabs)/index.tsx`

Place the WeeklySummaryCard on the home screen, positioned **above** the templates list but **below** the active session banner and frequency adherence bar. This slot puts it in the user's natural scan path without displacing critical workout-start UI.

### Data Flow

```
Home screen mounts
        ↓
useWeeklySummary() → React Query
        ↓
getWeeklySummary(currentWeekStart)
  ├─ Query sessions this week → count, duration
  ├─ Query sets this week → volume, PRs
  ├─ Query sessions last week → previous volume
  └─ Read frequency goal setting
        ↓
WeeklySummaryCard renders metrics
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts this week | "No workouts yet this week — let's go! 💪" |
| No workouts last week | Volume shows absolute value, no delta arrow |
| No frequency goal set | Sessions shows "3 workouts" without "/5" denominator |
| Monday (start of week) | Shows fresh card with zero or one workout |
| Mid-workout (session active) | Card shows stats WITHOUT current incomplete session |
| User changes units mid-week | Volume recalculates on next render (uses formatWeight) |
| Very large volume (100,000+ kg) | Format with K suffix: "102K kg" |
| Zero volume (bodyweight-only workout) | Shows "0 kg" — still counts sessions and duration |

### Acceptance Criteria

- [ ] Given the home screen loads When the user has completed 3 workouts this week Then the card shows "3 workouts" with volume, PRs, and duration
- [ ] Given the user completed workouts last week When this week's volume is higher Then a green ↑ arrow with percentage is shown
- [ ] Given the user has no workouts this week When the home screen loads Then the empty state message appears
- [ ] Given no frequency goal is set When the card renders Then sessions show count only (no "/N" denominator)
- [ ] Given the user completes a workout When they return to home Then the card updates (via query invalidation)
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings

### User Experience Considerations

- [ ] Card is glanceable — all info in ≤2 lines
- [ ] Volume delta provides instant "am I progressing?" feedback
- [ ] Empty state is motivational, not punitive
- [ ] Respects user's unit preference (kg/lbs)
- [ ] No tap interaction needed — passive information display
- [ ] Works one-handed (no interaction required)

### Out of Scope (V1)

- Tap to expand/detail view
- Share weekly summary as image
- Weekly push notification digest
- Week-over-week exercise breakdown
- Historical weekly comparison chart
- "Catch-up" nudges ("3 workouts left, 2 days remaining")

### Dependencies

- `lib/db/session-stats.ts` — existing volume/PR query patterns
- `hooks/useQueryVersion.ts` — home query invalidation
- `components/ui/card.tsx` — Card UI primitive
- `lib/format.ts` — formatWeight, formatDuration utilities

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Query performance (aggregating all sets) | Low — SQLite is fast for bounded week ranges | Low | Single batch query, no N+1 |
| Test budget overflow | Medium — 44 remaining | High | Target 10 tests max |
| Cluttering home screen | Low | Medium | Single compact card, 2 lines max |

### Test Plan

| Test | Type | Description |
|------|------|-------------|
| `getWeeklySummary()` returns correct counts | Unit | Mock DB with known sessions/sets, verify all metrics |
| `getWeeklySummary()` calculates volume delta | Unit | Two weeks of data, verify percentage |
| `getWeeklySummary()` handles empty week | Unit | No sessions → all zeros |
| `getWeeklySummary()` handles no previous week | Unit | Only current week data → null delta |
| `WeeklySummaryCard` renders metrics | Unit | Pass summary data, verify text output |
| `WeeklySummaryCard` renders empty state | Unit | Pass zero sessions, verify empty message |
| `WeeklySummaryCard` hides PRs when zero | Unit | prsHit=0, verify no "0 PRs" text |
| `WeeklySummaryCard` shows delta arrow | Unit | Positive/negative delta, verify ↑/↓ and color |

**Estimated test count**: 8-10 new tests
**Current budget**: 1756/1800 (44 remaining) — fits within budget

### Implementation Notes

- Week boundaries: Monday 00:00 to Sunday 23:59 (ISO week standard)
- Volume query: `SUM(weight * reps) WHERE completed = 1 AND is_warmup = 0`
- Duration: `SUM(julianday(completed_at) - julianday(started_at)) * 24 * 60` (minutes)
- PR query: `COUNT(*) WHERE is_pr = 1` in week range
- Use `formatWeight()` from `lib/format.ts` for unit-aware display
- Use `getAppSetting("frequency_goal")` for sessions goal denominator

## Review Feedback

_Pending reviews from @ux-designer, @quality-director, @techlead_
