# Feature Plan: Calendar Enhancements (Phase 39)

**Issue**: BLD-242
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT → IN_REVIEW (Rev 2 — addressing reviewer feedback)

## Problem Statement

The History screen (`app/history.tsx`, 572 lines) already has a working monthly calendar grid with day cells, workout dot indicators, button-based month navigation, day tap filtering, and accessibility labels. However, it lacks:

1. **Swipe month navigation** — users must tap chevron buttons; swipe is the expected mobile gesture
2. **Inline day detail panel** — tapping a day currently filters the session list below; an expandable summary panel between calendar and list would be more intuitive
3. **Program schedule overlay** — users following a training program can't see which days they're scheduled to train on the calendar
4. **Per-month summary stats** — the existing Streak Summary Card shows lifetime/rolling stats (weeks streak, total workouts); there's no per-month breakdown (workouts this month, total hours this month)
5. **Count badge for 3+ workouts** — currently shows max 2 dots per day; days with 3+ workouts should show a number badge

## Existing Implementation (What Already Works)

Reference: `app/history.tsx` lines 211–292 (calendar grid), 150–172 (month nav), 241–242 (today ring), 262–279 (dot indicators), 194–198 (day tap filter), 346–364 (streak card), 224–227 (a11y labels), 216 (responsive cells).

| Feature | Status |
|---------|--------|
| Monthly calendar grid (7-col, Mon–Sun) | ✅ Exists (lines 211–292) |
| Month navigation (prev/next buttons) | ✅ Exists (lines 150–172, 414–432) |
| Today highlighted with primary ring | ✅ Exists (lines 241–242) |
| Workout dot indicators per day | ✅ Exists, max 2 dots (lines 262–279) |
| Day tap → filter session list below | ✅ Exists (lines 194–198, 144–148) |
| Session cards (name, duration, sets, rating) | ✅ Exists (lines 294–327) |
| Streak summary card (lifetime stats) | ✅ Exists (lines 346–364) |
| 16-week heatmap | ✅ Exists (lines 366–403) |
| Search with debounce | ✅ Exists (lines 174–186) |
| Responsive cell sizing via useLayout | ✅ Exists (line 216) |
| A11y labels on day cells | ✅ Exists (lines 224–227) |
| Rest day messaging | ✅ Exists (line 331) |
| Dark/light mode via theme tokens | ✅ Throughout |
| ErrorBoundary wrapping | ✅ Exists (line 480–485) |

## User Stories

- As a gym-goer, I want to swipe left/right to change months so I can browse my history quickly
- As a program follower, I want to see which days I'm scheduled to train so I can plan my week
- As a user tapping a calendar day, I want to see a compact inline summary (not just a filtered list) so I can quickly review that day's workout
- As a consistency-focused user, I want to see per-month stats (workout count, total hours) so I can track monthly trends

## Proposed Solution

### Overview

Enhance the existing calendar in `app/history.tsx` in-place with 4 incremental improvements. **No new components, no new screen modes, no segmented control.** The current unified calendar+list view is the right UX — we enhance it, not replace it.

### Enhancement 1: Swipe Month Navigation

**What**: Add horizontal swipe gesture to the calendar grid region for month changes, alongside existing button navigation.

**UX**:
- Swipe left on the calendar grid → next month (same as tapping right chevron)
- Swipe right on the calendar grid → previous month (same as tapping left chevron)
- Smooth animated transition using Reanimated `withTiming`
- Buttons remain as a secondary navigation method

**Gesture Conflict Resolution** (per QD/TL feedback):
- Use `react-native-gesture-handler` `GestureDetector` with `Gesture.Pan()` on the calendar grid region only (not the whole screen)
- Set `activeOffsetX: [-20, 20]` threshold to avoid accidental triggers during vertical scrolling
- The FlashList below handles vertical scroll independently — no conflict since the gesture is scoped to the calendar grid `View`
- VoiceOver/TalkBack: swipe gestures are suppressed when screen reader is active (`useAccessibilityInfo()` or `AccessibilityInfo.isScreenReaderEnabled`). Month navigation falls back to button-only mode.
- Reduced motion: when `useReducedMotion()` returns true, skip the slide animation — instant transition instead

**Lines affected**: Wrap calendar grid (line 449) in `GestureDetector`; add `Animated.View` with `translateX` for transition; modify `prevMonth`/`nextMonth` (lines 150–172) to trigger animation.

### Enhancement 2: Inline Day Detail Panel

**What**: When a day with workouts is tapped, show an expandable summary panel between the calendar grid and the session list. This replaces the current behavior of filtering the list below.

**UX**:
- Tap a day with workout(s) → panel slides open between calendar and session list
- Panel shows for each session on that day:
  - Workout name and duration
  - Set count (already in `SessionRow`)
  - Rating stars (if rated)
  - Tap → navigates to full session detail (`/session/detail/[id]`)
- Tap same day again → panel collapses
- Tap a different day → panel transitions to new day's data
- Tap a rest day → panel shows "Rest day" text
- The session list below continues to show ALL sessions for the month (not filtered)
- Panel expand/collapse: use `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` for smooth animation
- Reduced motion: skip animation, instant expand/collapse
- `accessibilityLiveRegion="polite"` on the panel so screen readers announce content changes

**Screen reader focus management**: On panel expand, focus moves to the panel heading (day date). On panel collapse, focus returns to the tapped calendar cell.

**Lines affected**: New inline JSX between calendar grid (line 449) and filter chip (line 452). Uses existing `sessions` state filtered by `selected` date key. Approximately 60–80 lines of new JSX+styles.

### Enhancement 3: Program Schedule Overlay

**What**: If the user has an active program with a schedule, show scheduled training days on the calendar with a subtle background tint.

**UX**:
- Scheduled days show a subtle `primaryContainer` background tint (lighter than the workout-completed tint)
- Past scheduled days that were missed (no workout logged) show the tint but no workout dot (visual indication of a missed day)
- Tapping a scheduled future day shows the template name in the day detail panel: "Scheduled: Push Day A"
- If no active program, this overlay is invisible (graceful degradation)

**Data Layer**:
- Use existing `getSchedule()` from `lib/db/settings.ts` — already returns `ScheduleEntry[]` with `day_of_week` (Mon=0..Sun=6), `template_id`, and `template_name` for the active program
- No new DB query needed — `getSchedule()` returns the weekly pattern; we map `day_of_week` to calendar cells client-side
- Load schedule once on mount (alongside `load()` and `loadHeatmap()`) and store in state
- Map each calendar day's `weekday()` to the schedule entries to determine if it's a scheduled day

**Lines affected**: Add `schedule` state (ScheduleEntry[]), load in `useFocusEffect`. Modify `renderDay` (line 218) to check if `weekday(day) === entry.day_of_week` for background tint. ~30 lines.

### Enhancement 4: Per-Month Summary Bar

**What**: Add a compact stat line below the month header showing per-month stats.

**UX**:
- Position: directly below the month navigation header (after line 432), before the day-of-week headers
- Format: "8 workouts · 6.5 hrs" (simple, compact, secondary text)
- Uses `theme.colors.onSurfaceVariant` — visually subordinate to the existing Streak Summary Card (which shows lifetime stats)
- When month has no workouts: "No workouts this month"

**Data Layer**:
- Derived client-side via `useMemo` from the existing `sessions` state array — no new DB query needed (per BLD-16 single-fetch pattern)
- `workoutCount = sessions.length`
- `totalHours = sessions.reduce((sum, s) => sum + s.duration_seconds, 0) / 3600`

**Relationship to existing Streak Summary Card** (per QD feedback [M-2]):
- Streak Summary Card = lifetime/rolling stats (current streak weeks, longest streak weeks, total workouts ever) — stays as-is
- Month Summary Bar = per-month stats (workouts this month, total hours this month) — new, positioned near the month header for context
- Visual hierarchy: Streak Card is a full Card component; Month Summary is a subtle text line — no visual competition

**Lines affected**: ~15 lines of new JSX after month nav (line 432). One `useMemo` (~5 lines).

### Enhancement 5: Count Badge for 3+ Workouts

**What**: Days with 3 or more workouts show a numeric badge instead of dots.

**Current behavior**: Max 2 dots shown (lines 262–279). Days with 3+ workouts look the same as 2-workout days.

**New behavior**: 
- 1 workout → 1 dot (unchanged)
- 2 workouts → 2 dots (unchanged)
- 3+ workouts → show count number (e.g., "3") in a small badge below the date, same position as dots

**Lines affected**: Modify `renderDay` conditional (lines 262–279). ~10 lines changed.

### Technical Approach

#### Architecture
- **No new components** — all enhancements are inline modifications to `app/history.tsx`
- **No new DB queries** — use existing `getSessionsByMonth()` + `getSchedule()` + client-side derivation
- **No segmented control** — the unified calendar+list view stays as-is
- If `history.tsx` grows past ~700 lines after enhancements, a future refactoring phase can extract the calendar grid into `components/CalendarGrid.tsx` — but that's out of scope for this phase

#### Dependencies
- `react-native-gesture-handler` — already installed (used by bottom-sheet and navigation)
- `react-native-reanimated` — already installed and imported in history.tsx (line 8)
- No new dependencies required

#### Touch Targets
- Current cell size: `Math.max(44, Math.floor(layout.width / 7) - 4)` (line 216)
- **Fix**: Change minimum from 44 to 48 to meet SKILL 48dp minimum: `Math.max(48, Math.floor(layout.width / 7) - 4)`
- On a 375px phone: `375/7 - 4 = 49.6dp` → above 48dp minimum ✅
- On smaller screens: `Math.max(48, ...)` guarantees the minimum

### Scope

**In Scope:**
1. Swipe month navigation with gesture conflict handling
2. Inline day detail panel (replaces list-filtering behavior)
3. Program schedule overlay using existing `getSchedule()`
4. Per-month summary bar (derived from existing data)
5. Count badge for 3+ workouts per day
6. Touch target fix (44→48dp minimum)
7. Screen reader focus management for panel expand/collapse
8. Reduced motion fallback for all new animations
9. VoiceOver/TalkBack swipe conflict handling (disable swipe nav when screen reader active)

**Out of Scope:**
- New components (keep inline in history.tsx)
- New DB queries (derive from existing data)
- List/Calendar mode toggle (unified view stays)
- Week view
- Drag-and-drop workout scheduling
- Pull-to-refresh (existing `useFocusEffect` reload is sufficient)
- Calendar error state (existing ErrorBoundary wrapping on line 480 handles crashes)

### Acceptance Criteria
- [ ] Given the calendar grid When I swipe left Then the next month loads with animated transition
- [ ] Given the calendar grid When I swipe right Then the previous month loads with animated transition
- [ ] Given a screen reader is active When on the calendar Then swipe-to-change-month is disabled and button navigation works normally
- [ ] Given reduced motion is enabled When swiping months Then the transition is instant (no animation)
- [ ] Given a month with workouts When I tap a day with a workout Then an inline detail panel expands between the calendar and session list showing workout name, duration, set count
- [ ] Given the day detail panel is expanded When the panel appears Then `accessibilityLiveRegion="polite"` announces the content to screen readers
- [ ] Given the day detail panel is expanded When I tap a session summary Then it navigates to `/session/detail/[id]`
- [ ] Given the day detail panel is expanded When I tap the same day again Then the panel collapses
- [ ] Given an active program with a schedule When viewing the calendar Then scheduled training days show a subtle primaryContainer background tint
- [ ] Given a scheduled day in the past with no workout logged Then the day shows the tint but no workout dot (visual indication of a missed day)
- [ ] Given a scheduled future day When I tap it Then the day detail panel shows "Scheduled: [Template Name]"
- [ ] Given no active program When viewing the calendar Then no schedule overlay is shown (graceful degradation)
- [ ] Given the month summary bar When viewing any month Then it shows correct workout count and total hours derived from loaded sessions
- [ ] Given a day with 3+ workouts When viewing the calendar Then the day shows a numeric count badge (e.g., "3") instead of dots
- [ ] Given the calendar grid Then every day cell has a minimum touch target of 48dp × 48dp
- [ ] PR passes all existing tests with no regressions
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All new code uses design tokens (radii, spacing, typography, duration) — no magic numbers
- [ ] Calendar renders correctly on phone (375px) and tablet (768px+) widths

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Month with no workouts | Calendar renders normally, month summary shows "No workouts this month", tapping any day shows "Rest day" |
| Day with 5+ workouts | Show count badge "5", detail panel shows scrollable list of sessions |
| First-time user (no history) | Calendar shows empty month with today highlighted, month summary shows "No workouts this month" |
| Month boundary (Dec → Jan) | Year rolls over correctly in header and queries (existing behavior, already works) |
| Leap year February | 29 days rendered correctly (existing `daysInMonth()` helper already handles this) |
| Screen reader + swipe | Swipe month nav disabled, button nav works normally |
| Reduced motion preference | All animations skipped, instant transitions |
| No active program | Schedule overlay invisible, no errors |
| Program with rest days | Only scheduled days get tint, rest days have no tint |
| Day detail panel + search | If user types in search while panel is open, panel collapses and search results show |
| Active workout in progress | No special indicator (out of scope — existing behavior unchanged) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Swipe gesture conflicts with FlashList vertical scroll | Low | Medium | Gesture scoped to calendar grid `View` only; `activeOffsetX: [-20, 20]` threshold |
| VoiceOver swipe conflict | Medium | High | Detect screen reader → disable swipe nav entirely, use buttons only |
| Day detail panel height overflow on small screens | Low | Medium | Constrain panel max height, add internal scroll if needed |
| history.tsx complexity growth | Low | Low | File grows from 572 to ~750 lines. Manageable. Extract later if needed. |

## Review Feedback

### Quality Director (UX Critique)
**Rev 1 verdict**: NEEDS REVISION — 2 Critical, 4 Major issues.
**Key concerns addressed in Rev 2**:
- [C-1] ✅ Acknowledged existing calendar — plan rewritten as enhancement
- [M-1] ✅ Removed List/Calendar toggle — keeping unified view
- [M-2] ✅ Clarified Month Summary Bar vs Streak Summary Card relationship
- [M-3] ✅ Specified gesture conflict resolution (scoped to grid, activeOffsetX threshold, screen reader fallback)
- [C-A11Y] ✅ Added screen reader focus management, accessibilityLiveRegion, VoiceOver swipe conflict handling
- [M-A11Y] ✅ Added reduced motion fallback
- [C-TOUCH] ✅ Specified 48dp minimum touch target (fixing current 44dp)

### Tech Lead (Technical Feasibility)
**Rev 1 verdict**: NEEDS REVISION — Major scope overlap with existing code.
**Key concerns addressed in Rev 2**:
-  Removed duplicate components — all enhancements inline in history.tsx
- ✅ Removed segmented control — unnecessary
- ✅ Removed `getSessionSummariesByMonth` — using existing `getSessionsByMonth()` + client-side derivation
- ✅ Using existing `getSchedule()` for program overlay — no new query
- ✅ Clarified program day mapping: `getSchedule()` returns `day_of_week` (Mon=0..Sun=6) which maps directly to the existing `weekday()` helper

### CEO Decision
_Awaiting re-review from QD and TL on Rev 2_
