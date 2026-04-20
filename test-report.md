# CableSnap — User Flow Test Report

**Date:** 2026-04-14
**Method:** Code-level analysis of all screens, DB layer, navigation, and state management.
Existing Jest suite: 516/516 tests pass. E2e Playwright tests excluded (infra issue).

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 10 |
| Major    | 22 |
| Minor    | 22 |
| Cosmetic | 8 |
| **Total**| **62** |

### Flow Results

| # | Flow | Verdict | Critical/Major Bug Count |
|---|------|---------|--------------------------|
| 1 | Onboarding | FAIL | 2 major |
| 2 | Exercise Library | FAIL | 3 major |
| 3 | Template Management | FAIL | 5 critical, 2 major |
| 4 | Program Management | FAIL | 2 critical, 4 major |
| 5 | Workout Session | FAIL | 3 major |
| 6 | Post-Workout | PASS (minor only) | 0 |
| 7 | Nutrition | FAIL | 3 critical, 2 major |
| 8 | Body Tracking | FAIL | 1 critical, 3 major |
| 9 | Progress Charts | FAIL | 2 major |
| 10 | Schedule | FAIL | 1 major |
| 11 | Settings / Data Mgmt | FAIL | 2 critical, 1 major |
| 12 | Tools | PASS (minor only) | 0 |

---

## Critical Bugs (10)

### C-01: `router.replace()` creates duplicate screens — exercise/template/program pickers

**Files:** `app/template/pick-exercise.tsx:73-79`, `app/program/pick-template.tsx:43-44`
**Flows affected:** Template create, Template edit, Program create

When the exercise picker calls `router.replace('/template/create?templateId=...&addExerciseId=...')`, it replaces the **picker** screen with a **new** instance of the create screen. The **original** create screen remains below on the stack with stale state. Pressing "Done" (`router.back()`) pops to the stale original, making the added exercise/day appear to vanish.

This is the bug the user originally reported. It affects three navigation paths:
- `pick-exercise.tsx:77` → `template/create` (new template)
- `pick-exercise.tsx:73` → `template/[id]` (edit template)
- `pick-template.tsx:43` → `program/create` (new program)

**Repro:** Create template → Add Exercise → pick one → see it appear → press Done → exercise gone.

---

### C-02: Exercise position collision on edit screen

**File:** `app/template/[id].tsx:81-87`
**Flow:** Template edit — add exercise

The `addExerciseId` effect fires before `load()` completes, using `exercises.length` while `exercises` is still `[]`. The new exercise is inserted at position 0, colliding with existing exercises.

Unlike `template/create.tsx` which guards on `!template` (state, initially null), the edit screen guards on `!id` (route param, always present immediately).

---

### C-03: Program day position collision on create screen

**File:** `app/program/create.tsx:54-71`
**Flow:** Program create — add day

Hydration sets `program` state, triggering the addTemplate effect before `getProgramDays().then(setDays)` resolves. `days.length` is 0, so the new day is inserted at position 0, colliding with existing days.

---

### C-04: Template name edits silently discarded

**File:** `app/template/create.tsx:87-93`
**Flow:** Template create — edit name after creation

After the template is created, the name `TextInput` remains editable. If the user changes the name and presses "Done", the code just calls `router.back()` — no `updateTemplateName()` call exists. The name change is silently lost.

---

### C-05: `reorderTemplateExercises` not wrapped in a transaction

**File:** `lib/db/templates.ts:254-269`
**Flow:** Template edit — reorder exercises

Each position UPDATE runs as a separate statement. A crash mid-loop leaves positions in an inconsistent state (e.g., two exercises at position 0). Compare with `reorderProgramDays` which correctly uses `withTransactionAsync`.

---

### C-06: `deleteTemplate` not wrapped in a transaction

**File:** `lib/db/templates.ts:108-118`
**Flow:** Template delete

Four separate DELETE/UPDATE statements without a transaction. A failure after deleting exercises but before deleting the template leaves a template with no exercises. Also, `workout_sessions.template_id` is not cleared, leaving dangling references.

---

### C-07: Export version mismatch breaks re-import

**File:** `lib/db/import-export.ts:41`, `app/(tabs)/settings.tsx:283`
**Flow:** Settings — Export then Import

`exportAllData()` writes `version: 2`, but `handleImport` rejects any file where `data.version !== 1`. Users cannot re-import their own exports.

---

### C-08: Nutrition food logged to wrong date (UTC vs local)

**File:** `app/nutrition/add.tsx:30,243`
**Flow:** Nutrition — Add food

`new Date().toISOString().slice(0, 10)` gives the UTC date, not local. At 11pm PST, food gets logged to tomorrow's date. The main nutrition screen correctly uses `formatDateKey()`, but the add screen bypasses it.

---

### C-09: Nutrition always logs to "today" ignoring viewed date

**File:** `app/nutrition/add.tsx:243`, `app/(tabs)/nutrition.tsx:348-353`
**Flow:** Nutrition — Navigate to past date, add food

When the user navigates to a past date on the nutrition screen and taps "+", the add screen always logs to `today`. No date parameter is passed via the route. Food gets logged to the wrong date.

---

### C-10: Optimistic delete race condition in body weight tracking

**File:** `app/(tabs)/progress.tsx:177-198`
**Flow:** Body tracking — Delete two entries quickly

Deleting entry A, then quickly deleting entry B before A's 3-second timer fires: `undoRef` is overwritten to B. Entry A's timer is cleared, so A is **never actually deleted from the database** but has been removed from the UI. It silently reappears after reload.

---

## Major Bugs (22)

### M-01: Beginner "Start with Full Body" recommendation does nothing

**File:** `app/onboarding/recommend.tsx:39-44`
**Flow:** Onboarding — beginner recommendation

When a beginner taps "Start with Full Body", `finish("template")` is called. But the `"template"` case has no special handling — it falls through to `router.replace("/(tabs)")` without activating the template. Only `"program"` calls `activateProgram`. The beginner's recommendation is silently ignored.

---

### M-02: Retry button in onboarding loses the user's original choice

**File:** `app/onboarding/recommend.tsx:64`
**Flow:** Onboarding — error → retry

The error banner's "Retry" calls `finish()` with no argument, but the user may have originally chosen "Start with Full Body" or "Start with PPL". On retry, the action is lost.

---

### M-03: ExerciseForm always saves empty instructions (data loss)

**File:** `components/ExerciseForm.tsx:91`
**Flow:** Exercise create/edit

The form hardcodes `instructions: ""`. Creating a custom exercise sets instructions to empty. Editing a custom exercise that had instructions wipes them out.

---

### M-04: Exercise detail infinite "Loading..." for deleted/invalid exercises

**File:** `app/exercise/[id].tsx:115`
**Flow:** Exercise detail — deep link to deleted exercise

If `getExerciseById(id)` returns `null`, `setExercise(null)` is called. The component perpetually shows "Loading..." with no error state, no "not found" message, and no back navigation.

---

### M-05: Edit screen doesn't guard against editing built-in exercises

**File:** `app/exercise/edit/[id].tsx:26-29`
**Flow:** Exercise edit — deep link to built-in exercise

No `is_custom` check. `updateCustomExercise` has a `WHERE is_custom = 1` SQL guard, so the update silently does nothing, but the user sees "Exercise updated" toast — false success.

---

### M-06: `loadMore` stale closure in exercise history pagination

**File:** `app/exercise/[id].tsx:123-135`
**Flow:** Exercise detail — scroll history

`history.length` in the dependency array is used as the offset for the next page. Under rapid scroll, the stale closure value can produce duplicate rows or skip pages.

---

### M-07: Soft delete removes from templates but not workout_sets

**File:** `lib/db/exercises.ts:100-112`
**Flow:** Exercise delete

`softDeleteCustomExercise` removes from `template_exercises` but doesn't handle `workout_sets` references. Session history views that look up the exercise may render incorrectly.

---

### M-08: Positions not renormalized after exercise/day removal

**Files:** `lib/db/templates.ts` (removeExerciseFromTemplate), `lib/programs.ts` (removeProgramDay)
**Flows:** Template edit — remove exercise, Program edit — remove day

Example: exercises at positions [0, 1, 2]. Remove position 1 → DB has [0, 2]. User adds new exercise → `addExerciseToTemplate(..., exercises.length=2)` → inserts at position 2, colliding with the existing exercise there.

---

### M-09: `duplicateProgram` creates nested transactions

**File:** `lib/db/templates.ts:170-184`
**Flow:** Program duplicate

`duplicateTemplate` called inside `duplicateProgram`'s transaction starts its own `withTransactionAsync`. Nested transactions can deadlock or produce undefined behavior in expo-sqlite.

---

### M-10: `handledTemplate` uses `useState` instead of `useRef` (race condition)

**File:** `app/program/create.tsx:41`
**Flow:** Program create — add template

The guard against double-processing uses `useState` (async batched update) instead of `useRef` (sync). Under React 18 concurrent renders, the effect can fire twice before the state update commits, inserting a duplicate day.

---

### M-11: `getActiveProgram` doesn't convert `is_starter` to boolean

**File:** `lib/programs.ts:89-103`
**Flow:** Home screen — active program display

Returns raw SQLite `is_starter` as `number` (0 or 1). Any component checking `program.is_starter === true` incorrectly evaluates to `false` when `is_starter` is `1`. Compare with `getProgramById` which correctly maps both fields.

---

### M-12: Non-starter templates shared by reference on program duplicate

**File:** `lib/db/templates.ts:178-185`
**Flow:** Program duplicate

Only starter templates are deep-copied. User-created templates are shared by reference. Editing a template in the duplicated program silently modifies the original program's template.

---

### M-13: Unlink functions skip template timestamp update

**File:** `lib/db/templates.ts:316-362`
**Flow:** Template edit — unlink superset

Neither `unlinkExerciseGroup` nor `unlinkSingleExercise` updates `workout_templates.updated_at`. Every other mutation function does. Any "last modified" display shows stale dates.

---

### M-14: No error handling on async DB operations in UI effects

**Files:** `app/template/create.tsx:65-69`, `app/template/[id].tsx:84-86`, `app/program/create.tsx:70`
**Flow:** All template/program flows

None of the `useEffect` async calls have try/catch. A DB failure produces an unhandled promise rejection with no user feedback.

---

### M-15: Active program can have all days removed

**File:** `app/program/[id].tsx:108-111`
**Flow:** Program detail — remove days

No guard prevents removal of the last day from an active program. The program remains active with no valid next workout.

---

### M-16: `getPreviousSets` returns sets from ALL sessions, not just the most recent

**File:** `lib/db/sessions.ts:214-231`
**Flow:** Workout session — auto-fill from previous

The query returns every completed set for an exercise across all sessions ordered by `completed_at DESC`. The `.find()` grabs the first match, which may be from a different session than the most recent one, producing cross-session "previous" data.

---

### M-17: Concurrent `handleUpdate` calls cause data races in workout session

**File:** `app/session/[id].tsx:283-299`
**Flow:** Workout session — rapidly edit weight/reps

Each keystroke triggers `updateSet` then `load()`. If the user types quickly, the second call reads stale `set.reps` from before the first `load()` completes, causing one field to reset the other.

---

### M-18: Suggestion chip applies updates without awaiting, causing race conditions

**File:** `app/session/[id].tsx:751-763`
**Flow:** Workout session — tap suggestion

Loops over incomplete sets calling `handleUpdate` without `await`. Each call triggers `load()` internally. Subsequent calls operate on stale data.

---

### M-19: Undo after nutrition delete re-inserts with a new ID

**File:** `app/(tabs)/nutrition.tsx:100-108`
**Flow:** Nutrition — delete then undo

The undo calls `addDailyLog` which creates a brand-new row with a new UUID. The original `log.id` and `logged_at` timestamp are lost.

---

### M-20: Rapid nutrition deletes lose undo history

**File:** `app/(tabs)/nutrition.tsx:87-98`
**Flow:** Nutrition — delete two entries quickly

Deleting food A then quickly food B overwrites `deleted.current`. The undo for food A is permanently lost.

---

### M-21: Schedule screen uses `useEffect` instead of `useFocusEffect`

**File:** `app/schedule/index.tsx:48-50`
**Flow:** Schedule — return after creating template

Data only loads once on mount. If a user creates a template and comes back, the schedule still shows the old state.

---

### M-22: CSV export shares empty file when no data exists

**File:** `app/(tabs)/settings.tsx:160-177`
**Flow:** Settings — export CSV with no data

When `rows.length === 0`, the snack "No data to export" is shown but execution continues (missing `return`). An empty CSV file is shared via the OS share dialog. Affects all 4 CSV export functions.

---

## Minor Bugs (22)

| # | File | Flow | Description |
|---|------|------|-------------|
| m-01 | `recommend.tsx:31` | Onboarding | `saving` flag never reset on success path |
| m-02 | `recommend.tsx:51-57` | Onboarding | `skip()` has no double-tap guard |
| m-03 | `setup.tsx:12` | Onboarding | Canada incorrectly defaults to imperial (lb/in) |
| m-04 | `exercises.tsx:70` | Exercise library | Detail fetch has no `.catch()` handler |
| m-05 | `exercises.tsx:25` | Exercise library | `getItemLayout` assumes fixed 84px but items have variable height |
| m-06 | `[id].tsx:155` | Exercise detail | `setTimeout(() => router.back(), 400)` timer not cleaned up on unmount |
| m-07 | `create.tsx:18` | Exercise create | Same uncleaned timeout pattern |
| m-08 | `[id].tsx:115` | Exercise detail | No `.catch()` on exercise fetch |
| m-09 | `exercises.ts:26-27` | DB layer | `JSON.parse` on muscle data with no try/catch — corrupted data crashes entire library |
| m-10 | `exercises.ts:61` | DB layer | No duplicate name check for custom exercises |
| m-11 | `program/create.tsx:85-88` | Program create | Program saved with zero days (no validation) |
| m-12 | `pick-exercise.tsx:66-70` | Session | Mid-session exercise add is not transactional (3 separate `addSet`) |
| m-13 | `programs.ts:196-224` | Program | `removeProgramDay` orphans `program_log` entries |
| m-14 | `programs.ts:289-301` | Program | Cycle count inaccurate when days are added/removed |
| m-15 | `session/[id].tsx:164` | Session | `exerciseIds.sort()` mutates array in place |
| m-16 | `sessions.ts:47-61` | Session | `completeSession` always overwrites notes with `""` |
| m-17 | `nutrition.tsx:332-339` | Nutrition | Snackbar "Undo" action shows for non-undoable actions (log, not delete) |
| m-18 | `nutrition.ts:40-56` | Nutrition | Duplicate `food_entries` created every time same food is logged |
| m-19 | `nutrition/targets.tsx:29-33` | Nutrition | Invalid input silently replaced with defaults |
| m-20 | `progress.tsx:200-204` | Body tracking | `loadMore` stale closure produces duplicate entries |
| m-21 | `body/measurements.tsx:81` | Body tracking | `useFocusEffect` with empty deps never refreshes on unit change |
| m-22 | `import-export.ts:115-123` | Settings | Import field names (`set_rpe`/`set_notes`) don't match export (`rpe`/`notes`) |

---

## Cosmetic Issues (8)

| # | File | Description |
|---|------|-------------|
| c-01 | `recommend.tsx:15` | Non-null assertion `!` on starter template lookup could crash if IDs change |
| c-02 | `setup.tsx` | Preferences not persisted before navigating to recommend screen |
| c-03 | `program/[id].tsx:8` | Unused import: `AccessibilityInfo` |
| c-04 | `program/[id].tsx:113-121` | `renderItem` and callbacks not memoized (perf) |
| c-05 | `progress.tsx:300` | PRs hardcoded to "kg" regardless of user unit preference |
| c-06 | `progress.tsx:263` | Weekly Volume label hardcoded to "(kg)" |
| c-07 | `progress.tsx:435` | Weight delta color reversed for weight-gain goals |
| c-08 | `index.tsx:133` | `effectiveSegment` overrides user's tab selection when program is active |

---

## Top 10 Bugs to Fix First

| Priority | ID | Summary | Impact |
|----------|----|---------|--------|
| 1 | C-01 | `router.replace()` duplicate screen (reported bug) | User-facing: exercise/day appears deleted after "Done" |
| 2 | C-07 | Export/import version mismatch | All data export/import is broken |
| 3 | C-08/C-09 | Nutrition logged to wrong date | All food tracking data integrity compromised |
| 4 | C-04 | Template name edits silently lost | User data loss |
| 5 | C-02/C-03 | Position collisions on add | Duplicate positions corrupt template/program ordering |
| 6 | M-17/M-18 | Concurrent update races in workout session | Active workout data corruption |
| 7 | M-01 | Beginner onboarding does nothing | First-time experience broken |
| 8 | C-05/C-06 | Missing transactions in reorder/delete | Data integrity on crash |
| 9 | M-03 | ExerciseForm always saves empty instructions | Data loss on exercise edit |
| 10 | C-10 | Optimistic delete race in body weight | UI/DB desync |

---

## Test Infrastructure Notes

- **Existing tests:** 516 pass across 38 test suites (unit, acceptance, flow tests)
- **Helper issues:** `__tests__/helpers/mocks.ts` has a Jest variable scoping error (`router` not prefixed with `mock`); `factories.ts` and `render.tsx` are picked up as test suites but contain no tests
- **E2e tests:** Playwright specs in `e2e/` fail to run under Jest (wrong test runner)
- **Coverage gaps:** No acceptance tests exist for template create/edit, program create/edit, workout session, body tracking, schedule, or tools flows
