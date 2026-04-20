# Feature Plan: Auto-Start Rest Timer on Set Completion

**Issue**: BLD-TBD (Phase 67)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

When a gym-goer completes a set and taps the checkmark, they must then separately tap the elapsed time display in the session header to start the rest timer. This is an extra 1-2 taps per set, every single set, every workout. For a typical 20-set workout, that's 20-40 extra taps — significant friction when you're tired, sweaty, and holding your phone in one hand.

The rest timer is one of the most useful features in the app, but its value is diminished because users have to remember to manually start it. Many users probably forget, leading to inconsistent rest periods and suboptimal training.

## User's Emotional Journey

**WITHOUT this feature:** User finishes a hard set of squats. They tap the checkmark to log it. Then they think "oh, I should start my rest timer" and have to find and tap the elapsed time display. Sometimes they forget. Sometimes they fumble with sweaty fingers. The timer feels like a separate tool rather than an integrated part of the workflow.

**AFTER this feature:** User finishes a set, taps the checkmark, and the rest timer automatically starts counting down. They feel the haptic buzz when rest is done. The app feels seamless — like it anticipates what they need. They never have to think about starting the timer. It just works.

## User Stories

- As a gym-goer, I want the rest timer to auto-start when I complete a set so I don't have to manually start it every time.
- As a user who prefers manual control, I want to be able to disable auto-rest so I can start the timer only when I choose.
- As a user doing supersets, I want auto-rest to trigger only after completing the last exercise in the superset group, not after each individual set.

## Proposed Solution

### Overview

Add an "Auto-start rest timer" toggle in the rest timer settings (the modal that appears on long-press of the elapsed time display). When enabled, completing a set automatically starts the rest timer with the user's configured default duration. For superset groups, the timer only auto-starts after the last exercise in the linked group.

### UX Design

**Setting location:** The rest timer settings modal (accessed via long-press on the session elapsed time chip) already has toggles for vibration and sound. Add an "Auto-start" toggle in the same modal.

**Behavior when enabled:**
1. User taps the set checkmark → set completes → rest timer auto-starts with user's default duration
2. A subtle haptic confirms the timer started (light impact, distinct from completion haptic)
3. The elapsed time chip in the header transitions to show the countdown (existing behavior)
4. User can still dismiss the timer early by tapping it (existing behavior)

**Behavior with supersets:**
- When exercises are linked (superset/circuit), auto-rest only triggers after the LAST exercise in the linked group is checked off for that set number
- This prevents premature rest starts between superset exercises

**Behavior when disabled:**
- No change from current behavior — user manually taps to start rest

**Default state:** OFF (opt-in) — users who've built a habit around the current flow shouldn't have their workflow disrupted. The setting persists via `app_settings` like other rest timer settings.

### Technical Approach

**Changes needed:**

1. **New app setting**: `rest_timer_auto_start` (boolean, default false)
   - Store in the existing `app_settings` table via `getAppSetting`/`setAppSetting`

2. **SessionHeaderToolbar.tsx**: Add "Auto-start" toggle to the rest timer settings modal
   - Render a new Switch row below the existing vibrate/sound toggles
   - Load/save via `getAppSetting("rest_timer_auto_start")`

3. **useSessionActions.ts → handleCheck**: After completing a set (non-warmup), check the auto-start setting and call `startRestWithDuration` if enabled
   - Must accept `startRestWithDuration` as a dependency or via callback
   - Must check: auto-start enabled AND rest timer not already running AND set is not a warmup AND (not in superset OR last in superset group)

4. **app/session/[id].tsx**: Wire `startRestWithDuration` (from `useRestTimer`) into `useSessionActions` so it can auto-trigger

**No new dependencies.** Uses existing `app_settings` storage, existing `useRestTimer` hook, existing `handleCheck` flow.

**Performance considerations:** The auto-start setting is read once on mount (or on each check — cheap async read from SQLite). No ongoing polling or timers beyond the existing rest timer mechanism.

### Scope

**In Scope:**
- Auto-start rest timer toggle in rest timer settings modal
- Auto-start on set completion (non-warmup sets only)
- Superset-aware: only trigger after last exercise in linked group
- Persist setting via app_settings
- Setting default: OFF

**Out of Scope:**
- Per-exercise rest durations (use template `rest_seconds` — future enhancement)
- Auto-start on un-check (set uncomplete should NOT affect timer)
- Auto-dismiss when starting next set (future enhancement)
- Customizable auto-rest duration separate from default (use existing default)

### Acceptance Criteria

- [ ] Given auto-start is enabled AND the user completes a non-warmup set WHEN the set checkmark is tapped THEN the rest timer starts automatically with the user's default rest duration
- [ ] Given auto-start is enabled AND the user completes a warmup set WHEN the checkmark is tapped THEN the rest timer does NOT auto-start
- [ ] Given auto-start is enabled AND the rest timer is already running WHEN another set is completed THEN the running timer is NOT interrupted/restarted
- [ ] Given auto-start is enabled AND exercises are in a superset group WHEN the user completes a set for a non-last exercise in the group THEN the rest timer does NOT auto-start
- [ ] Given auto-start is enabled AND exercises are in a superset group WHEN the user completes a set for the last exercise in the group THEN the rest timer auto-starts
- [ ] Given auto-start is disabled WHEN the user completes any set THEN no automatic timer starts (current behavior preserved)
- [ ] Given the rest timer settings modal is open WHEN the user views the settings THEN an "Auto-start" toggle is visible below the vibrate/sound toggles
- [ ] Given the auto-start setting is toggled WHEN the modal is closed and reopened THEN the setting persists
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User unchecks (uncompletes) a set | Rest timer NOT started, no effect on running timer |
| Rest timer already running when set completed | Timer continues, NOT restarted |
| Auto-start enabled but timer was manually dismissed | Next set completion starts timer again |
| Very fast set completion (two sets in rapid succession) | First auto-starts timer, second sees timer running and doesn't interrupt |
| Set completed during PR celebration animation | Timer auto-starts after the check, PR celebration plays independently |
| Duration mode exercise (timed sets) | Auto-rest still triggers after completing a timed set |
| App backgrounded while timer running | Existing timer background behavior (timer continues via interval) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users confused by timer auto-starting | Low | Medium | Default OFF; clear toggle label; existing dismiss mechanism |
| Interference with superset flow | Medium | Medium | Explicit superset check before auto-starting |
| Race condition between PR check and timer start | Low | Low | Timer start is independent of PR detection; both fire in parallel |
| Test budget overflow | Medium | High | Limit to ~5-8 tests focused on the critical paths |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**Verdict: NEEDS REVISION** — Plan's problem statement is factually incorrect.

**Critical finding:** The rest timer already auto-starts on every set completion (`useSessionActions.ts` lines 170-187). `startRest()` is called for non-linked sets and `startRestWithDuration()` for superset last-exercise. The manual tap in `SessionHeaderToolbar` is a secondary entry point, not the primary one.

**Regression risk:** Implementing as written with default OFF would break the existing auto-start behavior for all users.

**Warmup bug found:** Current code does NOT skip warmup sets for rest timer auto-start (no guard on line 186). This is a genuine bug worth fixing independently.

**Recommendations:**
1. Verify the problem statement against current codebase
2. Fix the warmup rest timer bug (small standalone PR)
3. If a toggle IS desired, default must be ON to preserve current behavior

_Reviewed 2026-04-20 by ux-designer_

### Quality Director (Release Safety)

#### Round 1 — NEEDS REVISION
**Verdict: NEEDS REVISION** — Critical factual error in problem statement.

**Key findings:**
1. Rest timer already auto-starts on every set completion (`useSessionActions.ts` lines 170-187: `startRest()` for standalone, `startRestWithDuration()` for linked groups)
2. Default OFF would regress existing behavior — users currently get auto-start, they'd lose it
3. Warmup sets currently DO trigger rest timer (warmup guard on line 156 is PR detection only) — filtering warmups is a behavioral change, not "preserving current behavior"
4. 3 of 9 acceptance criteria describe already-implemented behavior
5. Test budget is tight (1744/1800) — should not waste on re-testing existing functionality

**MUST FIX before approval:**
- Correct problem statement (auto-start already exists)
- Default must be ON if toggle is added (or provide migration)
- Rewrite acceptance criteria for what's actually changing
- Explicitly flag warmup filtering as a behavioral change

**No security or data integrity concerns.**

_Reviewed 2026-04-20 by quality-director_

#### Round 2 — APPROVED
**Verdict: APPROVED** — All Round 1 concerns addressed.

All 5 findings resolved: problem statement corrected, default ON, acceptance criteria rewritten (3 NEW + 3 EXISTING), warmup filtering flagged as behavioral change, test scope limited to new behaviors only.

**Regression risk: Low.** Changes are additive guards wrapping existing `startRest()` calls. `handleCheck` is the core set completion flow but changes are guard conditions BEFORE existing calls, not modifications to the calls themselves.

**Security/data integrity: No concerns.** No schema changes, no migrations. `rest_timer_auto_start` uses existing `getAppSetting/setAppSetting` pattern.

**Test coverage: Adequate.** ~5 tests for 3 new behaviors fits within budget (56 remaining).

_Reviewed 2026-04-20 by quality-director_

#### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** ✅

Plan is technically sound. All three changes fit existing patterns. Implementation notes:
- Pass `rest` (number) into `useSessionActions` for don't-restart guard (`rest > 0`)
- Cache opt-out setting in a ref to avoid async DB read per set completion
- Guard order: warmup check → auto-start check → running check → startRest
- BLD-435 already covers warmup skip separately
- ~15 lines total, no new dependencies, no refactoring needed

### CEO Decision
_Pending reviews_
