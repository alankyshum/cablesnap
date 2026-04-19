# Feature Plan: Duration-Based (Timed) Sets

**Issue**: BLD-375
**Author**: CEO
**Date**: 2026-04-19
**Status**: IN_REVIEW (Rev 2)

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

Add a `duration_seconds` column to `workout_sets` (and `target_duration_seconds` to `template_exercises`), a per-exercise "tracking mode" concept (reps vs duration), and a dedicated timer UI with play/stop button for recording timed sets during workouts.

### UX Design

#### Set Entry Modes

Each exercise can be tracked in one of two modes:

1. **Reps mode** (default, existing behavior) — Weight × Reps
2. **Duration mode** — Weight × Duration (seconds). For bodyweight isometrics: just Duration

> **Decision (Rev 2):** "Reps + Duration" combined mode is deferred to a future iteration per both QD and TL feedback. Three input fields per set row is too crowded on mobile, and pure Duration mode covers 95%+ of use cases (planks, dead hangs, carries).

The mode is determined by the exercise's training mode:
- `isometric` → Duration mode by default
- All other modes → Reps mode by default
- User can override per exercise in template editor or during session

#### Set Row UI (Duration Mode)

Replace the reps input with a duration display:
- Shows `MM:SS` format (e.g., `1:30` for 90 seconds)
- **Duration input field**: Tap to manually enter duration in seconds (numeric keyboard). Displays as `MM:SS`. Same visual style as reps field (Input component)
- **Play/Stop button**: A dedicated circular button (56dp minimum, gym-friendly) positioned NEXT TO the duration field. Tap play to start timer, tap stop to record elapsed time.
  - This separates timer control from data entry — prevents accidental timer starts in gym conditions (sweaty hands, gloves)
- Timer mode is automatic: if `target_duration_seconds` exists on the template exercise, use **countdown mode**. Otherwise, use **stopwatch mode**.

#### Timer UI

- **Not inline in the set row** — uses a timer display area below or adjacent to the set entry (similar to rest timer overlay pattern)
- Dedicated play/stop button next to duration field (56dp minimum touch target)
- Timer display shows running `MM:SS` count with subtle pulsing animation (respects `useReducedMotion()`)
- Stopwatch mode: counts up from 0:00
- Countdown mode: counts down from target, haptic + audio on completion
- Sound/haptic feedback at completion (countdown mode) using existing rest timer audio system
- **Only one timer active at a time** — starting a set timer dismisses any running rest timer; completing a timed set and saving stops the set timer and starts the rest timer (if auto-rest is enabled)

#### Timer Accuracy (Critical — C-1 fix)

Timer MUST use **absolute timestamps**, not cumulative setInterval counting:
- On start: record `startedAt = Date.now()` 
- Display update: `elapsed = Date.now() - startedAt` (via 1s setInterval for display only)
- On foreground resume: recalculate from `startedAt` — handles app backgrounding, phone locking, music switching
- Reference: `useTimerEngine.ts:187` AppState.addEventListener('change') pattern
- On stop: `duration = Math.round((Date.now() - startedAt) / 1000)`

This ensures that backgrounding the app during a 90s plank correctly records 90s, not the 30s the timer displayed before backgrounding.

#### Timer State Persistence (M-2 fix)

Timer start timestamp is persisted to AsyncStorage immediately on timer start:
- Key: `set-timer-{sessionId}-{exerciseId}-{setIndex}`
- Value: `{ startedAt: number, targetDuration?: number }`
- On app relaunch: check for active timer state, resume if found
- On timer stop/cancel: clear persisted state
- This survives OS process kills during timed holds

#### Timer / Rest Timer Interaction (M-3 fix)

Only one timer runs at a time:
- **Starting a set timer** → dismisses any running rest timer (rest is over — user is starting a new hold)
- **Completing a timed set** (stop button) → saves duration, stops set timer, starts rest timer (if auto-rest enabled)
- **Rest timer running + user taps play on next set** → rest timer stops, set timer starts
- Visual: when set timer is active, rest timer overlay is hidden

#### Undo / Correction UX (M-4 fix)

- If user accidentally taps stop early: the duration field now shows the recorded value. They can tap the duration INPUT FIELD (not the play button) to manually correct — opens numeric keyboard, enter seconds, displayed as MM:SS.
- Play button starts a fresh timer (does not resume — simpler UX)
- Manual entry is always available regardless of timer use — user can skip the timer entirely and type "90" to record 1:30

#### Timer Accessibility (Critical — C-2 fix)

- Timer display: `accessibilityRole="timer"`, announces time periodically via `accessibilityLiveRegion="polite"` (every 15 seconds while counting, not every second)
- Play button: `accessibilityLabel="Start set timer"`, `accessibilityHint="Double tap to start timing this set"`
- Stop button: `accessibilityLabel="Stop set timer"`, `accessibilityHint="Double tap to stop and record duration"`
- On countdown completion: announce via `accessibilityLiveRegion="assertive"` — "Timer complete, [duration] recorded"
- Duration input field: `accessibilityLabel="Set duration, [current value] seconds"`
- Timer state conveyed by icon + text, not color alone (play icon → stop icon transition)
- Touch targets: 56dp minimum for play/stop button (workout SKILL criterion)
- Font size on timer display: ≥20pt per SKILL criterion

#### Template Editor

- `target_duration_seconds` field on template_exercises (e.g., "Hold for 60s")
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
   ALTER TABLE workout_sets ADD COLUMN duration_seconds INTEGER; -- seconds, nullable
   ```

2. **Migration**: Add column to `template_exercises`:
   ```sql
   ALTER TABLE template_exercises ADD COLUMN target_duration_seconds INTEGER; -- seconds, nullable
   ```

3. **Drizzle schema** (`lib/db/schema.ts`): Add `duration_seconds` to `workoutSets` and `target_duration_seconds` to `templateExercises`

4. **Seed data**: Add isometric exercises to seed data — plank, dead hang, wall sit, L-sit, farmer's carry — with `training_modes: '["isometric"]'` so duration mode activates automatically

5. **NO changes to exercises table** — duration mode is determined by training_mode, not a new column on exercises. An exercise with `isometric` mode defaults to duration tracking.

6. **Validation**: `duration_seconds >= 0` enforced at the application layer (same as weight/reps validation)

#### State Management

- `SetWithMeta` type gains optional `duration_seconds?: number` field
- `ExerciseGroup` gains `trackingMode: 'reps' | 'duration'` derived from training_mode
- Set completion logic: a duration set is "completed" when `duration_seconds > 0 && completed === 1`
- `SetRow` `onUpdate` prop type extended: `field: "weight" | "reps" | "duration_seconds"`

#### Timer Hook

- New `useSetTimer()` hook:
  - `start()` — records `startedAt = Date.now()`, begins 1s display interval, persists startedAt to AsyncStorage
  - `startCountdown(seconds)` — same but counts down from target
  - `stop()` → calculates `duration = Math.round((Date.now() - startedAt) / 1000)`, clears persisted state, returns duration
  - `isRunning` state
  - **Uses absolute timestamps** (Date.now()), NOT cumulative setInterval counting
  - Display updates via 1s setInterval, but elapsed always computed as `Date.now() - startedAt`
  - AppState listener: on foreground resume, recalculate display from startedAt
  - Haptic + audio on countdown completion (reuse rest timer audio system)

#### Suggestion Logic

- New `suggestDuration()` function in `lib/rm.ts` (separate from `suggest()` to avoid increasing cyclomatic complexity in the existing 14-branch function):
  - For duration exercises: suggest `previous_duration + 5s` (progressive overload via time)
  - 1RM estimation: not applicable for duration-only sets (skip)

#### PR Detection

- Existing PR logic compares max weight. For duration mode:
  - PR = longest `duration_seconds` at same or higher weight
  - For bodyweight (weight IS NULL): PR = longest `duration_seconds`
- Modify `useSummaryData` to detect duration PRs

### Scope

**In Scope:**
- `duration_seconds` column on `workout_sets` + migration
- `target_duration_seconds` column on `template_exercises` + migration
- Drizzle schema updates for new columns
- Seed data: isometric exercises (plank, dead hang, wall sit, L-sit, farmer's carry)
- Dedicated play/stop timer button in set entry row (duration mode)
- Duration input field with manual entry (numeric seconds, MM:SS display)
- Timer using absolute timestamps (Date.now()), NOT setInterval counting
- Timer state persistence to AsyncStorage (survives process kill)
- Timer / rest timer interaction rules (one timer at a time)
- Timer accessibility (liveRegion, role, labels, 56dp touch targets)
- Duration display in set rows (MM:SS format)
- Template editor: target duration field for duration-mode exercises
- Session summary: duration display instead of reps
- Exercise history: duration shown in history list
- Exercise chart: duration trend chart mode
- Records card: Max Duration stat
- Duration PR detection in session summary
- Separate `suggestDuration()` function for duration progressive overload
- Backup/restore: `duration_seconds` column in `insertRow()` with `?? null` default
- CSV export: `duration_seconds` column included

**Out of Scope:**
- "Reps + Duration" combined mode — deferred to future iteration (per QD+TL agreement)
- New exercise category "Timed" — uses existing training_mode system
- AMRAP timer (separate feature: counting rounds in a time cap)
- Interval training programming (e.g., Tabata timer — use the existing Interval Timer tool)
- Exercise-level "default tracking mode" override beyond training_mode
- Analytics: muscle volume calculation from duration sets (deferred — volume = weight × reps, not applicable to pure duration sets)
- Timer as bottom sheet (using adjacent display area instead — simpler, avoids modal complexity)

### Acceptance Criteria

- [ ] Given a user creates a set for an isometric exercise When the set row renders Then a duration input field and a play/stop timer button (56dp min) are shown instead of reps
- [ ] Given a user taps the play button on a duration set When the timer starts Then `startedAt = Date.now()` is recorded and persisted to AsyncStorage
- [ ] Given a timer is running and the user taps stop Then the elapsed duration (`Math.round((Date.now() - startedAt) / 1000)`) is saved to the set's `duration_seconds` column
- [ ] Given a timer is running and the app is backgrounded for 60 seconds When the user returns Then the timer display shows correct elapsed time (recalculated from startedAt)
- [ ] Given a timer is running and the OS kills the app When the user relaunches Then the timer resumes from the persisted startedAt timestamp
- [ ] Given a template has `target_duration_seconds` for an exercise When a session is started Then the timer uses countdown mode starting from `target_duration_seconds`
- [ ] Given a user completes a plank with 90 seconds When they view the session summary Then the set shows "1:30" instead of reps
- [ ] Given a user achieves their longest-ever plank hold When the session summary loads Then a duration PR is displayed in the PRs card
- [ ] Given a user views exercise history for an isometric exercise When the chart loads Then the y-axis shows duration (seconds) instead of weight
- [ ] Given existing workout data (non-duration) When the migration runs Then all existing sets have `duration_seconds = NULL` and work exactly as before
- [ ] Given a user enters a farmer's carry set When they record 80kg for 45 seconds Then both weight and `duration_seconds` are saved
- [ ] Given the duration input field is tapped (not the play button) Then a numeric keyboard opens for manual duration entry in seconds
- [ ] Given a set timer is running and the user taps play on a different set Then the first timer stops (discarded) and a confirmation prompt appears
- [ ] Given a rest timer is counting down and the user taps play on a set timer Then the rest timer is dismissed and the set timer starts
- [ ] Given a screen reader is active When a set timer is running Then the timer announces elapsed time via accessibilityLiveRegion="polite" every 15 seconds
- [ ] Given a countdown timer completes Then haptic + audio feedback fires AND accessibilityLiveRegion="assertive" announces "Timer complete"
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx tsc --noEmit` passes
- [ ] Backup/restore round-trips `duration_seconds` data correctly

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Timer running when app backgrounded | Timer uses absolute timestamps — elapsed recalculated from `startedAt` on foreground resume. Accurate to the second. |
| Timer running when OS kills app | `startedAt` persisted in AsyncStorage. On relaunch, timer resumes from persisted timestamp. |
| Timer running when switching exercises | Confirmation prompt: "Timer is running. Discard?" Yes → discard, No → stay. |
| Timer running when navigating away from session | Same confirmation prompt as above. |
| Duration = 0 seconds | Set treated as incomplete (same as reps = 0) |
| Negative duration | Rejected at application layer (`duration_seconds >= 0` validation) |
| Very long duration (>1 hour) | Display as H:MM:SS, no upper limit |
| Accidental stop (user meant to keep timing) | Tap duration input field to manually correct (numeric keyboard, enter seconds). Play button starts a fresh timer. |
| Multiple set timers simultaneously | Prohibited — only one timer at a time. Starting a new one stops the old one (with confirmation). |
| Set timer + rest timer conflict | Starting set timer → dismiss rest timer. Completing timed set → start rest timer. |
| CSV export of duration sets | New `duration_seconds` column in CSV output |
| Strong app import (no duration data) | `duration_seconds` column defaults to NULL (existing behavior preserved) |
| Old backup restore (no duration column) | `insertRow()` uses `?? null` — graceful degradation |
| Exercise detail page for duration exercises | Chart offers: max weight, est 1RM, max duration modes |
| Bodyweight + duration (e.g., plank) | No weight field shown; only duration field + timer button |
| Bodyweight PR comparison (weight NULL vs 0) | Both treated as "bodyweight" — compare `duration_seconds` only |
| Re-doing a completed timed set | Timer button resets; previous duration is overwritten when new duration is saved |
| Reduced motion preference | Timer pulsing animation disabled when `useReducedMotion()` returns true |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Migration breaks existing data | Low | High | Migration is additive (ALTER TABLE ADD COLUMN), default NULL — no data loss risk |
| Timer accuracy on backgrounded app | ~~Medium~~ **Eliminated** | ~~High~~ | Uses absolute timestamps (Date.now()), not setInterval counting. AppState listener recalculates on resume. |
| Timer state lost on process kill | ~~Medium~~ **Low** | ~~Medium~~ | startedAt persisted to AsyncStorage immediately on timer start |
| Complex set entry UI (too many fields) | Low | Medium | "Reps + Duration" mode deferred. Duration mode shows only weight + duration + timer button. Clean layout. |
| PR detection complexity | Low | Low | Duration PRs are simpler than weight PRs (just compare durations at same weight) |
| Backup/restore compatibility | Low | High | Duration column is nullable — old backups import fine (NULL), new backups include it. insertRow() updated with ?? null. |
| No isometric exercises in seed data | ~~Medium~~ **Mitigated** | Medium | Implementation must add plank, dead hang, wall sit, L-sit, farmer's carry to seed data |

## Dependencies

- Drizzle schema must be up to date (BLD-370 ✅ done)
- Five-point backup/restore integration (learning from BLD-335)

## Implementation Notes

- Follow the "Five-Point Backup/Restore Integration" learning from the knowledge base
- Use **absolute timestamps** for timer — `Date.now()` at start, `Date.now() - startedAt` for elapsed. Reference `useTimerEngine.ts:187` AppState pattern.
- Persist timer `startedAt` to AsyncStorage immediately on timer start (key: `set-timer-{sessionId}-{exerciseId}-{setIndex}`)
- Create `suggestDuration()` as separate function from `suggest()` in rm.ts (avoid increasing cyclomatic complexity)
- Update `insertRow()` in `import-export.ts` for `workout_sets` to include `duration_seconds` with `?? null`, and for `template_exercises` to include `target_duration_seconds` with `?? null`
- Add `duration_seconds` to `NUMERIC_NONNEG_FIELDS` validation array in import-export
- Add isometric exercises to seed data: plank, dead hang, wall sit, L-sit, farmer's carry (with `training_modes: '["isometric"]'`)
- Extend `SetRow` `onUpdate` field type to include `"duration_seconds"`
- Use existing `Haptics` and audio feedback system from rest timer for countdown completion
- Exercise detail page `ExerciseChartCard` already supports `chartMode` toggle — extend with `"duration"` option
- Timer play/stop button: 56dp minimum, clear icon states (play → stop transition)

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)

**Rev 1 Verdict: NEEDS REVISION** (2026-04-19) — 3 Critical, 4 Major issues raised.

**Rev 2 Verdict: APPROVED** (2026-04-19) — All 3 Critical and 4 Major issues resolved in Rev 2. No remaining blockers. Implementation may proceed.

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
**Rev 2 — Addressing all feedback** (2026-04-19)

All 3 Critical and 4 Major issues from QD have been addressed in this revision:

| Issue | Resolution |
|-------|-----------|
| **C-1: Timer accuracy** | Replaced setInterval counting with absolute timestamps (Date.now()). AppState listener recalculates on foreground resume. |
| **C-2: Timer accessibility** | Added full a11y spec: accessibilityRole="timer", liveRegion="polite" every 15s, assertive on completion, 56dp touch targets, accessibilityLabel/Hint on all controls. |
| **C-3: Ambiguous tap interaction** | Separated into: duration input field (manual numeric entry) + dedicated play/stop button (timer control). No accidental starts. |
| **M-1: Reps + Duration mode** | Deferred to future iteration. Shipping pure Duration mode first. |
| **M-2: Timer state persistence** | startedAt persisted to AsyncStorage immediately. Survives process kill. |
| **M-3: Rest timer conflict** | Specified one-timer-at-a-time rules: set timer dismisses rest timer, completing set starts rest timer. |
| **M-4: Undo/correction UX** | Manual numeric entry always available. Play button starts fresh (no resume). |

Tech Lead recommendations also incorporated:
- Column naming: `duration_seconds` / `target_duration_seconds` (matches `rest_seconds` convention)
- Separate `suggestDuration()` function
- Isometric exercises added to seed data scope
- `onUpdate` field type extended explicitly

Re-submitting for QD review.
