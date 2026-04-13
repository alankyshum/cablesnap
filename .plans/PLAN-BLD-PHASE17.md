# Feature Plan: Barbell Plate Calculator (Phase 17)

**Issue**: BLD-8 (repurposed)
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

When loading a barbell, lifters must mentally calculate which plates to put on each side. For example, a target of 102.5kg requires: (102.5 - 20) / 2 = 41.25kg per side → 20 + 15 + 5 + 1.25. This mental math is error-prone — especially when fatigued mid-workout, switching between metric and imperial, or using unfamiliar plate inventory at a new gym.

Every serious gym app (Strong, Hevy, JEFIT) includes a plate calculator. FitForge currently has no such utility. Users must do the math on paper or in their head, which slows down workouts and risks loading errors.

## User Stories

- As a lifter, I want to enter a target barbell weight and instantly see which plates to load on each side
- As a lifter at an unfamiliar gym, I want to specify which plate sizes are available so the calculator works with whatever's on the rack
- As a lifter, I want the calculator to use my preferred unit (kg or lb) automatically
- As a lifter mid-workout, I want quick access to the plate calculator without leaving my session

## Proposed Solution

### Overview

A single new screen (`app/tools/plates.tsx`) that calculates barbell plate loading. Accessible from the Workouts tab via a toolbar icon and from the active session screen via a toolbar action. Uses the user's weight unit preference from body_settings. No schema changes, no new dependencies.

### UX Design

#### Screen Layout

1. **Bar Weight Selector** — segmented buttons for common bar weights:
   - kg: 20 (standard), 15 (women's), 10 (training)
   - lb: 45, 35, 25
   - Bar weight respects user's unit preference

2. **Target Weight Input** — large, prominent TextInput for total target weight
   - Shows unit label (kg/lb)
   - Step buttons (±2.5kg or ±5lb) — reuse pattern from Phase 16
   - Auto-focuses on screen load

3. **Plate Breakdown Display** — visual representation:
   - "Per side: X kg/lb" header
   - List of plates with count and size: "2 × 20kg, 1 × 5kg, 1 × 2.5kg"
   - Color-coded plate badges matching standard competition colors:
     - 25kg/55lb = red, 20kg/45lb = blue, 15kg/35lb = yellow, 10kg/25lb = green
     - 5kg/10lb = white, 2.5kg/5lb = black/dark, 1.25kg/2.5lb = silver
   - Use theme-compatible color tokens (not hardcoded hex)
   - Simple barbell visualization (horizontal bar with colored plate rectangles)

4. **Available Plates Configuration** — expandable section:
   - Default plate inventory: [25, 20, 15, 10, 5, 2.5, 1.25] kg or [55, 45, 35, 25, 10, 5, 2.5] lb
   - Each plate size shows a toggle (on/off) and count selector (1-10 per side)
   - Defaults: 10 of each plate (unlimited for practical purposes)
   - User can disable plate sizes not available at their gym

5. **Error/Edge States:**
   - Target weight less than bar weight → "Target must be greater than bar weight ({barWeight}kg)"
   - Impossible weight (can't make with available plates) → "Cannot make {X}kg with available plates. Closest: {Y}kg"
   - Odd weight (not divisible into plates) → show closest achievable weight

#### Navigation

- **From Workouts tab**: toolbar IconButton (calculator icon) in the header
- **From active session**: toolbar IconButton in the session header
- **Stack screen** (not a tab) — `app/tools/plates.tsx`

### Technical Approach

#### Plate Calculation Algorithm

Greedy approach (works for standard plate sets):
```
function calculatePlates(target, barWeight, availablePlates):
  perSide = (target - barWeight) / 2
  if perSide < 0: return error "Target less than bar"
  
  result = []
  remaining = perSide
  for plate in availablePlates (sorted descending):
    while remaining >= plate.weight and plate.remaining > 0:
      result.push(plate.weight)
      remaining -= plate.weight
      plate.remaining -= 1
  
  if remaining > 0.001: return error "Cannot make exact weight"
  return result
```

#### State Management

- Target weight: local state (TextInput)
- Bar weight: local state (segmented buttons)
- Available plates: local state with defaults based on unit
- Unit: fetched from `getBodySettings()` on mount
- No persistence needed — plate calculator is ephemeral

#### File Structure

- `app/tools/plates.tsx` — main plate calculator screen
- No new lib files needed (algorithm is simple, lives in the component)
- No schema changes
- No new dependencies

### Scope

**In Scope:**
- Plate calculator screen with target input, bar selection, plate breakdown
- Simple barbell visualization with colored plates
- Available plates configuration (toggle/count per size)
- Default plate inventories for kg and lb
- Navigation from Workouts tab and active session
- Weight unit from body_settings
- Step buttons on target weight input (reuse Phase 16 pattern)
- Error handling for impossible/invalid weights

**Out of Scope:**
- Persisting plate configuration (advanced — future phase if needed)
- Warm-up set calculator (separate feature)
- 1RM calculator (separate feature)
- Barbell type database (Olympic, hex bar, etc.)
- Custom plate sizes beyond standard sets
- Sound effects or animations beyond basic color coding

### Acceptance Criteria

- [ ] Given a user opens the plate calculator When they enter 100 and bar=20kg Then display shows "Per side: 40kg → 1×20kg, 1×15kg, 1×5kg"
- [ ] Given a user with lb preference When they enter 135 and bar=45lb Then display shows "Per side: 45lb → 1×45lb"
- [ ] Given a user enters 25 with bar=20kg Then display shows "Per side: 2.5kg → 1×2.5kg"
- [ ] Given a user enters 15 with bar=20kg Then display shows error "Target must be greater than bar weight (20kg)"
- [ ] Given a user disables 2.5kg plates and enters 102.5 with bar=20kg Then display shows "Cannot make 41.25kg with available plates. Closest: 40kg"
- [ ] Given the user taps the plus step button Then target weight increases by 2.5kg (or 5lb)
- [ ] Given a user accesses from the Workouts tab Then the calculator opens with their unit preference
- [ ] Given a user accesses from an active session Then the calculator opens and back returns to the session
- [ ] Plate badges use theme-compatible colors (no hardcoded hex)
- [ ] TypeScript compiles with zero errors (`bun typecheck`)
- [ ] App starts without crashes
- [ ] Existing workout flows work unchanged

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Target = bar weight | "Per side: 0kg — no plates needed" (valid, show empty barbell) |
| Target < bar weight | Error message, no plate breakdown |
| Target = 0 | Error message |
| Very heavy weight (500kg) | Calculate normally — greedy algo handles any value |
| Fractional weight that can't be made | Show closest achievable weight and the difference |
| All plates disabled | "No plates available" message |
| User switches unit in Settings | Calculator reflects change on next open (reads body_settings) |
| Step button from empty field | Starts from bar weight + step |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Greedy algorithm fails for exotic plate sets | Very Low | Low | Standard plate sets are always greedy-solvable. Edge case for non-standard sets shows "closest" fallback. |
| Too many plate sizes crowd the UI | Low | Medium | Default to collapsed "Available Plates" section. Most users won't need to change defaults. |
| Colors for plate badges don't work in dark mode | Medium | Medium | Use theme-compatible color definitions with adequate contrast for both modes. |

### Accessibility

- Target weight TextInput: `accessibilityLabel="Target barbell weight"`
- Bar weight buttons: `accessibilityLabel="Bar weight {N} kilograms/pounds"`
- Step buttons: reuse Phase 16 pattern with `accessibilityLabel="Increase/Decrease target weight by {step}"`
- Plate breakdown: `accessibilityLabel="{count} times {weight} kilogram/pound plate"` on each plate badge
- Color-coded plates: colors are supplementary — plate weight is always displayed as text
- Available plate toggles: `accessibilityLabel="Toggle {weight} kilogram/pound plates"`

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED — Technically sound, minimal risk, no new dependencies, fits existing architecture perfectly.

**Key findings:**
- Fully compatible with existing Expo Router stack screen pattern
- No schema changes, no new dependencies — pure UI feature
- Greedy algorithm provably correct for standard plate sets
- `getBodySettings()` already provides typed `weight_unit` — no additional work

**Implementation guidance:**
1. Add `plateColors` to `constants/theme.ts` as semantic map (light/dark aware, WCAG contrast) — do NOT hardcode hex in component (ref: BLD-9/BLD-13 theming pitfall)
2. Barbell visualization is optional — colored plate badges with text are sufficient for Phase 17
3. "Closest achievable weight" should round DOWN (can't load plates you don't have)
4. Reuse Phase 16 step button pattern (inline or extract shared component)

### CEO Decision
_Pending reviews_
