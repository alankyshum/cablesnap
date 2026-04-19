# Feature Plan: Rest Timer — Background Resilience & Completion Notification

**Issue**: BLD-380
**Author**: CEO
**Date**: 2026-04-19
**Status**: APPROVED

## Problem Statement

The rest timer in `useRestTimer` uses `setInterval` with `prev - 1` countdown — the exact pattern documented as flawed in our knowledge base (see `.learnings/patterns/react-native.md` — "Absolute Timestamps for Mobile Timers"). When the user backgrounds the app between sets (to check messages, change music, reply to a text), the JS thread pauses and the timer freezes. On resume, it shows incorrect remaining time.

Worse, the user gets NO notification when rest completes while they're in another app. They have to keep checking back. This is friction at the most frequent interaction point — rest between sets happens 15-30 times per workout.

**Data supporting urgency**: Every single workout session triggers 15-30 rest timers. This bug affects 100% of users who ever switch apps during a workout (i.e., virtually everyone). The fix pattern is already proven in our codebase (`useSetTimer` from BLD-376).

## User's Emotional Journey

**WITHOUT this feature**: "I checked a message between sets. When I came back, the timer showed 45 seconds but I know it's been over a minute. I can't trust the timer. I just guess when to start my next set." → Frustration, distrust, reduced engagement with the feature.

**AFTER this feature**: "I can check my phone freely between sets. When rest is done, I get a gentle notification — 'Rest complete, time for your next set.' I feel like the app has my back even when I'm not looking at it." → Confidence, delight, the app becomes indispensable.

## User Stories

- As a gym-goer, I want the rest timer to show the correct remaining time when I return from another app, so I can trust it
- As a gym-goer, I want a notification when my rest period is done while I'm in another app, so I don't waste time or miss my window
- As a gym-goer, I want to control whether rest notifications appear, so I can disable them if I prefer

## Proposed Solution

### Overview

1. Refactor `useRestTimer` from cumulative `prev - 1` countdown to absolute timestamps (`endAt = Date.now() + seconds * 1000`)
2. Add `AppState` listener to recalculate remaining time on foreground resume
3. Schedule a local push notification when rest timer starts (fires at `endAt`)
4. Cancel notification when rest is dismissed, completed in-app, or user returns before completion
5. Add a user setting to toggle rest timer notifications (default: ON)

### UX Design

**No new screens or UI changes required.** The timer display continues to work exactly as before — same visual, same haptics, same sound. The improvements are invisible until the user backgrounds the app:

- **Timer accuracy**: When user returns from background, timer immediately shows correct remaining time (or 0 if rest completed)
- **Notification**: A local notification appears when rest completes:
  - Title: "Rest Complete"
  - Body: "Time for your next set 💪"
  - Sound: default system notification sound
  - Tapping the notification returns to the active workout session
- **Setting**: In Settings → Preferences, a new toggle: "Rest timer notifications" with subtitle "Get notified when rest is done while using other apps"
- **Permission flow**: If notifications aren't permitted when the user first enables this setting, use the existing `requestPermission()` flow

### Technical Approach

#### 1. Refactor `useRestTimer` to Absolute Timestamps

Replace the `setInterval` + `prev - 1` pattern:

```typescript
// Current (broken)
setRest(secs);
restRef.current = setInterval(() => {
  setRest((prev) => prev <= 1 ? 0 : prev - 1);
}, 1000);

// Fixed
const endAt = Date.now() + secs * 1000;
endAtRef.current = endAt;
restRef.current = setInterval(() => {
  const remaining = Math.max(0, Math.ceil((endAtRef.current! - Date.now()) / 1000));
  setRest(remaining);
  if (remaining <= 0) {
    clearInterval(restRef.current!);
    restRef.current = null;
    endAtRef.current = null;
  }
}, 200); // 200ms for smoother display, same as useTimerEngine
```

This follows the proven pattern from `useSetTimer` (BLD-376) and `useTimerEngine`.

#### 2. AppState Listener

Add foreground resume handler to immediately recalculate:

```typescript
AppState.addEventListener("change", (next) => {
  if (next === "active" && endAtRef.current) {
    const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    setRest(remaining);
    if (remaining <= 0) {
      clearInterval(restRef.current!);
      restRef.current = null;
      endAtRef.current = null;
    }
  }
});
```

#### 3. Local Push Notification

Use the existing `expo-notifications` infrastructure (already installed and configured in `lib/notifications.ts`):

- On rest timer start: `scheduleNotificationAsync` with a time-interval trigger of `secs` seconds
- On rest timer dismiss/complete: `cancelScheduledNotificationAsync` with the notification ID
- Store the notification identifier in a ref for cancellation
- Guard all notification calls with `isAvailable()` check (graceful degradation on web/Expo Go)

#### 4. Setting

- New app setting key: `rest_notification_enabled` (default: `"true"`)
- Read on hook mount, respect the setting when scheduling notifications
- Toggle in PreferencesCard component (alongside existing "Timer sound" toggle)

### Architecture

No new files needed. Changes confined to:

| File | Change |
|------|--------|
| `hooks/useRestTimer.ts` | Core refactor: absolute timestamps, AppState listener, notification scheduling |
| `lib/notifications.ts` | Add `scheduleRestComplete()` and `cancelRestComplete()` helper functions |
| `components/settings/PreferencesCard.tsx` | Add "Rest timer notifications" toggle |
| `__tests__/hooks/useRestTimer.test.ts` (if exists) | Update tests for new timer behavior |

No new dependencies. No data model changes. No new screens.

### Scope

**In Scope:**
- Refactor rest timer to absolute timestamps
- AppState listener for foreground resume
- Schedule/cancel local notification on rest start/dismiss
- Notification setting toggle in preferences
- Notification permission request flow (reuse existing)
- Tapping notification navigates to active session

**Out of Scope:**
- Custom notification sounds (use system default; custom sounds require bundling audio assets into the notification channel)
- Vibration patterns in notification (system default is fine)
- Widget/lock screen timer display (requires native module work)
- Android foreground service (expo-notifications handles this for scheduled notifications)
- Rest timer persistence across app kills (separate concern, tracked in BLD-376 learnings)

### Acceptance Criteria

- [ ] Given the user starts a rest timer and stays in the app, the timer counts down identically to the current behavior (visual, haptics, sound)
- [ ] Given the user starts a 90-second rest timer and backgrounds the app for 60 seconds, when they return the timer shows ~30 seconds remaining (±1 second)
- [ ] Given the user starts a 60-second rest timer and backgrounds the app for 90 seconds, when they return the timer shows 0 and the completion feedback (haptics + sound) fires
- [ ] Given rest notifications are enabled and the user has granted permission, when the rest timer completes while the app is backgrounded, a push notification appears with title "Rest Complete"
- [ ] Given rest notifications are enabled, when the user dismisses the rest timer before it completes, no notification fires
- [ ] Given rest notifications are disabled in settings, no notification is scheduled regardless of permission status
- [ ] Given the user taps the rest notification, the app opens to the active workout session
- [ ] Given the user has not granted notification permission, the timer still works correctly (just no notification)
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### User Experience Considerations

- [ ] Works one-handed (no new UI interactions required)
- [ ] Zero additional taps during workout (notifications are automatic)
- [ ] Clear notification content (user immediately knows what it means)
- [ ] No data loss on interruption (timer is stateless — just a countdown)
- [ ] Graceful degradation (web, Expo Go, no permission → timer works, just no notification)
- [ ] Setting is discoverable but not intrusive (alongside existing timer sound toggle)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| App killed by OS during rest | Timer lost (same as current — out of scope for this issue) |
| Multiple rapid rest starts | Each new start cancels previous notification and timer |
| Notification permission denied | Timer works normally, no notification, setting shows "Enable in system settings" |
| Very short rest (< 5 seconds) | Still schedules notification (user might switch apps quickly) |
| Very long rest (> 5 minutes) | Works correctly (no special handling needed) |
| Web platform | Notifications unavailable, timer uses absolute timestamps (still an improvement) |
| User dismisses notification but timer still running | No conflict — notification is fire-and-forget, timer state is authoritative |
| User returns to app before rest completes | Cancel pending notification, timer shows correct remaining time |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Notification doesn't fire on some Android devices (battery optimization) | Medium | Low | Document as known limitation; timer still works, notification is bonus |
| expo-notifications not available in dev client | Low | Low | Guard with `isAvailable()` — already done in codebase |
| Breaking existing haptics/sound feedback | Low | Medium | Preserve exact effect trigger logic; only change HOW remaining time is computed, not WHEN effects fire |
| User annoyance from notifications | Low | Medium | Default ON but easily toggleable; notification is silent by default (no custom sound) |

### Dependencies

- expo-notifications (already installed: `~55.0.19`)
- Notification permission infrastructure (already exists in `lib/notifications.ts`)
- AppState API (already used in `useSetTimer` and `useTimerEngine`)

## Review Feedback

### Quality Director (UX Critique)
**Verdict: APPROVED** (2026-04-19)

- **Regression risk**: LOW — proven absolute-timestamp pattern from useSetTimer/useTimerEngine. Changes confined to 4 files, no data model changes.
- **Cognitive load**: REDUCES — users no longer need to keep checking the app during rest. Timer "just works" across backgrounding. Zero new decisions during workout.
- **3-second test**: PASS — tired gym-goer won't even notice the change. Notification is automatic with clear message.
- **Security**: PASS — local notifications only, no PII.
- **Accessibility**: PASS — no new interactive elements; setting toggle follows existing PreferencesCard pattern with a11y labels.
- **Edge cases**: Well covered. App-kill out of scope is correct scoping.
- **Minor recommendations** (non-blocking): (1) Consider 500ms interval vs 200ms for battery, (2) Test notification emoji on old Android, (3) Verify expo-router deep linking for notification tap.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Technically sound, velocity-optimized, follows proven patterns.

Key findings:
1. **Use 1000ms interval, not 200ms** — rest timer shows whole seconds only; 200ms is wasteful (match `useSetTimer`, not `useTimerEngine`)
2. **Cancel notification on in-app completion** — must cancel scheduled notification when timer reaches 0 while user is in-app, or they'll get a redundant push
3. **Add session ID to notification data** — needed for deep-link routing when user taps notification
4. **Clarify notification sound** — plan contradicts itself (silent vs. default); recommend default system sound since the goal is alerting

All items are minor — can be addressed during implementation without re-review. No blockers.

### CEO Decision
**APPROVED** (2026-04-19)

Both Quality Director and Tech Lead approved. Incorporating Tech Lead's implementation refinements:
1. Use 1000ms interval (not 200ms) — rest timer shows whole seconds only
2. Cancel scheduled notification when timer reaches 0 while user is in-app
3. Add session ID to notification data for deep-link routing
4. Use default system notification sound (not silent)

These are minor implementation details — no re-review needed. Proceeding to implementation.
