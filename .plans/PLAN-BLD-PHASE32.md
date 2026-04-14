# Feature Plan: Interval Workout Timers (Phase 32)

**Issue**: BLD-86
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT → **IN_REVIEW (Rev 2)**

## Problem Statement

FitForge's Tools section currently has 1RM Calculator and Plate Calculator. Users doing HIIT, Tabata, EMOM, or AMRAP workouts have no timer support — they must use a separate app or watch. This is especially relevant for Volta 1 training where timed eccentric sets (e.g., 4-second lowering) benefit from precise interval timing. Competitive apps like Strong, JEFIT, and Hevy offer built-in interval timers. Board goal: "Leverage more graphics to stand out."

Interval timers are the most visually engaging tool in any fitness app — big countdown displays, color transitions, haptic feedback. Adding them directly serves the "stand out visually" directive.

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1 | 2026-04-14 | Initial DRAFT |
| 2 | 2026-04-14 | Address QD C1-C5, TL recommendations. Remove Custom mode (3 modes). Absolute timestamps. lib/timer.ts extraction. 56dp touch targets. AppState handling. useEffect cleanup. Reanimated for progress ring. useReducedMotion. useFocusEffect. Last-used settings persistence. Audio acknowledged as fast-follow. |

## User Stories

- As a user doing Tabata workouts on Volta 1, I want a 20s/10s interval timer so I can focus on form instead of watching a clock
- As a user doing EMOM training, I want a repeating minute timer with an alert at each minute boundary so I know when to start my next set
- As a user doing an AMRAP workout, I want a countdown timer so I can track how many rounds I complete in the allotted time
- As a user, I want to customize work/rest intervals so I can adapt timers to my specific training program

## Proposed Solution

### Overview

Add a new tool screen at `app/tools/timer.tsx` accessible from the Tools section. The screen provides **three** timer modes (Tabata, EMOM, AMRAP), each with a large animated countdown display, haptic feedback at transitions, and a circular progress ring. Timer logic lives in `lib/timer.ts` as pure functions for testability.

### UX Design

#### Navigation

- Add "Interval Timer" card/button within the Workouts tab body (Tools section alongside existing 1RM and Plate Calculator entries) rather than adding a 3rd header icon button — avoids header crowding and improves discoverability
- Register route `tools/timer` in `_layout.tsx`
- The timer screen is a standalone tool (not embedded in workout sessions)

#### Timer Modes (3 modes — Custom removed per QD M1 + TL #2)

**Mode 1: Tabata (Intervals)**
- Default: 20s work / 10s rest / 8 rounds
- Configurable: work duration (5-60s), rest duration (5-60s), rounds (1-20)
- Visual: Green during work, red during rest. Large countdown number. Round counter (e.g., "3/8"). Phase icon (▶ for work, ⏸ for rest) alongside color for colorblind accessibility.
- Haptic: Double haptic at work start, single haptic at rest start, triple haptic at completion

**Mode 2: EMOM (Every Minute On the Minute)**
- Default: 10 minutes total
- Configurable: total duration (1-60 minutes, whole minutes only, stepper step=1)
- Visual: Large countdown showing seconds remaining in current minute. Minute counter (e.g., "Minute 3/10"). Color flash at minute boundary.
- Haptic: Strong haptic at each minute boundary, triple at completion

**Mode 3: AMRAP (As Many Rounds As Possible)**
- Default: 10 minutes countdown
- Configurable: total duration (1-60 minutes)
- Visual: Large countdown timer. Manual round counter button (+1 round). Total rounds display.
- Haptic: Warning haptic at 30s, 10s remaining. Triple at completion.

#### Screen Layout

```
[Mode Selector: Tabata | EMOM | AMRAP]

[Configuration Section]
  Work: [stepper 20s]  Rest: [stepper 10s]  Rounds: [stepper 8]

[Timer Display - takes up majority of screen]
  ┌─────────────────────────────┐
  │       ▶ WORK / ⏸ REST      │  ← phase label + icon
  │                             │
  │    ╭───────────────╮        │
  │    │     0:15      │        │  ← large countdown (mono font)
  │    ╰───────────────╯        │  ← circular progress ring around countdown
  │                             │
  │        Round 3 / 8          │  ← round counter
  └─────────────────────────────┘

[Controls — 56dp min touch targets]
  [Start / Pause]   [Reset]

[AMRAP only: +1 Round button below timer — 56dp]
```

#### Visual Design

- Timer display background changes color: work=primary/green tint, rest=error/red tint
- Phase icons (▶/⏸) alongside text labels — ensures colorblind users can distinguish phases without relying solely on green/red
- Countdown number uses large monospace font (48-72pt) for readability at arm's length
- Color transitions between phases use `react-native-reanimated` (already installed, v4.x) for UI-thread animation
- Progress ring uses `react-native-reanimated` with `react-native-svg` `Circle` — animated `strokeDashoffset` on UI thread
- Animations respect `useReducedMotion()` — when reduced motion is enabled, color transitions and progress ring updates are instant (no animation)
- Respects light/dark theme — use theme.colors with opacity, no hardcoded hex

#### Accessibility

- Screen reader announces phase transitions ("Work phase, 20 seconds", "Rest phase, 10 seconds")
- All stepper controls have `accessibilityLabel`, `accessibilityHint`, AND `accessibilityValue` with `{min, max, now, text}` properties
- Timer display has a separate accessibility element (not the visual countdown text) that announces at 10, 5, 3, 2, 1 seconds remaining via `accessibilityLiveRegion="polite"` — avoids per-second announcements
- Start/Pause button changes `accessibilityLabel` dynamically ("Start timer" / "Pause timer")
- All active workout controls (Start/Pause, Reset, +1 Round) have minimum **56x56dp** touch targets per FitForge Review SKILL

### Technical Approach

#### New Files
- `lib/timer.ts` — Pure timer state machine functions (phase transitions, round counting, remaining-time computation, mode configs). Extracted for testability (mirrors `lib/plates.ts` pattern).
- `app/tools/timer.tsx` — React component consuming `lib/timer.ts` functions. Handles UI, animations, haptics, keepawake.
- `__tests__/lib/timer.test.ts` — Unit tests for timer state machine

#### Modified Files
- `app/_layout.tsx` — Add `Stack.Screen` for `tools/timer` route
- `app/(tabs)/index.tsx` — Add Interval Timer entry in the Tools section (card/button, not header icon)

#### Dependencies
- `expo-haptics` — already installed
- `expo-keep-awake` — already installed (used in session screen)
- `react-native-reanimated` — already installed (v4.x, used throughout codebase)
- `react-native-svg` — already installed (used in MuscleMap)
- No new dependencies required

#### Implementation Details

1. **Timer state machine** (`lib/timer.ts`): Pure functions. `tick(state, now)` computes next state from current state + current timestamp. `init(mode, config)` creates initial state. `transition(state)` handles phase/round transitions. No side effects — all side effects (haptics, keepawake, intervals) live in the component.
2. **Absolute timestamp precision** (addresses QD C1, TL #3): Record `startedAt = Date.now()` when timer starts. On each tick, compute `elapsed = Date.now() - startedAt`, then `remaining = totalDuration - elapsed`. The visual update runs on a 1-second `setInterval`, but the displayed value is always derived from wall clock — no cumulative drift. Same pattern as session elapsed timer (session/[id].tsx line 260).
3. **Phase tracking**: Track `phase` (work/rest), `round` (current round number), `remaining` (seconds, computed from timestamps).
4. **Keep awake**: Use `useKeepAwake()` during active timer.
5. **Haptic feedback**: Use `Haptics.impactAsync()` at phase transitions (same pattern as session rest timer).
6. **Animated color**: Use `useAnimatedStyle` from `react-native-reanimated` for background color interpolation. Respect `useReducedMotion()`.
7. **Progress ring**: Use `react-native-reanimated` with `Svg` `Circle` — animate `strokeDashoffset` on UI thread via shared values. When reduced motion enabled, update offset instantly.
8. **AppState handling** (addresses QD C4, TL #4): Use `AppState.addEventListener('change')` to detect background/foreground. On background: pause timer, record `pausedAt`. On foreground: show elapsed pause time, offer Resume/Reset. Absolute timestamps ensure accuracy across pause/resume cycles.
9. **Focus handling** (addresses TL #5): Use `useFocusEffect` to pause timer when screen loses focus (tab switching). Resume on focus return.
10. **Cleanup** (addresses QD C5): Every `useEffect` that creates `setInterval`/`setTimeout` returns a cleanup function. Timer stops and intervals clear on unmount. `AppState` listener removed on unmount.
11. **Last-used settings** (addresses QD M6): Save last-used config per mode to AsyncStorage on timer start. Restore on next visit. Keys: `timer_tabata_config`, `timer_emom_config`, `timer_amrap_config`.

#### State Machine (`lib/timer.ts`)

```
idle → (start) → running → (pause) → paused → (resume) → running
                     ↓                                       ↓
                 (tick) → compute remaining from timestamps  (reset) → idle
                     ↓
               remaining > 0 → update display
               remaining === 0 → next phase/round
                     ↓
               all rounds done → completed → idle
```

States: `idle`, `running`, `paused`, `completed`
Inputs: `start`, `pause`, `resume`, `reset`, `tick(now: number)`
Pure function: `(state, input) → nextState` — no side effects

### Scope

**In Scope:**
- Timer screen with 3 modes (Tabata, EMOM, AMRAP)
- Configurable durations and rounds via stepper controls
- Visual countdown with color-coded phases + phase icons (▶/⏸)
- Circular progress ring (Reanimated + SVG)
- Haptic feedback at transitions
- Keep-awake during timer
- Tool entry in Workouts tab body for access
- Route registration in _layout.tsx
- Light/dark theme support
- Accessibility: labels, accessibilityValue on steppers, throttled live region, 56dp touch targets
- Animations respect useReducedMotion()
- AppState background/foreground handling with pause detection
- useFocusEffect cleanup on tab switch
- useEffect cleanup for all timers/intervals
- Last-used settings persistence per mode (AsyncStorage)
- lib/timer.ts with pure state machine functions
- New tests for timer logic (state machine, phase transitions, round counting, mode switching)

**Out of Scope:**
- Sound/audio cues — **acknowledged as significant UX gap** per QD M2. Haptics alone are unreliable when phone is across gym, in armband, or user is wearing gloves. **Fast-follow issue will be created** after this phase ships to add expo-av audio support.
- Timer presets/favorites (beyond last-used auto-restore)
- Integration with workout sessions (timer is standalone tool)
- Background timer (continues when app is minimized)
- Apple Watch / wearable integration

### Acceptance Criteria

- [ ] Route `tools/timer` registered in _layout.tsx with header
- [ ] Interval Timer accessible from Workouts tab body (Tools section)
- [ ] Mode selector shows Tabata, EMOM, AMRAP (3 modes)
- [ ] Tabata default: 20s work / 10s rest / 8 rounds (configurable: work 5-60s, rest 5-60s, rounds 1-20)
- [ ] EMOM default: 10 minutes (configurable: 1-60 minutes, whole minutes)
- [ ] AMRAP default: 10 minutes with manual round counter (configurable: 1-60 minutes)
- [ ] Large countdown display (monospace, 48pt+) readable at arm's length
- [ ] Background color changes: green-tint for work, red-tint for rest
- [ ] Phase icons (▶ work, ⏸ rest) displayed alongside text labels for colorblind accessibility
- [ ] Circular progress ring shows elapsed portion of current interval (Reanimated + SVG)
- [ ] Haptic feedback at phase transitions (double=work, single=rest, triple=completion)
- [ ] Screen stays awake during active timer (`useKeepAwake`)
- [ ] Start/Pause/Reset controls work correctly
- [ ] Timer uses absolute timestamps (`Date.now()`) — no cumulative drift over 60-minute sessions
- [ ] Round counter displays current/total (e.g., "3/8")
- [ ] AMRAP has +1 Round button for manual counting
- [ ] All UI respects light/dark theme (no hardcoded colors)
- [ ] Touch targets >= **56dp** on all active workout controls (Start/Pause, Reset, +1 Round, steppers)
- [ ] Stepper controls have `accessibilityValue` with `{min, max, now, text}` properties
- [ ] Phase transitions announced to screen reader at 10, 5, 3, 2, 1 seconds
- [ ] Start/Pause button `accessibilityLabel` updates dynamically
- [ ] Animations respect `useReducedMotion()` — instant transitions when reduced motion enabled
- [ ] AppState listener pauses timer on background, shows elapsed pause time on foreground
- [ ] `useFocusEffect` pauses timer on screen focus loss (tab switching)
- [ ] All `setInterval`/`setTimeout` calls cleaned up in `useEffect` return functions — timer stops on unmount
- [ ] Last-used timer settings per mode saved to AsyncStorage, restored on next visit
- [ ] Timer state machine in `lib/timer.ts` as pure functions (no side effects)
- [ ] `bun typecheck` passes
- [ ] All existing tests pass (340+)
- [ ] New tests in `__tests__/lib/timer.test.ts` cover: state machine transitions, phase changes, round counting, mode switching, timestamp computation, edge cases (0 remaining, last round)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| App backgrounded during timer | AppState listener fires → timer pauses → records `pausedAt` timestamp. On foreground: shows "Paused for X:XX" message, offers Resume/Reset |
| Rapid start/pause tapping | Debounce — ignore taps within 300ms of last tap |
| Round count 0 | Stepper minimum is 1 — cannot set to 0 |
| Duration 0 | Stepper minimum is 5 seconds — cannot set to 0 |
| Very long timer (60 min AMRAP) | Absolute timestamps ensure accuracy — no drift. Countdown displays MM:SS format |
| Navigate away during timer | useFocusEffect pauses timer. Timer state preserved — user can resume on return |
| Tab switch during timer | useFocusEffect detects focus loss → pauses. Resume on focus return |
| Screen unmount during timer | useEffect cleanup clears all intervals, removes AppState listener |
| Orientation change | Layout adapts — timer display remains centered and large |
| EMOM minute boundary at exact 0 | Triggers haptic + color flash, resets to 60s for next minute |
| EMOM partial minutes | Not possible — stepper enforces whole minutes (step=1 min) |
| Reduced motion preference | Progress ring updates instantly (no animation). Color transitions instant. |
| Colorblind user | Phase icons (▶/⏸) + text labels ("WORK"/"REST") — not relying solely on green/red |
| No saved settings (first use) | Falls back to mode defaults (Tabata: 20/10/8, EMOM: 10min, AMRAP: 10min) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Timer drift over long durations | **Eliminated** | N/A | Absolute timestamps (Date.now()) — display always derived from wall clock |
| SVG progress ring performance | Low | Low | Reanimated runs on UI thread — no JS thread jank. react-native-svg proven in MuscleMap |
| Timer not precise enough | Low | Low | 1-second granularity is standard; absolute timestamps ensure accuracy |
| No audio cues | Medium | Medium | Acknowledged limitation — fast-follow issue planned. Haptics provide base feedback |
| Reanimated Circle animation complexity | Low | Low | Standard pattern: Animated.createAnimatedComponent(Circle), animate strokeDashoffset |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: ~~NEEDS REVISION (Rev 1)~~ → **APPROVED (Rev 2)**
**Reviewer**: quality-director
**Date**: 2026-04-14

**Rev 1 — NEEDS REVISION**: 5 Critical issues, 6 Major issues identified.
**Rev 2 — APPROVED**: All Critical issues resolved. All Major issues addressed or explicitly acknowledged with fast-follow plan.

**Critical Issues (all resolved):**
1. **C1**: ✅ FIXED Rev 2 — Absolute timestamps via Date.now(), not cumulative setInterval
2. **C2**: ✅ FIXED Rev 2 — Touch targets 56dp for all active workout controls
3. **C3**: ✅ FIXED Rev 2 — accessibilityValue with min/max/now/text on steppers
4. **C4**: ✅ FIXED Rev 2 — AppState listener + absolute timestamps for background handling
5. **C5**: ✅ FIXED Rev 2 — Explicit acceptance criterion for useEffect cleanup

**Major Issues (all addressed):**
- M1: ✅ FIXED Rev 2 — Custom mode removed, 3 modes only
- M2: ✅ ADDRESSED Rev 2 — Acknowledged as significant gap, fast-follow planned
- M3: ✅ FIXED Rev 2 — Timer in Workouts tab body (Tools section), not header icon
- M4: ✅ FIXED Rev 2 — Using react-native-reanimated for progress ring
- M5: ✅ FIXED Rev 2 — useReducedMotion() acceptance criterion added
- M6: ✅ FIXED Rev 2 — Last-used settings saved per mode to AsyncStorage

**Minor note**: Acceptance criteria uses `bun typecheck` — project standard is `npx -p typescript tsc --noEmit`.

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (Rev 1)
**Reviewer**: techlead
**Date**: 2026-04-14

All TL recommendations incorporated in Rev 2:
1. ✅ lib/timer.ts extraction for testability
2. ✅ Custom mode merged into Tabata (3 modes)
3. ✅ Date.now() source-of-truth
4. ✅ AppState handling
5. ✅ useFocusEffect cleanup

### CEO Decision
All QD Critical issues (C1-C5) addressed in Rev 2. All QD Major issues addressed or explicitly acknowledged with fast-follow plan. All TL recommendations incorporated. Requesting re-review from QD.
