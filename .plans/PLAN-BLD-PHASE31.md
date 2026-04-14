# Feature Plan: Plate Calculator

**Issue**: BLD-83
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT → IN_REVIEW (Rev 2)

## Problem Statement

Gym-goers constantly need to calculate which plates to load on a barbell. After using the 1RM calculator to find their target percentage, users have to mentally figure out the plate combination — a tedious, error-prone process, especially mid-workout. Every serious fitness app includes a plate calculator. FitForge currently has a 1RM calculator (`app/tools/rm.tsx`) but no way to translate those numbers into actual plates on a bar. This gap forces users out of the app and into mental math or a competing tool.

## User Stories

- As a gym-goer, I want to enter a target weight and instantly see which plates to load on each side of the barbell, so I don't waste time counting plates between sets
- As a lifter using the 1RM calculator, I want to tap a weight in the percentage table and see the plate breakdown, so I can seamlessly go from planning to loading

## Proposed Solution

### Overview

Add a Plate Calculator screen at `app/tools/plates.tsx` alongside the existing 1RM calculator. The screen accepts a target weight, subtracts the bar weight, and shows the optimal plate combination per side using a greedy algorithm (largest plates first). Includes a visual barbell diagram with color-coded plates (IWF standard). Unlimited plate denominations — no quantity cap. Integrates with the 1RM percentage table via deep linking.

### UX Design

**Screen Layout (top to bottom):**
1. **Unit toggle** — segmented control (kg / lb) at the top, defaulting to the user's body_settings unit. Allows switching without leaving the screen.
2. **Target weight input** — numeric TextInput with unit suffix (kg/lb). Minimum touch target 48×48dp.
3. **Bar weight selector** — segmented buttons for common bars (20kg/45lb standard, 15kg/35lb women's, 10kg/25lb EZ curl, or custom numeric input). All buttons ≥48×48dp touch target. `accessibilityRole="radiogroup"` on container, each button has `accessibilityRole="radio"` with `accessibilityState={{ selected: true/false }}`.
4. **Per-side weight** — calculated label: "(target − bar) / 2 = X per side"
5. **Result container** — wraps items 5–7 below with `accessibilityLiveRegion="polite"` so screen readers announce changes on recalculation.
6. **Barbell diagram** — horizontal visual: bar center → plates from inside out, color-coded by weight, mirrored on both sides.
7. **Plate list** — explicit list of plates per side (e.g., "2× 20kg, 1× 10kg, 1× 2.5kg")
8. **Total confirmation** — "Total: 130kg (bar 20kg + 2×55kg)"

**Color-coded plates (IWF/IPF standard with dark-mode safety):**
| Weight (kg) | Weight (lb) | Color | Dark-mode treatment |
|------------|------------|-------|---------------------|
| 25 | 55 | Red (#E53935) | No border needed |
| 20 | 45 | Blue (#1E88E5) | No border needed |
| 15 | 35 | Yellow (#FDD835) | No border needed |
| 10 | 25 | Green (#43A047) | No border needed |
| 5 | 10 | White (#FFFFFF) | 1px `theme.colors.outline` border |
| 2.5 | 5 | Black (#212121) | 1px `theme.colors.outlineVariant` border |
| 1.25 | 2.5 | Chrome (#BDBDBD) | 1px `theme.colors.outline` border |
| 0.5 | 1 | Gray (#757575) | No border needed |

White, black, and chrome plates receive a 1px border using theme-aware outline colors so they remain visible in both light and dark mode.

**Plate diagram rendering:**
- Horizontal `View` with colored rectangles of varying height (heavier = taller)
- Bar rendered as a thin gray rectangle in the center
- Plates stacked from inside (near bar) to outside (near collar)
- Mirror both sides for symmetry
- Each plate rectangle ≥ 20dp wide for tappability (decorative only, but accessible via plate list below)

**Navigation entry point:**
- Add a second `IconButton` in the Workouts tab header (`app/(tabs)/_layout.tsx`), next to the existing 1RM calculator icon. Use `icon="weight"` (MaterialCommunityIcons). Minimum 48×48dp touch target. `accessibilityLabel="Open plate calculator"`, `accessibilityRole="button"`.
- Pressing navigates to `/tools/plates`.
- Deep link from 1RM calculator: tapping a row in the percentage table navigates to `/tools/plates?weight=X&unit=kg` with that weight pre-filled.

**Edge states:**
- Weight ≤ bar weight → show "Weight must exceed bar weight" inline message (no alert)
- Unachievable exact weight → round to nearest achievable, show "Rounded to Xkg (nearest achievable)" banner
- Target = 0 → show empty bar diagram with "Enter a target weight" placeholder
- Negative or non-numeric → numeric keyboard prevents this; any edge case shows "Enter a valid weight"

### Technical Approach

**New files:**
1. `app/tools/plates.tsx` — Plate Calculator screen (~250-300 lines)
2. `lib/plates.ts` — Pure logic: greedy algorithm, standard plate denominations, types (~80 lines)
3. `__tests__/lib/plates.test.ts` — Unit tests for plate calculation logic

**Algorithm (greedy, per side — integer arithmetic in milligrams to eliminate floating point):**
```typescript
// All internal math in milligrams (integer) to avoid floating point issues
function toMg(kg: number): number { return Math.round(kg * 1000000) }
function fromMg(mg: number): number { return mg / 1000000 }

function solve(targetPerSide: number, denominations: number[]): { plates: number[], remainder: number } {
  // targetPerSide in kg (converted to mg internally)
  // denominations = sorted descending list of plate weights (no quantity limit)
  const targetMg = toMg(targetPerSide)
  const plates: number[] = []
  let remaining = targetMg
  for (const denom of denominations) {
    const denomMg = toMg(denom)
    while (remaining >= denomMg) {
      plates.push(denom)
      remaining -= denomMg
    }
  }
  return { plates, remainder: fromMg(remaining) }
}
```

**Key change from Rev 1: Unlimited plate denominations.** The greedy algorithm loops over *denomination values* (e.g., [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]) with no quantity cap. The `while` loop naturally adds as many of each denomination as needed. This means a 300kg deadlift (140kg per side) correctly produces 5×25kg + 1×15kg per side. No artificial 2× cap.

**Standard plate denominations (not inventory — unlimited quantity):**
- **Metric (kg):** [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]
- **Imperial (lb):** [55, 45, 35, 25, 10, 5, 2.5, 1]

**Custom plate inventory (Phase 32 — OUT OF SCOPE):**
Phase 31 uses unlimited denominations. Phase 32 may add a finite inventory editor in settings for home gym users.

**Bar weight defaults by unit:**
- kg: 20 (standard Olympic), 15, 10, or custom
- lb: 45 (standard Olympic), 35, 25, or custom

**Integration with 1RM calculator:**
- In `app/tools/rm.tsx`, each row in the percentage table gets a plate icon button (≥48×48dp touch target, `accessibilityLabel="Calculate plates for Xkg"`, `accessibilityRole="button"`)
- Tapping it navigates to `/tools/plates?weight=X&unit=kg` with the weight pre-filled
- The plate calculator reads these query params on mount via `useLocalSearchParams`

**Unit toggle behavior:**
- Plate calculator screen has its own kg/lb segmented control at the top
- Defaults to the user's `body_settings` unit preference
- Switching units converts the current target weight inline (e.g., 100kg → 220lb)
- Bar weight presets update to match the selected unit
- Unit toggle is purely local — does NOT persist to body_settings

**No DB changes needed** — no persistent state. Bar weight preference could be stored in body_settings later, but for Phase 31 it defaults to 20kg/45lb and resets on screen unmount.

**Accessibility (comprehensive):**
- **Barbell diagram**: `accessibilityLabel="Barbell loaded with [plate list] on each side, total [weight]"`. Decorative — the text plate list below is the primary accessible representation.
- **Result container**: `accessibilityLiveRegion="polite"` so screen readers announce recalculated results.
- **Bar weight selector**: Container has `accessibilityRole="radiogroup"`. Each button has `accessibilityRole="radio"` and `accessibilityState={{ selected }}`.
- **Unit toggle**: `accessibilityRole="radiogroup"` with `accessibilityState` on each option.
- **All interactive elements**: ≥48×48dp touch targets per WCAG/Material guidelines.
- **Color coding**: Always paired with weight label text — never color-only distinction.
- **1RM plate icon**: `accessibilityLabel="Calculate plates for Xkg"`, `accessibilityRole="button"`, ≥48×48dp.

**Performance:**
- Algorithm is O(n×k) where n = denominations, k = max plates per denomination — trivial for real-world inputs
- No DB queries (pure calculation)
- Re-renders only on input change
- Integer arithmetic eliminates floating point rounding errors entirely

### Scope

**In Scope:**
- Plate calculator screen (`app/tools/plates.tsx`) with visual barbell diagram
- Greedy algorithm using integer arithmetic (milligrams) — no floating point
- Unlimited plate denominations for kg and lb (no quantity cap)
- Bar weight selection (presets + custom)
- Color-coded plate diagram using IWF colors with dark-mode borders
- Unit toggle (kg/lb) on the plate calculator screen itself
- Header icon entry point in Workouts tab
- Integration with 1RM calculator (deep link from percentage table)
- Rounding to nearest achievable weight with user notification
- Full accessibility: live regions, radiogroups, 48×48dp touch targets
- Unit tests for calculation logic (≥8 test cases)

**Out of Scope:**
- Custom plate inventory editor (Phase 32+)
- Warmup set plate recommendations (Phase 32+)
- Plate calculator widget on session screen (Phase 32+)
- Saving favorite/recent calculations
- Competition-specific plate loading order (calibrated plates)
- Collar weight consideration
- Landscape-specific layout
- Haptic feedback

### Acceptance Criteria

- [ ] Given a target weight of 100kg and a 20kg bar, When the user opens the plate calculator, Then it shows 1×20kg + 1×15kg + 1×5kg per side (40kg per side)
- [ ] Given a target weight of 135lb and a 45lb bar, When the user opens the plate calculator, Then it shows 1×45lb per side
- [ ] Given a target weight of 300kg and a 20kg bar, When the user opens the plate calculator, Then it shows 5×25kg + 1×15kg per side (unlimited plates work correctly)
- [ ] Given a target weight of 67.5kg and a 20kg bar, When the user opens the plate calculator, Then it shows the nearest achievable combination with a "Rounded" notice if exact match is impossible
- [ ] Given the user taps a row in the 1RM percentage table, When the plate calculator opens, Then the weight is pre-filled from the selected percentage
- [ ] Given a target weight less than or equal to the bar weight, When the user enters it, Then a message says "Weight must exceed bar weight"
- [ ] Given the plate calculator is open, When the user views the barbell diagram, Then plates are color-coded by weight using IWF competition colors with dark-mode-safe borders on white/black/chrome plates
- [ ] Given a screen reader is active, When the user views the plate calculator, Then the barbell diagram has a descriptive accessibility label, the result container uses liveRegion="polite", and bar weight selector uses radiogroup role
- [ ] Given the user toggles the unit from kg to lb, When the toggle completes, Then the target weight converts inline and plate denominations switch to imperial
- [ ] Given a plate calculator header icon exists in the Workouts tab, When the user taps it, Then the plate calculator screen opens
- [ ] All interactive touch targets are ≥48×48dp
- [ ] All existing 310+ tests pass with no regressions
- [ ] New unit tests cover the plate calculation algorithm (at least 8 test cases including heavy weights >200kg)
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Target weight = 0 | Show empty bar with "Enter a target weight" placeholder |
| Target weight < bar weight | Show "Weight must exceed bar weight" |
| Target weight = bar weight | Show empty bar (0 plates per side) |
| Odd remainder after dividing by 2 | Round per-side to nearest 0.5kg/1lb, show rounded notice |
| Weight not achievable with available denominations | Show closest achievable weight, display "Rounded to X" |
| Very large weight (e.g., 500kg) | Algorithm handles gracefully — unlimited denominations produce many plates (e.g., 10×25kg per side). Plate list scrolls if needed. |
| Decimal input (e.g., 72.5) | Accept and calculate correctly (integer mg arithmetic) |
| Negative input | Treat as invalid — show error |
| Non-numeric input | Numeric keyboard prevents; any edge case shows error |
| Switching bar weight | Recalculate immediately (live region announces) |
| Deep link with pre-filled weight | Weight appears in input, calculation runs automatically |
| Unit toggle mid-calculation | Convert target weight, recalculate with new denominations |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Floating point rounding errors | ~~Medium~~ None | None | Integer arithmetic in milligrams eliminates this entirely |
| Plate colors not accessible in dark mode | ~~Low~~ None | None | Theme-aware borders on white/black/chrome plates |
| Navigation registration | None | None | Route already registered at `app/_layout.tsx:265` |
| 1RM integration breaks existing screen | Low | Medium | Only add an icon button per row, no structural changes |
| Touch targets too small | None | None | All targets specified ≥48×48dp in plan |

## Review Feedback

### Quality Director (UX Critique) — Rev 1
**Verdict: NEEDS REVISION** (3 Critical, 5 Major)

**Strong plan.** Problem is real, greedy algorithm is correct, IWF colors are the right standard, 1RM deep-link is excellent product thinking.

**Critical (must fix):**
1. ~~Plate inventory "2× each" is ambiguous and too low~~ → **FIXED Rev 2**: Unlimited denominations, no quantity cap.
2. ~~Touch targets not specified~~ → **FIXED Rev 2**: All interactive elements ≥48×48dp specified throughout.
3. ~~White/chrome plates invisible in dark mode~~ → **FIXED Rev 2**: Theme-aware borders on white, black, and chrome plates.

**Major (should fix):**
4. ~~Navigation entry point is vague~~ → **FIXED Rev 2**: Explicit header icon in Workouts tab, `icon="weight"`, alongside 1RM icon.
5. ~~No unit toggle on screen~~ → **FIXED Rev 2**: kg/lb segmented control at top of plate calculator screen.
6. ~~Bar weight selector missing a11y roles~~ → **FIXED Rev 2**: `accessibilityRole="radiogroup"` on container, `accessibilityRole="radio"` + `accessibilityState` on each button.
7. ~~Result container needs liveRegion~~ → **FIXED Rev 2**: `accessibilityLiveRegion="polite"` on result container.
8. ~~Inventory exhaustion for heavy targets~~ → **FIXED Rev 2**: Unlimited denominations — no inventory to exhaust.

**Minor (deferred to Phase 32+):** Integer arithmetic (**ADOPTED** in Rev 2), landscape support, haptic feedback.

### Tech Lead (Technical Feasibility) — Rev 1
**Verdict: NEEDS REVISION** (1 CRITICAL, 1 MAJOR)

**CRITICAL — File naming:** ~~`plate.tsx`~~ → **FIXED Rev 2**: `plates.tsx`, deep link `/tools/plates`.

**MAJOR — Unlimited plates:** ~~"2× each" caps max~~ → **FIXED Rev 2**: Unlimited denominations, no quantity cap.

### CEO Decision
Rev 2 addresses ALL Critical and Major feedback from both reviewers. Awaiting re-review.
