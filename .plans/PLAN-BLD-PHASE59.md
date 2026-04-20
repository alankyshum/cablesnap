# Feature Plan: Live PR Detection & Celebration

**Issue**: BLD-399
**Author**: CEO
**Date**: 2026-04-19
**Status**: APPROVED

## Problem Statement

CableSnap detects personal records (PRs) but only shows them in the **post-workout summary** — after the session is already over. During the workout, when the user actually completes a set that beats their all-time best, nothing happens. No celebration, no feedback, no acknowledgment.

This is a missed "peak moment." In behavioral psychology, immediate positive reinforcement is far more powerful than delayed feedback. The user just lifted more than they ever have before, and the app treats it like any other set.

**Why now?** PR detection infrastructure already exists (`getSessionPRs`, `getSessionRepPRs`). The summary screen and achievements already consume PR data. This feature reuses existing queries (adapted for single-set checking) and adds a pure UI delight layer.

## User's Emotional Journey

**Without this feature:** User completes a heavy set. They think "was that a PR?" but aren't sure. They finish the workout 30 minutes later, scroll through the summary, and see "1 New PR." The moment has passed. The dopamine hit is weak.

**After this feature:** User completes a heavy set. The screen erupts with confetti, a trophy badge appears on the set, phone buzzes with haptic feedback. "NEW PR! 🏆" They feel a surge of pride RIGHT when it matters. They show their gym buddy. They're motivated to push harder on the next exercise. This is the moment they screenshot and share.

## User Stories

- As a lifter, I want to know IMMEDIATELY when I hit a new personal record so I can celebrate in the moment
- As a lifter, I want visual feedback (animation) when I achieve a PR so the achievement feels real and significant
- As a lifter, I want a PR badge on the set row so I can see which sets were records when reviewing my workout
- As a lifter, I want the celebration to be brief and non-blocking so it doesn't interrupt my workout flow

## Proposed Solution

### Overview

When a user marks a set as completed (`handleCheck` in `useSessionActions.ts`), check if the completed weight exceeds the all-time max weight for that exercise. If it does, trigger a celebration overlay (confetti burst + trophy icon) with haptic feedback, and mark the set row with a PR badge.

### UX Design

**Celebration Flow:**
1. User taps the checkmark to complete a set
2. Existing behavior: set marks as complete, rest timer starts
3. NEW: If the set's weight > all-time max → trigger celebration
4. Confetti animation bursts from the set row area (2-3 seconds)
5. A floating "🏆 NEW PR!" badge appears briefly above the set (fades after 2s)
6. Medium haptic impact feedback
7. The set row gets a persistent small PR indicator (trophy icon or gold border)
8. User continues their workout — celebration does NOT block interaction

**Design Principles:**
- **Non-blocking**: The confetti and toast overlay do NOT prevent tapping other sets
- **Brief**: Animation lasts ~2 seconds, auto-dismisses
- **Persistent indicator**: The set row keeps a small PR badge for the rest of the session
- **One-handed safe**: No interaction required from the user (pure feedback, no dismiss button needed)
- **Accessible**: VoiceOver announces "New personal record for [exercise name]"

**What triggers a PR:**
- Weight PR: completed set weight > highest weight ever completed for that exercise (from completed past sessions, excluding warmups)
- Only checks non-warmup, non-bodyweight sets with weight > 0
- Only compares against completed past sessions (not the current in-progress session's other sets)

**What does NOT trigger a PR (v1):**
- Rep PRs (most reps at a given weight) — deferred to v2
- Volume PRs (most total volume in a session for an exercise) — deferred to v2
- Duration PRs — deferred to v2

### Technical Approach

#### 1. New DB function: `checkSetPR(exerciseId, weight)`
Add to `lib/db/session-stats.ts`:
```typescript
export async function checkSetPR(
  exerciseId: string,
  weight: number,
  currentSessionId: string
): Promise<boolean> {
  // Query: is this weight > MAX(weight) for this exercise across all completed past sessions?
  const row = await queryOne<{ max_weight: number | null }>(
    `SELECT MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND ws.is_warmup = 0
       AND wss.completed_at IS NOT NULL
       AND ws.session_id != ?`,
    [exerciseId, currentSessionId]
  );
  if (!row || row.max_weight === null) return false;
  return weight > row.max_weight;
}
```

#### 2. Hook: `usePRCelebration()`
New hook at `hooks/usePRCelebration.ts`:
- Exposes `triggerPR(exerciseName: string)` function
- Manages celebration state (visible, exerciseName)
- Auto-dismisses after 2 seconds
- Fires haptic feedback (medium impact)
- Fires VoiceOver announcement

#### 3. Celebration overlay component: `PRCelebration.tsx`
New component at `components/session/PRCelebration.tsx`:
- Renders confetti particles using Reanimated (no new dependency)
- Shows "🏆 NEW PR!" text with scale-in animation
- Absolutely positioned overlay, `pointerEvents="none"` so it doesn't block touches
- Uses existing theme colors (primary/gold accent)

#### 4. Modify `handleCheck` in `useSessionActions.ts`
After `completeSet(set.id)`:
```typescript
// Check for PR (only for non-warmup sets with weight > 0)
if (!set.is_warmup && set.weight && set.weight > 0 && id) {
  const isPR = await checkSetPR(set.exercise_id, set.weight, id);
  if (isPR) {
    triggerPR(exerciseName);
    updateGroupSet(set.id, { is_pr: true });
  }
}
```

#### 5. PR badge on set row
Modify `components/session/SetRow.tsx`:
- If `set.is_pr === true`, show a small 🏆 icon next to the set number
- Subtle gold tint on the row background

#### 6. `is_pr` field
- Add `is_pr` to the `SetWithMeta` type (in-memory only for v1, no schema change)
- This is a transient flag set during the session — not persisted to DB in v1

### Scope

**In Scope:**
- Weight PR detection on set completion
- Confetti/trophy celebration animation (Reanimated, no new deps)
- Haptic feedback (medium impact)
- VoiceOver announcement
- PR badge on set row (transient, in-session only)
- Non-blocking overlay (pointerEvents="none")

**Out of Scope:**
- Rep PRs (max reps at weight) — v2
- Volume PRs — v2
- Duration PRs — v2
- Persistent PR storage in DB — v2 (currently PR is only computed in summary)
- Sound effects — v2
- PR history/leaderboard screen — v2
- Sharing PR moment — v2
- Custom celebration preferences (disable/enable) — v2 (default ON)

### Acceptance Criteria

- [ ] Given user completes a set with weight > all-time max for that exercise, When the set is checked, Then confetti animation plays for ~2 seconds and "NEW PR!" text appears
- [ ] Given PR is triggered, Then medium haptic feedback fires immediately
- [ ] Given PR is triggered, Then VoiceOver announces "New personal record for [exercise name]"
- [ ] Given PR is triggered on a set, Then the set row shows a small trophy/PR badge for the rest of the session
- [ ] Given celebration is playing, Then user can still tap other sets (pointerEvents="none")
- [ ] Given user completes a set with weight ≤ all-time max, Then no celebration occurs
- [ ] Given warmup set is completed, Then no PR check occurs (regardless of weight)
- [ ] Given bodyweight exercise set is completed, Then no PR check occurs
- [ ] Given user's first-ever set for an exercise (no history), Then no PR celebration (need baseline)
- [ ] Celebration auto-dismisses after 2 seconds without user action
- [ ] PR passes all existing tests, no regressions
- [ ] No new lint warnings
- [ ] Unit tests for `checkSetPR` function
- [ ] Unit tests for `usePRCelebration` hook

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First-ever session (no history) | No PRs triggered — need at least one completed past session as baseline |
| Multiple PRs in same session | Each triggers independently (user might PR on bench and squat) |
| Same exercise PR twice in session (progressive sets) | Both trigger — each set that exceeds the historical max gets a celebration |
| Unchecking a PR set then re-checking | PR check runs again — if still a PR, celebration fires again |
| Very light exercise (5lb dumbbell curls) | PR still triggers if it beats history — every PR matters |
| Exercise with only warmup history | No PR (warmups excluded from comparison) |
| Slow database query | Use async check — celebration fires after query completes, even if slightly delayed |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| DB query on every set completion adds latency | Medium | Low | Query is simple MAX() with index — should be <10ms. Check is async so it doesn't block the completion UI |
| Confetti animation performance | Low | Medium | Use Reanimated worklet-based animation, limit particle count to ~30, auto-cleanup |
| User finds celebration annoying | Low | Medium | Keep it brief (2s), non-blocking, and elegant. v2 adds settings toggle |
| False PR on imported data | Low | Low | Import data goes through same completion flow — PRs are valid against imported history |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED** (2026-04-19)

**Cognitive load**: Strongly positive — zero new decisions, aligns with user expectations. Pure passive positive feedback.

**Regression risk**: Low — additive feature, core `completeSet()` untouched. Must wrap `checkSetPR` in try/catch so DB errors never block set completion.

**Must address during implementation:**
- [M] Consolidate haptic: existing PR haptic in `useSetTypeActions.ts:94-96` will double-fire with new hook. Remove or integrate.
- [M] `useReducedMotion()`: suppress confetti for users with reduced motion preference.
- [m] Test budget at 1797/1800 — consolidate into ≤2 multi-assertion tests.

**Additional recommendations:**
- 2s auto-dismiss timer must have useEffect cleanup (memory leak risk).
- Add `accessibilityLiveRegion="assertive"` for Android TalkBack.
- Consider consolidating existing `isPR` logic from `useSetTypeActions.ts` into the new hook to avoid maintaining PR detection in two places.

### Tech Lead (Technical Feasibility)

**Verdict: APPROVED**

Architecture is purely additive — no schema changes, no new dependencies, no refactoring required. All infrastructure exists: `getSessionPRs` SQL pattern, `expo-haptics`, `react-native-reanimated` 4.2.1, `AccessibilityInfo.announceForAccessibility`. The insertion point (`handleCheck` in `useSessionActions.ts`) already handles haptics and accessibility, making this a natural extension.

**Key constraints:**
- **Test budget: 1797/1800** — only 3 slots remain. Tests must be consolidated (max 2-3 `it()` blocks total). May need to consolidate existing tests elsewhere.
- **Confetti particles**: Start with 15-20 (not 30) to avoid jank on older Android. Use `cancelAnimation` on unmount.
- **Re-check debounce**: Consider skipping re-celebration if same set already celebrated in session.
- **Simplification option**: CEO may consider badge+haptic+announcement without confetti for v1 (80% impact, 40% effort).

Estimated effort: Medium (~4 files, ~250 LOC). Low risk. Ready for implementation.

### CEO Decision
**APPROVED** — 2026-04-19

Both QD and TL approved. Key conditions incorporated into implementation spec:
1. Consolidate haptic feedback (remove existing PR haptic in `useSetTypeActions.ts` to avoid double-buzz)
2. Add `useReducedMotion()` check — suppress confetti for reduced motion users, show badge only
3. Test budget: max 2-3 `it()` blocks with multi-assertion, consolidate existing tests if needed
4. Confetti particles: 15-20 (not 30) per TL recommendation
5. Wrap `checkSetPR` in try/catch — DB errors must never prevent set completion
6. Add `accessibilityLiveRegion="assertive"` for Android TalkBack
7. Cleanup celebration timer on unmount to prevent memory leaks

CEO decision on TL simplification suggestion: **Keep confetti for v1.** The confetti IS the feature — it's the emotional peak moment. Badge+haptic alone doesn't create the "I just PRed!" screenshot moment. The effort delta is manageable (~50 extra LOC for particle system).
