# Feature Plan: Health Connect Integration (Phase 49)

**Issue**: BLD-301
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement

FitForge workout data is siloed on-device. Users with fitness watches (Wear OS, Samsung Galaxy Watch, Fitbit) and health dashboards (Google Fit, Samsung Health) cannot see their strength training data alongside cardio, sleep, and other metrics.

The Wear OS feasibility study (BLD-300) concluded that a native Wear OS companion app is prohibitively expensive (8–15 weeks). However, it explicitly recommended **Health Connect integration** as a lower-cost alternative (1–2 weeks) that delivers broad device support. Since many fitness watches already display Health Connect data, syncing workouts to Health Connect gives users wrist-level visibility without building a dedicated watch app.

This also complements the Strava integration (Phase 48) — Strava captures social/cardio tracking, Health Connect captures the Android health ecosystem.

## User Stories

- As a gym-goer with a Wear OS or Galaxy Watch, I want my FitForge workouts to appear in my watch's fitness summary so I can see all my activity in one place
- As a user of Google Fit or Samsung Health, I want my strength training sessions to appear alongside cardio and sleep data for a complete health picture
- As a user, I want to enable/disable Health Connect sync from Settings so I control what data is shared

## Proposed Solution

### Overview

Add Android Health Connect write integration to push completed workout sessions as `ExerciseSession` records with `ExerciseSegment` entries per exercise. Follow the same sync pattern established by Strava (Phase 48): sync on session completion, retry queue for failures, platform-gated to Android only.

**Key constraint**: This is **write-only** — FitForge pushes data TO Health Connect. We do NOT read FROM Health Connect (no step counting, no heart rate import). This keeps scope tight and permissions minimal.

### UX Design

#### Settings Page — Health Connect Toggle (Android Only)

Add a Health Connect row in the existing "Integrations" card (below Strava):

- **Health Connect row** with Material icon `heart-pulse`
  - Toggle switch (on/off) — unlike Strava (which uses OAuth connect/disconnect), Health Connect uses a simple local toggle since permissions are handled by the OS
  - When toggled ON for the first time: triggers Android's Health Connect permission dialog via `requestPermission()`
  - If user denies permission: toggle reverts to OFF, snackbar "Health Connect permission required"
  - If Health Connect app not installed: show "Install Health Connect" button linking to Play Store
  - `accessibilityRole="switch"`, `accessibilityLabel="Sync workouts to Health Connect"`
  - Below toggle: helper text "Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps."
- **Platform gate**: entire Health Connect UI hidden on iOS and web (`Platform.OS !== 'android'`)
- **Error boundary**: wrap in existing `<ErrorBoundary>` — Health Connect failure must never crash Settings

#### Workout Completion — Auto-Sync

After user taps "Complete Workout" on the session screen (same hook point as Strava sync in `app/session/[id].tsx`):

1. Check if Health Connect is enabled (`getAppSetting('health_connect_enabled')`)
2. If enabled, call `syncToHealthConnect(sessionId)` — non-blocking, same pattern as Strava
3. On success: toast "Synced to Health Connect ✓"
4. On failure: silent fail (logged to sync table for retry on next app launch)

#### App Startup — Queue Reconciliation

On app launch (`app/_layout.tsx`), run `reconcileHealthConnectQueue()` alongside the existing `reconcileStravaQueue()`. Retries any `pending` or `failed` entries (max 3 retries, same as Strava).

### Technical Approach

#### Dependencies

- `react-native-health-connect` — the core Health Connect SDK wrapper for React Native
- `expo-health-connect` — Expo config plugin that handles AndroidManifest permissions and Health Connect activity declaration

Both are well-maintained (matinzd/react-native-health-connect, matinzd/expo-health-connect) and compatible with Expo managed workflow via `expo-dev-client`.

#### Expo Config Changes (`app.config.ts`)

Add the `expo-health-connect` plugin with write-only permissions:

```typescript
[
  "expo-health-connect",
  {
    permissions: [
      "android.permission.health.WRITE_EXERCISE",
    ],
  },
],
```

Only `WRITE_EXERCISE` is needed — we are not reading any health data.

#### New Files

| File | Purpose |
|------|---------|
| `lib/health-connect.ts` | Health Connect API wrapper — permission check, session write, queue reconciliation |
| `lib/db/health-connect.ts` | DB functions for health_connect_sync_log table |

#### Data Model — Health Connect Mapping

FitForge workout session → Health Connect `ExerciseSession`:

| FitForge Field | Health Connect Field | Notes |
|----------------|---------------------|-------|
| `session.started_at` | `startTime` | ISO 8601 |
| `session.completed_at` | `endTime` | ISO 8601 |
| `session.name` / template name | `title` | e.g. "Push Day" |
| Exercise groups | `ExerciseSegment[]` | One segment per exercise |
| Exercise name | `segment.exerciseType` | Map to `EXERCISE_TYPE_WEIGHTLIFTING` or more specific types |
| Set data (weight × reps) | `segment.repetitions` | Aggregate completed sets |

Exercise type mapping strategy:
- All FitForge exercises map to `ExerciseType.WEIGHTLIFTING` as the primary type
- The exercise name is preserved in `title` metadata for display in Health Connect viewers
- This avoids complex mapping logic and is accurate (FitForge is a strength training app)

#### DB Schema — `health_connect_sync_log`

Mirrors the `strava_sync_log` pattern:

```sql
CREATE TABLE IF NOT EXISTS health_connect_sync_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hc_sync_log_status ON health_connect_sync_log(status);
```

Status values: `pending` → `synced` | `failed` | `permanently_failed`

#### Settings Storage

Use existing `app_settings` table (key-value):
- Key: `health_connect_enabled`
- Value: `"true"` / `"false"` (default: not set = disabled)

#### Sync Flow (Pseudocode)

```typescript
// lib/health-connect.ts

export async function syncToHealthConnect(sessionId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const enabled = await getAppSetting('health_connect_enabled');
  if (enabled !== 'true') return false;

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

    // Build ExerciseSession record
    const record = buildExerciseSessionRecord(session, completedSets);
    await insertRecords([record]);

    await markHCSyncSuccess(sessionId);
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
  const available = await isHealthConnectAvailable();
  if (!available) return false;

  const granted = await requestPermission([
    { accessType: 'write', recordType: 'ExerciseSession' },
  ]);

  return granted.length > 0;
}

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}
```

### Existing Code Inventory

Files that will be MODIFIED (not created):

| File | Change |
|------|--------|
| `app.config.ts` | Add `expo-health-connect` plugin |
| `app/(tabs)/settings.tsx` | Add Health Connect toggle in Integrations card |
| `app/session/[id].tsx` | Add Health Connect sync call alongside Strava sync |
| `app/_layout.tsx` | Add `reconcileHealthConnectQueue()` on startup |
| `lib/db/helpers.ts` | Add `health_connect_sync_log` table migration |
| `lib/db/index.ts` | Re-export health-connect DB functions |
| `package.json` | Add `react-native-health-connect` + `expo-health-connect` deps |

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
- [ ] Given a user on Android who denies the permission, When the toggle callback resolves, Then the toggle reverts to OFF and a snackbar shows "Health Connect permission required"
- [ ] Given a user on Android without Health Connect installed, When they view the Integrations section, Then they see an "Install Health Connect" button linking to the Play Store
- [ ] Given a user on iOS or web, When they view Settings, Then no Health Connect UI is visible
- [ ] Given a sync failure (e.g. Health Connect unavailable at completion time), When the user next opens the app, Then the failed sync is retried automatically (up to 3 times)
- [ ] Given a user with Health Connect enabled, When they view a workout in Google Fit or Samsung Health, Then the workout title, duration, and exercise type are displayed correctly
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] No new TypeScript errors (`npx tsc --noEmit` clean)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Health Connect not installed | Show "Install Health Connect" button with Play Store deep link |
| Permission denied by user | Toggle reverts to OFF, snackbar "Health Connect permission required" |
| Permission previously granted then revoked in system settings | Next sync fails, toggle stays ON but sync silently retries on next launch |
| Workout with 0 completed sets | Skip sync, mark permanently_failed with reason "No completed sets" |
| Very long workout (3+ hours) | Syncs normally — Health Connect accepts any valid time range |
| Network offline (Health Connect is local API) | Should work — Health Connect is on-device, no network needed |
| Health Connect data cleared by user | FitForge sync log shows "synced" but data gone from HC — no action needed (user's choice) |
| Strava AND Health Connect both enabled | Both sync independently, neither blocks the other |
| App killed during sync | Sync log entry stays "pending", retried on next launch |
| Multiple rapid workout completions | Each gets its own sync log entry, processed sequentially |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `react-native-health-connect` breaks with Expo SDK update | Low | Medium | Pin version, test on upgrade |
| Health Connect API changes | Low | Low | Google provides stable API versioning |
| Permission model changes in future Android | Low | Low | Expo config plugin handles manifest changes |
| User confusion between Strava and Health Connect sync | Medium | Low | Clear descriptions under each toggle |
| `expo-health-connect` plugin requires prebuild | Low | Medium | FitForge already uses `expo-dev-client` (prebuild workflow) |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)

**Verdict: NEEDS REVISION** (2026-04-17)

#### Critical Issues (Must Fix)
1. **C1: Permission revocation creates lying UI** — Toggle stays ON when permission revoked externally in Android Settings. Must check permission status on Settings mount and revert toggle + show snackbar.
2. **C2: Dynamic import() not specified** — Must explicitly require `await import()` at all callsites (session/[id].tsx, _layout.tsx, settings.tsx) per BLD-298 learning. Static imports of native-only modules crash web/iOS.
3. **C3: Android API level UX missing** — Must specify behavior for Android <9 (hide row), Android 9-13 (install button), Android 14+ (toggle). Distinguish SDK_UNAVAILABLE vs SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED.
4. **C4: Dual success toasts** — Both Strava + HC showing toasts is noisy. Recommend HC sync silent on success (on-device = near-instant, expected path).

#### Major Issues (Should Fix)
1. **M1**: Specify toggle OFF behavior for pending sync entries (recommend: mark permanently_failed)
2. **M2**: Error toast inconsistency — Strava shows failure toast, HC fails silently. Be consistent.
3. **M3**: Integrations card may look empty on iOS when Strava not connected
4. **M4**: No sync history UI for either integration (future enhancement)

#### Accessibility Gaps
- Touch targets for toggle and Install button must be >=48dp (not specified)
- Install button needs accessibilityRole="button" and accessibilityLabel
- Permission dialog result should announce via AccessibilityInfo.announceForAccessibility()

### Tech Lead (Technical Feasibility)
**Verdict**: NEEDS REVISION — 2 Critical, 2 Major, 2 Minor issues

**Architecture Fit**: Fully compatible. Strava pattern provides exact template. No refactoring needed.
**Effort**: Small-Medium (1–2 weeks). **Risk**: Low.

**Critical Issues (must fix)**:
1. Missing `expo-build-properties` dependency — Health Connect requires `minSdkVersion: 26`. FitForge has no `expo-build-properties` configured. Add it with `compileSdkVersion: 34`, `targetSdkVersion: 34`, `minSdkVersion: 26`.
2. Missing `initialize()` call — `react-native-health-connect` requires `initialize()` before any API call. Both `syncToHealthConnect()` and `requestHealthConnectPermission()` must call it first.

**Major Issues (should fix)**:
3. Missing `clientRecordId` for deduplication — Strava uses `fitforge-{sessionId}` as external ID. Health Connect equivalent is `clientRecordId` in record metadata. Without it, retries create duplicate records.
4. Missing `health_connect_record_id` in sync log schema — Strava has `strava_activity_id`. Add equivalent column for debugging and future delete capability.

**Minor Issues (noted)**:
5. Verify `expo-health-connect` plugin permission string format (may expect `WRITE_EXERCISE` without Android namespace prefix).
6. Note Google Play declaration form as release prerequisite (5–7 day approval + 5–7 day whitelist propagation).

**Positive**: Write-only constraint, single WEIGHTLIFTING mapping, and pattern reuse are all well-scoped decisions.

### CEO Decision
_Pending reviews_
