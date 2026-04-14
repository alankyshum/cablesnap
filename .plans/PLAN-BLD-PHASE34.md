# Feature Plan: Workout Reminders & Push Notifications

**Issue**: BLD-91
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

Users configure a weekly workout schedule (Mon-Sun to template mapping) but receive no prompts on workout days. Without external reminders, adherence drops over time — the schedule becomes aspirational rather than actionable. Push notifications are the #1 feature gap for user retention in fitness apps.

**Data supporting this**: The `weekly_schedule` table and `getWeekAdherence()` function already track which days users scheduled workouts and whether they completed them. The adherence widget on the home screen shows gaps — but users only see gaps *after* missing a workout, not *before*.

## User Stories

- As a user, I want to receive a notification on my scheduled workout days so I remember to exercise
- As a user, I want to customize when reminders fire (morning, afternoon, evening) so they fit my routine
- As a user, I want to disable reminders entirely without losing my schedule
- As a user, I want the reminder to tell me WHICH workout is scheduled (template name)

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
- If multiple templates on same day: show first template name

**Permission Flow:**
- When user enables reminders toggle -> request notification permission
- If permission denied -> show explanation card with "Open Settings" button
- If permission granted -> schedule notifications immediately
- Show snackbar: "Reminders set for [N] days"

**Schedule Sync:**
- When user modifies weekly schedule -> automatically reschedule notifications
- When user changes reminder time -> reschedule all notifications
- When user disables reminders -> cancel all scheduled notifications

### Technical Approach

**New dependency**: `expo-notifications` (already in Expo SDK, no native rebuild needed)

**New file**: `lib/notifications.ts` — pure utility functions:
- `requestPermission(): Promise<boolean>`
- `scheduleReminders(time: {hour: number, minute: number}): Promise<number>`
- `cancelAllReminders(): Promise<void>`
- `getPermissionStatus(): Promise<string>`

**Data model changes**: Add two app settings via existing `app_settings` table:
- `reminders_enabled`: "true" | "false" (default "false")
- `reminder_time`: "HH:MM" format (default "08:00")

No new database tables needed.

**Notification scheduling logic**:
1. Read `weekly_schedule` to find which days have workouts
2. For each scheduled day, create a weekly repeating notification
3. Use `expo-notifications` `scheduleNotificationAsync` with `trigger: { weekday, hour, minute, repeats: true }`
4. Store notification identifiers to allow cancellation

**Integration points**:
- `app/(tabs)/settings.tsx` — add Reminders section with toggle + time picker
- `app/schedule/index.tsx` — after schedule changes, call `scheduleReminders()` if enabled
- `app/_layout.tsx` — register notification handler on app start

### Scope

**In Scope:**
- Local push notifications for scheduled workout days
- Configurable reminder time (hour/minute picker)
- Enable/disable toggle in Settings
- Permission request flow with fallback UI
- Auto-reschedule when schedule or time changes
- Notification content includes template name
- Accessible: all controls labeled, screen reader compatible

**Out of Scope:**
- Remote/server push notifications
- Missed workout notifications (checking retroactively if user didn't work out)
- Rest day suggestions or auto-scheduling
- Notification sounds customization (use system default)
- Notification categories or actions (quick-start workout from notification)
- Badge count on app icon

### Acceptance Criteria

- [ ] Given reminders are disabled When user enables the toggle Then notification permission is requested
- [ ] Given permission is granted When reminders are enabled Then notifications are scheduled for each day with a workout in weekly_schedule
- [ ] Given reminders are enabled When the scheduled time arrives on a workout day Then a notification appears with the template name
- [ ] Given reminders are enabled When user changes the reminder time Then all notifications are rescheduled with the new time
- [ ] Given reminders are enabled When user modifies the weekly schedule Then notifications are automatically rescheduled
- [ ] Given reminders are enabled When user disables the toggle Then all scheduled notifications are cancelled
- [ ] Given notification permission was denied When user enables reminders Then an explanation with "Open Settings" is shown
- [ ] Given no days have scheduled workouts When user enables reminders Then a message says "No workout days scheduled"
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover: permission request, schedule/cancel logic, settings persistence

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No days scheduled | Show "No workout days scheduled — set up your schedule first" with link to schedule screen |
| Permission denied | Show explanation card, disable toggle, offer "Open Settings" |
| All days scheduled | Schedule 7 notifications (one per day) |
| Schedule changes while reminders active | Cancel old, schedule new notifications silently |
| App reinstalled | Reminders default to off (settings reset with fresh DB) |
| Time picker edge (midnight) | Allow any valid time 00:00-23:59 |
| Device in Do Not Disturb | OS handles suppression — no special handling needed |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Permission denied on first ask | Medium | Medium | Show clear explanation before requesting; provide "Open Settings" fallback |
| Notifications don't fire on some Android devices | Low | Medium | Use expo-notifications best practices; document known Android OEM limitations |
| Schedule sync race condition | Low | Low | Cancel-then-schedule in a single async function; debounce schedule changes |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: NEEDS REVISION (minor)

**Architecture Fit**: Excellent — mirrors `lib/audio.ts` pattern (lib utility + settings toggle). `app_settings` is the correct store. No refactoring needed.

**Complexity**: Small-Medium | Risk: Low | Dependency: `expo-notifications` (core Expo package)

**TODO (must fix before approval)**:
1. **Specify time picker component** — React Native Paper has no time picker. Recommend simple TextInput with HH:MM validation or two number inputs. Avoid adding `@react-native-community/datetimepicker` for a single use.
2. **Add `expo-notifications` to `app.config.ts` plugins** — required for Android channels and iOS entitlements.

**Simplifications (strongly recommended)**:
- Use `cancelAllScheduledNotificationsAsync()` + reschedule instead of tracking individual notification IDs
- Remove "multiple templates on same day" edge case — `weekly_schedule` has `UNIQUE(day_of_week)`, this is impossible
- Specify foreground handler: `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }) })`
- Debounce on schedule sync is unnecessary — `setScheduleDay` is user-initiated, not rapid-fire

**No performance concerns.** Scheduling ≤7 local notifications is trivial.

_Reviewed 2026-04-14 by techlead_

### CEO Decision
_Pending reviews_
