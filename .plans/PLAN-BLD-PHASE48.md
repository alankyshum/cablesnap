# Feature Plan: Strava Integration (Phase 48)

**Issue**: BLD-298
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement
Many fitness enthusiasts use Strava as their central activity hub. Currently, FitForge workout data is siloed — users who want to track their strength training in Strava must manually re-enter workout details. This creates friction and reduces FitForge's value in a multi-app fitness ecosystem.

The owner has filed three related requests:
- GitHub #164: Auto-upload finished workouts to Strava
- GitHub #165: Strava account linking on Settings page
- GitHub #166: Wear OS companion (separate phase — out of scope here)

## User Stories
- As a gym-goer who uses Strava, I want my FitForge workouts to appear in Strava automatically so I don't have to manually log them twice
- As a user, I want to connect/disconnect my Strava account from Settings so I control when syncing is active
- As a user, I want to see which workouts have been synced so I know my data is up to date

## Proposed Solution

### Overview
Add Strava OAuth2 integration with automatic workout upload. When a user completes a workout and has Strava connected, FitForge will create a Strava activity with the workout summary.

### UX Design

#### Settings Page — Strava Connection
- New "Integrations" section in Settings (below existing sections)
- "Connect Strava" button with Strava brand icon
- When connected: show connected account name, "Disconnect" button, toggle for auto-sync
- OAuth2 flow uses `expo-auth-session` / `expo-web-browser` for the browser redirect

#### Workout Completion — Auto-Upload
- After `completeSession()`, if Strava is connected and auto-sync is on, upload the workout
- Show a brief toast: "Synced to Strava ✓" or "Strava sync failed — retry in Settings"
- No blocking UI — sync happens in the background after session completion

#### Sync History (stretch goal)
- Optional: show sync status icon on recent workouts list (synced ✓ / failed ✗ / pending)

### Technical Approach

#### Strava API Integration
- **OAuth2 flow**: Authorization Code Grant with PKCE
  - Redirect URI: `fitforge://strava-callback` (deep link)
  - Scopes: `activity:write` (create activities)
  - Token storage: `expo-secure-store` for access/refresh tokens
- **Activity creation**: POST `/api/v3/activities`
  - `name`: workout template name or "Strength Training"
  - `type`: "WeightTraining"
  - `sport_type`: "WeightTraining"
  - `start_date_local`: session.started_at (ISO 8601)
  - `elapsed_time`: session.duration_seconds
  - `description`: exercise summary (e.g., "Bench Press: 3×10@80kg, Squat: 4×8@100kg")
- **Token refresh**: Strava tokens expire every 6 hours — auto-refresh before API calls

#### Data Model Changes
- New table: `strava_integration`
  - `id` TEXT PRIMARY KEY
  - `access_token` TEXT (encrypted via SecureStore)
  - `refresh_token` TEXT (encrypted via SecureStore)
  - `athlete_id` INTEGER
  - `athlete_name` TEXT
  - `expires_at` INTEGER
  - `auto_sync` INTEGER DEFAULT 1
  - `created_at` INTEGER
- New table: `strava_sync_log`
  - `id` TEXT PRIMARY KEY
  - `session_id` TEXT REFERENCES workout_sessions(id)
  - `strava_activity_id` TEXT
  - `status` TEXT (pending/synced/failed)
  - `error` TEXT
  - `synced_at` INTEGER

#### New Dependencies
- `expo-auth-session` — OAuth2 flow
- `expo-web-browser` — browser popup for Strava login
- `expo-secure-store` — secure token storage (already available in Expo)

#### Key Files to Create/Modify
- `lib/strava.ts` — Strava API client (OAuth, token refresh, activity creation)
- `lib/db/strava.ts` — DB operations for strava_integration and strava_sync_log
- `app/(tabs)/settings.tsx` — add Integrations section
- `lib/db/sessions.ts` — hook into completeSession for auto-sync trigger
- `lib/db/schema.ts` — new tables in migration

### Scope

**In Scope:**
- Strava OAuth2 connection/disconnection in Settings
- Automatic workout upload on session completion
- Token refresh handling
- Basic error handling and retry
- Sync status toast notifications

**Out of Scope:**
- Wear OS integration (separate phase — GitHub #166)
- Importing Strava activities INTO FitForge
- Syncing cardio data (FitForge is strength-focused)
- Manual "sync this workout" button (auto-sync only)
- Bidirectional sync
- Strava webhook subscriptions

### Acceptance Criteria
- [ ] Given a user on Settings When they tap "Connect Strava" Then the Strava OAuth2 browser flow opens
- [ ] Given a user completes Strava OAuth Then their Strava account name appears in Settings with a "Disconnect" button
- [ ] Given a connected user who completes a workout When auto-sync is on Then the workout appears as a Strava activity within 10 seconds
- [ ] Given a Strava activity is created Then it has type "WeightTraining", correct duration, and exercise summary in description
- [ ] Given a user taps "Disconnect" Then tokens are deleted and no future workouts sync
- [ ] Given the Strava API is unavailable When a workout completes Then a non-blocking error toast shows and the workout is still saved locally
- [ ] Given a token has expired When a sync is attempted Then the token is refreshed automatically before retrying
- [ ] PR passes all existing tests with no regressions
- [ ] New tests cover OAuth flow mocking, activity creation, and error handling

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Strava API down | Toast "Strava sync failed", workout saved locally, retry on next app open |
| Token expired | Auto-refresh, retry once, fail gracefully if refresh also fails |
| User revokes access on Strava.com | Next sync fails → show "Strava disconnected" and clear tokens |
| No internet | Skip sync silently, log for retry |
| Very long workout (3+ hours) | Works normally — just large elapsed_time |
| Workout with 0 completed sets | Skip Strava upload (nothing meaningful to sync) |
| Multiple rapid workout completions | Queue uploads, process sequentially |
| User disconnects mid-sync | Cancel pending upload, clear tokens |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Strava API rate limits (100/15min, 1000/day) | Low (1 upload per workout) | Low | Unlikely to hit limits with normal usage |
| Strava OAuth complexity in Expo | Medium | Medium | Use expo-auth-session which handles PKCE and redirects |
| Token storage security | Low | High | Use expo-secure-store, never log tokens |
| Strava API changes | Low | Medium | Pin API version, handle errors gracefully |
| Strength training data doesn't map well | Medium | Low | Use "WeightTraining" type, put details in description text |

## Implementation Strategy

### Sub-tasks (in order):
1. **DB schema**: Add strava_integration and strava_sync_log tables
2. **Strava API client**: OAuth flow, token management, activity creation
3. **Settings UI**: Integrations section with connect/disconnect
4. **Auto-sync hook**: Wire into completeSession
5. **Error handling & retry**: Toast notifications, graceful failures
6. **Tests**: Unit tests for API client, integration tests for OAuth flow

### Estimated Complexity: Medium-High
- OAuth2 is well-documented but has edge cases (PKCE, token refresh, deep links)
- Strava API is straightforward for activity creation
- Main risk is the OAuth redirect flow in React Native/Expo

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
