# Feature Plan: Workout Reminders & Push Notifications

**Issue**: BLD-91
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT → Rev 2 (addressing QD + TL feedback)

## Problem Statement

Users configure a weekly workout schedule (Mon-Sun to template mapping) but receive no prompts on workout days. Without external reminders, adherence drops over time — the schedule becomes aspirational rather than actionable. Push notifications are the #1 feature gap for user retention in fitness apps.

**Data supporting this**: The `weekly_schedule` table and `getWeekAdherence()` function already track which days users scheduled workouts and whether they completed them. The adherence widget on the home screen shows gaps — but users only see gaps *after* missing a workout, not *before*.

## User Stories

- As a user, I want to receive a notification on my scheduled workout days so I remember to exercise
- As a user, I want to customize when reminders fire (morning, afternoon, evening) so they fit my routine
- As a user, I want to disable reminders entirely without losing my schedule
- As a user, I want the reminder to tell me WHICH workout is scheduled (template name)
- As a user, I want tapping the notification to open the scheduled workout so I can start immediately

## Proposed Solution

### Overview

Add **local** push notifications using `expo-notifications`. No backend server needed — all scheduling happens on-device using the weekly_schedule data. Users configure a reminder time (e.g., "8:00 AM") and the app schedules recurring notifications for each day that has a workout assigned.

### UX Design

**Settings Integration:**
- Add a "Reminders" section in the Settings screen (between existing sections)
- Toggle: "Workout Reminders" (on/off, default off)
- When enabled: time picker to set reminder time (default: 8:00 AM)
- Preview text: "You'll be reminded at [time] on days with scheduled workouts"

**Notification Content:**
- Title: "Time to train!"
- Body: "[Template Name] is scheduled for today"
- Example: "Push Day is scheduled for today"
- One notification per day (weekly_schedule has UNIQUE(day_of_week) — only one template per day is possible)

**Notification Tap Behavior:**
- Tapping the notification opens the app and navigates to `/workout/new?templateId=<ID>`
- User lands directly on the workout start screen for their scheduled template
- Register `addNotificationResponseReceivedListener` in `app/_layout.tsx`
- Handle cold start: the response listener fires on cold launch — handle navigation after app is ready
- If the template has been deleted since scheduling: navigate to home screen, show snackbar "Scheduled template no longer exists"

**Permission Flow:**
- When user enables reminders toggle → request notification permission
- If permission denied → show explanation card with "Open Settings" button, disable toggle
- If permission granted → schedule notifications immediately
- Show snackbar: "Reminders set for [N] days"

**Permission Re-Check on App Resume:**
- On each app foreground (`AppState` change to "active"), call `getPermissionsAsync()`
- If permission was revoked externally while `reminders_enabled` is "true": auto-update the setting to "false" and show snackbar "Notification permission was revoked. Reminders disabled."
- The Settings toggle must always reflect the actual OS permission state, not just the stored preference

**Time Picker:**
- Use a simple hour/minute text input with HH:MM validation (no new dependency)
- Alternative: two number scroll inputs for hour and minute
- Do NOT add `@react-native-community/datetimepicker` — avoid a new dependency for a single use
- Must validate range 00:00-23:59 and display in 12h/24h per device locale

**Schedule Sync:**
- When user modifies weekly schedule → cancel all + reschedule notifications
- When user changes reminder time → cancel all + reschedule all notifications
- When user disables reminders → cancel all scheduled notifications
- Pattern: always `cancelAllScheduledNotificationsAsync()` then `scheduleNotificationAsync()` for each day — no individual ID tracking needed

**Error Handling:**
- Wrap all scheduling operations in try/catch
- On scheduling failure: show snackbar "Couldn't set reminders. Try again later."
- Never silently fail — always inform the user

### Technical Approach

**New dependency**: `expo-notifications` (core Expo SDK package, no native rebuild in managed workflow)

**Plugin config**: Add `"expo-notifications"` to `app.config.ts` plugins array for Android notification channels and iOS entitlements.

**Install**: `npx expo install expo-notifications` (auto-selects SDK 54-compatible version)

**New file**: `lib/notifications.ts` — pure utility functions:
- `requestPermission(): Promise<boolean>`
- `scheduleReminders(time: {hour: number, minute: number}): Promise<number>` — returns count scheduled
- `cancelAll(): Promise<void>` — calls `cancelAllScheduledNotificationsAsync()`
- `getPermissionStatus(): Promise<string>`
- No individual notification ID tracking — use cancel-all-then-reschedule pattern

**Data model changes**: Add two app settings via existing `app_settings` table:
- `reminders_enabled`: "true" | "false" (default "false")
- `reminder_time`: "HH:MM" format (default "08:00")

No new database tables needed.

**Notification scheduling logic**:
1. Cancel all existing scheduled notifications (`cancelAllScheduledNotificationsAsync()`)
2. Read `weekly_schedule` to find which days have workouts (with template IDs)
3. For each scheduled day, create a weekly repeating notification with `data: { templateId }` payload
4. Use `scheduleNotificationAsync` with `trigger: { weekday, hour, minute, repeats: true }`

**Foreground notification handler** (in `app/_layout.tsx`):
- Call `Notifications.setNotificationHandler()` with `shouldShowAlert: true`, `shouldPlaySound: false`, `shouldSetBadge: false`
- This ensures notifications appear even when the app is in the foreground

**Notification response handler** (in `app/_layout.tsx`):
- Register `addNotificationResponseReceivedListener` to handle notification taps
- Extract `templateId` from `response.notification.request.content.data`
- Verify template still exists, then navigate to `/workout/new?templateId=<ID>`
- If template was deleted, navigate to home screen with explanatory snackbar

**Integration points**:
- `app/(tabs)/settings.tsx` — add Reminders section with toggle + time picker
- `app/schedule/index.tsx` — after schedule changes, call `scheduleReminders()` if enabled
- `app/_layout.tsx` — register notification handler + response listener on app start
- `app.config.ts` — add `expo-notifications` to plugins array

### Scope

**In Scope:**
- Local push notifications for scheduled workout days
- Configurable reminder time (simple hour/minute input, no new dependency)
- Enable/disable toggle in Settings
- Permission request flow with fallback UI
- Permission re-check on app foreground (sync toggle with OS state)
- Auto-reschedule when schedule or time changes (cancel-all-then-reschedule)
- Notification content includes template name
- Notification tap navigates to scheduled workout
- Foreground notification display
- Full accessibility attributes on all new UI elements
- Error handling with user-facing messages on scheduling failures
- `expo-notifications` plugin config in `app.config.ts`

**Out of Scope:**
- Remote/server push notifications
- Missed workout notifications (checking retroactively if user didn't work out) — natural Phase 35 follow-up
- Rest day suggestions or auto-scheduling
- Notification sounds customization (use system default)
- Notification categories or actions (beyond basic tap-to-open)
- Badge count on app icon
- Per-day reminder times (v1 uses single time for all days — future enhancement)

### Accessibility

All new UI elements must have explicit a11y attributes:

| Element | Attributes |
|---------|-----------|
| Reminders toggle | `accessibilityLabel="Workout Reminders"`, `accessibilityRole="switch"`, `accessibilityHint="Enable or disable push notifications for scheduled workout days"` |
| Time picker input | `accessibilityLabel="Reminder time"`, `accessibilityValue` updates with current time |
| Explanation card (permission denied) | Text meets 4.5:1 contrast ratio |
| "Open Settings" button | `accessibilityLabel="Open device notification settings"` |
| Snackbar messages | `accessibilityLiveRegion="polite"` per Review SKILL criteria |
| Preview text | `accessibilityLabel` includes full sentence |

### Acceptance Criteria

- [ ] Given reminders are disabled When user enables the toggle Then notification permission is requested
- [ ] Given permission is granted When reminders are enabled Then notifications are scheduled for each day with a workout in weekly_schedule
- [ ] Given reminders are enabled When the scheduled time arrives on a workout day Then a notification appears with the template name
- [ ] Given reminders are enabled When user changes the reminder time Then all notifications are rescheduled with the new time
- [ ] Given reminders are enabled When user modifies the weekly schedule Then notifications are automatically rescheduled
- [ ] Given reminders are enabled When user disables the toggle Then all scheduled notifications are cancelled
- [ ] Given notification permission was denied When user enables reminders Then an explanation with "Open Settings" is shown
- [ ] Given no days have scheduled workouts When user enables reminders Then a message says "No workout days scheduled"
- [ ] Given the user taps a notification Then the app opens to the scheduled workout template
- [ ] Given the user taps a notification for a deleted template Then the app opens to the home screen with a snackbar
- [ ] Given permission was revoked in device Settings When the user opens the app Then the reminders toggle reflects "off" and a snackbar explains
- [ ] Given scheduling fails (exception thrown) Then a snackbar shows "Couldn't set reminders. Try again later."
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover: permission request, schedule/cancel logic, settings persistence, permission re-check

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No days scheduled | Show "No workout days scheduled — set up your schedule first" with link to schedule screen |
| Permission denied | Show explanation card, disable toggle, offer "Open Settings" |
| All 7 days scheduled | Schedule 7 notifications (one per day) |
| Schedule changes while reminders active | Cancel all, schedule new notifications silently |
| App reinstalled | Reminders default to off (settings reset with fresh DB) |
| Time picker edge (midnight) | Allow any valid time 00:00-23:59 |
| Device in Do Not Disturb | OS handles suppression — no special handling needed |
| Permission revoked externally | Auto-disable reminders on next app foreground, show snackbar |
| Template deleted after notification scheduled | On tap: navigate to home screen, show explanatory snackbar |
| Scheduling API throws exception | Show user-facing error snackbar, don't silently fail |
| Cold start from notification tap | Response listener fires on launch — handle navigation after app is ready |
| App open when notification fires | Foreground handler shows alert (shouldShowAlert: true) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Permission denied on first ask | Medium | Medium | Show clear explanation before requesting; provide "Open Settings" fallback |
| Notifications don't fire on some Android devices | Low | Medium | Use expo-notifications best practices; document known Android OEM limitations |
| Template deleted between schedule and notification | Low | Low | Check template existence on tap; graceful fallback to home screen |
| Scheduling API failure | Very Low | Low | try/catch with user-facing error message |

## Review Feedback

### Quality Director (UX Critique)
**Verdict (Rev 1)**: NEEDS REVISION — 3 Critical (C1: notification tap, C2: permission re-check, C3: a11y), 4 Major (M1-M4)

**Resolution (Rev 2)**:
- C1 FIXED: Added notification tap behavior — deep links to `/workout/new?templateId=X`, handles cold start, handles deleted templates
- C2 FIXED: Added permission re-check on app foreground via AppState listener, auto-disables toggle + shows snackbar
- C3 FIXED: Added full Accessibility section with explicit attrs for every new UI element
- M1 FIXED: Added Error Handling section — try/catch on all scheduling, snackbar on failure
- M2 FIXED: Removed multi-template edge case — UNIQUE(day_of_week) makes it impossible (per TL confirmation)
- M3 FIXED: Specified simple hour/minute input, no new dependency (aligned with TL recommendation)
- M4 FIXED: Removed notification ID tracking — using cancel-all-then-reschedule pattern
- Added 4 new acceptance criteria (tap behavior, deleted template, permission revocation, scheduling failure)

**Rev 2 Verdict: APPROVED** — All 3 Critical + 4 Major issues resolved. No blocking issues remain.
_Reviewed 2026-04-14 by quality-director_

### Tech Lead (Technical Feasibility)
**Verdict (Rev 1)**: NEEDS REVISION — 2 TODOs (time picker component, plugin config)

**Resolution (Rev 2)**:
- TODO 1 FIXED: Specified simple hour/minute text input, no new dependency
- TODO 2 FIXED: Added `expo-notifications` plugin config to `app.config.ts` section
- Adopted all simplification recommendations: cancel-all-then-reschedule, removed false multi-template edge case, specified foreground handler, removed debounce

**Re-Review (Rev 2): APPROVED** — Both TODOs resolved. All simplification recommendations adopted. QD additions (deep-link, permission re-check, a11y, error handling) are technically sound. Ready for implementation.

_Reviewed 2026-04-14 by techlead_

### CEO Decision
_Pending re-reviews from QD and TL_
