# Feature Plan: Strava Integration (Phase 48)

**Issue**: BLD-298
**Author**: CEO
**Date**: 2026-04-17
**Status**: APPROVED

## Problem Statement
Many fitness enthusiasts use Strava as their central activity hub. Currently, CableSnap workout data is siloed — users who want to track their strength training in Strava must manually re-enter workout details. This creates friction and reduces CableSnap's value in a multi-app fitness ecosystem.

The owner has filed three related requests:
- GitHub #164: Auto-upload finished workouts to Strava
- GitHub #165: Strava account linking on Settings page
- GitHub #166: Wear OS companion (separate phase — out of scope here)

## User Stories
- As a gym-goer who uses Strava, I want my CableSnap workouts to appear in Strava automatically so I don't have to manually log them twice
- As a user, I want to connect/disconnect my Strava account from Settings so I control when syncing is active

## Proposed Solution

### Overview
Add Strava OAuth2 PKCE integration with automatic workout upload. When a user completes a workout session and has Strava connected, the session-complete screen triggers a Strava activity upload. **Native only (iOS/Android) — web platform excluded** because `expo-secure-store` and `expo-auth-session` do not support web.

### UX Design

#### Settings Page — Strava Connection (Native Only)
- New "Integrations" section in Settings, **hidden on web** via `Platform.OS === 'web'` check
- "Connect Strava" button with Strava brand orange icon
  - `accessibilityRole="button"`, `accessibilityLabel="Connect your Strava account"`
- When connected: show connected athlete name + "Disconnect" button
  - `accessibilityLabel="Disconnect Strava account (athlete name)"`
  - **No auto-sync toggle** — connecting = auto-sync on, disconnecting = off (TL simplification accepted)
- OAuth2 browser flow via `expo-auth-session` + `expo-web-browser`
- Wrap Integrations section in error boundary — Strava failure must never crash Settings

#### Workout Completion — Auto-Upload
- After user taps "Complete Workout" on the session screen, the **UI layer** (not `completeSession()` DB function) calls `syncToStrava()` if Strava is connected
- A `strava_sync_log` entry with status `pending` is created BEFORE the API call
- On success: toast "Synced to Strava ✓", update log to `synced`
- On failure: toast "Strava sync failed", update log to `failed` with error message
  - **No "retry in Settings" text** — the retry mechanism is automatic (see below)
- No blocking UI — sync is fire-and-forget from the user's perspective

#### Retry Mechanism (Persistent Queue)
- `strava_sync_log` table serves as a **persistent queue**
- On app startup (`_layout.tsx` or similar), query for `status = 'pending' OR status = 'failed'` entries
- Retry each with exponential backoff (1 attempt per startup, max 3 retries tracked in `retry_count` column)
- After 3 failed retries: mark as `permanently_failed`, no further retries
- This ensures failed syncs survive app restarts and are not permanently lost

### Technical Approach

#### Strava API Integration
- **OAuth2 flow**: Authorization Code Grant with **PKCE** (no client_secret needed)
  - `client_id`: stored in `app.config.ts` under `extra.stravaClientId` (public, non-secret)
  - No `client_secret` in the app — PKCE eliminates the need
  - Redirect URI: `cablesnap://strava-callback` (deep link via `expo-linking`)
  - Scopes: `activity:write` (create activities)
- **Token storage**: `expo-secure-store` exclusively
  - Key `strava_access_token` — access token string
  - Key `strava_refresh_token` — refresh token string
  - Key `strava_token_expires_at` — expiry timestamp string
  - **NO tokens stored in SQLite** — SQLite is not secure storage
- **Activity creation**: POST `https://www.strava.com/api/v3/activities`
  - `name`: workout template name or "Strength Training"
  - `type`: "WeightTraining"
  - `sport_type`: "WeightTraining"
  - `start_date_local`: session.started_at (ISO 8601)
  - `elapsed_time`: session duration in seconds
  - `description`: exercise summary respecting user's **weight unit preference** (kg or lbs from settings)
  - `external_id`: `cablesnap-{session_id}` — **prevents duplicate uploads** if retried
- **Token refresh**: Strava tokens expire every 6 hours — auto-refresh before API calls using refresh token via `POST /oauth/token`

#### Data Model Changes
- New table: `strava_connection` (singleton — only 1 row)
  - `id` INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1) — enforces singleton
  - `athlete_id` INTEGER NOT NULL
  - `athlete_name` TEXT NOT NULL
  - `connected_at` INTEGER NOT NULL
  - (tokens stored in expo-secure-store, NOT in this table)
- New table: `strava_sync_log`
  - `id` TEXT PRIMARY KEY (UUID)
  - `session_id` TEXT NOT NULL REFERENCES workout_sessions(id)
  - `strava_activity_id` TEXT — filled after successful upload
  - `status` TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed', 'permanently_failed'))
  - `error` TEXT — error message on failure
  - `retry_count` INTEGER DEFAULT 0
  - `created_at` INTEGER NOT NULL
  - `synced_at` INTEGER — timestamp of successful sync
  - UNIQUE(session_id) — one sync entry per session, prevents duplicates

#### New Dependencies (all validated for Expo SDK 55)
- `expo-auth-session@~55.0.x` — OAuth2 PKCE flow (Expo SDK 55 compatible)
- `expo-web-browser@~55.0.x` — browser popup for Strava login (Expo SDK 55 compatible)
- `expo-secure-store@~55.0.x` — secure token storage (Expo SDK 55 compatible)
- `expo-crypto` — already installed, needed for PKCE code verifier

#### Key Files to Create/Modify
- `lib/strava.ts` — Strava API client (OAuth, token management via SecureStore, activity creation)
- `lib/db/strava.ts` — DB operations for strava_connection and strava_sync_log tables only (no token ops)
- `app/(tabs)/settings.tsx` — add Integrations section (gated behind `Platform.OS !== 'web'`), wrapped in error boundary
- `app/session/[id].tsx` — call `syncToStrava()` from UI after session completion (NOT from `completeSession()`)
- `lib/db/schema.ts` — new tables in migration
- `app/_layout.tsx` — startup retry reconciliation for pending/failed syncs

### Scope

**In Scope:**
- Strava OAuth2 PKCE connection/disconnection in Settings (native only)
- Automatic workout upload triggered from UI on session completion
- Token storage in expo-secure-store (never SQLite)
- Persistent retry queue via strava_sync_log
- Duplicate prevention via external_id
- Error boundary around Strava UI components
- Accessibility attributes on all interactive elements
- Weight unit respect in workout descriptions

**Out of Scope:**
- Web platform support (expo-secure-store/expo-auth-session don't support web)
- Wear OS integration (separate phase — GitHub #166)
- Importing Strava activities INTO CableSnap
- Syncing cardio data (CableSnap is strength-focused)
- Sync history UI (phase 1 — no visible sync status on workout list)
- Auto-sync toggle (connect = on, disconnect = off)
- Bidirectional sync
- Strava webhook subscriptions

### Acceptance Criteria
- [ ] Given a user on Settings (native) When they tap "Connect Strava" Then the Strava OAuth2 PKCE browser flow opens
- [ ] Given a user on Settings (web) Then the Integrations section is NOT visible
- [ ] Given a user completes Strava OAuth Then their athlete name appears in Settings with a "Disconnect" button
- [ ] Given a connected user who completes a workout Then the workout is uploaded to Strava as a WeightTraining activity with correct duration and exercise summary
- [ ] Given a Strava activity is created Then it uses `external_id: "cablesnap-{session_id}"` to prevent duplicates
- [ ] Given the workout description includes weights Then weights use the user's configured unit (kg or lbs)
- [ ] Given a user taps "Disconnect" Then SecureStore tokens are deleted, strava_connection row is deleted, and no future workouts sync
- [ ] Given the Strava API is unavailable When a workout completes Then a non-blocking error toast shows, workout is saved locally, and a `failed` entry is created in strava_sync_log
- [ ] Given failed sync entries exist When the app starts Then they are retried (up to 3 times with retry_count tracking)
- [ ] Given a token has expired When a sync is attempted Then the token is refreshed automatically before retrying
- [ ] Given Strava components throw an error Then the error boundary catches it and Settings remains functional
- [ ] All Strava UI controls have appropriate accessibilityRole and accessibilityLabel attributes
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover OAuth flow mocking, activity creation, retry logic, and error handling

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Strava API down | Toast "Strava sync failed", log entry with status=failed, retry on next app start |
| Token expired | Auto-refresh via refresh token, retry once, fail gracefully if refresh also fails |
| User revokes access on Strava.com | Next sync fails with 401 → clear tokens + strava_connection, toast "Strava disconnected" |
| No internet | Sync fails, logged as failed, retried on next startup |
| Very long workout (3+ hours) | Works normally — just large elapsed_time value |
| Workout with 0 completed sets | Skip Strava upload entirely (nothing meaningful to sync) |
| Multiple rapid workout completions | Each creates its own sync_log entry, processed independently |
| User disconnects mid-sync | Clear tokens + connection, in-flight request will fail naturally (no crash) |
| Duplicate sync attempt (same session_id) | UNIQUE constraint on session_id prevents duplicate log entries; external_id prevents duplicate Strava activities |
| Web platform | Integrations section hidden entirely, no Strava code paths executed |
| SecureStore unavailable (rare) | Catch error, treat as disconnected, log to console |
| Retry exhaustion (3 failures) | Mark as permanently_failed, stop retrying |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Strava API rate limits (100/15min, 1000/day) | Low (1 upload per workout) | Low | Unlikely to hit limits with normal usage |
| Strava OAuth PKCE in Expo | Low | Medium | expo-auth-session handles PKCE natively; well-documented |
| Token storage security | Low | High | expo-secure-store only; never in SQLite, never logged |
| Strava API changes | Low | Medium | Pin API v3, handle errors gracefully, error boundary |
| Strength training data doesn't map well | Medium | Low | Use "WeightTraining" type, details in description text |
| expo-auth-session SDK 55 compatibility | Low | High | Validate version during implementation; Expo SDK 55 has stable support |

## Implementation Strategy

### Sub-tasks (in order):
1. **Dependencies**: Install expo-auth-session, expo-web-browser, expo-secure-store (SDK 55 versions)
2. **DB schema**: Add strava_connection (singleton) and strava_sync_log tables in migration
3. **Strava API client**: OAuth PKCE flow, SecureStore token management, activity creation with external_id
4. **Settings UI**: Integrations section gated behind Platform.OS check, with error boundary and a11y attributes
5. **Session completion hook**: Call syncToStrava from session UI layer (NOT from completeSession DB function)
6. **Retry reconciliation**: Startup check for pending/failed sync entries
7. **Tests**: Unit tests for API client, retry logic, integration tests for OAuth flow mocking

### Estimated Complexity: Medium-High
- OAuth2 PKCE is well-supported by expo-auth-session
- Strava API is straightforward for activity creation
- Main risk: deep link redirect flow testing on physical devices
- Persistent retry queue adds modest complexity

## Review Feedback

### Quality Director (UX Critique) — R1
**Verdict: NEEDS REVISION** (2026-04-17)

8 critical issues found: token storage contradiction, missing retry mechanism, web platform gap, no a11y attrs, completeSession coupling, undefined queue, unvalidated deps, contradictory error toast.

### Quality Director (UX Critique) — R2
**Verdict: APPROVED** (2026-04-17)

All 8 critical issues from R1 resolved:
1. ✅ Token storage — SecureStore only, no tokens in SQLite
2. ✅ Persistent retry queue — strava_sync_log with retry_count, startup reconciliation
3. ✅ Toast text fixed — no misleading "retry in Settings"
4. ✅ Web platform excluded — Integrations hidden via Platform.OS
5. ✅ Accessibility attributes specified for all controls
6. ✅ Decoupled from completeSession — sync called from UI layer
7. ✅ Queue is persistent (strava_sync_log table), survives app kill
8. ✅ SDK version corrected to 55, deps validated
9. ✅ Duplicate prevention via external_id
10. ✅ Weight unit respected in workout description
11. ✅ Error boundary around Strava components
12. ✅ strava_connection uses singleton pattern (id=1, CHECK constraint)

Plan is technically sound, UX-coherent, and aligned with CableSnap Review SKILL standards. Ready for implementation.

### Tech Lead (Technical Feasibility) — R1
**Verdict: NEEDS REVISION** (2026-04-17)

All issues addressed in R2:
1. ✅ Tokens stored exclusively in expo-secure-store, removed from SQLite table
2. ✅ Strava UI gated behind Platform.OS !== 'web'
3. ✅ PKCE flow eliminates client_secret; client_id in app.config.ts extra
4. ✅ Dependencies listed with SDK 55 version ranges
5. ✅ strava_sync_log as persistent queue with retry_count and startup reconciliation

Simplification recommendations accepted:
- ✅ Sync history UI dropped for phase 1
- ✅ Auto-sync toggle removed (connect = on, disconnect = off)
- ✅ syncToStrava called from UI layer, not completeSession

### Tech Lead (Technical Feasibility) — R2
**Verdict: APPROVED** (2026-04-17)

All critical/major issues resolved. Architecture compatible, data model sound.
Minor note: `lib/db/schema.ts` doesn't exist — migrations are in `lib/db/helpers.ts` (line 87). Implementer should add CREATE TABLE statements there.

### CEO Decision
**APPROVED** (2026-04-17). Both reviewers approved at R2. All R1 feedback addressed. Proceeding to implementation.
