# Feature Plan: Workout Calendar & Planning

**Issue**: BLD-242
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT

## Problem Statement

FitForge tracks workout history as a flat list (history.tsx) and a heatmap grid. Users have no calendar-based view to answer questions like "What did I do last Tuesday?", "Am I following my 4-day split?", or "When should I train legs next?". This is a staple feature in every competitive fitness app (Strong, JEFIT, Hevy) that FitForge currently lacks.

The existing WorkoutHeatmap shows activity density but doesn't reveal workout content per day. The history list requires scrolling and mental date-math. A proper calendar closes both gaps.

## User Stories

- As a gym-goer, I want to see my workouts on a monthly calendar so I can quickly check what I did on any given day
- As a program follower, I want to see which days I'm scheduled to train so I can plan my week
- As a consistency-focused user, I want to see my training frequency patterns (e.g., I always skip Fridays) so I can adjust my schedule
- As a user reviewing my training, I want to tap a calendar day and see a summary of that workout without navigating to a separate screen

## Proposed Solution

### Overview

Add a new **Calendar** screen accessible from the History screen (as a toggle between "List" and "Calendar" view modes). The calendar renders a month grid showing workout indicators on trained days. Tapping a day expands an inline summary showing exercises, volume, and duration. Program-scheduled days are shown with a subtle marker for untrained future days.

### UX Design

#### Navigation & Entry Point
- Add a segmented control at the top of the History screen: `List | Calendar`
- Default remains List (existing behavior unchanged)
- Calendar view replaces the list content area
- The existing WorkoutHeatmap stays on the Home tab (dashboard) — calendar is a different, richer view

#### Calendar Grid
- Standard month view: 7-column grid (Mon–Sun), ~5-6 rows per month
- Swipe left/right to change months (with animated transition using Reanimated)
- Month/year header with chevron navigation buttons
- Today's date highlighted with primary color ring
- Days with workouts show a filled dot indicator below the date number
- Dot color: primary color for completed, surface-variant for scheduled-but-not-done
- Multiple workouts on same day: show count badge (e.g., "2") instead of single dot

#### Day Detail Panel
- Tapping a day with workout(s) expands an inline panel below the calendar grid (not a modal — keeps context)
- Panel shows for each session:
  - Workout name and duration
  - Exercise list with set counts (e.g., "Bench Press — 4 sets")
  - Total volume (if weight-based)
  - Rating stars (if rated)
  - Tap anywhere in the panel to navigate to full session detail (`/session/detail/[id]`)
- Tapping an empty day shows "Rest day" or "No workout logged"
- Tapping a future scheduled day shows the program template name

#### Program Schedule Overlay
- If user has an active program, show scheduled training days with a subtle background tint
- Match program day names to calendar days of the week
- Visual distinction: past scheduled days that were missed show a muted X indicator

#### Month Summary Bar
- Below the month header, show: "12 workouts · 4.2hrs · 3-day streak"
- Updates as user navigates months

### Technical Approach

#### Architecture
- New component: `components/WorkoutCalendar.tsx` — the calendar grid with month navigation
- New component: `components/CalendarDayDetail.tsx` — the expandable day detail panel
- Modify: `app/history.tsx` — add segmented control toggle, conditionally render calendar vs list
- New query: `lib/db/sessions.ts` → `getSessionSummariesByMonth(year, month)` — returns lightweight session data for calendar display (id, name, date, duration, exercise_count, total_volume, rating)
- Reuse: `getSessionsByMonth` exists but returns full session + set_count. May need a lighter query for performance.

#### Data Layer
- `getSessionSummariesByMonth(year: number, month: number)` returns:
  ```ts
  type CalendarSession = {
    id: string
    name: string
    date: string        // YYYY-MM-DD
    duration: number    // seconds
    exercises: number   // count of distinct exercises
    volume: number      // total weight × reps
    rating: number | null
  }
  ```
- `getProgramScheduleForMonth(year: number, month: number)` — if active program exists, returns which days-of-week are scheduled and what template name applies
- Both queries should be fast (indexed on `started_at`, `completed_at`)

#### Calendar Rendering
- Pure RN components (View grid) — no third-party calendar library needed
- Month grid: 7 columns  ceil((firstDayOffset + daysInMonth) / 7) rows
- Use `Animated.View` with Reanimated for swipe transitions
- Day cells: fixed aspect ratio (square or near-square), responsive to screen width
- Touch handling: `Pressable` on each day cell

#### Performance
- Only query one month at a time (lazy load on swipe)
- Cache adjacent months (prev/next) for smooth swiping
- Day detail panel uses `LayoutAnimation` or Reanimated `withTiming` for expand/collapse
- FlashList not needed (max ~42 cells per month — simple FlatList or map)

#### Accessibility
- Calendar grid uses `accessibilityRole="grid"`
- Day cells: `accessibilityLabel="April 16, 2 workouts"` with `accessibilityRole="button"`
- Month navigation: labeled buttons "Previous month" / "Next month"
- Day detail panel: announces content on expand

### Scope

**In Scope:**
- Monthly calendar grid with workout indicators
- Day tap → inline detail panel with session summary
- Month navigation (swipe + buttons)
- Month summary bar (workout count, total time, streak)
- Program schedule overlay (if active program)
- Integration into existing History screen as a view toggle
- Dark mode and light mode support
- Responsive layout (phone and tablet via useLayout)

**Out of Scope:**
- Week view (month only for v1)
- Drag-and-drop workout scheduling (future enhancement)
- Multi-month comparison view
- Calendar widget for home screen
- iCal/Google Calendar sync
- Workout planning/creation from calendar (users create from templates)

### Acceptance Criteria
- [ ] Given the History screen When I tap "Calendar" segment Then I see a monthly calendar grid with workout indicators on trained days
- [ ] Given a month with workouts When I tap a day with a workout Then an inline panel expands showing workout name, duration, exercises, and volume
- [ ] Given the calendar view When I swipe left Then the next month loads with its workout data
- [ ] Given the calendar view When I swipe right Then the previous month loads with its workout data
- [ ] Given today's date When viewing the current month Then today is highlighted with a primary color ring
- [ ] Given an active program When viewing the calendar Then scheduled training days show a subtle background tint
- [ ] Given a day with 2+ workouts When viewing the calendar Then the day shows a count badge instead of a single dot
- [ ] Given dark mode is enabled When viewing the calendar Then all colors use theme tokens correctly
- [ ] Given the month summary bar When viewing any month Then it shows correct workout count, total time, and streak
- [ ] Given I tap the day detail panel When a session summary is shown Then tapping it navigates to the full session detail screen
- [ ] PR passes all existing tests with no regressions
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All new components use design tokens (radii, spacing, typography, duration) — no magic numbers
- [ ] Calendar renders correctly on phone (375px) and tablet (768px+) widths

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Month with no workouts | Calendar renders normally, month summary shows "0 workouts", tapping any day shows "Rest day" |
| Day with 5+ workouts | Show count badge "5", detail panel scrolls if needed |
| First-time user (no history) | Calendar shows empty month with today highlighted, encouraging message in summary bar |
| Very old months (years ago) | Lazy-loads data on navigation, shows loading indicator briefly |
| Month boundary (Dec → Jan) | Year rolls over correctly in header and queries |
| Leap year February | 29 days rendered correctly |
| Different week start (Mon vs Sun) | Use Monday as week start (consistent with WorkoutHeatmap) |
| Screen rotation | Calendar re-renders with correct cell sizes |
| Active workout in progress | Current day shows a pulsing/animated indicator |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Performance with many months of data | Low | Medium | Lazy-load one month at a time, cache ±1 month |
| Swipe gesture conflicts with tab navigation | Medium | Medium | Use horizontal gesture handler with activation distance threshold |
| Calendar grid layout breaks on small screens | Low | High | Use responsive cell sizing based on screen width ÷ 7 |
| Program schedule data complexity | Low | Low | Program overlay is optional — degrade gracefully if no active program |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** (2026-04-16)

Critical issues found:
1. **[C-1]** Plan doesn't acknowledge that `app/history.tsx` already implements a monthly calendar grid (day cells, dot indicators, month nav, day selection, today highlighting, a11y labels). Must rewrite as enhancement, not greenfield.
2. **[C-A11Y]** Missing screen reader focus management for month changes and day detail panel. Missing VoiceOver/TalkBack swipe conflict resolution.
3. **[C-TOUCH]** Must specify minimum 48dp touch target for calendar cells (current code uses 44dp minimum, already below SKILL requirement).

Major issues:
- **[M-1]** List/Calendar toggle may be a UX regression — current unified view shows calendar + list together.
- **[M-2]** Month Summary Bar duplicates existing Streak Summary Card — clarify relationship.
- **[M-3]** Gesture conflict strategy needs concrete specification (recognizer type, activation threshold, scope).
- **[M-A11Y]** Missing `useReducedMotion()` fallback for Reanimated animations.

Full review posted on BLD-242 issue comments.

### Tech Lead (Technical Feasibility)
**Verdict: NEEDS REVISION** — Major scope overlap with existing code.

The calendar grid, month navigation, workout indicators, day selection, streak bar, accessibility labels, responsive layout, and dark/light mode support are ALL already implemented in `app/history.tsx` (572 lines, shipped in Phase 8 / BLD-16). The plan does not reference this existing code and proposes creating duplicate components from scratch.

**What's genuinely new (~30% of plan):** (1) swipe month nav, (2) inline day detail panel, (3) program schedule overlay, (4) per-month summary stats, (5) count badge for 3+ workouts.

**Required changes before approval:**
- Reframe as enhancements to existing `history.tsx`, not a greenfield build
- Drop the `List | Calendar` segmented control (calendar+list is already combined)
- Drop `getSessionSummariesByMonth` query (use existing `getSessionsByMonth` + `useMemo`)
- Clarify program day position → calendar day-of-week mapping logic
- Estimated effort after dedup: Small–Medium (~200 lines net new)

### CEO Decision
_Pending reviews_
