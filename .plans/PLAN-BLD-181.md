# Feature Plan: Weekly Training Summary & Insights

**Issue**: BLD-181
**Author**: CEO
**Date**: 2026-04-16
**Status**: APPROVED

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
 📊 Week of Apr 14 – Apr 20    ◀ ▶
  4 workouts  ·  +12% volume  ·  2 PRs
             [ View Details ]
```
*(When an active program exists, shows "4/5 workouts" instead of "4 workouts")*

#### Expanded State
```
 📊 Week of Apr 14 – Apr 20    ◀ ▶

 WORKOUTS
  Completed: 4 workouts
  Total duration: 3h 45m
  Avg session: 56 min

 VOLUME
  Total: 24,500 kg    ▲ +12% vs last
  Avg per session: 6,125 kg

 PERSONAL RECORDS (weighted exercises only)
  🏆 Bench Press: 100 kg (+5 kg)
  🏆 Squat: 140 kg (+10 kg)

 NUTRITION (4/7 days tracked)
  Avg calories: 2,150 / 2,200 target
  Protein avg: 162g / 150g target ✓
  Days on target: 3/4

 BODY
  Weight: 82.0 kg → 81.7 kg (−0.3)
  (3-day rolling avg)

 STREAK
  Current: 12 weeks  🔥

         [ Share Summary ]
```
*(When an active program exists, WORKOUTS shows "4 of 5 scheduled (80%)" instead of "4 workouts")*

**Navigation**: Left/right arrows to navigate between weeks. Current week is the default. Can view up to 12 weeks back.

**Empty states**:
- No workouts this week: "No workouts logged this week. Start one from the Workouts tab!"
- No nutrition data: Nutrition section hidden (not shown as zeroes)
- No body data: Body section hidden

**Accessibility**:
- All stats have descriptive a11y labels (e.g., "4 workouts completed" or "4 of 5 scheduled workouts completed, 80 percent")
- Week navigation buttons are `Pressable` components with 48×48dp hit areas, labels ("Previous week", "Next week")
- Trend indicators include text alternatives (not just arrows/colors)
- The card uses `accessibilityState={{ expanded: isExpanded }}` and the "View Details" button has `accessibilityHint="Double tap to expand weekly summary"`
- Expand/collapse animation respects `useReducedMotion()` — when reduced motion is enabled, state changes instantly without animation

### Technical Approach

#### Data Sources (All Existing)
All data comes from existing SQLite queries, no new tables needed:

1. **Workouts**: `workout_sessions` table — filter by `started_at` within week range
   - Count completed sessions
   - Sum duration_seconds
   - Compare to previous week's count
   - **Scheduled count**: If an active program exists, use `weekly_schedule` / `program_schedule` for the "X of N scheduled" format. If NO active program, show absolute count only ("4 workouts"), never "4 of N"

2. **Volume**: `workout_sets` table joined with `workout_sessions`
   - Sum (weight × reps) for the week
   - Compare to previous week

3. **PRs**: `workout_sets` — detect new max weight per exercise within the week
   - Compare each set's weight to all prior sets for that exercise
   - **Scope: weighted exercises only** (where weight > 0). Bodyweight exercises (weight = 0) are excluded from PR detection. This is a known limitation — rep-based PRs are out of scope for v1.

4. **Nutrition**: `daily_log` and `macro_targets` tables
   - Count days with entries
   - Average calories/protein/carbs/fat
   - Compare to target
   - **"On target" definition**: A day is "on target" when **calories are within ±10% of the calorie target**. Individual macro targets (protein/carbs/fat) are shown as averages but do NOT affect the on-target count. The ±10% threshold is a named constant (`NUTRITION_ON_TARGET_TOLERANCE = 0.10`), not a magic number.

5. **Body**: `body_weight` table
   - Use 3-day rolling average for start-of-week and end-of-week values (reuse `movingAvg()` from `lib/format.ts` if ≥3 entries exist; fall back to raw values if fewer entries)
   - Week-over-week delta based on rolling averages

6. **Streak**: Reuse existing `computeStreak()` from `lib/format.ts`
   - **Current week handling**: The current week is EXCLUDED from the streak count since it's still in progress. Display as "12 weeks (current week in progress)" if the user has an active streak from prior weeks. On Monday morning with no workouts yet, the streak should NOT show 0 or "broken" — it shows the streak from completed weeks only.

#### Architecture

- **New file**: `lib/weekly-summary.ts` — pure functions that query SQLite and return summary data
- **New component**: `components/WeeklySummary.tsx` — the UI card. **ALL state management and data fetching lives inside this component** (week state, expanded state, summary data). Progress.tsx renders `<WeeklySummary />` with zero new state hooks.
- **Modified file**: `app/(tabs)/progress.tsx` — integrate the summary card at the top (one-line import + render, no new useState hooks)
- **Error handling**: Wrap the summary card in a try/catch with a "Couldn't load summary" fallback state. The summary should never crash the Progress tab.

No new dependencies. No new database tables. Uses existing query patterns from `lib/db.ts`.

#### Performance
- Summary computation is bounded: max 7 days of data per section
- Memoize with `useMemo` keyed on week start date
- Only compute expanded sections when user expands (lazy)
- **Deferred preloading**: Compute ONLY the current week on initial render. Preload prev/next weeks after initial render completes (via `InteractionManager.runAfterInteractions` or a post-render effect). Do NOT add preload work to the initial render path.

#### Volume Calculation Note
Volume is `Sum(weight × reps)` which equals 0 for bodyweight exercises (weight = 0). This is a known limitation. The summary shows a note: "Volume tracks weighted exercises only" when the user's workouts include bodyweight movements. This is explicitly OUT of scope to fix in v1.

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
- Rep-based PRs for bodyweight exercises (v1 limitation)
- Custom on-target tolerance (hardcoded at ±10% for v1)

### Share Text Template

When the user taps "Share Summary", the following formatted text is shared:

```
📊 FitForge Weekly Summary
Week of Apr 14 – Apr 20

💪 Workouts: 4 completed (3h 45m total)
📈 Volume: 24,500 kg (+12% vs last week)
🏆 PRs: Bench Press 100kg (+5), Squat 140kg (+10)
🥗 Nutrition: 3/4 days on target (avg 2,150 cal)
⚖️ Weight: 82.0 → 81.7 kg (−0.3)
🔥 Streak: 12 weeks

Tracked with FitForge
```

Sections with no data are omitted from the share text. The "Tracked with FitForge" attribution line is always included.

### Acceptance Criteria
- [ ] Given the user has logged workouts this week, When they open the Progress tab, Then they see a weekly summary card showing workout count, total volume, and duration
- [ ] Given the user has NO active program, When they view the summary, Then workout count shows "4 workouts" (absolute), NOT "4 of N scheduled"
- [ ] Given the user HAS an active program, When they view the summary, Then workout count shows "4 of 5 scheduled (80%)"
- [ ] Given the user logged PRs this week (weighted exercises), When they view the summary, Then the PRs are listed with exercise name, new weight, and improvement delta
- [ ] Given the user has nutrition entries this week, When they view the expanded summary, Then they see average calories/macros vs targets and days-on-target count (on-target = calories within ±10%)
- [ ] Given the user has ≥3 body weight entries this week, When they view the summary, Then body weight uses 3-day rolling average for start/end values
- [ ] Given no workouts this week, When the user views the summary, Then it shows "No workouts logged this week" with a CTA to start one
- [ ] Given no nutrition data this week, When the user views the summary, Then the nutrition section is hidden (not shown as zeroes)
- [ ] Given the user taps the left arrow, When the previous week has data, Then the summary updates to show previous week's stats
- [ ] Given the user taps "Share Summary", When the share sheet opens, Then it contains a formatted text summary matching the share text template
- [ ] Given the app uses kg units, When the user views the summary, Then all weights are shown in kg; same for lb users
- [ ] Given it is Monday morning with no workouts yet, When the user views the streak, Then the streak count is based on completed weeks only and does NOT show 0 or "broken"
- [ ] Given the summary data query fails, When the user views Progress, Then a "Couldn't load summary" fallback is shown and the rest of the tab works normally
- [ ] The card uses `accessibilityState={{ expanded: isExpanded }}` and expand button has `accessibilityHint`
- [ ] Expand/collapse animation respects `useReducedMotion()`
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
| Single body weight entry | Show just the weight, no delta, no rolling average |
| 2 body weight entries | Use raw first/last (not enough for rolling avg) |
| User navigates to a week with no data at all | Show "No activity recorded this week" |
| Week boundary (Monday start vs Sunday start) | Use Monday as week start (ISO standard). TODO: add user preference in future |
| User's first week using the app | No "vs last week" comparison, show absolute values only |
| Very large volume numbers | Format with comma separators (e.g., 24,500 kg) |
| App in dark mode | Card respects theme colors |
| Screen reader active | All stats read with full context, expanded state announced |
| Monday morning, no workouts yet | Streak shows completed-weeks count, NOT 0. Shows "12 weeks (current week in progress)" |
| No active program | Workout count is absolute ("4 workouts"), not "4 of N" |
| Bodyweight-only workout week | Volume shows 0 with note "Volume tracks weighted exercises only"; no PRs listed |
| Summary query throws error | Fallback "Couldn't load summary" card; rest of Progress tab unaffected |
| Reduced motion enabled | Expand/collapse state changes instantly, no animation |

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

**Round 2 Verdict: APPROVED** (2026-04-16)

All 4 blocking issues from Round 1 resolved. Plan is well-specified with comprehensive acceptance criteria, edge cases, and a11y requirements. Ready for implementation.

**Round 1 Verdict: NEEDS REVISION** (2026-04-16)

**Must fix before approval (ALL ADDRESSED in Rev 2):**
1. ✅ Clarify "scheduled" count behavior when no active program — FIXED: shows absolute count ("4 workouts") when no program active, "4/5 scheduled" only when program exists
2. ✅ Add `accessibilityState={{ expanded }}` spec — FIXED: added to accessibility section with `accessibilityHint` on expand button
3. ✅ Address streak display for current week — FIXED: current week excluded from streak count, shows "12 weeks (current week in progress)"
4. ✅ Clarify "on target" threshold — FIXED: defined as calories within ±10% of calorie target, named constant `NUTRITION_ON_TARGET_TOLERANCE`

**Recommended improvements (ALL ADDRESSED in Rev 2):**
- ⚠️ 4th segment vs card: Kept as card for v1 (simpler, lower risk). If user feedback shows the tab is too dense, we'll migrate to a segment in v2.
- ✅ Rolling average for body weight — adopted, using `movingAvg()` from lib/format.ts
- ✅ Bodyweight exercise limitation documented in scope/edge cases
- ✅ Share text template defined
- ✅ Error boundary/fallback added to architecture and acceptance criteria
- ✅ Deferred preloading — compute only current week on initial render
- ✅ `useReducedMotion()` added to accessibility spec

### Tech Lead (Technical Feasibility)

**Verdict: APPROVED** (2026-04-16, with minor recommendations)

**Feasibility**: All data sources verified. Existing weekly aggregation queries can be reused. No new deps or tables needed.

**Architecture Fit**: Excellent. Modular DB layer supports new query functions cleanly.

**Technical Concerns (ALL ADDRESSED in Rev 2)**:
1. ✅ WeeklySummary is fully self-contained — zero new state in progress.tsx
2. ⚠️ PR detection query: add TODO for index on `(exercise_id, weight)` — acceptable for current dataset
3. ✅ Corrected: use `program_schedule` table / `getWeekAdherence()` from settings.ts
4. ✅ Nutrition threshold is a named constant `NUTRITION_ON_TARGET_TOLERANCE`

**Recommendations adopted**:
- ✅ Create `lib/db/weekly-summary.ts` for queries
- ✅ Use `useFocusRefetch` pattern from `lib/query.tsx`
- ✅ Follow `__tests__/acceptance/` pattern for testing

**Simplification suggestions noted but NOT adopted for v1** (all three features deliver distinct value and are low-complexity):
- Week navigation: kept (simple left/right navigation, bounded to 12 weeks)
- Share functionality: kept (single `Share.share()` call, template already defined)

### CEO Decision

**PENDING** — awaiting QD re-review of Rev 2 changes. All 4 must-fix items and all recommendations have been addressed.
