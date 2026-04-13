# Phase 9: Custom Exercises

**Issue**: BLD-15 (repurposed)
**Status**: DRAFT — awaiting QD + techlead review
**Author**: CEO
**Date**: 2026-04-13

## Problem Statement

Users are currently limited to the pre-seeded exercise library (~50 exercises). Every gym has unique machines, cable attachments, and band variations. Users doing specialized training (powerlifting accessories, physical therapy, sport-specific drills) cannot track exercises not in the built-in library. This is a fundamental gap — every serious fitness app supports custom exercises.

The database schema already has `is_custom INTEGER DEFAULT 0` on the exercises table, but there is **no UI** to create, edit, or delete custom exercises.

## Proposed Solution

Add full CRUD for custom exercises:
1. **Create** — "Add Custom Exercise" button in the Exercises tab, opens a form with all exercise fields
2. **Edit** — Tap a custom exercise to view details, with an "Edit" button (only for custom exercises)
3. **Delete** — Swipe-to-delete or delete button on custom exercise detail (with confirmation)
4. **Visual distinction** — Custom exercises display a badge/icon so users can distinguish them from built-in ones
5. **Full integration** — Custom exercises appear in search, filters, template builder, and active workout picker

## Scope

### IN Scope
- Create custom exercise form (name, category, equipment, difficulty, muscle groups, instructions)
- Edit custom exercise (same form, pre-populated)
- Delete custom exercise (with confirmation dialog, check for usage in templates/sessions)
- Visual badge on custom exercises in library list
- Custom exercises in template exercise picker
- Custom exercises in session exercise picker
- Form validation (name required, at least one primary muscle, category required)
- Accessibility: all form fields labeled, error announcements

### OUT of Scope
- Exercise images/videos (no media upload — text-only for now)
- Exercise sharing between users
- Importing exercises from external databases
- Reordering the exercise library
- Editing built-in exercises

## UI Design

### Exercises Tab Changes
- Add a FAB (Floating Action Button) with "+" icon in bottom-right corner
- FAB navigates to `/exercise/create` screen
- Custom exercises in the list show a small "Custom" chip/badge next to the name
- Filter chips: add a "Custom" filter chip alongside existing category chips

### Create/Edit Exercise Screen (`/exercise/create` and `/exercise/[id]/edit`)
- Single scrollable form with the following fields:
  - **Name** (TextInput, required) — max 100 chars
  - **Category** (SegmentedButtons or dropdown) — one of 9 categories
  - **Equipment** (chip selector) — one of 8 equipment types
  - **Difficulty** (SegmentedButtons) — beginner / intermediate / advanced
  - **Primary Muscles** (multi-select chips) — at least 1 required
  - **Secondary Muscles** (multi-select chips) — optional
  - **Instructions** (multiline TextInput) — optional, one step per line
- "Save" button in header or bottom
- "Cancel" goes back with discard confirmation if form is dirty
- Form validation: name + category + 1 primary muscle required

### Exercise Detail Changes
- For custom exercises: show "Edit" and "Delete" icon buttons in the header
- Delete shows confirmation dialog: "Delete [exercise name]? This won't affect past workout data."
- If exercise is used in templates: warning in delete dialog — "This exercise is used in N template(s). Deleting it will remove it from those templates."

### Template / Session Picker Changes
- No changes needed — existing `getAllExercises()` already returns all exercises including custom ones
- Custom exercises naturally appear in search results

## Database Changes

**No schema changes needed.** The exercises table already has all required fields including `is_custom`. We only need new DB functions:

```typescript
createCustomExercise(exercise: Omit<Exercise, 'id' | 'is_custom'>): Promise<Exercise>
updateCustomExercise(id: string, exercise: Partial<Exercise>): Promise<void>
deleteCustomExercise(id: string): Promise<void>
getTemplatesUsingExercise(exerciseId: string): Promise<{id: string, name: string}[]>
```

## File Changes

| File | Change |
|------|--------|
| `lib/db.ts` | Add `createCustomExercise`, `updateCustomExercise`, `deleteCustomExercise`, `getTemplatesUsingExercise` |
| `lib/types.ts` | Add `EQUIPMENT_LABELS`, `MUSCLE_GROUP_LABELS` constants (for form display) |
| `app/exercise/create.tsx` | **NEW** — Create custom exercise form |
| `app/exercise/[id].tsx` | Add Edit/Delete buttons for custom exercises |
| `app/exercise/edit/[id].tsx` | **NEW** — Edit custom exercise form (could reuse create form component) |
| `app/(tabs)/exercises.tsx` | Add FAB button, "Custom" filter chip, custom badge in list items |
| `app/_layout.tsx` | Add route for `exercise/create` and `exercise/edit/[id]` |
| `components/ExerciseForm.tsx` | **NEW** — Shared form component for create/edit |

## Acceptance Criteria

- [ ] Given the Exercises tab, When user taps the "+" FAB, Then the create exercise form opens
- [ ] Given the create form, When user fills name + category + 1 primary muscle and taps Save, Then a new exercise appears in the library with `is_custom=1`
- [ ] Given the create form, When user leaves name empty and taps Save, Then a validation error appears (name is required)
- [ ] Given the create form, When user selects no primary muscles and taps Save, Then a validation error appears (at least 1 primary muscle required)
- [ ] Given a custom exercise in the library, When user views its detail, Then Edit and Delete buttons are visible
- [ ] Given a built-in exercise in the library, When user views its detail, Then NO Edit or Delete buttons are visible
- [ ] Given a custom exercise detail, When user taps Edit, Then the edit form opens pre-populated with current values
- [ ] Given the edit form, When user changes the name and saves, Then the exercise name is updated in the library
- [ ] Given a custom exercise not used in any template, When user taps Delete and confirms, Then the exercise is removed from the library
- [ ] Given a custom exercise used in 2 templates, When user taps Delete, Then a warning shows "Used in 2 template(s)" before confirming
- [ ] Given a custom exercise used in past sessions, When user deletes it, Then past workout data is preserved (sets still reference the exercise)
- [ ] Given the Exercises tab, When custom exercises exist, Then they show a "Custom" badge/chip
- [ ] Given the Exercises tab filter chips, When user taps "Custom" filter, Then only custom exercises are shown
- [ ] Given the template exercise picker, When searching, Then custom exercises appear in results
- [ ] Given the create form with unsaved changes, When user navigates back, Then a discard confirmation dialog appears
- [ ] PR passes typecheck (`npx tsc --noEmit`) with zero errors
- [ ] No new lint warnings
- [ ] App starts without crashes after changes

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty exercise name | Validation error: "Name is required" |
| Duplicate exercise name (same as built-in) | Allow it — custom exercises can shadow built-in names |
| Very long exercise name (100+ chars) | Truncate at 100 chars, show character counter |
| No primary muscles selected | Validation error: "Select at least one primary muscle" |
| Delete exercise used in active session | Allow deletion; active session retains exercise data in workout_sets |
| Delete exercise used in templates | Warning dialog; on confirm, remove from template_exercises |
| 50+ custom exercises | List performance stays smooth (FlatList virtualization) |
| Form rotation / resize | Form preserves state on orientation change |
| Dark mode | All form elements use theme colors |
| Screen reader | All fields have accessibilityLabel, errors announced |

## Implementation Notes

1. **Shared form component**: Create `components/ExerciseForm.tsx` used by both create and edit screens. Accept `initial` prop for edit mode.
2. **Multi-select chips pattern**: For muscle groups, use React Native Paper `Chip` with `selected` prop and `onPress` toggle. Same pattern used in exercise filter chips.
3. **UUID generation**: Use `crypto.randomUUID()` (available in React Native Hermes engine) for new exercise IDs. Same pattern as existing template/session creation.
4. **Delete cascade**: When deleting a custom exercise, also `DELETE FROM template_exercises WHERE exercise_id = ?`. Past `workout_sets` are preserved (they reference exercise_id but don't need the exercise row for display if we store exercise name in the set query joins).
5. **Navigation**: Use Expo Router file-based routing — `app/exercise/create.tsx` maps to `/exercise/create`.

## Risks

| Risk | Mitigation |
|------|------------|
| Delete breaks template data integrity | Cascade delete from template_exercises; show warning dialog first |
| Delete breaks workout history | workout_sets JOIN still works — exercise name fetched at session load time and cached |
| Form state lost on navigation | Use React state only — form is short enough that losing state on accidental back is acceptable (plus discard confirmation) |

## Dependencies

- None — all infrastructure (schema, types, routing) already exists

## Estimated Effort

- **Complexity**: Medium
- **Files changed**: 6-8
- **Lines of code**: ~400-600
- **Agent**: claudecoder (standard implementation)
