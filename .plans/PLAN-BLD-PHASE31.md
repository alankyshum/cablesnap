# Feature Plan: Plate Calculator

**Issue**: BLD-83
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

Gym-goers constantly need to calculate which plates to load on a barbell. After using the 1RM calculator to find their target percentage, users have to mentally figure out the plate combination — a tedious, error-prone process, especially mid-workout. Every serious fitness app includes a plate calculator. FitForge currently has a 1RM calculator (`app/tools/rm.tsx`) but no way to translate those numbers into actual plates on a bar. This gap forces users out of the app and into mental math or a competing tool.

## User Stories

- As a gym-goer, I want to enter a target weight and instantly see which plates to load on each side of the barbell, so I don't waste time counting plates between sets
- As a lifter using the 1RM calculator, I want to tap a weight in the percentage table and see the plate breakdown, so I can seamlessly go from planning to loading
- As a home gym owner with a non-standard plate collection, I want to customize my available plates, so the calculator shows combinations I can actually achieve

## Proposed Solution

### Overview

Add a Plate Calculator screen at `app/tools/plate.tsx` alongside the existing 1RM calculator. The screen accepts a target weight, subtracts the bar weight, and shows the optimal plate combination per side using a greedy algorithm (largest plates first). Includes a visual barbell diagram with color-coded plates. Users can customize bar weight and available plate inventory. Integrates with the 1RM percentage table via deep linking.

### UX Design

**Screen Layout (top to bottom):**
1. **Target weight input** — numeric TextInput with unit suffix (kg/lb)
2. **Bar weight selector** — segmented buttons for common bars (20kg/45lb standard, 15kg/35lb women's, 10kg/25lb EZ curl, or custom)
3. **Per-side weight** — calculated label: "(target - bar) / 2 = X per side"
4. **Barbell diagram** — horizontal visual: bar center → plates from inside out, color-coded by weight, mirrored on both sides
5. **Plate list** — explicit list of plates per side (e.g., "1× 20kg, 1× 10kg, 1× 2.5kg")
6. **Total confirmation** — "Total: 85kg (bar 20kg + 2×32.5kg)"

**Color-coded plates (standard gym colors — IWF/IPF spec):**
| Weight (kg) | Weight (lb) | Color |
|------------|------------|-------|
| 25 | 55 | Red |
| 20 | 45 | Blue |
| 15 | 35 | Yellow |
| 10 | 25 | Green |
| 5 | 10 | White |
| 2.5 | 5 | Black |
| 1.25 | 2.5 | Chrome/Silver |
| 0.5 | 1 | Gray (thin) |

**Plate diagram rendering:**
- Use a horizontal `View` with colored rectangles of varying height (heavier = taller)
- Bar rendered as a thin gray rectangle in the center
- Plates stacked from inside (near bar) to outside (near collar)
- Mirror both sides for symmetry
- Aspect ratios match real plate proportions roughly

**Navigation:**
- Accessible from the tools section (add a "Plate Calculator" card to the exercises tab tools area, or add a tools tab)
- Currently tools are accessed via direct navigation. Add `app/tools/plate.tsx` and register the route.
- Deep link from 1RM calculator: tapping a row in the percentage table navigates to the plate calculator with that weight pre-filled

**Edge states:**
- Weight ≤ bar weight → show "Weight must exceed bar weight" message
- Unachievable exact weight (not divisible by smallest plate) → round to nearest achievable, show "Rounded to X (nearest achievable)"
- No plates available → show "Add plates in settings"
- Target = 0 → show empty bar diagram

### Technical Approach

**New files:**
1. `app/tools/plate.tsx` — Plate Calculator screen (~200-250 lines)
2. `lib/plates.ts` — Pure logic: greedy algorithm, standard plate sets, types (~80 lines)
3. `__tests__/lib/plates.test.ts` — Unit tests for plate calculation logic

**Algorithm (greedy, per side):**
```typescript
function solve(target: number, available: number[]): { plates: number[], remainder: number } {
  // target = weight per side = (totalWeight - barWeight) / 2
  // available = sorted descending list of plate weights (with duplicates for quantity)
  // Greedy: pick largest plate that fits, repeat
  const plates: number[] = []
  let remaining = target
  for (const plate of available) {
    while (remaining >= plate) {
      plates.push(plate)
      remaining -= plate
      remaining = Math.round(remaining * 1000) / 1000 // float precision
    }
  }
  return { plates, remainder: remaining }
}
```

**Standard plate sets (defaults):**
- **Metric (kg):** 2× each of [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]
- **Imperial (lb):** 2× each of [55, 45, 35, 25, 10, 5, 2.5, 1]

**Plate inventory customization (Phase 32 — OUT OF SCOPE):**
Custom plate inventory editing is deferred. Phase 31 uses the standard plate sets above. Users who need custom plates can use mental math for now. If demand is clear, Phase 32 adds a plate inventory editor in settings.

**Bar weight defaults by unit:**
- kg: 20 (standard Olympic), 15, 10, or custom
- lb: 45 (standard Olympic), 35, 25, or custom

**Integration with 1RM calculator:**
- In `app/tools/rm.tsx`, each row in the percentage table gets a plate icon button
- Tapping it navigates to `/tools/plate?weight=X&unit=kg` with the weight pre-filled
- The plate calculator reads these query params on mount via `useLocalSearchParams`

**No DB changes needed** — no persistent state. Bar weight preference could be stored in body_settings later, but for Phase 31 it defaults to 20kg/45lb and resets on screen unmount. This keeps scope tight.

**Accessibility:**
- Plate diagram: `accessibilityLabel="Barbell loaded with [list of plates] on each side, total [weight]"`
- Individual plate visuals are decorative — the plate list below provides text alternative
- All inputs have proper `accessibilityLabel` attributes
- Color coding paired with weight labels (not color-only distinction) per WCAG

**Performance:**
- Algorithm is O(n) per plate set — trivial performance
- No DB queries (pure calculation)
- Re-renders only on input change

### Scope

**In Scope:**
- Plate calculator screen with visual barbell diagram
- Greedy algorithm for optimal plate loading
- Standard plate sets for kg and lb
- Bar weight selection (presets + custom)
- Color-coded plate diagram using IWF colors
- Integration with 1RM calculator (deep link from percentage table)
- Unit system from body_settings (auto-detect kg/lb)
- Rounding to nearest achievable weight
- Accessibility for all UI elements
- Unit tests for calculation logic

**Out of Scope:**
- Custom plate inventory editor (Phase 32+)
- Warmup set plate recommendations (Phase 32+)
- Plate calculator widget on session screen (Phase 32+)
- Saving favorite/recent calculations
- Competition-specific plate loading order (calibrated plates)
- Collar weight consideration

### Acceptance Criteria

- [ ] Given a target weight of 100kg and a 20kg bar, When the user opens the plate calculator, Then it shows 1×20kg + 1×15kg + 1×5kg per side (40kg per side)
- [ ] Given a target weight of 135lb and a 45lb bar, When the user opens the plate calculator, Then it shows 1×45lb per side
- [ ] Given a target weight of 67.5kg and a 20kg bar, When the user opens the plate calculator, Then it shows the nearest achievable combination with a "Rounded" notice if exact match is impossible
- [ ] Given the user taps a row in the 1RM percentage table, When the plate calculator opens, Then the weight is pre-filled from the selected percentage
- [ ] Given a target weight less than or equal to the bar weight, When the user enters it, Then a message says "Weight must exceed bar weight"
- [ ] Given the plate calculator is open, When the user views the barbell diagram, Then plates are color-coded by weight using standard competition colors
- [ ] Given a screen reader is active, When the user views the plate calculator, Then the barbell diagram has a descriptive accessibility label listing all plates and total weight
- [ ] All existing 310+ tests pass with no regressions
- [ ] New unit tests cover the plate calculation algorithm (at least 8 test cases)
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Target weight = 0 | Show empty bar only |
| Target weight < bar weight | Show "Weight must exceed bar weight" |
| Target weight = bar weight | Show empty bar (0 plates per side) |
| Odd remainder after dividing by 2 | Round per-side to nearest 0.5kg/1lb, show rounded notice |
| Weight not achievable with available plates | Show closest achievable weight, display "Rounded to X" |
| Very large weight (e.g., 500kg) | Algorithm handles gracefully — show many plates |
| Decimal input (e.g., 72.5) | Accept and calculate correctly |
| Negative input | Treat as invalid — show error |
| Non-numeric input | Ignore invalid characters (numeric keyboard) |
| Switching bar weight | Recalculate immediately |
| Deep link with pre-filled weight | Weight appears in input, calculation runs automatically |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Floating point rounding errors | Medium | Low | Round to 3 decimal places after each subtraction |
| Plate colors not accessible | Low | Medium | Always pair color with weight label text |
| Navigation registration | Low | Low | Follow existing pattern from rm.tsx |
| 1RM integration breaks existing screen | Low | Medium | Only add an icon button per row, no structural changes |

## Review Feedback

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** (3 Critical, 5 Major)

**Strong plan.** Problem is real, greedy algorithm is correct, IWF colors are the right standard, 1RM deep-link is excellent product thinking.

**Critical (must fix):**
1. Plate inventory "2× each" is ambiguous (per-side or total?) and too low for serious lifters. Clarify and increase (or use unlimited denominations as TL suggests).
2. Touch targets not specified for bar weight selector and 1RM plate icon — must be ≥48×48dp per SKILL A11Y-TT.
3. White/chrome plates invisible in dark mode — need borders or theme-aware outlines.

**Major (should fix):**
4. Navigation entry point is vague — specify exactly where (header icon? menu?).
5. No unit toggle on plate calc screen — user must go to settings to switch kg/lb.
6. Bar weight selector missing accessibilityRole (radiogroup) and accessibilityState (selected).
7. Result container needs accessibilityLiveRegion="polite" for screen reader updates.
8. Inventory exhaustion: what happens when plates run out for very heavy targets?

**Minor/Nice-to-have:** Integer arithmetic in grams (eliminates float issues), landscape support, haptic feedback on calculation.

Full review posted as BLD-83 issue comment.

### Tech Lead (Technical Feasibility)
**Verdict: NEEDS REVISION** (2 issues — 1 CRITICAL, 1 MAJOR)

Fully buildable. Pattern mirrors existing `lib/rm.ts` + `app/tools/rm.tsx` exactly. ~330 new lines, no new deps, no DB changes.

**CRITICAL — File naming:** Plan says `plate.tsx` but route registered as `tools/plates` (`app/_layout.tsx:265`). File must be `plates.tsx`. Deep link path must be `/tools/plates`.

**MAJOR — Unlimited plates:** "2× each" caps max total at ~178.5kg — below intermediate deadlifts. Use unlimited denominations (no quantity cap). The greedy `while` loop already handles this. Custom inventory limits belong in Phase 32.

Both fixes simplify the plan. All else is sound — architecture fit is excellent, scope is tight, risk is very low.

### CEO Decision
_Pending reviews_
