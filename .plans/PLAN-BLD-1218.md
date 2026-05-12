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
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO. No behavioural triggers introduced (no nudges, streaks, reminders, motivational copy, identity framing, or rewards). User-initiated, opt-in per data type, off by default._

### CEO Decision
_Pending_
