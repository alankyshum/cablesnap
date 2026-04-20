# Feature Plan: Smart Weight Progression Suggestions

**Issue**: BLD-455
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

Users complete a workout, nail all their sets at 80kg bench press, and next session they open the app and... see 80kg prefilled again (via Phase 72 tap-to-prefill). They KNOW they should increase, but to what? 82.5kg? 85kg? They hesitate, second-guess, and either stay at the same weight (stalling progress) or jump too high (risking injury or failed sets).

**Progressive overload is THE fundamental principle of strength training.** Every serious gym app should guide users toward it, not just passively record what they did.

## User's Emotional Journey

**Without this feature:** "I hit all my reps last time... should I go up? By how much? I'll just do the same weight to be safe." (Progress stalls, motivation drops.)

**With this feature:** "Oh nice, the app is suggesting 82.5kg today because I completed everything last time. That makes sense -- let's go!" (Confidence, momentum, trust in the app as a training partner.)

## User Stories

- As a gym-goer, I want the app to suggest a small weight increase when I completed all sets last session, so I progressively get stronger without overthinking
- As a beginner, I want the suggested increase to be conservative (2.5kg/5lbs), so I don't get injured
- As an intermediate lifter, I want to see clearly what last session's weight was vs. the suggested weight, so I can make an informed decision
- As a user, I want to easily accept or ignore the suggestion with one tap, so it doesn't slow me down

## Proposed Solution

### Overview

Enhance the existing tap-to-prefill (Phase 72) to detect when the user completed all working sets in the previous session and suggest a weight increase. The suggestion appears as a visual indicator on the prefilled weight -- the user can accept it (default) or tap to revert to last session's weight.

### UX Design

**Where it appears:** On the exercise card header, alongside the existing "Last: 3x10 @ 80kg" text. When a progression is suggested, the prefilled weight shows the NEW suggested weight with a small upward arrow indicator.

**Visual treatment:**
- Previous performance text: "Last: 3x10 @ 80kg"
- When progression suggested: prefill weight shows **82.5** instead of 80, with a subtle `arrow-up` icon (12px, `colors.primary`) next to the weight input
- The arrow icon serves as a visual cue -- "this weight was auto-increased"
- If user taps prefill, they get the SUGGESTED weight (not the old weight)
- User can always manually edit the weight field to any value

**No new screens, no new buttons, no new modals.** This is a behind-the-scenes intelligence upgrade to an existing feature.

**One-handed gym use:** Zero additional taps. The suggested weight is simply what gets prefilled. User only intervenes if they DISAGREE with the suggestion.

**Accessibility:**
- Previous performance text updated: "Last: 3x10 at 80kg. Suggesting 82.5kg today."
- `accessibilityHint`: "Weight increased from last session based on your performance"
- Arrow icon has `accessibilityLabel`: "Weight progression suggested"

### Progression Algorithm

Simple, conservative, evidence-based rules:

```
IF all working sets in previous session were completed (completed=true)
AND all working sets had the same weight (consistent loading)
AND the exercise is weight-bearing (not bodyweight-only)
AND max RPE across working sets < 9.5 (or RPE not logged)
THEN suggest: previous_weight + increment

WHERE increment =
  - 2.5 if weight_unit = "kg" (compound exercises)
  - 5.0 if weight_unit = "lbs" (compound exercises)
  - 1.25 if weight_unit = "kg" AND exercise is isolation category
  - 2.5 if weight_unit = "lbs" AND exercise is isolation category
```

**Why this algorithm (validated by sports science review):**
- 2.5kg/5lbs is the standard barbell plate increment worldwide
- Isolation exercises MUST use halved increments (1.25kg/2.5lbs) -- a 5lb jump on lateral raises is 20%+ which breaks form
- Only suggest when ALL sets completed -- partial completion means the weight was already challenging
- Only for consistent loading -- if sets had different weights (pyramid, etc.), don't suggest
- **RPE gate**: If user logged RPE >= 9.5 on any working set, they were at maximal effort -- increasing weight would guarantee failed reps or injury (Helms et al., 2016)
- Conservative by default -- better to under-suggest than over-suggest

**What doesn't trigger a suggestion:**
- Any set was not completed (skipped, failed, or left empty)
- Sets had varying weights (user was already doing progressive loading)
- Any working set had RPE >= 9.5 (maximal effort -- no room to increase)
- Bodyweight exercises (no weight to increase)
- Duration-based exercises (increase duration is a different paradigm)
- No previous session data exists

### Technical Approach

**Files to modify:**

| File | Change |
|------|--------|
| `lib/format.ts` | Modify `computePrefillSets()` to accept `allPrevCompleted` flag, RPE-safe flag, weight unit, and exercise category; apply increment |
| `hooks/useSessionData.ts` | Pass completion status, RPE, and exercise category of previous sets to computePrefillSets |
| `lib/db/session-sets.ts` | Extend `getPreviousSetsBatch` to return ALL sets (not just completed) with `completed` status and `rpe` per set |
| `components/session/GroupCardHeader.tsx` | Show progression indicator (arrow icon) when weight was auto-increased |
| `components/session/types.ts` | Add `progressionSuggested: boolean` to ExerciseGroup |

#### Data Fetching Strategy (addresses QD critical finding)

**Current behavior (BROKEN for progression):** `getPreviousSetsBatch` in `lib/db/session-sets.ts` line ~462 filters with `eq(workoutSets.completed, 1)` in Step 2, silently dropping non-completed sets. This means the caller cannot distinguish "all 3 sets completed" from "1 of 3 sets completed" — both return the same result shape.

**Required change:** Remove the `eq(workoutSets.completed, 1)` filter from Step 2 of `getPreviousSetsBatch`. Instead, return ALL sets from the previous session with their `completed` (as boolean) and `rpe` (as number|null) fields included in the return type. The caller (`useSessionData`) then determines whether all working sets were completed.

**Updated return type:**
```typescript
Record<string, {
  set_number: number;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  set_type: string | null;
  completed: boolean;  // NEW
  rpe: number | null;  // NEW
}[]>
```

**Contract change impact:** Returning additional fields (`completed`, `rpe`) is additive — existing callers that destructure only `{ weight, reps, duration_seconds }` will continue to work. However, removing the `completed=1` filter means callers now receive non-completed sets too. The `computePrefillSets` function already filters on `current.completed` (skips completed current sets), and maps by index against `previousSets` — it must now filter `previousSets` to `completed` sets only before index-mapping, OR `useSessionData` must pre-filter.

**Safest approach:** `useSessionData` pre-filters `previousSets` to `completed=true` before passing to `computePrefillSets` (preserving the existing contract), and separately uses the full unfiltered set to compute `allPrevCompleted`.

#### Exercise Category Plumbing (addresses QD major finding)

The `exercises` table already has a `category` text field (schema line 19). Categories include values like `"chest"`, `"shoulders"`, `"biceps"`, etc. There is no existing `is_compound` or `is_isolation` flag.

**V1 approach:** Use a simple heuristic function:
```typescript
function isLikelyIsolation(category: string | null): boolean {
  const isolationCategories = ['biceps', 'triceps', 'forearms', 'calves', 'abs'];
  return isolationCategories.includes(category?.toLowerCase() ?? '');
}
```
This covers the most common isolation muscle groups. Compound exercises (chest, back, shoulders, legs, glutes) get standard increments. The heuristic is conservative — false negatives (treating an isolation as compound) result in a slightly too-large suggestion the user can manually adjust, while false positives (treating a compound as isolation) would under-suggest.

**Category flows through:** `useSessionData` already has access to exercise metadata via the group's exercise info. It passes `exerciseCategory` to `computePrefillSets` alongside the other new flags.

#### Callers and Mocks Requiring Updates (addresses QD major finding)

**`getPreviousSetsBatch` callers:**
| Location | Impact |
|----------|--------|
| `hooks/useSessionData.ts` | Primary caller — must handle new fields and pre-filter for computePrefillSets |
| `__tests__/acceptance/workout-session.acceptance.test.tsx` (3 refs) | Mock return values must add `completed: true, rpe: null` fields |
| `__tests__/acceptance/session-ux.test.tsx` (2 refs) | Mock return values must add `completed: true, rpe: null` fields |
| `__tests__/acceptance/supersets.test.tsx` (2 refs) | Mock return values must add `completed: true, rpe: null` fields |
| `__tests__/acceptance/session-add-exercise.acceptance.test.tsx` (2 refs) | Mock return values must add `completed: true, rpe: null` fields |
| `__tests__/acceptance/rpe-notes.test.tsx` (2 refs) | Mock return values must add `completed: true, rpe: null` fields |
| `__tests__/acceptance/accessibility.acceptance.test.tsx` (1 ref) | Mock return values must add `completed: true, rpe: null` fields |

**`computePrefillSets` callers:**
| Location | Impact |
|----------|--------|
| `hooks/useSessionActions.ts` (line 331) | Must pass new params (allPrevCompleted, rpeSafe, weightUnit, category) |
| `__tests__/lib/format.test.ts` (11 refs) | Must update function signature in tests; add new progression-specific tests |

**Data flow:**
1. `getPreviousSetsBatch` returns ALL previous sets with `completed` and `rpe` fields (remove `completed=1` filter)
2. `useSessionData` receives full set list, computes: `allWorkingSetsCompleted`, `allSameWeight`, `maxRpeSafe` (< 9.5 or null), gets `exerciseCategory`
3. `useSessionData` pre-filters to `completed=true` sets before passing to `computePrefillSets` (preserving existing prefill contract)
4. `useSessionData` sets `group.progressionSuggested = allWorkingSetsCompleted && allSameWeight && maxRpeSafe`
5. `computePrefillSets` applies increment when `progressionSuggested` is true, using `weightUnit` and `isLikelyIsolation(category)`
6. `GroupCardHeader` shows arrow-up icon when `progressionSuggested` is true
7. Previous performance text updated to mention the suggestion

**No new DB tables, no new dependencies, no new screens.**

### Scope

**In Scope:**
- Weight progression detection (all sets completed + consistent weight)
- Automatic weight increment on prefill (2.5kg or 5lbs)
- Smaller increment for isolation exercises (1.25kg or 2.5lbs)
- Visual indicator (arrow icon) on exercise card when progression is active
- Updated accessibility text mentioning the suggestion
- Respect weight unit setting (kg/lbs)

**Out of Scope:**
- Configurable increment amounts (use sensible defaults)
- Rep-based progression (e.g., "add a rep before adding weight")
- Duration-based progression
- Deload suggestions (reduce weight after failed sessions)
- Multi-session trend analysis (only look at most recent session)
- Progression history/log
- User preference to disable suggestions (always can manually edit)

### Acceptance Criteria

- [ ] Given user completed all working sets at 80kg last session When they tap prefill Then weight shows 82.5kg (for kg users) or previous+5 (for lbs users)
- [ ] Given user did NOT complete all sets last session When they tap prefill Then weight shows the same as last session (no increase)
- [ ] Given sets had varying weights last session (e.g., 80, 85, 80) When they tap prefill Then weight shows last session's per-set weights (no increase)
- [ ] Given the exercise is bodyweight When they tap prefill Then weight is null (no progression logic applied)
- [ ] Given the exercise is isolation category When progression triggers Then increment is 1.25kg / 2.5lbs (half the standard)
- [ ] Given any working set had RPE >= 9.5 last session When they tap prefill Then weight shows same as last session (no increase -- maximal effort)
- [ ] Given RPE was not logged (null) last session When all sets completed Then progression is suggested normally
- [ ] Given progression is suggested Then an arrow-up icon appears next to the exercise name/previous performance
- [ ] Given progression is suggested Then accessibility text reads "Suggesting [weight]kg today"
- [ ] Given user manually edits weight after prefill Then the edited value is preserved (progression doesn't override manual input)
- [ ] Previous performance text has accessibilityRole="button" and hint "Tap to fill sets from last session"
- [ ] Previous performance Pressable is a SIBLING of (not nested inside) the exercise name long-press Pressable
- [ ] Touch target meets 48dp minimum via hitSlop and minHeight
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No previous session | No prefill, no progression -- standard empty sets |
| Previous session had warmup + working sets | Only check working sets for completion (ignore warmups) |
| Previous session had only 1 set | Still apply progression if completed |
| Weight would exceed equipment limits | No cap -- user can always manually adjust |
| User uses both kg and lbs exercises | Use the weight unit from user settings |
| Dropsets in previous session | Dropsets have varying weights -- no progression suggested |
| RPE was 9.5 or 10 last session | No progression suggested -- user was at maximal effort |
| RPE not logged (null) | Progression allowed -- treat as sub-maximal by default |
| Exercise has no category | Treat as compound (standard increment) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Suggesting too-high weight | Low | Med | RPE gate (>= 9.5 blocks suggestion); conservative 2.5kg default; user always can edit |
| Confusion about why weight changed | Med | Low | Arrow icon + a11y text explain the change |
| Regression in existing prefill | Low | High | Existing prefill tests cover base case |
| Performance impact from extra DB fields | Low | Low | Adding completed + rpe to existing query |

### Test Budget

Current: 1795/1800 (5 remaining). May add up to 4 new tests:

1. `computePrefillSets` with progression: returns incremented weight when all prev sets completed (compound — +2.5kg)
2. `computePrefillSets` with progression (isolation): returns half increment (+1.25kg) for isolation category
3. `computePrefillSets` without progression: returns same weight when prev sets not all completed, AND when RPE >= 9.5 (safety-critical — tests the RPE gate)
4. Component test: arrow icon renders when `progressionSuggested` is true

## Review Feedback

### Sports Science Review (Gemini 3.1 Pro panel)
**Verdict: APPROVE_WITH_CHANGES** -- all 3 required changes incorporated into this plan:
1. **RPE gate added** -- no suggestion if any working set had RPE >= 9.5 (maximal effort safety)
2. **Isolation increment enforced** -- strictly 1.25kg/2.5lbs for isolation exercises (prevents 20%+ load jumps on lateral raises etc.)
3. **Circuit breaker noted** -- future enhancement: if user rejects suggestion, suppress for next session

Additional notes from panel:
- Progressive overload principle: SUPPORTED by ACSM/NSCA
- Standard increment amounts: SUPPORTED biomechanically
- Autonomy (opt-out design): rated EXCELLENT by behavioral psychologist
- Cognitive load reduction: rated EXCELLENT -- eliminates "should I go up?" decision fatigue
- Recommended: use neutral brand colors for arrow (not red/green) to avoid "shame" when no progression

### UX Designer (Design & A11y Critique)
**Verdict: APPROVED** — No blocking UX issues.

**Cognitive Load**: Excellent. Eliminates "should I go up?" decision fatigue. Zero additional taps. Compatible with existing prefill mental model.

**Strong Recommendation (UX-01)**: Update visible `previousSummary` text when progression is active to hint at the new weight (e.g., `Last: 3x10 @ 80kg · Try 82.5`). The mismatch between "80kg" in the label and 82.5kg in prefilled sets may confuse users. Not blocking — arrow icon + a11y text provide adequate communication — but strongly recommended.

**Minor Recommendations**:
- R-01: Use 14px for arrow-up icon (matches existing arrow-collapse-down size)
- R-02: Consider showing delta text ("+2.5") near previous performance
- R-03: Second tap on prefill could toggle between progressed/non-progressed weights (V2)
- R-04: Increase previousPerfBtn minHeight from 36 to 48dp (pre-existing, fix if touching component)
- R-05: Confirmed — `colors.primary` is the right color choice (neutral, no shame connotation)

### Quality Director (Release Safety)
**Verdict: NEEDS REVISION** (2026-04-20)
**CEO Response (2026-04-20): ALL 5 TODOs addressed in plan revision:**

1. ✅ **[Critical] Data fetching strategy** — Added "Data Fetching Strategy" subsection. `getPreviousSetsBatch` will remove `completed=1` filter, return ALL sets with `completed` and `rpe` fields. `useSessionData` pre-filters to completed sets for prefill contract, uses full set for progression detection.
2. ✅ **[Major] Callers and mocks** — Added "Callers and Mocks Requiring Updates" subsection listing all 6 acceptance test files (12 mock refs) and 2 `computePrefillSets` callers with specific impact per file.
3. ✅ **[Major] Exercise category plumbing** — Added "Exercise Category Plumbing" subsection. Uses `isLikelyIsolation(category)` heuristic against the existing `category` text field in exercises table.
4. ✅ **[Major] RPE gate test** — Test #3 now explicitly covers RPE >= 9.5 gate (combined with "not all completed" test — both are "no progression" cases).
5. ✅ **[Minor] Circuit breaker** — Removed from edge cases table. Out of scope for v1, no longer referenced.

**Original findings (preserved for audit):**

**Critical issue:** `getPreviousSetsBatch` filters to `completed=1` only — plan cannot detect "all sets completed" vs "some sets completed" without fetching non-completed sets. As written, this would over-suggest weight increases when users failed sets (user safety risk).

**Major issues:**
- Plan doesn't list all callers/mocks that need updating when `computePrefillSets` and `getPreviousSetsBatch` signatures change (6 acceptance test mocks, 1 callsite in useSessionActions)
- Exercise category must be plumbed to `computePrefillSets` for isolation/compound increment — plan doesn't specify how
- RPE >= 9.5 gate (safety-critical) has no planned test coverage

**Minor:** Circuit breaker listed in edge cases but marked out of scope — inconsistent.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — 2026-04-20

Technically sound, velocity-optimized, minimal blast radius. All required DB fields (rpe, completed) already exist in schema — zero migrations needed. Extends the established prefill data pipeline cleanly.

**Must-fix during implementation:**
1. `getPreviousSetsBatch` currently filters `WHERE completed=1`, silently dropping non-completed sets. Must return ALL sets with their `completed` status so the algorithm can check "all working sets completed." Audit other callers of this function for contract changes.

**Clarifications needed (non-blocking):**
2. Compound vs isolation classification: no `is_compound` flag exists. Recommend equipment+category heuristic (`isLikelyIsolation(equipment, category)`), or simplify v1 to use standard increment for all exercises.
3. Circuit breaker (reject suggestion → suppress next session) is listed in edge cases but marked out of scope. Recommend removing from edge cases table to avoid confusion — ship without it in v1.

**Estimated effort:** Small-Medium (1-2 sessions). Risk: Low.

### CEO Decision
_Pending reviews_
