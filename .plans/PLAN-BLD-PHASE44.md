# Feature Plan: Repeat Workout from History (Phase 44)

**Issue**: BLD-264 (PLAN)
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT (Rev 2 — addressing QD feedback)

## Problem Statement

Users who complete a workout often want to repeat it next week with the same exercises and similar weights. Currently, the only way to achieve this is:
1. Save the session as a template first (via "Save as Template" on session detail)
2. Then start a new session from that template

This is a two-step process that creates template clutter — users accumulate templates they never reuse. Many users follow an informal routine (e.g., "Push Day") without formal templates. They simply want a "do it again" button that starts a new session pre-filled with the same exercises and their last-used weights.

Competitive apps (Strong, Hevy, JEFIT) all offer one-tap workout repetition from history. This is one of the most requested features in fitness app communities.

## User Stories

- As a user viewing a past workout in session detail, I want to tap "Repeat" so that a new session starts pre-filled with the same exercises and target weights
- As a user viewing the session summary after completing a workout, I want to repeat that workout later without creating a template first
- As a user, I want the repeated session to show my previous performance as reference so I can track progressive overload

## Proposed Solution

### Overview

Add a "Repeat Workout" action to two screens:
1. **Session Detail** (`app/session/detail/[id].tsx`) — "Repeat" button in the action row alongside existing "Save as Template"
2. **Session Summary** (`app/session/summary/[id].tsx`) — "Repeat" option (for future — focus this phase on session detail only to keep scope small)

When tapped, the system:
1. Creates a new session via existing `startSession(null, sessionName)`
2. Navigates to the active session screen (`app/session/[id].tsx`) with a new `sourceSessionId` URL param
3. The session screen detects `sourceSessionId`, loads exercises from the source session, creates matching sets, and pre-fills target weights from the source session's actual performance

This follows the exact same pattern as the existing template-based population (lines 887-921 of `app/session/[id].tsx`), substituting session history data for template data.

### UX Design

**Session Detail Screen** — Add a "Repeat Workout" button as a **body-level action button** (full-width outlined button) below the session summary card, alongside the existing "Save as Template" icon in the header. Placing it in the body avoids header cramming (QD feedback: two small icon buttons in `headerRight` risk misclicks and violate 48dp touch targets).

The button:
- Icon: `repeat` (MaterialCommunityIcons)
- Label: "Repeat Workout"
- Style: `mode="outlined"` (consistent with other body-level actions)
- Disabled when: `completedSetCount === 0` (same pattern as Save as Template)
- Accessibility: `accessibilityLabel="Repeat workout"`, `accessibilityHint="Start a new session with the same exercises and weights"`, `accessibilityRole="button"`

**Confirmation dialog** before creating the session (prevents accidental taps):
- Title: "Repeat Workout?"
- Body: "Start a new session with the same exercises and target weights from {sessionName}?"
- Actions: "Cancel" / "Repeat"

**Tapping "Repeat" (after confirmation):**
1. Checks for an active session (same guard as template-based start)
2. If active session exists → Alert: "You have an active workout. Finish or cancel it first."
3. If no active session → Creates new session, navigates to `/session/[newId]?sourceSessionId=[oldId]`

**Repeated Session Behavior:**
- Session name: same as source session name (e.g., "Push Day")
- Sets: same exercises, same number of sets per exercise, same link_id groupings (supersets/circuits)
- Target weight: pre-filled from the **source session's actual completed weights** (read directly from source session's `workout_sets`, NOT via `getPreviousSets` which returns the most recent session)
- Target reps: pre-filled from the **source session's actual completed reps** (users repeating want to match/beat previous performance)
- Training mode and tempo: copied from source session sets
- Notes: NOT copied (start fresh)
- Swapped exercises: Use the **swapped-to exercise** (current `exercise_id`), NOT `swapped_from_exercise_id`. The swap represents user intent — they chose to replace that exercise.

**Edge Cases Handled:**
- Deleted exercises: Skip exercises whose `exercise_id` no longer exists in the `exercises` table. Show a snackbar: "N exercises were skipped (no longer available)"
- Empty source: If source session has no completed sets, create the session with the exercises but no pre-filled weights
- 0 exercises in source: "Repeat Workout" button is disabled (same as Save as Template pattern)

### Technical Approach

**Changes required:**

1. **`lib/db/sessions.ts`** — Add a new function `getSourceSessionSets(sessionId)` that returns the exercise groups with actual weights/reps from a specific completed session. This reads directly from the source session's `workout_sets` table (NOT via `getPreviousSets`, which returns the most recent session and would give wrong data if a different workout happened in between). The query should LEFT JOIN the `exercises` table to detect deleted exercises in a single query:
   ```
   SELECT ws.exercise_id, ws.set_number, ws.weight, ws.reps, ws.link_id,
          ws.training_mode, ws.tempo, e.id AS exercise_exists
   FROM workout_sets ws
   LEFT JOIN exercises e ON ws.exercise_id = e.id
   WHERE ws.session_id = ? AND ws.completed = 1
   ORDER BY ws.set_number ASC
   ```

2. **`app/session/[id].tsx`** — Accept new `sourceSessionId` URL param. Add population logic parallel to the existing `templateId` branch (lines 887-921):
   ```
   if (sourceSessionId) {
     const sets = await getSourceSessionSets(sourceSessionId)
     // Filter out sets where exercise_exists is null (deleted exercises)
     // Count deleted, show snackbar if > 0
     // Group remaining sets by exercise_id
     // Map old link_ids to new UUIDs (generate new uuid for each unique old link_id)
     // Create matching sets via addSetsBatch with:
     //   - weight pre-filled from source set's actual weight
     //   - reps pre-filled from source set's actual reps
     //   - new link_id (mapped from old → new uuid)
     //   - training_mode and tempo copied
     //   - swapped_from_exercise_id: null (fresh start)
   }
   ```

3. **`app/session/detail/[id].tsx`** — Add "Repeat Workout" outlined button in the body (below summary card):
   - Confirmation dialog before action
   - Checks for active session via `getActiveSession()`
   - Creates new session via `startSession(null, session.name)`
   - Navigates to `/session/${newId}?sourceSessionId=${id}`
   - Button disabled when `completedSetCount === 0`
   - Full accessibility attributes: `accessibilityLabel`, `accessibilityHint`, `accessibilityRole`

**Link_id handling (explicit):** Old link_ids from the source session are NOT reused directly. Instead, each unique old link_id is mapped to a new UUID. This prevents potential conflicts if the user repeats the same workout multiple times. This is the same approach used in the template population flow (lines 1165-1177 of `app/session/[id].tsx`).

**No new dependencies.** No schema changes. No new screens.

### Scope

**In Scope:**
- "Repeat" button on session detail screen
- Session population from source session history
- Weight pre-fill from source session
- Superset/circuit preservation (link_id)
- Training mode and tempo preservation
- Deleted exercise handling

**Out of Scope:**
- "Repeat" on session summary screen (can add later — keep this phase small)
- Modifying the repeated workout before starting (add/remove exercises)
- "Repeat with progressive overload" (auto-increment weights) — future enhancement
- Search/filter in session history

### Acceptance Criteria

- [ ] Given a completed session detail, When user taps "Repeat Workout", Then a confirmation dialog appears
- [ ] Given the confirmation dialog, When user taps "Repeat", Then a new session is created with the same exercises and number of sets
- [ ] Given the new session, When it loads, Then weights are pre-filled from the **source session's actual completed weights** (not from any other session)
- [ ] Given the new session, When it loads, Then reps are pre-filled from the source session's actual completed reps
- [ ] Given a source session with supersets, When repeated, Then the new session preserves superset groupings with new link_id UUIDs (old→new mapping)
- [ ] Given a source session containing deleted exercises, When repeated, Then deleted exercises are skipped and a snackbar notifies the user with count
- [ ] Given a source session with swapped exercises, When repeated, Then the swapped-to exercise (current exercise_id) is used, not the original
- [ ] Given an active session exists, When user taps "Repeat Workout", Then an alert prevents creating a duplicate active session
- [ ] Given a source session with training modes (tempo, etc.), When repeated, Then modes are preserved in the new session
- [ ] Given a source session with 0 exercises, Then the "Repeat Workout" button is disabled
- [ ] The "Repeat Workout" button has accessibilityLabel, accessibilityHint, and accessibilityRole attributes
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Source session has deleted exercises | Skip deleted exercises (LEFT JOIN detects), show snackbar with count |
| Active session already exists | Alert user, do not create new session |
| Source session has 0 completed sets | Create session with exercises but no pre-filled weights |
| Source session has 0 exercises | "Repeat Workout" button is disabled |
| Source session has supersets/circuits | Preserve groupings with new link_id UUIDs (old→new map) |
| Source session has training modes | Preserve training_mode and tempo on new sets |
| Source session has swapped exercises | Use swapped-to exercise (current exercise_id), ignore swapped_from |
| Accidental tap | Confirmation dialog prevents unintended session creation |
| Very large session (20+ exercises) | Works normally — addSetsBatch handles bulk inserts |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Navigation conflict with active session | Low | Medium | Existing guard pattern from template flow |
| Link_id collision in new session | Low | Low | Generate new UUIDs, map old→new (same as template flow) |
| Wrong weights pre-filled | Low | High | Read directly from source session sets, NOT via getPreviousSets |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: APPROVED (2026-04-17, Rev 2 re-review)

All 5 issues from initial review (2 Critical, 3 Major) resolved in Rev 2. All recommendations adopted. Plan is well-specified with clear acceptance criteria, edge case coverage, accessibility requirements, and data integrity safeguards. Ready for implementation.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Technically sound, well-scoped, low-risk.

- Architecture fit: Excellent. Extends existing template-population pattern (session/[id].tsx:887-921). No refactoring needed.
- Effort: Small (~3 files, ~80-120 lines). `addSetsBatch` already supports `trainingMode`/`tempo`.
- Risk: Low. Mirrors proven flow.
- Dependencies: None.

**Implementation notes:**
1. Skip the proposed `getSessionExerciseGroups` helper — `getSessionSets` already returns everything needed.
2. Filter to `completed: true` sets only when loading from source session.
3. Must remap link_ids to fresh UUIDs (follow `createTemplateFromSession` pattern at sessions.ts:1166-1179).
4. Weight source: use source session weights directly (not `getPreviousSets`) — this is what users expect.

### CEO Decision
_Pending reviews_
