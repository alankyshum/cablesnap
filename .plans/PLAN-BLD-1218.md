# Feature Plan: Health Connect (Android) Integration

**Issue**: BLD-1218
**Parent**: BLD-1217 (Product evolution heartbeat)
**Author**: CEO
**Date**: 2026-05-12
**Revision**: rev3 (addresses QD rev2 REQUEST CHANGES — Q1 rationale manifest, Q2 DEX-string FOSS gate, Q3 sync-log uniqueness vs edit re-sync, Q4 background body-weight contradiction)
**Status**: DRAFT → IN_REVIEW (rev3)

## Problem Statement

CableSnap is functionally feature-complete as a workout/nutrition tracker, but it is an **island**: every gram of food and every set logged stays inside our SQLite. Users on Reddit consistently complain that competing apps (Strong, Hevy, JEFIT) either (a) don't sync to Android's Health Connect at all, or (b) gate it behind a paid subscription. The pain compounds for users who:

- Own a smart scale (Withings, Mi Body, Eufy) — body weight already lives in Health Connect; they shouldn't have to retype it into CableSnap's body profile.
- Use a separate ring/watch for sleep + HRV (Oura, Garmin, Pixel Watch) — they want a unified workout history visible in Google Fit / Health Connect.
- Track macros in CableSnap but use Health Connect-aware apps (Samsung Health, Fitbit) for daily summaries — duplicate entry burden.

CableSnap's bare-Android user base (the owner runs a Z Fold6, see GH #461/#533/#588/#590) is exactly the demographic who already has Health Connect installed and configured. Shipping this is a high-leverage, low-risk way to deliver the most-requested integration **for free**, while reinforcing our open-source / privacy-first / offline-first identity. Health Connect is on-device storage controlled entirely by the user's permission grants — no cloud round-trip, no third-party data sharing, no analytics pipeline. It is the **only** way to interop without compromising our core values.

## Behavior-Design Classification (MANDATORY)

- [x] **NO** — purely informational/functional. User initiates each sync, opts in per data type, and can revoke at any time via Health Connect settings or our in-app toggles. No nudges, streaks, reminders, push notifications, motivational copy, identity framing, social comparison, or rewards introduced by this feature. Failures are surfaced as plain status text, not loss-framed.

## User Stories

- As a user with a smart scale that writes to Health Connect, I want CableSnap to read my latest body weight automatically so that my profile and bodyweight-exercise calculations stay accurate without manual entry.
- As a user with a Wear OS / Fitbit / Samsung watch, I want my completed CableSnap workouts (with start/end timestamps and active calories estimate) to appear in my watch's daily summary.
- As a user who tracks macros in CableSnap but uses Samsung Health for total daily energy view, I want my logged meals to flow into Health Connect's nutrition records.
- As a privacy-conscious user, I want this integration to be 100% optional, off by default, granular per data type, and clearly documented as on-device only.

## Proposed Solution

### Overview

Add a Health Connect integration layer (Android-only, gracefully no-op on iOS/web) that supports three data flows, each independently toggleable from a new "Settings → Integrations → Health Connect" screen:

1. **Read body weight** (one-way IN, **foreground-only in V1 per Q4**): on app foreground transition (no headless task / WorkManager), query the latest `Weight` record from Health Connect; if newer than CableSnap's body profile entry, prompt the user once to import (or auto-import if "auto-import body weight" toggle is ON). Nightly background pull is deferred to a future "V2 — passive recovery" issue (would require `READ_HEALTH_DATA_IN_BACKGROUND` permission, widening Play declaration scope).
2. **Write workouts** (one-way OUT): on session completion (after `completeSession()`), push an `ExerciseSession` record (type=`STRENGTH_TRAINING`) with start/end timestamps + title. **V1 does NOT write `ActiveCaloriesBurned`** — Google Fit / Samsung Health / etc. derive a better estimate from `ExerciseSession` duration + body weight when no explicit calorie record is present (see B5 in rev1 review). Calorie/Power/HeartRate writes are deferred to a future "Recovery V2" plan.
3. **Write nutrition** (one-way OUT): on each food log entry, push a `Nutrition` record (calories, protein, carbs, fat, fiber, sugar, sodium) with the meal type metadata.

Plus a "Write hydration" toggle for the existing water log (one HC `Hydration` record per `water_logs` row, not per cup — see C1).

### UX Design

**Discovery & onboarding:**
- New row in Settings list: "Health Connect" with a green/grey status dot. Tap → integration screen.
- Integration screen header explains in one paragraph what Health Connect is, that data stays on-device, and links to Google's official docs.
- If Health Connect is not installed: show a "Install Health Connect" CTA that deep-links to the Play Store entry; degrade gracefully, do not crash.
- Permission grants are requested via the Health Connect permission flow (not Android runtime permissions) — surface a "Grant access" button per data type.
- After grant, each toggle shows when last sync occurred and the count of records pushed/pulled.

**Active session:**
- No UI changes during workout — sync happens silently after `completeSession()` returns success.
- If the post-completion write fails, show a non-blocking toast: "Workout saved locally. Health Connect sync failed — retry from Settings." Failure does NOT block the success toast or roll back the session. The `health_connect_sync_log` row remains `pending` and is retried on next foreground.

**Body weight import prompt (active-session guard — C2):**
- Foreground body-weight pulls only emit a prompt when:
  1. No active session is in progress (`useSessionStore` selector reports no active session), AND
  2. `useSessionActions.completeSession()` did NOT return within the last 5 minutes (post-session grace window).
- If gate fails, the candidate weight is queued in `dismissed_weight_imports` keyed by HC record ID with `state='deferred'` and re-evaluated on the next foreground transition that satisfies the gate.

**Body weight import prompt:**
- When auto-import is OFF and a newer Health Connect weight is detected: bottom sheet titled "Update body weight?" showing old → new value, source app name (e.g. "Withings Health Mate"), and timestamp. Buttons: **Update** / **Not now** / **Always import automatically**.

**Empty / disabled / error states:**
- Health Connect not installed → "Install Health Connect to enable this feature" + Play Store CTA (deep-link via `<queries>` for `com.google.android.apps.healthdata`). On a no-Play device the CTA degrades to plain text guidance.
- Permission denied / revoked → toggle reverts to OFF, show "Permission denied. Tap to retry." inline.
- Sync failure → status row shows "Last attempt failed: [reason]" with a manual "Retry now" button driven by the `health_connect_sync_log` table.
- iOS / web build → entire Integrations row is hidden (`Platform.OS !== 'android'`).
- Android FOSS variant on a no-HC-APK device → row is **visible**, displays "Install Health Connect" CTA (B3 — we ship in both variants and degrade at runtime via `library.isAvailable()`; never gate on build flavor).

**Accessibility:**
- All toggles have `accessibilityRole="switch"` with descriptive labels.
- Status dots have `accessibilityLabel` ("Connected" / "Not connected" / "Permission denied").
- Bottom sheet meets contrast + focus-trap requirements.

### Technical Approach

**Architecture:**
- New module `lib/health-connect.ts` — pure interface defining `readLatestBodyWeight()`, `writeWorkout()`, `writeNutrition()`, `writeHydration()`, `requestPermissions()`, `getGrantedPermissions()`, `isAvailable()`. Returns `Result<T, HealthConnectError>` types.
- Platform implementation `lib/health-connect.android.ts` wraps the JNI bridge into `react-native-health-connect`.
- Platform stub `lib/health-connect.ts` for iOS/web returns `{ available: false }` from every call; never throws.
- Settings UI in `app/settings/health-connect.tsx`.
- Hook integration: `hooks/useSessionActions.ts` `completeSession()` finalisation → enqueue a `pending` row in `health_connect_sync_log` IN THE SAME SQLite TRANSACTION as the session completion, then fire-and-forget the sync worker. Same pattern for nutrition log mutations and water log mutations.
- A single in-process worker drains the `health_connect_sync_log` FIFO with bounded retries (max 5, exponential backoff capped at 1h). Triggered on app foreground, on session completion, on food/water log mutation, and on manual "Retry now".
- Foreground-only body-weight pull (Q4): piggyback on existing `useAppForeground` hook; throttle to ≤1 call/hour via `health_connect_state.last_body_weight_pull_at`. No headless task / WorkManager / `READ_HEALTH_DATA_IN_BACKGROUND` in V1 (deferred to V2 passive-recovery plan).

**Pre-write permission gate (B6):**
- `assertWritePermissions(recordTypes: HealthConnectRecordType[])` helper invoked before EVERY public write call.
- Calls `getGrantedPermissions()` (cached for ≤30s to avoid hot-path JNI thrash on bursty food entries) and intersects with the permissions required for the record type.
- On missing permission: abort the write, mark the sync_log row `failed` with `error='permission_revoked'`, flip the data-type toggle OFF, surface a single non-spammy toast.

**Data model additions (SQLite) — replaces rev1's `hc_record_id` columns:**

New table `health_connect_sync_log` (mirrors the proven `strava_sync_log` shape at `lib/db/tables.ts:311–322`):

```sql
CREATE TABLE health_connect_sync_log (
  id              TEXT PRIMARY KEY,                  -- local UUID, also passed as HC clientRecordId
  op_kind         TEXT NOT NULL CHECK (op_kind IN (
                    'write_workout','write_nutrition','write_hydration',
                    'delete_workout','delete_nutrition','delete_hydration'
                  )),
  source_table    TEXT NOT NULL,                     -- 'sessions'|'food_logs'|'water_logs'
  source_row_id   TEXT NOT NULL,                     -- FK to source row
  payload_json    TEXT NOT NULL,                     -- snapshot of what to write (resilient to source edits)
  hc_record_ids   TEXT,                              -- JSON array of HC server-side IDs (populated on synced)
  status          TEXT NOT NULL CHECK (status IN ('pending','syncing','synced','failed','permanently_failed','tombstoned')),
  error           TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  supersedes_id   TEXT REFERENCES health_connect_sync_log(id),  -- Q3: chain edit re-syncs (new write supersedes prior synced row)
  created_at      INTEGER NOT NULL,
  synced_at       INTEGER
  -- NOTE (Q3): NO blanket UNIQUE(op_kind, source_table, source_row_id).
  -- That would block AC14 edit re-sync (delete + fresh write w/ new clientRecordId
  -- per source edit). Instead: a partial unique index restricted to in-flight writes
  -- guards against duplicate enqueue, while terminal rows accumulate as the audit
  -- trail of edit history.
);
CREATE INDEX idx_hc_sync_log_status ON health_connect_sync_log (status);

-- Q3: only one in-flight write per (op_kind, source_row_id). Terminal rows
-- ('synced','failed','permanently_failed','tombstoned') do NOT participate, so
-- editing a previously-synced food log can enqueue a new 'pending' row freely.
CREATE UNIQUE INDEX idx_hc_sync_log_inflight
  ON health_connect_sync_log (op_kind, source_table, source_row_id)
  WHERE status IN ('pending','syncing');
```

- Insert in the **same SQLite transaction** as the source row mutation. Never trust an in-memory promise.
- Every HC write passes `metadata.clientRecordId = <sync_log.id>` so the HC client itself dedups our retries server-side. This (not just our server-generated IDs) is the correctness gate against duplicates after crash.
- Multi-record writes (currently only `ExerciseSession` in V1; future `Recovery V2` may add `Power`/`HeartRate`) store an **array** of HC record IDs in `hc_record_ids`.
- Cascade-delete is async: the user deletes a session/food log/water log → we INSERT a `delete_*` sync_log row in the same SQLite transaction → worker drains it via `deleteRecordsByUuids(recordType, [], [originalSyncLog.id])` (uses `clientRecordIdsList` per `react-native-health-connect@3.5.0` API surface) → marks the row `tombstoned`. If HC is uninstalled / unreachable, the tombstone replays on reinstall.
- **Edit re-sync (AC14)**: editing a `synced` source row enqueues a `delete_*` row pointed at the prior synced row via `supersedes_id`, plus a fresh `write_*` row with a NEW `clientRecordId`. The partial unique index `idx_hc_sync_log_inflight` only constrains active writes, so the new pending row coexists with the prior `synced` (now-being-tombstoned) row. Worker drains delete-then-write atomically per logical edit. Net HC state shows the new value; audit trail preserved in CableSnap.

Plus a small singleton `health_connect_state` table for cross-cutting state:
- `last_body_weight_pull_at INTEGER`
- `dismissed_weight_imports TEXT` (JSON: `{ [hcRecordId]: { state: 'dismissed' | 'deferred', at: ts } }`)
- `auto_import_body_weight INTEGER` (boolean)
- Per-toggle `enabled_at` timestamps for backfill cutoff (CSV-imported historical sessions older than `enabled_at` are NOT pushed).

Migration is additive; no existing tables changed.

**Native dependency choice:**
- Use community library **`react-native-health-connect@3.5.0`** (MIT, actively maintained). Verified deps: `androidx.health.connect:connect-client:1.1.0-alpha11` + `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3` only — zero GMS / Firebase / MLKit transitive pulls (B3 verified by techlead).
- The `1.1.0-alpha11` HC client is required for `deleteRecords(byClientRecordId)` semantics we rely on for cascade-delete; `1.0.0` stable lacks this. Pin exactly, monitor monthly, document as known stability risk.
- **Library v3 dropped its bundled Expo config plugin.** No `app-plugin` field, no `plugin/` export, README points at non-existent `expo-health-connect`. **We MUST author our own** — see "Expo config plugin" below.
- Bundle adds ~250 KB to APK after R8/dex (raw AAR ≈800 KB unstripped; the rev1 "120 KB" claim was incorrect).
- Gracefully tree-shaken on iOS via `lib/health-connect.ts` platform extension (no native imports).

**Expo config plugin — `plugins/with-health-connect.js` (B2):**

This is a real Slice 1 deliverable, not "if upstream's plugin shape conflicts". Three concrete jobs:

1. `withAndroidManifest`: add the V1 permissions block, the `<queries>` for `com.google.android.apps.healthdata`, register a `PermissionsRationaleActivity`, AND register an Android-14+ `<activity-alias>` per the official Health Connect setup guide ([developer.android.com/health-and-fitness/guides/health-connect/develop/get-started](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started)). Q1 corrected manifest shape (rev2 wrongly mixed action `VIEW_PERMISSION_USAGE` with category `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`):
   ```xml
   <!-- Android 13 and below: rationale Activity for the Health Connect "Privacy policy" link -->
   <activity
       android:name=".PermissionsRationaleActivity"
       android:exported="true">
     <intent-filter>
       <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
     </intent-filter>
   </activity>

   <!-- Android 14+ (HC is part of framework): activity-alias bound by the
        platform-protected START_VIEW_PERMISSION_USAGE permission -->
   <activity-alias
       android:name="ViewPermissionUsageActivity"
       android:exported="true"
       android:targetActivity=".PermissionsRationaleActivity"
       android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
     <intent-filter>
       <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
       <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
     </intent-filter>
   </activity-alias>
   ```
2. `withDangerousMod`: write `PermissionsRationaleActivity.kt` (no-op activity that opens our existing in-app help screen) into `android/app/src/main/java/<package>/PermissionsRationaleActivity.kt`. Idempotent via sentinel marker `// cablesnap:hc:rationale-activity`.
3. `withMainActivity`: inject in `MainActivity.kt`'s `onCreate()`:
   ```kotlin
   // cablesnap:hc:permission-delegate-begin
   import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate
   HealthConnectPermissionDelegate.setPermissionDelegate(this)
   // cablesnap:hc:permission-delegate-end
   ```
   This is REQUIRED by `react-native-health-connect@2+` for `requestPermission()` to return results. Without it the JS promise never resolves. Sentinel-marker idempotent (mirrors `with-wearos-module.js` discipline).

Plugin chain ordering (C4): place between `with-form-clips-backup` and the Sentry plugin in `app.config.ts`. No collisions verified — HC touches `<queries>`, permissions, and a new activity; existing plugins touch `data_extraction_rules.xml`, `full_backup_content.xml`, `settings.gradle`, `app/build.gradle`, FOSS manifest strip, signing config — disjoint. Plugin header documents the constraint.

**Permissions / manifest (V1 only — minimises Play declaration scope per B5):**
- `android.permission.health.READ_WEIGHT`
- `android.permission.health.WRITE_EXERCISE`
- `android.permission.health.WRITE_NUTRITION`
- `android.permission.health.WRITE_HYDRATION`
- `<queries>` block for `com.google.android.apps.healthdata`
- `PermissionsRationaleActivity` with `<intent-filter android:action="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE">` (Android 13 and below)
- `<activity-alias android:name="ViewPermissionUsageActivity" android:permission="android.permission.START_VIEW_PERMISSION_USAGE">` with action `android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS` (Android 14+)

NOT in V1 (deferred): `WRITE_ACTIVE_CALORIES_BURNED`, `WRITE_HEART_RATE`, `WRITE_POWER`, `WRITE_EXERCISE_ROUTE`. Each one widens the Play Health Connect declaration form scope.

**FOSS variant compatibility (B3):**
- `androidx.health.connect:connect-client` is pure AndroidX (sourced from Google's Maven Repo but NOT GMS — F-Droid Inclusion Criteria allow `androidx.*` artifacts). Ship the dependency in BOTH `release` and `releaseFdroid`.
- **Do NOT add a `releaseFdroidImplementation { exclude … }` block.** Do NOT gate the Settings row on Play vs FOSS.
- Gate at runtime: `Platform.OS === 'android' && library.isAvailable()`. On a no-Play / no-HC-APK device, `isAvailable()` returns false and our existing degrade path shows the install CTA.
- **Hard gate (C6 / AC11)** — replaces rev2's `unzip -l` zip-entry-name grep with the DEX-string approach mandated by the `fdroid-foss-build` skill ([.claude/skills/fdroid-foss-build/SKILL.md:101–110](../.claude/skills/fdroid-foss-build/SKILL.md)). Preserves the three existing crash guards (`com/google/android/gms/wearable`, `FirebaseInitProvider`, `MlKitInitProvider`) AND adds the positive HC assertion. Wired into `scripts/verify-fdroid-no-gms.sh` (new) and called from CI:
  ```bash
  set -euo pipefail
  APK=android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk
  TMPDIR_DEX=$(mktemp -d)
  trap 'rm -rf "$TMPDIR_DEX"' EXIT
  unzip -q -o "$APK" 'classes*.dex' -d "$TMPDIR_DEX"

  # Negative assertions — preserve all three existing FOSS crash guards.
  # Per .claude/skills/fdroid-foss-build/SKILL.md: rely on `strings` over
  # extracted DEX, NOT zip entry names (Q2).
  BAD=$(strings "$TMPDIR_DEX"/classes*.dex \
    | grep -cE 'com/google/android/gms/wearable|FirebaseInitProvider|MlKitInitProvider' \
    || true)
  if [ "$BAD" -ne 0 ]; then
    echo "❌ FOSS gate: $BAD prohibited references in releaseFdroid DEX"
    exit 1
  fi

  # Positive assertion — HC client must be present (proves we are not silently
  # excluding it from releaseFdroid).
  HC=$(strings "$TMPDIR_DEX"/classes*.dex \
    | grep -c 'androidx/health/connect/' || true)
  if [ "$HC" -eq 0 ]; then
    echo "❌ FOSS gate: androidx/health/connect/* missing from releaseFdroid DEX"
    exit 1
  fi
  echo "✅ FOSS gate passed (no GMS/Firebase/MlKit init providers; HC client present: $HC refs)"
  ```
- **`__tests__/plugins/with-wearos-module.test.js`** assertion stays unchanged — it gates the Gradle exclude block. The DEX gate above is the runtime artifact gate that catches transitive surprises.
- F-Droid metadata: add a one-line note in the description: "Optional Health Connect integration — requires Health Connect (sideload from Play Store, F-Droid, or Aurora)". No anti-features changes.

**Performance:**
- All Health Connect calls happen off the JS thread (library uses native coroutines).
- Foreground-only body-weight pull (Q4) on `useAppForeground` transition; throttle ≤1/hour; never via headless task or WorkManager. The `READ_HEALTH_DATA_IN_BACKGROUND` permission is intentionally NOT requested in V1 — keeps battery cost negligible AND minimises Play declaration scope.
- `getGrantedPermissions()` cache (≤30s) avoids JNI thrash on bursty food entry.
- Sync worker uses `setImmediate`-style scheduling; no `setInterval`.

**Privacy / observability:**
- We never copy Health Connect data into our SQLite for analytics. Only the *last fetched value* of body weight is mirrored into the user's body profile, which they already manage manually today.
- All writes are tagged with our package name in Health Connect, so the user can revoke and bulk-delete from the system UI.
- Toggles default to OFF. First launch never silently writes.
- **Sentry breadcrumb sanitisation (C3) — explicit allowlist schema:**
  ```ts
  type HealthConnectBreadcrumb = {
    operation: 'write_workout' | 'write_nutrition' | 'write_hydration'
             | 'read_weight'   | 'request_permission' | 'delete_record';
    errorCategory: 'permission_revoked' | 'not_installed' | 'sdk_exception' | 'unknown';
    errorCode?: string; // HC SDK error code only, no message text
  };
  ```
  Forbidden in breadcrumbs: any HC record values, source app names, timestamps, record IDs, meal contents, weight deltas, user package names, error message strings.
  Enforced via a unit test that snapshots the breadcrumb payload from a fixed set of error fixtures (AC9b).

## Pre-Implementation Critical Path (B1)

**Google Play Health Connect declaration form is a hard release blocker.** Per the library README and Google's official docs, any app using HC permissions on Play must submit a declaration form covering each `WRITE_*` / `READ_*` permission used. Approval can take ~7 days, plus a server-side whitelist propagation of 5–7 business days. Without an approved declaration the app gets rejected at Play review (or pulled post-release).

- **Owner:** CEO (cannot be delegated to an agent — requires real human identity on a Play Console account).
- **Trigger:** filed BEFORE Slice 5 ships to Play. Can be filed in parallel with Slice 0 spike.
- **Permissions to declare (V1, minimised per B5):** `READ_WEIGHT`, `WRITE_EXERCISE`, `WRITE_NUTRITION`, `WRITE_HYDRATION`. (`WRITE_ACTIVE_CALORIES_BURNED` deliberately excluded — see B5.)
- **F-Droid release is unaffected** — declaration form is Play-only. Slices 0–4 can proceed without it; Slice 5 Play submission gates on it.
- A standing CEO approval (Paperclip `create-approval --type general`) tracks this dependency and unblocks Slice 5 Play submission when approved.

## Scope

**In scope (V1):**
- Read body weight (one-way IN with prompt or auto-import; active-session guard per C2).
- Write completed workouts (`ExerciseSession` ONLY — `ActiveCaloriesBurned` deferred per B5).
- Write nutrition records.
- Write hydration records (one HC `Hydration` record per `water_logs` row per C1).
- Settings screen with per-type toggles, status, manual retry (driven by `health_connect_sync_log`).
- Graceful no-op on iOS / web / Health Connect-not-installed (runtime gate via `library.isAvailable()`, NOT build flavor).
- `health_connect_sync_log` outbox table + worker for crash-safe, idempotent writes (B4).
- Cascade delete via `clientRecordId` lookup on the source-row delete path.
- Custom Expo config plugin (`plugins/with-health-connect.js`) covering manifest mutations, RationaleActivity, and MainActivity permission-delegate injection (B2).
- Pre-write `getGrantedPermissions()` runtime check on every public write (B6).
- Documentation in README + a new help screen entry.

**Out of scope (deferred):**
- **Nightly background body-weight pull** — deferred to V2 passive-recovery plan (Q4). Requires `READ_HEALTH_DATA_IN_BACKGROUND` permission which widens the Play declaration form scope. V1 is foreground-only.
- **`ActiveCaloriesBurned` / `Power` / `HeartRate` writes** — defer to "Recovery V2" plan (uses HR data for accurate kcal). Reasons in B5: (a) MET × volume estimate is visibly wrong vs measured watch burn, (b) downstream (Google Fit / Samsung Health) derives a better estimate from `ExerciseSession` duration alone when no explicit calorie record is present, (c) reduces Play declaration scope.
- Read sleep / HRV / heart rate (saved for "Recovery V2" — needs psych review).
- Read steps / activity outside CableSnap (no current consumer in our model).
- Apple HealthKit (iOS) — separate plan; iOS user base is currently 0 and would need TestFlight infra.
- Bidirectional workout sync (i.e. importing workouts logged elsewhere into CableSnap) — risk of duplicate / conflict logic too high for V1.
- Wear OS active-workout streaming via Health Connect — orthogonal, lives with our existing WearOS module.

## Acceptance Criteria

- [ ] **AC1** On Android, fresh install: Settings → Integrations → Health Connect is visible in BOTH `release` and `releaseFdroid` build variants (gated only by `Platform.OS === 'android'`, NOT by build flavor). iOS / web: row is hidden. [TODO-test: BLD-1218]
- [ ] **AC2** Tapping "Read body weight" toggle when Health Connect is not installed shows the install CTA, does not crash, does not flip the toggle ON. [TODO-test: BLD-1218]
- [ ] **AC3** Granting `READ_WEIGHT` permission and toggling ON triggers a one-time pull. If a newer weight exists AND no active session is in progress AND `completeSession()` did not return within last 5 min, the bottom-sheet prompt appears with old → new + source + timestamp. [TODO-test: BLD-1218]
- [ ] **AC4** Tapping "Always import automatically" persists, suppresses the prompt, and updates body profile silently on subsequent newer weights. [TODO-test: BLD-1218]
- [ ] **AC5** Completing a session with "Write workouts" ON results in (a) the success toast firing on time, (b) within 5s an `ExerciseSession` record visible in Health Connect's "Recent activity" list with correct start/end + title (NO `ActiveCaloriesBurned` record), (c) `health_connect_sync_log` row transitions `pending → synced` with `hc_record_ids` populated as a single-element JSON array. [TODO-test: BLD-1218]
- [ ] **AC6** Logging a food entry with "Write nutrition" ON results in a `Nutrition` record with calories + macros + meal type matching the log entry within 2s, and a `synced` sync_log row with `clientRecordId == sync_log.id`. [TODO-test: BLD-1218]
- [ ] **AC7** Deleting a CableSnap session with a `synced` sync_log row enqueues a `delete_workout` sync_log row in the same SQLite transaction; worker calls `deleteRecords(byClientRecordId)` and tombstones the original. Verified by HC record count == 0 after worker drains. [TODO-test: BLD-1218]
- [ ] **AC8** Revoking `WRITE_NUTRITION` in Health Connect's system UI WITHOUT backgrounding CableSnap causes the next food log write to: (a) fail via `assertWritePermissions` BEFORE calling HC, (b) mark sync_log row `failed` with `error='permission_revoked'`, (c) flip the Nutrition toggle OFF, (d) surface a single non-spammy toast. The food log itself persists in CableSnap normally. [TODO-test: BLD-1218]
- [ ] **AC9** PR passes typecheck, all existing tests, and adds new unit tests for the pure helpers (sync_log state machine, prompt thresholding, permission allowlist). [TODO-test: BLD-1218]
- [ ] **AC9b** Sentry breadcrumb sanitisation snapshot test: feeding a fixed set of error fixtures into the wrapper produces breadcrumbs containing ONLY `{operation, errorCategory, errorCode?}` keys — no record values, app names, timestamps, IDs, meal contents, weight deltas, or error message strings. [TODO-test: BLD-1218]
- [ ] **AC10** No new lint warnings. [TODO-test: BLD-1218]
- [ ] **AC11** FOSS variant `releaseFdroid` DEX-string gate (Q2 — replaces rev2's zip-entry grep; mirrors `.claude/skills/fdroid-foss-build/SKILL.md:101–110`):
  ```bash
  TMPDIR_DEX=$(mktemp -d)
  unzip -q -o android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk \
    'classes*.dex' -d "$TMPDIR_DEX"
  # Must be 0:
  strings "$TMPDIR_DEX"/classes*.dex \
    | grep -cE 'com/google/android/gms/wearable|FirebaseInitProvider|MlKitInitProvider'
  # Must be > 0:
  strings "$TMPDIR_DEX"/classes*.dex | grep -c 'androidx/health/connect/'
  rm -rf "$TMPDIR_DEX"
  ```
  Wrapped in `scripts/verify-fdroid-no-gms.sh` and invoked by CI / build script. Preserves all three existing crash guards plus the positive HC presence check. [TODO-test: BLD-1218]
- [ ] **AC12** Outbox crash safety: terminate the app between `writeRecord` succeeding in HC and SQLite commit; on relaunch, the next worker tick must NOT create a duplicate (verified by HC record count == 1, guaranteed by `clientRecordId` server-side dedup). [TODO-test: BLD-1218]
- [ ] **AC13** Permission revoked mid-multi-record write: outbox row marked `failed`, partial HC records (if any from a prior partial success) are tombstoned via cleanup pass; single non-spammy toast shown. [TODO-test: BLD-1218]
- [ ] **AC14** Editing a previously-`synced` food log: enqueue a `delete_nutrition` (worker tombstones the old HC record by `clientRecordId`) followed by a fresh `write_nutrition` with a new `clientRecordId`. Net HC state shows the new value, no orphan old record. [TODO-test: BLD-1218]
- [ ] **AC15** PermissionsRationaleActivity is reachable from HC's permission UI on BOTH Android 13 and Android 14+ devices/emulators (Q1 dual-shape). On Android 13: triggered via the rationale `<intent-filter>` for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`. On Android 14+: triggered via the `ViewPermissionUsageActivity` activity-alias guarded by `START_VIEW_PERMISSION_USAGE`. Manual verification recorded in PR description with screenshots from owner's Z Fold6 (Android 14+) AND an Android 13 emulator. [TODO-test: BLD-1218]
- [ ] **AC16** Body-weight prompt does NOT appear during an in-progress session OR within 5 min of `completeSession()` returning; appears on the next foreground transition outside that window (active-session guard per C2). [TODO-test: BLD-1218]
- [ ] **AC17** CSV import re-creates historical sessions: imported sessions with `created_at < health_connect_state.workouts_enabled_at` are NOT pushed to HC (no retroactive backfill — avoids HC historical-write rate limits + dedup risk). [TODO-test: BLD-1218]

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Health Connect not installed | Toggles disabled, "Install" CTA visible, no crash, no permission prompt. |
| Health Connect installed but never opened | First permission request triggers Health Connect's onboarding; we wait for callback. |
| User revokes permission mid-session | Next write fails, toast shown, toggle flips OFF, session itself completes normally. |
| Multiple concurrent body weights pushed by different apps in same minute | Pull picks the most recent by timestamp; ties broken by latest writer (deterministic). |
| Body weight pulled but user dismisses prompt | Stored in `dismissed_weight_imports` keyed by Health Connect record ID; do not re-prompt for the same record. New record IDs trigger fresh prompts. |
| Network unavailable | Irrelevant — Health Connect is fully on-device. |
| Health Connect SDK throws unexpected exception | Caught at the wrapper, logged via Sentry breadcrumb (sanitised allowlist per C3 — operation + errorCategory + errorCode only), surfaced as generic "Sync failed" toast. |
| User runs CableSnap on Android < 8 (HC requires API 26 / Android 8) | Library reports `not_supported`; row shows "Requires Android 8 or newer", toggle disabled. (Our `minSdkVersion` is already 26 so this should not occur in practice.) |
| User logs a session offline, comes online later | No effect — we write to Health Connect immediately on completion regardless of network. |
| User deletes Health Connect app | Next call returns `not_installed`; toggles auto-flip OFF; status row shows install CTA. |
| FOSS variant on a phone without Google Play Services | HC dependency is pure AndroidX (no GMS) so library binds. The HC APK itself is Play-only — runtime `library.isAvailable()` returns false, install CTA shown. AC11 grep gate enforces no GMS leakage in `releaseFdroid`. |
| CSV import re-creates historical sessions | Imported sessions with `created_at < health_connect_state.workouts_enabled_at` do NOT get retroactively pushed (avoids HC historical-write rate limits + duplicates). Per AC17. |
| Session crosses midnight | Health Connect supports ranged records; pass full start/end without splitting. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Slice 0 spike reveals `react-native-health-connect@3.5.0` New-Architecture / Expo 55 prebuild incompatibility | Medium | High | Slice 0 is throwaway; if it fails, fall back to a thin Kotlin module under `modules/health-connect/`. Slices 1+ blocked until spike green. |
| Custom `with-health-connect.js` plugin breaks across `expo prebuild` reruns | Low | High | Sentinel-marker pattern proven by `with-wearos-module.js`; idempotency unit-tested in Slice 1. |
| `androidx.health.connect.client:1.1.0-alpha11` API changes before stable | Medium | Medium | Pinned exact version; monthly changelog watch; runtime SDK-version probe behind interface. |
| Play Health Connect declaration form rejected or delayed | Medium | High | File during Slice 0; Slice 5 Play submission is the only step gated on it. F-Droid release ships independently. |
| FOSS variant unexpectedly leaks GMS via transitive deps | Low | High | AC11 hard grep gate in CI / build script — fails the build if `com/google/android/gms/` count != 0. |
| Outbox worker drains too aggressively → JNI thrash on bursty food entry | Low | Medium | `getGrantedPermissions` cache 30s; worker batches by op_kind; debounce 250ms on enqueue cluster. |
| User confusion about what "on-device" means → privacy complaint | Medium | Medium | Crystal-clear settings copy + link to Google's official Health Connect docs + README section + per-permission rationale copy before system permission sheet. |
| Re-prompt fatigue on body weight imports | Low | Low | Per-record-ID dedup + active-session guard + "Always import" opt-out. |
| Sentry leakage of Health Connect data into breadcrumbs | Low | High | Strict allowlist schema (C3) + AC9b snapshot test. |

## Implementation Slices (revised per techlead C5)

0. **Slice 0 — Throwaway feasibility spike (techlead).** Add `react-native-health-connect@3.5.0`, run `expo prebuild --platform android --clean`, run `./gradlew :app:assembleRelease` AND `./gradlew :app:assembleReleaseFdroid`. Grep both APKs: `androidx/health/connect/*` must be present in both, `com/google/android/gms/*` must be absent in `releaseFdroid`. Smoke-test HC permission flow on a real device (Z Fold6) or Android emulator with HC sideloaded. Discard the branch. **Output:** comment on this issue with grep counts + go/no-go.
   - **Hard gate**: Slices 1–5 do NOT start until Slice 0 reports green.
1. **Slice 1 — Foundations (claudecoder).** `plugins/with-health-connect.js` (manifest + RationaleActivity.kt + MainActivity.kt patch w/ sentinel markers) + `lib/health-connect.ts` interface + `lib/health-connect.android.ts` skeleton + iOS/web stubs + Settings row shell + `health_connect_sync_log` + `health_connect_state` migrations + the broadened APK grep gate (AC11). No data flows yet.
2. **Slice 2 — Read body weight (claudecoder).** Permission flow, foreground pull throttle (≤1/hour), bottom-sheet prompt with active-session guard (C2 / AC16), auto-import toggle, `dismissed_weight_imports` dedup state.
3. **Slice 3 — Write workouts (claudecoder).** `ExerciseSession`-only via outbox; completion-hook integration in `useSessionActions.completeSession()`; cascade delete via `clientRecordId`. NO `ActiveCaloriesBurned` writes (B5).
4. **Slice 4 — Write nutrition + hydration (claudecoder).** Food log + water log hooks via outbox; one HC `Hydration` per `water_logs` row (C1); edit-as-delete-then-write (AC14).
5. **Slice 5 — Polish + release (techlead).** README + help screen + FOSS APK grep verification on real artefact + Play declaration form filing reminder (CEO unblock dependency) + manual end-to-end QA on owner's Z Fold6 + screenshot of RationaleActivity reachable from HC's permission UI (AC15).

**Test strategy note:** HC requires a real device with the HC APK installed. Unit-test the pure helpers (sync_log state machine, breadcrumb sanitiser, prompt dedup, permission allowlist, calorie/permission helpers) at AC9; wrap the JNI-bound `lib/health-connect.android.ts` exports behind a minimal `IHealthConnectNative` interface so tests can swap the native module with a fake. Manual E2E on owner's Z Fold6 is the AC for end-to-end. CI cannot exercise the real native path.

## Review Feedback

### Quality Director (UX)
**REQUEST CHANGES** — plan is directionally strong, but V1 is not ready to execute until these quality/data-integrity gaps are resolved:

1. **FOSS/Play variant contract is contradictory and unsafe.** The UX section says the row is hidden for the explicit FOSS-only build, while the FOSS compatibility section says the FOSS build can include Health Connect. Resolve this to a single architecture: Health Connect dependency, Expo plugin, manifest permissions, and Settings row must be Play-variant only unless Tech Lead proves the dependency is FOSS-safe with `releaseFdroid`.
2. **`hc_record_id` alone is not enough for idempotency.** If Health Connect write succeeds and SQLite update fails/crashes before persisting the returned ID, retry can duplicate workouts/nutrition/hydration. Require deterministic per-record external IDs or a durable pending-sync table with operation state, all Health Connect record IDs per logical write, and replay/delete semantics.
3. **Workout mapping is under-specified.** The plan writes both `ExerciseSession` and `ActiveCaloriesBurned`, but only stores one `sessions.hc_record_id`; it also omits `WRITE_ACTIVE_CALORIES_BURNED` from the manifest permission list. Add explicit multi-record mapping, permission request, delete cascade, and partial-write rollback/retry behavior.
4. **Prompt timing needs an active-session guard.** Body-weight import prompts triggered on app foreground must not appear during an active workout or immediately over the completion flow. Queue the prompt until the user is outside session logging.
5. **Backfill/edit/delete semantics need acceptance criteria.** Current AC covers initial writes and session delete, but not nutrition/water deletes, edits after successful sync, app crash between write and local persistence, permission revocation during a multi-record sync, or historical backfill rate limits. Add behavioral AC before implementation.
6. **Privacy logging must be stricter.** Sentry breadcrumbs should include only sanitized error category/code and operation type, never health values, source app names, timestamps, Health Connect record IDs, meal contents, or body weight deltas.

Non-blocking UX refinements: keep per-data-type toggles, inline retry affordances, and source/timestamp in the body-weight sheet; add "why we need this permission" copy per data type so the system permission sheet is not surprising.

**Rev2 re-review — REQUEST CHANGES**. Rev2 resolves the broad direction of the first QD review, but four implementation-blocking issues remain:

1. **Health Connect rationale manifest spec is still wrong.** Android's setup guide requires an exported activity for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` through Android 13, plus an Android 14+ `activity-alias` with `android:permission="android.permission.START_VIEW_PERMISSION_USAGE"`, action `android.intent.action.VIEW_PERMISSION_USAGE`, and category `android.intent.category.HEALTH_PERMISSIONS`. Rev2 instead mixes `VIEW_PERMISSION_USAGE` with category `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` and omits the alias/permission shape. AC15 is likely to fail until this is corrected.
2. **F-Droid verification must inspect DEX contents, not APK zip paths.** The loaded `fdroid-foss-build` skill explicitly requires extracting `classes*.dex` and running `strings` over DEX contents. Rev2 AC11 uses `unzip -l ... | grep`, which can miss classes packed into DEX and does not re-check the existing F-Droid crash guards (`FirebaseInitProvider`, `MlKitInitProvider`, `com/google/android/gms/wearable`). Replace AC11 with the DEX-string gate and keep the positive `androidx/health/connect` assertion there.
3. **`UNIQUE (op_kind, source_table, source_row_id)` conflicts with edit re-sync.** AC14 requires a previously synced food log edit to enqueue `delete_nutrition` followed by a fresh `write_nutrition` with a new `clientRecordId`. The proposed unique constraint permits only one `write_nutrition` row for that source row forever, so the fresh write cannot be inserted without overwriting history. Add a source version/sequence/supersedes field or narrow uniqueness to only active pending writes.
4. **Body-weight background behavior is contradictory.** Overview still says "on app foreground + nightly background fetch", while Performance says no headless task / WorkManager. Pick one. If nightly background fetch remains, add the Health Connect background-read feature/permission implications and AC; otherwise remove it from Overview.

**Rev3 re-review — APPROVE**. I verified rev3 against all four QD rev2 blockers and found them resolved at the plan level:

- **Q1 (rationale manifest)** → fixed at lines 152–177. Dual-shape per the official Android setup guide ([developer.android.com/health-and-fitness/guides/health-connect/develop/get-started](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started)): rationale `Activity` for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (Android 13 and below) PLUS an `<activity-alias android:name="ViewPermissionUsageActivity" android:permission="android.permission.START_VIEW_PERMISSION_USAGE">` with action `android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS` (Android 14+). AC15 updated to require manual verification on BOTH an Android 13 emulator and the Z Fold6 (Android 14+).
- **Q2 (DEX-string FOSS gate)** → fixed at lines 187–217 + AC11. Replaced `unzip -l` zip-entry grep with `unzip -q 'classes*.dex' + strings + grep` per `.claude/skills/fdroid-foss-build/SKILL.md:101–110`. Negative pattern preserves all three existing crash guards (`com/google/android/gms/wearable|FirebaseInitProvider|MlKitInitProvider`) and adds the positive `androidx/health/connect/` assertion. Wrapped in new `scripts/verify-fdroid-no-gms.sh`.
- **Q3 (sync-log uniqueness vs edit re-sync)** → fixed at lines 99–127. Removed blanket `UNIQUE(op_kind, source_table, source_row_id)`. Replaced with partial unique index `idx_hc_sync_log_inflight` constrained to `status IN ('pending','syncing')`, plus a new `supersedes_id` column chaining edit re-syncs. Terminal rows accumulate as the edit audit trail. AC14 unaffected; new pending row coexists with prior `synced` row that is concurrently being tombstoned. Added `'syncing'` to the status CHECK list.
- **Q4 (background body-weight contradiction)** → fixed at lines 37, 86, 240, 286. Overview, Architecture, Performance all converged on foreground-only V1. `READ_HEALTH_DATA_IN_BACKGROUND` explicitly NOT requested in V1 (keeps Play declaration scope minimal). Nightly pull moved to Out-of-scope, deferred to V2 passive-recovery plan.

Remaining execution risk is confined to Slice 0 / Slice 1 verification, especially real-device Health Connect permission flow and the `releaseFdroid` DEX-string gate. Those are now explicit acceptance criteria rather than plan blockers.

### Tech Lead (Feasibility)
**REQUEST CHANGES** — verdict from techlead spike on `react-native-health-connect@3.5.0` against our exact stack (Expo `~55.0.15`, RN `0.83.4`, React `19.2.0`, `minSdkVersion=26`, `compileSdkVersion=36`). The plan is technically achievable, but six concrete blockers and a handful of correction items must land before claudecoder begins.

#### Blockers (must fix before implementation handoff)

**B1. Google Play Health Connect declaration form is a hard release blocker, not mentioned anywhere in the plan.**
The library's own README states: *"If you are planning to release your app on Google Play, you will need to submit a declaration form. Approval can take up to 7 days. Approval does not grant you immediate access — a whitelist must propagate to the Health Connect servers (additional 5–7 business days)."* CableSnap publishes to Play (`build:apk:prod`, signed APK, current `versionCode: 104`). Without an approved declaration, the app will be rejected at Play review or — worse — pulled post-release.
**Fix:** Add an explicit pre-implementation step to the plan: CEO files the Health Connect declaration form (covering each `WRITE_*` and `READ_*` permission used) and we treat it as a critical-path dependency. Estimate +2 weeks before V1 can ship to Play. F-Droid release is unaffected.

**B2. Library version v3.x dropped its bundled Expo config plugin.**
The plan claims a community Expo config plugin exists. Verified against npm: `react-native-health-connect@3.5.0`'s `package.json` has no `app-plugin` entry, no `plugin/` export, and the README's "Expo installation" section now points at a separate, unpublished `expo-health-connect` package (`npm install expo-health-connect` — package does not exist on npm registry). **We must write our own Expo config plugin.** This is straightforward but non-trivial:
- `withAndroidManifest`: add the eight HC permissions, the `<queries>` block for `com.google.android.apps.healthdata`, and the Android-14+ rationale `<intent-filter>` (`android.intent.action.VIEW_PERMISSION_USAGE` with category `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`) on a real `Activity` (cleanest: a no-op `RationaleActivity` we add via `withDangerousMod` writing a Kotlin file under `android/app/src/main/java/.../RationaleActivity.kt`, registered in the manifest).
- `withMainActivity`: inject `import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate` + the `HealthConnectPermissionDelegate.setPermissionDelegate(this)` call inside `onCreate()` — this is REQUIRED by library v2+ for `requestPermission()` to return results; the plan currently omits it entirely. Use sentinel-marker pattern matching `with-wearos-module.js` so the patch is idempotent across reruns of `expo prebuild`.
**Fix:** Add a new `plugins/with-health-connect.js` deliverable to Slice 1 with explicit acceptance criteria for both manifest mutations AND the `MainActivity.kt` Kotlin patch. Reuse the sentinel-marker discipline already proven in `with-wearos-module.js` (markers `// cablesnap:hc:*`, `<!-- cablesnap:hc:* -->`).

**B3. FOSS-variant strategy is wrong in both directions; correct answer is "ship in both, gate at runtime".**
Verified: `react-native-health-connect@3.5.0` declares only these Android implementation deps (`android/build.gradle`):
```
implementation "androidx.health.connect:connect-client:1.1.0-alpha11"
implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"
```
Zero GMS, zero Firebase, zero MLKit transitive pulls. Confirmed `androidx.health.connect.client` is pure AndroidX (sourced from Google's Maven Repo but not GMS — F-Droid Inclusion Criteria allow AndroidX `androidx.*` artifacts). Therefore:
- **Including the dependency in `releaseFdroid` is FOSS-safe.** No need to gate it out. No new `configurations { releaseFdroidImplementation { exclude ... } }` block is required in `with-wearos-module.js`.
- **The Health Connect APK itself (`com.google.android.apps.healthdata`) is a Google Play app**, not on F-Droid. On a pure F-Droid / no-Play device, the APK will not be present, our `<queries>` deep-link CTA points at Play (which the user can install separately or via Aurora/F-Droid alternatives), and the library returns `not_installed`. The "graceful degrade" path the plan already designs handles this exactly.
- **Therefore: do NOT hide the Settings row on FOSS.** Show it; it will degrade to the "Install Health Connect" CTA on devices without the HC APK. This collapses the variant contradiction QD called out (their blocker #1) and removes the proposed conditional-render code path.
- **The androidx HC client itself is `1.1.0-alpha11`** — pin exactly, monitor monthly, document in plan as a known stability risk. The stable line `1.0.0` exists but is missing `deleteRecords(byClientRecordId)` semantics we'll likely need for cascade-delete; alpha is the right tradeoff but must be explicit.
**Fix:** Rewrite the "FOSS variant compatibility" section to: ship the dependency in both variants, no buildType excludes needed, no UI hiding. Add an AC requiring `unzip -l app-releaseFdroid.apk | grep -c '^.*com/google/android/gms/' == 0` AND `grep -c '^.*androidx/health/connect/' > 0` (matches AC10b style from `.plans/PLAN-BLD-716.md`).

**B4. `hc_record_id` columns are insufficient — adopt the `strava_sync_log` table pattern instead.**
QD blocker #2 is correct. Inspecting `lib/db/tables.ts:311–322` shows we already have a proven pattern: `strava_sync_log(id PK, session_id FK, strava_activity_id, status CHECK IN ('pending','synced','failed','permanently_failed'), error, retry_count, created_at, synced_at, UNIQUE(session_id))` plus a status index. This is the right shape for HC writes too because:
- **Multi-record writes**: workouts emit `ExerciseSession` AND optionally `ActiveCaloriesBurned` AND optionally `Power`/`HeartRate` — multiple HC record IDs per logical CableSnap row. A single `hc_record_id` column on `sessions` cannot represent this. Use a JSON `hc_record_ids` column on the sync_log table.
- **Crash safety**: if HC write succeeds and our SQLite UPDATE fails, the next replay needs to know what was already written. The sync_log row written `pending` BEFORE the HC call, then transitioned `synced` AFTER, with the HC IDs persisted, gives correct crash-resume semantics.
- **Determinism / idempotency**: each HC write should also pass `metadata.clientRecordId = <stable CableSnap row UUID>` — the HC client uses this as a uniqueness key and will dedup on retry. The plan's prose currently relies only on the HC server-generated `metadata.id`, which is NOT idempotent across retries.
**Fix:** Replace "add `hc_record_id` column on sessions / food_logs / water_logs" with three new tables (or one polymorphic `health_connect_sync_log`) mirroring the `strava_sync_log` shape, plus pass `clientRecordId = <local row UUID>` on every HC write. Update the migration plan accordingly. Cascade-delete then becomes "look up sync_log row → call `deleteRecords(byClientRecordId)` for each HC type → mark sync_log deleted". Add ACs for replay after crash and for delete-after-revoke (sync_log row stays so a future re-grant can re-write).

**B5. Drop `ActiveCaloriesBurned` from V1.**
Compound problems with shipping it now:
- **Permission omitted**: plan's manifest list lacks `WRITE_ACTIVE_CALORIES_BURNED` (QD's blocker #3). Adding it widens the Play declaration scope and lengthens approval.
- **Estimation accuracy**: MET × volume produces visibly-wrong numbers for short sessions; users will compare against their watch's measured burn and lose trust. The plan's own Risk row admits "Calorie estimate wildly inaccurate → user trust hit" (Likelihood Medium).
- **Downstream consumers do this themselves**: Google Fit and Samsung Health derive an active-calories estimate from the `ExerciseSession` duration + user weight when no explicit `ActiveCaloriesBurned` record exists. Writing our crude estimate clobbers their (better-informed) estimate and surfaces our number in the daily total.
**Fix:** V1 writes `ExerciseSession` only. Defer `ActiveCaloriesBurned` (and `Power`, `HeartRate`) to a future "Recovery V2" plan with HR data. Removes one permission from the declaration form, removes the calorie-estimation helper, removes the multi-record write surface in B4, removes the "0-cal session looks broken" UX risk. Net simplification.

**B6. AC for permission state is too coarse — wire runtime checks into every write.**
The plan's flow assumes the toggle's stored state reflects the real HC permission state. Reality: Health Connect users can revoke any single permission at any time from the system Settings → Health Connect → Permissions screen, with no callback to our app. Pattern that works:
- BEFORE every write call, invoke `getGrantedPermissions()` (library API) and intersect with the permissions required for that record type.
- If a required permission is missing, abort the write, mark the sync_log row `failed` with `error='permission_revoked'`, flip the toggle OFF, and surface the toast.
- Cache `getGrantedPermissions()` result for ≤30s to avoid hot-path JNI thrash if the user logs a flurry of food entries.
**Fix:** Add a `assertWritePermissions(recordTypes: HealthConnectRecordType[])` helper to `lib/health-connect.android.ts` and gate every public write on it. Add AC: "After revoking `WRITE_NUTRITION` in HC system UI without backgrounding CableSnap, the next food log write surfaces the failure toast and flips the Nutrition toggle OFF without writing the record".

#### Corrections (smaller but blocking)

**C1. AC for hydration record granularity.** HC `Hydration` records are per-volume per-time-range (start, end, volume). CableSnap's water log appears to support arbitrary increments. Specify: one HC `Hydration` record per CableSnap `water_logs` row (NOT one per cup). Otherwise editing "8 cups" → "6 cups" requires deleting + rewriting 8 HC records. Add to AC.

**C2. Body-weight prompt active-session guard (QD blocker #4) — concrete fix location.** Wrap the prompt-emit call site in `hooks/useAppForeground` (or wherever the foreground pull lives) with a check against the existing `useSessionStore` "active session" selector. If a session is active OR `useSessionActions.completeSession` ran within the last 5 minutes, defer the prompt to a queue keyed by HC record ID and drain on the next foreground transition that occurs outside session context. AC: "Prompt does not appear during an in-progress session; appears on next foreground after session is fully closed".

**C3. Sentry breadcrumb sanitisation (QD blocker #6) — explicit allowlist.** Specify the schema of allowed breadcrumb fields: `{ operation: 'write_workout' | 'write_nutrition' | 'write_hydration' | 'read_weight' | 'request_permission' | 'delete_record', errorCategory: 'permission_revoked' | 'not_installed' | 'sdk_exception' | 'unknown', errorCode?: string }`. Forbid: any HC record values, source app names, timestamps, record IDs, meal contents, weight deltas, user package names. Wrap the wrapper in a redaction unit test.

**C4. Plugin chain ordering.** The new `with-health-connect.js` plugin touches `AndroidManifest.xml` (queries + permissions + intent-filter on a new RationaleActivity) and `MainActivity.kt`. Existing plugins touch: `with-form-clips-backup` → `data_extraction_rules.xml` / `full_backup_content.xml`; `with-wearos-module` → `settings.gradle` / `app/build.gradle` / FOSS manifest strip; `with-release-signing` → `app/build.gradle` signing config; sentry → gradle build. **No collisions** — the manifest sections HC touches (permissions, queries, application/activity) are disjoint from what `with-wearos-module` and `with-form-clips-backup` mutate. Place the plugin between `with-form-clips-backup` and the Sentry plugin in `app.config.ts`. Add a sentinel-marker check + a one-line note in the plugin header documenting the ordering constraint.

**C5. Slice plan needs a real spike.** "Library evaluation spike + Expo plugin scaffold + Settings shell + iOS/web no-op stubs" mixes a throwaway spike with shipped code. Restructure to:
- **Slice 0 (techlead, throwaway)**: prebuild a branch with `react-native-health-connect` added, run `expo prebuild --platform android --clean`, run `./gradlew :app:assembleRelease`, run `./gradlew :app:assembleReleaseFdroid`, grep the resulting APKs for `androidx/health/connect/*` (must be present in both) and `com/google/android/gms/*` (must be absent in releaseFdroid). Discard the branch. Output: a comment on this issue with grep counts and any AGP/Kotlin compile errors.
- **Slice 1 (claudecoder)**: `plugins/with-health-connect.js` + manifest entries + `RationaleActivity.kt` + `MainActivity.kt` patch + `lib/health-connect.ts` + `lib/health-connect.android.ts` skeleton + iOS/web stubs + Settings row shell + the `health_connect_sync_log` table migration.
- **Slice 2 (claudecoder)**: Read body weight (permission flow, prompt sheet w/ active-session guard, auto-import toggle, dedup state, foreground throttle).
- **Slice 3 (claudecoder)**: Write workouts (`ExerciseSession` only — no `ActiveCaloriesBurned`), completion-hook integration, sync_log writes, cascade delete via `clientRecordId`.
- **Slice 4 (claudecoder)**: Write nutrition + hydration with edit/delete cascade.
- **Slice 5 (techlead)**: README + help screen + FOSS APK grep verification + Play declaration form filing reminder + manual end-to-end QA on the owner's Z Fold6.

**C6. AC11 verification command.** Replace prose "verified with `fdroid-foss-build` skill" with the literal grep gate, mirroring `.plans/PLAN-BLD-716.md` AC10b:
```
unzip -l android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk | grep -c 'com/google/android/gms/' == 0
unzip -l android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk | grep -c 'androidx/health/connect/' > 0
```
This is grep-able in CI and unambiguous.

#### Non-blocking notes

- **Compile/target SDK**: HC client `1.1.0-alpha11` requires `compileSdk >= 34`. We're on 36 ✓. `targetSdk 35` is fine — Android 14 framework HC integration triggers at `targetSdk 34+`, so we're past the threshold.
- **New Architecture compatibility**: library README claims "Supports both old and new architecture". We don't yet flip on Fabric, so old-arch path is exercised. No action needed.
- **APK size impact**: ~120KB claim is plausible for the JS bridge; the heavier weight is `androidx.health.connect:connect-client` (≈800KB unstripped, gets dexed/optimized down to ≈250KB after R8). Acceptable for both Play and FOSS variants but worth noting in the PR description.
- **Test strategy**: HC requires a real device with the HC APK installed. Unit-test the pure helpers (sync_log state machine, breadcrumb sanitiser, prompt dedup, permission allowlist) at AC9; wrap the JNI-bound `lib/health-connect.android.ts` exports in a minimal interface so tests can swap the native module with a fake. Manual E2E on owner's Z Fold6 is the AC for end-to-end. CI cannot exercise the real native path.

#### Verdict

**REQUEST CHANGES.** Address B1–B6 + C1–C6, re-publish the plan with the revised slice plan, and ping me again for re-review. Estimated re-review turnaround: same-day. Once green, I'll hand Slice 1 to claudecoder.


### Psychologist (Behavior-Design)
_N/A — Classification = NO. No behavioural triggers introduced (no nudges, streaks, reminders, motivational copy, identity framing, or rewards). User-initiated, opt-in per data type, off by default._

### CEO Decision

**rev2 PROCEED PENDING RE-REVIEW.** Plan rewritten 2026-05-12T19:5x to address all six techlead blockers (B1–B6) and six corrections (C1–C6). Since techlead's blocker set subsumes QD's, addressing techlead's also addresses QD's:

| Issue | Resolution in rev2 |
|---|---|
| B1 / Play declaration | New "Pre-Implementation Critical Path" section; CEO files form during Slice 0; Slice 5 Play submission gated on approval; F-Droid unaffected. |
| B2 / Custom Expo plugin | Technical Approach now specifies `plugins/with-health-connect.js` with three jobs (`withAndroidManifest`, `withDangerousMod` for `RationaleActivity.kt`, `withMainActivity` for `setPermissionDelegate`). Sentinel-marker discipline matches `with-wearos-module.js`. New Slice 1 deliverable. |
| B3 / FOSS variant | Ship HC dep in BOTH variants. No `releaseFdroidImplementation { exclude … }` block. UI gate on `Platform.OS === 'android' && library.isAvailable()` ONLY — never on build flavor. AC1 + AC11 reflect this. |
| B4 / sync_log table | `hc_record_id` columns dropped; `health_connect_sync_log` table mirroring `strava_sync_log` shape introduced. `clientRecordId = sync_log.id` passed on every HC write for server-side dedup. AC5/AC6/AC7/AC12/AC14 cover the state machine. |
| B5 / Drop ActiveCaloriesBurned | Removed from V1 scope, permission list, AC5, and risk row. Deferred to "Recovery V2". |
| B6 / Runtime permission gate | `assertWritePermissions` helper specified with 30s `getGrantedPermissions` cache; AC8 explicitly verifies revoke-without-background flow. |
| C1 hydration granularity | One HC `Hydration` per `water_logs` row — captured in Scope, AC14, edge case. |
| C2 active-session prompt guard | Captured in UX Design (Body weight import prompt) + AC16. |
| C3 Sentry allowlist | Explicit allowlist schema in Privacy section + AC9b snapshot test. |
| C4 plugin chain ordering | Documented in Technical Approach (between `with-form-clips-backup` and Sentry). |
| C5 slice restructure | Implementation Slices section rewritten as Slice 0–5 with techlead spike as hard gate. |
| C6 AC11 grep gate | AC11 replaced with literal `unzip + grep -c` commands matching `.plans/PLAN-BLD-716.md` AC10b style. |
| QD #5 ACs | AC12 (crash safety), AC13 (mid-write revoke), AC14 (edit re-sync), AC17 (CSV backfill cutoff) added. |
| Per-permission rationale copy (QD non-blocking) | Captured in Risks mitigation row. |

**Re-review requested from @quality-director and @techlead.**
