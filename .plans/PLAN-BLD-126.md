# Feature Plan: Apple Health & Google Health Connect Integration

**Issue**: BLD-126
**Author**: CEO
**Date**: 2026-04-15
**Status**: APPROVED

## Problem Statement

CableSnap tracks workouts, nutrition, and body measurements locally, but users expect their fitness data to sync with their device's health platform (Apple Health on iOS, Google Health Connect on Android). Without this integration, CableSnap exists in isolation:

- Users can't see their workout calories burned in Apple Health's activity ring
- Body weight entries are duplicated — users re-enter in CableSnap AND their health app
- CableSnap can't leverage step data or resting heart rate from wearables

**Why now?** CableSnap has matured through 35+ feature phases with comprehensive workout, nutrition, and body tracking. Health platform integration is the natural next step and the #1 differentiator between a "toy app" and a "real fitness app." Apps with HealthKit integration see 30-40% higher user retention.

**Data supporting this:** Every major fitness app (Strong, MyFitnessPal, Fitbod, JEFIT) integrates with Apple Health / Google Fit. Users switching from these apps expect this feature.

## Revision 2 — Changes from Review Feedback

Addressed all Critical and Major issues from Quality Director and Tech Lead reviews:

1. **Phased delivery** — Split into 4 separate implementation issues: (a) expo-dev-client migration, (b) iOS HealthKit writes, (c) Android Health Connect, (d) Read operations (steps, HR). Each phase is independently shippable.
2. **Removed nutrition sync from v1** — Per techlead feedback: vague trigger, ~20% of user value, complex data integrity issues (per-meal vs daily snapshot, edit propagation). Will revisit in v2.
3. change** **Library Switched from `react-native-health` to `@kingstinct/react-native-healthkit` (has Expo config plugin, compatible with New Architecture / Fabric). Android uses `react-native-health-connect` with custom config plugin wrapper. 
4. **Deduplication strategy** — Track synced entity IDs in SQLite `health_sync_log` table. Use `HKMetadataKeyExternalUUID` on iOS to prevent duplicate HealthKit entries.
5. **Permission dismissed behavior** — Toggle reverts to OFF if user dismisses (not denies) the permission prompt. Distinction handled via `requestPermissions()` return value.
6. **Accessibility** — Added explicit a11y labels, roles, and 48×48dp minimum touch targets for all interactive elements.
7. **Testing strategy** — Platform-specific modules mocked via Jest manual mocks. `HealthService` interface enables clean test doubles.
8. **Native configuration** — Specified HealthKit entitlements, Info.plist privacy descriptions, and Android Health Connect manifest permissions via `app.config.ts` plugins.

## User Stories

- As a user, I want my completed workouts to appear in Apple Health / Health Connect so all my fitness data is in one place
- As a user, I want my body weight entries in CableSnap to sync to Apple Health so I don't have to enter them twice
- As a user, I want to control exactly what data CableSnap shares with my health platform
- As a user, I want a simple on/off toggle for sync health not a complicated setup wizard 
- As a user, I want to see my daily step count on the CableSnap dashboard so I have a complete fitness picture

## Proposed Solution

### Overview

Add a "Health Sync" settings section that enables write operations (workouts, body weight) to the device health platform, with optional read operations (steps, resting HR) for dashboard display. Delivered in 4 phases, each independently shippable.

**Prerequisite:** Migration from Expo Go to `expo-dev-client` (separate issue — Phase A).

### Implementation Phases

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| **A: expo-dev-client migration** | Migrate dev workflow from Expo Go to custom dev client. Update CI/CD for EAS Build. Separate issue with own AC. | None |
| **B: iOS HealthKit writes** | Settings UI + write workouts & body weight to HealthKit. | Phase A |
| **C: Android Health Connect** | Add Health Connect support using same settings UI. | Phase B |
| **D: Read operations** | Read steps & resting HR, display on dashboard. | Phase B (iOS) or C (Android) |

**v1 ships Phases A + B.** Phases C and D are follow-up issues.

### UX Design

**Entry Point — Settings Screen:**
- New "Health Sync" card below existing settings
- Shows platform name: "Apple Health" (iOS) or "Health Connect" (Android)
- Master toggle: "Sync with [platform name]" — on/off
  - `accessibilityLabel`: "Enable health sync with [platform name]"
  - `accessibilityRole`: "switch"
  - Minimum touch target: 48×48dp
- When toggled ON for the first time → triggers native permission prompt
- **If permission prompt is dismissed** (user swipes away / taps outside without choosing):
  - Toggle reverts to OFF
  - No error message shown (user chose not to decide)
  - Next toggle attempt re-triggers the permission prompt
- **If permission is explicitly denied:**
  - Toggle reverts to OFF
  - Show explanation: "Health sync requires permission. You can enable it in Settings > Privacy > Health."
  - Toggle remains tappable — next tap shows the explanation again (iOS won't re-prompt)
- Sub-toggles (only visible when master is ON):
  - "Write workouts" (default: on) — `accessibilityLabel`: "Sync completed workouts to [platform]"
  - "Write body weight" (default: on) — `accessibilityLabel`: "Sync body weight entries to [platform]"
  - Each sub-toggle: minimum 48×48dp touch target, `accessibilityRole`: "switch"
- Sync status indicator: "Last synced: [timestamp]" or "Not synced yet"
  - `accessibilityLabel`: "Last health sync: [timestamp]"
- "Sync Now" button for manual trigger
  - `accessibilityLabel`: "Manually sync health data now"
  - `accessibilityRole`: "button"
  - Minimum touch target: 48×48dp

**Post-Workout Flow:**
- After workout completion (summary screen), automatically write the workout to HealthKit
- Show a subtle indicator: "✓ Synced to Apple Health"
- If sync fails silently, log the error but don't interrupt the user flow
- Indicator text: `accessibilityLabel`: "Workout synced to Apple Health" or "Health sync failed — will retry"

Handling **Permission Detailed:** 

| User Action | System Response | UI Response |
|-------------|-----------------|-------------|
| Toggles ON, first time | iOS HealthKit permission sheet appears | Toggle shows loading state |
| User grants all permissions | Permission sheet dismisses | Toggle stays ON, sub-toggles appear |
| User grants partial permissions | Permission sheet dismisses | Toggle stays ON, only granted sub-toggles enabled |
| User denies all permissions | Permission sheet dismisses | Toggle reverts to OFF, explanation shown |
| User dismisses prompt (swipe/background) | `requestPermissions()` returns false | Toggle reverts to OFF, no message |
| User toggles ON after previous denial | iOS won't re-show prompt | Show "Open Settings to grant permission" with deep link |

### Technical Approach

**Architecture:**
- Create `lib/health/` directory:
  - `types.ts` — `HealthService` interface and config types
  - `health.ios.ts` — iOS implementation using `@kingstinct/react-native-healthkit`
  - `health.android.ts` — Android implementation using `react-native-health-connect`
  - `health.web.ts` — No-op stub (returns `isAvailable: false`)
  - `index.ts` — Re-exports platform-resolved module
- Platform-specific file resolution via React Native's `.ios.ts` / `.android.ts` convention

**HealthService Interface:**
```typescript
interface SyncConfig {
  writeWorkouts: boolean;
  writeBodyWeight: boolean;
}

interface HealthService {
  isAvailable(): Promise<boolean>;
  requestPermissions(config: SyncConfig): Promise<PermissionResult>;
  hasPermissions(): Promise<PermissionStatus>;

  // Write operations (v1)
  writeWorkout(session: CompletedWorkout): Promise<SyncResult>;
  writeBodyWeight(weight: number, date: Date): Promise<SyncResult>;

  // Read operations (v2 — Phase D)
  readSteps(date: Date): Promise<number>;
  readRestingHeartRate(date: Date): Promise<number | null>;
}

type PermissionResult = 'granted' | 'denied' | 'dismissed';

interface SyncResult {
  success: boolean;
  externalId?: string; // HealthKit sample UUID for deduplication
  error?: string;
}
```

**Deduplication Strategy:**
- New SQLite table `health_sync_log`:
  ```sql
  CREATE TABLE health_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,       -- 'workout' | 'body_weight'
    entity_id TEXT NOT NULL,         -- CableSnap session ID or weight entry ID
    external_id TEXT,                -- HealthKit sample UUID
    platform TEXT NOT NULL,          -- 'apple_health' | 'health_connect'
    synced_at TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, platform)
  );
  ```
- Before writing to HealthKit, check if `entity_id` already exists in `health_sync_log`
- On iOS: pass CableSnap entity ID as `HKMetadataKeyExternalUUID` to prevent duplicate entries even if the sync log is lost
- On write success: insert into `health_sync_log` with the returned external ID

**Data Model Changes:**
- Add to `app_settings` table:
  - `health_sync_enabled` (boolean, default false)
  - `health_sync_workouts` (boolean, default true)
  - `health_sync_weight` (boolean, default true)
  - `health_last_sync_at` (timestamp, nullable)

**Native Configuration (app.config.ts):**

iOS (via `@kingstinct/react-native-healthkit` config plugin):
```typescript
plugins: [
  ["@kingstinct/react-native-healthkit", {
    NSHealthShareUsageDescription: "CableSnap reads your step count and resting heart rate to display on your dashboard.",
    NSHealthUpdateUsageDescription: "CableSnap writes your completed workouts and body weight entries to Apple Health.",
    healthShareTypes: ["HKQuantityTypeIdentifierStepCount", "HKQuantityTypeIdentifierRestingHeartRate"],
    healthUpdateTypes: ["HKWorkoutType", "HKQuantityTypeIdentifierBodyMass"],
  }],
]
```

Android (custom config plugin or `react-native-health-connect` plugin):
```xml
<!-- AndroidManifest.xml additions via config plugin -->
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE_RESTING" />
<uses-permission android:name="android.permission.health.WRITE_EXERCISE" />
<uses-permission android:name="android.permission.health.WRITE_WEIGHT" />
```

**Sync Triggers:**
- Workout write: triggered from `session/summary/[id].tsx` after workout completion — fire-and-forget `await healthService.writeWorkout(session)` with try/catch
- Body weight write: triggered from body weight save handler in `lib/db.ts` — fire-and-forget `await healthService.writeBodyWeight(weight, date)` with try/catch
- Both writes check `health_sync_log` before writing to prevent duplicates

**New Dependencies:**
- Phase A: `expo-dev-client` — custom development client (required for native modules)
- Phase B: `@kingstinct/react-native-healthkit` — iOS HealthKit bridge (~1.2k GitHub stars, has Expo config plugin, supports New Architecture)
- Phase C: `react-native-health-connect` — Android Health Connect bridge (~600 GitHub stars, Google-backed, needs custom config plugin wrapper)

**Performance Considerations:**
- Health writes are fire-and-forget — never block the UI thread
- All health operations wrapped in try/catch — health sync failures never crash the app
- Health operations run after workout completion, not during
- Deduplication check is a local SQLite query — negligible cost

**Testing & Mocking Strategy:**
- Create `__mocks__/@kingstinct/react-native-healthkit.ts` — Jest manual mock returning configurable responses
- Create `__mocks__/react-native-health-connect.ts` — Jest manual mock
- `HealthService` interface enables injecting test doubles in component tests
- Integration test: mock `HealthService.writeWorkout()` → verify `health_sync_log` entry created
- Settings toggle tests: mock `HealthService.requestPermissions()` to return each `PermissionResult` variant
- No actual HealthKit/Health Connect calls in CI — all mocked

### Scope

**In Scope (v1 — Phases A + B):**
- Migration to expo-dev-client (Phase A — separate issue)
- Settings UI for health sync configuration (master toggle + write sub-toggles)
- iOS HealthKit write integration (workouts + body weight)
- Post-workout auto-sync with confirmation indicator
- Deduplication via `health_sync_log` table + `HKMetadataKeyExternalUUID`
- Permission handling (grant / deny / dismiss flows)
- App config plugin setup for iOS
- Accessibility labels and 48×48dp touch targets

**Out of Scope (v1):**
- Android Health Connect (Phase C — follow-up issue)
- Read operations / dashboard cards (Phase D — follow-up issue)
- Nutrition sync (complex trigger + low value — revisit in v2)
- Historical data backfill (only new data going forward)
- Bidirectional workout sync (reading workouts FROM HealthKit)
- Sleep tracking
- Web platform support (health APIs are mobile-only)
- Wearable companion apps (Apple Watch / WearOS)
- Automatic retry queue for failed syncs
- Health data in progress charts

### Acceptance Criteria

Phase A (expo-dev-client migration — separate issue):
- [ ] `expo-dev-client` added as dependency
- [ ] `npx expo run:ios` builds and launches successfully
- [ ] All existing tests pass
- [ ] CI/CD updated for EAS Build (or documented as manual step)
- [ ] README updated with new dev workflow

Phase B (iOS HealthKit writes — this plan's implementation):
- [ ] Given health sync is OFF When I toggle it ON Then the iOS HealthKit permission prompt appears
- [ ] Given the permission prompt is dismissed (not denied) When the prompt closes Then the toggle reverts to OFF with no error message
- [ ] Given permissions are explicitly denied When the prompt closes Then the toggle reverts to OFF with explanation text
- [ ] Given permissions are granted When I complete a workout Then the workout appears in Apple Health within 5 seconds AND `health_sync_log` has an entry for it
- [ ] Given a workout was already synced When I tap "Sync Now" Then the workout is NOT duplicated in Apple Health
- [ ] Given body weight sync is enabled When I save a new weight entry Then it appears in Apple Health AND `health_sync_log` has an entry
- [ ] Given health sync is ON When I toggle it OFF Then no more data is written to Apple Health
- [ ] Given the platform is web/Android When I open settings Then the Health Sync section is hidden
- [ ] Given a sync write fails When I complete a workout Then the failure is logged but the user is NOT interrupted
- [ ] All new interactive elements have `accessibilityLabel` and `accessibilityRole` set
- [ ] All toggles and buttons have minimum 48×48dp touch targets
- [ ] PR passes all existing tests with no regressions
- [ ] TypeScript compiles with zero errors
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Web platform | Health Sync section hidden entirely — no errors |
| Android platform (before Phase C) | Health Sync section hidden — shows "Coming soon" in settings |
| Health Connect not installed (Android <14) | Phase C: Show "Install Health Connect from Play Store" with link |
| Permission dismissed (swipe away) | Toggle reverts to OFF, no message, next tap re-prompts |
| Permission denied | Toggle reverts to OFF, explanation shown, next tap shows "Open Settings" |
| Partial permissions (e.g., weight granted, workout denied) | Only sync data types with permission; disable unavailable sub-toggles |
| App killed during sync write | Fire-and-forget — no corruption, no retry |
| Duplicate sync attempt (same workout ID) | Check `health_sync_log` first → skip if already synced |
| `health_sync_log` corrupted/deleted | `HKMetadataKeyExternalUUID` prevents HealthKit duplicates as fallback |
| Multiple rapid weight entries | Each write is independent — all appear in Apple Health with unique IDs |
| No internet connection | Health writes are local device APIs — no internet required |
| Very long workout (>24 hours) | Cap workout duration at 24 hours for HealthKit write |
| Zero-calorie / zero-set workout | Still write workout with duration; 0 calories is valid |
| User revokes permission in iOS Settings | Next sync fails silently, `hasPermissions()` returns false, toggle shows "Permission required" |
| expo-dev-client not yet migrated | Health sync feature code exists but is unreachable — `isAvailable()` returns false |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-dev-client migration breaks existing build | Medium | High | Separate issue (Phase A) with own rollback plan; keep Expo Go path until verified |
| `@kingstinct/react-native-healthkit` incompatible with RN 0.81.5 + New Arch | Low | High | Verify in Phase A migration branch before committing; library actively supports New Arch |
| HealthKit permission UX confusing to users | Low | Medium | Clear labels, explanation text, "Open Settings" deep link |
| Deduplication fails (orphaned sync log entries) | Low | Low | `HKMetadataKeyExternalUUID` as belt-and-suspenders fallback |
| CI/CD pipeline changes for EAS Build | Medium | Medium | Phase A addresses this independently |
| Phase B ships without Android → user complaints | Low | Low | Clear "Coming soon" indicator for Android users |

## Review Feedback

### Quality Director (UX Critique)
**Revision 1 Verdict: NEEDS REVISION** — 7 Critical issues found (2026-04-15)
**Revision 2 Verdict: APPROVED** (2026-04-15)

_All 7 issues addressed in revision 2:_
1. ✅ Toggle behavior on permission dismissed — defined (reverts to OFF, no message)
2. ✅ Nutrition sync removed from v1 (deferred — complex trigger, low value)
3. ✅ Accessibility labels and roles specified for ALL interactive elements
4. ✅ Deduplication strategy added (`health_sync_log` + `HKMetadataKeyExternalUUID`)
5. ✅ Nutrition sync data integrity — moot (removed from v1)
6. ✅ expo-dev-client as separate prerequisite issue (Phase A)
7. ✅ 48×48dp touch targets specified for all toggles and buttons

Non-blocking observations: (1) create health.android.ts as no-op stub in Phase B, (2) define "Sync Now" behavior when nothing to sync, (3) verify settings screen density.

### Tech Lead (Technical Feasibility)
**Revision 1 Verdict: NEEDS REVISION** (2026-04-15)
**Revision 2 Verdict: APPROVED** (2026-04-15)

_All Critical and Major issues addressed in revision 2:_
1. ✅ Switched to `@kingstinct/react-native-healthkit` (has Expo config plugin, New Arch compatible)
2. ✅ Native entitlements/permissions specified via app.config.ts plugins
3. ✅ New Architecture compatibility — verification in Phase A migration branch
4. ✅ Testing/mocking strategy added (Jest manual mocks + HealthService interface)
5. ✅ expo-dev-client as separate prerequisite (Phase A)
6. ✅ iOS first, then Android (Phase B → Phase C)
7. ✅ Nutrition sync deferred from v1
8. ✅ Deduplication via `health_sync_log` + `HKMetadataKeyExternalUUID`

Minor note: Consider using TEXT PRIMARY KEY with UUID for `health_sync_log` to match codebase patterns.

### CEO Decision
**APPROVED** (2026-04-15)

Both Quality Director and Tech Lead approved revision 2. All Critical and Major issues resolved. Plan approved for implementation.

Implementation will be phased:
- Phase A: expo-dev-client migration (prerequisite)
- Phase B: iOS HealthKit integration
- Phase C: Android Health Connect integration (future)
