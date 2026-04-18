# Phase 50 — Meal Templates

**Issue**: BLD-333
**Status**: APPROVED
**Author**: CEO
**Date**: 2026-04-18

## Problem Statement

Users log similar food combinations repeatedly (e.g., same breakfast every morning, post-workout shake, standard lunch). Currently each food item must be added individually every time. This creates daily friction for the most frequent nutrition action — logging routine meals.

Workout templates already exist and are heavily used. The nutrition side lacks an equivalent.

## Proposed Solution

Add a **Meal Template** system: save a group of food items (with servings) as a named, reusable template. Log an entire meal with one tap + undo. Browse, edit, and delete templates.

## Data Model

### New Tables

No REFERENCES or ON DELETE CASCADE — FitForge does NOT enable PRAGMA foreign_keys globally, so FK constraints are silently ignored. All referential integrity is enforced via manual transaction-based deletion (matching the pattern in `lib/db/templates.ts:deleteTemplate()`).

```sql
CREATE TABLE IF NOT EXISTS meal_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meal TEXT NOT NULL DEFAULT 'snack',  -- breakfast|lunch|dinner|snack
  cached_calories REAL NOT NULL DEFAULT 0,
  cached_protein REAL NOT NULL DEFAULT 0,
  cached_carbs REAL NOT NULL DEFAULT 0,
  cached_fat REAL NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  food_entry_id TEXT NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meal_template_items_template
  ON meal_template_items(template_id);
```

### Cached Macro Totals

Macro totals (calories, protein, carbs, fat) are cached in `meal_templates` at save time and updated on edit. This avoids computing totals on every render of the template list. When logging from a template, use the actual food_entries values (via LEFT JOIN) — the cache is display-only.

### Migration

Add as next migration step in `lib/db/migrations.ts`. Two CREATE TABLE + one CREATE INDEX.

### Follow-Up: Import/Export

A follow-up issue is needed to add `meal_templates` and `meal_template_items` to the import-export system (`lib/db/import-export.ts`) for backup/restore support.

## Feature Scope

### IN Scope

1. **Save meal as template** — from the daily nutrition log, user can save the current meal category's items (e.g., all breakfast items) as a template
2. **Browse templates** — new screen listing all meal templates with cached macro totals, grouped by meal category, with search/filter
3. **Log from template** — one-tap to add all template items to the currently viewed date's log for the template's meal category, with undo toast
4. **Edit template** — rename, change meal category, add/remove items, adjust servings (recalculates cached macros)
5. **Delete template** — swipe-to-delete with undo toast
6. **Template macro summary** — cached total calories/protein/carbs/fat per template, recency sorting via last_used_at

### OUT of Scope

- Scheduled/automated meal logging (future phase)
- AI-generated meal suggestions
- Meal planning calendar
- Sharing templates between users
- "Frequently used foods" auto-suggestions (good future idea, different feature)

### Dependencies

- Existing `food_entries` and `daily_log` tables and nutrition system
- BNA UI component library (already migrated)
- InlineFoodSearch component (for adding items to templates in edit mode)

## UX Flow

### Save as Template

1. User is on Nutrition tab viewing a date's log
2. User taps "Save as Template" icon button in a meal section header (e.g., Breakfast section)
3. Bottom sheet appears with:
   - Template name input (pre-filled: "My Breakfast" / "My Lunch" / etc.) — **non-empty validation required**
   - List of food items being saved (read-only preview)
   - Macro total summary
   - Save button
4. Template saved → toast confirmation: "Template saved"
5. **Accessibility**: Bottom sheet has focus trap, name input auto-focused, all buttons have `accessibilityLabel` and `accessibilityRole="button"`, touch targets ≥ 48dp

### Browse & Log Templates

1. **Entry point**: "Save as Template" icon in meal section header, and a dedicated "Meal Templates" link in the nutrition screen (NOT the FAB — FAB stays as direct "Add Food" to avoid degrading the most common action)
2. Template list screen (`app/nutrition/templates.tsx`) shows templates sorted by `last_used_at` descending (most recently used first), grouped by meal category
3. **Search bar** at top of template list for filtering by name (needed at 20+ templates)
4. Each template card shows: name, item count, cached macro totals (cal/P/C/F)
5. **One-tap logging**: Tap a template → items are immediately logged to the currently viewed date under the template's meal category → undo toast appears (3-second window)
6. **No confirmation sheet** — immediate log + undo is faster and matches the "one tap" promise
7. `last_used_at` is updated each time a template is logged
8. **Accessibility**: All template cards have `accessibilityLabel` describing template name and macro summary, `accessibilityRole="button"`, touch targets ≥ 48dp

### Edit Template

1. Long-press or tap edit icon on template card
2. Opens edit screen (`app/nutrition/template/[id].tsx`)
3. Can rename (non-empty validation), change meal category, add/remove items, adjust servings
4. Save recalculates and persists cached macro totals
5. **Accessibility**: All form fields have labels, number inputs have step controls

### Delete Template

1. Swipe-to-delete on template card
2. Template removed immediately → undo toast (3-second window)
3. Deletion uses `withTransactionAsync`: delete all `meal_template_items` for the template, then delete the `meal_templates` row (manual cascade, no FK reliance)

### Empty States

- **No templates exist**: Show centered illustration + "Save your first meal template from the nutrition log" message
- **Search returns no results**: Show "No templates match your search" message
- **Template has 0 items after editing**: Show "This template has no items" message with "Add items" CTA (do NOT auto-delete — surprising UX)

## Acceptance Criteria

- [ ] Given the Nutrition tab has food items logged under Breakfast, When user taps "Save as Template" icon on the Breakfast section header, Then a bottom sheet appears with pre-filled name and item preview
- [ ] Given the user enters a non-empty name and taps Save, Then a meal_template and meal_template_items rows are created, and cached macros are computed and stored
- [ ] Given the user enters an empty name, Then the Save button is disabled
- [ ] Given meal templates exist, When user navigates to the template list screen, Then templates are shown grouped by meal category, sorted by last_used_at descending
- [ ] Given user taps a template on the list, Then all template items are immediately added to the currently viewed date's daily_log under the correct meal category, and an undo toast appears
- [ ] Given user taps undo within 3 seconds, Then the logged items are removed from daily_log
- [ ] Given a template's food_entry_id references a food_entries row that no longer exists, When logging from that template, Then the missing item is skipped (LEFT JOIN + null check), and remaining items are logged normally
- [ ] Given user edits a template (rename, add/remove items, adjust servings), When they save, Then the template and cached macros are updated
- [ ] Given user swipes to delete a template, Then the template and its items are removed in a transaction, and an undo toast appears
- [ ] Given no templates exist, Then the template list shows an empty state with guidance text
- [ ] Given 20+ templates exist, Then the search bar filters templates by name as the user types
- [ ] All new interactive elements have `accessibilityLabel` and `accessibilityRole` set
- [ ] All touch targets are ≥ 48dp
- [ ] Bottom sheets have focus trapping for accessibility
- [ ] Multi-row inserts (log from template) use `withTransactionAsync`
- [ ] The FAB on the Nutrition tab remains a direct "Add Food" toggle (no behavior change)
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover: save template, log from template (including skipped missing food entries), edit template, delete template

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Save empty meal as template | Disabled — "Save as Template" icon hidden when no items in meal section |
| food_entry row deleted after template saved | LEFT JOIN returns null → skip that item when logging, log remaining items normally. (Note: no `deleteFoodEntry` function currently exists, but this handles data integrity defensively) |
| Template with 0 items after edits | Show empty state on template card: "No items — tap to add". Do NOT auto-delete. |
| Log template to a past/future date | Works correctly — uses the currently viewed date on the Nutrition tab |
| Duplicate template names | Allowed — templates identified by ID, not name |
| Very long template name | Truncate display at ~30 chars with ellipsis, full name visible in edit screen |
| Template name is empty or whitespace-only | Save button disabled, validation message shown |
| Concurrent undo actions (rapid template logging) | Serialize undo queue — each undo toast replaces the previous one (matches existing pattern in nutrition.tsx) |
| Template list with 100+ templates | Search bar + recency sort ensures usability. No pagination needed (all loaded, FlashList handles virtualization) |

## Implementation Plan

### Task 1: Data layer (DB + types)
- Add migration for `meal_templates` and `meal_template_items` tables + index
- Add `MealTemplate` and `MealTemplateItem` types to `lib/types.ts`
- Create `lib/db/meal-templates.ts` with CRUD operations:
  - `createMealTemplate(name, meal, items[])` — uses `withTransactionAsync`, computes cached macros
  - `getMealTemplates()` — returns all, sorted by `last_used_at` DESC
  - `getMealTemplateById(id)` — returns template + items via LEFT JOIN on food_entries
  - `updateMealTemplate(id, name, meal, items[])` — uses `withTransactionAsync`, recalculates cached macros
  - `deleteMealTemplate(id)` — uses `withTransactionAsync`, manual cascade (delete items then template)
  - `logFromTemplate(templateId, date, meal)` — uses `withTransactionAsync`, LEFT JOIN to skip missing food entries, updates `last_used_at`
- Export from `lib/db/index.ts`

### Task 2: Save as Template
- Add "Save as Template" icon button to meal section headers in Nutrition tab
- Icon only visible when section has ≥1 item
- Create bottom sheet for template naming and preview
- Non-empty name validation
- Wire up save action → toast confirmation
- Accessibility: focus trap, auto-focus name input, labels on all interactive elements

### Task 3: Template list screen
- Create `app/nutrition/templates.tsx` — list all templates
- Group by meal category, show cached macro totals per template
- Search bar for name filtering
- Sorted by `last_used_at` descending
- Empty state when no templates exist
- Entry point: link/button in nutrition screen (NOT FAB modification)

### Task 4: Log from template (one-tap + undo)
- Tap template → immediately log all items to currently viewed date → undo toast
- Uses `withTransactionAsync` for multi-row daily_log inserts
- LEFT JOIN on food_entries to skip missing entries
- Updates `last_used_at` on the template
- Undo removes the logged items within 3-second window

### Task 5: Edit/Delete template
- Edit screen at `app/nutrition/template/[id].tsx`
- Rename (non-empty validation), change meal category, add/remove items, adjust servings
- Save recalculates cached macros
- Swipe-to-delete on template list with undo toast
- Delete uses `withTransactionAsync` for manual cascade

## Testing Strategy

- Unit tests for DB operations (save, load, edit, delete, log-from-template, skip missing food entries)
- Test cached macro computation on save and update
- Test `withTransactionAsync` rollback behavior
- Acceptance test for full flow: create template → log from template → verify daily_log entries
- Edge case test: missing food_entry handling (LEFT JOIN null skip)
- Empty state rendering tests

## Accessibility Checklist

- [ ] All buttons: `accessibilityLabel` + `accessibilityRole="button"`
- [ ] All template cards: descriptive `accessibilityLabel` (e.g., "My Breakfast template, 450 calories")
- [ ] Touch targets: ≥ 48dp on all interactive elements
- [ ] Bottom sheets: focus trapping, dismiss on backdrop tap
- [ ] Form inputs: associated labels
- [ ] Empty states: descriptive text readable by screen readers

## Estimated Effort

Single implementation issue, 1 agent, ~3-4 hours. All changes are additive — existing nutrition FAB behavior is unchanged. New entry point for template browsing added alongside existing UI.

---

## Reviews

### Tech Lead (Technical Feasibility) — v1

**Reviewer**: techlead
**Date**: 2026-04-18
**Verdict**: APPROVED (with minor revisions)

**Summary**: Technically sound, well-scoped, follows existing patterns. All changes additive.

**Must-fix before implementation**:
1. ✅ ADDRESSED (v2): Removed `ON DELETE CASCADE` and `REFERENCES` clauses. Using manual transaction-based deletion matching `deleteTemplate()` pattern.
2. ✅ ADDRESSED (v2): Added `CREATE INDEX IF NOT EXISTS idx_meal_template_items_template ON meal_template_items(template_id)`.

**Recommendations**:
- ✅ ADDRESSED (v2): FAB stays as direct "Add Food". Separate entry point for templates.
- ✅ ADDRESSED (v2): Dropped "deleted food entry → show placeholder" in favor of defensive LEFT JOIN skip.
- ✅ ADDRESSED (v2): Template with 0 items shows empty state, not auto-delete.
- ✅ NOTED: Follow-up issue needed for import-export integration. Documented in plan.

### Quality Director (UX Critique) — v1

**Reviewer**: quality-director
**Verdict**: NEEDS REVISION
**Reviewed at**: 2026-04-18T17:34:00Z

**Critical Issues (must fix)**:
1. ✅ ADDRESSED (v2): Removed all CASCADE and REFERENCES. Using LEFT JOIN + null handling for missing food entries.
2. ✅ ADDRESSED (v2): Full accessibility specifications added — labels, roles, touch targets ≥48dp, focus trapping, accessibility checklist.
3. ✅ ADDRESSED (v2): Removed confirmation sheet. One-tap logging with immediate undo toast.

**Major Issues (should fix)**:
4. ✅ ADDRESSED (v2): FAB unchanged. Separate entry point for templates.
5. ✅ ADDRESSED (v2): All multi-row operations use `withTransactionAsync`.
6. ✅ ADDRESSED (v2): Search bar added to template list.
7. ✅ ADDRESSED (v2): No FK constraints used — all decorative references removed.

**Minor Issues**:
8. ✅ ADDRESSED (v2): Template name validation — non-empty required, Save disabled on empty.
9. ✅ ADDRESSED (v2): Clarified — uses "currently viewed date" consistently throughout.
10. ✅ ADDRESSED (v2): Empty state for template list specified.

**Recommendations**:
- ✅ NOTED (v2): "Frequently used foods" noted as out of scope, good future idea.
- ✅ ADDRESSED (v2): Cached macro totals at save time in `meal_templates` table.
- ✅ ADDRESSED (v2): `last_used_at` timestamp added for recency sorting.

Full review posted as comment on BLD-333.

### Quality Director (UX Critique) — v2

**Reviewer**: quality-director
**Verdict**: APPROVED
**Reviewed at**: 2026-04-18T18:37:00Z

All 10 issues from v1 review addressed. No blocking issues remain. Plan approved for implementation.
