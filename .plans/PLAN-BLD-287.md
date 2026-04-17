# Feature Plan: Enhanced Error Logging with Platform Logs

**Issue**: BLD-287
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT
**GitHub Reference**: https://github.com/alankyshum/fitforge/issues/149

## Problem Statement

Owner reported that current error reports (via the feedback screen) only include the last 10 navigation interactions, which is insufficient for debugging. The owner wants:
1. Include native platform logs (Expo/React Native framework output visible in logcat)
2. Include Android-level app logs when running as a production APK
3. Expand the diagnostic data window to capture the last ~1 minute of activity, not just the last 10 navigation events

Currently the feedback report includes:
- **Console logs**: JS-level `console.log/warn/error` — already captured via `lib/console-log-buffer.ts` (100 entries, 1 min max age) ✅
- **Interactions**: Navigation events — hard-limited to 10 entries in the DB (`lib/db/settings.ts:127`) ❌
- **Error log**: Caught errors with stacks — up to 50 entries ✅

The main gap is:
1. Interaction log is too small (10 entries, trimmed on insert)
2. No native/platform-level logs are captured (React Native bridge messages, native framework warnings, crash signals, OOM kills, etc.)

## User Stories

- As a developer debugging a user-reported bug, I want to see the last 1 minute of interaction history (not just 10 events) so I can trace the user's path to the bug
- As a developer debugging a production APK crash, I want to see the app's native logcat output so I can identify native-level issues (OOM, ANR, native crashes) that don't appear in JS console logs
- As a user filing a bug report, I want the diagnostic data to automatically include enough context for the developer to reproduce my issue

## Proposed Solution

### Overview

Two changes:
1. **Expand interaction log retention** from 10 → 100 entries with 1-minute time-based filtering (matches console-log-buffer behavior)
2. **Create a lightweight native module** (`logcat-reader`) using `expo-modules-core` to capture the app's own process logcat on Android

### Change 1: Expand Interaction Log

**Current state**: `lib/db/settings.ts` trims the `interaction_log` table to 10 rows on every insert, and `getInteractions()` queries `LIMIT 10`.

**Proposed change**:
- Increase trim limit from 10 → 100 in `insertInteraction()`
- Change `getInteractions()` to accept an optional `limit` parameter (default 100)
- Add time-based filtering: `WHERE timestamp > ?` with cutoff = `Date.now() - 60_000` (1 minute)
- Update `lib/interactions.ts` `recent()` to use the new time-based query
- Update `app/feedback.tsx` to display the expanded interaction list (already handles variable-length arrays)

**Files changed**:
- `lib/db/settings.ts` — expand trim limit, add time-based query
- `lib/interactions.ts` — update `recent()` to use time-based filtering

### Change 2: Native Logcat Reader Module (Android-only)

FitForge already has `expo-modules-core` (~55.0.22) and uses EAS Build for APKs. No ejection needed — we create a local Expo module.

**Architecture**:
```
modules/logcat-reader/
├── android/
│   └── src/main/java/expo/modules/logcatreader/
│       └── LogcatReaderModule.kt          # Kotlin module definition
├── src/
│   └── index.ts                           # JS/TS API
├── expo-module.config.json                # Module registration
└── package.json                           # Module metadata (private, not published)
```

**Android implementation** (`LogcatReaderModule.kt`):
- Uses `Runtime.getRuntime().exec("logcat -d -t 60 --pid=${android.os.Process.myPid()}")` to read the last 60 seconds of the app's own process logcat
- Returns the output as a string
- No special permissions needed — Android allows apps to read their OWN process logcat since Android 4.1 (API 16)
- Runs synchronously on a background thread (logcat -d dumps and exits, typically <100ms)
- Catches and swallows all exceptions (never crash the diagnostic system)
- Returns empty string on failure

**iOS / Web**: No-op — returns empty string. iOS does not expose `os_log` to apps, and web has no native log concept.

**JS API** (`src/index.ts`):
```typescript
import { Platform } from 'react-native';

// Conditionally import native module only on Android
export async function getLogcatLogs(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  try {
    const LogcatReaderModule = require('./LogcatReaderModule');
    return LogcatReaderModule.readLogcat() ?? '';
  } catch {
    return '';
  }
}
```

**Integration with feedback report**:
- `lib/errors.ts` `generateReport()` and `buildReportBody()` — add a new "Platform Logs" section
- `app/feedback.tsx` — fetch logcat on mount, display in diagnostic preview, include in reports
- `lib/types.ts` — no new types needed (logcat is a plain string)

**Truncation**: Logcat output can be large. Limit to last 60 seconds of the app's own PID (typically 50-200 lines). If the feedback report exceeds the GitHub URL length limit, the existing `truncateBody()` function will strip platform logs first (they're supplementary, like console logs).

### UX Design

No new screens or navigation. Changes are to the existing feedback screen:

1. **Diagnostic preview** (`app/feedback.tsx`): Add a new "Platform Logs" section below "Console Logs" showing the logcat output (monospace, scrollable). Only shown on Android.
2. **Report output**: Both GitHub issue body and shared text/JSON include the new "Platform Logs" section.
3. **Interaction list**: Shows more entries (up to 100, last 1 minute) in the existing format.

### Scope

**In Scope:**
- Expand interaction log from 10 → 100 entries with 1-minute time window
- Create `logcat-reader` native module for Android
- Integrate logcat output into feedback reports (GitHub URL, share text, JSON)
- Update diagnostic preview to show platform logs
- Update `truncateBody()` to handle the new section gracefully
- Tests for expanded interaction queries and report generation

**Out of Scope:**
- iOS native logs (Apple does not allow apps to read os_log)
- Web platform logs
- Real-time log streaming / log viewer screen
- Crash reporting integration (Sentry, Bugsnag, etc.)
- Logcat filtering by tag/severity (keep it simple — dump everything from our PID)
- Publishing the native module as a standalone package

### Dependencies
- `expo-modules-core` ~55.0.22 (already installed)
- EAS Build (already configured in `eas.json`)
- No new npm dependencies

### Acceptance Criteria

- [ ] Given a user navigates through 15 screens in 45 seconds, When they open the feedback screen, Then the diagnostic preview shows all 15 interactions (not just the last 10)
- [ ] Given a user has been using the app for 3 minutes, When they open the feedback screen, Then only interactions from the last 1 minute are shown (matching console-log-buffer behavior)
- [ ] Given the app is running on Android as a production APK, When the user opens the feedback screen, Then the diagnostic preview includes a "Platform Logs" section with the app's native logcat output from the last 60 seconds
- [ ] Given the app is running on iOS or web, When the user opens the feedback screen, Then no "Platform Logs" section is shown (graceful no-op)
- [ ] Given the user generates a GitHub issue report with platform logs, When the URL exceeds 8000 chars, Then `truncateBody()` strips platform logs before stripping console logs
- [ ] Given the logcat reader fails (any exception), When the feedback screen loads, Then it gracefully shows "No platform logs available" without crashing
- [ ] Given the user shares a report via the Share button, When the report is generated, Then the shared text and JSON both include platform logs (if available)
- [ ] PR passes all existing tests with no regressions
- [ ] TypeScript strict mode passes with zero errors
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No interactions in last 1 minute | Show "No recent interactions" (same as current) |
| 100+ interactions in 1 minute | Show most recent 100 entries (cap prevents memory bloat) |
| Logcat reader throws exception | Return empty string, show "No platform logs available" |
| Logcat output > 50KB | Truncate to last 200 lines before including in report |
| App running in Expo Go (dev) | Logcat reader still works — reads own process logs |
| App running on iOS | `getLogcatLogs()` returns '', no "Platform Logs" section shown |
| App running on web | `getLogcatLogs()` returns '', no "Platform Logs" section shown |
| GitHub URL exceeds 8000 chars | `truncateBody()` strips platform logs first, then console logs |
| Old DB schema (upgrade scenario) | No schema changes needed — interaction_log table unchanged |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Logcat permission denied on some Android versions | Low | Low | Catch exception, return empty string. Apps can read own PID since API 16. |
| Logcat output too large, slows feedback screen | Medium | Low | Limit to 60 seconds + max 200 lines. Run on background thread. |
| Native module breaks Expo Go compatibility | Low | Medium | The module is Android-only with graceful no-op fallback. Test in Expo Go. |
| EAS Build breaks with new module | Low | High | Follow expo-modules-core conventions exactly. Test with `eas build --profile preview`. |
| Increased report size breaks GitHub URL | Medium | Low | Existing `truncateBody()` already handles this — add platform logs as lowest-priority section. |

## Implementation Notes

### File-by-file changes

1. **`modules/logcat-reader/`** — New directory (4-5 files)
2. **`lib/db/settings.ts`** — Increase interaction trim from 10→100, add time-based query
3. **`lib/interactions.ts`** — Update `recent()` to use time-based filtering
4. **`lib/errors.ts`** — Add platform logs to `buildReportBody()`, `generateReport()`, `generateShareText()`, update `truncateBody()` to strip platform logs first
5. **`app/feedback.tsx`** — Fetch logcat on mount, display in preview, pass to report generators
6. **`app.config.ts`** — Register the logcat-reader plugin (if needed, depends on expo-modules autolinking)

### Estimated complexity
- Interaction log expansion: ~30 min (simple SQL changes + test updates)
- Native module creation: ~2 hours (Kotlin module, JS wrapper, module config)
- Report integration: ~1 hour (update report builders, truncation logic, feedback screen)
- Testing: ~1 hour (unit tests for queries, report generation, mocked native module)
- **Total: ~4.5 hours**

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
