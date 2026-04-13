# Feature Plan: Post-Workout Summary Screen (Phase 19)

**Issue**: BLD-TBD
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

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
3. **PRs Section** (conditional): List of new personal records with exercise name and weight, highlighted with gold/amber accent. Each PR shows old max -> new max.
4. **Progressive Overload Section** (conditional): Exercises where the user followed the progressive overload suggestion (weight increased from last session)
5. **Comparison Section** (conditional, only if same template was used before): Side-by-side comparison with last session using this template -- total volume delta (up/down), duration delta, sets completed delta
6. **Actions**:
   - "View Details" button -> navigates to session detail
   - "Share" button -> copies a plain-text summary to clipboard (or shares via system share sheet)
   - "Done" button -> navigates back to workouts tab

**Navigation**: This screen uses router.replace() so the back button goes to the workouts tab, not back to the active session.

**Empty states:**
- No PRs -> hide PRs section entirely
- No previous session with same template -> hide comparison section
- Session cancelled/no completed sets -> skip summary, go to workouts tab directly

**Accessibility:**
- All stats have accessibilityLabel with spoken values (e.g., "Duration: 45 minutes")
- PR section announced: "New personal record: Bench Press, 100 kilograms"
- All interactive elements have accessibilityRole and accessibilityHint

### Technical Approach

**New files:**
- app/session/summary/[id].tsx -- Summary screen component

**Modified files:**
- app/session/[id].tsx -- Change completion navigation from router.replace to summary screen
- lib/db.ts -- Add getSessionComparison(sessionId) function that finds the previous session with the same template and returns volume/duration/set deltas

**New DB query -- getSessionComparison(sessionId):**
Find the previous completed session with the same template_id. Calculate volume, sets, and duration for both sessions. Return deltas.

**Share text format:**
A plain-text summary including session name, duration, sets, volume, PRs, and comparison vs last session.

**Dependencies:** Uses existing getSessionPRs(), getSessionSets(), getSessionById() from lib/db.ts. Uses existing toDisplay() from lib/units.ts for unit formatting. Uses expo-sharing for share functionality (already installed).

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
- [ ] Given a completed workout Then the summary shows duration, completed sets count, and total volume
- [ ] Given a workout with new PRs Then the PRs section shows each PR with exercise name, new weight, and previous max
- [ ] Given a workout with no PRs Then the PRs section is hidden entirely
- [ ] Given a workout using a template that was used before Then the comparison section shows volume delta, duration delta, and sets delta with directional arrows
- [ ] Given a workout using a template for the first time (or no template) Then the comparison section is hidden
- [ ] Given the summary screen When the user taps "View Details" Then they navigate to the session detail screen
- [ ] Given the summary screen When the user taps "Share" Then a text summary is copied to clipboard or shared via system share sheet
- [ ] Given the summary screen When the user taps "Done" Then they navigate to the workouts tab
- [ ] Given a session with 0 completed sets When completing Then skip summary and navigate to workouts tab
- [ ] All stats have accessibilityLabel with spoken values
- [ ] Volume displayed in user's preferred unit (kg/lb)
- [ ] No new dependencies added
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
| No PRs | Hide PRs section |
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
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
