# Feature Plan: Smart Training Insights Card

**Issue**: BLD-382
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement
The home screen shows raw stats (streak count, week count, PR count) but doesn't synthesize the user's training data into actionable, motivating insights. Users see numbers but don't get contextual meaning — "Is my training going well? Am I missing muscle groups? Am I improving?" These are the questions that keep people coming back to the gym, and right now the app doesn't answer them proactively.

## User's Emotional Journey
**Without this feature:** The user opens the app, sees "Streak: 3, This Week: 2" — useful but dry. They don't feel a sense of progress or accomplishment. They might not realize they've been neglecting leg day for 10 days, or that their bench press has improved significantly this month.

**After:** The user opens the app and sees "🔥 Your bench press is up 5kg this month — nice work!" or "⚠️ Shoulders haven't been trained in 9 days." They feel seen, motivated, and informed. The app becomes a training partner, not just a log book.

## User Stories
- As a gym-goer, I want to see a personalized training insight when I open the app so that I feel motivated and informed about my progress
- As a lifter tracking progressive overload, I want to know when my lifts are trending up so that I feel rewarded for consistency
- As someone following a balanced program, I want to be alerted when I've neglected a muscle group so I can adjust my next workout

## Proposed Solution

### Overview
Add a single "Training Insight" card to the home screen, positioned between the StatsRow and the RecentWorkoutsList. The card displays ONE insight per session (refreshes when the user opens the app), selected from a prioritized list of insight generators based on the user's recent training data.

### UX Design
- **Placement:** Below StatsRow, above RecentWorkoutsList
- **Visual:** A compact card with an emoji icon, a bold insight headline, and an optional supporting detail line
- **Interaction:** Tapping the card navigates to the relevant screen (e.g., tap a PR insight → exercise detail, tap a muscle gap insight → exercise library filtered to that muscle)
- **Dismissal:** Small "×" button to dismiss the current insight and reveal the next one (or hide the card for the day)
- **One-handed use:** Card is tappable, no complex gestures
- **Empty state:** If there's not enough data (fewer than 3 completed sessions), show a welcoming message: "Complete a few more workouts and I'll start showing you insights! 💪"

### Insight Types (Priority Order)
1. **New PR celebration** — "🏆 New PR! Bench Press: 100kg" (highest priority — show immediately after a PR session)
2. **Streak milestone** — "🔥 5-week streak! Your longest yet!" (show at milestone streaks: 3, 5, 10, 15, 20, 25, 50, 100)
3. **Muscle group gap** — "⚠️ You haven't trained [muscle] in [N] days" (show when any primary muscle group hasn't been hit in 7+ days)
4. **Strength trend** — "📈 Your [exercise] is up [X]kg/lbs this month" (show for exercises with 3+ sessions in the last 30 days with positive e1RM trend)
5. **Volume trend** — "💪 Training volume up [X]% vs last month" (positive trend in total weekly sets)
6. **Consistency praise** — "⭐ [N] workouts this week — your best in [M] weeks!" (when current week count exceeds recent average)
7. **Workout frequency** — "📊 You've averaged [N] workouts/week this month" (informational, shown when no higher-priority insight available)

### Technical Approach

#### New Files
| File | Purpose |
|------|---------|
| `lib/insights.ts` | Pure functions: each insight generator takes data, returns `Insight | null`. Prioritizer selects the top insight. |
| `components/home/InsightCard.tsx` | Presentational component: renders the insight with emoji, text, and tap target |
| `hooks/useInsightData.ts` | Data hook: fetches the data needed by insight generators (recent PRs, muscle group dates, e1RM trends, volume) |

#### Data Queries Needed
All data can be derived from existing tables — no schema changes:
- **Recent PRs**: Already available from `getRecentPRs()` in home data
- **Muscle group last trained**: `SELECT MAX(s.completed_at), e.primary_muscles FROM workout_sets ws JOIN workout_sessions s ... GROUP BY muscle` — new query
- **E1RM trend**: Already available from `getExercise1RMChartData()` — reuse for top exercises
- **Volume trend**: `SELECT COUNT(*) FROM workout_sets WHERE completed = 1 AND completed_at > [date]` — new query
- **Streak info**: Already computed via `computeStreak()`

#### Architecture
```
loadHomeData() → adds insightData to return value
  ↓
useInsightData(insightData) → computes insights via lib/insights.ts
  ↓
InsightCard(insight) → renders the selected insight
```

Key design decisions:
- **Pure insight generators**: Each generator is a pure function `(data) => Insight | null` — easy to test, easy to add new types
- **Priority-based selection**: Generators are called in priority order; first non-null result wins
- **No new dependencies**: Uses existing data queries and SQLite
- **No caching/persistence**: Insight is computed fresh on each app open — simple, no stale data

### Scope
**In Scope:**
- InsightCard component on home screen
- 7 insight types as listed above
- Tap-to-navigate for PR and muscle gap insights
- Dismiss button to hide current insight
- Empty state for new users (< 3 sessions)
- Unit tests for all insight generators

**Out of Scope:**
- Notification-based insights (push notifications with insights)
- AI/ML-based insights (all rules are deterministic)
- Insight history (no "past insights" screen)
- User preference for which insight types to show
- Animated transitions or confetti (keep it clean and simple)
- Insight sharing

### Acceptance Criteria
- [ ] Given the user has completed 3+ sessions, when they open the home screen, then an InsightCard appears between StatsRow and RecentWorkoutsList
- [ ] Given the user just completed a session with a new PR, when they return to the home screen, then the insight shows the PR celebration
- [ ] Given no muscle group has been neglected (all trained within 7 days), when a strength trend exists, then the insight shows the strength trend
- [ ] Given the user has fewer than 3 completed sessions, when they open the home screen, then the insight shows a welcoming message
- [ ] Given the user taps the dismiss button, when the insight is dismissed, then the next-priority insight is shown (or the card hides)
- [ ] Given the user taps a PR insight, when the exercise detail screen opens, then it navigates to the correct exercise
- [ ] Given the user taps a muscle gap insight, when the exercise library opens, then it's filtered to exercises for that muscle group
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx eslint . --ext .ts,.tsx --quiet` → 0 errors
- [ ] `npx tsc --noEmit` → 0 type errors
- [ ] `npx jest` → all tests pass

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| New user (0 sessions) | Card hidden entirely |
| User with 1-2 sessions | Show welcoming message |
| All muscle groups recently trained, no PRs, no trends | Show workout frequency insight (fallback) |
| User hasn't worked out in 30+ days | Show encouraging "Welcome back!" message |
| Very long muscle group name | Truncate with ellipsis |
| Multiple PRs in same session | Show the heaviest/most impressive one |
| User dismisses all insights | Card hides for the day |
| Dark mode | Card uses theme colors (no hardcoded colors) |
| Small screen (320px) | Card text wraps gracefully |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Home screen feels cluttered | Medium | Medium | Card is compact (max 2 lines), dismissible, positioned naturally in the flow |
| Insight queries slow down home load | Low | Medium | Queries are simple aggregations on indexed columns; add to existing Promise.all batch |
| Insights feel generic/unhelpful | Medium | Low | Priority system ensures the most relevant insight surfaces; can tune thresholds based on feedback |
| Muscle gap false positives (user intentionally skips) | Low | Low | 7-day threshold is generous; "×" dismiss handles edge cases |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** (2026-04-19)

**Critical Issues:**
1. **COGNITIVE-01**: 4 of 7 insight types duplicate existing home screen UI (StatsRow shows streak/PRs, RecoveryHeatmap shows muscle gaps, AdherenceBar shows frequency). Remove duplicates or replace the overlapping components — net visual elements must NOT increase.
2. **COGNITIVE-02**: Dismiss-to-reveal-next creates slot-machine decision overhead. Show ONE insight, dismiss hides card entirely.
3. **A11Y-01**: Missing accessibilityLabel, accessibilityRole, 48x48dp dismiss target, and text alternatives for emoji icons.

**Major Issues:**
4. **COGNITIVE-03**: "Between StatsRow and RecentWorkoutsList" spans 6 components — specify exact position and justify impact on Quick Start button reachability.
5. **OVERLAP-01**: RecoveryHeatmap vs muscle-gap-insight can show contradictory signals. Suppress muscle gap insight when RecoveryHeatmap is visible.

**Recommendation:** Consider replacing StatsRow with InsightCard for net-zero density. Cap insight types to 3-4 genuinely new ones (strength trend, volume trend, consistency praise).

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
