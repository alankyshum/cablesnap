# Feature Plan: Tap-to-Prefill Sets from Previous Session

**Issue**: BLD-447
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement

Phase 71 added inline previous performance on exercise cards ("Last: 3×80kg×8"). Users can now SEE what they did last time without extra taps. But they still have to manually type weight and reps for every set — typically 15-25 sets per workout. That's 30-50 manual inputs per session.

Picture the gym user: sweaty hands, phone balanced on a bench, 30 seconds between sets. Typing "80" then "8" for each set is friction. If they did 80kg×8 last time and want to repeat or adjust, they should be able to start from last session's values with one tap.

## User's Emotional Journey

**Without this feature**: "I can see I did 80kg×8 last time, but I still have to type it in. Every. Single. Set. It's tedious and slows me down."

**After**: "I tap 'Last: 3×80kg×8' and all my sets fill in with last session's values. I just adjust the ones I want to change. So much faster!"

## User Stories

- As a gym-goer, I want to tap on my previous performance to auto-fill my current sets, so I spend less time typing and more time lifting.
- As a user who tracks progressive overload, I want pre-filled values as a starting point that I can adjust upward, so I don't have to remember exact numbers.

## Proposed Solution

### Overview

Make the inline previous performance text (Phase 71) tappable. When tapped, fill all uncompleted sets for that exercise with per-set values from the previous session. Sets are filled but NOT marked as completed — the user still checks each set off as they perform it.

### UX Design

**Interaction flow:**
1. User sees "Last: 3×80kg×8" below exercise name (existing Phase 71 display)
2. User taps on the text
3. All uncompleted sets for that exercise fill with previous session values (set-by-set mapping)
4. Brief toast: "Filled from last session" (dismisses automatically)
5. Sets remain unchecked — user completes each set normally
6. User can edit any pre-filled value before or after checking the set

**Visual changes:**
- Previous performance text rendered in `colors.primary` (instead of `onSurfaceVariant`) to signal tappability
- Optional small `arrow-collapse-down` icon (14px, `colors.primary`) after the text as visual affordance
- Text gets `accessibilityRole="button"` and hint "Tap to fill sets from last session"
- Subtle press animation: `opacity: 0.7` on press for visual feedback (including no-op cases)
- Light haptic feedback (`Haptics.impactAsync(ImpactFeedbackStyle.Light)`) on successful prefill

**Set mapping logic:**
- Previous set 1 → Current set 1, Previous set 2 → Current set 2, etc.
- If current session has MORE sets than previous: extra sets stay empty
- If current session has FEWER sets than previous: extra previous sets are ignored
- Only fill weight and reps (not RPE, notes, or training mode)
- Only fill sets that are NOT yet completed (don't overwrite completed sets)
- Only fill sets where weight AND reps are both null/empty (don't overwrite user-entered values)
- For bodyweight exercises: fill reps only, set weight to `null` (NOT `0`) to avoid displaying "0kg"
- For duration-based exercises: fill duration_seconds instead of weight/reps

**Edge cases handled in UX:**
- If no previous session exists: the text doesn't appear (Phase 71 behavior), so nothing to tap
- If all sets are already completed: toast "All sets already completed" (no-op, subtle press animation still fires)
- If all sets already have values: toast "Sets already have values" (no-op)
- Accidental tap: user can clear individual values by selecting the field and deleting
- Toast shows actual count: "Filled N sets from last session"
- `AccessibilityInfo.announceForAccessibility()` called after prefill for screen reader users

### Technical Approach

#### Data Changes
No schema changes needed. Previous set data is already fetched via `getPreviousSetsBatch` in `useSessionData.ts` (line ~148). Currently only the aggregate summary is stored. Store the per-set data as well.

#### Modified Files (3-4 files)

1. **`components/session/types.ts`**
   - Add `previousSets?: Array<{ weight: number | null; reps: number | null; duration_seconds: number | null }>`  to `ExerciseGroup`

2. **`hooks/useSessionData.ts`**
   - In the previous-performance loop (line ~160), also store the per-set values on the group:
     ```typescript
     group.previousSets = workingSets.map(s => ({
       weight: s.weight,
       reps: s.reps,
       duration_seconds: s.duration_seconds ?? null,
     }));
     ```

3. **`components/session/GroupCardHeader.tsx`**
   - **CRITICAL (UX Designer feedback)**: Extract the previous performance text OUT of the existing long-press Pressable (line 45) to avoid nested gesture conflicts. Render as a SIBLING `<Pressable>` below the exercise name.
   - Apply `hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}` and `minHeight: 36` to meet 48dp touch target minimum
   - Use `colors.primary` text color + optional `arrow-collapse-down` icon (14px) as visual affordance (NOT a copy icon)
   - Add `accessibilityRole="button"`, `accessibilityHint="Tap to fill sets from last session"`
   - Add subtle press animation (`opacity: 0.7`) via `style` on press state

4. **`hooks/useSessionActions.ts`** (or `components/session/ExerciseGroupCard.tsx`)
   - Add `handlePrefillFromPrevious(exerciseId: string)` callback
   - Finds the group, reads `previousSets`, maps to uncompleted current sets
   - Calls existing `onUpdate` for each set that needs filling
   - Shows toast on completion

#### New Pure Function (in `lib/format.ts` or `lib/session-prefill.ts`)
```typescript
export function computePrefillSets(
  currentSets: Array<{ id: string; weight: number | null; reps: number | null; completed: boolean; duration_seconds: number | null }>,
  previousSets: Array<{ weight: number | null; reps: number | null; duration_seconds: number | null }>,
): Array<{ setId: string; weight: number | null; reps: number | null; duration_seconds: number | null }> {
  // Returns only the sets that should be updated (uncompleted, empty values)
}
```

### Scope

**In Scope:**
- Tappable previous performance text with prefill action
- Per-set mapping from previous to current session
- Toast feedback on action
- Accessibility labels and hints
- Duration-based exercise support

**Out of Scope:**
- Undo/revert prefill (user manually clears values)
- Prefilling RPE, notes, or training mode
- Prefilling from sessions other than the most recent
- Weight suggestions / progressive overload adjustments (existing suggestion chips handle this)
- Prefilling warmup sets

### Acceptance Criteria

- [ ] Given a session with previous performance data, When user taps the "Last: ..." text, Then uncompleted empty sets fill with per-set values from the last session
- [ ] Given set 1 was 80kg×8 and set 2 was 80kg×7 last time, When user taps prefill, Then current set 1 gets 80/8 and set 2 gets 80/7 (per-set, not uniform)
- [ ] Given some sets are already completed, When user taps prefill, Then only uncompleted empty sets are filled
- [ ] Given user has entered values in set 1 already, When user taps prefill, Then set 1 is NOT overwritten (only truly empty sets are filled)
- [ ] Given a duration-based exercise, When user taps prefill, Then duration_seconds is filled instead of weight/reps
- [ ] Given current session has more sets than previous, When user taps prefill, Then extra sets remain empty
- [ ] Given no previous session exists, Then the previous performance text does not appear (existing behavior)
- [ ] Previous performance text has accessibilityRole="button" and hint "Tap to fill sets from last session"
- [ ] Previous performance `<Pressable>` is a SIBLING of (not nested inside) the exercise name long-press Pressable
- [ ] Touch target meets 48dp minimum via hitSlop and minHeight
- [ ] Previous performance text uses `colors.primary` color (not `onSurfaceVariant`)
- [ ] Toast "Filled N sets from last session" appears after successful prefill (with actual count)
- [ ] Light haptic feedback fires on successful prefill
- [ ] `AccessibilityInfo.announceForAccessibility()` called after prefill
- [ ] Bodyweight exercises prefill weight as null (not 0)
- [ ] No regressions on existing session header or exercise card behavior
- [ ] No new lint warnings or TS errors
- [ ] PR passes all tests

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No previous session | Text not shown (Phase 71 behavior) |
| All sets completed | Toast "All sets already completed", no-op |
| All sets have values | Toast "Sets already have values", no-op |
| More current sets than previous | Extra sets stay empty |
| Fewer current sets than previous | Extra previous data ignored |
| Bodyweight exercise | Fill reps only (weight=null, not 0) |
| Duration exercise | Fill duration_seconds instead |
| Mixed set types (normal + warmup) | Only fill normal sets, skip warmups |
| User taps twice | Second tap is no-op if sets already filled |
| Accidental tap | User manually edits/clears individual set values |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| User thinks sets are completed (not just filled) | Low | Medium | Sets remain unchecked; different visual state |
| Discourages progressive overload | Low | Low | Suggestion chips still show; this is a starting point |
| Interferes with warmup set logic | Low | Medium | Explicitly skip warmup sets in prefill |
| Test budget (at 1800/1800) | High | High | Must consolidate 2+ tests; add 1 test block for `computePrefillSets` |

## CRITICAL: Test Budget

Test budget is at 1800/1800 (0 remaining). Implementation MUST:
1. Add 1 test for `computePrefillSets` pure function with multiple assertions in one `it()` block
2. Consolidate 2+ existing tests to make room (net change <= 0 new tests)
3. Run `./scripts/audit-tests.sh` to verify budget before opening PR

## Review Feedback

### UX Designer (Design & A11y Critique)

**Verdict**: APPROVED (2026-04-20)

Initial review (NEEDS REVISION) raised 4 issues — all addressed in plan revision:
1. ✅ CRITICAL: Nested Pressable → extracted as sibling, not nested
2. ✅ CRITICAL: Touch target → hitSlop + minHeight: 36 specified
3. ✅ MAJOR: Copy icon misleading → using colors.primary + arrow-collapse-down
4. ✅ MAJOR: Bodyweight weight=0 → using null for bodyweight weight

All 4 recommendations also incorporated (haptic feedback, AccessibilityInfo.announce, toast with count, press animation).

### Quality Director (Release Safety)
**Verdict: APPROVED** (2026-04-20)

- **Regression risk: LOW.** Feature is additive — wraps existing text in Pressable, stores already-fetched per-set data, uses existing `onUpdate` path. No existing data flows modified.
- **Security: No concerns.** Local SQLite reads, local state writes. No network/credentials/PII changes.
- **Data integrity: No concerns.** Prefill writes to in-memory state only. Correct guard: only fills sets where weight AND reps are both null/empty. Sets NOT auto-completed.
- **Edge cases: Well-covered.** All major scenarios addressed. Minor recommendation: skip prefilling from previous sets where all source values are null.
- **Test budget: Acknowledged.** PR must include `audit-tests.sh` output showing compliance. QD will verify during PR audit.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-20)

- **Velocity**: High-impact, low-effort. All data already fetched (`getPreviousSetsBatch` at `useSessionData.ts:99`). Update mechanism exists (`handleUpdate` at `useSessionActions.ts:116`). Toast ready (`useToast()` at `app/session/[id].tsx:53`). Suggestion chips already established the "tap to fill empty sets" pattern.
- **Architecture fit**: Fully compatible. One new optional field on `ExerciseGroup`, one pure function, one new callback prop threaded through existing component hierarchy.
- **Effort**: Small-Medium (~80 lines across 3-4 files). Single implementation cycle.
- **Risk**: Low. No new dependencies, no schema changes, OTA-compatible.
- **Technical notes**:
  1. Extract previous perf text from the delete-long-press Pressable (GroupCardHeader.tsx:45) into its own `<Pressable onPress={onPrefill}>` — aligns with UX Designer's finding.
  2. Add `onPrefill?: (exerciseId: string) => void` to both `GroupCardProps` and `GroupCardHeaderProps`.
  3. Consider batching the multiple `onUpdate` calls to avoid intermediate renders (React.startTransition or similar).
  4. Place `computePrefillSets` in `lib/format.ts` alongside `formatPreviousPerformance` rather than creating a new file — keeps related logic together.
- **Test budget**: Consolidate 2+ existing single-assertion `it()` blocks per BLD-402 learning. Single `it()` for `computePrefillSets` covering all edge cases.

### CEO Decision
_Pending reviews_
