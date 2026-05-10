# Feature Plan: Smart Rest Coach — pre-end cue + live countdown notification + next-set preview

**Issue**: BLD-1137  **Author**: CEO  **Date**: 2026-05-10  **Revision**: rev-2 (addresses TL + QD requested changes; psych conditions folded into Scope/AC)
**Status**: APPROVED (2026-05-10) — TL ✅ (79a1516e) · psych ✅ APPROVED WITH CONDITIONS (12771d0a, conditions self-enforced by AC14a/b/c) · QD ✅ (206797ba) · CEO ✅

## Research Source
- **Origin:** Cross-app review research — Hevy 2026 review, SetBreak Play Store, Reps blog "Smart Rest Timer", Volym "Rest Timer for Smarter Training", r/fitness "best workout app 2026" threads.
- **Pain point observed:** Single fire-at-end notification is sub-par. Modern lifters expect (a) pre-end cue 5-10s before timer ends to mentally prepare, (b) live ongoing lock-screen countdown (so they don't unlock the phone — and lose focus to social media — just to see remaining time), (c) preview of the next set on that notification.
- **Frequency:** Recurring across nearly every "best workout tracker app 2026" review. SetBreak's entire app exists because of this gap.

## Problem Statement
CableSnap auto-starts a rest timer on set complete and fires a single "Rest complete" notification at the end. Today the experience between set complete and rest end is **silent and contextless**:
1. The phone never reminds you that rest is about to end — you either watch the screen or you miss the optimal start window.
2. While resting you must keep CableSnap foregrounded or unlock the phone to see remaining time. Both behaviors trigger context-switch losses (and unlock often → social media trap).
3. Even the end-of-rest notification just says "Time for your next set" — no exercise, no target weight, no reps. The user still has to open the app to know what's next.

This is the most-cited differentiator competitors charge for. Closing it is small surface area, no new deps, no behavioral hooks.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely informational/functional cue. Confirmed by psychologist (Eyal Facilitator). All 7 binding conditions folded into Scope/AC below.

## What CableSnap has today
- Auto-start rest timer on set complete (`hooks/useRestTimer.ts`, `useSessionActions.ts:469`).
- Adaptive rest duration (BLD-531 `lib/rest.ts`; BLD-1110 `recomputeActiveRest` path).
- Single fire-once "Rest complete" local notification (`lib/notifications.ts:155 scheduleRestComplete`).
- Vibrate + sound at end (settings `rest_timer_vibrate`, `rest_timer_sound`).
- Master `Rest Timer Notifications` toggle + permission gate (`components/settings/ReminderSection.tsx:103-139`).

## User Stories
- As a lifter resting between sets with the phone face-down, I want a subtle cue 5–10s before rest ends so I can mentally prep and start the next set on time.
- As a lifter resting with the phone in my pocket, I want a glanceable live countdown on the lock screen so I can check remaining time **without unlocking** (avoids the social-media unlock trap).
- As a lifter who reaches for the phone when rest ends, I want the rest-complete notification to **show the next set's exercise, target weight, and rep range** so I can step up and start without opening the app — but **only if I've explicitly opted in**, since this exposes training data on the lock screen.

## Proposed Solution

### Overview
Replace the single fire-at-end scheduling call with **up to three notifications per rest interval** (pre-end cue, live ongoing countdown, rest-complete), all scheduled locally via `expo-notifications` — no cloud, no new deps, no SDK bump (verified against `expo-notifications@~55.0.19`).

### Bootstrap (NEW — addresses TL Defect #2)

On app boot (lazy-init in `lib/notifications.ts` triggered by first call from `app/_layout.tsx`), register two new Android channels alongside the existing rest channel:

```ts
// constants exported from lib/notifications.ts
export const REST_ONGOING_CHANNEL = "rest-ongoing";
export const REST_CUE_CHANNEL = "rest-cue";
// existing (unchanged): "rest-complete"

await setNotificationChannelAsync(REST_ONGOING_CHANNEL, {
  name: "Rest timer (ongoing)",
  importance: AndroidImportance.LOW,
  sound: null,
  vibrationPattern: [],
  showBadge: false,
});
await setNotificationChannelAsync(REST_CUE_CHANNEL, {
  name: "Rest pre-end cue",
  importance: AndroidImportance.LOW,
  sound: null,
  vibrationPattern: [],
  showBadge: false,
});
```

Channels are no-ops on iOS (function returns null). Idempotent — safe to call on every cold start.

### UX Design

**Settings (new, in existing Rest Timer settings group under the existing master `Rest Timer Notifications` switch in `ReminderSection.tsx`):**

| Key | Type | Default | Notes |
|---|---|---|---|
| `rest_timer_pre_end_cue_seconds` | int (0/5/10/15/20) | `10` | 0 = off |
| `rest_timer_live_countdown` | bool | Android: `true`, iOS: `false` (and runtime-ignored on iOS) | |
| `rest_timer_show_next_set_preview` | bool | **`false`** (privacy-safe default — addresses QD #1) | Shows exercise/weight on lock screen when on. |

**Master-switch / permission interaction (NEW — addresses QD #2):**
- When master `Rest Timer Notifications` is OFF, all three child rows render **disabled** with greyed labels and helper text: `Enable rest-timer notifications to use these.`
- When OS notification permission is **denied**, the master row already shows the existing permission-denied chip; child rows render disabled with helper text `Notifications are blocked in iOS/Android Settings.`
- When master is OFF or permission is denied, **no scheduling calls fire** — `useRestTimer` short-circuits before calling any notification helper.

**Notification surfaces:**

1. **Pre-end cue notification** (when `rest_timer_pre_end_cue_seconds > 0` AND remaining ≥ pre_end + 2s safety):
   - Title: `Rest ending in {N}s`
   - Body (preview enabled AND next set resolved): `Next: {previewBody}` (see preview-formatting rules below)
   - Body (preview disabled OR no next set OR null preview): `Next set in {N}s` (or `Workout ending in {N}s` if last set of session)
   - Sound: silent (Android: `REST_CUE_CHANNEL` sound:null; iOS: `interruptionLevel: 'passive'` — addresses TL #3)
   - Identifier: `rest-preend-{sessionId}`
   - Channel (Android): `REST_CUE_CHANNEL`
   - **Foreground behavior** (TL #8): if `AppState === 'active'` at scheduled fire time, suppress the system notification and fire `Haptics.selectionAsync()` instead. Implementation: schedule with the notification and add a foreground handler that swallows + replays haptic. (Acceptable simplification: schedule unconditionally; rely on `setNotificationHandler` to filter `data.type === 'rest_preend'` in foreground → return `{ shouldShowAlert: false, shouldPlaySound: false }` and trigger haptic.)

2. **Rest-complete notification** (existing, enhanced):
   - Title: `Rest complete`
   - Body (preview enabled AND next set resolved): `{previewBody}`
   - Body (preview disabled OR no next set): `Time for your next set` (last-set fallback: `Last set complete`)
   - Sound + vibrate: respect existing `rest_timer_sound`/`rest_timer_vibrate` (UNCHANGED)
   - iOS `interruptionLevel: 'active'` (default — banner + sound respected)
   - Identifier: `rest-complete-{sessionId}` (unchanged)

3. **Live ongoing notification** (Android only, when `rest_timer_live_countdown=true` AND `rest_timer_show_next_set_preview` honored):
   - Title: `Resting · {mm:ss} remaining`
   - Body: `{previewBody}` (preview on AND resolved) OR `Resting…` (preview off OR no next set)
   - Channel: `REST_ONGOING_CHANNEL`; `sticky: true`, `priority: AndroidNotificationPriority.LOW`
   - Re-presented every **5 seconds** via `scheduleNotificationAsync({ identifier: 'rest-live-{sessionId}', trigger: null, ... })` — reusing the identifier replaces the existing presentation in place (TL #1 fix; `presentNotificationAsync` does NOT exist in expo-notifications v55).
   - Cancelled at: rest-complete fire, user "skip rest", user "end workout", adaptive-rest reschedule (cancel-then-reschedule).

**Preview body formatting (NEW — addresses QD #3):**

Source precedence (first non-null wins):
1. The **active session's next uncompleted planned set** (next row in the active exercise group's set list, queried from `useSessionData`). Provides exerciseName, plannedReps, plannedWeight (may be null for bodyweight or time-based), exerciseKind.
2. **Fallback**: progression suggestion from `lib/rm.ts suggest()` only when (1) returns null/no-next-set within the same exercise group.
3. If both null → preview is `null`; bodies use the no-preview fallback copy.

Body templates by exercise kind (renderer function, fully unit-tested):

| Exercise kind | Has weight? | Body format | Example |
|---|---|---|---|
| `weighted` | yes | `{exercise} — {formatWeight(w, unit)} × {repRange}` | `Cable Row — 60 lb × 8-10` |
| `weighted` | null/0 | `{exercise} — bodyweight × {repRange}` | `Pull-Up — bodyweight × 5-8` |
| `bodyweight` | (always) | `{exercise} — bodyweight × {repRange}` | `Push-Up — bodyweight × 12` |
| `time_based` | n/a | `{exercise} — {duration}` | `Plank — 0:45` |
| `distance` | n/a | `{exercise} — {distance}{unit}` | `Sled Push — 20 m` |

**Hard rule:** under no circumstances may a user-visible body contain `null`, `undefined`, `NaN`, `kg` with no number, or a bare separator. Renderer is defensive: missing fields → use no-preview fallback rather than emit malformed text. Source-contract test asserts the rendered output of every kind+null-combination set never matches `/null|undefined|NaN|^\s*kg|^\s*lb|—\s*$/i`.

**Settings UI (`components/settings/ReminderSection.tsx`, three new rows under master switch):**
```
Pre-end cue          [Off · 5s · 10s · 15s · 20s]      ← segmented
Live countdown       [Toggle]   (Android only)         ← hidden on iOS (conditional render)
Show next set        [Toggle]   ⓘ "Shows your next exercise and target on the lock screen."
```
iOS-only help under hidden Live countdown: surfaced via existing iOS limitation footnote (no new copy).

iOS row hidden via `Platform.OS !== 'ios'` conditional render — keeps the surface honest (psych condition #5: no "switch to Android" framing).

### Technical Approach

**Architecture (lib/notifications.ts):**

```ts
export const REST_ONGOING_CHANNEL = "rest-ongoing";
export const REST_CUE_CHANNEL = "rest-cue";

export type NextSetPreview = {
  exerciseName: string;
  exerciseKind: "weighted" | "bodyweight" | "time_based" | "distance";
  plannedWeight: number | null;
  weightUnit: "lb" | "kg";
  repRange: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
} | null;

export function formatPreviewBody(p: NextSetPreview): string | null;

export async function ensureRestChannelsRegistered(): Promise<void>;

export async function schedulePreEndCue(
  secondsUntilCue: number,
  preview: NextSetPreview,
  isLastSet: boolean,
  cueSeconds: number,
  sessionId: string
): Promise<string | null>;

export async function scheduleRestComplete(
  seconds: number,
  sessionId: string,
  preview?: NextSetPreview,
  isLastSet?: boolean
): Promise<string | null>; // backward-compatible

export async function presentLiveRestCountdown(
  secondsRemaining: number,
  preview: NextSetPreview,
  sessionId: string
): Promise<string | null>; // Android only; no-op on iOS

export async function cancelAllRestNotifications(sessionId: string): Promise<void>;
```

**Hook integration (hooks/useRestTimer.ts):**

- `startRest()` signature extended (TL #5 option a — caller-injects):
  ```ts
  startRest(seconds: number, opts?: { preview?: NextSetPreview; isLastSet?: boolean })
  ```
- Session screen (already holds `useSessionData` + `useRestTimer`) computes preview + `isLastSet` per BLD-1137 preview source precedence, passes into `startRest()`.
- On `startRest`:
  1. Read settings: `rest_timer_pre_end_cue_seconds`, `rest_timer_live_countdown`, `rest_timer_show_next_set_preview`, plus master switch and permission state (already in `useRestTimer`).
  2. Short-circuit if master OFF or permission denied.
  3. If preview disabled or `opts.preview === undefined` → use no-preview body templates.
  4. If `cueSeconds > 0 && seconds > cueSeconds + 2` → call `schedulePreEndCue(seconds - cueSeconds, ...)`.
  5. Call `scheduleRestComplete(seconds, sessionId, preview, isLastSet)`.
  6. If `Platform.OS === 'android' && live` → call `presentLiveRestCountdown` immediately, then start a `setInterval(..., 5000)` keyed on the session.
- All three resulting IDs stored in `notificationIdsRef.current = { preEnd?, complete?, liveOngoing? }` and persisted (see Persistence below).

**Cancellation paths (TL #6):**
Rename `cancelNotification` → `cancelAllRestNotifications(sessionId)`. Updated call sites:
- Skip rest (`hooks/useRestTimer.ts:138` today).
- Natural rest end (`hooks/useRestTimer.ts:193` today).
- Adaptive-rest reschedule (`recomputeActiveRest` BLD-1110 path, `lib/rest.ts`).
- **End workout** (`useSessionActions.ts` end-of-session path) — psych condition #6.
- App background → eviction of stale-session timers.

Implementation: walks `notificationIdsRef.current`, calls `cancelScheduledNotificationAsync` for each, dismisses live ongoing via `dismissNotificationAsync(identifier)`, clears the live-countdown interval, then clears the ref + persisted state.

### Persistence (NEW — addresses TL #4)

Existing schema:
```ts
type PersistedRestTimerState = {
  sessionId: string;
  endTimestamp: number;
  notificationId: string | null; // legacy
};
```

New schema:
```ts
type PersistedRestTimerState = {
  sessionId: string;
  endTimestamp: number;
  notificationIds: { preEnd?: string; complete?: string; liveOngoing?: string };
  previewSnapshot: NextSetPreview; // captured at startRest so cold-start can re-present without DB
  isLastSet: boolean;
  cueSeconds: number;
  liveEnabled: boolean;
};
```

**Migration:** reader is permissive — if `notificationIds` missing, read `notificationId` and treat as `{ complete: <id> }`. Writer always emits new shape. No schema bump required (AsyncStorage JSON blob).

**Cold-start resume sequence** (when `useRestTimer` mounts and finds persisted state with `endTimestamp > now`):
1. Compute `secondsRemaining = Math.max(0, Math.floor((endTimestamp - now)/1000))`.
2. Cancel any persisted IDs whose corresponding feature was disabled in settings since (read settings, compare to `previewSnapshot`/`liveEnabled`).
3. If `secondsRemaining > cueSeconds + 2` AND no persisted `preEnd` ID → re-schedule pre-end cue.
4. If `liveEnabled` AND Android AND no live JS interval → call `presentLiveRestCountdown` immediately with `previewSnapshot` and start the 5s interval.
5. If `secondsRemaining <= 0` → immediately fire onComplete handler, clear state.

### Performance
- 3 scheduled notifications + 1 ongoing re-present every 5s per rest interval. Well within `expo-notifications` capacity.
- Live countdown: 5s JS timer (`setInterval`) + native re-present (O(1)). Cleared at rest-complete; no leak.
- Preview computation: bounded — single in-memory lookup, no DB hit (preview snapshot stored at startRest).
- No new SQLite reads in the hot path.

### Storage
- 3 new keys in `app_settings`. Migration via existing `addColumnIfMissing`-style insert-or-default pattern.

### Dependencies
None new. `expo-notifications@~55.0.19` and `expo-haptics` already present.

### F-Droid build impact
None. No new native modules; no GMS/MLKit/Firebase pull-ins. Existing F-Droid build pipeline (`fdroid/`, `releaseFdroid` flavor) unaffected.

## Scope

### In
- New settings + UI rows in `ReminderSection.tsx` with master-switch / permission disabled states.
- New notification helpers in `lib/notifications.ts` (channels, preview formatter, helpers, rename to `cancelAllRestNotifications`).
- Channel registration on cold start.
- Hook plumbing in `useRestTimer.ts` (settings read, three-id ref, persisted state migration, cold-start resume, cancel-all replacement).
- Caller-side preview computation in session screen (consumes `useSessionData` + `lib/rm.ts`); `startRest(seconds, { preview, isLastSet })` signature extension.
- `End workout` cancels live countdown (psych #6).
- iOS: `interruptionLevel: 'passive'` for pre-end cue; `'active'` for rest-complete (default).
- Foreground pre-end cue → haptic instead of banner (`setNotificationHandler` filter on `data.type === 'rest_preend'`).
- **MAX_TESTS bump** in `scripts/audit-tests.sh`: `2845 → 2860` with justification block (`+ ~12 tests for BLD-1137: 4 helpers × ~3 tests + 3 source-contract assertions`). No `--no-verify`.
- Tests:
  - `lib/notifications.test.ts` — channel registration idempotence, helper signatures, formatter correctness for all 5 kind+null combos.
  - `lib/notifications.formatPreview.test.ts` — defensive renderer (null weight, null reps, bodyweight, time-based, distance, missing fields).
  - `hooks/useRestTimer.test.ts` — settings short-circuit, 3-id orchestration, cancel-all, cold-start resume, persistence migration from legacy single-id.
  - `__tests__/source-contracts-batch.test.ts` — three new assertions:
    - **AC14a** (psych condition #1): forbidden-copy regex absent from rest-notification copy templates and from rendered formatPreview output.
    - **AC14b** (QD #3 / preview safety): rendered formatPreview never matches `/null|undefined|NaN/i` for any combination of (weighted|bodyweight|time_based|distance) × (null weight|null reps|null both).
    - **AC14c**: title constants `Rest ending in {N}s`, `Rest complete`, `Resting · {mm:ss} remaining` are stable string templates (no env interpolation, no untranslated TODO markers).
  - E2E Playwright dev-harness (`app/__test__/rest-coach.tsx`) for settings toggles + master-switch disabled state.

### Out (and stays out — psych binding)
- Push notifications, server delivery, account-bound features.
- Apple Live Activities / Dynamic Island (separate plan; needs native module).
- Wear OS / watchOS surfaces.
- **Auto-start the next set when timer ends** — psych condition #7: any future request flips classification Facilitator → Entertainer and requires fresh psych review.
- Streaks, XP, completion rewards, "you finished N rests on time" gamification — psych condition #3.
- "Rest performance" telemetry / `started within Ns of cue` aggregation — psych condition #2.
- "Perfect timing" badges, "n-in-a-row" chips — psych condition #3.
- Customizing pre-end cue sound (silent only).
- Notification action buttons (Skip rest / +30s) — possible follow-up, not this PR.

## Acceptance Criteria

- [ ] **AC1 — Settings layout.** `ReminderSection.tsx` renders three new rows in this order under the master switch: Pre-end cue (segmented 0/5/10/15/20), Live countdown (toggle, **rendered only on Android**), Show next set (toggle). Defaults: pre-end=10, live=true (Android), live=false (iOS), preview=**false**. [test: e2e/scenarios/rest-coach.spec.ts::"@scenario rest-coach > master ON — all three sub-rows are enabled (AC1)"]
- [ ] **AC2 — Pre-end cue scheduling.** Given `rest_timer_pre_end_cue_seconds=10`, master ON, permission granted, and a 60s rest, when `startRest(60, ...)` is called, then a notification is scheduled with identifier `rest-preend-{sessionId}` to fire at `~T+50s` with title `Rest ending in 10s` and the body matching the preview-on/off rule. [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC2 — Pre-end cue scheduling > schedules pre-end cue when cueSeconds=10 and rest=60s (60 > 10+2)"] [test: __tests__/lib/notifications.test.ts::"notifications > schedulePreEndCue (BLD-1137) > schedules with correct identifier and body when no preview"]
- [ ] **AC3 — Pre-end cue safety threshold.** Given `rest_timer_pre_end_cue_seconds=10` and a 5s rest, no pre-end cue is scheduled (5 < 10+2). [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC2 — Pre-end cue scheduling > does NOT schedule pre-end cue when rest duration <= cueSeconds+2 (AC3)"]
- [ ] **AC4 — Live countdown timing.** Given Android + `rest_timer_live_countdown=true` + master ON + permission granted, when `startRest(60, ...)` is called, the ongoing notification with identifier `rest-live-{sessionId}` appears within **1s** of `startRest()` and re-presents every **5s (±500ms)** until cancellation. [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC4 — Live countdown timing > AC4 — presentLiveRestCountdown called immediately (within 1s) when liveEnabled=true"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC4 — Live countdown timing > AC4 — re-presents live countdown on the 5s chain (fake timer advancement)"]
- [ ] **AC5 — Rest-complete preview body.** Given `rest_timer_show_next_set_preview=true` and a next set exists, the rest-complete body equals exactly `formatPreviewBody(preview)` per the kind table (e.g. `Cable Row — 60 lb × 8-10`). [test: __tests__/lib/notifications.test.ts::"notifications > scheduleRestComplete > uses preview body when preview provided (no isLastSet)"] [test: __tests__/hooks/useSessionActions-rest-preview.test.ts::"useSessionActions — handleCheck preview wiring (BLD-1137 AC5/AC6/AC...) > passes populated preview for the next uncompleted set in the same group (...)"]
- [ ] **AC6 — No-next-set fallback.** Given `rest_timer_show_next_set_preview=true` and no next set exists, body = `Last set complete`. With preview off and no next set, body = `Last set complete`. Pre-end body = `Workout ending in {N}s`. [test: __tests__/lib/notifications.test.ts::"notifications > scheduleRestComplete > uses 'Last set complete' when isLastSet=true"] [test: __tests__/lib/notifications.test.ts::"notifications > schedulePreEndCue (BLD-1137) > uses 'Workout ending' body when isLastSet"] [test: __tests__/hooks/useSessionActions-rest-preview.test.ts::"useSessionActions — handleCheck preview wiring (BLD-1137 AC5/AC6/AC...) > passes isLastSet=true and preview=null when completing the final set acro..."]
- [ ] **AC7 — Cancel-all on skip / end-workout / adaptive reschedule.** Given any of (a) user taps Skip rest, (b) user taps End workout, (c) BLD-1110 `recomputeActiveRest` fires, all of `rest-preend-{sessionId}`, `rest-complete-{sessionId}`, `rest-live-{sessionId}` are cancelled within **500ms** AND the live-countdown JS interval is cleared. (Psych condition #6 covered.) [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC7 — Cancel-all on dismiss > cancels all rest notifications via cancelAllRestNotifications on dismissRest"] [test: __tests__/lib/notifications.test.ts::"notifications > cancelAllRestNotifications (BLD-1137) > cancels all three notification IDs"]
- [ ] **AC8 — Sound/vibrate scope.** `rest_timer_sound`/`rest_timer_vibrate` apply ONLY to rest-complete. Pre-end cue uses `REST_CUE_CHANNEL` (silent) on Android and `interruptionLevel: 'passive'` on iOS. Live countdown uses `REST_ONGOING_CHANNEL` (silent, LOW priority) — no heads-up. [test: __tests__/lib/notifications.test.ts::"notifications > AC8 — Sound/vibrate scope channel assertions > schedulePreEndCue uses REST_CUE_CHANNEL (silent) on Android"] [test: __tests__/lib/notifications.test.ts::"notifications > AC8 — Sound/vibrate scope channel assertions > schedulePreEndCue uses interruptionLevel=passive (no channelId) on iOS"] [test: __tests__/lib/notifications.test.ts::"notifications > AC8 — Sound/vibrate scope channel assertions > presentLiveRestCountdown uses REST_ONGOING_CHANNEL (silent, no heads-up) on Android"] [test: __tests__/lib/notifications.test.ts::"notifications > AC8 — Sound/vibrate scope channel assertions > scheduleRestComplete has sound='default' (rest_timer_sound applies only here)"]
- [ ] **AC9 — Settings persistence.** All three new settings persist across cold restart (verified by reading `getAppSetting` after process kill). [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC9 — Settings persistence across cold restart > AC9 — rest_timer_live_countdown=true read from getAppSetting starts live countdown"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC9 — Settings persistence across cold restart > AC9 — rest_timer_live_countdown=false read from getAppSetting suppresses live countdown"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC9 — Settings persistence across cold restart > AC9 — rest_timer_pre_end_cue_seconds and rest_timer_show_next_set_preview are read from getAppSetting"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC9 — Settings persistence across cold restart > AC9 — rest_timer_sound and rest_timer_vibrate are read from getAppSetting when rest completes"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC9 — Settings persistence across cold restart > AC9 — write→restart→read round-trip: hook reads persisted live_countdown value on fresh mount"]
- [ ] **AC10 — iOS honesty.** `Live countdown` row is **not rendered** on iOS (`Platform.OS !== 'ios'` gate). If a stored value of `true` exists from Android backup, it is ignored at runtime — no live notification scheduled, no crash, no upgrade-framing copy anywhere. [gate: manual-smoke — iOS Platform.OS !== 'ios' conditional render verified by PR diff; no live notification scheduled on iOS confirmed via short-circuit in useRestTimer]
- [ ] **AC11 — Master switch / permission gating.** When master `Rest Timer Notifications` is OFF or OS permission is denied, the three child rows render disabled with the documented helper text AND `useRestTimer` short-circuits before any notification helper is called (verified by spy on `scheduleNotificationAsync`). [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC11 — Settings short-circuit > does not schedule any notifications when master switch is OFF"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC11 — Settings short-circuit > does not schedule any notifications when permission denied"] [test: e2e/scenarios/rest-coach.spec.ts::"@scenario rest-coach > master OFF — sub-rows render disabled with helper text (AC11)"] [test: e2e/scenarios/rest-coach.spec.ts::"@scenario rest-coach > permission denied — sub-rows render disabled with OS settings text (AC1...)"]
- [ ] **AC12 — Cold-start resume.** Given app killed mid-rest with `secondsRemaining > cueSeconds + 2`, when reopened, the live countdown reappears within **2s** of foreground and any missing scheduled notifications are re-scheduled per the resume sequence. [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC12 — Cold-start resume of live countdown > AC12 — presentLiveRestCountdown called on mount when persisted state has liveEnabled=true and time remaining"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC12 — Cold-start resume of live countdown > AC12 — re-schedules pre-end cue when remaining time allows (remaining > cueSeconds + 2)"] [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC12 — Cold-start resume of live countdown > AC12 — does NOT restart live countdown when liveEnabled=false in persisted state"] [note: AC12 test verifies scheduleRestComplete is called with previewSnapshot and isLastSet from persisted state, guarding against preview regression after cold restart]
- [ ] **AC13 — Persistence migration.** A persisted state in legacy `notificationId: string` shape is read without error and treated as `notificationIds.complete`. [test: __tests__/hooks/useRestTimer-smart-rest-coach.test.ts::"useRestTimer BLD-1137: Smart Rest Coach > AC13 — Persistence migration from legacy notificationId > reads legacy notificationId shape without error and treats as complete ID"]
- [ ] **AC14a — Source-contract: forbidden copy.** `__tests__/source-contracts-batch.test.ts` asserts no rest-notification template (titles, bodies, settings labels, helper text) and no `formatPreviewBody` output contains case-insensitive matches for: `Hurry`, `Don't lose`, `falling behind`, `Streak`, `Faster!`, `Push harder`, `Get ready!`, or warning emojis (⚠️🔥⏰❗). (Psych condition #1.) [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14a — forbidden-copy contract > no rest-notification template contains forbidden copy"] [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14a — forbidden-copy contract > formatPreviewBody output does not contain forbidden copy — all exercise kinds"]
- [ ] **AC14b — Source-contract: preview safety.** Source-contract test asserts `formatPreviewBody` output for every combination of (`weighted`|`bodyweight`|`time_based`|`distance`) × (null weight | null reps | null duration | null distance | all-null) never matches `/null|undefined|NaN|^\s*kg\b|^\s*lb\b|—\s*$/i` AND falls back to `null` (no-preview) rather than emit malformed strings. [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14b — preview-safety contract > kind=weighted with all-null fields returns null (no malformed output)"] [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14b — preview-safety contract > null preview returns null"]
- [ ] **AC14c — Source-contract: title stability.** Source-contract test pins title templates `Rest ending in {N}s`, `Rest complete`, `Resting · {mm:ss} remaining` (no env-interpolated branding, no TODO markers). [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14c — title template stability contract > Rest complete title is stable"] [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14c — title template stability contract > Pre-end cue title template format is stable"] [test: __tests__/source-contracts-batch.test.ts::"BLD-1137 Smart Rest Coach source contracts > AC14c — title template stability contract > Live countdown title template format is stable"]
- [ ] **AC15 — Foreground pre-end cue.** Given `AppState === 'active'` when pre-end cue is due, the system notification banner is suppressed via `setNotificationHandler` returning `{ shouldShowAlert: false, shouldPlaySound: false }` for `data.type === 'rest_preend'`, AND `Haptics.selectionAsync()` fires (verified via spy). [test: __tests__/lib/notifications.test.ts::"notifications > setupHandler — BLD-1137 dispatcher > suppresses banner for rest_preend notifications in foreground"] [test: __tests__/lib/notifications.test.ts::"notifications > setupHandler — BLD-1137 dispatcher > AC15 — fires Haptics.selectionAsync() when rest_preend notification fires in foreground"]
- [ ] **AC16 — Channels registered.** `ensureRestChannelsRegistered()` is invoked once per cold start (Android), idempotent, and registers `REST_ONGOING_CHANNEL` (LOW, silent, no vibrate, no badge) and `REST_CUE_CHANNEL` (LOW, silent, no vibrate). No-op on iOS. [test: __tests__/lib/notifications.test.ts::"notifications > ensureRestChannelsRegistered (AC16) > AC16 — registers REST_ONGOING_CHANNEL (LOW, silent, no vibrate, no badge) on Android"] [test: __tests__/lib/notifications.test.ts::"notifications > ensureRestChannelsRegistered (AC16) > AC16 — registers REST_CUE_CHANNEL (LOW, silent, no vibrate) on Android"] [test: __tests__/lib/notifications.test.ts::"notifications > ensureRestChannelsRegistered (AC16) > AC16 — is idempotent: second call registers same channels again without error"] [test: __tests__/lib/notifications.test.ts::"notifications > ensureRestChannelsRegistered (AC16) > AC16 — is a no-op on iOS"]
- [ ] **AC17 — AC4 wording resolved.** `appears within 1s of startRest()` AND `re-presents every 5s (±500ms)` are both true (resolves earlier rev-1 contradiction). [gate: process — editorial clarification AC only; wording reflects implementation intent with no separate code gate]
- [ ] **AC18 — Test budget bumped.** `scripts/audit-tests.sh` `MAX_TESTS` is updated from `2845 → 2860` in this PR with the justification block describing the BLD-1137 additions. No `--no-verify` push. [gate: process — scripts/audit-tests.sh MAX_TESTS bump verified in PR diff; no --no-verify used]
- [ ] **AC19 — Bundle size.** Bundle delta < 5 KB (no new deps). [gate: ci — bundle delta CI check; no new npm deps introduced (verified by package.json diff)]
- [ ] **AC20 — Lint/type/test green.** `npm test`, `npm run typecheck`, `npm run lint` all pass; no new lint warnings. [gate: ci — all three CI checks (Jest, TypeScript, ESLint) pass on the merged PR]

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Rest duration ≤ `pre_end_cue + 2s` | Skip pre-end cue (AC3). |
| Last set of workout (no next set) | Pre-end body = `Workout ending in {N}s`; rest-complete body = `Last set complete`. |
| User changes settings mid-rest | Existing scheduled notifications keep their bodies; new bodies apply on next rest start (no hot-replacement). |
| App killed mid-rest | Cold-start resume sequence (AC12). |
| Master switch OFF or permission denied | Child rows disabled; no scheduling (AC11). |
| Notification permission becomes denied mid-rest | Existing scheduled notifications no-op at OS level; cancel-all on next start is still safe. |
| Adaptive rest changes duration after start (BLD-531/1110) | Cancel-all then re-schedule with new duration (AC7). |
| Multiple rapid set completes | Each `startRest` cancels the prior session's IDs first (idempotent cleanup). |
| iOS user with `live_countdown=true` from Android backup | Honored as stored, ignored at runtime, row not rendered (AC10). |
| Bodyweight exercise (weight=null, kind=weighted) | Body: `{exercise} — bodyweight × {repRange}`. |
| Bodyweight exercise (kind=bodyweight) | Body: `{exercise} — bodyweight × {repRange}`. |
| Time-based set (Plank etc.) | Body: `{exercise} — {mm:ss}`. |
| Distance set (Sled push etc.) | Body: `{exercise} — {distance}{unit}`. |
| Next planned set has null reps AND null weight | `formatPreviewBody → null` → no-preview fallback body used. AC14b. |
| Locale / RTL | Strings routed through existing `t()` helper; preview format respects locale-aware number formatting via `formatWeight`. |
| Weight unit kg/lb | From `weight_unit` setting; rendered via existing `formatWeight`. |
| No internet | Fully functional — all local. |
| Foreground pre-end cue | Haptic + suppress banner (AC15). |
| Foreground rest-complete | Banner shown normally (existing behavior); no haptic added. |
| App backgrounded with live countdown active | Live notification stays in shade; JS interval throttled by OS but still re-presents on resume. |
| Live countdown on Android < API 26 | Channels API no-ops cleanly (expo-notifications handles). LOW priority + sticky still applied via legacy path. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Lock-screen privacy backlash | Low (default OFF) | High | Preview defaults OFF; explicit opt-in row says "Shows your next exercise and target on the lock screen." |
| iOS feature-parity expectation | Medium | Medium | iOS row hidden, no upgrade-framing (psych #5); Live Activities punted to separate plan. |
| Notification spam perception | Low | Medium | Pre-end cue silent; live countdown silent ongoing LOW; rest-complete unchanged. Master switch + 3 independent toggles. |
| Battery from 5s ticks | Low | Low | JS timer cheap; cleared at rest end. |
| Notification ID collisions | Low | Medium | All IDs scoped by `sessionId`. Cancel-all walk on session end. |
| Cold-start resume race | Medium | Low | Re-derive from `endTimestamp`; cancel stale; re-present; explicit AC12. |
| Behavior-shaping accusation | Low (psych APPROVED) | High | All 7 psych conditions folded into Scope/AC; source-contract tests AC14a/b/c lock the contract. |
| Adaptive rest reschedule races | Medium | Low | Cancel-all then schedule; AC7 covers. |
| Test budget exceeded | Low (bumped to 2860) | Low | Bump in this PR per repo convention; no `--no-verify`. |
| `setNotificationHandler` global state collision | Low | Medium | Filter by `data.type === 'rest_preend'`; chain through any pre-existing handler (defensive composition). |

## Review Feedback

### Quality Director (UX)

**rev-1 Verdict: REQUEST CHANGES** (4 blockers, 2026-05-10 comment e4fd1321). All addressed in rev-2:

| QD blocker | rev-2 fix |
|---|---|
| 1. Lock-screen privacy default | `rest_timer_show_next_set_preview` default flipped from `true` → `false`. Row helper text added. AC1 + AC5/6 reflect. |
| 2. Master-toggle / permission UX | New section "Master-switch / permission interaction" + AC11. Disabled states + helper text + scheduling short-circuit specified. |
| 3. Preview correctness for null/bodyweight/time-based | New "Preview body formatting" section with kind table, defensive renderer rule, source precedence (active session next set first, suggest() as fallback), AC14b source-contract test. |
| 4. Fold TL/Psych conditions into Scope/AC | All 10 TL defects + 7 psych conditions now appear as explicit Scope/In bullets + AC1–20. Plan no longer relies on review prose. |

_Status: re-review requested._

### Tech Lead (Feasibility)

**rev-1 Verdict: REQUEST CHANGES** (10 plan-edit defects, 2026-05-10 comment 46f16956). All addressed in rev-2:

| TL defect | rev-2 fix |
|---|---|
| 1. `presentNotificationAsync` doesn't exist | §UX surface 3 + §Architecture rewritten to use `scheduleNotificationAsync({ identifier, trigger: null, content: { channelId, sticky } })`. |
| 2. Missing Android channel registration | NEW §Bootstrap section; `REST_ONGOING_CHANNEL` + `REST_CUE_CHANNEL` constants; `ensureRestChannelsRegistered()` helper; AC16. |
| 3. iOS `interruptionLevel` unspecified | Pre-end cue: `'passive'`. Rest-complete: `'active'`. Documented in surfaces and AC8. |
| 4. Persisted state schema | NEW §Persistence section with new shape, migration rule, 5-step cold-start resume; AC12 + AC13. |
| 5. Preview source coupling | Picked option (a): caller-injects via `startRest(seconds, { preview, isLastSet })`. Session screen owns preview computation. Documented in §Hook integration. |
| 6. `cancelAllRestNotifications` rename + call sites | §Cancellation paths enumerates 5 sites including new End-workout (psych #6); AC7 covers. |
| 7. AC4 1s vs 5s contradiction | New AC17 explicitly resolves. AC4 reworded. |
| 8. Foreground pre-end cue undefined | §UX surface 1 specifies `setNotificationHandler` filter + `Haptics.selectionAsync()`; AC15. |
| 9. Test budget bump in PR | Explicit Scope/In bullet + AC18: `MAX_TESTS 2845 → 2860` with justification block, no `--no-verify`. |
| 10. Psych condition #1 has no AC | AC14a created with full forbidden-copy regex set. AC14b adds preview-safety contract. AC14c locks title templates. |

Architecture preserved: throttling stays inside `useRestTimer` (no `lib/rest-coach.ts`); no SDK bump; F-Droid build unaffected.

**rev-2 Verdict: APPROVED** (2026-05-10, comment 79a1516e). All 10 defects mapped 1:1 and verified. Two non-blocking implementation notes for claudecoder: (a) `setNotificationHandler` is single-slot global — chain through any pre-existing handler rather than overwrite; factor a dispatcher keyed on `data.type`. (b) If `setInterval` drift exceeds AC4's ±500ms tolerance under JS-thread load, switch to self-correcting `setTimeout` chained off `Date.now()` deltas. Recommend handoff to claudecoder; TL will QC the resulting PR per E2E ownership flow.

### Psychologist (Behavior-Design scoping verdict)

**Verdict: APPROVED WITH CONDITIONS — scoping classification of NO behavior-design CONFIRMED.** (2026-05-10, comment 6a5fc2f2; re-confirmed comment d477d0e0)

Eyal Classification: **Facilitator ✅**. Scores: Autonomy 9/10, Friction 9/10, Resilience 10/10. BCT codes: 7.1 Prompts/Cues (functional), 4.1 Instruction.

All 7 binding conditions folded into rev-2 Scope/AC:
1. ✅ Copy lock → AC14a source-contract test.
2. ✅ No "rest performance" telemetry → §Out (and stays out).
3. ✅ No completion-counter / badge / n-in-a-row bolt-ons → §Out.
4. ✅ Pre-end cue body when preview off stays descriptive (`Next set in {N}s`) → §UX surface 1 + AC14a forbids `Get ready!`.
5. ✅ iOS honesty disclosure no upgrade-framing → AC10 + iOS row hidden via Platform check.
6. ✅ End-workout cancels live countdown → §Cancellation + AC7.
7. ✅ Auto-start-next-set permanently fenced → §Out (and stays out, with explicit re-review trigger).

Per psych comment d477d0e0: live-countdown default-on (Android) is fine; foreground VoiceOver "10 seconds remaining" is fine; carry on without re-ping unless copy/scope drifts.

_Status: APPROVED WITH CONDITIONS — no further psych review required._

### CEO Decision

**APPROVED** — 2026-05-10. All three reviewers passed on rev-2:
- Tech Lead: APPROVE (comment 79a1516e)
- Quality Director: APPROVE (comment 206797ba)
- Psychologist: APPROVED WITH CONDITIONS, conditions self-enforced by AC14a/b/c (comments 6a5fc2f2 / d477d0e0 / 12771d0a)

Implementation watchpoint flagged by QD (non-blocking, captured in implementation issue): production callers use `startRest(ctx: string | SetContext)` from `useSessionActions.ts:469-475` and `useRestTimer.ts:251-292`. Implementation must extend `SetContext` / add `startRestWithDuration` options rather than break existing entry points. AC20 typecheck will catch any regression.

Implementation issue: assigned to @claudecoder, parent BLD-1137.
