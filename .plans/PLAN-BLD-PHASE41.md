# Feature Plan: Online Food Search — Open Food Facts Integration (Phase 41)

**Issue**: BLD-247
**Author**: CEO
**Date**: 2026-04-17
**Status**: REVISED (v2)

## Problem Statement

FitForge's nutrition module has 3 input methods: manual entry, favorites, and a built-in database of 150 common foods. While this covers basics, users tracking macros encounter many foods not in the local database — branded products, regional foods, restaurant items, packaged snacks. They must manually look up and enter every macro value, which is tedious and error-prone.

Commercial apps (MyFitnessPal, Cronometer) solve this with massive food databases. FitForge can achieve similar capability by integrating with **Open Food Facts** — a free, open-source food database with 3M+ products. No API key required, no cost, fully aligned with FitForge's open-source values.

## User Stories

- As a user logging my meals, I want to search an online food database so that I can quickly find nutritional info without manually entering macros
- As a user who eats packaged/branded foods, I want to search by product name so that I get accurate macro values from the label
- As a user who found a food online, I want to save it as a favorite so that I don't have to search again next time
- As a user on a slow or offline connection, I want the search to degrade gracefully so that I can still use manual entry

## Proposed Solution

### Overview

Add an **"Online"** tab to the existing Add Food screen (`app/nutrition/add.tsx`) that queries the Open Food Facts API. The tab shows a search bar with debounced queries, displays results with macro info, and allows logging + saving as favorite. The existing 3 tabs (New Food, Favorites, Database) remain unchanged.

### UX Design

**Screen flow:**
1. User taps FAB on Nutrition tab → navigates to Add Food screen
2. Existing tabs: `New Food | Favorites | Database`  →  becomes: `New | Favs | Database | Online` (shortened labels to fit 320px+ screens; if SegmentedButtons still overflows on 320px, use `dense` prop or reduce font by 1pt — minimum 12px enforced)
3. User selects "Online" tab
4. Types a food name (e.g., "Chobani yogurt")
5. After 400ms debounce, results appear from Open Food Facts
6. Each result card shows: name, brand, serving size, calories, protein, carbs, fat
7. Tapping a result expands it (same pattern as Database tab) with portion multiplier and "Log Food" button
8. Optional "Save as Favorite" toggle (same as manual entry flow)
9. Logging works identically to existing flow: creates FoodEntry → DailyLog

**Visual design:**
- Match existing Database tab card layout exactly — same Card component, same typography, same expand/collapse pattern
- Add a loading indicator (ActivityIndicator) while searching
- Show "No results" empty state matching Database tab pattern
- Show "Search for foods online" placeholder when query is empty
- Show network error state: "Could not reach food database. Check your connection."

**Accessibility:**
- Search input: `accessibilityLabel="Search online food database"`
- Result cards: same accessibility pattern as Database tab (`{name}, {calories} calories per {serving}`)
- Loading state: `accessibilityLabel="Searching..."` with `accessibilityRole="progressbar"`
- Error state: announce via `accessibilityLiveRegion="polite"`
- Touch targets: ALL interactive elements (result cards, retry button, Log Food button, Save as Favorite toggle) MUST have minimum 48×48dp hit area. Use `minHeight: 48` on card pressable areas and `hitSlop` on buttons where needed.
- Retry button: `accessibilityLabel="Retry search"` with `accessibilityRole="button"`

**Error states:**
- Network timeout (5s): show error message, user can retry
- No results: "No foods found for '{query}'. Try different terms or use manual entry."
- API rate limit: graceful fallback message
- Malformed API response: skip invalid entries, show valid ones

### Technical Approach

**Architecture:**
1. Create `lib/openfoodfacts.ts` — API client for Open Food Facts (named to distinguish from existing `lib/foods.ts`)
2. Add `OnlineTab` component in `app/nutrition/add.tsx` — new tab following existing `DatabaseTab` pattern
3. No new dependencies — use `fetch` (available in React Native)
4. No new database tables — reuse existing `food_entries` table via `addFoodEntry()`
5. Use existing `@react-native-community/netinfo` dependency for proactive offline detection on tab switch

**API details (Open Food Facts v2 Search):**
```
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url
```

- No API key required
- Rate limit: ~100 requests/minute (reasonable for user-initiated searches)
- Set `User-Agent: FitForge/0.5.0 (https://github.com/alankyshum/fitforge)` per API guidelines

**Data mapping (Open Food Facts → FitForge):**
```typescript
type OFFProduct = {
  product_name: string;
  brands?: string;
  nutriments: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
  serving_size?: string;   // free-text, e.g. "1 cup (240ml)", "2 pieces (30g)"
  serving_quantity?: number; // numeric grams, e.g. 240, 30
};
```

**Per-100g vs per-serving display rules (DATA-01 resolution):**

1. **When `serving_quantity` > 0 and `serving_size` is non-empty:**
   - Display values **per serving**: `value = value_100g × (serving_quantity / 100)`
   - Serving label shows the raw `serving_size` string (truncated to 30 chars with ellipsis)
   - Result card subtitle: "per {serving_size}" (e.g., "per 1 cup (240ml)")
   - Multiplier applies to the per-serving amount (1× = one serving, 2× = two servings)

2. **When `serving_quantity` is 0, null, or `serving_size` is empty:**
   - Display values **per 100g**
   - Serving label: "100g"
   - Result card subtitle: "per 100g"
   - Multiplier applies to the 100g amount (1× = 100g, 0.5× = 50g)

3. **Storage in `food_entries` table:**
   - `calories/protein/carbs/fat`: store the BASE serving values (per-serving or per-100g as determined above)
   - `serving`: store the serving label string ("1 cup (240ml)" or "100g")
   - `quantity`: store the multiplier value (default 1)
   - This means: actual logged macros = base values × quantity

4. **Conversion formula (explicit):**
   ```typescript
   const servingScale = (serving_quantity && serving_quantity > 0) ? serving_quantity / 100 : 1;
   const displayCalories = Math.round((nutriments["energy-kcal_100g"] ?? 0) * servingScale);
   // Same for protein, carbs, fat
   ```

**Input validation rules (DATA-02 resolution):**

API-sourced values MUST pass these checks before display. Invalid entries are silently filtered out:
- `product_name` must be non-empty string
- `energy-kcal_100g` must be a finite number ≥ 0 and ≤ 2000 (per 100g sanity cap)
- `proteins_100g`, `carbohydrates_100g`, `fat_100g` must each be finite numbers ≥ 0 and ≤ 200 (per 100g)
- If any required macro is NaN, Infinity, or negative → skip the product
- Products with all macros = 0 ARE valid (e.g., water, black coffee)
- No macro math validation (crowd-sourced data won't always add up; display as-is from API)

**Deduplication strategy (DATA-03 resolution):**

When logging an online food:
1. Before creating a new `FoodEntry`, check if an identical entry exists: match on `name` (case-insensitive) AND `calories` AND `protein` AND `carbs` AND `fat` (exact numeric match)
2. If a match exists → reuse the existing `FoodEntry` ID for the `DailyLog` entry
3. If no match → create a new `FoodEntry`
4. This prevents duplicate FoodEntry rows from cluttering favorites when the same product is logged multiple times

**Name formatting:**
- If `brands` is non-empty: `${brands} — ${product_name}` (brand first for scannability)
- If `brands` is empty: `${product_name}`
- Truncate combined name to 100 chars

**Debounce strategy:**
- 400ms debounce on text input (avoid excessive API calls)
- Minimum 2 characters before searching
- Cancel in-flight requests when new query is typed (AbortController)
- Cache last 10 search results in memory (useRef Map) to avoid re-fetching on tab switch

**Offline handling:**
- On tab switch to "Online", check `NetInfo.fetch()` — if offline, immediately show "You're offline. Connect to search online foods." (no fetch attempt)
- If fetch fails with network error during search, show error message with retry button
- User can still switch to other tabs (Database, Manual, Favorites)
- No offline caching of search results (keep it simple)

### Scope

**In Scope:**
- New "Online" tab in Add Food screen
- Open Food Facts API search integration via `lib/openfoodfacts.ts`
- Search results display with macro info (per-serving when available, per-100g fallback)
- Input validation: reject products with negative, NaN, or absurdly high macro values
- Deduplication: reuse existing FoodEntry when logging a product with identical name+macros
- Log food from search results (creates FoodEntry + DailyLog)
- Save search result as favorite
- Loading, empty, and error states
- Proactive offline detection via NetInfo
- Debounced search with AbortController
- User-Agent header per API guidelines
- 48×48dp minimum touch targets on all interactive elements
- Unit tests for API client, data mapping, and validation logic

**Out of Scope:**
- Barcode scanning (future phase — requires expo-camera)
- Product images/thumbnails in results (keep cards text-only like Database tab)
- Offline caching of search results
- Search history / recent searches
- Pagination (load more results) — initial 20 results is sufficient
- Nutrition label display / detailed macro breakdown beyond cal/protein/carbs/fat

### Acceptance Criteria

- [ ] Given the Add Food screen, When the user opens it, Then 4 tabs appear: "New", "Favs", "Database", "Online"
- [ ] Given the "Online" tab is active, When the user types ≥2 characters, Then search results appear after 400ms debounce
- [ ] Given search results are displayed, When the user taps a result, Then it expands showing serving multiplier and "Log Food" button (matching Database tab pattern)
- [ ] Given a result with `serving_quantity` > 0, When displayed, Then values are shown per-serving with label "per {serving_size}"
- [ ] Given a result without `serving_quantity`, When displayed, Then values are shown per-100g with label "per 100g"
- [ ] Given a search result is expanded, When the user taps "Log Food", Then a FoodEntry is created (or reused if identical name+macros exist) and a DailyLog entry is added for today + selected meal, and the screen navigates back
- [ ] Given a search result is expanded, When the user toggles "Save as Favorite" and logs, Then the food appears in the Favorites tab on next visit
- [ ] Given no network connection, When the user switches to Online tab, Then an offline message appears immediately (via NetInfo, no fetch attempt)
- [ ] Given the API returns products with negative or absurd macro values (>2000 kcal/100g), When processing results, Then those products are filtered out silently
- [ ] Given the API returns products missing macro data, When displaying results, Then those products are filtered out (not shown)
- [ ] Given the user types quickly, When multiple characters are entered, Then only the final debounced query triggers an API call (no race conditions)
- [ ] Given the search returns no results, When displayed, Then show "No foods found for '{query}'. Try different terms or use manual entry."
- [ ] All interactive elements (result cards, retry button, Log Food, Save as Favorite) have minimum 48×48dp touch targets
- [ ] PR passes all existing tests with no regressions
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] New unit tests cover: API response parsing, data mapping, validation (negative/absurd values), deduplication logic, per-100g and per-serving conversion

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty query | Show placeholder: "Search for foods online" |
| Query < 2 chars | No API call, show hint: "Type at least 2 characters" |
| No network (detected proactively) | Immediately show "You're offline. Connect to search online foods." — no fetch attempt |
| No network (fetch fails) | Error: "Could not reach food database. Check your connection." with retry button |
| API timeout (>5s) | Error: "Search timed out. Please try again." with retry button |
| Product missing macros | Filter out from results (don't show incomplete entries) |
| Product with macros = 0 | Show it (valid — e.g., water, black coffee) |
| Product with negative/absurd macros | Filter out silently (>2000 kcal/100g or negative values) |
| Product with NaN/Infinity macros | Filter out silently |
| Very long product name | Truncate with ellipsis (`numberOfLines={2}`, max 100 chars) |
| Long serving_size string | Truncate to 30 chars with ellipsis (e.g., "1 container (5.3oz / 1…") |
| serving_size = "1 bar (40g)" but serving_quantity is null | Display per 100g with label "100g" (safe fallback) |
| Rapid typing | Only last debounced query fires; AbortController cancels previous |
| Tab switch while loading | Cancel in-flight request |
| API returns 500/error | Show generic error with retry option |
| Non-Latin characters in search | Pass through to API (Open Food Facts supports Unicode) |
| Foreign-language product names | Display as-is from API — brand prefix helps disambiguation |
| Logging same online food twice | Reuse existing FoodEntry if name+macros match (dedup) |
| Tab state on return | Preserve search query and results when switching tabs (useRef cache) |
| 4 tabs on 320px screen | Shortened labels ("New / Favs / Database / Online") prevent overflow |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Open Food Facts API goes down | Low | Medium | Graceful error message; other tabs still work |
| API rate limiting | Low | Low | 400ms debounce + realistic user search patterns |
| Inconsistent nutrition data quality | Medium | Low | Filter out products with missing macros; show per-100g default |
| Slow API response on mobile | Medium | Low | 5s timeout; loading indicator; cancel stale requests |

## Review Feedback

### Quality Director (UX Critique) — Round 1
**Verdict: NEEDS REVISION** (2026-04-17)

Critical issues found (ALL resolved in v2):

1. **[C] DATA-01**: ✅ RESOLVED — Per-100g vs per-serving rules now explicit: display per-serving when `serving_quantity > 0`, otherwise per-100g. Multiplier, labels, and storage all specified.
2. **[C] DATA-02**: ✅ RESOLVED — Input validation rules added: reject kcal > 2000/100g, negative values, NaN, Infinity. Products with all macros = 0 remain valid.
3. **[C] DATA-03**: ✅ RESOLVED — Deduplication by name+macros match. Reuse existing FoodEntry when identical.

Major issues (ALL resolved in v2):
- **[M] A11Y-01**: ✅ RESOLVED — 48×48dp minimum touch targets specified for all interactive elements.
- **[M] UX-01**: ✅ RESOLVED — Tab labels shortened to "New / Favs / Database / Online" for 320px+ fit.
- **[M] UX-02**: ✅ RESOLVED — serving_size truncated to 30 chars with ellipsis; display as-is from API.

### Tech Lead (Technical Feasibility) — Round 1
**Verdict: APPROVED** (2026-04-17)

Recommendations incorporated in v2:
1. ✅ Renamed API client to `lib/openfoodfacts.ts`
2. ✅ Added NetInfo for proactive offline detection
3. ✅ Addressed narrow-screen tab overflow
4. ✅ Explicit per-100g conversion formula documented

### CEO Decision
**PENDING** — awaiting QD re-review of v2 revisions.
