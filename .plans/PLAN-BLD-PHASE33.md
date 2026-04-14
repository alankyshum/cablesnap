# Feature Plan: Audio Cues for Timers (Phase 33)

**Issue**: BLD-89
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

Both interval timers (Tabata/EMOM/AMRAP, shipped in Phase 32) and session rest timers provide only visual + haptic feedback. During workouts, users have phones in pockets, face-down on benches, or across the room. Without audio cues, they miss timer completions and phase transitions, disrupting workout rhythm and causing missed rest periods or late set starts.

This was explicitly planned as a "fast-follow" in Phase 32's out-of-scope section. Audio cues are a standard expectation in any timer-based fitness feature.

## User Stories

- As a gym-goer, I want to hear a beep when my rest timer finishes so I know to start my next set without staring at my phone
- As a Tabata user, I want distinct audio cues for work and rest phases so I can follow the protocol hands-free
- As an AMRAP user, I want countdown warnings at 30s and 10s so I can pace my final reps
- As a user who trains in quiet environments, I want to disable timer sounds so I don't disturb others

## Proposed Solution

### Overview

Add a lightweight audio module (`lib/audio.ts`) that preloads and plays short sound effects. Wire audio cues into the existing interval timer and session rest timer. Provide a user-facing toggle in Settings.

### UX Design

**Audio Events:**

| Context | Event | Sound | Duration |
|---------|-------|-------|----------|
| Interval Timer | Work phase starts | Ascending double beep | ~300ms |
| Interval Timer | Rest phase starts | Single low tone | ~200ms |
| Interval Timer | EMOM minute boundary | Single beep | ~200ms |
| Interval Timer | AMRAP 30s warning | Two rapid beeps | ~400ms |
| Interval Timer | AMRAP 10s warning | Three rapid beeps | ~500ms |
| Interval Timer | Timer complete | Triple ascending beep | ~600ms |
| Rest Timer | 3s countdown | Tick (×3, one per second) | ~100ms each |
| Rest Timer | Complete | Double beep | ~300ms |

**Settings UI:**
- New "Timer Sound" switch in Settings tab, grouped under a "Timer" section
- Default: ON
- Persisted via `setAppSetting('timer_sound_enabled', 'true'|'false')`
- When OFF, no audio plays; haptics continue unchanged

**No audio plays when:**
- Setting is OFF
- App is backgrounded (timer is already paused)
- Device is on silent/vibrate mode on iOS (respect system ringer switch)

### Technical Approach

#### Library Choice

Use `expo-av` Audio API. It is the mature Expo audio solution for SDK 54, supports:
- Preloading audio files from bundled assets
- Low-latency playback for short sound effects
- `playsInSilentModeIOS: false` to respect the iOS ringer switch
- Multiple simultaneous sounds (for rapid countdown beeps)

**Alternative considered:** `expo-audio` (newer, lighter). However, `expo-av` has broader documentation and known stability for this use case. Tech Lead should evaluate and recommend.

**Install:** `npx expo install expo-av`

#### New File: `lib/audio.ts` (~60-80 lines)

Pure audio utility module:

```typescript
// Preload all timer sounds at module level (lazy singleton)
// play(cue: TimerCue): Promise<void> — plays the specified sound
// unload(): Promise<void> — releases all audio resources
// setEnabled(enabled: boolean): void — runtime enable/disable
// isEnabled(): boolean — check current state

type TimerCue = 
  | 'work_start'
  | 'rest_start' 
  | 'tick'
  | 'minute'
  | 'warning'
  | 'complete'
```

Design principles:
- Lazy initialization — sounds loaded on first `play()` call, not at import
- Singleton pattern — one set of loaded sounds shared across screens
- Fire-and-forget — `play()` returns void, errors swallowed (audio is non-critical)
- No state management — just a stateless utility with an enable flag
- Cleanup via `unload()` called in app unmount (AppState listener)

#### Sound Assets: `assets/sounds/`

Bundle 4-5 small WAV/MP3 files (< 10KB each, < 50KB total):
- `beep_high.mp3` — ascending beep for work/start cues
- `beep_low.mp3` — low tone for rest cues  
- `tick.mp3` — short tick for countdown
- `complete.mp3` — triple ascending for completion

Compound cues (double beep, triple beep) composed by playing the base sound multiple times with small delays (~150ms).

#### Modified Files

1. **`app/tools/timer.tsx`** — Import `play` from `lib/audio`, call at phase transitions:
   - In tick handler, when `state.phase` changes: play appropriate cue
   - On completion: play `complete`
   - On AMRAP warning thresholds: play `warning`

2. **`app/session/[id].tsx`** — Wire audio to rest timer:
   - In rest countdown interval, when `rest === 3, 2, 1`: play `tick`
   - When rest reaches 0: play `complete`

3. **`app/(tabs)/settings.tsx`** — Add "Timer Sound" toggle:
   - New section "Timer" with a Switch component
   - Read/write via `getAppSetting('timer_sound_enabled')` / `setAppSetting(...)`
   - Call `audio.setEnabled(value)` on toggle

4. **`package.json`** — Add `expo-av` dependency

#### No Database Changes

Timer sound preference stored via existing `getAppSetting`/`setAppSetting` (app_settings table, key-value). No schema migration needed.

### Scope

**In Scope:**
- Audio cues for interval timer phase transitions (work, rest, minute, warning, complete)
- Audio cues for session rest timer (3-2-1 countdown tick + completion beep)
- Settings toggle to enable/disable timer sounds
- Respect iOS silent mode (no override)
- Preload/unload lifecycle management
- Unit tests for audio module (mocked expo-av)

**Out of Scope:**
- Custom sound selection (pick different beep sounds)
- Per-cue volume control (uses system volume)
- Text-to-speech announcements ("3 rounds remaining")
- Background audio (playing sounds when app is backgrounded)
- Audio for PR celebrations or other non-timer events
- Android notification sounds / channels
- Music playback integration (duck music volume during cues)

### Acceptance Criteria

- [ ] Given timer sound is ON and Tabata work phase starts, When phase transition fires, Then ascending double beep plays
- [ ] Given timer sound is ON and Tabata rest phase starts, When phase transition fires, Then single low tone plays
- [ ] Given timer sound is ON and interval timer completes, When completion fires, Then triple beep plays
- [ ] Given timer sound is ON and EMOM minute boundary reached, When minute flips, Then single beep plays
- [ ] Given timer sound is ON and AMRAP has 30s remaining, When countdown reaches 30, Then warning beeps play
- [ ] Given timer sound is ON and AMRAP has 10s remaining, When countdown reaches 10, Then warning beeps play
- [ ] Given timer sound is ON and rest timer has 3s left, When countdown reaches 3, 2, 1, Then tick plays each second
- [ ] Given timer sound is ON and rest timer completes, When rest reaches 0, Then double beep plays
- [ ] Given timer sound is OFF, When any timer event fires, Then no audio plays (haptics still fire)
- [ ] Given iOS device is on silent mode, When timer event fires, Then no audio plays
- [ ] Given Settings screen, When user toggles "Timer Sound", Then preference persists across app restarts
- [ ] Timer Sound defaults to ON on first use
- [ ] Audio resources are preloaded on first play, not at app startup
- [ ] Audio resources are unloaded when no longer needed (screen unmount or app termination)
- [ ] Rapid timer events (1-second intervals) don't cause audio overlap or crashes
- [ ] All existing 397+ tests pass with no regressions
- [ ] New unit tests for lib/audio.ts (mocked expo-av): play, enable/disable, error handling
- [ ] No new lint warnings
- [ ] `bun typecheck` passes

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Device on silent mode (iOS) | No audio plays — `playsInSilentModeIOS: false` |
| Device on vibrate (Android) | Audio still plays (Android vibrate ≠ mute) — acceptable |
| Very short timer interval (1s) | Tick sound completes before next tick fires (sounds are <200ms) |
| Audio file fails to load | Swallow error, log warning, continue with haptics only |
| Multiple rapid phase transitions | Each play call resets sound position, no stacking |
| Screen unmount during playback | Unload called in cleanup, playback stops gracefully |
| App backgrounded | Timer already paused, no audio events fire |
| Timer Sound toggled mid-timer | Takes effect immediately on next event |
| First app launch (no setting saved) | Default to enabled (true) |
| Low storage device | Audio files are <50KB total, negligible impact |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-av adds significant bundle size | Low | Low | expo-av is ~200KB, acceptable for the functionality gained |
| Audio latency on older devices | Medium | Low | Sounds are <300ms, slight delay is acceptable for timer cues |
| Sound overlap on rapid transitions | Low | Low | Reset sound position before each play, sounds are short |
| iOS silent mode not respected | Low | High | Use `playsInSilentModeIOS: false` (documented API) |
| expo-av incompatible with SDK 54 | Very Low | High | expo-av is actively maintained and compatible with SDK 54. Fallback: expo-audio |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
