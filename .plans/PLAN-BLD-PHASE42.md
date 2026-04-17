# Feature Plan: Barcode Scanner for Food Logging (Phase 42)

**Issue**: BLD-250
**Author**: CEO
**Date**: 2026-04-17
**Status**: APPROVED

## Problem Statement

Phase 41 added online food search via Open Food Facts, letting users find packaged foods by name. However, typing product names is still slower than necessary — especially for packaged foods that have a barcode right on the packaging. Every major nutrition app (MyFitnessPal, Cronometer, Lose It!) offers barcode scanning because it reduces food logging from 15+ seconds of typing to 2 seconds of pointing the camera.

Open Food Facts supports barcode lookup natively (`GET /api/v2/product/{barcode}`), so we can reuse the same data source, validation, and mapping logic from Phase 41.

## User Stories

- As a user logging packaged foods, I want to scan a barcode so that I can log the food instantly without typing
- As a user who scans a barcode not found in the database, I want a clear fallback so that I can still log the food manually or via text search
- As a user on a device without a camera, I want the app to degrade gracefully so that I can still use all other nutrition features

## Proposed Solution

### Overview

Add a **barcode scan button** to the Online tab (from Phase 41) that opens a camera overlay. When a barcode is detected, look it up via Open Food Facts barcode API. If found, display the product with macros and allow one-tap logging. If not found, offer to search by text or enter manually.

### UX Design

**Screen flow:**
1. User navigates to Add Food → Online tab
2. A "Scan Barcode" button appears above the search input (camera icon + text)
3. Tapping opens a full-screen camera overlay with barcode scanning
4. On barcode detection: overlay closes, product info appears in the Online tab as a single result card
5. User can expand the card → adjust portion → "Log Food" (same flow as Phase 41 search results)
6. If barcode not found: show message "Product not found. Try searching by name." with a button to pre-fill the search query

**Camera overlay design:**
- Full-screen camera preview with a semi-transparent overlay
- Rectangular scanning region indicator in the center (visual guide)
- "Scan a food barcode" instruction text at top
- Close button (X) in top-right corner
- Auto-detect: no "capture" button needed — scanning is continuous
- On detection: brief haptic feedback + auto-close overlay

**Visual integration:**
- "Scan Barcode" button uses `Button` component with `mode="outlined"` and `icon="barcode-scan"` (MaterialCommunityIcons)
- Button positioned between the tab selector and search input
- Touch target: minimum 48×48dp
- Consistent with existing Material Design 3 styling

**Platform behavior:**
- **Android/iOS**: Full camera overlay with barcode scanning
- **Web**: "Scan Barcode" button is hidden (camera barcode scanning not supported on web)
- If camera permission denied: show "Camera access needed to scan barcodes. You can grant access in Settings." with a link to app settings

**Accessibility:**
- Scan button: `accessibilityLabel="Scan food barcode"`, `accessibilityRole="button"`
- Camera overlay: `accessibilityLabel="Barcode scanner. Point camera at a food barcode."`, announce "Barcode detected" via `accessibilityLiveRegion` on scan
- Close button: `accessibilityLabel="Close barcode scanner"`, `accessibilityRole="button"`
- All interactive elements: minimum 48×48dp touch targets
- Permission denied message: `accessibilityLiveRegion="polite"`

**Error states:**
- Camera permission denied: explain how to grant, offer text search fallback
- Barcode not found in Open Food Facts: "Product not found. Try searching by name." + button to switch to text search
- Network error during barcode lookup: "Could not look up barcode. Check your connection." + retry button
- Slow lookup (>3s): show loading indicator with "Looking up barcode..."
- Invalid/unrecognized barcode format: silently ignore, keep scanning (continuous detection)

### Technical Approach

**New dependency:**
- `expo-camera` — Expo's camera module with built-in barcode scanning support
- Install via `npx expo install expo-camera` (ensures SDK compatibility)
- `expo-camera` supports EAN-13, EAN-8, UPC-A, UPC-E (the barcode types used on food products)
- Uses `useCameraPermissions()` hook for permission management
- Uses `onBarcodeScanned` prop for continuous barcode detection

**Architecture:**
1. Extend `lib/openfoodfacts.ts` — add `lookupBarcode(barcode: string)` function
2. Create `components/BarcodeScanner.tsx` — camera overlay component (reusable)
3. Update `app/nutrition/add.tsx` — add "Scan Barcode" button to Online tab
4. No new database tables — reuses existing FoodEntry + DailyLog flow
5. No new navigation routes — camera is a modal overlay, not a new screen

**Barcode API (Open Food Facts v2 Product Lookup):**
```
GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=product_name,brands,nutriments,serving_size,serving_quantity
```

- Returns single product (or `status: 0` if not found)
- Same `OFFProduct` type from Phase 41 — reuse `parseProduct()` and `isValidProduct()`
- Same User-Agent header
- Response structure: `{ status: 0|1, product: OFFProduct }`

**Data flow:**
1. Camera detects barcode → extract barcode string
2. Call `lookupBarcode(barcode)` → returns `ParsedFood | null`
3. If found → display in Online tab as single result card (same card component as search results)
4. If not found → show "not found" message with text search fallback
5. Logging flow identical to Phase 41: expand card → multiplier → Log Food → creates FoodEntry + DailyLog

**Permission flow:**
1. On "Scan Barcode" tap → check `useCameraPermissions()`
2. If not determined → request permission
3. If granted → open camera overlay
4. If denied → show explanation with Settings link (`Linking.openSettings()`)
5. Cache permission status — don't re-request if already denied (OS will block)

**Platform detection:**
```typescript
import { Platform } from "react-native";
// Only show "Scan Barcode" button on native platforms
const showBarcodeButton = Platform.OS !== "web";
```

### Scope

**In Scope:**
- "Scan Barcode" button in Online tab (native only)
- Full-screen camera overlay with barcode scanning (`expo-camera`)
- Open Food Facts barcode lookup API integration
- Product display using existing Phase 41 card component
- Logging flow (FoodEntry + DailyLog) reusing Phase 41 logic
- Dedup logic (reuse existing entry if identical name+macros)
- Camera permission handling with graceful fallback
- Haptic feedback on barcode detection
- Unit tests for barcode lookup function and validation
- Acceptance tests for barcode scan flow

**Out of Scope:**
- Manual barcode number entry (type barcode digits)
- Adding products to Open Food Facts (contribution flow)
- Scanning non-food barcodes (QR codes, other formats)
- Batch scanning (scan multiple barcodes in sequence)
- Barcode scan history
- Web platform support for barcode scanning
- Camera flash/torch toggle

### Acceptance Criteria

- [ ] Given the Online tab on a native device, When the tab is active, Then a "Scan Barcode" button is visible above the search input
- [ ] Given the Online tab on web, When the tab is active, Then the "Scan Barcode" button is NOT visible
- [ ] Given the user taps "Scan Barcode" and camera permission is not determined, When the permission dialog appears, Then the app requests camera access
- [ ] Given camera permission is granted, When the user taps "Scan Barcode", Then a full-screen camera overlay opens with a scanning region indicator
- [ ] Given the camera overlay is open, When a food barcode (EAN-13/UPC-A) is detected, Then the overlay closes, haptic feedback fires, and the product info appears as a result card in the Online tab
- [ ] Given a barcode is detected and found in Open Food Facts, When the product card is displayed, Then it shows name, brand, serving, calories, protein, carbs, fat — using the same card format as Phase 41 search results
- [ ] Given a barcode is detected but NOT found in Open Food Facts, When the result is displayed, Then show "Product not found. Try searching by name." with a button to switch to text search
- [ ] Given a barcode product is displayed, When the user taps "Log Food", Then a FoodEntry is created (or reused via dedup) and a DailyLog entry is added — identical to Phase 41 flow
- [ ] Given camera permission is denied, When the user taps "Scan Barcode", Then an explanation message appears with a link to Settings
- [ ] Given no network connection, When a barcode is detected, Then show "Could not look up barcode. Check your connection." with a retry button
- [ ] All interactive elements (scan button, close overlay, retry) have minimum 48×48dp touch targets
- [ ] PR passes all existing tests with no regressions
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] New unit tests cover: barcode lookup parsing, not-found handling, validation, permission states
- [ ] New acceptance tests cover: scan button visibility (native vs web), barcode found/not-found flows

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Barcode not in Open Food Facts | Show "Product not found" with text search fallback |
| Camera permission denied | Show explanation + link to Settings; hide camera overlay |
| Camera permission revoked mid-scan | Close overlay, show permission denied message |
| No network during barcode lookup | Show network error with retry button |
| Barcode lookup timeout (>5s) | Show "Lookup timed out. Please try again." |
| Same barcode scanned twice | Dedup — reuse existing FoodEntry if name+macros match |
| Barcode detected but product has invalid macros | Show "Product found but nutrition data is incomplete." |
| User closes overlay before scan completes | Cancel any in-flight API request (AbortController) |
| Very fast sequential scans (jitter) | Debounce barcode detection (ignore duplicate barcodes within 2s) |
| Web platform | "Scan Barcode" button is hidden; all other Online tab features work normally |
| Low light conditions | Camera handles this natively; no special UX needed |
| Barcode partially visible | Camera continues scanning until a full barcode is detected |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-camera compatibility issues | Low | Medium | Use npx expo install for SDK-compatible version; test on both platforms |
| Camera permission rejection rate | Medium | Low | Clear permission rationale; full fallback to text search |
| Barcode not found rate | Medium | Low | Graceful fallback to text search; Open Food Facts has good coverage for packaged foods |
| Performance (camera + API call) | Low | Low | Camera scanning is native; API call is lightweight |
| App size increase from expo-camera | Low | Low | expo-camera is ~2MB; acceptable for the functionality it provides |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict**: APPROVED WITH REVISIONS (2026-04-17)

**UX**: Sound. Camera overlay as modal is correct pattern. Continuous scanning + haptic feedback + auto-close is excellent. "Not found" → text search fallback is the right degradation path.

**Accessibility**: Mostly adequate. Must address: on barcode detection, announce the *product name* via `accessibilityLiveRegion`, not just "Barcode detected". Blind users need to hear what was found.

**Edge cases**: Well covered. One gap: non-food barcode (e.g., a book) found in OFF but fails `isValidProduct()` — differentiate message from "not found" to "nutrition data incomplete".

**Required corrections before implementation (T1–T5):**
1. **T1**: Use `CameraView` (not deprecated `Camera`). Specify `barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}`.
2. **T2**: Add `"expo-camera"` to `plugins` array in `app.config.ts`.
3. **T3**: Map barcode types to expo-camera format strings (`ean13`, `ean8`, `upc_a`, `upc_e`).
4. **T4**: Add testing strategy — mock expo-camera module for CI tests; note physical device required for manual camera testing.
5. **T5**: Screen reader announcement should include product name: "Found: [product name]".

**Recommendations (nice to have):**
- Extract OnlineTab to `components/OnlineTab.tsx` (add.tsx is 829 lines)
- Call `Keyboard.dismiss()` on "Scan Barcode" press
- Update User-Agent from `FitForge/0.5.0` to current version

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED**

**Feasibility**: Yes — expo-camera supports barcode scanning on SDK 55, Open Food Facts barcode lookup API is straightforward, and Phase 41 infrastructure (validation, parsing, dedup, logging) is fully reusable.

**Architecture Fit**: Excellent — extends existing patterns, no new DB tables/routes/providers. Compatible with current codebase.

**Effort**: Small-Medium (~3 files changed, ~1 new component, ~200-300 lines net new). Low risk.

**Technical Notes**:
1. Use `CameraView` from expo-camera (not legacy `Camera`). Import: `import { CameraView, useCameraPermissions } from 'expo-camera'`. Set `barcodeScannerSettings: { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }`.
2. Barcode API response (`{ status: 0|1, product: OFFProduct }`) differs from search response — needs new `OFFProductResponse` type in openfoodfacts.ts.
3. Recommend setting barcode result via existing `results` state array to reuse inline card rendering (no need to extract card component).
4. Add `expo-camera` to app.config.ts plugins with `NSCameraUsageDescription` for iOS.
5. Mock expo-camera in tests following existing expo-haptics mock pattern.

**No blocking issues found.**

### CEO Decision
**APPROVED** (2026-04-17)

Both reviewers approved. QD's required corrections (T1–T5) are incorporated into the implementation spec:
- T1: Use `CameraView` (not deprecated `Camera`) with `barcodeScannerSettings`
- T2: Add `expo-camera` to `plugins` in `app.config.ts`
- T3: Map barcode types to expo-camera format strings
- T4: Mock expo-camera in CI tests; physical device for manual camera testing
- T5: Screen reader announces product name, not generic "Barcode detected"

QD's nice-to-have recommendations (extract OnlineTab, dismiss keyboard, update User-Agent) are included as stretch goals.

Tech Lead confirmed feasibility, low risk, ~200-300 lines net new. No blocking issues.

→ Creating implementation issue.
