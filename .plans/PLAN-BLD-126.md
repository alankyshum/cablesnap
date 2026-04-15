# Feature Plan: Apple Health & Google Health Connect Integration

**Issue**: BLD-126
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

FitForge tracks workouts, nutrition, and body measurements locally, but users expect their fitness data to sync with their device's health platform (Apple Health on iOS, Google Health Connect on Android). Without this integration, FitForge exists in isolation:

- Users can't see their workout calories burned in Apple Health's activity ring
- Body weight entries are duplicated — users re-enter in FitForge AND their health app
- Nutrition data (calories consumed) doesn't flow to the health dashboard
- FitForge can't leverage step data or resting heart rate from wearables

**Why now?** FitForge has matured through 35+ feature phases with comprehensive workout, nutrition, and body tracking. Health platform integration is the natural next step and the #1 differentiator between a "toy app" and a "real fitness app." Apps with HealthKit integration see 30-40% higher user retention.

**Data supporting this:** Every major fitness app (Strong, MyFitnessPal, Fitbod, JEFIT) integrates with Apple Health / Google Fit. Users switching from these apps expect this feature.

## User Stories

- As a user, I want my completed workouts to appear in Apple Health / Health Connect so all my fitness data is in one place
- As a user, I want my body weight entries in FitForge to sync to Apple Health so I don't have to enter them twice
- As a user, I want to control exactly what data FitForge shares with my health platform
- As a user, I want a simple on/off toggle for health sync — not a complicated setup wizard
- As a user, I want to see my daily step count on the FitForge dashboard so I have a complete fitness picture

## Proposed Solution

### Overview

Add a "Health Sync" settings section that enables bidirectional data flow between FitForge and the device's health platform. **Write** workout sessions, body weight, and nutrition summaries. **Read** step count and resting heart rate for dashboard display.

This requires migrating from Expo Go to a custom development client (`expo-dev-client`), as health platform APIs require native modules.

### UX Design

**Entry Point — Settings Screen:**
- New "Health Sync" card below existing settings
- Shows platform name: "Apple Health" (iOS) or "Health Connect" (Android)
- Master toggle: "Sync with [platform name]" — on/off
- When toggled ON for the first time → triggers native permission prompt
- Sub-toggles (only visible when master is ON):
  - "Write workouts" (default: on)
  - "Write body weight" (default: on)
  - "Write nutrition" (default: on)
  - "Read step count" (default: on)
  - "Read resting heart rate" (default: off)
- Sync status indicator: "Last synced: [timestamp]" or "Not synced yet"
- "Sync Now" button for manual trigger

**Dashboard Enhancement:**
- When step count reading is enabled, show a "Steps Today" card on the home dashboard
- When heart rate reading is enabled, show "Resting HR" on the progress screen
- Both gracefully hidden when health sync is disabled or data unavailable

**Post-Workout Flow:**
- After workout completion (summary screen), automatically write the workout to the health platform
- Show a subtle indicator: "✓ Synced to Apple Health" / "✓ Synced to Health Connect"
- If sync fails silently, log the error but don't interrupt the user flow

**Permission Handling:**
- iOS: System HealthKit permission sheet appears automatically
- Android: Redirects to Health Connect app for permissions (built into Android 14+; older versions prompted to install)
- If permissions denied → disable sync, show explanation text: "Health sync requires permission. You can enable it in Settings > Privacy > Health."
- Never re-prompt automatically after denial — user must manually re-enable via toggle

### Technical Approach

**Architecture:**
- Create `lib/health.ts` — unified health sync abstraction layer
- Platform-specific implementations via `lib/health.ios.ts` and `lib/health.android.ts` (React Native's platform-specific file resolution)
- iOS: `react-native-health` (HealthKit wrapper, well-maintained)
- Android: `react-native-health-connect` (Health Connect wrapper, official Google backing)
- Both APIs are abstracted behind a common `HealthService` interface

**HealthService Interface:**
```typescript
interface HealthService {
  isAvailable(): Promise<boolean>;
  requestPermissions(config: SyncConfig): Promise<boolean>;
  hasPermissions(): Promise<boolean>;

  // Write operations
  writeWorkout(session: CompletedSession): Promise<void>;
  writeBodyWeight(weight: number, date: Date): Promise<void>;
  writeNutrition(calories: number, protein: number, carbs: number, fat: number, date: Date): Promise<void>;

  // Read operations
  readSteps(date: Date): Promise<number>;
  readRestingHeartRate(date: Date): Promise<number | null>;
}
```

**Data Model Changes:**
- Add to `app_settings` table:
  - `health_sync_enabled` (boolean, default false)
  - `health_sync_workouts` (boolean, default true)
  - `health_sync_weight` (boolean, default true)
  - `health_sync_nutrition` (boolean, default true)
  - `health_read_steps` (boolean, default true)
  - `health_read_hr` (boolean, default false)
  - `health_last_sync_at` (timestamp, nullable)

**Sync Triggers:**
- Workout write: triggered from `session/summary/[id].tsx` after workout completion
- Body weight write: triggered from body weight save in `lib/db.ts`
- Nutrition write: triggered at end of day or when nutrition targets screen is viewed (daily summary)
- Step/HR read: triggered on dashboard focus (with 15-minute cache to avoid excessive reads)

**Migration to Custom Dev Client:**
- Add `expo-dev-client` dependency
- This is a ONE-TIME infrastructure change that also enables future native module usage
- Existing Expo Go users will need to switch to the custom dev client build
- CI/CD pipeline needs updating for EAS Build

**New Dependencies:**
- `expo-dev-client` — custom development client (required for native modules)
- `react-native-health` — iOS HealthKit bridge (~2.5k GitHub stars, actively maintained)
- `react-native-health-connect` — Android Health Connect bridge (~600 GitHub stars, Google-backed)

**Performance Considerations:**
- Health writes are fire-and-forget — never block the UI thread
- Step count reads are cached for 15 minutes to avoid battery drain
- All health operations wrapped in try/catch — health sync failures never crash the app
- Health operations run in the background after workout completion

**Storage/Caching:**
- Step count cached in memory (React Query with 15-minute stale time)
- Health sync settings persisted in SQLite `app_settings` table
- No local queue for failed syncs — if a write fails, it's lost (matches competitor behavior)

### Scope

**In Scope:**
- Settings UI for health sync configuration (master toggle + sub-toggles)
- iOS HealthKit integration (write workouts, body weight, nutrition; read steps, HR)
- Android Health Connect integration (same data types)
- Post-workout auto-sync with confirmation indicator
- Dashboard step count card
- Migration to expo-dev-client
- Platform detection and graceful fallback on unsupported platforms (web)
- App config plugin setup for both platforms

**Out of Scope:**
- Historical data backfill (only new data going forward)
- Bidirectional workout sync (reading workouts FROM health platform)
- Sleep tracking
- Detailed exercise-level data in HealthKit (just overall workout summary)
- Web platform support (health APIs are mobile-only)
- Wearable companion apps (Apple Watch / WearOS)
- Automatic retry queue for failed syncs
- Health data displayed in progress charts (future feature)

### Acceptance Criteria

- [ ] Given health sync is OFF When I toggle it ON Then the native permission prompt appears
- [ ] Given permissions are granted When I complete a workout Then the workout appears in Apple Health / Health Connect within 5 seconds
- [ ] Given body weight sync is enabled When I save a new weight entry Then it appears in the health platform
- [ ] Given nutrition sync is enabled When I view the nutrition targets screen Then today's totals are written to the health platform
- [ ] Given step reading is enabled When I open the dashboard Then today's step count is displayed
- [ ] Given health sync is ON When I toggle it OFF Then no more data is written to the health platform
- [ ] Given the health platform is unavailable (e.g., web) When I open settings Then the Health Sync section is hidden
- [ ] Given permissions were denied When I view the sync settings Then the toggle is OFF with an explanation message
- [ ] Given a sync write fails When I complete a workout Then the failure is logged but the user is NOT interrupted
- [ ] PR passes all existing tests with no regressions
- [ ] TypeScript compiles with zero errors
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Web platform | Health Sync section hidden entirely — no errors |
| Health Connect not installed (Android <14) | Show message: "Install Health Connect from Play Store" with link |
| Permissions denied | Disable sync, show explanation, don't re-prompt |
| Permissions partially granted | Only sync data types that have permission |
| App killed during sync write | Fire-and-forget — no corruption, no retry needed |
| Multiple rapid weight entries | Each write is independent — all appear in health platform |
| No internet connection | Health writes are local to the device — no internet required |
| Very old workout data | Only syncs going forward — no historical backfill |
| Extremely long workout (>24 hours) | Cap workout duration at 24 hours for health write |
| Zero-calorie workout | Still write workout with duration and 0 calories |
| User revokes permission externally via Settings | Next sync attempt fails silently, toggle shows "Permission required" |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-dev-client migration breaks existing build | Medium | High | Test migration on a separate branch first; keep Expo Go fallback until stable |
| react-native-health has breaking changes | Low | Medium | Pin to specific version; library is mature and stable |
| Health Connect not available on older Androids | Medium | Low | Graceful degradation — show install prompt; sync is optional |
| User confusion about permissions | Low | Low | Clear permission descriptions and settings UI |
| Battery drain from frequent health reads | Low | Medium | 15-minute cache on reads; no background polling |
| CI/CD pipeline changes for EAS Build | Medium | Medium | Update GitHub Actions workflow; may need EAS account setup |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** — 7 Critical issues found (2026-04-15)

Must fix before approval:
1. Define toggle behavior when permission prompt is dismissed (not denied) — toggle should revert to OFF
2. Define concrete nutrition sync trigger (per-meal write, not vague 'end of day')
3. Add accessibility labels and roles for ALL new interactive elements (master toggle, sub-toggles, Sync Now, status)
4. Add deduplication strategy — track synced IDs in SQLite to prevent duplicate HealthKit entries
5. Clarify nutrition sync data integrity — per-meal vs daily snapshot, and how edits propagate
6. Add expo-dev-client migration as a separate prerequisite issue with own acceptance criteria
7. Specify 48x48dp touch targets for all new toggles and buttons

See BLD-126 issue comments for full review with detailed rationale.

### Tech Lead (Technical Feasibility)
**Verdict: NEEDS REVISION**

**Feasibility**: Buildable, but critical gaps around Expo managed workflow compatibility will block implementation.

**Architecture Fit**: Partially compatible. Settings key-value pattern fits; platform-specific file resolution is standard RN. However, this is the first native module integration — no ios/android dirs exist (managed Expo). Medium refactoring needed for expo-dev-client migration.

**Complexity**: Large (XL if both platforms ship simultaneously). Risk: High.

**Critical Issues:**
1. `react-native-health` and `react-native-health-connect` lack Expo config plugins — won't link during `npx expo prebuild`. Recommend `@kingstinct/react-native-healthkit` (has Expo plugin). Android needs custom config plugin wrapper.
2. Missing native entitlement/permission configuration (iOS HealthKit entitlements, Info.plist privacy descriptions, Android Health Connect manifest permissions) — must be in `app.config.ts` plugins.
3. `react-native-health` has known issues with Fabric/TurboModules. FitForge uses `newArchEnabled: true` + RN 0.81.5 — must verify compatibility.

**Major Issues:**
4. No testing/mocking strategy for native health modules.
5. expo-dev-client migration should be a separate prerequisite issue — changes entire dev workflow and CI/CD.
6. Dual-platform simultaneous delivery doubles testing surface — recommend iOS first.

**Recommendations:**
- Phase into: (a) expo-dev-client migration, (b) iOS HealthKit writes, (c) Android Health Connect, (d) Read operations
- Use `@kingstinct/react-native-healthkit` instead of `react-native-health`
- Ship write-only first (workouts + body weight), add reads later
- Skip nutrition sync in v1 (vague trigger, 20% of user value)
- Add deduplication via `HKMetadataKeyExternalUUID`

**Reviewed**: 2026-04-15 by techlead

### CEO Decision
_Pending reviews_
