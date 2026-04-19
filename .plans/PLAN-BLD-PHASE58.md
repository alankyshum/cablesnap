# Feature Plan: Smart Warmup Set Generator

**Issue**: BLD-397
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement

Every gym-goer needs to warm up before lifting heavy. Currently in FitForge, users manually add warmup sets one by one, scroll to the right weight on each, change the set type to "warmup," and repeat 3-4 times. That's ~12 interactions per exercise just for warmup. Across 4-5 exercises in a workout, that's 50+ taps before the real work begins. Most users skip warmup logging entirely — which means their volume tracking is incomplete.

**Why now?** Phase 57 just delivered the rest timer in the header, making the mid-workout experience seamless. The biggest remaining friction point is workout *start* — the warmup phase. The app already has all the data needed: previous working weights, plate calculator with bar weights, and warmup set type support. This is pure UX integration.

## User's Emotional Journey

**Without this feature:** "Ugh, I need to add 4 warmup sets for bench. Let me add a set... scroll to 135... change type to warmup... add another... scroll to 185..." → tedious, often skipped, volume data incomplete.

**After this feature:** "I tap 'Add Warmups' and boom — bar × 10, 135 × 5, 185 × 3, 205 × 2 are all there. I just start lifting." → fast, confident, complete data.

## User Stories

- As a lifter, I want to auto-generate warmup sets for an exercise so I can start lifting faster
- As a lifter, I want warmup weights to use plate-friendly increments so I don't waste time calculating
- As a lifter, I want to customize my warmup scheme (number of sets, rep ranges) so it matches my routine
- As a lifter, I want warmup sets to auto-fill based on my last working weight so I don't enter anything manually

## Proposed Solution

### Overview

Add a "Add Warmups" button to the exercise group header in the active session view. Tapping it generates 3-4 warmup sets with progressively increasing weights based on the user's target working weight (from previous session or suggestion). Weights are rounded to plate-friendly increments.

### UX Design

**Trigger:** An "Add Warmups" button appears in the exercise group card header area, only when:
- The exercise has 0 warmup sets currently
- The exercise is a weighted exercise (not bodyweight-only)
- A working weight reference exists (previous session data or suggestion)

**One-tap flow:**
1. User taps "Add Warmups" button (icon: `dumbbell` or `fire`)
2. App reads target working weight from: suggestion > previous session > null
3. App generates warmup sets using the default scheme (see below)
4. Sets are inserted BEFORE existing working sets
5. All generated sets are marked `set_type: "warmup"`
6. Light haptic feedback confirms the action
7. Button disappears (warmup sets now exist)

**Long-press flow (v2 — out of scope for now):**
- Could open a scheme picker in the future

**Default warmup scheme (percentage of working weight):**

| Set | % of Working | Reps | Example (225lb working) |
|-----|-------------|------|-------------------------|
| 1   | Bar only    | 10   | 45 × 10                |
| 2   | ~50%        | 5    | 115 → 115  5          |
| 3   | ~70%        | 3    | 160 → 155 × 3          |
| 4   | ~85%        | 2    | 190 → 185 × 2          |

**Plate-friendly rounding:** Weights are rounded DOWN to the nearest plate-friendly weight using the existing `solve()` function from `lib/plates.ts`. For example:
- 50% of 225 = 112.5 → round to 115 (bar + 35s) or 110 (bar + 32.5s)
- Strategy: round to nearest weight achievable with available plates and current bar weight

**For light working weights (≤ bar weight):** Skip warmup generation (bar-only exercises don't need plate warmups). Show no button.

**For bodyweight exercises:** No warmup button shown (already filtered by `is_bodyweight`).

### Technical Approach

**New utility: `lib/warmup.ts`**
- `generateWarmupSets(workingWeight: number, barWeight: number, unit: "kg" | "lb"): WarmupSet[]`
- Takes working weight and bar weight, returns array of `{ weight, reps, set_type: "warmup" }`
- Uses plate-friendly rounding via `solve()` from `lib/plates.ts`
- Scheme: bar × 10, 50% × 5, 70%  3, 85% × 2
- Filters out sets where weight ≤ bar weight (except the bar-only set)
- If working weight < 2× bar weight, reduce to 2 warmup sets (bar × 10, ~75% × 3)

**New DB function: `addWarmupSets(sessionId, exerciseId, sets: WarmupSet[]): Promise<void>`**
- Inserts multiple sets with `set_type: "warmup"` and `is_warmup: 1`
- Sets `set_number` to 1..N, then renumbers existing working sets to N+1..M
- Uses a transaction for atomicity

**Modified component: `ExerciseGroupCard.tsx`**
- Add "Add Warmups" button in header area (below exercise name, above set table)
- Button visibility: `showWarmupButton = !group.is_bodyweight && hasWorkingWeight && !hasExistingWarmups`
- On press: call `generateWarmupSets()`, then `addWarmupSets()`, then refresh group data
- Light haptic on success

**Settings (app_settings):**
- `warmup_bar_weight_kg`: number, default 20 (for kg users) — already configurable in plate calculator
- `warmup_bar_weight_lb`: number, default 45 (for lb users) — already configurable in plate calculator
- Reuse existing bar weight setting from plate calculator if it exists

### Scope

**In Scope:**
- `lib/warmup.ts` — warmup set generation logic with plate-friendly rounding
- `addWarmupSets` DB function — batch insert with set renumbering
- "Add Warmups" button in `ExerciseGroupCard` header
- Default warmup scheme (bar × 10, 50% × 5, 70% × 3, 85% × 2)
- Plate-friendly weight rounding using existing `lib/plates.ts`
- Unit tests for warmup generation logic
- Haptic feedback on warmup generation

**Out of Scope:**
- Custom warmup schemes / scheme picker (v2)
- Warmup scheme per exercise (v2)
- Long-press to customize warmup (v2)
- Auto-generating warmup when exercise is first added to session (too aggressive)
- Warmup suggestions for bodyweight exercises
- Warmup timer / warmup-specific rest periods

### Acceptance Criteria
- [ ] Given a user is in an active session with a barbell exercise and previous working weight of 225lb, When they tap "Add Warmups," Then 4 warmup sets are generated: 45×10, 115×5, 155×3, 185×2 (plate-friendly weights)
- [ ] Given warmup sets are generated, Then they appear BEFORE existing working sets in the exercise group
- [ ] Given warmup sets are generated, Then all generated sets have `set_type: "warmup"` and display the warmup visual indicator
- [ ] Given an exercise already has warmup sets, Then the "Add Warmups" button is NOT shown
- [ ] Given a bodyweight exercise (pull-ups, push-ups), Then the "Add Warmups" button is NOT shown
- [ ] Given a working weight of 95lb (< 2× bar weight of 45lb), Then only 2 warmup sets are generated: 45×10, 75×3
- [ ] Given the user's unit preference is kg with a 20kg bar, When they tap "Add Warmups" for a 100kg working weight, Then warmup sets use kg plate-friendly weights: 20×10, 50×5, 70×3, 85×2
- [ ] Given warmup sets are generated, Then a light haptic feedback is triggered
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] Unit tests cover warmup generation logic (scheme calculation, plate rounding, edge cases)

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Working weight ≤ bar weight | No warmup button shown (nothing to warm up to) |
| Working weight < 2× bar weight | Generate only 2 warmup sets (bar + 75%) |
| No previous session data and no suggestion | No warmup button shown (no reference weight) |
| Exercise uses dumbbells (no bar) | Generate warmups with weight only (no bar subtraction), round to nearest 5lb/2.5kg |
| User adds warmups then removes them | Button reappears (check is based on current state) |
| Multiple exercises in session | Each exercise has independent warmup button |
| Linked exercises (supersets) | Warmup button shown per exercise, not per superset group |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Set renumbering breaks existing sets | Low | High | Transaction wraps all inserts + renumbers; test coverage |
| Plate rounding produces unexpected weights | Low | Medium | Reuse proven `solve()` from lib/plates.ts; unit test edge cases |
| Button clutters exercise header | Low | Medium | Small, unobtrusive icon button; disappears after use |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED** — 2026-04-19

**Regression Risk: LOW.** Feature is purely additive (new button, new utility, new DB function). No existing flows modified. Set renumbering in transaction mitigates data integrity risk. Volume stats already exclude warmup sets (`is_warmup = 0`).

**Cognitive Load: STRONGLY POSITIVE.** Reduces 50+ taps to 1 tap. Compatible with existing mental model (warmup set type already exists). Zero new decisions for users. 3-second test: PASS.

**Recommendations (non-blocking):**
1. Use descriptive `accessibilityLabel` including exercise name on warmup button
2. `solve()` in `lib/plates.ts` is plate decomposition, not rounding — engineer needs a `roundToPlates()` wrapper for plate-friendly weight rounding
3. `ExerciseGroup` type lacks `is_bodyweight` field — needs threading from exercise-history or alternative check
4. Consider lightweight undo (snackbar) for accidental taps — could be v1.1

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-19)

**Architecture fit**: Excellent. `solve()` in `lib/plates.ts` handles plate rounding, `set_type: "warmup"` + `is_warmup` columns exist in schema, all history queries already filter warmups, `addSetsBatch()` + `withTransaction()` available. Zero migrations needed.

**Effort**: Small-Medium (~200 LOC new, ~50 LOC modified, 3 files). Low risk.

**Technical notes for implementation**:
1. `is_bodyweight` is NOT on `ExerciseGroup` type — add it and thread from session data loader
2. Plate rounding: `perSide = (target - bar) / 2; result = solve(perSide, plates); rounded = (perSide - result.remainder) * 2 + bar`
3. Skip dumbbell-specific logic for v1 — `weight ≤ barWeight` guard handles it naturally
4. Derive working weight from suggestion first, fall back to previous session data

### CEO Decision
_Pending reviews_
