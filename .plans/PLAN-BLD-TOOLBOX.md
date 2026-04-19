# Feature Plan: Workout Toolbox & Rest Timer Integration

**Issue**: BLD-395
**GitHub Issue**: #201
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement

During a workout, the rest timer and toolbox are hidden behind a wrench icon in the session header. The user must:
1. Tap the wrench icon to open a bottom sheet
2. Navigate to the rest timer section
3. Select a duration and tap "Start Rest Timer"
4. Close the sheet to see the rest countdown in the header

This is **4 taps to start a rest timer** — the most frequently used tool during a workout. The owner wants the rest timer countdown, elapsed time, and toolbox trigger all visible in the session header area, with configurable rest durations and haptic/sound feedback on completion.

**Why now?** The toolbox crash (GitHub #198, BLD-344) was just fixed. The owner explicitly requested this integration in GitHub #201 while that fix was in progress. This is the highest-impact open feature request.

## User's Emotional Journey

**WITHOUT this feature:** "I finished my set. I need to time my rest. Let me find the wrench icon... open the sheet... scroll to rest timer... pick 90 seconds... close the sheet. By the time I set it up, 20 seconds of my rest already passed. I'll just guess when 90 seconds is up."

**AFTER this feature:** "I finished my set. I tap the timer area in the header and my 90-second rest starts immediately. I can see the countdown right there while I review my next set. When it vibrates, I know it's time to go."

## User Stories

- As a gym user, I want to start my rest timer with one tap so I don't waste time navigating menus between sets
- As a gym user, I want to see my rest countdown prominently in the session header so I can track it while reviewing exercises
- As a gym user, I want my rest timer to vibrate and play a sound when complete so I know even if my phone is face-down
- As a gym user, I want to configure my default rest duration so the one-tap start uses my preferred time
- As a gym user, I want to still access plate calculator, 1RM calculator, and interval timer during my workout

## Proposed Solution

### Overview

Redesign the session screen header's right section into a **SessionHeaderToolbar** component that:
1. Shows the rest timer countdown prominently when active (replaces the current tiny MM:SS text)
2. Shows the elapsed workout time when no rest timer is active
3. Provides a one-tap rest timer start (tap the timer area to start/restart rest)
4. Long-press the timer area to open rest duration picker (30s/60s/90s/120s/custom)
5. Wrench icon opens the full toolbox sheet (plate calc, 1RM, interval timer — rest timer section removed from sheet since it's now in header)

### UX Design

#### Header Right Area Layout

```
┌──────────────────────────────────────────────────────┐
│  [Session Name]          [REST 1:23] [⏱ 45:30] [🔧] │
│                           ↑ tap to    ↑ elapsed  ↑   │
│                           start/      time     tools │
│                           dismiss                     │
└──────────────────────────────────────────────────────┘
```

**When rest timer is NOT active:**
```
[⏱ 45:30] [🔧]
```
- Tap the elapsed time area → starts rest timer with configured default duration
- Tap wrench → opens toolbox sheet

**When rest timer IS active:**
```
[REST 1:23] [⏱ 45:30] [🔧]
```
- Rest countdown shown in primary color, prominent
- Tap rest timer → dismiss rest timer (with confirmation? No — one tap dismiss is fine, user can restart)
- Elapsed time shrinks (current behavior, already implemented)
- Wrench still accessible

**When rest timer completes (0:00):**
- Vibrate (heavy impact + warning notification — already implemented in useRestTimer)
- Play "complete" sound (already implemented)
- Flash the rest timer area briefly (restFlashStyle — already implemented)
- Auto-dismiss after 3 seconds showing "REST DONE ✓"

#### Rest Duration Configuration

**Long-press the timer/elapsed area** → opens an inline popover or mini-sheet with:
```
┌─────────────────────────┐
│ Rest Duration           │
│ [30s] [60s] [90s] [2m]  │
│ [Custom: ___s]          │
│                         │
│ ☑ Vibrate on complete   │
│ ☑ Sound on complete     │
└─────────────────────────┘
```

- Selecting a preset immediately starts the rest timer with that duration
- Custom allows entering a value in seconds
- Settings persist via `setAppSetting` (exercise-level rest override already exists in DB)
- Defaults: 90s rest, vibrate ON, sound ON

#### Toolbox Sheet (Modified)

Remove the rest timer section from `SessionToolboxSheet` since it's now in the header. Keep:
- Plate Calculator
- 1RM Calculator
- Interval Timer

#### One-Handed Use (Gym Context)

- Timer area is in the top-right — easily reachable with right thumb
- One tap to start rest (most common action)
- Long-press for settings (infrequent action)
- No scrolling required for the most common workflow
- Large enough tap targets (minimum 44pt)

### Technical Approach

#### New Component: `SessionHeaderToolbar`

Extract the current inline header right JSX from `app/session/[id].tsx` (lines 199-236) into a dedicated component:

```
components/session/SessionHeaderToolbar.tsx
```

**Props:**
- `rest: number` — current rest countdown seconds
- `elapsed: number` — total workout elapsed seconds
- `onStartRest: (duration: number) => void` — start rest timer
- `onDismissRest: () => void` — dismiss rest timer
- `onOpenToolbox: () => void` — open toolbox sheet
- `restFlashStyle?: AnimatedStyle` — flash animation on rest complete

**No new dependencies required.** Uses existing:
- `useRestTimer` hook (already handles persistence, sound, haptics)
- `formatTime` utility
- Theme colors via `useThemeColors`
- `Pressable` for tap/long-press detection (built into React Native)

#### Rest Duration Settings

Store default rest duration in app settings:
- Key: `rest_timer_default_seconds` (number, default 90)
- Key: `rest_timer_vibrate` (boolean, default true)  
- Key: `rest_timer_sound` (boolean, default true)

These already fit the existing `getAppSetting`/`setAppSetting` pattern.

#### Data Model Changes

**None.** The existing `app_settings` table and `exercise_rest_seconds` column on exercises handle all storage needs.

#### Performance Considerations

- Timer interval already exists (1000ms in useRestTimer) — no additional intervals needed
- `SessionHeaderToolbar` is a small component — minimal render cost
- Long-press popover rendered lazily (only when activated)

### Scope

**In Scope:**
- Extract session header right area into `SessionHeaderToolbar` component
- One-tap rest timer start from header (tap elapsed time area)
- Long-press for rest duration picker (30s/60s/90s/120s/custom)
- Rest timer countdown display in header (prominent, primary color)
- Rest completion feedback (vibrate + sound — already works via useRestTimer)
- Persist default rest duration in app settings
- Remove rest timer section from SessionToolboxSheet
- Tests for new component

**Out of Scope:**
- Per-exercise rest timer configuration (already exists as `exercise_rest_seconds` in DB — not changing)
- Redesigning the toolbox sheet layout (only removing rest timer section)
- Adding new tools to the toolbox
- Changes to the interval timer
- Rest timer auto-start after logging a set (future enhancement — too much scope)
- Animated transitions between rest active/inactive states (keep it simple)

### Acceptance Criteria

- [ ] Given a user is on the active session screen, When they tap the elapsed time area, Then a rest timer starts with their configured default duration (default: 90s)
- [ ] Given a rest timer is active, When the countdown reaches 0, Then the phone vibrates, plays a completion sound, and the header shows "REST DONE ✓" for 3 seconds before auto-dismissing
- [ ] Given a rest timer is active, When the user taps the rest countdown, Then the rest timer is dismissed immediately
- [ ] Given a user is on the active session screen, When they long-press the timer area, Then a duration picker appears with presets (30s, 60s, 90s, 2m) and a custom input
- [ ] Given a user selects a preset in the duration picker, Then the rest timer starts immediately with that duration AND the default is saved for future one-tap starts
- [ ] Given a user opens the toolbox sheet (wrench icon), Then the sheet shows Plate Calculator, 1RM Calculator, and Interval Timer (no rest timer section)
- [ ] Given the app is backgrounded during a rest timer, When the user returns, Then the rest timer shows the correct remaining time (already works via useRestTimer)
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] New `SessionHeaderToolbar` component has unit tests

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User taps elapsed time but no default rest duration set | Start rest with 90s (hardcoded fallback) |
| User taps elapsed time while rest timer already active | Restart rest timer with default duration (don't stack timers) |
| Rest timer reaches 0 while app is backgrounded | Local notification fires (already implemented), on resume show "REST DONE ✓" |
| User opens duration picker then dismisses without selecting | No change to timer state |
| User enters 0 or negative custom duration | Validation: minimum 10 seconds, show error if < 10 |
| User enters very large custom duration (>600s) | Cap at 600s (10 minutes), show warning |
| Screen rotates during rest countdown | Layout adapts (flex row handles it) |
| User navigates away from session and back | Rest timer persists (useRestTimer uses refs, not screen state) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Header area too crowded with rest + elapsed + wrench | Medium | Medium | Keep layout simple, test on narrow screens (320px). Rest and elapsed can share space — elapsed shrinks when rest active (current behavior) |
| Long-press conflicts with other gestures | Low | Low | Only the timer area responds to long-press, no other long-press targets nearby |
| Users don't discover long-press for settings | Medium | Low | One-tap with 90s default covers 80% of use cases. Settings are a nice-to-have, not critical path |
| Removing rest timer from toolbox sheet confuses users | Low | Low | The timer is now MORE accessible, not less. Users who tap wrench looking for rest timer will see it's in the header |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
