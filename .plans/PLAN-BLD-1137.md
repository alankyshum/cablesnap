# Feature Plan: Smart Rest Coach — pre-end cue + live countdown notification + next-set preview

**Issue**: BLD-1137  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW

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
- [x] **NO** — purely informational/functional cue. The feature delivers **task-relevant information at the moment the user already plans to perform the next set**. There is **no streak**, no XP, no reward loop, no re-engagement of lapsed users, no FOMO/loss-framing, no identity language, no social/leaderboard.
- ⚠ Notification surface is on the §3.2 trigger list, so a **psychologist scoping verdict** is requested out of caution to confirm "ongoing functional countdown for an in-flight task" is not a behavior-shaping mechanism.

## What CableSnap has today
- Auto-start rest timer on set complete (`hooks/useRestTimer.ts`, `useSessionActions.ts:469`).
- Adaptive rest duration (BLD-531 `lib/rest.ts`).
- Single fire-once "Rest complete" local notification (`lib/notifications.ts:155 scheduleRestComplete`).
- Vibrate + sound at end (settings `rest_timer_vibrate`, `rest_timer_sound`).

## User Stories
- As a lifter resting between sets with the phone face-down, I want a subtle cue 5–10s before rest ends so I can mentally prep (grip, breathing) and start the next set on time.
- As a lifter resting with the phone in my pocket, I want a glanceable live countdown on the lock screen so I can check remaining time **without unlocking** (unlocking = social media trap).
- As a lifter who reaches for the phone when rest ends, I want the rest-complete notification to **show the next set's exercise, target weight, and rep range** so I can step up and start without opening the app.

## Proposed Solution

### Overview
Replace the single fire-at-end scheduling call with a **scheduled set of up to three notifications per rest interval**, plus a **live ongoing notification** (Android) / **dynamic content update** (iOS) that updates remaining time. All scheduled locally via `expo-notifications` — no cloud, no new deps.

### UX Design

**Settings (new, in existing Rest Timer settings group):**
- `rest_timer_pre_end_cue_seconds` — integer, 0=off, default `10`. Range: 0, 5, 10, 15, 20.
- `rest_timer_live_countdown` — boolean, default `true` on Android, `false` on iOS (iOS has no true ongoing-notification; falls back to dynamic body updates only — see Edge Cases).
- `rest_timer_show_next_set_preview` — boolean, default `true`.

**Notification surfaces:**

1. **Pre-end cue notification** (when `rest_timer_pre_end_cue_seconds > 0` AND remaining ≥ pre_end + 2s safety):
   - Title: `Rest ending in {N}s`
   - Body (with preview enabled): `Next: {exercise} — {target_weight}{unit} × {rep_range}`
   - Body (preview off): `Next set in {N}s`
   - Sound: silent (no vibrate/ding here — this is a glance cue, not an alarm).
   - Tag/identifier: `rest-preend-{sessionId}`.

2. **Rest-complete notification** (existing, enhanced):
   - Title: `Rest complete`
   - Body (with preview enabled): `{exercise} — {target_weight}{unit} × {rep_range}`
   - Body (preview off): `Time for your next set` (unchanged).
   - Sound + vibrate respect existing `rest_timer_sound` / `rest_timer_vibrate` settings (UNCHANGED).
   - Tag/identifier: `rest-complete-{sessionId}` (unchanged).

3. **Live ongoing notification** (Android only, when `rest_timer_live_countdown=true`):
   - Title: `Resting · {mm:ss} remaining`
   - Body: `{exercise} · Next: {target_weight}{unit} × {rep_range}` (or `Resting…` if preview off).
   - `ongoing: true`, `sticky: true`, no sound, no vibrate, low priority (no heads-up).
   - Updated every **5 seconds** via `setNotificationChannelAsync` + `presentNotificationAsync` (re-present same id replaces in-place on Android).
   - Cancelled at rest-complete and on user "skip rest".

**Settings screen surface (`app/settings/notifications.tsx` or wherever rest settings live):**
Three new rows under Rest Timer:
```
Pre-end cue          [Off · 5s · 10s · 15s · 20s]      ← segmented control
Live countdown       [Toggle]   (Android only label)
Show next set        [Toggle]
```
Help text under "Live countdown" on iOS: `Live countdown is Android-only. iOS shows a single rest-complete notification.`

**Empty/null state:** if no next set exists (last set of session), preview falls back to `"Last set complete"` (and pre-end cue body falls back to `"Workout ending in {N}s"`).

### Technical Approach

**Architecture:**
- Extend `lib/notifications.ts` with three new exports:
  - `schedulePreEndCue(secondsUntilEnd, preview, sessionId)` → returns id or null.
  - `presentLiveRestCountdown(secondsRemaining, preview, sessionId)` → idempotent re-present (Android only).
  - `cancelLiveRestCountdown(sessionId)`.
- Existing `scheduleRestComplete` gains optional `preview?: NextSetPreview` param. Backward compatible (caller may omit).
- `NextSetPreview` shape: `{ exerciseName: string; targetWeight: number | null; weightUnit: "lb" | "kg"; repRange: string }`.

**Hook integration (`hooks/useRestTimer.ts`):**
- On rest start (after computing `seconds`), in parallel:
  1. Read settings (cue seconds, live toggle, preview toggle) once.
  2. Resolve next-set preview via existing session/exercise data (no new DB queries — data already in memory in `useSessionData`).
  3. If `cueSeconds > 0 && seconds > cueSeconds + 2`, call `schedulePreEndCue(seconds - cueSeconds, ...)`.
  4. Call `scheduleRestComplete(seconds, sessionId, preview)`.
  5. If Android + live toggle on, start a `setInterval(presentLiveRestCountdown, 5000)`; clear on rest-complete or skip.

**Cancellation paths:** existing `cancelRestComplete` extended to also cancel pre-end cue and live countdown for the session. Add `cancelAllRestNotifications(sessionId)` helper.

**Next-set preview resolution:**
Already-in-memory data only:
- Current `exerciseId` and the next planned set in the active session group (from `useSessionData`).
- Target weight: re-use existing `lib/rm.ts suggest()` output (already wired into `LastNextRow`).
- Weight unit: from `getAppSetting("weight_unit")`.

If the suggest call fails or no next set exists → preview is `null` → bodies fall back to existing copy.

**Performance:**
- 3 scheduled notifications per rest interval (vs 1 today). Negligible — `expo-notifications` handles thousands.
- Live countdown updates every 5s via JS timer + native re-present; no battery impact (system handles ongoing).
- No new SQLite reads in the hot path — preview is plumbed in via React state already in scope.

**Storage:**
- 3 new keys in app_settings. Migration via existing `addColumnIfMissing`-style insert-or-default pattern.

**Dependencies:** none. Uses existing `expo-notifications` only.

## Scope

**In:**
- New settings + UI rows.
- New notification helpers + hook plumbing.
- Pre-end cue, live countdown (Android), enhanced rest-complete body.
- Fallback behavior on iOS (no ongoing notification — only pre-end cue + enhanced rest-complete).
- Tests: lib/notifications.ts (new helpers), hook orchestration (timer + preview wiring), settings persistence, e2e Playwright dev-harness scenario covering settings toggles.

**Out (explicitly):**
- Push notifications, server delivery, account-bound features.
- Apple Live Activities / Dynamic Island (separate future plan if requested — requires native module).
- Wear OS / watchOS surfaces.
- Auto-start the next set when timer ends (deliberate — user must initiate).
- Streaks, XP, completion rewards, "you finished N rests on time" gamification.
- Customizing pre-end cue sound (uses silent only — keeping it an information cue, not an alarm).
- Notification action buttons ("Skip rest", "Add 30s") — possible follow-up issue but out of this scope.

## Acceptance Criteria

- [ ] AC1 — Settings screen exposes the three new rows (Pre-end cue, Live countdown, Show next set) with stated defaults; iOS hides Live countdown toggle or disables it with help text.
- [ ] AC2 — Given `rest_timer_pre_end_cue_seconds=10` and a 60s rest, when rest starts, then a notification fires at T+50s with title "Rest ending in 10s" and a body matching the preview-enabled/disabled rule above.
- [ ] AC3 — Given `rest_timer_pre_end_cue_seconds=10` and a 5s rest, when rest starts, then NO pre-end cue is scheduled (5 < 10+2).
- [ ] AC4 — Given Android + `rest_timer_live_countdown=true`, when rest starts at 60s, then an ongoing notification appears within 1s with title `Resting · 1:00 remaining` and updates at 0:55, 0:50, … (verified with 5s ticks).
- [ ] AC5 — Given `rest_timer_show_next_set_preview=true` and a next set exists, the rest-complete notification body equals `{exercise} — {target_weight}{unit} × {rep_range}` exactly.
- [ ] AC6 — Given `rest_timer_show_next_set_preview=true` and no next set exists, the rest-complete body falls back to `Last set complete` (no nulls in user-visible text).
- [ ] AC7 — Given user taps "Skip rest", all three notifications (pre-end cue, live countdown, rest-complete) for the active session are cancelled within 500ms.
- [ ] AC8 — Existing `rest_timer_sound`/`rest_timer_vibrate` continue to apply ONLY to the rest-complete notification (pre-end cue + live countdown remain silent).
- [ ] AC9 — Settings persist across app restart (verified by reading `getAppSetting` on cold start).
- [ ] AC10 — On iOS, `rest_timer_live_countdown` setting is ignored at runtime (no live countdown attempted) AND the UI surfaces this clearly (disabled or hidden).
- [ ] AC11 — Bundle size delta < 5 KB (no new deps, sanity check).
- [ ] AC12 — All `npm test`, `npm run typecheck`, `npm run lint` pass; no new lint warnings.
- [ ] AC13 — `scripts/audit-tests.sh` budget respected (bump with comment if needed; do not `--no-verify`).

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Rest duration shorter than `pre_end_cue + 2s` | Skip pre-end cue (AC3). |
| Last set of workout (no next set) | Pre-end body = `Workout ending in {N}s`; rest-complete body = `Last set complete`. |
| User changes settings mid-rest | Existing scheduled notifications keep their already-set bodies; new bodies apply on next rest start. (Cheaper + zero risk vs hot-replacement.) |
| App killed mid-rest | Scheduled notifications still fire (OS-level). Live countdown stops because JS timer dies — this is acceptable; on re-foreground we resume the live notification from the persisted timer state. |
| Notification permission denied | All helpers return null (existing pattern); no errors surfaced to user. |
| Adaptive rest changes duration after start (BLD-531) | Cancel old scheduled set, re-schedule with new duration. Existing cancel pattern is reused. |
| Multiple rapid set completes | Each rest start cancels the previous session's notifications first (idempotent cleanup). |
| iOS user with Live countdown stored as `true` from Android backup | Setting honored as stored but ignored at runtime; no crash. |
| Locale / RTL | Strings sent to i18n layer (existing `t()` pattern); preview format unchanged. |
| Weight unit kg vs lb | Pulled from `weight_unit` setting; unit suffix matches; no rounding (use existing `formatWeight`). |
| No internet | Fully functional — all local. |
| Foreground vs background | Pre-end cue + rest-complete fire identically (scheduled). Live countdown only visible from notification shade — if app is foreground, optional dismiss to avoid duplicate cue (UX nicety; default keep showing for consistency). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| iOS lacks true ongoing-notification → users expect feature parity | Medium | Medium | Hide/disable toggle on iOS, document with help text, document in CHANGELOG. Future native-module plan if demand emerges. |
| Notification spam perception (3 vs 1) | Low | Medium | Pre-end cue silent + low-priority; live countdown silent ongoing; rest-complete unchanged. Settings allow disabling each independently. |
| Battery from 5s timer ticks | Low | Low | JS timer is cheap; native re-present is O(1). Stops at rest-complete. |
| Notification ID collisions | Low | Medium | Tags include `sessionId`. Cleanup on session end. |
| Behavior-shaping accusation (notifications are §3.2 triggers) | Low | High | Plan-classified NO; psychologist scoping verdict requested; no streaks/rewards/identity/loss-framing in copy. Pure functional cue for in-flight task. |
| Adaptive rest re-schedule races | Medium | Low | Cancel-then-schedule pattern; existing test coverage extended. |
| Test budget exceeded | Medium | Low | Add justification block in `scripts/audit-tests.sh` per repo convention. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design scoping verdict)
_Pending_

### CEO Decision
_Pending_
