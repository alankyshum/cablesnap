# Feature Plan: Online Food Search — Open Food Facts Integration (Phase 41)

**Issue**: BLD-247
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

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
2. Existing tabs: `New Food | Favorites | Database`  →  becomes: `New Food | Favorites | Database | Online`
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

**Error states:**
- Network timeout (5s): show error message, user can retry
- No results: "No foods found for '{query}'. Try different terms or use manual entry."
- API rate limit: graceful fallback message
- Malformed API response: skip invalid entries, show valid ones

### Technical Approach

**Architecture:**
1. Create `lib/food-search.ts` — API client for Open Food Facts
2. Add `OnlineTab` component in `app/nutrition/add.tsx` — new tab following existing `DatabaseTab` pattern
3. No new dependencies — use `fetch` (available in React Native)
4. No new database tables — reuse existing `food_entries` table via `addFoodEntry()`

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
  serving_size?: string;
  serving_quantity?: number;
};

// Map to FitForge's BuiltinFood-compatible shape:
// name: `${product_name}` (or `${brands} ${product_name}` if brand exists)
// calories: energy-kcal_100g (per 100g default, scaled by serving if available)
// protein/carbs/fat: from nutriments, per 100g or per serving
// serving: serving_size || "100g"
```

**Debounce strategy:**
- 400ms debounce on text input (avoid excessive API calls)
- Minimum 2 characters before searching
- Cancel in-flight requests when new query is typed (AbortController)
- Cache last 10 search results in memory (useRef Map) to avoid re-fetching on tab switch

**Offline handling:**
- If fetch fails with network error, show error message
- User can still switch to other tabs (Database, Manual, Favorites)
- No offline caching of search results (keep it simple)

### Scope

**In Scope:**
- New "Online" tab in Add Food screen
- Open Food Facts API search integration
- Search results display with macro info
- Log food from search results (creates FoodEntry + DailyLog)
- Save search result as favorite
- Loading, empty, and error states
- Debounced search with AbortController
- User-Agent header per API guidelines
- Unit tests for API client and data mapping

**Out of Scope:**
- Barcode scanning (future phase — requires expo-camera)
- Product images/thumbnails in results (keep cards text-only like Database tab)
- Offline caching of search results
- Search history / recent searches
- Pagination (load more results) — initial 20 results is sufficient
- Nutrition label display / detailed macro breakdown beyond cal/protein/carbs/fat

### Acceptance Criteria

- [ ] Given the Add Food screen, When the user opens it, Then 4 tabs appear: "New Food", "Favorites", "Database", "Online"
- [ ] Given the "Online" tab is active, When the user types ≥2 characters, Then search results appear after 400ms debounce
- [ ] Given search results are displayed, When the user taps a result, Then it expands showing serving multiplier and "Log Food" button (matching Database tab pattern)
- [ ] Given a search result is expanded, When the user taps "Log Food", Then a FoodEntry is created and a DailyLog entry is added for today + selected meal, and the screen navigates back
- [ ] Given a search result is expanded, When the user toggles "Save as Favorite" and logs, Then the food appears in the Favorites tab on next visit
- [ ] Given no network connection, When the user searches, Then an error message appears: "Could not reach food database. Check your connection."
- [ ] Given the API returns products missing macro data, When displaying results, Then those products are filtered out (not shown)
- [ ] Given the user types quickly, When multiple characters are entered, Then only the final debounced query triggers an API call (no race conditions)
- [ ] Given the search returns no results, When displayed, Then show "No foods found for '{query}'. Try different terms or use manual entry."
- [ ] PR passes all existing tests with no regressions
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] New unit tests cover: API response parsing, data mapping, edge cases (missing fields, empty results)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty query | Show placeholder: "Search for foods online" |
| Query < 2 chars | No API call, show hint: "Type at least 2 characters" |
| No network | Error: "Could not reach food database. Check your connection." |
| API timeout (>5s) | Error: "Search timed out. Please try again." |
| Product missing macros | Filter out from results (don't show incomplete entries) |
| Product with macros = 0 | Show it (valid — e.g., water, black coffee) |
| Very long product name | Truncate with ellipsis (`numberOfLines={2}`) |
| Rapid typing | Only last debounced query fires; AbortController cancels previous |
| Tab switch while loading | Cancel in-flight request |
| API returns 500/error | Show generic error with retry option |
| Non-Latin characters in search | Pass through to API (Open Food Facts supports Unicode) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Open Food Facts API goes down | Low | Medium | Graceful error message; other tabs still work |
| API rate limiting | Low | Low | 400ms debounce + realistic user search patterns |
| Inconsistent nutrition data quality | Medium | Low | Filter out products with missing macros; show per-100g default |
| Slow API response on mobile | Medium | Low | 5s timeout; loading indicator; cancel stale requests |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-17)

Fully feasible. No new dependencies, follows existing DatabaseTab pattern exactly, reuses addFoodEntry/addDailyLog. Low risk, small-medium effort (~200 lines).

Minor recommendations:
1. Name API client `lib/openfoodfacts.ts` (not `lib/food-search.ts`) to avoid confusion with `lib/foods.ts`
2. Use existing `@react-native-community/netinfo` dep for proactive offline detection
3. Test SegmentedButtons with 4 items on narrow (320px) devices
4. Document per-100g → per-serving conversion formula explicitly in mapping code

### CEO Decision
_Pending reviews_
