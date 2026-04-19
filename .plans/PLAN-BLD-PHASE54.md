# Feature Plan: Duration-Based (Timed) Sets

**Issue**: BLD-375
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement

FitForge currently tracks every set as weight × reps. However, many common exercises use **time** as the performance metric instead of (or in addition to) reps:

- **Isometric holds**: Planks, wall sits, dead hangs, L-sits
- **Loaded carries**: Farmer's carries, yoke walks, overhead carries
- **Stretching / mobility**: Timed stretches for flexibility work
- **Cardio intervals**: Timed sprints, rowing intervals, bike intervals

The app already has an "Isometric" training mode but no per-set `duration` field — users cannot actually record how long they held a plank or carried weight. This forces users to either skip tracking these exercises or abuse the `reps` field (e.g., entering "60" reps to mean 60 seconds), which corrupts analytics and PR tracking.

**Why now?** FitForge is launched on F-Droid and core workout tracking is solid. Duration sets fill a clear data model gap that affects a wide range of exercise types. It's a fundamental tracking capability, not a nice-to-have.

## User Stories

- As a lifter, I want to log how long I held a plank so that I can track my core endurance progress
- As a lifter, I want to log farmer's carries with both weight AND duration so I can see my grip endurance improving
- As a lifter, I want a countdown/stopwatch timer in my set entry so I don't need to manually time holds
- As a lifter, I want my exercise history to correctly show duration for timed exercises so analytics are meaningful
- As a lifter, I want duration-based PRs (longest hold at a weight) so I can celebrate progress

## Proposed Solution

### Overview

Add a `duration` column to `workout_sets` (and `target_duration` to `template_exercises`), a per-exercise "tracking mode" concept (reps vs duration vs reps+duration), and an inline timer UI for recording timed sets during workouts.

### UX Design

#### Set Entry Modes

Each exercise can be tracked in one of three modes:

1. **Reps mode** (default, existing behavior) — Weight × Reps
2. **Duration mode** — Weight × Duration (seconds). For bodyweight isometrics: just Duration
3. **Reps + Duration mode** — Weight × Reps × Duration (e.g., 3 reps of 10-second holds)

The mode is determined by the exercise's training mode:
- `isometric` → Duration mode by default
- All other modes → Reps mode by default
- User can override per exercise in template editor or during session

#### Set Row UI (Duration Mode)

Replace the reps input with a duration display:
- Shows `MM:SS` format (e.g., `1:30` for 90 seconds)
- Tapping the duration field opens an inline timer with:
  - **Stopwatch mode**: Start/stop, records elapsed time
  - **Countdown mode**: Set target duration, counts down, haptic on completion
- Tapping a completed duration set shows the time entry for editing
- Duration field uses same visual style as reps field (Input component)

#### Timer UI

- Positioned inline where the reps field would be (not a separate screen/sheet)
- Small circular timer indicator next to the duration field while running
- Reuse existing rest timer countdown animation style
- Start: Tap the duration field → timer starts
- Stop: Tap again → time is recorded
- Sound/haptic feedback at completion (if countdown mode)

#### Template Editor

- `target_duration` field on template_exercises (e.g., "Hold for 60s")
- Displayed next to `target_reps` field
- When exercise is in duration mode, show duration target instead of reps target

#### Session Summary

- Duration sets show `1:30` format instead of `× 12 reps`
- PR detection: longest duration at a given weight (or longest duration for bodyweight)
- Duration included in share card

#### Exercise History / Progress

- Exercise chart card: Duration trend chart (y-axis: seconds, x-axis: date)
- Records card: "Max Duration" stat alongside Max Weight / Max Reps
- History list: Shows duration per set

### Technical Approach

#### Database Changes

1. **Migration**: Add column to `workout_sets`:
   ```sql
   ALTER TABLE workout_sets ADD COLUMN duration INTEGER; -- seconds
   ```

2. **Migration**: Add column to `template_exercises`:
   ```sql
   ALTER TABLE template_exercises ADD COLUMN target_duration INTEGER; -- seconds
   ```

3. **Drizzle schema** (`lib/db/schema.ts`): Add `duration` to `workoutSets` and `target_duration` to `templateExercises`

4. **NO changes to exercises table** — duration mode is determined by training_mode, not a new column on exercises. An exercise with `isometric` mode defaults to duration tracking.

#### State Management

- `SetWithMeta` type gains optional `duration?: number` field
- `ExerciseGroup` gains `trackingMode: 'reps' | 'duration' | 'both'` derived from training_mode
- Set completion logic: a duration set is "completed" when `duration > 0 && completed === 1`

#### Timer Hook

- New `useSetTimer()` hook (similar to `useRestTimer`):
  - `start()` — begins counting up (stopwatch mode)
  - `startCountdown(seconds)` — begins counting down
  - `stop()` → returns elapsed duration
  - `isRunning` state
  - Uses `setInterval` like existing rest timer
  - Haptic + audio on countdown completion

#### PR Detection

- Existing PR logic compares max weight. For duration mode:
  - PR = longest `duration` at same or higher weight
  - For bodyweight: PR = longest `duration` period
- Modify `useSummaryData` to detect duration PRs

#### Suggestion Logic

- `lib/rm.ts` `suggest()` function: for duration exercises, suggest `duration + 5s` (progressive overload via time)
- 1RM estimation: not applicable for duration-only sets (skip)

### Scope

**In Scope:**
- `duration` column on `workout_sets` + migration
- `target_duration` column on `template_exercises` + migration
- Drizzle schema updates for new columns
- Inline stopwatch/countdown timer in set entry row (duration mode)
- Duration display in set rows (MM:SS format)
- Template editor: target duration field for duration-mode exercises
- Session summary: duration display instead of reps
- Exercise history: duration shown in history list
- Exercise chart: duration trend chart mode
- Records card: Max Duration stat
- Duration PR detection in session summary
- Duration suggestion in progressive overload logic
- Backup/restore: duration column included (already handled by generic column export)
- CSV export: duration column included

**Out of Scope:**
- New exercise category "Timed" — uses existing training_mode system
- AMRAP timer (separate feature: counting rounds in a time cap)
- Interval training programming (e.g., Tabata timer — use the existing Interval Timer tool)
- Exercise-level "default tracking mode" override beyond training_mode
- Analytics: muscle volume calculation from duration sets (deferred — volume = weight × reps, not applicable to pure duration sets)

### Acceptance Criteria

- [ ] Given a user creates a set for an isometric exercise When they tap the duration field Then a stopwatch timer starts inline
- [ ] Given a timer is running When the user taps stop Then the elapsed duration (in seconds) is saved to the set's `duration` column
- [ ] Given a template has target_duration for an exercise When a session is started from that template Then the set entry shows countdown mode starting from target_duration
- [ ] Given a user completes a plank with 90 seconds When they view the session summary Then the set shows "1:30" instead of reps
- [ ] Given a user achieves their longest-ever plank hold When the session summary loads Then a duration PR is displayed in the PRs card
- [ ] Given a user views exercise history for an isometric exercise When the chart loads Then the y-axis shows duration (seconds) instead of weight
- [ ] Given existing workout data (non-duration) When the migration runs Then all existing sets have `duration = NULL` and work exactly as before
- [ ] Given a user enters a farmer's carry set When they record 80kg for 45 seconds Then both weight and duration are saved
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx tsc --noEmit` passes
- [ ] Backup/restore round-trips duration data correctly

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Timer running when app backgrounded | Timer continues counting (uses setInterval, same as rest timer) |
| Timer running when switching exercises | Timer stops, elapsed time is discarded, user sees unsaved warning |
| Duration = 0 seconds | Set treated as incomplete (same as reps = 0) |
| Very long duration (>1 hour) | Display as H:MM:SS, no upper limit |
| Exercise switches from reps to duration mode mid-session | Existing sets keep their reps values; new sets use duration mode |
| Template has both target_reps and target_duration | Display both; set entry shows reps AND duration fields |
| CSV export of duration sets | New `duration` column in CSV output |
| Strong app import (no duration data) | `duration` column defaults to NULL (existing behavior preserved) |
| Exercise detail page for mixed exercises | Chart offers 3 modes: max weight, est 1RM, max duration |
| Bodyweight + duration (e.g., plank) | No weight field shown; only duration field |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Migration breaks existing data | Low | High | Migration is additive (ALTER TABLE ADD COLUMN), default NULL — no data loss risk |
| Timer accuracy on low-end devices | Low | Medium | Uses same setInterval mechanism as rest timer which already works |
| Complex set entry UI (too many fields) | Medium | Medium | Duration field only appears for exercises in duration mode; clean conditional rendering |
| PR detection complexity | Low | Low | Duration PRs are simpler than weight PRs (just compare durations) |
| Backup/restore compatibility | Low | High | Duration column is nullable — old backups import fine (NULL), new backups include it |

## Dependencies

- Drizzle schema must be up to date (BLD-370 ✅ done)
- Five-point backup/restore integration (learning from BLD-335)

## Implementation Notes

- Follow the "Five-Point Backup/Restore Integration" learning from the knowledge base
- Reuse `useRestTimer` patterns for the new `useSetTimer` hook
- Use existing `Haptics` and audio feedback system from rest timer
- Exercise detail page `ExerciseChartCard` already supports `chartMode` toggle — extend with `"duration"` option

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (with minor concerns)
**Reviewed**: 2026-04-19

**Feasibility**: Fully buildable. All changes are additive (ALTER TABLE ADD COLUMN, new hook, conditional UI). No new dependencies. Reuses proven patterns (useRestTimer, chart modes, training_mode system).

**Key Findings**:
1. **Column naming**: Recommend `duration_seconds` / `target_duration_seconds` to match `rest_seconds` convention
2. **Isometric mode has zero UI handling today** — exists only in type union and labels. Seed data needs isometric exercises (plank, dead hang, wall sit, L-sit)
3. **suggest() is tightly coupled to weight/reps** — create separate `suggestDuration()` function rather than mixing into existing 14-branch function
4. **Defer 'Reps + Duration' combined mode** — 3 input fields on mobile set row is too crowded. Ship pure duration mode first; add combined mode in follow-up if requested
5. **Timer as bottom sheet** — consider reusing rest timer overlay pattern rather than inline timer to keep set rows clean
6. **Backup/restore**: Only needs `insertRow()` updates for existing tables (not the five-point new-table checklist). `SELECT *` export auto-captures new columns.

**Risk**: Low — all additive changes, no breaking migrations, no architectural shifts
**Effort**: Large — touches DB, types, hooks, 5+ UI components, charts, PRs, backup, CSV

### CEO Decision
_Pending reviews_
