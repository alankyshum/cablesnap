# Feature Plan: Interval Workout Timers (Phase 32)

**Issue**: BLD-86
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

FitForge's Tools section currently has 1RM Calculator and Plate Calculator. Users doing HIIT, Tabata, EMOM, or AMRAP workouts have no timer support — they must use a separate app or watch. This is especially relevant for Volta 1 training where timed eccentric sets (e.g., 4-second lowering) benefit from precise interval timing. Competitive apps like Strong, JEFIT, and Hevy offer built-in interval timers. Board goal: "Leverage more graphics to stand out."

Interval timers are the most visually engaging tool in any fitness app — big countdown displays, color transitions, haptic feedback. Adding them directly serves the "stand out visually" directive.

## User Stories

- As a user doing Tabata workouts on Volta 1, I want a 20s/10s interval timer so I can focus on form instead of watching a clock
- As a user doing EMOM training, I want a repeating minute timer with an alert at each minute boundary so I know when to start my next set
- As a user doing an AMRAP workout, I want a countdown timer so I can track how many rounds I complete in the allotted time
- As a user, I want to customize work/rest intervals so I can adapt timers to my specific training program

## Proposed Solution

### Overview

Add a new tool screen at `app/tools/timer.tsx` accessible from the Tools section. The screen provides three timer modes (Tabata, EMOM, AMRAP) plus a custom interval mode, each with a large animated countdown display, haptic feedback at transitions, and audio cues.

### UX Design

#### Navigation

- Add "Interval Timer" to the Workouts tab header (alongside the existing 1RM calculator icon button)
- Register route `tools/timer` in `_layout.tsx`
- The timer screen is a standalone tool (not embedded in workout sessions)

#### Timer Modes

**Mode 1: Tabata**
- Default: 20s work / 10s rest / 8 rounds
- Configurable: work duration (5-60s), rest duration (5-60s), rounds (1-20)
- Visual: Green during work, red during rest. Large countdown number. Round counter (e.g., "3/8")
- Audio/haptic: Double haptic at work start, single haptic at rest start, triple haptic at completion

**Mode 2: EMOM (Every Minute On the Minute)**
- Default: 10 minutes total
- Configurable: total duration (1-60 minutes)
- Visual: Large countdown showing seconds remaining in current minute. Minute counter. Color flash at minute boundary.
- Audio/haptic: Strong haptic at each minute boundary, triple at completion

**Mode 3: AMRAP (As Many Rounds As Possible)**
- Default: 10 minutes countdown
- Configurable: total duration (1-60 minutes)
- Visual: Large countdown timer. Manual round counter button (+1 round). Total rounds display.
- Audio/haptic: Warning haptic at 30s, 10s remaining. Triple at completion.

**Mode 4: Custom Interval**
- Configurable: work duration, rest duration, rounds
- Visual: Same as Tabata but with user-defined values
- This mode is essentially "Tabata with custom values" — share the same component

#### Screen Layout

```
[Mode Selector: Tabata | EMOM | AMRAP | Custom]

[Configuration Section]
  Work: [stepper 20s]  Rest: [stepper 10s]  Rounds: [stepper 8]

[Timer Display - takes up majority of screen]
  ┌─────────────────────────────┐
  │         WORK / REST         │  ← phase label
  │                             │
  │           0:15              │  ← large countdown (mono font)
  │                             │
  │        Round 3 / 8          │  ← round counter
  └─────────────────────────────┘

[Controls]
  [Start / Pause]   [Reset]

[AMRAP only: +1 Round button below timer]
```

#### Visual Design

- Timer display background changes color: work=primary/green tint, rest=error/red tint
- Countdown number uses large monospace font (48-72pt) for readability at arm's length
- Smooth color transitions between phases (Animated API)
- Progress ring around the timer showing elapsed portion of current interval
- Respects light/dark theme — use theme.colors with opacity, no hardcoded hex

#### Accessibility

- Screen reader announces phase transitions ("Work phase, 20 seconds", "Rest phase, 10 seconds")
- All stepper controls have accessibilityLabel and accessibilityHint
- Timer display has live region for countdown updates (throttled to avoid excessive announcements — announce at 10, 5, 3, 2, 1 seconds)
- Start/Pause button changes label dynamically

### Technical Approach

#### New File
- `app/tools/timer.tsx` — Single file containing the timer screen and all logic

#### Modified Files
- `app/_layout.tsx` — Add `Stack.Screen` for `tools/timer` route
- `app/(tabs)/index.tsx` — Add timer icon button to header (alongside existing 1RM button)

#### Dependencies
- `expo-haptics` — already installed
- `expo-keep-awake` — already installed (used in session screen)
- No new dependencies required

#### Implementation Details

1. **Timer state machine**: Use `useRef` for interval ID, `useState` for display values. States: `idle`, `running`, `paused`.
2. **Phase tracking**: Track `phase` (work/rest), `round` (current round number), `remaining` (seconds left in current phase).
3. **Interval precision**: Use `setInterval(fn, 1000)` matching the existing rest timer pattern in session/[id].tsx.
4. **Keep awake**: Use `useKeepAwake()` during active timer (already used in session screen).
5. **Haptic feedback**: Use `Haptics.impactAsync()` at phase transitions (same pattern as session rest timer).
6. **Animated color**: Use `Animated.Value` for background color interpolation between work/rest phases.
7. **Progress ring**: Use React Native `Animated` with SVG circle (via `react-native-svg`, already installed for muscle illustrations) to show elapsed time as a circular progress indicator.

#### State Machine

```
idle → (start) → running → (pause) → paused → (resume) → running
                     ↓                                       ↓
                 (tick) → check remaining                (reset) → idle
                     ↓
               remaining > 0 → decrement
               remaining === 0 → next phase/round
                     ↓
               all rounds done → idle (completion)
```

### Scope

**In Scope:**
- Timer screen with 4 modes (Tabata, EMOM, AMRAP, Custom)
- Configurable durations and rounds via stepper controls
- Visual countdown with color-coded phases
- Circular progress ring
- Haptic feedback at transitions
- Keep-awake during timer
- Header icon on Workouts tab for quick access
- Route registration in _layout.tsx
- Light/dark theme support
- Accessibility labels and live regions
- New tests for timer logic (phase transitions, round counting, state machine)

**Out of Scope:**
- Sound/audio cues (would require expo-av which is not installed)
- Saving timer presets/favorites
- Integration with workout sessions (timer is standalone tool)
- Background timer (continues when app is minimized)
- Apple Watch / wearable integration

### Acceptance Criteria

- [ ] Route `tools/timer` registered in _layout.tsx with header
- [ ] Timer icon button appears in Workouts tab header
- [ ] Mode selector shows Tabata, EMOM, AMRAP, Custom tabs
- [ ] Tabata default: 20s work / 10s rest / 8 rounds
- [ ] EMOM default: 10 minutes
- [ ] AMRAP default: 10 minutes with manual round counter
- [ ] Custom: user sets work/rest/rounds via steppers
- [ ] Large countdown display (monospace, 48pt+) readable at arm's length
- [ ] Background color changes: green-tint for work, red-tint for rest
- [ ] Circular progress ring shows elapsed portion of current interval
- [ ] Haptic feedback at phase transitions
- [ ] Screen stays awake during active timer
- [ ] Start/Pause/Reset controls work correctly
- [ ] Timer continues accurately through phase and round transitions
- [ ] Round counter displays current/total (e.g., "3/8")
- [ ] AMRAP has +1 Round button for manual counting
- [ ] All UI respects light/dark theme (no hardcoded colors)
- [ ] Touch targets >= 48dp
- [ ] Accessibility: phase transitions announced, controls labeled
- [ ] `npx tsc --noEmit` passes
- [ ] All existing 340 tests pass
- [ ] New tests cover: timer state machine, phase transitions, round counting, mode switching

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| App backgrounded during timer | Timer pauses (no background execution). Show "Timer was paused" on return |
| Rapid start/pause tapping | Debounce — ignore taps within 300ms of last tap |
| Round count 0 | Stepper minimum is 1 — cannot set to 0 |
| Duration 0 | Stepper minimum is 5 seconds — cannot set to 0 |
| Very long timer (60 min AMRAP) | Works correctly, countdown display handles minutes:seconds format |
| Navigate away during timer | Timer stops. No background timer. User must restart |
| Orientation change | Layout adapts — timer display remains centered and large |
| EMOM minute boundary at exact 0 | Triggers haptic + color flash, resets to 60s for next minute |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Interval drift over long durations | Low | Low | Use same setInterval pattern as existing rest timer (proven reliable) |
| SVG progress ring performance | Low | Low | react-native-svg already used for muscle illustrations — proven |
| Timer not precise enough | Low | Medium | 1-second granularity is standard for workout timers; sub-second not needed |
| Screen clutter with 4 modes | Medium | Low | SegmentedButtons (same pattern as other screens) keeps it clean |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED
**Reviewer**: techlead
**Date**: 2026-04-14

**Technical Feasibility**: Fully buildable. All deps installed (expo-haptics, expo-keep-awake, react-native-svg). No new deps.

**Architecture Fit**: Compatible — additive change following tools/plates.tsx and tools/rm.tsx patterns.

**Complexity**: Medium effort, Low risk.

**Recommendations (not blockers)**:
1. **Extract timer state machine to lib/timer.ts** (MAJOR) — mirrors lib/plates.ts pattern for testability. Pure functions for phase transitions, round counting, remaining-time computation. Component consumes; tests exercise directly.
2. **Merge Custom mode into Tabata** (MINOR) — Tabata is already fully configurable, making Custom redundant. Drop to 3 modes.
3. **Use Date.now() source-of-truth** (MINOR) — For 60-min AMRAP accuracy, store start timestamp and compute remaining from Date.now() difference (same pattern as session elapsed timer at line 260 of session/[id].tsx).
4. **Add AppState handling** (MINOR) — Background detection needs AppState.addEventListener('change') to show "Timer was paused" on return.
5. **Add useFocusEffect cleanup** (MINOR) — Pause timer on focus loss to handle tab switching edge case.

### CEO Decision
_Pending reviews_
