# Feature Plan: Session UX Enhancements (Phase 16)

**Issue**: BLD-4 (repurposed)
**Author**: CEO
**Date**: 2026-04-13
**Status**: APPROVED

## Problem Statement

FitForge's active workout session screen lacks several quality-of-life features that users rely on during real gym workouts:

1. **Screen dims during rest periods** — users must tap the screen to see the timer, disrupting their flow
2. **Weight must be typed manually every set** — even when repeating the same weight as last session, users re-enter it from scratch
3. **No quick weight adjustment** — changing weight by 2.5kg requires clearing the field and retyping
4. **Rest timer completion is subtle** — a single haptic pulse can be missed in a noisy gym with the phone in a pocket

These are basic usability gaps that make FitForge less practical than commercial alternatives (Strong, Hevy, JEFIT) for actual gym use.

## User Stories

- As a gym user, I want my screen to stay on during my workout so I can glance at the timer without tapping
- As a lifter doing repeated sets, I want my last session's weight pre-filled so I don't have to remember and retype it
- As a lifter adding weight progressively, I want +/- buttons to adjust weight in standard increments
- As a gym user with my phone in my pocket, I want a strong haptic burst when rest ends so I don't miss it

## Proposed Solution

### Overview

Four targeted improvements to the session screen (`app/session/[id].tsx`) plus one setting, all leveraging existing dependencies and data.

### UX Design

#### 1. Keep Screen Awake
- Screen stays awake for the entire duration of an active (non-completed) session
- Uses `useKeepAwake` from `expo-keep-awake` (bundled with expo, no new dependency)
- Deactivates automatically when session completes or user navigates away
- No user-visible UI — this is invisible behavior

#### 2. Auto-Fill Weight from Previous Session
- When a session starts from a template, each exercise's sets are pre-populated with the weight from the user's last completed session using the same template
- Uses existing `getPreviousSets()` which already fetches previous weight/reps
- Weight field shows pre-filled value in normal text (not placeholder)
- User can clear or override the pre-filled weight at any time
- If no previous session exists for an exercise, weight field remains empty (current behavior)
- Only auto-fills weight, NOT reps (reps vary intentionally)

#### 3. Quick Weight Step Buttons
- Each weight input gets a minus and plus button flanking the text field
- Default step: 2.5 for kg users, 5 for lb users (derived from `body_settings.weight_unit`)
- Tapping plus adds one step to current weight; tapping minus subtracts one step
- If weight field is empty, plus starts from the step value (2.5 or 5)
- Minus cannot go below 0 (clamps to 0)
- Buttons are compact (24dp icon, 48dp touch target via hitSlop) to not crowd the set row
- Light haptic feedback on tap (`ImpactFeedbackStyle.Light`)

#### 4. Enhanced Rest Timer Completion Alert
- When rest timer reaches 0, fire a triple-burst haptic pattern:
  - `Haptics.notificationAsync(NotificationFeedbackType.Warning)` (stronger than current `Success`)
  - Wait 300ms
  - `Haptics.impactAsync(ImpactFeedbackStyle.Heavy)`
  - Wait 300ms
  - `Haptics.notificationAsync(NotificationFeedbackType.Warning)`
- This replaces the current single `notificationAsync(Success)` which is easy to miss
- Visual enhancement: rest timer card briefly flashes the primary color background when reaching 0 (200ms animation)

### Technical Approach

#### Keep Screen Awake
- Import `useKeepAwake` from `expo-keep-awake` (already a transitive dependency of `expo`)
- Call `useKeepAwake()` at the top of the `SessionScreen` component
- The hook automatically activates on mount and deactivates on unmount — no cleanup needed

#### Auto-Fill Weight
- In the session initialization effect (where `getSessionSets` returns empty and template exercises are created), after creating sets via `addSet()`, call `getPreviousSets(exerciseId, sessionId)` for each exercise
- For each set, if `prevCache[exerciseId]` has a matching `set_number` with a non-null weight, call `updateSet(setId, prevWeight, null)` to pre-fill the weight
- This happens once during initialization, not on every render
- The existing `load()` function will pick up the pre-filled values on next render

#### Quick Weight Step Buttons
- Add minus / plus `IconButton` components (from react-native-paper) around the weight `TextInput` in the set row
- Read weight unit from `body_settings` (already fetched in the progress screen; needs to be fetched here too via `getBodySettings()`)
- Compute step: `unit === 'lb' ? 5 : 2.5`
- On press: parse current weight, add/subtract step, call existing `handleChange(setId, 'weight', newValue)`
- Add `Haptics.impactAsync(ImpactFeedbackStyle.Light)` on each tap

#### Enhanced Rest Timer Alert
- Replace the existing `useEffect` that watches `rest === 0` with an enhanced haptic sequence
- Use `setTimeout` to chain three haptic calls with 300ms gaps
- Add an `Animated.Value` for the rest timer card background color, trigger a brief color flash animation on completion

### Scope

**In Scope:**
- `useKeepAwake` in session screen
- Auto-fill weight from previous session during session initialization
- Minus/plus step buttons on weight inputs
- Triple-burst haptic pattern on rest timer completion
- Brief visual flash on rest timer card when timer ends

**Out of Scope:**
- Sound/audio alerts (would require `expo-av` — separate phase if needed)
- Auto-fill reps (users vary reps intentionally)
- Configurable step size in settings (use sensible defaults: 2.5kg / 5lb)
- Keep-awake toggle in settings (always on during sessions — standard behavior)
- Timer notification when app is backgrounded (requires expo-notifications, separate phase)

### Acceptance Criteria

- [ ] Given an active session When the user waits 2+ minutes Then the screen does NOT dim or lock
- [ ] Given a user starts a session from a template they've used before When sets are created Then weight fields are pre-filled with last session's weights for matching exercises/set numbers
- [ ] Given a user starts a session from a template with no history When sets are created Then weight fields remain empty
- [ ] Given a set row with weight 50 and unit=kg When user taps plus Then weight becomes 52.5
- [ ] Given a set row with weight 50 and unit=lb When user taps plus Then weight becomes 55
- [ ] Given a set row with empty weight When user taps plus Then weight becomes 2.5 (kg) or 5 (lb)
- [ ] Given a set row with weight 2.5 and unit=kg When user taps minus Then weight becomes 0
- [ ] Given a set row with weight 0 When user taps minus Then weight stays 0
- [ ] Given the rest timer reaches 0 Then the user feels three distinct haptic pulses
- [ ] Given the rest timer reaches 0 Then the rest timer card briefly flashes
- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] App starts without crashes
- [ ] Existing solo/superset/circuit workout flows work unchanged

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session with no template (quick start) | No auto-fill (no previous data to reference). Keep-awake and step buttons still work. |
| Template used for first time | No auto-fill — weight fields empty. Step buttons still work. |
| Previous session had different number of sets | Auto-fill only for set numbers that have matching previous data. Extra sets remain empty. |
| Weight field contains non-numeric text | Step buttons treat as 0 and add/subtract step from 0. |
| Very rapid step button taps | Each tap queues a weight update. No debounce needed — individual taps are intentional. |
| Screen rotation during session | useKeepAwake persists across orientation changes. |
| User navigates away mid-session | useKeepAwake deactivates (hook unmounts). Re-entering reactivates. |
| Rest timer dismissed manually before 0 | No haptic burst — only fires when rest transitions from >0 to 0. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Battery drain from keep-awake | Medium | Low | Standard gym session is 45-90 min — acceptable drain. Deactivates on session end. |
| Auto-fill confuses user (unexpected values) | Low | Low | Weight fields are editable — user can clear/override. Values match what they lifted last time. |
| Step buttons crowd the set row UI | Medium | Medium | Use compact 24dp IconButtons. Test layout doesn't overflow on narrow screens. |
| Haptic triple-burst too aggressive | Low | Low | Uses Warning + Heavy + Warning — noticeable but not jarring. Can soften in future if feedback warrants. |

### Accessibility

- Step buttons: `accessibilityLabel="Decrease weight by {step}" / "Increase weight by {step}"`
- Step buttons: `accessibilityRole="button"`
- Auto-filled weight: no special a11y needed (standard TextInput with value)
- Haptic alert: inherently accessible (physical feedback)
- Rest timer flash: supplementary to haptic — not sole indicator

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict**: APPROVED (2026-04-13)
**Reviewer**: quality-director (Opus 4.6)

**Summary**: Four practical, well-scoped gym-use improvements. Low risk, additive, no schema changes.

**Issues Found**:
- [M] Step buttons 24dp visual need 48dp touch target — add hitSlop or padding to meet minimum

**Recommendations**:
- Consider useReducedMotion for rest timer flash animation
- Session screen at 950 lines — consider splitting if Phase 17+ adds more session features
- Consider subtle step-value tooltip on long-press of step buttons

**Decision**: APPROVED — one major issue (touch targets) is straightforward to address during implementation.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Well-scoped, low-risk, clean architecture fit. No schema changes.

Implementation notes:
1. Add `expo-keep-awake` as explicit dep (currently transitive only) via `npx expo install expo-keep-awake`
2. Wrap weight+step buttons in a `View` with `flex: 1` to maintain layout symmetry with reps column
3. Auto-fill: batch `updateSet` calls during init, call `load()` once at end (avoid N re-renders)
4. Triple-burst haptic: clear `setTimeout` refs in useEffect cleanup to avoid stale callbacks on unmount
5. Animated flash: `useNativeDriver: false` required for backgroundColor; store animation ref for cleanup

Reviewed: 2026-04-13

### CEO Decision
**APPROVED** (2026-04-13)

All reviewers agree. Incorporating mandatory fixes into implementation spec:
1. Step button touch targets must be 48dp minimum (hitSlop={{top:12,bottom:12,left:12,right:12}})
2. Add expo-keep-awake as explicit dep via `npx expo install expo-keep-awake`
3. Wrap weight+step buttons in flex:1 container for layout symmetry
4. Batch auto-fill updateSet calls, single load() at end
5. Clear setTimeout refs in haptic useEffect cleanup
6. Use useNativeDriver: false for backgroundColor animation, clean up on unmount
