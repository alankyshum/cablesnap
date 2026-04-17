# Feature Plan: Enhanced Error Reporting — Expanded Diagnostics

**Issue**: BLD-287
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement

Owner reported (GitHub #149) that the current feedback/error reports include only the last 10 interaction events, which is insufficient for debugging. The request is to expand diagnostic data to cover the last 1 minute of activity and include platform-level logs.

Current report data sources:
- `interaction_log` — limited to 10 entries (hard-coded in INSERT prune + SELECT)
- `console-log-buffer` — 100 entries, 1 min max age (already good)
- `error_log` — last 50 entries (already good)

The console-log-buffer already captures all JS-side console output (log/warn/error), which includes Expo framework warnings and React Native bridge messages. This IS the "expo logs" the owner sees in the terminal — they're just not visible in the report because they're separate from the interaction log.

## User Stories

- As a user filing a bug report, I want my recent navigation and actions from the last minute included so the developer can understand what I did before the bug occurred.
- As a developer reviewing a bug report, I want to see console warnings/errors alongside interactions in chronological order so I can correlate user actions with framework-level issues.

## Proposed Solution

### Overview

Three changes, all low-risk:

1. **Expand interaction log** from 10-entry cap to time-based (1 minute, matching console-log-buffer)
2. **Increase interaction retention** in DB from 10 to 200 entries (high-water mark)
3. **Interleave console logs + interactions** in report for chronological debugging context

### UX Design

No UI changes. The feedback screen already shows diagnostic data. The only visible difference:
- More interaction entries appear in the "Recent Interactions" section
- A new "Combined Timeline" section shows interactions + console logs interleaved chronologically

**Report structure (updated):**
```
## Diagnostic Info
- App Version: x.y.z
- Platform: android
- OS Version: 36

## Combined Timeline (last 1 minute)
1. [timestamp] [NAV] /exercises
2. [timestamp] [LOG] Fetching exercise data...
3. [timestamp] [WARN] Deprecated API usage: ...
4. [timestamp] [NAV] /exercise/mw-bw-039
5. [timestamp] [ERROR] Failed to load image: ...

## Error Log
(unchanged — full error entries with stacks)
```

The separate "Recent Interactions" and "Console Logs" sections are REMOVED in favor of the combined timeline. This is cleaner and more useful for debugging.

### Technical Approach

#### Change 1: Expand interaction_log retention

In `lib/db/settings.ts`:
- Change `insertInteraction` prune from `LIMIT 10` to `LIMIT 200`
- Change `getInteractions` from `LIMIT 10` to time-based: `WHERE timestamp > ? LIMIT 200` (cutoff = now - 60000ms)

#### Change 2: Add combined timeline builder

In `lib/errors.ts`, add a new function:

```typescript
export function buildCombinedTimeline(
  interactions: Interaction[],
  consoleLogs: ConsoleLogEntry[]
): string {
  type TimelineEntry = { timestamp: number; label: string; message: string };

  const entries: TimelineEntry[] = [
    ...interactions.map(i => ({
      timestamp: i.timestamp,
      label: i.action.toUpperCase(),
      message: `${i.screen}${i.detail ? ` — ${i.detail}` : ""}`,
    })),
    ...consoleLogs.map(c => ({
      timestamp: c.timestamp,
      label: c.level.toUpperCase(),
      message: c.message,
    })),
  ];

  entries.sort((a, b) => a.timestamp - b.timestamp);

  if (entries.length === 0) return "No recent activity";

  return entries
    .map((e, i) =>
      `${i + 1}. [${new Date(e.timestamp).toISOString()}] [${e.label}] ${e.message}`
    )
    .join("\n");
}
```

#### Change 3: Update report builders

In `lib/errors.ts`, update `buildReportBody` and `generateShareText`:
- Replace separate "Recent Interactions" and "Console Logs" sections with single "Combined Timeline (last 1 minute)" section
- Update `truncateBody` phases: remove the "remove console logs" phase (since they're now merged with interactions), adjust other phases

#### Change 4: Update feedback screen

In `app/feedback.tsx`:
- No changes needed — it already fetches interactions and consoleLogs and passes them to `buildReportBody`
- The combined timeline is built inside `buildReportBody`

#### Change 5: Update JSON report

In `lib/errors.ts`, update `generateReport`:
- Keep `interactions` and `console_logs` as separate fields (for machine parsing)
- Add a `combined_timeline` field with the interleaved array (for human reading)

### Scope

**In Scope:**
- Expand interaction_log from 10 to 200 entries with 1-minute time filter on retrieval
- Interleave interactions + console logs in report body (combined timeline)
- Update truncation logic to handle the new format
- Update tests

**Out of Scope:**
- Android logcat access (requires native module — not feasible in Expo managed workflow without ejecting. The console-log-buffer already captures JS-side equivalents.)
- Native crash reporting (would need expo-updates/Sentry integration — separate feature)
- Changing the feedback UI layout
- Adding new log sources (network requests, storage operations)

### Acceptance Criteria

- [ ] Given a user navigates through 30+ screens in 1 minute, When they open the feedback screen and submit a bug report, Then the report includes all 30+ interactions (not just 10)
- [ ] Given console.warn fires 5 times during the last minute, When a bug report is generated, Then those warnings appear in the Combined Timeline interleaved with navigation events in chronological order
- [ ] Given the combined timeline has entries older than 1 minute, When the report is built, Then only entries from the last 60 seconds are included
- [ ] Given a very long report exceeds the 8000-char URL limit, When the GitHub URL is generated, Then the truncation logic gracefully shortens the combined timeline
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass with no regressions

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No interactions and no console logs | "No recent activity" shown in Combined Timeline |
| 200+ interactions in 1 minute | Only newest 200 kept (DB prune), all within 1-min window shown |
| Console logs but no interactions | Timeline shows only console entries |
| Interaction timestamps slightly out of sync with console timestamps | Sort by timestamp handles any ordering |
| Report truncation with combined timeline | Truncation removes timeline entries from oldest first |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Larger interaction_log increases DB size | Low | Low | 200 entries is still tiny; prune on insert |
| Combined timeline makes reports longer | Medium | Low | Truncation logic already handles long reports; we update it for new format |
| Breaking existing report format consumers | Low | Medium | JSON report keeps separate fields; combined_timeline is additive |

### Why NOT Android Logcat

The owner asked for "Android app logs (if running on Android as apk)." In Expo managed workflow:
- There is no JS API to read logcat
- `react-native-logcat` requires bare workflow
- Creating a custom Expo module is possible but adds significant complexity for marginal value
- The console-log-buffer ALREADY captures all JS-side log output, which includes React Native bridge warnings, Expo SDK messages, and app-level logging
- The real gap was the 10-interaction limit, not missing native logs

If native logcat access is truly needed in the future, it should be a separate feature with a custom Expo module.

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
