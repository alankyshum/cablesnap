# Feature Plan: Health Connect Integration (Phase 49)

**Issue**: BLD-301
**Author**: CEO
**Date**: 2026-04-17
**Status**: APPROVED

## Problem Statement

CableSnap workout data is siloed on-device. Users with fitness watches (Wear OS, Samsung Galaxy Watch, Fitbit) and health dashboards (Google Fit, Samsung Health) cannot see their strength training data alongside cardio, sleep, and other metrics.

The Wear OS feasibility study (BLD-300) concluded that a native Wear OS companion app is prohibitively expensive (8–15 weeks). However, it explicitly recommended **Health Connect integration** as a lower-cost alternative (1–2 weeks) that delivers broad device support. Since many fitness watches already display Health Connect data, syncing workouts to Health Connect gives users wrist-level visibility without building a dedicated watch app.

This also complements the Strava integration (Phase 48) — Strava captures social/cardio tracking, Health Connect captures the Android health ecosystem.

## User Stories

- As a gym-goer with a Wear OS or Galaxy Watch, I want my CableSnap workouts to appear in my watch's fitness summary so I can see all my activity in one place
- As a user of Google Fit or Samsung Health, I want my strength training sessions to appear alongside cardio and sleep data for a complete health picture
- As a user, I want to enable/disable Health Connect sync from Settings so I control what data is shared

## Proposed Solution

### Overview

Add Android Health Connect write integration to push completed workout sessions as `ExerciseSession` records with `ExerciseSegment` entries per exercise. Follow the same sync pattern established by Strava (Phase 48): sync on session completion, retry queue for failures, platform-gated to Android only.

**Key constraint**: This is **write-only** — CableSnap pushes data TO Health Connect. We do NOT read FROM Health Connect (no step counting, no heart rate import). This keeps scope tight and permissions minimal.

### UX Design

#### Settings Page — Health Connect Toggle (Android Only)

Add a Health Connect row in the existing "Integrations" card (below Strava):

- **Health Connect row** with Material icon `heart-pulse`
  - **Android API level behavior** (addresses QD C3):
    - **Android < 9 (API < 28)**: Health Connect row is HIDDEN (HC not supported)
    - **Android 9–13 (API 28–33)**: Show "Install Health Connect" button with Play Store deep link if HC app not installed; show toggle if installed
    - **Android 14+ (API 34+)**: Show toggle directly (HC is built into the OS)
    - Use `getSdkStatus()` to determine state: `SDK_UNAVAILABLE` → hide row; `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` → show "Update Health Connect" button; `SDK_AVAILABLE` → show toggle
  - Toggle switch (on/off) — unlike Strava (which uses OAuth connect/disconnect), Health Connect uses a simple local toggle since permissions are handled by the OS
  - When toggled ON for the first time: triggers Android's Health Connect permission dialog via `requestPermission()`
  - If user denies permission: toggle reverts to OFF, snackbar "Health Connect permission required", announced via `AccessibilityInfo.announceForAccessibility()`
  - **On Settings mount**: check current permission status via `getGrantedPermissions()`. If permission was revoked externally (in Android Settings), revert toggle to OFF and show snackbar "Health Connect permission was revoked" (addresses QD C1)
  - **When toggled OFF**: any `pending` or `failed` sync log entries are marked `permanently_failed` with reason "User disabled Health Connect" (addresses QD M1)
  - `accessibilityRole="switch"`, `accessibilityLabel="Sync workouts to Health Connect"`
  - Below toggle: helper text "Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps."
  - All touch targets (toggle, Install/Update button) must be **≥48dp** (addresses QD accessibility)
  - Install/Update button: `accessibilityRole="button"`, `accessibilityLabel="Install Health Connect from Play Store"` / `accessibilityLabel="Update Health Connect"`
- **Platform gate**: entire Health Connect UI hidden on iOS and web (`Platform.OS !== 'android'`)
- **Integrations card visibility**: if on iOS and Strava is not connected, the Integrations card still shows "Connect Strava" — card is never empty on any platform (addresses QD M3)
- **Error boundary**: wrap in existing `<ErrorBoundary>` — Health Connect failure must never crash Settings
- **Dynamic import**: Health Connect module must be loaded via `await import()` at all callsites, NOT static import. This prevents crashes on iOS/web where native Health Connect modules don't exist (addresses QD C2, per BLD-298 learning)

#### Workout Completion — Auto-Sync

After user taps "Complete Workout" on the session screen (same hook point as Strava sync in `app/session/[id].tsx`):

1. Dynamically import health-connect module: `const { syncToHealthConnect } = await import("../../lib/health-connect")`
2. Check if Health Connect is enabled (`getAppSetting('health_connect_enabled')`)
3. If enabled, call `syncToHealthConnect(sessionId)` — non-blocking, same pattern as Strava
4. On success: **silent** — no toast (addresses QD C4: HC sync is on-device and near-instant, dual toasts with Strava are noisy)
5. On failure: **silent** — logged to sync table for retry on next app launch. Consistent with success path: HC is a background sync, not user-facing (addresses QD M2: HC is consistently silent for both success and failure, unlike Strava which is network-dependent and shows toasts for both)

#### App Startup — Queue Reconciliation

On app launch (`app/_layout.tsx`), dynamically import and run `reconcileHealthConnectQueue()` alongside the existing `reconcileStravaQueue()`: `const { reconcileHealthConnectQueue } = await import("../lib/health-connect")`. Retries any `pending` or `failed` entries (max 3 retries, same as Strava).

### Technical Approach

#### Dependencies

- `react-native-health-connect` — the core Health Connect SDK wrapper for React Native
- `expo-health-connect` — Expo config plugin that handles AndroidManifest permissions and Health Connect activity declaration
- `expo-build-properties` — Expo config plugin to set `minSdkVersion: 26` (required by Health Connect SDK) (addresses TL Critical 1)

Both Health Connect packages are well-maintained (matinzd/react-native-health-connect, matinzd/expo-health-connect) and compatible with Expo managed workflow via `expo-dev-client`.

#### Expo Config Changes (`app.config.ts`)

Add the `expo-health-connect` plugin and `expo-build-properties` plugin:

```typescript
// Add expo-build-properties for minSdkVersion requirement
[
  "expo-build-properties",
  {
    android: {
      minSdkVersion: 26,
      compileSdkVersion: 34,
      targetSdkVersion: 34,
    },
  },
],

// Add expo-health-connect with write-only permissions
[
  "expo-health-connect",
  {
    permissions: [
      "WRITE_EXERCISE",
    ],
  },
],
```

Only `WRITE_EXERCISE` is needed — we are not reading any health data. Note: `expo-health-connect` expects permission names WITHOUT the `android.permission.health.` prefix (addresses TL Minor 5).

#### New Files

| File | Purpose |
|------|---------|
| `lib/health-connect.ts` | Health Connect API wrapper — permission check, session write, queue reconciliation |
| `lib/db/health-connect.ts` | DB functions for health_connect_sync_log table |

#### Data Model — Health Connect Mapping

CableSnap workout session → Health Connect `ExerciseSession`:

| CableSnap Field | Health Connect Field | Notes |
|----------------|---------------------|-------|
| `session.started_at` | `startTime` | ISO 8601 |
| `session.completed_at` | `endTime` | ISO 8601 |
| `session.name` / template name | `title` | e.g. "Push Day" |
| Exercise groups | `ExerciseSegment[]` | One segment per exercise |
| Exercise name | `segment.exerciseType` | Map to `EXERCISE_TYPE_WEIGHTLIFTING` or more specific types |
| Set data (weight × reps) | `segment.repetitions` | Aggregate completed sets |

Exercise type mapping strategy:
- All CableSnap exercises map to `ExerciseType.WEIGHTLIFTING` as the primary type
- The exercise name is preserved in `title` metadata for display in Health Connect viewers
- This avoids complex mapping logic and is accurate (CableSnap is a strength training app)

#### DB Schema — `health_connect_sync_log`

Mirrors the `strava_sync_log` pattern:

```sql
CREATE TABLE IF NOT EXISTS health_connect_sync_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  health_connect_record_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hc_sync_log_status ON health_connect_sync_log(status);
```

- `health_connect_record_id`: stores the Health Connect record UUID returned after insertion. Mirrors Strava's `strava_activity_id`. Useful for debugging and future delete capability (addresses TL Major 4).
- Status values: `pending` → `synced` | `failed` | `permanently_failed`

#### Settings Storage

Use existing `app_settings` table (key-value):
- Key: `health_connect_enabled`
- Value: `"true"` / `"false"` (default: not set = disabled)

#### Sync Flow (Pseudocode)

```typescript
// lib/health-connect.ts

async function ensureInitialized(): Promise<void> {
  // react-native-health-connect requires initialize() before any API call (addresses TL Critical 2)
  await initialize();
}

export async function syncToHealthConnect(sessionId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const enabled = await getAppSetting('health_connect_enabled');
  if (enabled !== 'true') return false;

  await ensureInitialized();

  const available = await isHealthConnectAvailable();
  if (!available) return false;

  // Create sync log entry BEFORE attempting
  await createHCSyncLogEntry(sessionId);

  try {
    const session = await getSessionById(sessionId);
    const sets = await getSessionSets(sessionId);
    const completedSets = sets.filter(s => s.completed);

    if (completedSets.length === 0) {
      await markHCSyncPermanentlyFailed(sessionId, 'No completed sets');
      return false;
    }

    // Build ExerciseSession record with clientRecordId for deduplication (addresses TL Major 3)
    const record = buildExerciseSessionRecord(session, completedSets);
    record.metadata = {
      clientRecordId: `cablesnap-${sessionId}`,
    };

    const result = await insertRecords([record]);

    // Store the HC record ID for debugging and future delete capability
    const recordId = result?.[0]?.id;
    await markHCSyncSuccess(sessionId, recordId);
    return true;
  } catch (err) {
    await markHCSyncFailed(sessionId, err.message);
    return false;
  }
}
```

#### Permission Handling

```typescript
export async function requestHealthConnectPermission(): Promise<boolean> {
  await ensureInitialized();

  const available = await isHealthConnectAvailable();
  if (!available) return false;

  const granted = await requestPermission([
    { accessType: 'write', recordType: 'ExerciseSession' },
  ]);

  return granted.length > 0;
}

// Called on Settings mount to detect external permission revocation (addresses QD C1)
export async function checkHealthConnectPermissionStatus(): Promise<boolean> {
  await ensureInitialized();

  const available = await isHealthConnectAvailable();
  if (!available) return false;

  const granted = await getGrantedPermissions();
  return granted.some(p => p.recordType === 'ExerciseSession' && p.accessType === 'write');
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

// Returns detailed SDK status for UI branching (addresses QD C3)
export async function getHealthConnectSdkStatus(): Promise<'available' | 'needs_install' | 'needs_update' | 'unavailable'> {
  try {
    await ensureInitialized();
    const status = await getSdkStatus();
    switch (status) {
      case SdkAvailabilityStatus.SDK_AVAILABLE:
        return 'available';
      case SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:
        return 'needs_update';
      case SdkAvailabilityStatus.SDK_UNAVAILABLE:
        return 'unavailable';
      default:
        return 'needs_install';
    }
  } catch {
    return 'unavailable';
  }
}
```

### Existing Code Inventory

Files that will be MODIFIED (not created):

| File | Change |
|------|--------|
| `app.config.ts` | Add `expo-health-connect` plugin AND `expo-build-properties` plugin (minSdkVersion: 26) |
| `app/(tabs)/settings.tsx` | Add Health Connect toggle in Integrations card |
| `app/session/[id].tsx` | Add Health Connect sync call alongside Strava sync |
| `app/_layout.tsx` | Add `reconcileHealthConnectQueue()` on startup |
| `lib/db/helpers.ts` | Add `health_connect_sync_log` table migration |
| `lib/db/index.ts` | Re-export health-connect DB functions |
| `package.json` | Add `react-native-health-connect` + `expo-health-connect` + `expo-build-properties` deps |

### Scope

**In Scope:**
- Write completed workout sessions to Health Connect as ExerciseSession records
- Health Connect enable/disable toggle in Settings (Android only)
- Permission request flow with graceful fallbacks
- Sync log with retry queue (same pattern as Strava)
- "Health Connect not installed" detection with Play Store link
- Platform gating (Android only — hidden on iOS and web)

**Out of Scope:**
- Reading FROM Health Connect (no step import, no heart rate import)
- iOS HealthKit integration (future phase)
- Syncing nutrition/body weight to Health Connect (future enhancement)
- Retroactive sync of past workouts (only new completions)
- Health Connect data deletion when user disconnects
- Custom exercise type mapping beyond WEIGHTLIFTING

### Acceptance Criteria

- [ ] Given a user on Android with Health Connect enabled, When they complete a workout, Then the session appears in Health Connect as an ExerciseSession within 5 seconds
- [ ] Given a user on Android, When they toggle Health Connect ON for the first time, Then the Android permission dialog appears requesting WRITE_EXERCISE permission
- [ ] Given a user on Android who denies the permission, When the toggle callback resolves, Then the toggle reverts to OFF, a snackbar shows "Health Connect permission required", and the result is announced via AccessibilityInfo
- [ ] Given a user on Android without Health Connect installed (Android 9–13), When they view the Integrations section, Then they see an "Install Health Connect" button (≥48dp touch target) linking to the Play Store
- [ ] Given a user on Android < 9, When they view Settings, Then no Health Connect UI is visible
- [ ] Given a user on iOS or web, When they view Settings, Then no Health Connect UI is visible
- [ ] Given a sync failure (e.g. Health Connect unavailable at completion time), When the user next opens the app, Then the failed sync is retried automatically (up to 3 times)
- [ ] Given a user with Health Connect enabled, When they view a workout in Google Fit or Samsung Health, Then the workout title, duration, and exercise type are displayed correctly
- [ ] Given a user who revokes Health Connect permission in Android Settings, When they open CableSnap Settings, Then the toggle is reverted to OFF and a snackbar shows "Health Connect permission was revoked"
- [ ] Given a user who toggles Health Connect OFF while pending syncs exist, When the toggle turns off, Then pending/failed entries are marked permanently_failed
- [ ] Given a retry of a previously synced session, When the record is re-inserted, Then no duplicate is created (clientRecordId deduplication)
- [ ] Given a user on Android completes a workout with both Strava and HC enabled, When sync completes, Then only Strava shows a toast — HC syncs silently
- [ ] All Health Connect module imports use dynamic `await import()` — no static imports of native-only modules
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] No new TypeScript errors (`npx tsc --noEmit` clean)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Health Connect not installed (Android 9–13) | Show "Install Health Connect" button with Play Store deep link (`accessibilityRole="button"`, `accessibilityLabel="Install Health Connect from Play Store"`) |
| Health Connect needs update | Show "Update Health Connect" button (SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) |
| Android < 9 (API < 28) | Health Connect row is completely hidden |
| Android 14+ (HC built-in) | Show toggle directly, no install button needed |
| Permission denied by user | Toggle reverts to OFF, snackbar "Health Connect permission required", announced via `AccessibilityInfo.announceForAccessibility()` |
| Permission previously granted then revoked in system settings | On Settings mount, `checkHealthConnectPermissionStatus()` detects revocation → toggle reverts to OFF, snackbar "Health Connect permission was revoked" |
| Workout with 0 completed sets | Skip sync, mark permanently_failed with reason "No completed sets" |
| Very long workout (3+ hours) | Syncs normally — Health Connect accepts any valid time range |
| Network offline (Health Connect is local API) | Should work — Health Connect is on-device, no network needed |
| Health Connect data cleared by user | CableSnap sync log shows "synced" but data gone from HC — no action needed (user's choice) |
| Strava AND Health Connect both enabled | Both sync independently, neither blocks the other |
| App killed during sync | Sync log entry stays "pending", retried on next launch |
| Multiple rapid workout completions | Each gets its own sync log entry, processed sequentially |
| User toggles HC OFF with pending syncs | Pending/failed entries marked `permanently_failed` with reason "User disabled Health Connect" |
| Retry creates duplicate record | Prevented by `clientRecordId: "cablesnap-{sessionId}"` — Health Connect deduplicates by client record ID |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `react-native-health-connect` breaks with Expo SDK update | Low | Medium | Pin version, test on upgrade |
| Health Connect API changes | Low | Low | Google provides stable API versioning |
| Permission model changes in future Android | Low | Low | Expo config plugin handles manifest changes |
| User confusion between Strava and Health Connect sync | Medium | Low | Clear descriptions under each toggle |
| `expo-health-connect` plugin requires prebuild | Low | Medium | CableSnap already uses `expo-dev-client` (prebuild workflow) |
| Google Play Health Connect declaration form delays release | Medium | Medium | Submit form early — 5–7 day approval + 5–7 day whitelist propagation. Can release without HC; add HC in follow-up release after approval (addresses TL Minor 6) |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)

**R1 Verdict: NEEDS REVISION** (2026-04-17) — 4 Critical, 4 Major issues raised.

**R2 Verdict: APPROVED** (2026-04-17) — All 8 issues resolved. Plan meets CableSnap quality standards. Permission revocation detection, dynamic imports, API level branching, silent sync, a11y, and toggle-off cleanup all addressed.

### Tech Lead (Technical Feasibility)
**R1 Verdict**: NEEDS REVISION — 2 Critical, 2 Major, 2 Minor issues
**R2 Verdict**: APPROVED — All issues resolved

**Architecture Fit**: Fully compatible. Strava pattern provides exact template. No refactoring needed.
**Effort**: Small-Medium (1–2 weeks). **Risk**: Low.

**R1 Issues (all resolved in R2)**:
1. ~~Missing `expo-build-properties`~~ → Added with minSdkVersion:26, compileSdkVersion:34, targetSdkVersion:34 ✅
2. ~~Missing `initialize()` call~~ → `ensureInitialized()` guard added before all API calls ✅
3. ~~Missing `clientRecordId` dedup~~ → `clientRecordId: "cablesnap-{sessionId}"` in record metadata ✅
4. ~~Missing `health_connect_record_id` in schema~~ → Column added to sync log ✅
5. ~~Permission string format~~ → Changed to `WRITE_EXERCISE` (no prefix) ✅
6. ~~Google Play declaration form~~ → Added to Risk Assessment ✅

**Positive**: Write-only constraint, single WEIGHTLIFTING mapping, and pattern reuse are all well-scoped decisions.

### CEO Decision (R2)

**All QD and TL feedback addressed in R2 revision:**

| Reviewer | Issue | Resolution |
|----------|-------|------------|
| QD C1 | Permission revocation lying UI | Added `checkHealthConnectPermissionStatus()` on Settings mount — reverts toggle + shows snackbar |
| QD C2 | Dynamic import() not specified | Explicitly specified `await import()` at all callsites (session/[id].tsx, _layout.tsx, settings.tsx) |
| QD C3 | Android API level UX missing | Added full API-level branching: <9 hidden, 9–13 install button, 14+ toggle; SDK status enum handling |
| QD C4 | Dual success toasts | HC sync is silent on success — no toast (on-device = instant, expected path) |
| QD M1 | Toggle OFF pending entries | Mark `permanently_failed` with reason "User disabled Health Connect" |
| QD M2 | Error toast inconsistency | HC is consistently silent for both success and failure (different from Strava by design — HC is local, Strava is network) |
| QD M3 | Integrations card empty on iOS | Clarified: card always shows "Connect Strava" on iOS, never empty |
| QD M4 | No sync history UI | Acknowledged as future enhancement, out of scope |
| QD a11y | Touch targets, roles, announcements | Added ≥48dp, accessibilityRole/Label, AccessibilityInfo.announceForAccessibility() |
| TL C1 | Missing expo-build-properties | Added with minSdkVersion:26, compileSdkVersion:34, targetSdkVersion:34 |
| TL C2 | Missing initialize() call | Added `ensureInitialized()` guard before all API calls |
| TL M3 | Missing clientRecordId | Added `clientRecordId: "cablesnap-{sessionId}"` in record metadata |
| TL M4 | Missing health_connect_record_id | Added column to sync log schema |
| TL m5 | Permission string format | Changed to `WRITE_EXERCISE` (no Android namespace prefix) |
| TL m6 | Google Play declaration form | Added to Risk Assessment with mitigation strategy |

**APPROVED** — Both reviewers approved R2.
- Quality Director: APPROVED (2026-04-17) — All Critical/Major UX issues resolved
- Tech Lead: APPROVED (2026-04-17) — All Critical/Major technical issues resolved

Plan ready for implementation.
