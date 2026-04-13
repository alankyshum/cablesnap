# Feature Plan: Workout History & Calendar View (Phase 8)

**Issue**: BLD-24
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

FitForge only shows the 5 most recent workout sessions on the Workouts tab. Users have no way to:
- View their full workout history
- See which days they trained (calendar heatmap)
- Search or filter past workouts by name, date, or template
- Track training consistency and streaks

Every serious fitness app (Strong, Hevy, JEFIT) provides a calendar view and full history. Without this, users who've been training for weeks/months lose visibility into their progress pattern. This is a top-priority UX gap.

## User Stories

- As a user, I want to see a monthly calendar with my workout days highlighted so I can see my training consistency at a glance
- As a user, I want to scroll through all my past workouts (not just the last 5) so I can review any session
- As a user, I want to tap a day on the calendar to see the workouts I did that day
- As a user, I want to see my current training streak (consecutive weeks with at least 1 workout) for motivation
- As a user, I want to search my workout history by name so I can find a specific session

## Proposed Solution

### Overview

Add a **History screen** accessible from the Workouts tab via a "View All History" link. The history screen has two sections:
1. **Calendar heatmap** (top) - monthly view showing workout days with intensity dots
2. **Session list** (bottom) - reverse-chronological FlatList of all sessions, filterable by tapping a calendar day

Also add a **streak counter** card to the Workouts tab showing the current week streak.

### UX Design

#### Workouts Tab Changes
- Replace the hardcoded 5-session list with a "Recent Workouts" section that shows 5 sessions + a "View All History" link
- Add a small "Streak" card above recent workouts: "N week streak" (weeks with at least 1 workout)
- Streak card hidden when zero workouts exist

#### History Screen (`app/history.tsx`)
- **Header**: "Workout History" with month/year and left/right arrows to navigate months
- **Calendar section**: 7-column grid (Mon-Sun headers), days as cells
  - No workout: empty/transparent
  - 1 workout: single dot (primary color)
  - 2+ workouts: double dot
  - Today: outlined circle
  - Selected day: filled background
  - Days outside current month: dimmed
- **Session list section**: FlatList below calendar
  - Default: shows all sessions for the selected month (reverse chronological)
  - When a day is tapped: filters to only that day's sessions
  - Each item shows: session name, date, duration, set count
  - Tap to navigate to session detail (`/session/detail/[id]`)
  - "Clear filter" chip appears when filtering by day
- **Search**: search bar at top to filter by session name (debounced 300ms)
- **Empty states**:
  - No workouts ever: "No workouts yet. Start your first workout!"
  - No workouts in selected month: "No workouts in [Month Year]"
  - No workouts on selected day: "Rest day!"
  - No search results: "No workouts matching '[query]'"

#### Accessibility
- Calendar days: `accessibilityLabel="[Day Month Year], [N] workouts"` or `"[Day Month Year], rest day"`
- Calendar navigation: `accessibilityLabel="Previous month"` / `"Next month"`
- Streak card: `accessibilityLabel="Training streak: N weeks"`
- Session items: `accessibilityLabel="[Name], [Date], [Duration], [Sets] sets"`

### Technical Approach

#### New Database Queries
```typescript
// Get all sessions for a given month (YYYY-MM prefix match on started_at)
getSessionsByMonth(year: number, month: number): Promise<WorkoutSession[]>

// Get sessions for a specific date
getSessionsByDate(date: string): Promise<WorkoutSession[]>

// Get workout dates for a month (for calendar dots) - lightweight query
getWorkoutDatesForMonth(year: number, month: number): Promise<{date: string, count: number}[]>

// Get current streak (consecutive weeks with >=1 workout, counting back from current week)
getWeekStreak(): Promise<number>

// Search sessions by name
searchSessions(query: string, limit?: number): Promise<WorkoutSession[]>
```

#### Calendar Component
- Pure RN implementation - no external calendar library needed
- Custom `CalendarGrid` component: takes year, month, workout dates map
- Uses `Dimensions` for cell sizing (screen width / 7)
- Responds to `useLayout()` for tablet (larger cells)
- Memoized with `React.memo` to avoid re-renders on list scroll

#### Data Flow
1. Screen mounts: fetch `getWorkoutDatesForMonth` + `getSessionsByMonth` for current month
2. User navigates month: refetch both queries
3. User taps day: `getSessionsByDate` or filter in-memory from already-loaded month data
4. User searches: `searchSessions` with debounced query

#### Performance
- Calendar dots query returns only dates + counts (not full sessions) - lightweight
- FlatList with pagination (20 per page) for session list
- Month data cached in state - no refetch when toggling day filter
- Search is debounced (300ms) to avoid excessive queries
- Calendar grid cells are memoized

### Scope

**In Scope:**
- History screen with calendar heatmap and session list
- Month navigation (prev/next)
- Day tap to filter sessions
- Session name search
- Streak counter card on Workouts tab
- "View All History" link on Workouts tab
- Empty states for all scenarios
- Full accessibility labels
- Tablet layout (larger calendar cells)

**Out of Scope:**
- Workout comparison (side-by-side sessions)
- Training volume analytics (total weight lifted per week)
- Workout notes/journaling beyond existing session notes
- Calendar export (iCal/Google Calendar)
- Week view (only month view for now)
- Editing past workouts from history (view-only; edit via session detail)

### Acceptance Criteria

- [ ] Workouts tab: "View All History" link below recent sessions
- [ ] Workouts tab: streak card showing "N week streak" (hidden when 0)
- [ ] History screen: monthly calendar grid with workout day dots
- [ ] Calendar: left/right arrows navigate months; displays "Month Year"
- [ ] Calendar: today has outlined circle; selected day has filled background
- [ ] Calendar: 1 workout = single dot, 2+ = double dot
- [ ] Tap calendar day: session list filters to that day
- [ ] "Clear filter" chip visible when day filter active
- [ ] Session list: reverse chronological, shows name/date/duration/sets
- [ ] Session list: FlatList with 20-per-page pagination
- [ ] Tap session: navigates to `/session/detail/[id]`
- [ ] Search bar filters sessions by name (300ms debounce)
- [ ] Empty state: no workouts ever shows CTA message
- [ ] Empty state: no workouts in month shows informational message
- [ ] Empty state: rest day shows "Rest day!" message
- [ ] Empty state: no search results shows "No workouts matching" message
- [ ] Streak calculation: consecutive weeks (Mon-Sun) with >=1 completed session, counting back from current week
- [ ] Calendar cells: `accessibilityLabel` with date and workout count
- [ ] Tablet: calendar cells larger via `useLayout()`
- [ ] All new screens wrapped in ErrorBoundary
- [ ] No new dependencies added

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workouts ever | Empty state on Workouts tab (no streak card) + empty state on History |
| 1 workout total | Streak = 1 week, calendar shows single dot |
| Multiple workouts same day | Calendar shows double dot, list shows all |
| Month with 0 workouts | Empty month message, calendar shows no dots |
| Very old history (12+ months) | Month navigation works, no performance issues |
| Current week incomplete | Streak counts current week if it has >=1 workout |
| Gap week (broke streak) | Streak resets to count from most recent consecutive block |
| Workout started but not completed | Exclude from calendar (only count completed_at IS NOT NULL) |
| Search with special chars | Treat as literal string, no SQL injection |
| Rapid month navigation | Debounce or cancel previous fetch |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Calendar rendering perf on old phones | Low | Medium | Memoize cells, minimal re-renders |
| Streak calculation edge cases (timezones) | Medium | Low | Use device local date, not UTC |
| Large history (1000+ sessions) | Low | Medium | FlatList pagination, lightweight calendar query |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED with recommendations** — 2026-04-13

Strong plan. Calendar heatmap + session list is a proven UX pattern. Streak counter adds motivational value. Empty states comprehensive.

**Key recommendations (non-blocking):**
1. Touch targets: enforce minimum 44×44pt on calendar cells (screen width / 7 ≈ 45.7pt on 320pt phone — barely above iOS min). Add explicit `minHeight: 44`.
2. Unnamed sessions: show fallback text ("Untitled workout" or date) rather than empty row.
3. Theme tokens: specify theme token usage for calendar dots/circles/backgrounds (no hardcoded hex).
4. Timezone: store dates in device-local time at creation, don't re-compute from UTC when displaying.
5. Adopt tech lead recommendation: drop FlatList pagination for monthly data (max ~62 sessions), use in-memory day filter.
6. Calendar day font sizes must respect Dynamic Type (no hardcoded sizes below 13pt).

No critical issues. Low risk, clear UX value, well-scoped.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — 2026-04-13

Technically sound, well-scoped, fits existing architecture perfectly.

**Key recommendations (non-blocking):**
1. Streak calculation: do in JS (fetch distinct workout weeks from DB, loop in JS) — avoids fragile recursive CTEs in SQLite
2. Month filtering: use epoch range queries (`WHERE started_at >= ? AND started_at < ?`), not prefix matching (started_at is an integer)
3. Drop FlatList pagination for monthly-scoped data — max ~62 sessions/month, load all at once
4. Day tap filter: in-memory only (month data already loaded, just `.filter()`)
5. Merge `getWorkoutDatesForMonth` and `getSessionsByMonth` into one query — compute dot counts client-side

No critical issues. Low risk, medium effort, zero new dependencies.

### CEO Decision
_Pending reviews_
