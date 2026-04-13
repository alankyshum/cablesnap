# Phase 20: Built-in Food Database for Quick Nutrition Logging

**Issue**: BLD-15
**Author**: CEO
**Date**: 2026-04-13
**Status**: APPROVED (Rev 2) — QD + techlead approved 2026-04-13

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
  "serving": "100g"
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

**Database tab layout** (uses `FlatList` — NOT ScrollView+.map()):

When the "Database" tab is active, render its content as a standalone `FlatList` that **replaces** the parent ScrollView. Do NOT nest a list inside ScrollView. The FlatList uses `ListHeaderComponent` for the search bar + category chips.

1. **Search bar** (TextInput in ListHeaderComponent) — filters foods by name (case-insensitive substring match). FlatList has `keyboardShouldPersistTaps="handled"` so tapping a result doesn't require dismissing keyboard first.
2. **Category chips** (horizontal scroll in ListHeaderComponent) — filter by category. Default state is "All" (no category filter applied — this is a UI state, NOT a FOOD_CATEGORIES entry; internally `category === null` means show all).
3. **Results FlatList** — virtualized list of matching foods, each showing:
   - Food name (titleSmall)
   - Nutritional summary: `165 cal · 31p · 0c · 3.6f · 100g`
4. **Tap a food** → shows serving adjustment as an **inline expansion** below the tapped item (same pattern as accordion/expandable list item). No bottom sheet or modal — keeps context visible.
   - Pre-filled serving size from database (display only, e.g. "per 100g")
   - **Serving multiplier** stepper with quick-select chips: **0.5x / 1x / 1.5x / 2x** (4 chips — fits on 320pt screens). Custom amount via TextInput below chips for precise entry (e.g. 0.75, 3.0).
   - Calculated macros update live as multiplier changes
   - **Serving storage**: base macros are stored unscaled in `food_entries`. The multiplier is stored in `daily_log.servings`. `serving_size` TEXT stores the original serving string from JSON (e.g. "100g"). `getDailySummary()` already computes `calories * servings` — no special handling needed.
   - "Log Food" button
   - "Save as Favorite" toggle (saves a copy to user's food_entries with `is_favorite=1`)

### 3. Data Layer Changes (`lib/db.ts`)

No schema changes needed. When a user logs a food from the database:
1. Create a `food_entries` row with **base** (unscaled) macros copied from JSON. The `serving_size` field stores the original serving string (e.g. "100g").
2. Create a `daily_log` row linking to that food entry with `servings` set to the user's chosen multiplier (e.g. 1.5).
3. `getDailySummary()` already computes `calories * servings` — the multiplier is applied at read time, not write time.

**Deduplication**: Accept duplicate food_entries for simplicity (same behavior as manual entry). Each log creates a new food_entry. Optimize in a future phase if needed.

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
- [ ] Database tab uses FlatList (NOT ScrollView+.map()) with ListHeaderComponent for search + chips
- [ ] Database tab renders independently from parent ScrollView (conditional rendering by active tab)
- [ ] Search bar filters foods by name (case-insensitive, substring)
- [ ] FlatList has keyboardShouldPersistTaps="handled"
- [ ] Category chips filter foods by category; "All" is default (null filter state, not a FOOD_CATEGORIES entry)
- [ ] Tapping a food shows inline serving adjustment with live macro calculation
- [ ] Serving multiplier quick-select chips: 0.5x, 1x, 1.5x, 2x (4 chips)
- [ ] Custom serving amount via TextInput for precise values
- [ ] Base macros stored unscaled in food_entries; multiplier stored in daily_log.servings
- [ ] serving_size TEXT stores original serving string from JSON (e.g. "100g")
- [ ] "Log Food" creates food_entry (base macros) + daily_log (with servings multiplier)
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

## Review Feedback

### Quality Director (UX Critique)
**Rev 1 Verdict**: NEEDS REVISION (2026-04-13T19:22Z) — 1 Critical, 2 Major, 3 Minor
**Rev 2 Verdict**: ✅ APPROVED (2026-04-13T19:30Z) — All 6 findings resolved

**Findings (all verified resolved in Rev 2):**
1. **C1 — FlatList mandatory** ✅ Database tab uses FlatList with ListHeaderComponent. Renders independently from parent ScrollView.
2. **M1 — Serving size mapping** ✅ Base macros stored unscaled in food_entries. Multiplier in daily_log.servings. serving_size stores original JSON string.
3. **M2 — Quick-select chip count** ✅ Reconciled to 4 chips (0.5x, 1x, 1.5x, 2x). Custom TextInput for other values.
4. **m1 — "All" category** ✅ Clarified as UI filter state (null), not a FOOD_CATEGORIES entry.
5. **m2 — keyboardShouldPersistTaps** ✅ Specified on FlatList.
6. **m3 — Serving adjustment container** ✅ Specified as inline expansion below tapped item.

**Non-blocking observations:**
- Consider specifying accordion behavior (one expansion at a time) — implied but not stated.
- lib/foods.ts would benefit from unit tests given new Jest infrastructure.

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (2026-04-13T19:22Z)
**Findings (all addressed in Rev 2):**
1. Store base macros in food_entries, use daily_log.servings for multiplier ✅
2. Remove unit_weight_g from JSON — unused, YAGNI ✅
3. Accept food_entries duplication for simplicity ✅
4. Test 3-tab SegmentedButtons on narrow screens — noted for implementation

### CEO Decision — Rev 2 Resolutions

All QD and techlead findings addressed in Rev 2:

| Finding | Resolution |
|---------|-----------|
| **C1 — FlatList** | ✅ Database tab uses FlatList with ListHeaderComponent. Conditional rendering replaces parent ScrollView. |
| **M1 — Serving storage** | ✅ Base macros unscaled in food_entries, multiplier in daily_log.servings, serving_size = original JSON string. |
| **M2 — Chip count** | ✅ 4 chips (0.5x, 1x, 1.5x, 2x) + custom TextInput. |
| **m1 — "All" category** | ✅ UI filter state (null), not in FOOD_CATEGORIES. |
| **m2 — keyboardShouldPersistTaps** | ✅ Added to FlatList. |
| **m3 — Serving container** | ✅ Inline expansion below tapped item. |
| **TL1 — Base macros** | ✅ Same as M1 — unscaled storage. |
| **TL2 — unit_weight_g** | ✅ Removed from JSON schema and BuiltinFood type. |
| **TL3 — Deduplication** | ✅ Accept duplicates for simplicity. |

**Plan status**: ✅ APPROVED by both QD and techlead. Ready for implementation.
