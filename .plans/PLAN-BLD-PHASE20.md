# Phase 20: Built-in Food Database for Quick Nutrition Logging

## Problem Statement

Currently, users must manually enter **6 fields** (name, calories, protein, carbs, fat, serving size) every time they log a meal. The `app/nutrition/add.tsx` screen has two tabs: "New Food" (manual entry) and "Favorites" (quick-log previously saved favorites).

This friction makes nutrition tracking impractical for most users. Competing apps like MyFitnessPal and Macro solve this with searchable food databases. FitForge needs a local, offline-first food database to stay competitive.

## Proposed Solution

Ship a **built-in local food database** of ~150 common foods (JSON asset) with pre-filled nutritional data per standard serving. Add a searchable "Database" tab to the add-food screen where users can search, select, adjust servings, and log with minimal effort.

**Key principle**: Zero external dependencies. The database ships as a bundled JSON file — no API calls, no network required.

## Detailed Design

### 1. Food Database Asset

**File**: `assets/data/foods.json`

Each entry contains:
```json
{
  "id": "chicken_breast_grilled",
  "name": "Chicken Breast (grilled)",
  "category": "protein",
  "calories": 165,
  "protein": 31,
  "carbs": 0,
  "fat": 3.6,
  "serving": "100g",
  "unit_weight_g": 100
}
```

**Categories** (7):
- `protein` — Chicken breast, salmon, eggs, tofu, Greek yogurt, tuna, ground beef, turkey, shrimp, etc.
- `grains` — Rice, oats, bread, pasta, quinoa, tortilla, etc.
- `dairy` — Milk, cheese, cottage cheese, butter, cream cheese, etc.
- `fruits` — Banana, apple, blueberries, strawberry, orange, avocado, etc.
- `vegetables` — Broccoli, spinach, sweet potato, carrot, bell pepper, tomato, etc.
- `fats` — Olive oil, peanut butter, almonds, walnuts, coconut oil, etc.
- `other` — Honey, protein powder, rice cake, granola bar, etc.

**Target**: ~150 entries covering the most commonly logged foods in fitness apps. Nutritional data per standard serving (referenced from USDA FoodData Central public domain data).

### 2. UI Changes to `app/nutrition/add.tsx`

**Add a third tab**: "Database" alongside "New Food" and "Favorites"

```
[ New Food ] [ Favorites ] [ Database ]
```

**Database tab layout**:
1. **Search bar** (TextInput at top) — filters foods by name (case-insensitive substring match)
2. **Category chips** (horizontal scroll) — filter by category. "All" selected by default.
3. **Results list** — scrollable list of matching foods, each showing:
   - Food name (titleSmall)
   - Nutritional summary: `165 cal · 31p · 0c · 3.6f · 100g`
4. **Tap a food** → shows serving adjustment UI:
   - Pre-filled serving size from database
   - **Serving multiplier** stepper: 0.25x / 0.5x / 0.75x / 1x / 1.5x / 2x / 3x (quick-select chips)
   - Custom amount TextInput for precise entry
   - Calculated macros update live as multiplier changes
   - "Log Food" button
   - "Save as Favorite" toggle (saves a copy to user's food_entries)

### 3. Data Layer Changes (`lib/db.ts`)

No schema changes needed. When a user logs a food from the database:
1. Create a `food_entries` row (copies the data from the JSON, adjusted by serving multiplier)
2. Create a `daily_log` row linking to that food entry

This reuses the existing data model entirely. Database foods become user food entries upon logging — simple, no migration needed.

### 4. New Module: `lib/foods.ts`

```typescript
// Loads and caches the built-in food database
// Provides search/filter functions
export function getBuiltinFoods(): BuiltinFood[]
export function searchFoods(query: string, category?: string): BuiltinFood[]
export function getCategories(): { id: string; label: string }[]
```

The JSON is loaded once via `require()` (bundled by Metro) and cached in memory. No async loading needed — it's a static asset.

### 5. Type Changes (`lib/types.ts`)

Add:
```typescript
export type FoodCategory = "protein" | "grains" | "dairy" | "fruits" | "vegetables" | "fats" | "other"

export type BuiltinFood = {
  id: string
  name: string
  category: FoodCategory
  calories: number
  protein: number
  carbs: number
  fat: number
  serving: string
  unit_weight_g: number
}

export const FOOD_CATEGORIES: { id: FoodCategory; label: string }[] = [
  { id: "protein", label: "Protein" },
  { id: "grains", label: "Grains" },
  { id: "dairy", label: "Dairy" },
  { id: "fruits", label: "Fruits" },
  { id: "vegetables", label: "Vegetables" },
  { id: "fats", label: "Fats & Nuts" },
  { id: "other", label: "Other" },
]
```

## Files to Create

| File | Purpose |
|------|---------|
| `assets/data/foods.json` | Built-in food database (~150 entries) |
| `lib/foods.ts` | Food database loader, search, category filter |

## Files to Modify

| File | Changes |
|------|---------|
| `app/nutrition/add.tsx` | Add "Database" tab, search UI, serving adjustment, food selection flow |
| `lib/types.ts` | Add `FoodCategory`, `BuiltinFood` types, `FOOD_CATEGORIES` constant |

## Acceptance Criteria

- [ ] Built-in food database ships with ~150 common foods
- [ ] "Database" tab appears on add-food screen alongside "New Food" and "Favorites"
- [ ] Search bar filters foods by name (case-insensitive, substring)
- [ ] Category chips filter foods by category
- [ ] Tapping a food shows serving adjustment with live macro calculation
- [ ] Serving multiplier quick-select chips (0.5x, 1x, 1.5x, 2x)
- [ ] Custom serving amount via TextInput
- [ ] "Log Food" creates food_entry + daily_log with adjusted macros
- [ ] "Save as Favorite" toggle persists the food to favorites
- [ ] Nutritional data is reasonable (verified against USDA data)
- [ ] No new dependencies required
- [ ] No external API calls — fully offline
- [ ] TypeScript compiles with zero errors
- [ ] App starts without crashes
- [ ] Existing manual food entry and favorites features are unchanged

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Search with no results | Show "No foods found. Try a different search term." message |
| Search with empty query | Show all foods (filtered by category if selected) |
| Serving multiplier = 0 | Minimum is 0.25x — stepper doesn't go below |
| Very long food name | Truncate with ellipsis in list, full name in detail |
| Logging same DB food twice | Creates separate food_entries — no dedup issues |
| Custom serving = 0 or negative | Disable "Log Food" button, show validation hint |
| Database loads slowly | Won't happen — JSON is bundled via require(), loaded sync |

## Accessibility

- Search bar: `accessibilityLabel="Search foods"`
- Category chips: `accessibilityRole="button"`, `accessibilityState={{ selected }}`
- Food items: `accessibilityLabel="{name}, {calories} calories per {serving}"`
- Serving stepper: `accessibilityLabel="Serving multiplier: {value} times"`
- Live macro update: Use `accessibilityLiveRegion="polite"` on the calculated macros display

## Out of Scope

- Barcode scanning (requires camera, external API)
- User-contributed food database / cloud sync
- Meal planning / recipe builder
- Food database updates / versioning (can be added later)
- Per-food micronutrient data (fiber, sodium, etc.)

## Dependencies

- None — all existing infrastructure supports this feature

## Estimated Effort

- **JSON data file**: Medium (curating ~150 foods with accurate nutritional data)
- **lib/foods.ts**: Small (load JSON, search, filter)
- **lib/types.ts**: Small (add types)
- **app/nutrition/add.tsx**: Medium-Large (new tab, search UI, serving adjustment flow)
- **Total**: ~400-600 lines of new code + ~300 lines of JSON data

## Review Status

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED

**Feasibility**: Fully buildable. addFoodEntry() + addDailyLog() already handle the full flow. getDailySummary() already multiplies macros by dl.servings. Metro bundles JSON via require() sync. Zero new deps.

**Architecture Fit**: Excellent. New tab in existing SegmentedButtons, lib/foods.ts follows lib/rpe.ts module pattern, copy-on-log to food_entries matches existing data flow.

**Complexity**: Medium | Risk: Low | New deps: none

**Findings (all minor)**:
1. Store base macros in food_entries, use daily_log.servings for serving multiplier (not pre-scaled copies)
2. Remove unit_weight_g from JSON schema — unused, YAGNI
3. Accept food_entries duplication for simplicity (optimize later)
4. Test 3-tab SegmentedButtons on narrow screens

**Approved for implementation** — clean scope, zero friction with existing patterns.

### CEO Decision
_Pending reviews_
