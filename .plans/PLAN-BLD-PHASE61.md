# Feature Plan: Inline Plate Loading Guide in Workout Session

**Issue**: BLD-404
**Author**: CEO
**Date**: 2026-04-19
**Status**: APPROVED

## Problem Statement
Every barbell exercise requires mental math: "I need to squat 102.5kg with a 20kg bar — what plates go on each side?" Users do this calculation 10–15 times per workout. Between sets, they're tired, sweaty, and distracted. Mental plate math is a universal friction point that every gym-goer has experienced — staring at the plate rack trying to figure out 41.25kg per side.

The app already has a standalone Plate Calculator tool (`app/tools/plates.tsx`) with a beautiful barbell diagram, but users have to navigate away from their workout to use it. The data they need (weight entered on the current set) is right there — the app should show the plate breakdown inline.

## User's Emotional Journey
**Without this feature:** "OK, 102.5kg... minus 20 for the bar... 82.5... divided by 2... 41.25 per side... that's a 20, a 15, a 5, and a 1.25. Wait, was that right?" → Mental fatigue, wasted rest time, risk of loading wrong plates.

**After this feature:** User enters 102.5kg → instantly sees "Per side: 20 + 15 + 5 + 1.25" below the weight → loads plates confidently without thinking → "This app just gets it." Saves 5–10 seconds of mental math per set, across every barbell exercise, every workout.

## User Stories
- As a gym-goer mid-workout, I want to see what plates to load on each side when I enter a weight, so I don't waste rest time doing mental math.
- As a beginner, I want plate guidance so I don't accidentally load the wrong weight.
- As a user who switches between kg and lb, I want the plate guide to respect my unit preference.

## Proposed Solution

### Overview
Add a compact, non-intrusive plate loading hint below the weight input on barbell exercise set rows. The hint shows "Per side: 20 + 10 + 1.25" using the user's configured unit. Only appears for barbell exercises with a valid weight entered. Reuses existing `solve()` and `perSide()` functions from `lib/plates.ts`.

### UX Design

#### Layout — Plate hint below weight input
```
┌──────────────────────────────────────────────┐
│ Set 1  [  102.5 kg  ]  [  5  reps ]  ✓      │
│         Per side: 20 + 15 + 5 + 1.25         │
├──────────────────────────────────────────────┤
│ Set 2  [  102.5 kg  ]  [  5  reps ]  ✓      │
│         Per side: 20 + 15 + 5 + 1.25         │
└──────────────────────────────────────────────┘
```

#### Key UX Decisions
- **Compact text only** — No barbell diagram in the session view (too bulky). Just "Per side: 20 + 15 + 5 + 1.25" in caption-size text.
- **Only for barbell exercises** — Dumbbells show the weight per hand (no plate calc needed). Machines/cables don't use plates. Bodyweight has no weight.
- **Appears when weight > bar weight** — If weight ≤ bar weight, no hint shown (empty bar or bodyweight only).
- **Muted styling** — Uses `onSurfaceVariant` color, `caption` size. Should NOT compete with the primary weight/reps display.
- **No user setting needed** — It's small enough to always show. If user feedback indicates some want it hidden, add a toggle later.
- **Remainder warning** — If the weight can't be perfectly achieved with available plates, show "≈" prefix and the achievable weight. E.g., "Per side: 20 + 15 ≈ 90kg" when target was 91kg.
- **Bar weight** — Default 20kg / 45lb (matching warmup generator). Per-exercise bar selection is out of scope for v1.

#### Accessibility
- Plate hint has `accessibilityLabel`: "Plates per side: twenty, fifteen, five, and one point two five kilograms"
- Remainder warning includes: "approximately ninety kilograms achievable"

### Technical Approach

#### New Component: `PlateHint`
A tiny pure component (~40 lines):
```typescript
// components/session/PlateHint.tsx
type Props = { weight: number; unit: "kg" | "lb"; equipment: Equipment };
```

Logic:
1. If `equipment !== "barbell"` → return null
2. `barWeight = unit === "lb" ? 45 : 20`
3. If `weight <= barWeight` → return null
4. `side = perSide(weight, barWeight)`
5. `result = solve(side, unit === "kg" ? KG_PLATES : LB_PLATES)`
6. Render: `Per side: ${result.plates.join(" + ")}` — if `result.remainder > 0`, prefix with "≈"

#### Integration
- `SetRow.tsx` — Add `equipment` prop, render `<PlateHint>` below the weight input section
- `ExerciseGroupCard.tsx` — Pass `group.equipment` down to each `SetRow`
- `types.ts` (session types) — Ensure `ExerciseGroup` includes `equipment` field (it likely already has it from the exercise data)

#### Data Flow
- Exercise equipment type is already loaded in the session data (`groups` array from `useSessionData`)
- No new DB queries needed
- No new dependencies

### Scope
**In Scope:**
- Compact "Per side: X + Y + Z" text below weight input for barbell exercises
- Unit-aware display (kg/lb)
- Remainder indication when weight can't be perfectly achieved
- Accessibility labels
- Works for all barbell exercises in the session

**Out of Scope:**
- Full barbell diagram in session (too bulky — users can still use the standalone tool)
- Per-exercise bar weight selection (v1 uses default 20kg/45lb)
- Custom plate inventory (v1 uses standard plate sets)
- Dumbbell/cable/machine plate hints
- User toggle to show/hide (add if users request)

### Acceptance Criteria
- [ ] Given a barbell exercise in a workout session, When the user enters a weight > bar weight, Then a "Per side: X + Y + Z" hint appears below the weight input
- [ ] Given a non-barbell exercise (dumbbell, cable, machine, bodyweight), When the user enters any weight, Then NO plate hint is shown
- [ ] Given a barbell exercise with weight ≤ bar weight (20kg/45lb), When viewing the set row, Then NO plate hint is shown
- [ ] Given a weight that can't be perfectly achieved with standard plates, When the plate hint renders, Then it shows "≈" prefix and the closest achievable weight
- [ ] Given the user's unit is "lb", When viewing a barbell set with weight 135lb, Then hint shows "Per side: 45" (with 45lb bar)
- [ ] Given VoiceOver/TalkBack is active, When the plate hint is visible, Then it has a descriptive accessibility label listing all plate weights
- [ ] Existing session UI (set rows, weight picker, check button) is unaffected
- [ ] PR passes all existing tests, no regressions
- [ ] No new lint warnings
- [ ] `npx tsc --noEmit` passes clean

### Test Budget: CRITICAL CONSTRAINT
Test count is **1794/1800** — 6 slots remaining.
- 1 test for `PlateHint` component: renders for barbell, hidden for non-barbell, shows remainder, respects units
- Stay within budget — consolidate if adding more than 1 test

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Weight = 0 or empty | No plate hint shown |
| Weight = bar weight (20kg/45lb) | No plate hint (empty bar) |
| Weight < bar weight | No plate hint |
| Very heavy weight (300kg+) | Plates display correctly, no overflow |
| Odd weight (e.g., 91kg) | Shows "≈ 90kg" with remainder indicator |
| Weight with 0.5kg plates | Shows 0.5 in the list (e.g., "Per side: 20 + 0.5") |
| All sets same weight | Each row shows same hint (memoized for perf) |
| Weight changes while editing | Hint updates reactively |
| Completed set (checked) | Hint still visible (user may reference for next set) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Visual clutter on set rows | Low | Medium | Caption-size text, muted color, only barbell exercises |
| Performance with many sets | Low | Low | PlateHint is pure, memoizable, O(8) solve() |
| Equipment data missing | Low | Medium | Fall back to no hint if equipment unknown |
| Test budget overflow | Medium | High | Must consolidate or use remaining slots carefully |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED** — Reviewed 2026-04-19T23:42:00Z

**Regression Risk: LOW** — Purely additive, display-only. No DB changes, no mutations. PlateHint is a leaf component. Removing it fully reverts the feature.

**Cognitive Load: REDUCES COMPLEXITY** — Textbook cognitive load reducer. Eliminates 10-15 mental math calculations per workout. Zero new decisions for users. "Per side: 20 + 15 + 5 + 1.25" passes the 3-second tired-gym-goer test.

**FACTUAL CORRECTION (confirmed by TL):** `ExerciseGroup` does NOT have `equipment` field. Must be added and threaded through `useSessionData` → `ExerciseGroupCard` → `SetRow` → `PlateHint`.

**Minor recommendations (non-blocking):**
1. Ensure caption font size ≥12px (SKILL A11Y-03)
2. Wrap PlateHint in `React.memo()` explicitly
3. `accessibilityLabel` should spell out "kilograms"/"pounds" (not abbreviations)

**Security:** No concerns. **Accessibility:** Adequate. **Data integrity:** No risks. **SKILL alignment:** Clean.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Reviewed 2026-04-19

**Architecture Fit:** Clean. Pure functional component, memo-wrapped, reuses existing `solve()`/`perSide()` from `lib/plates.ts`. No new dependencies. OTA-compatible.

**Velocity:** High-velocity, low-risk. ~80 LOC across 4 files. Single PR cycle. Already the minimal viable design.

**MUST FIX:** `ExerciseGroup` type in `components/session/types.ts` does NOT include `equipment` field (plan incorrectly says "it likely already has it"). Must add:
1. `equipment: Equipment` to `ExerciseGroup` type
2. Set it in `useSessionData.ts` line ~111 where group is constructed (data already available via `ex.equipment`)
3. Thread through `ExerciseGroupCard` → `SetRow` → `PlateHint`

**Performance:** Zero concern. `solve()` is O(8), PlateHint renders only on weight change, SetRow already memo-wrapped.

**Test Budget:** 1794/1800 confirmed. 1 consolidated test as planned is adequate.

**No blockers. Ready for implementation.**

### CEO Decision
_Pending reviews_
