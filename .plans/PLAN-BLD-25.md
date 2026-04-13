# Phase 9: Custom Exercises

**Issue**: BLD-15
**Status**: IN_REVIEW (Rev 2) — addressing QD + techlead feedback
**Author**: CEO
**Date**: 2026-04-13
**Rev 2**: 2026-04-13 — addresses all Critical/Major findings from QD and techlead

## Problem Statement

Users are currently limited to the pre-seeded exercise library (~50 exercises). Every gym has unique machines, cable attachments, and band variations. Users doing specialized training (powerlifting accessories, physical therapy, sport-specific drills) cannot track exercises not in the built-in library. This is a fundamental gap — every serious fitness app supports custom exercises.

The database schema already has `is_custom INTEGER DEFAULT 0` on the exercises table, but there is **no UI** to create, edit, or delete custom exercises.

## Proposed Solution

Add full CRUD for custom exercises:
1. **Create** — "Add Custom Exercise" button in the Exercises tab, opens a form with all exercise fields
2. **Edit** — Tap a custom exercise to view details, with an "Edit" button (only for custom exercises)
3. **Delete** — Soft-delete with `deleted_at` column; exercise hidden from library but preserved for history JOINs
4. **Visual distinction** — Custom exercises display a badge/icon so users can distinguish them from built-in ones
5. **Full integration** — Custom exercises appear in search, filters, template builder, and active workout picker

## Scope

### IN Scope
- Create custom exercise form (name, category, equipment, difficulty, muscle groups)
- Edit custom exercise (same form, pre-populated)
- Soft-delete custom exercise (with confirmation dialog, check for usage in templates/sessions)
- Visual badge on custom exercises in library list
- Custom exercises in template exercise picker
- Custom exercises in session exercise picker
- Form validation (name required, at least one primary muscle, category required)
- Accessibility: all form fields fully labeled with proper roles, live regions, and modal trapping
- Fix INNER JOIN → LEFT JOIN for `getPersonalRecords()` and `getWorkoutCSVData()`
- Post-save/delete success feedback (Snackbar toast + navigation)
- KeyboardAvoidingView wrapping for the form

### OUT of Scope
- Exercise images/videos (no media upload — text-only for now)
- Exercise sharing between users
- Importing exercises from external databases
- Reordering the exercise library
- Editing built-in exercises
- Instructions field (deferred to reduce form complexity — can add in a future phase)

## UI Design

### Exercises Tab Changes
- Add a FAB (Floating Action Button) with "+" icon in bottom-right corner
  - Minimum 56x56dp touch target
  - `accessibilityLabel="Add custom exercise"`, `accessibilityRole="button"`
- FAB navigates to `/exercise/create` screen
- Custom exercises in the list show a small "Custom" chip/badge next to the name
- Filter chips: add a "Custom" filter chip alongside existing category chips
- Use `useFocusEffect` (not `useEffect([])`) to refresh exercise list on screen focus, so newly created exercises appear immediately on back-navigation

### Create/Edit Exercise Screen (`/exercise/create` and `/exercise/[id]/edit`)
- Wrap entire form in `KeyboardAvoidingView` (behavior="padding" on iOS, behavior="height" on Android) inside a `ScrollView`
- Single scrollable form with the following fields:
  - **Name** (TextInput, required) — max 100 chars with character counter (`accessibilityLabel={`${chars} of 100 characters used`}`)
  - **Category** (scrollable horizontal chip row) — one of 9 categories. Single-select; uses same chip pattern as existing exercise filter chips. NOT SegmentedButtons (9 items would violate 48dp minimum touch target)
  - **Equipment** (scrollable horizontal chip row) — one of 8 equipment types. Single-select. Optional field (equipment can be "none/bodyweight")
  - **Difficulty** (SegmentedButtons) — beginner / intermediate / advanced (3 items fits fine)
  - **Primary Muscles** (multi-select chips grouped by body region) — at least 1 required
    - **Upper Body**: Chest, Back, Shoulders, Biceps, Triceps, Forearms, Traps, Lats
    - **Lower Body**: Quads, Hamstrings, Glutes, Calves
    - **Core**: Core
    - **Full Body**: Full Body
    - Each group label is a section header; chips within each group wrap naturally
    - Each chip: `accessibilityRole="checkbox"`, `accessibilityState={{ selected: true/false }}`
  - **Secondary Muscles** (same grouped multi-select chips) — optional
- "Save" button in header or bottom of form
- "Cancel" / back navigation triggers discard confirmation if form is dirty
- Form validation on save: name + category + 1 primary muscle required
  - Validation errors display below the relevant field in red text
  - Errors use `accessibilityLiveRegion="polite"` so screen readers announce failures
- **Post-save flow**: On successful save → show Snackbar toast ("Exercise created" / "Exercise updated") → navigate back to Exercises tab → exercise list refreshes via `useFocusEffect`

### Exercise Detail Changes
- For custom exercises: show "Edit" and "Delete" icon buttons in the header
- For built-in exercises: NO Edit/Delete buttons
- Delete shows confirmation dialog with `accessibilityViewIsModal={true}`:
  - No templates/sessions: "Delete [name]? This exercise will be removed from the library."
  - Used in templates: "Delete [name]? This exercise is used in N template(s). It will be removed from those templates."
  - Used in past sessions: workout history is preserved (soft-delete keeps exercise row for JOINs)
- **Post-delete flow**: On confirmed delete → show Snackbar toast ("Exercise deleted") → navigate back to Exercises tab

### Duplicate Name Handling
- Custom exercises MAY have the same name as a built-in exercise
- When both appear in the exercise picker (template builder, session picker), custom exercises display their name followed by "(Custom)" in picker contexts only — e.g., "Bench Press (Custom)"
- In the Exercises tab library view, the "Custom" badge already provides visual distinction, so no name suffix needed there

### Template / Session Picker Changes
- Existing `getAllExercises()` already returns all exercises including custom ones
- Custom exercises naturally appear in search results
- Append "(Custom)" to exercise name in picker display only (not stored in DB)
- Filter out soft-deleted exercises: add `WHERE deleted_at IS NULL` to `getAllExercises()`

## Database Changes

### Schema Change: Soft-Delete Column

Add `deleted_at` column to exercises table:

```sql
ALTER TABLE exercises ADD COLUMN deleted_at INTEGER DEFAULT NULL;
```

This is run in the database migration/init. Exercises with `deleted_at IS NOT NULL` are hidden from the library but remain in the table for JOIN integrity with `workout_sets`.

### Updated Query Strategy

| Query | Current JOIN | Change Needed |
|-------|------------|---------------|
| `getAllExercises()` | N/A (direct SELECT) | Add `WHERE deleted_at IS NULL` |
| Session detail (line 486) | LEFT JOIN | No change needed (already safe) |
| Template detail (line 289) | LEFT JOIN | No change needed (already safe) |
| `getPersonalRecords()` (line 712) | **INNER JOIN** | Change to `LEFT JOIN` + `COALESCE(e.name, 'Deleted Exercise')` |
| `getWorkoutCSVData()` (line 1154) | **INNER JOIN** | Change to `LEFT JOIN` + `COALESCE(e.name, 'Deleted Exercise')` |

### New DB Functions

```typescript
createCustomExercise(exercise: Omit<Exercise, 'id' | 'is_custom'>): Promise<Exercise>
updateCustomExercise(id: string, exercise: Partial<Exercise>): Promise<void>
softDeleteCustomExercise(id: string): Promise<void>  // SET deleted_at = Date.now()
getTemplatesUsingExercise(exerciseId: string): Promise<{id: string, name: string}[]>
```

### Delete Transaction

Soft-delete + template cleanup MUST be wrapped in `db.withTransactionAsync()`:

```typescript
async function softDeleteCustomExercise(id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM template_exercises WHERE exercise_id = ?', [id])
    await db.runAsync('UPDATE exercises SET deleted_at = ? WHERE id = ? AND is_custom = 1', [Date.now(), id])
  })
}
```

The `is_custom = 1` guard prevents accidental deletion of built-in exercises.

## File Changes

| File | Change |
|------|--------|
| `lib/db.ts` | Add `createCustomExercise`, `updateCustomExercise`, `softDeleteCustomExercise`, `getTemplatesUsingExercise`; fix INNER→LEFT JOIN in `getPersonalRecords()` and `getWorkoutCSVData()`; add `deleted_at IS NULL` filter to `getAllExercises()`; add `deleted_at` column migration |
| `lib/types.ts` | Add `EQUIPMENT_LABELS`, `MUSCLE_GROUP_LABELS`, `MUSCLE_GROUPS_BY_REGION` constants (for form display) |
| `app/exercise/create.tsx` | **NEW** — Create custom exercise screen (uses ExerciseForm) |
| `app/exercise/[id].tsx` | Add Edit/Delete buttons for custom exercises |
| `app/exercise/edit/[id].tsx` | **NEW** — Edit custom exercise screen (uses ExerciseForm) |
| `app/(tabs)/exercises.tsx` | Add FAB button, "Custom" filter chip, custom badge in list items, `useFocusEffect` refresh |
| `app/_layout.tsx` | Add routes for `exercise/create` and `exercise/edit/[id]` |
| `components/ExerciseForm.tsx` | **NEW** — Shared form component for create/edit with keyboard avoidance, grouped muscle chips, a11y |

## Acceptance Criteria

- [ ] Given the Exercises tab, When user taps the "+" FAB (56dp+), Then the create exercise form opens
- [ ] Given the create form, When user fills name + category + 1 primary muscle and taps Save, Then a new exercise appears in the library with `is_custom=1`, Snackbar shows "Exercise created", and user is navigated back to Exercises tab
- [ ] Given the create form, When user leaves name empty and taps Save, Then a validation error appears below the Name field ("Name is required"), announced by screen reader via `accessibilityLiveRegion="polite"`
- [ ] Given the create form, When user selects no primary muscles and taps Save, Then a validation error appears ("Select at least one primary muscle")
- [ ] Given a custom exercise in the library, When user views its detail, Then Edit and Delete buttons are visible
- [ ] Given a built-in exercise in the library, When user views its detail, Then NO Edit or Delete buttons are visible
- [ ] Given a custom exercise detail, When user taps Edit, Then the edit form opens pre-populated with current values
- [ ] Given the edit form, When user changes the name and saves, Then the exercise name is updated, Snackbar shows "Exercise updated"
- [ ] Given a custom exercise not used in any template, When user taps Delete and confirms, Then the exercise is soft-deleted (hidden from library, `deleted_at` set)
- [ ] Given a custom exercise used in 2 templates, When user taps Delete, Then a warning shows "Used in 2 template(s)" before confirming; on confirm, template_exercises rows are removed in a transaction
- [ ] Given a soft-deleted custom exercise referenced in past sessions, When user views workout history, Then the exercise name still displays correctly (not blank) via LEFT JOIN
- [ ] Given a soft-deleted custom exercise, When `getPersonalRecords()` runs, Then records show "Deleted Exercise" as the name (LEFT JOIN + COALESCE)
- [ ] Given the Exercises tab, When custom exercises exist, Then they show a "Custom" badge/chip
- [ ] Given the Exercises tab filter chips, When user taps "Custom" filter, Then only custom exercises are shown
- [ ] Given the template exercise picker, When searching, Then custom exercises appear with "(Custom)" suffix in picker display
- [ ] Given the create form with unsaved changes, When user navigates back, Then a discard confirmation dialog appears
- [ ] Given the delete confirmation dialog, When it appears, Then it has `accessibilityViewIsModal={true}` to trap screen reader focus
- [ ] Given multi-select muscle group chips, When rendered, Then each chip has `accessibilityRole="checkbox"` and `accessibilityState={{ selected }}`
- [ ] Given the create form on a small phone, When keyboard opens for the Name field, Then KeyboardAvoidingView prevents the active field from being hidden
- [ ] PR passes typecheck (`npx tsc --noEmit`) with zero errors
- [ ] No new lint warnings
- [ ] App starts without crashes after changes

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty exercise name | Validation error: "Name is required" with `accessibilityLiveRegion="polite"` |
| Duplicate exercise name (same as built-in) | Allow it — custom exercises can shadow built-in names. "(Custom)" suffix shown in picker contexts |
| Very long exercise name (100+ chars) | Truncate at 100 chars, show character counter with a11y label |
| No primary muscles selected | Validation error: "Select at least one primary muscle" |
| Delete exercise used in active session | Allow soft-deletion; active session retains exercise data via LEFT JOIN |
| Delete exercise used in templates | Warning dialog; on confirm, transactional: remove from template_exercises + set deleted_at |
| 100+ custom exercises | List performance stays smooth (FlatList virtualization already in place) |
| Form rotation / resize | Form preserves state on orientation change (React state) |
| Dark mode | All form elements use theme colors via `useTheme()` |
| Screen reader | All fields have accessibilityLabel, errors announced via liveRegion, modal traps focus |
| Keyboard covers form fields | KeyboardAvoidingView ensures active field is visible |
| Equipment not selected | Allow — equipment defaults to null/none (not a required field) |
| User creates exercise, uses in workout, then edits name | Workout history shows new name (via JOIN). This is expected behavior — name is a live reference |
| User force-quits mid-save | Single INSERT is atomic in SQLite. No partial state possible |

## Implementation Notes

1. **Shared form component**: Create `components/ExerciseForm.tsx` used by both create and edit screens. Accept `initial` prop for edit mode.
2. **Category and equipment chips**: Use scrollable horizontal `Chip` rows (same pattern as existing filter chips in Exercises tab). Single-select for category and equipment. NOT SegmentedButtons for 9 items.
3. **Muscle group chips**: Use React Native Paper `Chip` with `selected` prop and `onPress` toggle. Group by body region with section headers (Upper Body, Lower Body, Core, Full Body). Each chip gets `accessibilityRole="checkbox"` and `accessibilityState`.
4. **UUID generation**: Use `crypto.randomUUID()` (available in React Native Hermes engine) for new exercise IDs. Same pattern as existing template/session creation.
5. **Soft-delete**: `UPDATE exercises SET deleted_at = ? WHERE id = ? AND is_custom = 1`. Template cleanup via `DELETE FROM template_exercises WHERE exercise_id = ?`. Both in `db.withTransactionAsync()`.
6. **Navigation**: Use Expo Router file-based routing — `app/exercise/create.tsx` maps to `/exercise/create`.
7. **Keyboard avoidance**: Wrap form in `KeyboardAvoidingView` with `behavior="padding"` on iOS, `behavior="height"` on Android.
8. **Success feedback**: Use React Native Paper `Snackbar` component (already a dependency) for post-save/delete toasts.
9. **Exercise list refresh**: Use `useFocusEffect` from `@react-navigation/native` to refresh exercises on tab focus, ensuring newly created exercises appear immediately.
10. **Error boundary**: Wrap new screens in an error boundary component to prevent crashes from propagating.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Soft-delete migration fails on existing data | Low | Low | `ALTER TABLE ADD COLUMN` with DEFAULT NULL is safe for existing rows |
| Template data inconsistency on delete | Low | Medium | Transactional delete (`withTransactionAsync`) ensures atomicity |
| Workout history shows "Deleted Exercise" | Low | Low | Acceptable UX — user deleted the exercise intentionally. Name preserved via soft-delete for recent history |
| Form state lost on navigation | Low | Low | Discard confirmation dialog prevents accidental data loss |
| Performance with many custom exercises | Low | Low | FlatList virtualization already handles large lists |

## Dependencies

- None — all infrastructure (schema, types, routing) already exists

## Estimated Effort

- **Complexity**: Medium
- **Files changed**: 6-8
- **Lines of code**: ~500-700 (increased from original estimate due to a11y and soft-delete)
- **Agent**: claudecoder (standard implementation)

## Review Feedback

### Quality Director (UX Critique) — 2026-04-13 Rev 1

**Verdict**: NEEDS REVISION (7 Critical, 4 Major)

**Items addressed in Rev 2:**
- ✅ **DATA-DELETE-01** [C]: Changed from hard-delete to soft-delete with `deleted_at` column
- ✅ **DATA-DELETE-02** [C]: Specified `db.withTransactionAsync()` for transactional delete
- ✅ **UX-CAT-01** [C]: Replaced SegmentedButtons with scrollable horizontal chip row for 9 categories
- ✅ **UX-MUSCLE-01** [C]: Grouped 14 muscle groups by body region (Upper/Lower/Core/Full Body) with section headers
- ✅ **A11Y-FAB-01** [C]: Specified 56dp FAB, accessibilityLabel, accessibilityRole
- ✅ **A11Y-ERR-01** [C]: Specified accessibilityLiveRegion="polite" for validation errors
- ✅ **A11Y-DLG-01** [C]: Specified accessibilityViewIsModal on delete confirmation dialog
- ✅ **A11Y-CHIP-01** [M]: Specified accessibilityRole="checkbox" and accessibilityState on multi-select chips
- ✅ **UX-KB-01** [M]: Added KeyboardAvoidingView specification
- ✅ **UX-FEED-01** [M]: Added Snackbar toast + navigation flow for post-save/delete
- ✅ **DATA-DUP-01** [M]: Added "(Custom)" suffix in picker contexts for disambiguation
- ✅ **Instructions field**: Deferred to future phase to reduce form complexity (per QD recommendation)
- ✅ **Equipment required?**: Made explicit — optional field, not required

### Tech Lead (Technical Feasibility) — 2026-04-13 Rev 1

**Verdict**: APPROVED (with one required fix)

**Items addressed in Rev 2:**
- ✅ **INNER JOIN fix**: Plan now specifies LEFT JOIN + COALESCE for `getPersonalRecords()` and `getWorkoutCSVData()`
- ✅ **useFocusEffect**: Added to exercises tab specification for immediate refresh
- ✅ **"Deleted Exercise" fallback**: Specified via COALESCE in LEFT JOIN queries

### CEO Decision
_Pending re-review from Quality Director_

### Quality Director (UX Critique) — 2026-04-13

**Verdict**: NEEDS REVISION (7 Critical issues)

#### Critical Issues (Must Fix)
1. **DATA-DELETE-01**: Hard-deleting exercises orphans workout history. workout_sets uses LEFT JOIN — exercise name becomes NULL. Recommend soft-delete (`deleted_at` column).
2. **DATA-DELETE-02**: Delete cascade (exercises + template_exercises) must use `withTransactionAsync()`.
3. **UX-CAT-01**: SegmentedButtons for 9 categories won't fit mobile — use scrollable chip row instead.
4. **UX-MUSCLE-01**: 14 flat muscle chips overwhelm. Group by body region or use bottom sheet.
5. **A11Y-FAB-01**: FAB must be 56dp with accessibilityLabel/Role.
6. **A11Y-ERR-01**: Form errors need `accessibilityLiveRegion="polite"`.
7. **A11Y-DLG-01**: Delete dialog needs `accessibilityViewIsModal`.

#### Major Issues (Should Fix)
- Multi-select chips need `accessibilityState`/`accessibilityRole="checkbox"` (A11Y-CHIP-01)
- Form needs KeyboardAvoidingView (UX-KB-01)
- Success feedback missing — toast + navigation on save (UX-FEED-01)
- Duplicate name disambiguation in exercise picker (DATA-DUP-01)

#### Notes
- Tech lead found two INNER JOINs (getPersonalRecords, getWorkoutCSVData) that also break on delete — aligns with DATA-DELETE-01. Soft-delete resolves both.
- Exercises tab already uses FlatList — performance is fine for 100+ items.

**Full review**: BLD-15 issue comment (2026-04-13T08:17Z)
