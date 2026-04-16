# Feature Plan: Weekly Training Summary & Insights

**Issue**: BLD-181
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT

## Problem Statement

FitForge tracks workouts, nutrition, body measurements, and achievements — but users have no periodic summary that ties this data together into a digestible, motivating overview. Users must manually check each tab (Progress, Nutrition, Body) to understand how their week went.

Fitness apps with weekly summaries see significantly higher user retention because they:
1. Provide a structured reflection point ("How was my week?")
2. Surface trends users wouldn't otherwise notice (e.g., declining volume, missed macro targets)
3. Create a habit loop — users open the app even on rest days to check their summary
4. Celebrate consistency, which is the #1 predictor of fitness success

**Why now?** FitForge has comprehensive data collection across workouts (sessions, sets, volume, PRs), nutrition (macros, calorie targets), and body (weight, measurements). All the raw data exists — what's missing is the synthesis layer that makes this data actionable.

## User Stories

- As a user, I want to see a weekly summary of my training so I can reflect on my progress
- As a user, I want to see how many workouts I completed vs. my goal so I can stay accountable
- As a user, I want to see my total volume and how it compares to last week so I can track progressive overload
- As a user, I want to see if I hit any new PRs this week so I can celebrate wins
- As a user, I want to see my nutrition adherence (how many days I hit my macro targets) so I can improve consistency
- As a user, I want to see my body weight trend for the week so I can see if my diet is working
- As a user, I want to share my weekly summary as text so I can post it or tell friends

## Proposed Solution

### Overview

Add a "Weekly Summary" card to the Progress tab that auto-generates a weekly training digest. The summary covers the current week (Mon–Sun) with a "previous week" comparison. Users can swipe or tap arrows to navigate between weeks. The summary is generated from existing SQLite data — no new data collection needed.

### UX Design

**Location**: Top of the Progress tab, above the existing muscle volume segment and chart sections.

**Layout**: A single expandable card with key stats. Collapsed state shows headline metrics; expanded state shows full breakdown.

#### Collapsed State (Default)
```

 📊 Week of Apr 14 – Apr 20    ◀ ▶  │
                                     │
  4/5 workouts  ·  +12% volume  ·  2 PRs │
                                     │
             [ View Details ]        │

```

#### Expanded State
```

 📊 Week of Apr 14 – Apr 20    ◀ ▶  │
                                     │
 WORKOUTS                            │
  Completed: 4 of 5 scheduled  (80%)│
  Total duration: 3h 45m            │
  Avg session: 56 min               │
                                     │
 VOLUME                              │
  Total: 24,500 kg    ▲ +12% vs last│
  Avg per session: 6,125 kg         │
                                     │
 PERSONAL RECORDS                    │
  🏆 Bench Press: 100 kg (kg +5)    
  🏆 Squat: 140 kg (+10 kg)        │
                                     │
 NUTRITION (4/7 days tracked)        │
  Avg calories: 2,150 / 2,200 target│
  Protein avg: 162g / 150g target ✓ │
  Days on target: 3/4               │
                                     │
 BODY                                │
  Weight: 82.1 kg → 81.8 kg (−0.3)  │
                                     │
 STREAK                              │
  Current: 12 weeks  🔥             │
                                     │
         [ Share Summary ]           │

```

**Navigation**: Left/right arrows to navigate between weeks. Current week is the default. Can view up to 12 weeks back.

**Empty states**:
- No workouts this week: "No workouts logged this week. Start one from the Workouts tab!"
- No nutrition data: Nutrition section hidden (not shown as zeroes)
- No body data: Body section hidden

**Accessibility**:
- All stats have descriptive a11y labels (e.g., "4 of 5 scheduled workouts completed, 80 percent")
- Week navigation buttons have labels ("Previous week", "Next week")
- Trend indicators include text alternatives (not just arrows/colors)

### Technical Approach

#### Data Sources (All Existing)
All data comes from existing SQLite queries, no new tables needed:

1. **Workouts**: `workout_sessions` table — filter by `started_at` within week range
   - Count completed sessions
   - Sum duration_seconds
   - Compare to previous week's count
   - Use `weekly_schedule` for "scheduled" count (if program active)

2. **Volume**: `workout_sets` table joined with `workout_sessions`
   - Sum (weight × reps) for the week
   - Compare to previous week

3. **PRs**: `workout_sets` — detect new max weight per exercise within the week
   - Compare each set's weight to all prior sets for that exercise

4. **Nutrition**: `daily_log` and `macro_targets` tables
   - Count days with entries
   - Average calories/protein/carbs/fat
   - Compare to target
   - Count "on target" days (within ±10% of target)

5. **Body**: `body_weight` table
   - First and last entry of the week
   - Week-over-week delta

6. **Streak**: Reuse existing `computeStreak()` from `lib/format.ts`

#### Architecture

- **New file**: `lib/weekly-summary.ts` — pure functions that query SQLite and return summary data
- **New component**: `components/WeeklySummary.tsx` — the UI card
- **Modified file**: `app/(tabs)/progress.tsx` — integrate the summary card at the top

No new dependencies. No new database tables. Uses existing query patterns from `lib/db.ts`.

#### Performance
- Summary computation is bounded: max 7 days of data per section
- Memoize with `useMemo` keyed on week start date
- Only compute expanded sections when user expands (lazy)
- Navigation preloads adjacent weeks

### Scope

**In Scope:**
- Weekly summary card on Progress tab
- Workout count, duration, volume with week-over-week comparison
- PR detection for the week
- Nutrition adherence summary (if data exists)
- Body weight trend (if data exists)
- Week navigation (current + 12 weeks back)
- Text sharing of summary
- Collapsed/expanded states
- Proper empty states for each section

**Out of Scope:**
- Push notifications for weekly summary (future feature)
- Monthly/yearly summaries (future feature)
- Custom date range selection
- Export summary as image/PDF
- Comparison to arbitrary past weeks (only previous week)
- Fitness recommendations based on data

### Acceptance Criteria
- [ ] Given the user has logged workouts this week, When they open the Progress tab, Then they see a weekly summary card showing workout count, total volume, and duration
- [ ] Given the user logged PRs this week, When they view the summary, Then the PRs are listed with exercise name, new weight, and improvement delta
- [ ] Given the user has nutrition entries this week, When they view the expanded summary, Then they see average calories/macros vs targets and days-on-target count
- [ ] Given the user has body weight entries this week, When they view the summary, Then they see start-of-week and end-of-week weight with delta
- [ ] Given no workouts this week, When the user views the summary, Then it shows "No workouts logged this week" with a CTA to start one
- [ ] Given no nutrition data this week, When the user views the summary, Then the nutrition section is hidden (not shown as zeroes)
- [ ] Given the user taps the left arrow, When the previous week has data, Then the summary updates to show previous week's stats
- [ ] Given the user taps "Share Summary", When the share sheet opens, Then it contains a formatted text summary of the week's stats
- [ ] Given the app uses kg units, When the user views the summary, Then all weights are shown in kg; same for lb users
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings or TypeScript errors
- [ ] All interactive elements have accessibility labels
- [ ] Minimum touch target size of 48×48dp for navigation arrows

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Week with 0 workouts | Show empty state message with CTA |
| Week with workouts but no sets | Show workout count/duration, volume shows 0 |
| No nutrition tracking at all | Hide nutrition section entirely |
| Partial nutrition week (3/7 days) | Show "3/7 days tracked" and average across tracked days only |
| No body weight entries | Hide body section |
| Single body weight entry | Show just the weight, no delta |
| User navigates to a week with no data at all | Show "No activity recorded this week" |
| Week boundary (Monday start vs Sunday start) | Use Monday as week start (ISO standard) |
| User's first week using the app | No "vs last week" comparison, show absolute values only |
| Very large volume numbers | Format with comma separators (e.g., 24,500 kg) |
| App in dark mode | Card respects theme colors |
| Screen reader active | All stats read with full context |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Performance on weeks with many sessions | Low | Low | Bounded query (max 7 days), memoized |
| Incorrect volume calculation | Medium | Medium | Reuse existing volume query patterns from progress tab |
| Week boundary edge cases | Medium | Low | Use consistent ISO week start (Monday) |
| Stale data after logging new workout | Low | Medium | Invalidate query on focus (useFocusRefetch pattern) |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
