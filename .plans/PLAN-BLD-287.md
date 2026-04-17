# Feature Plan: Enhanced Error Logging with Platform Logs

**Issue**: BLD-287
**Author**: CEO
**Date**: 2026-04-17
**Status**: APPROVED

## Problem Statement
Owner reported (GitHub #149) that error reports from the feedback screen are insufficient for debugging. Currently:
- Interaction log: limited to last 10 entries (DB-backed, hard-coded limit)
- Console log buffer: 100 entries, 1 min max age (in-memory) — already included in reports
- Error log: 50 entries (DB-backed) — already included in reports

Owner wants: expo logs, Android logcat logs, and expanded diagnostic window.

## Feasibility Analysis

### What IS Feasible (Expo Managed Workflow)
1. **Expand interaction log** — increase from 10 to 50 entries with time-based pruning (1 min window, matching console-log-buffer)
2. **Include Expo Constants diagnostic info** — device name, installation ID, app ownership, etc. via `expo-constants` and `expo-device`
3. **Console logs are already captured** — 100 entries, 1 min. No changes needed.

### What is NOT Feasible
1. **Android logcat (native logs)** — Expo managed workflow does NOT expose native Android/iOS logs to JavaScript. Would require ejecting to bare workflow or building a custom native module. This is a fundamental platform limitation.
2. **Expo internal logs** — Expo does not provide a JS API to access its own internal logs (Metro bundler logs, OTA update logs, etc.)

### Recommendation
Focus on what's achievable: expand interaction logging, add device diagnostics. Document the native log limitation in a GitHub comment so the owner understands.

## User Stories
- As a user filing a bug report, I want more context in my error report so that the developer can debug issues faster
- As a developer reviewing a bug report, I want to see the last minute of user activity (not just last 10 interactions) so I can understand what led to the bug

## Proposed Solution

### Overview
1. Expand interaction log from 10 → 50 entries with 1-minute time-based pruning
2. Add device/environment diagnostic section to reports (expo-device info)
3. Ensure all three data sources (errors, interactions, console logs) use consistent 1-minute windows
4. Comment on GitHub #149 explaining native log limitations

### Technical Approach

#### Change 1: Expand Interaction Log
**File**: `lib/db/settings.ts`
- Change `LIMIT 10` in `insertInteraction` DELETE query to `LIMIT 50`
- Change `LIMIT 10` in `getInteractions` SELECT query to `LIMIT 50`
- Add time-based pruning: also DELETE entries older than 60 seconds (consistent with console-log-buffer)

#### Change 2: Add Device Diagnostics
**File**: `lib/errors.ts`
- In `generateReport()` and `buildReportBody()`, add a `device` section:
  - `expo-device`: `Device.deviceName`, `Device.modelName`, `Device.totalMemory`
  - `expo-constants`: `Constants.expoConfig?.extra`, `Constants.executionEnvironment`
- Import `expo-device` (already in package.json as a transitive dep of expo — verify, install if needed)

#### Change 3: Report Format Update
**File**: `lib/errors.ts`
- Add "## Device Info" section to `buildReportBody()` output
- Keep truncation logic working (device info is low-priority, truncate after console logs)

### Scope
**In Scope:**
- Expand interaction log limit (10 → 50)
- Add time-based pruning to interaction log (1 min window)
- Add device diagnostics to feedback reports
- Update truncation logic to handle new section
- Comment on GitHub #149 about native log limitation

**Out of Scope:**
- Native logcat access (not feasible in managed workflow)
- Expo internal logs (no API available)
- Changes to the feedback UI screen itself
- Changes to console-log-buffer (already sufficient)

### Acceptance Criteria
- [ ] `getInteractions()` returns up to 50 entries (was 10)
- [ ] Interaction log prunes entries older than 60 seconds
- [ ] Feedback reports include a "Device Info" section with device model, memory, execution environment
- [ ] Truncation logic handles new device section (truncated before interactions)
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] No new dependencies (expo-device should already be available via expo)

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Device info APIs unavailable | Show "unknown" for each field, don't crash |
| Very long interaction log (rapid navigation) | Prune to 50 + 1-min window |
| Report URL exceeds 8000 chars | Truncation logic removes device info first (after console logs) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-device not available | Low | Low | Wrap in try/catch, show "unknown" |
| Larger interaction log increases report size | Medium | Low | Truncation logic already handles oversized reports |
| DB migration needed for larger interaction table | Low | None | No schema change — just changing LIMIT value |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: APPROVED (with minor corrections)
**Reviewed**: 2026-04-17

1. expo-device is NOT installed (plan incorrectly claims it's a transitive dep) — must run `npx expo install expo-device`
2. Truncation order ambiguity — clarify priority: error log → device info → console logs → interactions
3. Both are minor — no plan revision required, address during implementation

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (with minor corrections)
**Reviewed**: 2026-04-17

1. **Time-based pruning may reduce diagnostic value** — interaction log is DB-backed (persistent), so 60s window would erase useful older entries. Recommend keeping count-based limit (50) only, dropping time-based pruning.
2. **Truncation order for device info** — device info should be first to truncate (static metadata, least valuable when space-constrained). Order: device info → console logs → error stacks → errors → interactions → description.
3. **expo-device not installed** — agrees with QD, must be explicitly installed via `npx expo install expo-device`.
4. All three are minor — no plan revision required, address during implementation.

### CEO Decision
**APPROVED** — 2026-04-17. Both QD and TL approved with minor corrections to address during implementation:

1. **Drop time-based pruning** — per TL recommendation, keep count-based 50 only. DB-backed interactions are valuable even if older than 60s.
2. **Truncation order** — device info is first to go: device info → console logs → error stacks → errors → interactions → description.
3. **Install expo-device** — must run `npx expo install expo-device` (not a transitive dep).
