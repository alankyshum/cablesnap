# Feature Plan: Post-Workout Summary Screen (Phase 19)

**Issue**: BLD-TBD
**Author**: CEO
**Date**: 2026-04-13
**Status**: IN_REVIEW (Rev 2) — addressing QD + techlead feedback

## Problem Statement

When users complete a workout, they are redirected directly to the session detail screen -- a static, data-dense view. There is no "moment of delight" after finishing a hard session. Users do not see at a glance whether they improved, hit PRs, or achieved progressive overload. This missed opportunity reduces engagement and makes the app feel transactional rather than motivating.

Fitness apps that celebrate completion (Strong, Hevy, JEFIT) report higher session frequency. A well-designed summary screen reinforces the habit loop: cue, routine, reward.

## User Stories

- As a lifter, I want to see a summary of my workout immediately after completing it, so I know at a glance how I performed
- As a lifter, I want to see PRs celebrated prominently, so I feel rewarded for my effort
- As a lifter, I want to compare today's session to the last time I did this workout, so I know if I'm progressing
- As a lifter, I want to share my workout summary as text, so I can post my achievements

## Proposed Solution

### Overview

Add a new intermediate screen (app/session/summary/[id].tsx) shown after workout completion. The session completion flow changes from:

Complete -> Session Detail

to:

Complete -> Summary Screen -> (tap "View Details") -> Session Detail

### UX Design

**Screen Layout (top to bottom):**

1. **Header**: "Workout Complete!" with session name
2. **Stats Row**: Duration | Sets Completed | Total Volume (3 cards in a row)
3. **PRs Section** (conditional): List of new personal records with exercise name and weight, highlighted with gold/amber accent. Each PR shows old max -> new max. **For bodyweight exercises (weight=0):** show rep-based PRs — "New rep PR: Pull-ups, 15 reps (was 12)". Detection: if exercise has `is_bodyweight=1` or all sets have `weight=0`, compare max reps instead of estimated 1RM.
4. **Weight Increases Section** (conditional): Exercises where the user increased weight from their last session. Renamed from "Progressive Overload" since suggestion taps aren't stored — this simply shows exercises where weight went up.
5. **Comparison Section** (conditional, only if same template was used before): Side-by-side comparison with last session using this template -- total volume delta (up/down), duration delta, sets completed delta
6. **Actions**:
   - "View Details" — text/tertiary button → navigates to session detail
   - "Share" — outlined button → shares via React Native's built-in `Share.share({ message })` (NOT expo-sharing which is for file URIs). System share sheet includes copy-to-clipboard option natively.
   - "Done" — filled/primary button (full-width, most prominent) → navigates back to workouts tab

**Button hierarchy**: Done is the primary action (filled), Share is secondary (outlined), View Details is tertiary (text-only). This guides users toward the happy path (Done) while keeping options accessible.

**Navigation**: This screen uses router.replace() so the back button goes to the workouts tab, not back to the active session.

**Empty states:**
- No PRs -> hide PRs section entirely
- No previous session with same template -> hide comparison section
- Session cancelled/no completed sets -> skip summary, go to workouts tab directly

**Accessibility:**
- All stats have accessibilityLabel with spoken values (e.g., "Duration: 45 minutes")
- PR section announced: "New personal record: Bench Press, 100 kilograms"
- All interactive elements have accessibilityRole and accessibilityHint
- **On mount**: call `AccessibilityInfo.announceForAccessibility('Workout Complete!')` to announce the screen to screen reader users
- Duration display: reuse existing `formatTime()` helper for consistency

### Technical Approach

**New files:**
- app/session/summary/[id].tsx -- Summary screen component

**Modified files:**
- app/session/[id].tsx -- Change completion navigation from router.replace to summary screen
- app/_layout.tsx (or relevant layout) -- Add `Stack.Screen` entry for `session/summary/[id]`
- lib/db.ts -- Add getSessionComparison(sessionId) and getSessionRepPRs(sessionId) functions

**New DB query -- getSessionComparison(sessionId):**
Use 2 simple queries (not a complex JOIN): (1) find previous completed session with same template_id, (2) aggregate volume/sets/duration for both sessions. Return deltas.

**New DB query -- getSessionRepPRs(sessionId):**
For bodyweight exercises (weight=0 or is_bodyweight=1), compare max reps in this session against historical max reps for each exercise. Return exercises where new max reps > previous max reps.

**Share implementation:**
Use React Native's built-in `Share.share({ message })` — NOT expo-sharing (which requires file URIs). Plain-text summary including session name, duration, sets, volume, PRs, and comparison.

**Dependencies:** Uses existing getSessionPRs(), getSessionSets(), getSessionById() from lib/db.ts. Uses existing toDisplay() from lib/units.ts for unit formatting. Uses existing formatTime() for duration. Uses RN's built-in Share API.

**No new dependencies required.**

### Scope

**In Scope:**
- New summary screen shown after workout completion
- Stats display (duration, sets, volume)
- PR highlighting with previous max comparison
- Previous session comparison (same template only)
- Share as text (clipboard + share sheet)
- Accessibility labels on all elements
- Navigation changes (completion flow)
- Skip summary if session has 0 completed sets

**Out of Scope:**
- Share as image/card (requires image generation library)
- Animations/confetti (keep it simple, can enhance later)
- Sound effects
- Social media integration
- Workout rating/mood tracking
- Weekly summary notifications

### Acceptance Criteria

- [ ] Given a completed workout When the user taps "Complete" Then the summary screen is shown (not session detail)
- [ ] Given a completed workout Then the summary shows duration (using formatTime()), completed sets count, and total volume
- [ ] Given a workout with new weight-based PRs Then the PRs section shows each PR with exercise name, new weight, and previous max
- [ ] Given a workout with new rep-based PRs (bodyweight exercises) Then the PRs section shows "New rep PR: [exercise], [reps] reps (was [old])"
- [ ] Given a workout with no PRs (weight or rep) Then the PRs section is hidden entirely
- [ ] Given a workout where weight increased on any exercise Then the "Weight Increases" section shows those exercises
- [ ] Given a workout using a template that was used before Then the comparison section shows volume delta, duration delta, and sets delta with directional arrows
- [ ] Given a workout using a template for the first time (or no template) Then the comparison section is hidden
- [ ] Given the summary screen When the user taps "View Details" (text button) Then they navigate to the session detail screen
- [ ] Given the summary screen When the user taps "Share" (outlined button) Then RN Share.share() opens the system share sheet with text summary
- [ ] Given the summary screen When the user taps "Done" (filled/primary button) Then they navigate to the workouts tab
- [ ] Given a session with 0 completed sets When completing Then skip summary and navigate to workouts tab
- [ ] AccessibilityInfo.announceForAccessibility('Workout Complete!') called on mount
- [ ] All stats have accessibilityLabel with spoken values
- [ ] Volume displayed in user's preferred unit (kg/lb)
- [ ] Stack.Screen entry added for session/summary/[id]
- [ ] No new dependencies added (uses RN built-in Share, not expo-sharing)
- [ ] PR passes typecheck with zero errors
- [ ] App starts without crashes

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| 0 completed sets | Skip summary, navigate to workouts tab |
| No template (ad-hoc session) | No comparison section shown |
| First use of template | No comparison section shown |
| All sets incomplete but session completed | Show summary with 0 volume, 0 sets |
| Very long session name | Truncate with ellipsis |
| No weight PRs | Hide weight PRs, still show rep PRs if any |
| No rep PRs (no bodyweight exercises) | Only show weight PRs |
| Bodyweight exercise (weight=0) | Compare max reps, not 1RM |
| Exercise deleted between sessions | Comparison still works with available data |
| Unit preference changes between sessions | Both displayed in current unit |
| Very large volume number | Format with comma separators |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Navigation back button confusion | Med | Low | Use router.replace() to prevent going back to active session |
| Share text formatting on different platforms | Low | Low | Use plain text only |
| Performance with large sessions | Low | Low | Query is bounded by session ID, not full table scan |
| Template-based comparison inaccurate after template edit | Med | Low | Compare by template_id, comparison still valid against previous session data |

## Review Feedback

### Quality Director (UX Critique)
**Initial Verdict**: NEEDS REVISION (2026-04-13T18:25Z) — 1 Critical, 2 Major, 3 Minor
**Rev 2 Verdict**: APPROVED (2026-04-13T18:38Z) — All 6 findings resolved

**Findings (all resolved in Rev 2):**
1. **C1 — Bodyweight PRs** ✅ Rep-based PR detection added (getSessionRepPRs, is_bodyweight/weight=0 fallback)
2. **M1 — Share API** ✅ RN Share.share({ message }), not expo-sharing
3. **M2 — Button hierarchy** ✅ Done=filled, Share=outlined, View Details=text
4. **m1 — a11y announce** ✅ AccessibilityInfo.announceForAccessibility on mount
5. **m2 — Naming** ✅ "Weight Increases" not "Progressive Overload"
6. **m3 — formatTime()** ✅ Reuse existing helper

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (with minor fixes)

**Feasibility**: Fully buildable — all data-layer dependencies exist (`getSessionPRs`, `getSessionSets`, `getSessionById`, `completeSession`, `toDisplay`).

**Architecture Fit**: Excellent — mirrors `session/detail/[id].tsx` pattern. No new dependencies. Compatible with Expo Router file-based routing.

**Complexity**: Small-Medium | Risk: Low | New deps: none

**Findings (all minor)**:
1. Use React Native built-in `Share.share({ message })` instead of expo-sharing (which is for file sharing)
2. Remove progressive overload section — Phase 18 not yet shipped, no data to display
3. Add `Stack.Screen` entry in `_layout.tsx` for `session/summary/[id]`
4. expo-clipboard NOT installed; use `Share.share()` which includes copy via system share sheet
5. `getSessionComparison()` — use 2 simple queries (session lookup + volume aggregation) rather than complex JOIN

**Approved for implementation** — low risk, clean scope, all infrastructure exists.

### CEO Decision — Rev 2 Resolutions

All QD and techlead findings addressed in Rev 2:

| Finding | Resolution |
|---------|-----------|
| **C1 — Bodyweight PRs** | ✅ Added rep-based PR detection for exercises with weight=0 or is_bodyweight=1. New getSessionRepPRs() query. |
| **M1 — Share API** | ✅ Uses RN built-in Share.share({ message }), not expo-sharing. No expo-clipboard needed. |
| **M2 — Button hierarchy** | ✅ Specified: Done=filled/primary (full-width), Share=outlined, View Details=text/tertiary. |
| **m1 — a11y announce** | ✅ AccessibilityInfo.announceForAccessibility on mount. |
| **m2 — "Progressive Overload"** | ✅ Renamed to "Weight Increases" since suggestion taps aren't stored. |
| **m3 — formatTime()** | ✅ Reuse existing formatTime() for duration display. |
| **TL1 — Share API** | ✅ Same as M1 — RN Share.share(). |
| **TL2 — Progressive overload section** | ✅ Renamed to "Weight Increases" — Phase 18 now shipped (PR #29 merged), data available. |
| **TL3 — Stack.Screen** | ✅ Added to modified files list. |
| **TL4 — expo-clipboard** | ✅ Not needed — Share.share() handles it. |
| **TL5 — Query approach** | ✅ Specified 2 simple queries for getSessionComparison(). |

**Plan status**: Submitted for re-review.
