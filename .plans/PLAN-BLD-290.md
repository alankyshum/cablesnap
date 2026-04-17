# Feature Plan: Nutrition Tab UX Overhaul — Inline Food Search + Keyboard Fix

**Issue**: BLD-290
**GitHub**: #156
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement
Owner reported (GitHub #156) two issues with the nutrition experience:

1. **Unnecessary navigation**: The "add food" flow requires navigating to a separate `/nutrition/add` route with tabs (New, Favs, Database, Online). The owner says "we don't need to show 'add food' pane on a nutrition tab when there's only one tab." This suggests the multi-tab add screen feels heavyweight for simple food logging.

2. **Keyboard dismiss bug**: "Every time I type a new word the keyboard dismisses" — when using the online food search, the keyboard loses focus on each keystroke, making it unusable.

## Root Cause Analysis

### Keyboard Dismiss Bug
The `OnlineTab` component in `app/nutrition/add.tsx` has this pattern:
- `query` state drives a `useEffect` debounced search (line 276)
- On every keystroke, `setQuery` triggers the effect which calls `setError(null)`, and if `query.trim().length < 2`, calls `setResults([])` and `setHint(...)` — **multiple state updates per keystroke**
- These state updates cause the parent component tree to re-render
- The `FlashList` receives new `data` (even if empty → empty), which triggers a full list re-render
- **Critically**: The `TextInput` is rendered as `ListHeaderComponent` of the `FlashList` — when FlashList re-renders, it can re-mount the header component, causing the TextInput to lose focus and dismiss the keyboard
- The `header` function (line 466) is defined inline as a **new function reference on every render**, which forces FlashList to re-mount the header component

### UX Issue
The current add-food flow has 4 tabs:
1. **New** — manual entry form (calories, protein, carbs, fat, serving)
2. **Favs** — quick-log from favorites
3. **Database** — search built-in food database (offline, synchronous `searchFoods()`)
4. **Online** — search OpenFoodFacts API (network, debounced)

For phone users, this requires: tap FAB → navigate to `/nutrition/add` → select tab → search → log → auto-navigate back. That's many steps for what should be quick.

The nutrition tab already has an inline form for tablet layouts (`layout.atLeastMedium`), showing a side-by-side view. But phone users must navigate away.

## Proposed Solution

### Part A: Fix Keyboard Dismiss Bug (Quick Fix)
**Root cause**: `header` function in `OnlineTab` and `DatabaseTab` is defined inline, creating new function references on every render, which causes FlashList to re-mount its `ListHeaderComponent`.

**Fix**:
1. Memoize the `header` component with `useMemo` (or extract to a stable component) in both `DatabaseTab` and `OnlineTab`
2. Move `TextInput` out of `FlashList.ListHeaderComponent` — render it above the FlashList instead
3. Wrap the FlashList in a `KeyboardAvoidingView` to ensure proper keyboard interaction

This is a standalone bugfix that can ship immediately, independent of Part B.

### Part B: Inline Food Search on Nutrition Tab (UX Overhaul)
**Goal**: Collapse the `/nutrition/add` route into the nutrition tab itself for phones.

**Approach**: Add a collapsible "Add Food" card to the nutrition tab that expands inline when the FAB is tapped, instead of navigating away.

#### Phase B1: Inline Search Card
1. Replace the FAB navigation with a state toggle (`showAddCard`)
2. When expanded, show a search card below the macro targets with:
   - **Favorites row** — horizontal scrollable list of favorite foods as chips for quick-log (tap chip → log immediately to selected meal). If no favorites, show hint text "Star foods to add them here."
   - Search input (searches both local database AND online simultaneously)
   - Meal selector chips (Breakfast / Lunch / Dinner / Snack)
   - Results list (local results first, online results below with a labeled separator "Online Results")
   - **"Manual Entry" button** → opens a **bottom sheet** (using existing `BottomSheet` component pattern from the app) containing the manual food entry form (calories, protein, carbs, fat, serving size). Bottom sheet dismisses on save or swipe-down.
   - **Barcode scan icon button** (in search input's right accessory) → opens the existing `BarcodeScanner` component as a **full-screen modal overlay** (same `visible` prop pattern used in `app/(tabs)/_layout.tsx`). On scan, auto-populates search or shows the scanned food for logging.
3. When collapsed, show just the FAB (current behavior)

#### Tablet Layout — UNCHANGED
**The tablet side-by-side layout is explicitly NOT modified in this phase.** Tablets continue to use the existing `layout.atLeastMedium` inline add form. Only phone layout (non-medium breakpoint) gets the new collapsible card behavior. No conditional rendering changes to the tablet path.

#### Route Deletion — DEFERRED
`/nutrition/add` route deletion is **deferred to a separate follow-up issue** to reduce blast radius. During this phase, the route remains functional but the phone FAB navigates to the inline card instead. The route continues to work if accessed directly (e.g., deep link).

### Important Considerations

#### Tablet Layout
**No changes to tablet layout — explicitly out of scope (see Phase B1 "Tablet Layout — UNCHANGED" above).**

#### State Management
- Search state lives inside the inline card component (not the parent tab)
- Closing the card resets all search state
- Logging food immediately updates the daily log list (no navigation needed)

#### Accessibility
- Search card must trap focus when opened (focusable container)
- Screen reader announces "Add food panel opened/closed"
- All existing accessibility labels preserved
- Minimum touch targets: 48dp

#### Performance
- Local database search: synchronous `useMemo` — no performance concern
- Online search: debounced 400ms — keep existing pattern
- FlashList for results — keep for large result sets
- Lazy render online results (don't search until user switches to online tab or types 2+ chars)

## Files to Modify

### Part A (Keyboard Fix)
| File | Change |
|------|--------|
| `app/nutrition/add.tsx` | Move TextInput out of FlashList header; memoize header components |

### Part B (UX Overhaul)
| File | Change |
|------|--------|
| `app/(tabs)/nutrition.tsx` | Add inline search card component, replace FAB behavior (phone only) |
| `components/InlineFoodSearch.tsx` | **NEW** — extracted inline search component with favorites, search, manual entry bottom sheet, barcode scan |

**Route deletion** (`app/nutrition/add.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`) is **deferred** to a follow-up issue.

### Tests to Add/Update
| File | Change |
|------|--------|
| `__tests__/flows/nutrition.test.tsx` | Update to test inline add flow (phone) |
| `__tests__/acceptance/nutrition.acceptance.test.tsx` | Update acceptance criteria for inline card |
| `__tests__/acceptance/food-database.acceptance.test.tsx` | Verify database search still works inline |
| `__tests__/acceptance/online-food-search.acceptance.test.tsx` | Verify online search still works inline |

## Implementation Plan

### Phase 1: Keyboard Fix (BLD-291 — direct fix)
- **Agent**: claudecoder
- **Effort**: Small (1 file, focused fix)
- **Changes**: Extract TextInput from FlashList header, memoize header components
- **Test**: Verify keyboard stays open while typing in search fields

### Phase 2: Inline Food Search (BLD-292 — after plan approval)
- **Agent**: techlead (complex refactor, UX-sensitive)
- **Effort**: Large (multiple files, new component, test updates)
- **Dependencies**: Phase 1 merged first (the keyboard fix pattern informs the inline design)
- **Substeps**:
  1. Create `InlineFoodSearch` component extracting search logic from `add.tsx`
  2. Add favorites row using `getFavoriteFoods()` — horizontal chip list
  3. Add manual entry bottom sheet using existing BottomSheet patterns
  4. Add barcode scan via existing `BarcodeScanner` component (modal overlay)
  5. Integrate into `nutrition.tsx` as a collapsible card (phone layout only; tablet path unchanged)
  6. Update tests
  7. Route deletion deferred to follow-up issue

## Acceptance Criteria

### Part A (Keyboard Fix)
- [ ] GIVEN user is on Online food search WHEN typing a search query THEN keyboard stays open for the entire query (does not dismiss between words/characters)
- [ ] GIVEN user is on Database food search WHEN typing a search query THEN keyboard stays open
- [ ] GIVEN user typed a search query WHEN results appear THEN keyboard remains open until user explicitly dismisses or selects a result
- [ ] No new lint warnings
- [ ] All existing tests pass

### Part B (Inline Search)
- [ ] GIVEN user is on nutrition tab (phone) WHEN tapping FAB THEN an inline search card expands below macro targets (no navigation)
- [ ] GIVEN inline search card is open WHEN user has favorite foods THEN favorites appear as horizontal scrollable chips at the top of the card
- [ ] GIVEN inline search card is open WHEN user taps a favorite chip THEN food is logged to selected meal immediately (no search needed)
- [ ] GIVEN inline search card is open WHEN user has no favorites THEN hint text "Star foods to add them here" is shown
- [ ] GIVEN inline search card is open WHEN typing a food name THEN local database results appear immediately AND online results appear after 400ms debounce
- [ ] GIVEN inline search card is open WHEN user taps a food result THEN food is logged to selected meal for current date AND daily log updates immediately
- [ ] GIVEN inline search card is open WHEN user taps "Manual Entry" THEN a bottom sheet opens for custom food entry
- [ ] GIVEN user is on tablet layout WHEN viewing nutrition tab THEN existing side-by-side layout is preserved (NO changes to tablet path)
- [ ] GIVEN user taps barcode scan icon in search input WHEN camera opens as full-screen modal THEN barcode scanning works as before
- [ ] GIVEN user logs food via inline card WHEN food is logged THEN a Snackbar confirms with undo option
- [ ] `/nutrition/add` route STILL exists (route deletion deferred to follow-up issue)
- [ ] All existing nutrition tests pass (adapted for inline flow)
- [ ] No new lint warnings

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No macro targets set | Search card still works; macro progress section hidden |
| Network offline | Online search shows "offline" message; local database search works fine |
| Empty search results | Show "No foods found" message with suggestion to try different terms |
| Rapid typing | Debounce prevents excessive network requests; local results update instantly |
| Card open + date change | Close the card, show new date's logs |
| Very long food name | Text truncates with ellipsis (numberOfLines={2}) |
| Log food while card open | Food appears in daily log immediately; card stays open for adding more |
| Keyboard overlaps results | KeyboardAvoidingView pushes results up |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: NEEDS REVISION → **R2 PENDING**
**Reviewed**: 2026-04-17

**R1 Issues (all addressed in R2):**
1. ~~Favorites tab migration MISSING~~: **FIXED** — Added favorites row as horizontal scrollable chips at top of inline card. Tap chip to quick-log. Empty state shows hint "Star foods to add them here."
2. ~~Barcode scanner UX not specified~~: **FIXED** — Specified existing BarcodeScanner component as full-screen modal overlay via `visible` prop. Permissions handled by existing BarcodeScanner flow.
3. ~~Accidental card close loses search state~~: **NOTED** — Card close resets state by design (same as closing a modal). Explicit close button (X icon) will be included in the card header.
4. ~~Deep link/route removal risk~~: **FIXED** — Route deletion deferred to separate follow-up issue. `/nutrition/add` remains functional during this phase.
5. ~~Keyboard avoidance for inline card~~: **FIXED** — KeyboardAvoidingView specified in edge cases table. Card content scrolls when keyboard is open.

**Part A (keyboard fix) APPROVED for immediate independent implementation.**

### Tech Lead (Technical Feasibility)
**Verdict**: NEEDS REVISION → **R2 PENDING**
**Reviewed**: 2026-04-17

**R1 Issues (all addressed in R2):**
1. ~~MAJOR — Favorites missing~~: **FIXED** — Added favorites row as horizontal scrollable chips.
2. ~~MAJOR — Tablet scope vague~~: **FIXED** — Explicit "Tablet Layout — UNCHANGED" section added.
3. ~~MINOR — Manual entry mechanism unspecified~~: **FIXED** — Bottom sheet with existing BottomSheet pattern specified.
4. ~~MINOR — Barcode scanner rendering unspecified~~: **FIXED** — Full-screen modal overlay using existing BarcodeScanner component.

**R1 Recommendations (all adopted):**
- ✅ Ship Part A immediately as standalone bugfix
- ✅ Added favorites section to inline card design
- ✅ Deferred route deletion to separate follow-up issue

### CEO Decision
All R1 feedback from both QD and Tech Lead has been addressed in R2. Requesting re-review from both agents.

## Out of Scope
- Nutrition history page changes
- Macro target editing (stays at `/nutrition/targets`)
- Profile page changes (stays at `/nutrition/profile`)
- Meal planning features
- Food photo recognition
- Nutritional goal recommendations

## Dependencies
- Part B depends on Part A (keyboard fix merged first)
- No external dependencies
- No new packages required

## Review: Tech Lead (Technical Feasibility)
- **Reviewer**: techlead
- **Date**: 2026-04-17
- **Verdict**: NEEDS REVISION

### Summary
Part A (keyboard fix) is technically sound — root cause analysis is correct, fix is straightforward. Part B (inline search) is architecturally feasible but has 4 design gaps that must be resolved before implementation.

### Issues
1. **MAJOR — Favorites missing**: Inline card design omits the Favs tab. Quick-log favorites must be included.
2. **MAJOR — Tablet scope vague**: Must explicitly state tablet layout is unchanged in this phase.
3. **MINOR — Manual entry mechanism unspecified**: Bottom sheet vs overlay vs expanded card not defined.
4. **MINOR — Barcode scanner rendering unspecified**: Where does camera render from inline card?

### Recommendations
- Ship Part A immediately (standalone bugfix)
- Add favorites section to inline card design
- Defer route deletion to separate issue (reduce blast radius)
- Consider simpler alternative: merge Database/Online tabs instead of full inline collapse
