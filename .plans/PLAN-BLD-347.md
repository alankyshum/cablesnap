# Feature Plan: Workout Toolbox + Rest Timer Integration into Session Header

**Issue**: BLD-347
**Author**: CEO
**Date**: 2026-04-18
**Status**: DRAFT
**Source**: GitHub #201 (alankyshum) — enhancement request

## Problem Statement

The workout toolbox is currently a standalone screen (`/tools`) accessible only from the Workouts home tab via a wrench icon. During an active workout session, users must leave the session to access tools like the plate calculator, 1RM calculator, or interval timer. This breaks flow.

Additionally, the rest timer currently displays as a banner inside the exercise list (`SessionListHeader`), taking up vertical space in the scrollable content. The owner requests moving the toolbox trigger and rest timer display into the session header area (top-right, where the elapsed timer is shown), creating a more integrated, persistent, and accessible workout experience.

The owner also wants configurable rest timer durations (30s or custom values) with vibration and sound alerts on completion.

## User Stories

- As a user doing a workout, I want to access workout tools (plate calc, 1RM calc) without leaving my session so I don't lose my place
- As a user between sets, I want to see my rest timer countdown prominently in the header so I know when to resume
- As a user, I want to configure my rest timer duration (30s, 60s, 90s, or custom) so it matches my training style
- As a user, I want haptic and audio alerts when my rest period is complete so I don't miss it even if I'm looking away

## Proposed Solution

### Overview

Redesign the session header to be a rich, multi-function area that:
1. Always shows the total elapsed workout time
2. Shows a toolbox trigger button (wrench/toolbox icon)
3. When a rest timer is active, shows the countdown prominently alongside elapsed time
4. Opens a bottom sheet with workout tools when the toolbox button is tapped

### UX Design

#### Header Layout (Normal State — No Rest Timer Active)

```
┌──────────────────────────────────────────────────┐
│  ← Back   Session Name        00:45:23  🔧      │
│                                elapsed   tools   │
└──────────────────────────────────────────────────┘
```

- Elapsed time: displayed as before (primary color, `formatTime`)
- Toolbox button: wrench icon (`wrench` or `tools`) — tapping opens toolbox bottom sheet

#### Header Layout (Rest Timer Active)

```
┌──────────────────────────────────────────────────┐
│  ← Back   Session Name    01:30  00:45:23  🔧   │
│                            rest   elapsed  tools │
└──────────────────────────────────────────────────┘
```

- Rest countdown: prominent display (larger/bold text, primary color, animated)
- Elapsed time: slightly de-emphasized (smaller, secondary color)
- Rest timer text pulses/flashes in final 3 seconds (reuse existing `restFlash` animation)
- Tapping the rest countdown area shows a "Skip" option (or directly skips)

#### Toolbox Bottom Sheet

When the wrench icon is tapped, a bottom sheet opens with the existing tools:
1. **Rest Timer Config** — NEW: Quick-start rest timer with preset durations
2. **Plate Calculator** — reuse `PlateCalculatorContent`
3. **1RM Calculator** — reuse `RMCalculatorContent`
4. **Interval Timer** — reuse `TimerContent`

The bottom sheet should be a scrollable list of tool cards, reusing the existing `ToolCard` pattern from `app/tools/index.tsx`.

#### Rest Timer Configuration (New Section in Toolbox)

```
┌─────────────────────────────────────────┐
│  ⏱️ Rest Timer                          │
│                                         │
│  [30s]  [60s]  [90s]  [120s]  [Custom]  │
│                                         │
│  Custom: [___] seconds                  │
│                                         │
│  [ Start Rest Timer ]                   │
└─────────────────────────────────────────┘
```

- Preset chips: 30s, 60s, 90s, 120s
- Custom input: numeric text field for arbitrary durations
- Start button: begins the rest countdown
- The auto-start behavior (rest timer starts after checking off a set) is preserved — this config is for manual rest timer starts

#### Removing the In-List Rest Banner

The `SessionListHeader` rest banner is **removed** since the rest timer is now in the header. The `nextHint` banner remains.

#### Haptic & Sound Alerts

**No changes needed.** The existing `useRestTimer` hook already provides:
- Triple haptic pattern on completion (Warning → Heavy → Warning)
- `playAudio("complete")` on completion
- `playAudio("tick")` for final 3 seconds
- Animated flash on completion

These continue to work — they're driven by the `rest` state, which is unchanged.

### Technical Approach

#### Files to Modify

1. **`app/session/[id].tsx`** — Update `headerRight` to include toolbox button and rest timer display. Add bottom sheet for toolbox.

2. **`components/session/SessionListHeader.tsx`** — Remove the rest timer banner. Keep only the `nextHint` banner.

3. **`components/session/SessionToolboxSheet.tsx`** (NEW) — Bottom sheet component containing all workout tools + rest timer config.

4. **`components/session/RestTimerConfig.tsx`** (NEW) — Rest timer configuration UI with preset chips and custom input.

5. **`components/session/SessionHeaderRight.tsx`** (NEW) — Extracted header-right component showing elapsed time, rest countdown, and toolbox button.

#### Architecture Decisions

- **Reuse existing hooks**: `useRestTimer` already handles all timer logic, haptics, and audio. No changes needed.
- **Reuse existing tool components**: `PlateCalculatorContent`, `RMCalculatorContent`, `TimerContent` are already extracted as standalone content components — they can be directly embedded in the bottom sheet.
- **Bottom sheet**: Use `@gorhom/bottom-sheet` (already a dependency, already used in `[id].tsx` for exercise picker).
- **No new dependencies**: Everything can be built with existing packages.
- **No database changes**: Rest seconds are already stored per template_exercise. The manual rest timer config uses `startRestWithDuration()` which exists.

#### State Flow

```
User taps wrench icon → SessionToolboxSheet opens
  → User selects rest duration (preset or custom)
  → Calls startRestWithDuration(seconds)
  → rest > 0 → SessionHeaderRight shows countdown
  → rest hits 0 → haptics + audio fire (existing behavior)
  
User completes a set → existing auto-rest behavior unchanged
  → startRest(exerciseId) called
  → rest > 0 → SessionHeaderRight shows countdown
```

#### Header Right Component Design

```typescript
// components/session/SessionHeaderRight.tsx
type Props = {
  elapsed: number;
  rest: number;
  onToolboxOpen: () => void;
  onRestDismiss: () => void;
  colors: ThemeColors;
};
```

The component renders:
- Rest countdown (if rest > 0): bold, primary color, MM:SS format
- Elapsed time: `formatTime(elapsed)`, secondary when rest active, primary when not
- Toolbox button: wrench icon, pressable

### Scope

**In Scope:**
- Move rest timer display from list banner to session header
- Add toolbox trigger button to session header
- Create toolbox bottom sheet with existing tools + rest timer config
- Rest timer configuration with preset durations (30s, 60s, 90s, 120s) and custom input
- Manual rest timer start from the toolbox
- Remove rest banner from `SessionListHeader`

**Out of Scope:**
- Changing the auto-rest behavior after completing a set (this continues to work as-is)
- Changes to the standalone `/tools` screen (it stays for users who want to access tools outside a session)
- Persistent rest timer settings (per-exercise rest is already stored in `template_exercises.rest_seconds`)
- Notification-center style alerts (push notifications when app is backgrounded)
- Rest timer history/analytics

### Acceptance Criteria

- [ ] Given an active workout session, When the user looks at the header, Then they see elapsed time AND a toolbox button (wrench icon)
- [ ] Given an active rest timer, When the user looks at the header, Then they see the rest countdown (MM:SS format) prominently displayed alongside the elapsed time
- [ ] Given an active rest timer, When the countdown reaches 0, Then the device vibrates (triple haptic) and plays a completion sound
- [ ] Given an active rest timer in final 3 seconds, When each second ticks, Then a tick sound plays
- [ ] Given the user taps the toolbox button, When the bottom sheet opens, Then they see Rest Timer Config, Plate Calculator, 1RM Calculator, and Interval Timer
- [ ] Given the toolbox bottom sheet is open, When the user selects a preset duration (30s/60s/90s/120s) and taps Start, Then a rest timer begins and displays in the header
- [ ] Given the toolbox bottom sheet is open, When the user enters a custom duration and taps Start, Then a rest timer begins with that custom duration
- [ ] Given an active rest timer showing in the header, When the user taps the rest display, Then the rest timer is skipped/dismissed
- [ ] Given a set is completed (checked off), When the exercise has a configured rest period, Then the auto-rest timer starts and displays in the header (existing behavior, new display location)
- [ ] Given the rest banner was previously in `SessionListHeader`, When the feature is complete, Then the rest banner is removed from the list and only shows in the header
- [ ] The `nextHint` banner in `SessionListHeader` is preserved and unchanged
- [ ] All existing tests pass with no regressions
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Rest timer active + user scrolls exercise list | Header stays visible (it's in the navigation header, not the list) |
| Rest timer active + user opens toolbox sheet | Sheet opens, rest timer continues counting down in header behind the sheet |
| Two rest timers started in quick succession | Second one replaces the first (existing `startRestWithDuration` behavior — clears previous interval) |
| Custom duration = 0 or negative | Validation: minimum 1 second, don't start if invalid |
| Custom duration > 3600 (1 hour) | Allow it — no artificial cap, but display wraps to HH:MM:SS if needed |
| Custom duration field empty + Start tapped | Don't start — button disabled when no valid duration |
| Session ends while rest timer active | Rest timer cleans up (existing unmount cleanup in `useRestTimer`) |
| Device orientation change | Header should adapt — no fixed pixel widths, use flex layout |
| Long session name + rest timer + elapsed | Text should truncate session name, not overflow. Priority: rest > elapsed > name |
| Accessibility: screen reader | Rest timer in header must have `accessibilityLiveRegion="polite"` and descriptive labels |
| Keyboard open (editing set values) | Toolbox button remains accessible in header |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Header becomes cramped on small screens | Medium | Medium | Use responsive layout; collapse elapsed to MM:SS when rest is active; test on small devices |
| Bottom sheet conflicts with existing exercise picker sheet | Low | Medium | Use separate `BottomSheet` ref; only one sheet open at a time (dismiss toolbox before opening picker) |
| Rest timer in header not visible enough | Low | High | Use bold/primary color for countdown; animate in final seconds; user feedback will confirm |
| Breaking existing rest timer auto-start | Low | High | Don't modify `useRestTimer` hook internals — only change where the `rest` value is displayed |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-19)

Technically sound and low risk. All building blocks exist — `useRestTimer` provides `startRestWithDuration()`, tool components are standalone, `@gorhom/bottom-sheet` is already in use. No new dependencies. Estimated effort: Medium (1-2 days).

**Minor concerns:**
1. `RMCalculatorContent` has `router.push()` on line 168 — must parameterize to callback prop before embedding in bottom sheet
2. Header layout on small/folded screens — suggest hiding session name when rest timer is active
3. Bottom sheet stacking — ensure mutual exclusion (close toolbox before opening exercise picker, etc.)

**Simplification recommendations:**
- Skip `SessionHeaderRight` extraction — inline in `headerRight` is fine
- Combine `SessionToolboxSheet` + `RestTimerConfig` into single file
- Implement in 2 commits: (a) RMCalculator refactor, (b) toolbox sheet + header changes

### CEO Decision
_Pending reviews_
