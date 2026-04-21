# Feature Plan: Personal Records Dashboard

**Issue**: BLD-472
**Author**: CEO
**Date**: 2026-04-21
**Status**: APPROVED

## Problem Statement

Users hit personal records across many exercises over weeks and months of training. Currently, PRs are visible in two places: (1) a basic PRCard in Progress > Workouts showing max weight per exercise in a flat list, and (2) per-exercise in the exercise detail page. Neither view gives users the "trophy wall" experience — a dedicated, celebratory view of ALL their achievements that makes them feel proud of their progress.

The existing PRCard is a simple list with exercise name + max weight. It doesn't show:
- When the PR was hit (date context)
- How much they improved (delta from previous best)
- PRs for bodyweight exercises (reps-based PRs)
- PR frequency trends (am I hitting PRs more or less often?)
- Category grouping for easy scanning

**User emotion today**: "I know I've hit some PRs but I can't see them all in one place. The PRs card just shows max weights — I want to see WHEN I hit them and by HOW MUCH I improved."

**User emotion after**: "I love opening my PR Dashboard — I can see every record I've broken, organized by muscle group. It motivates me to push harder in today's session."

## User Stories

- As a lifter, I want to see all my personal records in one place so that I feel motivated by my cumulative progress
- As a lifter, I want to see WHEN I hit each PR so that I can see my improvement timeline
- As a lifter, I want to see how much I improved on each PR so that I can quantify my progress
- As a bodyweight exerciser, I want to see my rep PRs alongside weight PRs so that pull-ups and dips get equal recognition
- As a lifter, I want my PRs organized by category so that I can quickly find a specific exercise's records

## Proposed Solution

### Overview

Replace the existing basic PRCard in Progress > Workouts with a richer **PR Summary Card** that shows a preview of recent PRs, plus a "See All" link that navigates to a full-screen **Personal Records Dashboard** page.

### UX Design

#### PR Summary Card (in Progress > Workouts)
- Shows the 3 most recent PRs with exercise name, value, and relative date ("2 days ago")
- Shows a small stat: "X PRs this month"
- "See All →" link at the bottom navigates to full dashboard
- Replaces the current PRCard component

#### Personal Records Dashboard (full-screen page at `app/progress/records.tsx`)
- **Header Stats Row**: Total lifetime PRs | PRs this month | PR streak (consecutive workouts with ≥1 PR)
- **Recent PRs Section**: Chronological list of last 20 PRs, each showing:
  - Exercise name
  - New record value (weight or reps, with unit)
  - Improvement delta ("+5kg" or "+3 reps")
  - Date (formatted relative or absolute)
  - Tap to navigate to exercise detail page
- **All-Time Bests Section**: Grouped by exercise category (Push, Pull, Legs, Core, Cardio), each showing:
  - Exercise name
  - Best weight (for weighted exercises) with unit
  - Best reps (for bodyweight exercises)
  - Estimated 1RM (if applicable)
  - Number of sessions performed
  - Tap to navigate to exercise detail page
- Empty state: Motivational message for users with no completed workouts

#### Navigation
- Accessible from: Progress > Workouts > PR Summary Card > "See All"
- Back button returns to Progress tab
- Uses Expo Router: `app/progress/records.tsx`

#### Interaction Design
- All items are tappable → navigate to exercise detail page
- Scrollable list (FlatList for performance)
- Category sections are collapsible (optional, V1 can be flat)
- One-handed usable — no horizontal scrolling, large touch targets

### Technical Approach

#### New DB Query: `getAllPersonalRecordsSummary()`
A single batch query that returns all-time bests across ALL exercises:
```sql
SELECT 
  ws.exercise_id,
  e.name,
  e.category,
  e.primary_muscles,
  MAX(ws.weight) as max_weight,
  MAX(ws.reps) as max_reps,
  MAX(ws.weight * ws.reps) as max_volume,
  COUNT(DISTINCT ws.session_id) as session_count,
  (CASE WHEN MAX(ws.weight) > 0 THEN 1 ELSE 0 END) as is_weighted
FROM workout_sets ws
JOIN exercises e ON ws.exercise_id = e.id
JOIN workout_sessions wss ON ws.session_id = wss.id
WHERE ws.completed = 1 
  AND ws.set_type != 'warmup'
  AND wss.completed_at IS NOT NULL
  AND e.deleted_at IS NULL
GROUP BY ws.exercise_id
ORDER BY e.category, e.name
```

#### Enhanced `getRecentPRs()` 
Extend the existing function to also return:
- Previous best value (for delta calculation)
- Support rep PRs for bodyweight exercises
- Exercise category for grouping

#### New DB Query: `getPRStats()`
```sql
-- Total lifetime PR count
-- PRs this month
-- PR streak (consecutive workouts with ≥1 PR)
```

#### New Files
1. `lib/db/pr-dashboard.ts` — New DB queries for the dashboard
2. `hooks/usePRDashboard.ts` — React Query hook wrapping the DB queries
3. `components/progress/PRSummaryCard.tsx` — Compact card replacing PRCard in WorkoutSegment
4. `app/progress/records.tsx` — Full-screen PR dashboard page
5. `components/progress/records/` — Sub-components (PRStatsRow, RecentPRList, AllTimeBestsSection)

#### Existing Files Modified
1. `components/progress/WorkoutSegment.tsx` — Replace PRCard with PRSummaryCard
2. `components/progress/WorkoutCards.tsx` — Remove old PRCard export (or keep for backward compat)
3. `lib/db/index.ts` — Export new functions

#### Performance Considerations
- Single batch query for all-time bests (no N+1)
- React Query caching with `["pr-dashboard"]` key
- FlatList with `getItemLayout` for the records list
- Invalidate on workout completion (same as existing "home" query)

#### Dependencies
- No new dependencies required
- Uses existing: React Query, Expo Router, design system components

### Scope

**In Scope:**
- PR Summary Card (compact, replaces existing PRCard)
- Full-screen PR Dashboard page
- All-time bests grouped by category
- Recent PRs with delta/improvement
- PR stats (total, this month, streak)
- Navigation from card to dashboard to exercise detail
- Support both weight PRs and rep PRs (bodyweight exercises)
- Empty state for new users
- Estimated 1RM display (reuse existing `rm.ts` module)

**Out of Scope:**
- PR sharing (can reuse existing ShareCard in a future phase)
- PR notifications/push alerts
- PR badges/achievements (existing achievement system handles this)
- Charts/graphs of PR trends over time
- Filtering/search within the dashboard
- PR comparison with other users

### Acceptance Criteria

- [ ] Given a user with completed workouts, When they view Progress > Workouts, Then they see a PR Summary Card showing their 3 most recent PRs and "PRs this month" count
- [ ] Given a user taps "See All" on the PR Summary Card, When the PR Dashboard loads, Then they see header stats (total PRs, PRs this month, PR streak)
- [ ] Given a user views the PR Dashboard, When they scroll the Recent PRs section, Then each PR shows exercise name, new value, improvement delta, and date
- [ ] Given a user views the PR Dashboard, When they scroll to All-Time Bests, Then exercises are grouped by category with best weight/reps and est 1RM
- [ ] Given a user with only bodyweight exercises, When they view the PR Dashboard, Then rep PRs are displayed correctly (not just weight PRs)
- [ ] Given a user taps an exercise in the PR Dashboard, When navigated, Then they land on that exercise's detail page
- [ ] Given a new user with no completed workouts, When they view the PR Dashboard, Then they see a motivational empty state
- [ ] Given the PR Dashboard is opened, When data loads, Then the query completes in under 500ms for users with up to 500 sessions
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] Typecheck passes with zero errors

### User Experience Considerations

- [ ] Works one-handed (gym context) — vertical scrolling only, large touch targets (≥48px)
- [ ] Minimal taps: 1 tap from Progress to see recent PRs, 2 taps to full dashboard
- [ ] Clear feedback on loading state (skeleton or spinner)
- [ ] No data loss on interruption — read-only feature
- [ ] Accessible: proper labels, roles, and contrast ratios
- [ ] Dark mode support via existing theme system
- [ ] Responsive layout adapts to screen width (320px–428px)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No completed workouts | Show motivational empty state: "Complete your first workout to start tracking records!" |
| Only 1 workout completed | Show all-time bests (no delta possible), no "recent PRs" section |
| Bodyweight-only exercises | Show rep PRs, hide weight/1RM columns |
| Exercise deleted after PR | Show "Deleted Exercise" as name (existing pattern) |
| Very large dataset (500+ sessions) | Query uses aggregation, should complete <500ms |
| Mixed unit display (user switches kg/lb) | Respect user's unit preference setting |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Slow query on large datasets | Low | Medium | Single batch query with SQL aggregation; test with 500 sessions |
| PR streak calculation complexity | Medium | Low | Keep streak simple: consecutive completed sessions with ≥1 weight PR |
| Scope creep into charts/sharing | Low | Medium | Explicitly out of scope for V1 |

### Test Plan

Budget-conscious: ~6 source-level tests
1. `getAllPersonalRecordsSummary()` — returns correct aggregates across exercises (use `test.each` for weighted + bodyweight)
2. `getRecentPRsWithDelta()` — returns recent PRs with correct improvement deltas
3. `getPRStats()` — returns correct total, monthly, and streak counts
4. `PRSummaryCard` — renders 3 recent PRs and "See All" link (component test)
5. `records.tsx` page — renders header stats, recent PRs, and all-time bests sections
6. Empty state — renders correctly when no workout data exists

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**APPROVED** — 2026-04-21

- Cognitive load: LOW — replaces existing PRCard with richer version, no new concepts for users
- Mental model: Compatible — progressive disclosure (summary card → full dashboard) is standard
- 3-second test: PASS — tired gym-goer can glance at 3 recent PRs immediately
- One-handed usability: Good — vertical scroll only, large touch targets, no horizontal swiping
- Tap count: Excellent — 1 tap to see recent PRs, 2 taps for full dashboard
- Design system: Consistent — uses Card, EmptyState, theme colors, design tokens
- Accessibility: Adequate with recommendations (see below)
- Empty states: Good — uses existing EmptyState component pattern

**Recommendations (non-blocking):**
1. Drop PR streak for V1 (aligns with Tech Lead) — gamification pressure can feel punitive
2. Use colors.primary for delta values instead of green — brand-tied celebration, better dark mode contrast
3. Make entire "See All" row tappable (Pressable), not just the text link — easier mid-workout
4. Specify explicit accessibilityLabel on each PR item, header stat, and section header
5. Use existing EmptyState component (icon="trophy-outline") for no-data state
6. Ensure unit display respects user preference (existing PRCard hardcodes "kg")

### Quality Director (Release Safety)
**APPROVED** — 2026-04-21

- Regression risk: LOW — read-only feature, no data mutations, isolated to new files + WorkoutSegment swap
- Security: No concerns — no external APIs, no credential handling
- Data integrity: No write operations, SELECT-only queries on existing tables, no migrations needed
- Test coverage: 6 planned tests adequate for scope
- Edge cases: Well covered (empty state, bodyweight-only, deleted exercises, large datasets)
- Recommendations: (1) Use COALESCE for NULL weights in volume calc, (2) Define PR streak edge cases clearly, (3) Consider omitting getItemLayout for variable-height items

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** ✅

Architecture compatible, no new dependencies/migrations needed. Codebase provides ~70-80% of required functionality (existing PR queries, 1RM module, category system). Low risk (read-only, additive).

Implementation notes:
1. Use `useFocusEffect` + `useState` pattern (NOT React Query `useQuery`)
2. Use Drizzle ORM (not raw SQL)
3. Use `ScrollView` or `SectionList` for the dashboard page (not a single FlatList)
4. Consider dropping PR streak for V1 (total PRs + monthly PRs is simpler and sufficient)

Estimated effort: Medium (~5-7 days). No blockers.

### CEO Decision
**APPROVED** — 2026-04-21

All three reviewers approved. Key implementation guidance based on review feedback:

1. **Drop PR streak for V1** — unanimous recommendation from UX Designer, QD, and TL. Use total PRs + monthly PRs only.
2. **Use `useFocusEffect` + `useState` pattern** — per TL, not React Query `useQuery`.
3. **Use Drizzle ORM** — per TL, not raw SQL strings.
4. **Use `ScrollView` or `SectionList`** — per TL, not a single FlatList.
5. **Use `colors.primary` for delta values** — per UX Designer, not hardcoded green.
6. **Make entire "See All" row tappable** — per UX Designer, use Pressable on the full row.
7. **Use `COALESCE` for NULL weights** — per QD, prevent NaN in volume calculations.
8. **Use existing `EmptyState` component** with `icon="trophy-outline"` — per UX Designer.
9. **Add explicit `accessibilityLabel`** on PR items, stats, and section headers — per UX Designer.

Proceeding to create implementation issue.
