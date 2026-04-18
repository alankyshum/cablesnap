# Phase 50 — Meal Templates

**Issue**: BLD-333
**Status**: PLANNING
**Author**: CEO

## Problem Statement

Users log similar food combinations repeatedly (e.g., same breakfast every morning, post-workout shake, standard lunch). Currently each food item must be added individually every time. This creates daily friction for the most frequent nutrition action — logging routine meals.

Workout templates already exist and are heavily used. The nutrition side lacks an equivalent.

## Proposed Solution

Add a **Meal Template** system: save a group of food items (with servings) as a named, reusable template. Log an entire meal with one tap. Browse, edit, and delete templates.

## Data Model

### New Tables

```sql
CREATE TABLE IF NOT EXISTS meal_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meal TEXT NOT NULL DEFAULT 'snack',  -- breakfast|lunch|dinner|snack
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_entry_id TEXT NOT NULL REFERENCES food_entries(id),
  servings REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### Migration

Add as next migration step in `lib/db/migrations.ts`. Two CREATE TABLE statements.

## Feature Scope

### IN Scope

1. **Save meal as template** — from the daily nutrition log, user can save the current meal category's items (e.g., all breakfast items) as a template
2. **Browse templates** — new screen listing all meal templates with macro totals
3. **Log from template** — one-tap to add all template items to today's log for the template's meal category
4. **Edit template** — rename, change meal category, add/remove items, adjust servings
5. **Delete template** — swipe-to-delete with undo
6. **Template macro summary** — show total calories/protein/carbs/fat per template

### OUT of Scope

- Scheduled/automated meal logging (future phase)
- AI-generated meal suggestions
- Meal planning calendar
- Sharing templates between users

### Dependencies

- Existing food_entries table and nutrition system
- BNA UI component library (already migrated)
- InlineFoodSearch component (for adding items to templates)

## UX Flow

### Save as Template

1. User is on Nutrition tab viewing today's log
2. User taps "Save as Template" button in a meal section header (e.g., Breakfast section)
3. Bottom sheet appears with:
   - Template name input (pre-filled: "My Breakfast" / "My Lunch" / etc.)
   - List of food items being saved (read-only preview)
   - Macro total summary
   - Save button
4. Template saved → toast confirmation

### Browse & Log Templates

1. User taps FAB on Nutrition tab → shows "Add Food" and "From Template" options
2. "From Template" opens template list screen (`app/nutrition/templates.tsx`)
3. Screen shows templates grouped by meal category
4. Each template card shows: name, item count, total macros
5. Tap a template → confirmation sheet showing items → "Log Now" button
6. Logs all items to today's date under the template's meal category

### Edit Template

1. Long-press or tap edit icon on template card
2. Opens edit screen (`app/nutrition/template/[id].tsx`)
3. Can rename, change meal category, add/remove items, adjust servings
4. Save changes

## Acceptance Criteria

- [ ] Given the Nutrition tab has food items logged under Breakfast, When user taps "Save as Template" on the Breakfast section, Then a template is created with all Breakfast items and their servings
- [ ] Given meal templates exist, When user taps FAB → "From Template", Then the template list screen shows all templates grouped by meal category
- [ ] Given user selects a template, When they tap "Log Now", Then all template items are added to today's daily log under the correct meal category
- [ ] Given user edits a template, When they change name/items/servings and save, Then the template is updated
- [ ] Given user swipes to delete a template, When confirmed, Then the template and its items are removed
- [ ] Each template card shows total calories, protein, carbs, fat
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover: save template, log from template, edit template, delete template

## Implementation Plan

### Task 1: Data layer (DB + types)
- Add migration for `meal_templates` and `meal_template_items` tables
- Add types to `lib/types.ts`
- Create `lib/db/meal-templates.ts` with CRUD operations
- Export from `lib/db/index.ts`

### Task 2: Save as Template
- Add "Save as Template" button to meal section headers in Nutrition tab
- Create bottom sheet for template naming and preview
- Wire up save action

### Task 3: Template list screen
- Create `app/nutrition/templates.tsx` — list all templates
- Group by meal category, show macro totals per template
- Navigate from FAB on Nutrition tab

### Task 4: Log from template
- Tap template → confirmation sheet → "Log Now"
- Creates daily_log entries for each template item
- Toast confirmation with undo

### Task 5: Edit/Delete template
- Edit screen at `app/nutrition/template/[id].tsx`
- Swipe-to-delete on template list
- Add/remove items, adjust servings, rename

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Save empty meal as template | Disabled — button hidden when no items in meal section |
| Food entry deleted after template created | Show "(deleted)" placeholder, skip when logging |
| Template with 0 items after edits | Auto-delete the template |
| Log template to a date in the past | Should work — uses the currently viewed date |
| Duplicate template names | Allowed — templates identified by ID, not name |
| Very long template name | Truncate display at ~30 chars with ellipsis |

## Testing Strategy

- Unit tests for DB operations (save, load, edit, delete, log-from-template)
- Acceptance test for full flow: create template → log from template → verify daily log
- Edge case test: deleted food entry handling

## Estimated Effort

Single implementation issue, 1 agent, ~2-3 hours. All changes are additive — no existing code modified except adding FAB option and section header button.
