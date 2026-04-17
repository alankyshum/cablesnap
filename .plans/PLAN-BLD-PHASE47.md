# Feature Plan: Template Exercise Editing (Phase 47)

**Issue**: BLD-270 (PLAN)
**Author**: CEO
**Date**: 2026-04-17
**Status**: APPROVED

## Problem Statement

Users cannot edit template exercise parameters (target sets, target reps, rest time) after adding an exercise to a template. The only workaround is to delete the exercise and re-add it with different values, which also loses the exercise's position, superset grouping (`link_id`), and link label.

This is a fundamental UX gap: the `updateTemplateExercise()` database function exists but has no UI entry point. Every user who creates a template and later wants to adjust their sets/reps must delete and re-add — a frustrating multi-step process that loses context.

## User Stories

- As a lifter, I want to tap an exercise in my template to adjust target sets, reps, and rest time without removing it
- As a lifter editing a template, I want to see the current values pre-filled so I can make quick adjustments
- As a lifter, I want my superset groupings and position preserved when I edit exercise parameters

## Proposed Solution

### Overview

Add a tap handler on template exercise rows that opens a lightweight `EditExerciseSheet` overlay (using `Portal` + positioned `View` — following the established `ExercisePickerSheet` pattern). The sheet shows the current target sets, target reps, and rest seconds. User edits and saves. Superset groupings, position, and link labels are preserved.

### UX Design

#### Template Detail Screen (app/template/[id].tsx)

**Approach: Tap to open edit sheet**

When a user taps an exercise row (not in superset selection mode):
- An `EditExerciseSheet` overlay appears (via `Portal` + positioned `View`) showing:
  - Exercise name (read-only, as title)
  - **Target Sets**: Numeric text input with `keyboardType="numeric"` (pre-filled, default fallback: 3)
  - **Target Reps**: Text input supporting range format like "8-12" (pre-filled, default fallback: "8-12")
  - **Rest Time**: Numeric text input with `keyboardType="numeric"`, in seconds (pre-filled, default fallback: 90)
  - **Save** button and **Cancel** / dismiss
- On save: calls `Keyboard.dismiss()`, then `updateTemplateExercise(templateExerciseId, templateId, sets, reps, rest)`, then refreshes the list
- Position, link_id, link_label, and exercise_id are NOT changed

**Visual edit affordance:** Each exercise row shows a small pencil icon (or subtle "Edit" text cue) to indicate tappability, improving feature discoverability. The tap target covers the entire row left of any action buttons.

**Input specifications:**
- Target Sets: integer ≥ 1, default fallback 3. `keyboardType="numeric"`.
- Target Reps: free text to support "8-12", "5", "AMRAP", etc. Default fallback "8-12".
- Rest Seconds: integer ≥ 0. `keyboardType="numeric"`. Default fallback 90.

**Interaction with existing gestures:**
- **Tap** (not in selection mode): opens edit sheet (NEW)
- **Long-press**: enters superset selection mode (EXISTING — unchanged)
- **Swipe left**: delete exercise (EXISTING — unchanged)

**Accessibility:**
- Edit sheet inputs have `accessibilityLabel`: "Target sets", "Target reps", "Rest time in seconds"
- Save button: `accessibilityRole="button"`, `accessibilityLabel="Save exercise settings"`
- Minimum touch targets: 56×56dp for all interactive elements (matches existing row minHeight convention)
- Sheet dismissible via back gesture / backdrop tap
- Sheet sets `accessibilityViewIsModal={true}` to trap screen reader focus

**Visual design:**
- New `EditExerciseSheet` component using `Portal` from react-native-paper + positioned `View` overlay (NO `Modal` import — follows `ExercisePickerSheet` pattern)
- Match existing app patterns (Paper `TextInput`, `Button` components)
- All colors from theme tokens

**Error handling:**
- `updateTemplateExercise()` call wrapped in try/catch
- On failure: show Snackbar with "Failed to update exercise settings" message
- Save button shows loading state during save

#### Template Create Screen (app/template/create.tsx)

Same edit capability available here. The create screen persists exercises immediately via DB functions (`createTemplate()` → `addExerciseToTemplate()`, etc.), so `updateTemplateExercise()` can be called directly — same pattern as the detail screen.

### Technical Approach

#### 1. DB Layer Fix Required

`updateTemplateExercise()` exists in `lib/db/templates.ts` (line 303) but has a bug: it does NOT update `workout_templates.updated_at` like every other template mutation does. Fix this by:
- Adding `templateId` parameter to `updateTemplateExercise()`
- Adding `UPDATE workout_templates SET updated_at = datetime('now') WHERE id = ?` in the same transaction

No schema migration needed.

#### 2. New Component: `EditExerciseSheet`

Create `components/EditExerciseSheet.tsx` — a lightweight overlay component following the `ExercisePickerSheet` pattern:
- Uses `Portal` from react-native-paper for rendering above other content
- Positioned `View` overlay (NOT `Modal`) — consistent with BLD-202 constraint
- Props: `visible`, `exercise` (pre-fill data), `onSave`, `onDismiss`
- Internal state for the 3 input fields, initialized from `exercise` prop via `useEffect` watching `visible`
- Validation logic for all fields
- `Keyboard.dismiss()` on save

#### 3. Integration (app/template/[id].tsx)

Add state for the edit sheet:
```ts
const [editing, setEditing] = useState<TemplateExercise | null>(null)
```

On row tap (when not in selection mode):
```ts
onPress={() => { if (!selecting) setEditing(item); }}
```

Sheet pre-fills with `editing.target_sets`, `editing.target_reps`, `editing.rest_seconds` (with null fallbacks: 3, "8-12", 90).

Save handler:
```ts
try {
  await updateTemplateExercise(editing.id, templateId, sets, reps, rest)
  refetch()
  setEditing(null)
} catch (e) {
  showSnackbar('Failed to update exercise settings')
}
```

#### 4. Integration (app/template/create.tsx)

Same `EditExerciseSheet` component, same `updateTemplateExercise()` DB call (create screen persists exercises immediately via DB).

#### 5. Validation

- Target sets: must be ≥ 1 (integer). Show inline error if 0 or negative.
- Target reps: non-empty string. Allow "8-12", "5", "AMRAP", "max".
- Rest seconds: must be ≥ 0 (integer).
- Save button disabled until all validations pass.

### Testing Plan

| Test | Description |
|------|-------------|
| Edit sheet opens on tap | Tap exercise row → sheet appears with pre-filled values |
| Save updates DB | Change values → save → verify updateTemplateExercise called with correct args including templateId |
| updated_at updated | After save, template's updated_at is refreshed |
| Validation | Sets < 1 rejected, empty reps rejected, rest < 0 rejected |
| Null pre-fill defaults | Exercise with null target_reps → pre-fills with "8-12" |
| Position preserved | Edit exercise → position and link_id unchanged |
| Superset mode unaffected | Long-press still enters selection mode |
| Swipe delete unaffected | Swipe left still deletes |
| Create screen edit | Edit exercise on create screen calls updateTemplateExercise() |
| Error handling | DB failure → Snackbar shown, sheet stays open |
| Keyboard dismiss | Save → keyboard dismisses before sheet closes |

### Out of Scope

- Editing exercise itself (swapping to a different exercise) — use the existing Replace flow
- Reordering exercises via drag-and-drop — separate future feature
- Per-exercise set type defaults (e.g., "2 warm-up + 3 working") — deferred
- Editing exercise notes/instructions from the template screen

### Dependencies

- `updateTemplateExercise()` exists but needs `templateId` parameter and `updated_at` fix (included in this phase)

### Risks

| Risk | Mitigation |
|------|------------|
| Tap conflicts with superset selection | Tap only opens edit when NOT in selection mode (long-press enters selection) |
| Overlay pattern | Using `Portal` + positioned `View` (same as `ExercisePickerSheet`) — proven pattern, no `Modal` import |
| Null pre-fill values | Explicit fallback defaults (sets→3, reps→"8-12", rest→90) for any null/undefined values |

### Estimated Complexity

- **Schema**: None
- **DB layer**: Minor fix (add templateId param, update updated_at)
- **UI**: Low-Medium (new component with 3 inputs, integration in 2 screens)
- **Tests**: Low (straightforward input/output)
- **Overall**: Low — mostly UI work using existing patterns and DB functions

### Files to Modify

1. `lib/db/templates.ts` — Fix `updateTemplateExercise()` to accept `templateId` and update `updated_at`
2. `components/EditExerciseSheet.tsx` — New component (Portal + positioned View overlay)
3. `app/template/[id].tsx` — Add tap handler, pencil icon affordance, integrate EditExerciseSheet
4. `app/template/create.tsx` — Same edit capability (calls DB directly)
5. New test file for template exercise editing

---

## Review Feedback

### Tech Lead (Technical Feasibility) — R1

**Reviewer**: techlead
**Date**: 2026-04-17
**Verdict**: NEEDS REVISION

**Issues Found:**

1. **CRITICAL — Wrong overlay pattern**: Plan proposes React Native Paper `Modal` with `Portal`, but the codebase uses NO `Modal` anywhere. The established pattern is custom animated bottom sheets (`ExercisePickerSheet.tsx` uses `Portal` + `react-native-reanimated` + `react-native-gesture-handler`). BLD-202 has structural tests banning `Modal` from react-native. Recommendation: use a lightweight `EditExerciseSheet` component following the `ExercisePickerSheet` pattern, or a simple positioned `View` overlay with `Portal`.

2. **MAJOR — `updateTemplateExercise()` missing `updated_at`**: Every other template mutation updates `workout_templates.updated_at` but `updateTemplateExercise()` (line 303) does not. This will cause stale sort order. Fix: add `templateId` parameter and update `updated_at` in the DB function.

3. **MINOR — Create screen description inaccurate**: Plan says create screen uses local state, but it actually persists immediately via DB functions (`createTemplate()` → `addExerciseToTemplate()` etc.). `updateTemplateExercise()` can be called directly — no local state management needed.

**Recommendations:**
- Create `EditExerciseSheet` component to avoid bloating `[id].tsx`
- Use 56dp minimum touch target (existing row minHeight) not 48dp
- Feature scope is well-bounded — no scope creep concerns

**CEO Resolution (R2):**
- ✅ #1 FIXED: Replaced Modal with `Portal` + positioned `View` overlay pattern. Created `EditExerciseSheet` component following `ExercisePickerSheet` pattern.
- ✅ #2 FIXED: Added `templateId` parameter to `updateTemplateExercise()` and `updated_at` update in technical approach.
- ✅ #3 FIXED: Corrected create screen description — it persists immediately via DB, calls `updateTemplateExercise()` directly.
- ✅ Touch targets updated to 56dp.

### Quality Director (UX Critique) — R1 → R2 APPROVED

**Reviewer**: quality-director
**Date**: 2026-04-17
**R1 Verdict**: NEEDS REVISION
**R2 Verdict**: APPROVED

**Issues Found:**

1. **[C] Create screen factual error**: Plan incorrectly states create screen uses local state. Actually persists immediately via DB.
2. **[C] Missing `keyboardType="numeric"`**: Not specified for Sets and Rest Second inputs. Required by SKILL criteria.
3. **[C] Missing `accessibilityViewIsModal`**: Edit sheet must trap screen reader focus.
4. **[C] Missing error handling**: No try/catch around DB call. SKILL requires all DB operations in try/catch with user-facing error messages.

**Recommendations:**
- Add visual edit affordance (pencil icon) for discoverability
- Specify default fallback values for null pre-fill
- Mention `Keyboard.dismiss()` on save

**CEO Resolution (R2):**
- ✅ #1 FIXED: Corrected create screen description.
- ✅ #2 FIXED: Added `keyboardType="numeric"` for Sets and Rest inputs.
- ✅ #3 FIXED: Added `accessibilityViewIsModal={true}` to sheet.
- ✅ #4 FIXED: Added try/catch with Snackbar error message, loading state on save.
- ✅ Added pencil icon affordance for discoverability.
- ✅ Added null fallback defaults (sets→3, reps→"8-12", rest→90).
- ✅ Added `Keyboard.dismiss()` on save.

### Tech Lead (Technical Feasibility) — R2

**Reviewer**: techlead
**Date**: 2026-04-17
**Verdict**: APPROVED

All R1 issues resolved. Plan is technically sound, follows established patterns, no new dependencies. Ready for implementation.

### CEO (Final Decision)

**Decision**: APPROVED — All reviewers approved on R2. Proceeding to implementation.
