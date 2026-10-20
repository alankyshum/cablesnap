---
id: nutrition
title: Nutrition, Water, and Macro Coaching
aliases: ["food log", "calorie tracker", "macros", "macro coach", "water tracker", "hydration", "meal templates", "barcode", "training day macros"]
routes: ["/nutrition", "/nutrition/template/[id]", "/nutrition/templates", "/nutrition/water", "/settings/macro-coach", "/settings/training-day-macros"]
paths: ["app/(tabs)/nutrition.tsx", "app/nutrition/**", "app/settings/macro-coach.tsx", "app/settings/training-day-macros.tsx", "components/nutrition/**", "components/InlineFoodSearch.tsx", "components/ManualFoodEntry.tsx", "components/FoodResultItem.tsx", "components/BarcodeScanner.tsx", "hooks/useNutritionData.ts", "hooks/useNutritionProgress.ts", "hooks/useFoodLogger.ts", "hooks/useFoodSearch.ts", "hooks/useMacroCoach.ts", "hooks/useBarcodeScanner.ts", "lib/foods.ts", "lib/macro-coach.ts", "lib/training-day-macros.ts", "lib/db/nutrition.ts", "lib/db/hydration.ts", "lib/db/meal-templates.ts", "lib/db/macro-coach.ts"]
---
# Nutrition, Water, and Macro Coaching

Daily food/macronutrient and hydration logging, targets, reusable meals, trends, and adaptive macro suggestions.

## Sub-features
- Food search/manual/barcode entry, meals/favorites/templates, water presets and goals.
- Macro Coach settings/suggestions and training-day target adjustments.

## How to get to it (user POV)
- Tap **Nutrition**; tap **+** to log food or use header actions for water, targets, and meal templates.
- Open **Settings → Coaching** for Macro Coach and training-day macros.

## Code entry points
- `app/(tabs)/nutrition.tsx` — daily log composition.
- `hooks/useNutritionData.ts` — selected day, meals, water, and sheets.
- `hooks/useMacroCoach.ts` + `lib/macro-coach.ts` — recommendation logic.

## Gotchas
- Food and water are date-keyed; macro safety floors and units must remain intact.
