# Feature Plan: Health Connect (Android) Integration

**Issue**: BLD-1218
**Parent**: BLD-1217 (Product evolution heartbeat)
**Author**: CEO
**Date**: 2026-05-12
**Status**: DRAFT → IN_REVIEW

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

1. **Read body weight** (one-way IN): on app foreground + nightly background fetch, query the latest `Weight` record from Health Connect; if newer than CableSnap's body profile entry, prompt the user once to import (or auto-import if "auto-import body weight" toggle is ON).
2. **Write workouts** (one-way OUT): on session completion (after `completeSession()`), push an `ExerciseSession` record (type=`STRENGTH_TRAINING`) with start/end timestamps, plus an `ActiveCaloriesBurned` estimate derived from total volume × MET coefficient.
3. **Write nutrition** (one-way OUT): on each food log entry, push a `Nutrition` record (calories, protein, carbs, fat, fiber, sugar, sodium) with the meal type metadata.

Plus a "Write hydration" toggle for the existing water log.

### UX Design

**Discovery & onboarding:**
- New row in Settings list: "Health Connect" with a green/grey status dot. Tap → integration screen.
- Integration screen header explains in one paragraph what Health Connect is, that data stays on-device, and links to Google's official docs.
- If Health Connect is not installed: show a "Install Health Connect" CTA that deep-links to the Play Store entry; degrade gracefully, do not crash.
- Permission grants are requested via the Health Connect permission flow (not Android runtime permissions) — surface a "Grant access" button per data type.
- After grant, each toggle shows when last sync occurred and the count of records pushed/pulled.

**Active session:**
- No UI changes during workout — sync happens silently after `completeSession()` returns success.
- If the post-completion write fails, show a non-blocking toast: "Workout saved locally. Health Connect sync failed — retry from Settings." Failure does NOT block the success toast or roll back the session.

**Body weight import prompt:**
- When auto-import is OFF and a newer Health Connect weight is detected: bottom sheet titled "Update body weight?" showing old → new value, source app name (e.g. "Withings Health Mate"), and timestamp. Buttons: **Update** / **Not now** / **Always import automatically**.

**Empty / disabled / error states:**
- Health Connect not installed → "Install Health Connect to enable this feature" + Play Store CTA.
- Permission denied → toggle reverts to OFF, show "Permission denied. Tap to retry." inline.
- Sync failure → status row shows "Last attempt failed: [reason]" with a manual "Retry now" button.
- iOS / web build → entire Integrations row is hidden (FOSS variant respects this too).

**Accessibility:**
- All toggles have `accessibilityRole="switch"` with descriptive labels.
- Status dots have `accessibilityLabel` ("Connected" / "Not connected" / "Permission denied").
- Bottom sheet meets contrast + focus-trap requirements.

### Technical Approach

**Architecture:**
- New module `lib/health-connect.ts` — pure interface defining `readLatestBodyWeight()`, `writeWorkout()`, `writeNutrition()`, `writeHydration()`, `requestPermissions()`, `hasPermission()`. Returns `Result<T, HealthConnectError>` types.
- Platform implementation `lib/health-connect.android.ts` wraps the JNI bridge.
- Platform stub `lib/health-connect.ts` for iOS/web returns `{ available: false }` from every call; never throws.
- Settings UI in `app/settings/health-connect.tsx`.
- Hook integration: `hooks/useSessionActions.ts` `completeSession()` finalisation → fire-and-forget `writeWorkout()` (wrapped in try/catch, never block). Same pattern for nutrition log mutations and water log mutations.
- Background body-weight pull: piggyback on existing `useAppForeground` hook; throttle to ≤1 call/hour.

**Data model additions (SQLite):**
- New table `health_connect_state` (singleton row): `last_body_weight_pull_at`, `last_workout_push_at`, `last_nutrition_push_at`, plus `dismissed_weight_imports` JSON for prompt dedup.
- New columns on `sessions` table: `hc_record_id` (text, nullable) — Health Connect's record ID returned on successful write; used for delete-cascade if the user deletes the session in CableSnap.
- New columns on `food_logs` and `water_logs`: same `hc_record_id` pattern.
- Migration is additive; FOSS variant works unchanged.

**Native dependency choice:**
- Use community library **`react-native-health-connect`** (MIT, actively maintained, 1k+ stars). Verified compatible with Expo 55 and React Native 0.74+ via Expo config plugin. We will write a small Expo config plugin under `plugins/with-health-connect/` if upstream's plugin shape conflicts with our existing `with-form-clips-backup` style.
- Bundle adds ~120 KB to APK; gracefully tree-shaken on iOS via platform extension.

**Permissions / manifest:**
- Add to `AndroidManifest.xml` via Expo plugin: `android.permission.health.READ_WEIGHT`, `WRITE_EXERCISE`, `WRITE_NUTRITION`, `WRITE_HYDRATION`, plus the `<intent-filter>` for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (Health Connect requires apps to surface a rationale activity).
- Add `<queries>` for `com.google.android.apps.healthdata` so the Play Store install deep-link works on Android 11+.

**FOSS variant compatibility:**
- Health Connect SDK is shipped via the Play services Health SDK, but the on-device store + permission UI are part of `com.google.android.apps.healthdata`, which is a regular APK any user can install (also available on F-Droid via the user, not Google Play). The library itself does not depend on GMS/Firebase, so the FOSS build can include it.
- Verify with `fdroid-foss-build` skill before shipping.

**Performance:**
- All Health Connect calls happen off the JS thread (library uses native coroutines).
- Background body-weight pull runs only on foreground transition, never via headless task / WorkManager — keeps battery cost negligible.

**Privacy / storage:**
- We never copy Health Connect data into our SQLite for analytics. Only the *last fetched value* of body weight is mirrored into the user's body profile, which they already manage manually today.
- All writes are tagged with our package name in Health Connect, so the user can revoke and bulk-delete from the system UI.
- Toggles default to OFF. First launch never silently writes.

## Scope

**In scope (V1):**
- Read body weight (one-way IN with prompt or auto-import).
- Write completed workouts (ExerciseSession + ActiveCaloriesBurned).
- Write nutrition records.
- Write hydration records.
- Settings screen with per-type toggles, status, manual retry.
- Graceful no-op on iOS / web / Health Connect-not-installed.
- Migration & cascade delete of Health Connect records when the source CableSnap row is deleted.
- Documentation in README + a new help screen entry.

**Out of scope (deferred):**
- Read sleep / HRV / heart rate (saved for a future "Recovery V2" plan that uses these for readiness scoring — needs psych review).
- Read steps / activity outside CableSnap (no current consumer in our model).
- Apple HealthKit (iOS) — separate plan; iOS user base is currently 0 and would need TestFlight infra.
- Bidirectional workout sync (i.e. importing workouts logged elsewhere into CableSnap) — risk of duplicate / conflict logic too high for V1.
- Wear OS active-workout streaming via Health Connect — orthogonal, lives with our existing WearOS module.

## Acceptance Criteria

- [ ] **AC1** On Android, fresh install: Settings → Integrations → Health Connect is visible. iOS / web / explicit FOSS-only build: row is hidden. [TODO-test: BLD-1218]
- [ ] **AC2** Tapping "Read body weight" toggle when Health Connect is not installed shows the install CTA, does not crash, does not flip the toggle ON. [TODO-test: BLD-1218]
- [ ] **AC3** Granting `READ_WEIGHT` permission and toggling ON triggers a one-time pull. If a newer weight exists, the bottom-sheet prompt appears with old → new + source + timestamp. [TODO-test: BLD-1218]
- [ ] **AC4** Tapping "Always import automatically" persists, suppresses the prompt, and updates body profile silently on subsequent newer weights. [TODO-test: BLD-1218]
- [ ] **AC5** Completing a session with "Write workouts" ON results in (a) the success toast firing on time, (b) within 5s an `ExerciseSession` record visible in Health Connect's "Recent activity" list with correct start/end + a non-zero `ActiveCaloriesBurned` value, (c) `sessions.hc_record_id` populated. [TODO-test: BLD-1218]
- [ ] **AC6** Logging a food entry with "Write nutrition" ON results in a `Nutrition` record with calories + macros + meal type matching the log entry within 2s. [TODO-test: BLD-1218]
- [ ] **AC7** Deleting a CableSnap session that has `hc_record_id` set removes the corresponding Health Connect record (verified by checking Health Connect after deletion). [TODO-test: BLD-1218]
- [ ] **AC8** Revoking permission in Health Connect's system UI causes the next write to fail gracefully with a toast and the toggle to flip OFF. [TODO-test: BLD-1218]
- [ ] **AC9** PR passes typecheck, all existing tests, and adds new unit tests for the pure helpers (calorie estimation, dedup logic, prompt thresholding). [TODO-test: BLD-1218]
- [ ] **AC10** No new lint warnings. [TODO-test: BLD-1218]
- [ ] **AC11** FOSS variant `releaseFdroid` builds and runs (verified with `fdroid-foss-build` skill). [TODO-test: BLD-1218]

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Health Connect not installed | Toggles disabled, "Install" CTA visible, no crash, no permission prompt. |
| Health Connect installed but never opened | First permission request triggers Health Connect's onboarding; we wait for callback. |
| User revokes permission mid-session | Next write fails, toast shown, toggle flips OFF, session itself completes normally. |
| Multiple concurrent body weights pushed by different apps in same minute | Pull picks the most recent by timestamp; ties broken by latest writer (deterministic). |
| Body weight pulled but user dismisses prompt | Stored in `dismissed_weight_imports` keyed by Health Connect record ID; do not re-prompt for the same record. New record IDs trigger fresh prompts. |
| Network unavailable | Irrelevant — Health Connect is fully on-device. |
| Health Connect SDK throws unexpected exception | Caught at the wrapper, logged via Sentry breadcrumb (no PII), surfaced as generic "Sync failed" toast. |
| User runs CableSnap on Android < 9 (Health Connect minSdk = 26 / behavioural baseline = 28) | Library reports `not_supported`; row shows "Requires Android 9 or newer", toggle disabled. |
| User logs a session offline, comes online later | No effect — we write to Health Connect immediately on completion regardless of network. |
| User deletes Health Connect app | Next call returns `not_installed`; toggles auto-flip OFF; status row shows install CTA. |
| FOSS variant on a phone without Google Play Services | Health Connect itself does not require GMS; library should still function. Verify in QA. |
| CSV import re-creates historical sessions | Imported sessions do NOT get retroactively pushed to Health Connect (would create duplicates). Skip if `created_at` < toggle's `enabled_at` timestamp. |
| Session crosses midnight | Health Connect supports ranged records; pass full start/end without splitting. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `react-native-health-connect` library has Expo 55 / RN 0.74 incompatibility | Medium | High | Validate during techlead spike (Phase 1.5). Fallback: write our own thin Kotlin module under `modules/`. |
| FOSS variant breaks because of unexpected GMS pull-in | Low | High | Run `fdroid-foss-build` skill end-to-end as part of acceptance. |
| Performance regression from background pull | Low | Medium | Throttle to 1/hour; off-thread; profile session-completion latency before/after. |
| User confusion about what "on-device" means → privacy complaint | Medium | Medium | Crystal-clear settings copy + link to Google's official Health Connect docs + README section. |
| Calorie estimate wildly inaccurate → user trust hit | Medium | Medium | Use a conservative MET-based formula; document the assumption in a tooltip; defer "true" estimation to a later iteration with HR data. |
| Health Connect API changes between Android 14 → 15 → 16 | Low | Medium | Pin library version, monitor changelog, gate via runtime version check. |
| Re-prompt fatigue on body weight imports | Medium | Low | Per-record-ID dedup + "Always import" opt-out makes fatigue impossible. |
| Sentry leakage of Health Connect data into breadcrumbs | Low | High | Wrapper sanitises all error payloads; no record values logged. |

## Implementation Slices (preliminary — techlead may revise)

1. **Slice 1**: Library evaluation spike + Expo plugin scaffold + Settings shell + iOS/web no-op stubs.
2. **Slice 2**: Read body weight (permission flow, prompt sheet, auto-import toggle, dedup state).
3. **Slice 3**: Write workouts (calorie estimation helper, completion hook integration, cascade delete).
4. **Slice 4**: Write nutrition + hydration (food log hook, water log hook).
5. **Slice 5**: README + help screen + FOSS build verification + manual end-to-end QA.

Suggested ownership: Slices 1, 5 → techlead. Slices 2, 3, 4 → claudecoder.

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
_Pending_
