# Phase 10: Workout Insights — PR Detection & Post-Workout Summary

**Issue**: BLD-4
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

Users track workouts but receive zero feedback on whether they're progressing. There is no "you just beat your personal record!" moment. The app calculates personal records (max weight per exercise) on the Progress tab, but this data is never surfaced during the actual workout or upon completion. Users must manually compare today's sets against historical data — a tedious process that kills motivation.

Fitness apps that celebrate progress (PR alerts, post-workout summaries) have significantly higher retention. FitForge currently functions as a data entry tool, not a motivational training partner.

## User Stories

- As a lifter, I want to see a visual indicator when I lift more weight than my previous best for an exercise, so I feel rewarded and motivated to keep pushing
- As a user finishing a workout, I want a summary showing how many PRs I hit, total volume lifted, and session duration, so I can assess my performance at a glance
- As a returning user, I want to see my recent PRs on the home screen, so I'm reminded of my progress and motivated to train

## Proposed Solution

### Overview

Three interconnected enhancements:
1. **In-workout PR detection** — real-time PR badges during active workout sessions
2. **Enhanced post-workout summary** — PR highlights added to session detail screen
3. **Home screen "Recent PRs" widget** — last 5 PRs displayed on the Workouts tab

### UX Design

#### 1. In-Workout PR Detection (Active Session Screen)

**Location**: `app/session/[id].tsx` — set rows during active workout

**How it works**:
- When the user enters or updates a set's weight, the app compares the weight value against the historical maximum weight for that exercise (from completed sets in past sessions only — not the current session)
- If the current set's weight strictly exceeds the historical max AND the set is marked as completed, display a "PR" badge next to the set row
- The PR badge appears immediately when the set is toggled to "completed" with a weight that beats the record
- PR detection compares raw weight values (stored in the same unit — no conversion needed since all weights are stored as entered)

**Visual design**:
- A small Chip component with text "PR" and a trophy icon, rendered to the right of the set row
- Use `theme.colors.tertiaryContainer` background (gold/amber tone) — same semantic approach as the "Custom" badge in exercises
- `accessibilityLabel="New personal record"` on the chip
- Font size >= 12px (per FitForge quality standard)

**Data flow**:
- On session load: fetch historical max weight per exercise_id using a new DB function `getMaxWeightByExercise(exerciseIds, excludeSessionId)`
- This returns `{ [exercise_id]: max_weight }` for all exercises in the current session
- Compare on each set completion toggle — no network calls, pure local comparison
- Cache the historical maxes in component state; don't re-fetch on every set toggle

**Edge cases**:
| Scenario | Expected Behavior |
|----------|-------------------|
| First-ever set for an exercise | No PR badge (no historical data to beat) |
| Weight equals historical max (not exceeds) | No PR badge — must strictly exceed |
| Multiple sets beat the same record | All qualifying completed sets show the PR badge |
| User uncompletes a PR set | PR badge disappears |
| Weight is 0 or null | No PR badge |
| Exercise has only bodyweight sets (weight=0) | No PR detection for that exercise |

#### 2. Enhanced Post-Workout Summary (Session Detail Screen)

**Location**: `app/session/detail/[id].tsx` — summary card at top

**Current state**: Already shows date, duration, total volume, completed sets count.

**Enhancement**: Add a "Personal Records" section below the existing stats:
- If >= 1 PR was hit: show a "N New PR(s)" heading followed by a list of exercise names with old to new weight
- If 0 PRs: no PR section shown (don't clutter with "0 PRs")
- Each PR row: `Exercise Name: old_max -> new_max` (e.g., "Bench Press: 80 -> 85")

**Data flow**:
- New DB function `getSessionPRs(sessionId)` returning exercise_id, name, weight, previous_max
- This compares each completed set's max weight in this session against the max weight from ALL prior completed sessions (not including this one)
- Returns only exercises where this session's max exceeds all prior sessions' max

**Accessibility**:
- PR section: `accessibilityLabel="N new personal records achieved in this workout"`
- Each PR item: `accessibilityLabel="New personal record: [exercise], [old] to [new]"`

#### 3. Home Screen "Recent PRs" Widget

**Location**: `app/(tabs)/index.tsx` — new card below the streak display

**Design**:
- Card titled "Recent Personal Records" with a trophy icon
- Shows last 5 PRs across all workouts (exercise name, weight, date)
- Each row: `Exercise Name — Weight — Date`
- If no PRs exist yet: show encouraging empty state "Complete workouts to start tracking PRs!"
- Tapping a PR row navigates to the session detail screen for that workout

**Data flow**:
- New DB function `getRecentPRs(limit)` returning exercise_id, name, weight, session_id, date
- This uses a window function or subquery to find the first time each exercise's max weight was achieved
- Ordered by date descending, limited to `limit` results

**Accessibility**:
- Card: `accessibilityLabel="Recent personal records"`
- Each row: `accessibilityLabel="Personal record: [exercise], [weight], achieved on [date]"`
- Empty state: `accessibilityLabel="No personal records yet. Complete workouts to start tracking."`

### Technical Approach

#### New DB Functions (lib/db.ts)

Three new exported async functions:

1. **getMaxWeightByExercise(exerciseIds, excludeSessionId)** — returns Record of exercise_id to max_weight. Used during active workouts for real-time PR comparison. SQL groups by exercise_id, gets MAX(weight) from completed sets in completed sessions, excludes the current session.

2. **getSessionPRs(sessionId)** — returns array of PR objects with exercise_id, name, weight, previous_max. Used on session detail screen. SQL uses two subqueries: one for current session max per exercise, one for historical max per exercise (excluding current session). Joins and filters where session max > historical max.

3. **getRecentPRs(limit)** — returns array of recent PR events with exercise_id, name, weight, session_id, date. Used on home screen. SQL uses a CTE with running max to detect the first session where each new max was achieved, ordered by date descending.

#### No Schema Changes

This feature requires NO database schema changes. All data needed already exists in workout_sets and workout_sessions. The feature is purely read-side: new queries over existing data.

#### No New Dependencies

All UI uses existing react-native-paper components (Chip, Card, Text, Divider). No new libraries needed.

### Scope

**In Scope:**
- In-workout PR detection with visual badge on completed sets
- Enhanced session detail summary with PR list
- Home screen "Recent PRs" card widget
- 3 new DB query functions
- Full accessibility on all new elements

**Out of Scope:**
- Confetti or animation effects on PR achievement
- Sound/haptic feedback on PR (add in future phase)
- Rep PRs (max reps at a given weight) — weight PRs only for now
- Volume PRs (total weight x reps per exercise)
- PR history screen (showing progression over time for each exercise)
- Sharing PRs socially
- Weight unit conversion in session screen (separate feature)

### Acceptance Criteria

- [ ] Given a user is in an active workout and completes a set with weight > historical max for that exercise, When the set is toggled to completed, Then a "PR" chip/badge appears on that set row
- [ ] Given a user is in an active workout and the set weight equals (not exceeds) the historical max, When the set is toggled to completed, Then NO PR badge appears
- [ ] Given a user finishes a workout where 2 exercises had new weight PRs, When they view the session detail, Then a "2 New PRs" section appears listing both exercises with old to new weight
- [ ] Given a user finishes a workout with no PRs, When they view the session detail, Then no PR section is shown
- [ ] Given a user has completed workouts with PRs, When they view the home screen, Then a "Recent PRs" card shows up to 5 most recent PR achievements with exercise name, weight, and date
- [ ] Given a new user with no workout history, When they view the home screen, Then the Recent PRs card shows an encouraging empty state message
- [ ] Given PR badges and PR sections exist, Then all elements have proper accessibilityLabel, accessibilityRole attributes
- [ ] All text >= 12px font size
- [ ] No hardcoded colors — all use theme tokens
- [ ] PR badge uses theme.colors.tertiaryContainer background
- [ ] TypeScript typecheck passes with zero errors
- [ ] No console.log statements in production code

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| getMaxWeightByExercise query slow with large dataset | Low | Low | Query uses indexed columns (exercise_id, session_id, completed); limit to exercises in current session |
| PR detection fires on re-opened old sessions | Low | Low | Only detect PRs on active (non-completed) sessions; session detail uses getSessionPRs which is always correct |
| getRecentPRs CTE complex SQL | Medium | Low | Test with empty and large datasets; fallback to simpler query if needed |

### File Changes

| File | Changes |
|------|---------|
| lib/db.ts | Add getMaxWeightByExercise(), getSessionPRs(), getRecentPRs() |
| app/session/[id].tsx | Load historical maxes on mount, render PR chip on qualifying completed sets |
| app/session/detail/[id].tsx | Call getSessionPRs(), render PR summary section in the summary card |
| app/(tabs)/index.tsx | Call getRecentPRs(), render Recent PRs card widget below streak |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
