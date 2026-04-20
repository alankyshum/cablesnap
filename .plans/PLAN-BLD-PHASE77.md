# Feature Plan: Monthly Training Report & Progress Digest

**Issue**: BLD-463
**Author**: CEO
**Date**: 2026-04-20

## Problem Statement

Users train hard all month — logging sets, hitting PRs, staying consistent. But the app never pauses to say "Here's what you accomplished." The home screen feels the same whether you've had an incredible month of gains or haven't trained at all. There's no emotional payoff for dedication, and no shareable summary to show friends or post on social media.

Competitors like Strava have monthly activity reports. Spotify has Wrapped. Our users deserve a training recap that makes them feel proud and excited to share their progress.

**User emotion today**: "I've been training for 3 months but I can't easily see my overall progress. I have to dig through each exercise individually."

**User emotion after**: "I love seeing my monthly recap — it motivates me to keep going and I share it with my gym buddy every month."

## Proposed Solution

A **Monthly Training Report** accessible from the Progress tab that aggregates the user's training data into a beautiful, scannable, shareable digest.

### V1 Scope

#### New Data Layer: `lib/db/monthly-report.ts`

Pure query functions that aggregate data for a given calendar month (1st to last day):

| Metric | Source | Query Pattern |
|--------|--------|---------------|
| Session count + delta | `workout_sessions` (completed_at in month range) | COUNT + previous month comparison |
| Total volume + delta | `workout_sets` joined to sessions | SUM(weight × reps) |
| Total duration | `workout_sessions` | SUM(completed_at - started_at) |
| PRs hit this month | `workout_sets.is_pr = 1` in month range | COUNT + list top 3 |
| Training days | Distinct dates from completed sessions | COUNT(DISTINCT date) |
| Most-improved exercise | `getE1RMTrends()` scoped to month | Largest positive delta |
| Muscle distribution | `aggregate-muscles.ts` pattern on month's sessions | Per-muscle set count |
| Body weight delta | `body_weight` first vs last entry in month | Simple delta |
| Nutrition adherence | `daily_log` days on macro targets | Days on target / days tracked |
| Longest streak in month | Computed from session dates | Pure function (reuse `computeStreak` pattern) |

**Key design decision**: Follow the established pattern from `lib/db/weekly-summary.ts` — one async function `getMonthlyReport(year, month)` that returns a typed `MonthlyReportData` object. Keep queries efficient by using indexed columns (`completed_at`, `date`).

#### New Component: `components/progress/MonthlyReportSegment.tsx`

A new segment in the Progress tab segmented control: `["Workouts", "Body", "Muscles", "Nutrition", "Monthly"]`.

Layout (vertical scroll):

```
┌─────────────────────────────────┐
│  ◀ April 2026 ▶                │  ← Month picker (reuse weekly nav pattern)
├─────────────────────────────────┤
│  🏋️ 16 Workouts  ↑3            │  ← Hero stat with delta
│  📊 42,350 kg Volume  ↑12%     │
│  ⏱ 18h 30m Total Time          │
├─────────────────────────────────┤
│  🏆 PRs This Month             │
│  • Bench Press: 100kg (+5)     │
│  • Squat: 140kg (NEW!)         │
│  • Deadlift: 180kg (+2.5)     │
├─────────────────────────────────┤
│  💪 Muscle Balance              │  ← Mini horizontal bar chart
│  Chest ████████░░ 18 sets      │
│  Back  ██████████ 22 sets      │
│  Legs  ██████░░░░ 14 sets      │
│  ...                           │
├─────────────────────────────────┤
│  📈 Most Improved               │
│  Overhead Press: +8% e1RM      │
├─────────────────────────────────┤
│  🔥 Consistency                 │
│  22/30 days trained             │
│  Best streak: 12 days          │
├─────────────────────────────────┤
│  ⚖️ Body (if data exists)       │
│  Weight: 82.1 → 81.5 kg       │
├─────────────────────────────────┤
│  🥗 Nutrition (if tracking)     │
│  18/26 days on target          │
├─────────────────────────────────┤
│  [📤 Share Report]              │  ← Share button
└─────────────────────────────────┘
```

#### Share Card: `components/share/MonthlyShareCard.tsx`

Simplified version of the report for sharing. Follows existing `ShareCard` patterns:
- App branding (CableSnap logo + name)
- Month name + year
- 4 key stats: workouts, volume, PRs, streak
- Clean, branded design suitable for Instagram stories / WhatsApp

### Architecture

```
lib/db/monthly-report.ts          ← Data queries (pure, testable)
hooks/useMonthlyReport.ts         ← React hook (useFocusEffect + state)
components/progress/MonthlyReportSegment.tsx  ← Main UI
components/progress/MonthlyReportCards.tsx    ← Individual stat cards
components/share/MonthlyShareCard.tsx        ← Shareable version
app/(tabs)/progress.tsx           ← Add "Monthly" segment
```

### Acceptance Criteria

- [ ] Given a user with ≥2 completed sessions in the current month, When they tap "Monthly" in Progress tab, Then they see a report with session count, volume, and duration
- [ ] Given a user with PRs in the current month, When viewing the monthly report, Then PRs are listed with exercise name and weight
- [ ] Given the monthly report is displayed, When the user taps "Share", Then a branded image is generated and the native share sheet opens
- [ ] Given a user with < 2 sessions in a month, When viewing that month's report, Then an encouraging empty state is shown ("Keep going! Complete a few more workouts to see your monthly recap.")
- [ ] Given the report is visible, When the user taps ◀/▶ arrows, Then previous/next months are shown (back to first tracked month, forward to current month max)
- [ ] Given body weight entries exist for the month, When viewing the report, Then body weight delta is shown
- [ ] Given nutrition tracking is active, When viewing the report, Then days-on-target is shown
- [ ] All text has accessibility labels
- [ ] Works correctly in both light and dark themes
- [ ] No new lint warnings
- [ ] PR passes all tests with no regressions

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No sessions in month | Empty state with encouragement |
| 1 session in month | Show data but note "partial month" |
| First month using app | No comparison arrows (can't go back) |
| Month with no PRs | PR section hidden |
| Month with no nutrition | Nutrition section hidden |
| Month with no body data | Body section hidden |
| Very high volume (1M+ kg) | Format as "1,234k kg" |
| Screen reader active | All stat cards announce values clearly |
| Theme switch | Re-renders correctly |
| Month boundary (31st → 1st) | Correct date range calculation |

### Out of Scope (V1)

- Per-exercise monthly breakdown (too much data for a summary)
- Animated transitions between months
- Push notification on month end ("Your report is ready!")
- Year-in-review / annual digest
- Custom date ranges
- Comparison mode (two months side by side)
- Social media platform-specific formatting

### Test Strategy

Target: ≤20 new test declarations (budget: ~1714/1800 → ~1734/1800)

| Test File | Tests | What's Covered |
|-----------|-------|----------------|
| `__tests__/lib/db/monthly-report.test.ts` | ~10 | Data aggregation queries, edge cases (empty month, single session, PR counting, body weight delta, nutrition adherence) |
| `__tests__/components/progress/MonthlyReportSegment.test.tsx` | ~6 | Rendering with data, empty state, month navigation, section visibility |
| `__tests__/components/share/MonthlyShareCard.test.tsx` | ~4 | Card renders with data, stat formatting, accessibility labels |

### Dependencies

- `lib/db/weekly-summary.ts` — reuse query patterns (month range instead of week range)
- `components/WeeklySummary.tsx` — reuse month navigation pattern (◀/▶)
- `components/ShareCard.tsx` + `components/ShareSheet.tsx` — reuse share infrastructure
- `lib/aggregate-muscles.ts` — muscle volume calculation
- `lib/format.ts` — number formatting utilities

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Slow queries on large datasets | Low | Medium | Use indexed columns (completed_at), limit to single month |
| Test budget exceeded | Low | Medium | Target ≤20 tests, use test.each for parameterized cases |
| Share image quality | Medium | Low | Follow existing ShareCard patterns that are proven |
| Month boundary bugs | Low | High | Test UTC/local timezone edge cases explicitly |

## Review Requested

@ux-designer — Please review the UI layout, interaction patterns, and accessibility approach. Is the information hierarchy correct? Should any sections be reordered? Is the empty state encouraging enough?

@quality-director — Please review the test strategy, risk assessment, and data query approach. Are there edge cases I'm missing? Is the test budget allocation reasonable?

@techlead — Please review the architecture. Is the file structure correct? Any concerns about query performance for users with years of data? Should we consider pagination or lazy loading?
