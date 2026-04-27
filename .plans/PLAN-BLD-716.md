# Feature Plan: Wear OS Companion App

**Issue**: BLD-716   **Author**: CEO   **Date**: 2026-04-27
**Status**: DRAFT → IN_REVIEW

## Research Source
- **Origin:** GitHub #245 (https://github.com/alankyshum/cablesnap/issues/245), authored by product owner alankyshum 2026-04-20
- **Pain point observed:** Owner wants to track workouts on-watch without phone-in-hand; no existing free open-source Wear OS workout tracker integrates with a self-hosted/offline-first phone app
- **Frequency:** Owner-prioritized; mirrors recurring Reddit theme ("I switched from Strong/JEFIT because their watch app sucks / costs money / requires their cloud")

## Problem Statement

CableSnap is currently phone-only. For the gym setup the owner uses (cable + bodyweight, single-machine flows), holding a phone between sets is awkward — gym towels, hand chalk, and machine handles fight for the same hand. Strong charges for its Apple Watch app and has no Wear OS app at all; JEFIT requires a paid plan and cloud sync. CableSnap's offline-first, open-source, locally-stored architecture makes a Wear OS companion a unique competitive moat: **the only open-source Wear OS workout tracker that doesn't phone-home anywhere.**

## Behavior-Design Classification (MANDATORY)

- [ ] **YES** — _N/A_
- [x] **NO** — purely a new platform/UX surface for existing tracking flows. No streaks, no notifications-for-engagement, no rewards/XP, no gamification, no social/leaderboard, no motivational copy. Haptic feedback on rest-timer end is purely functional (timer signal), not behavior-shaping. Psychologist review **N/A**.

> Reviewer note: CEO will revisit classification if any milestone introduces motivational copy, streak surfacing, or push-style "time to work out" reminders. Each milestone must self-classify.

## User Stories

- As a CableSnap user mid-set, I want to log reps/weight from my watch so I can keep my phone in my bag.
- As a CableSnap user mid-rest, I want a wrist-haptic rest-timer that auto-progresses so I don't keep checking my phone screen.
- As a CableSnap user starting a workout, I want to launch a saved template directly from the watch so I never need the phone in the gym.
- As a privacy-conscious user, I want phone↔watch data to never leave my devices — no Google account sync, no cloud server.

## Proposed Solution

### Overview

Native Kotlin + Jetpack Compose for Wear OS app paired to the CableSnap phone app via a custom Expo native module that bridges Google's Wearable Data Layer API. Watch app reads templates and writes workout/set events; phone app remains the source of truth (SQLite). All sync is point-to-point Bluetooth via Google's `MessageClient` / `DataClient` — no cloud dependency.

### UX Design

**Watch screens** (per owner spec, with refinements):

1. **Template Library** — `ScalingLazyColumn` listing synced templates. Tap → start workout immediately (no confirm). Empty state: "No templates synced — open CableSnap on your phone."
2. **Live Workout Tracking** — Per-exercise card. Horizontal swipe between exercises (no swipe past last). Header: exercise name (truncated, marquee on focus). Body: weight stepper (±, large tap targets, rotary input), reps stepper (±, rotary), set counter ("Set 2 of 4"). Footer: "Complete Set" pill (full-width).
3. **Rest Timer** — Circular `ProgressRing` countdown of the user's configured rest duration. Buttons: "+30s" (left), "Skip" (ghost, right). Haptic double-buzz on completion. Auto-returns to Live Tracking after the buzz.
4. **Set Management** (long-press on Set Counter) — Add Set / Delete Current Set (danger style on Delete).
5. **Workout Controls** (long-press on header) — Active: Pause / Finish. Paused: Resume / Cancel (long-press confirms cancel).

**A11y**:
- All steppers expose `contentDescription` reading current value + units ("forty-five kilograms").
- Rotary input is the primary input modality — touch is fallback.
- Color/contrast: WCAG AA on the gray-on-black Wear theme (must verify on real watch).
- Haptics are mandatory feedback; do not replace with sound only (gym noise).

**Error & empty states**:
- Phone disconnected → live tracking card shows "Phone disconnected — set will sync when reconnected" banner. Set events queue locally until reconnect.
- No templates synced → Template Library shows the empty state above.
- Battery <10% → no app-level intervention (Wear OS handles).

### Technical Approach

#### Module structure

```
plugins/expo-wearos/
  android/
    src/main/java/com/cablesnap/wearos/
      WearOSModule.kt        # Expo module, sync API for JS layer
      MessageHandler.kt      # MessageClient receiver
      DataLayerHelper.kt     # DataClient writes
  ios/                       # Empty stub (Wear OS has no iOS counterpart)
  src/
    index.ts                 # JS API: startWatchSync, sendTemplates, onSetComplete
    types.ts
  expo-module.config.json
```

#### Watch app structure

```
wear/   (separate Gradle module under android/)
  src/main/java/com/cablesnap/wear/
    MainActivity.kt
    ui/
      TemplateListScreen.kt
      LiveWorkoutScreen.kt
      RestTimerScreen.kt
      SetManagementSheet.kt
    data/
      DataLayerClient.kt     # Wearable Data Layer wrapper
      TemplateRepo.kt        # In-memory cache, refreshed via DataClient
      SetEventQueue.kt       # Persists pending events when phone is disconnected
    haptics/HapticController.kt
```

#### Communication protocol

| Direction | Mechanism | Payload | Frequency |
|---|---|---|---|
| Phone → Watch | `DataClient.putDataItem('/templates')` | Full templates list (small JSON) | On template change; on watch reconnect |
| Phone → Watch | `MessageClient.sendMessage('/active-workout')` | Active workout snapshot | On workout start |
| Watch → Phone | `MessageClient.sendMessage('/set-complete')` | { sessionId, exerciseId, setNumber, weight, reps, completedAt } | Every Complete Set |
| Watch → Phone | `MessageClient.sendMessage('/set-mutate')` | Add/delete/update events | As triggered |
| Watch → Phone | `MessageClient.sendMessage('/workout-control')` | pause/resume/finish/cancel | As triggered |

All payloads are JSON-stringified and < 1KB. Phone is single-source-of-truth: the watch optimistically updates UI but reconciles to the phone's response on the next sync tick.

#### Data model touch-points

- No new SQLite tables. All set events flow through the existing `addSet`/`updateSet`/`deleteSet` APIs (`hooks/useSessionActions.ts`, `lib/db/session-sets.ts`).
- New Expo module exposes a `useWatchSync(sessionId)` React hook that listens for watch events and calls the existing handlers.
- Reverse direction: when the phone updates a set (e.g., user edits on phone mid-workout), broadcast a `/set-update` message so the watch reflects.

#### Dependencies

- **Phone (existing stack):** Expo 55, RN 0.83. New custom Expo native module — no third-party RN libraries.
- **Phone (new gradle deps):** `com.google.android.gms:play-services-wearable`.
- **Watch (new gradle module):** Kotlin 1.9+, Compose for Wear OS 1.4+, `play-services-wearable`, AndroidX Wear `ProgressIndicator`/`ScalingLazyColumn`.
- **No JS deps added.**

#### Performance

- Watch app target: 60fps on Pixel Watch 2 / Galaxy Watch 6 (the most common Wear OS 4 devices). Must remain readable on 1.4" display @ 384px.
- Battery: rest-timer screen must not exceed 5% drain per 30-min workout. Use `AlwaysOnDisplay` ambient-mode rendering for the timer.
- Sync latency: < 500ms p99 phone↔watch round-trip in Bluetooth range.

#### Testing strategy

- **Phone module:** unit-test the JS wrapper (jest mocking the native module); integration-test against a fake DataLayer in CI.
- **Watch app:** Compose UI tests via `androidx.compose.ui.test`. Run on the Wear OS 4 emulator in CI.
- **Pairing:** manual on-device QA test plan covering: pair, unpair, phone offline, watch offline, mid-workout disconnect, battery <10%, template change during active workout.

## Scope

**In (full feature):**
- All 5 watch screens described above
- Phone↔watch sync via custom Expo module
- Wear OS 4+ support (covers Pixel Watch 1+, Galaxy Watch 4+, ~95% of installed base in 2026)
- A11y: rotary input, screen-reader labels, haptic feedback
- Disconnect-tolerant set-event queue

**Out (initial release):**
- iOS / WatchOS companion (separate XL feature; would require parallel Swift/SwiftUI track)
- Standalone watch mode — companion only; phone must be paired
- Custom workout authoring on watch (read-only template library; create/edit on phone)
- Heart-rate integration (separate Health Connect work — see BLD-715)
- Wear OS 3 support (legacy; would require divergent Compose-for-Wear API surface)
- Custom watch faces or complications (separate XL feature)

## Milestones

This XL feature ships as a **5-PR sequence**, each independently mergeable, behind a **feature flag** until M5 lands. CEO will create one implementation issue per milestone.

| M | Scope | PR size | Reviewer(s) |
|---|---|---|---|
| **M1** | Custom Expo module skeleton + DataLayer wrapper (no UI). Phone broadcasts hello-world to watch; watch logcat-prints. Smoke test only. | S/M | techlead |
| **M2** | Watch app M1: Template Library screen. Phone sends templates; watch displays + tap-to-start sends `/active-workout` to phone. Phone listener stub. | M | techlead + QD |
| **M3** | Watch app M2: Live Workout Tracking screen. Steppers + Complete Set. Phone receives `/set-complete` → routes to existing `addSet`/`updateSet`. | M/L | techlead + QD |
| **M4** | Watch app M3: Rest Timer + haptics. Set Management sheet. Workout Controls. | M | techlead + QD |
| **M5** | Disconnect-tolerant queue + ambient mode + a11y polish + feature-flag removal + release notes. | M | techlead + QD |

CEO will only create the next milestone's implementation issue **after the previous milestone's PR is merged.** No stacking.

## Acceptance Criteria

These ACs apply at the **M5 / feature-flag-removal** level. Per-milestone ACs are written into the implementation issue for that milestone.

- [ ] **AC1 (Pairing)** — Given a Pixel Watch 2 paired to a Pixel 8 phone, when the user installs CableSnap on both, then the watch app appears in the watch launcher within 60 seconds.
- [ ] **AC2 (Template sync)** — Given the user has 10 templates on phone, when the user opens CableSnap on watch, then all 10 templates appear in the Template Library within 2 seconds.
- [ ] **AC3 (Start workout from watch)** — Given a synced template, when the user taps it, then a workout session is created on the phone (verify via `gh logcat` and on-phone Now Playing) and the watch transitions to Live Tracking with set 1 of exercise 1.
- [ ] **AC4 (Complete set)** — Given Live Tracking, when the user taps "Complete Set", then a row is inserted in the phone SQLite `sets` table with the watch's weight/reps within 500ms p99.
- [ ] **AC5 (Rest timer)** — When a set completes, then the watch transitions to Rest Timer with the user's configured duration; haptic double-buzz fires on completion ±100ms; "+30s" extends; "Skip" returns immediately.
- [ ] **AC6 (Disconnect tolerance)** — Given watch is mid-workout and the user walks out of Bluetooth range, when the user completes 3 more sets and returns to range, then all 3 sets are reconciled to the phone with original timestamps.
- [ ] **AC7 (Offline-first guarantee)** — No network requests originate from either device for sync purposes (verify via mitmproxy / Charles capture).
- [ ] **AC8 (A11y)** — TalkBack on Wear OS reads weight/reps stepper values, exercise names, and timer countdown correctly. Rotary input adjusts steppers ±1.
- [ ] **AC9 (Battery)** — A 30-minute workout with watch screen on for the active set + ambient during rest drains ≤ 25% battery on Pixel Watch 2.
- [ ] **AC10 (Pristine off)** — Feature flag OFF (default until release): no watch-app code paths run on phone; no Wear OS module loaded; no battery/perf impact for non-watch users.
- [ ] **AC11 (Build)** — Phone builds cleanly with watch module added; CI runs both phone tests and watch Compose UI tests; no new lint warnings.
- [ ] **AC12 (No regressions)** — All existing phone-only tests pass; existing workout flows unaffected with watch unpaired.

## Edge Cases

| Scenario | Expected |
|---|---|
| Phone in airplane mode, watch tries to sync | Set events queue locally on watch (max 200 events); reconcile on reconnect; UI banner "Will sync when reconnected" |
| Watch battery dies mid-workout | Phone is source-of-truth — workout continues on phone; watch resumes Live Tracking on next charge if session still active |
| User edits a set on phone while watch shows old value | Phone broadcasts `/set-update`; watch reconciles within 500ms; if stepper is mid-edit, defer until user releases focus |
| User creates new template on phone mid-workout | Templates list updates on watch's next `DataClient` tick (~1s); does not interrupt active workout |
| Concurrent edits on phone + watch (same set) | Phone wins (last-write-wins anchored to phone clock); watch shows reconciled value with brief flash to indicate the change |
| Watch unpaired during workout | Watch app shows "Phone disconnected" banner; events queue; on re-pair, queue replays in order |
| User has 100+ exercises in a template | `ScalingLazyColumn` handles via lazy rendering; no perf cliff |
| Wear OS 3 device | App refuses to install (manifest min-sdk gate); user-facing error: "Requires Wear OS 4+" |
| Locale = RTL (Arabic, Hebrew) | Layouts mirror; numerical steppers retain LTR digit display |
| Color-blind user (deuteranopia) | Status badges (active/paused) use icon + text, not color alone |
| Phone is iOS | Wear OS module not loaded; Wear OS pairing not advertised; no degradation |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Custom Expo module fails to load on some Android OEMs | Medium | High (blocks feature on affected devices) | Lazy-load module; fail-soft to phone-only; collect telemetry-free crash signals via Sentry breadcrumb |
| Bluetooth pairing UX is fragile (Google's Wearable API has known quirks) | High | Medium | Heavy on-device QA matrix (Pixel Watch 2, Galaxy Watch 6, Galaxy Watch 4 minimum); document known limitations |
| Watch app review delays at Play Store (Wear OS apps go through Wear-specific review) | Medium | Medium | Submit M5 to internal testing track first; allow 2-week buffer before public release |
| Compose-for-Wear API churn between releases | Low | Medium | Pin Compose-for-Wear version in `wear/build.gradle`; document upgrade path |
| Battery regression > AC9 budget | Medium | High | M5 perf gate is mandatory; if missed, defer ambient mode to a follow-up |
| Multi-week schedule slips | High | Low (no external pressure) | Independently mergeable milestones — value ships incrementally |
| New native code increases attack surface | Low | Medium | Keep watch module narrow (only the 4 message types in the protocol table); no eval / no dynamic code paths |
| Disrupts existing offline-first guarantee | Low | High | AC7 explicitly verified via mitmproxy in M5 QA |

## Open Questions for Reviewers

1. **Build pipeline:** does adding the `wear/` Gradle module slow CI or local builds beyond an acceptable threshold? @techlead
2. **Module pattern:** should this be a custom Expo module under `plugins/`, or a standalone npm package we vendor? Owner intent is in-tree per GH spec; confirm. @techlead
3. **A11y baseline:** is the current phone-app a11y baseline (TalkBack support) being met today? If not, watch app should not exceed it on day one. @quality-director
4. **Out-of-scope drift:** should heart-rate integration via Health Connect be milestone M6, or stay deferred? @quality-director (feature scope)

## Review Feedback

### Quality Director (UX) — REQUEST CHANGES (2026-04-27)

**Verdict:** Plan is structurally sound but has **5 blockers** that must be resolved before implementation issues are created. UX surface and milestone sequencing are good; testability and SKILL-alignment claims are over-stated.

**Blockers (must fix in plan):**

1. **AC7 verification method is wrong.** Mitmproxy only inspects TCP/HTTP. Phone↔watch sync runs over Bluetooth via `MessageClient`/`DataClient` and never touches the IP stack — mitmproxy will trivially show "no traffic" even if the implementation were silently phoning home from a different code path. Replace AC7 method with: (a) airplane mode on phone + Bluetooth on, exercise the full feature, all watch→phone events still reconcile; AND (b) `tcpdump` / Network Inspector filtered to the app UID for 30 minutes of typical use shows zero packets to non-LAN destinations. Cite both methods in the AC.

2. **F-Droid + GMS contradiction is unaddressed.** `play-services-wearable` requires Google Play Services on **both** the phone and the watch. F-Droid builds run on devices that may not have GMS (microG, GrapheneOS without sandboxed Google Play, etc.). The plan says F-Droid build is supported and frames this feature as the "open-source moat," but per the dependency table the watch bridge cannot function without GMS. Resolve one of: **(a)** explicitly scope: "F-Droid build of the phone app omits the wearable bridge module; release notes note that the Wear OS companion requires the Play Store build of CableSnap" (add to Out-of-scope; add to Risk table); **(b)** investigate an alternative path (microG support? open-source DataLayer alt?). Without this, AC10 (Pristine off) needs a second leg "F-Droid build does not bundle the bridge module at all."

3. **AC8 (TalkBack on Wear) is not testable in CI.** `androidx.compose.ui.test` does not exercise screen-reader behavior; it can only assert that `contentDescription` strings are present on nodes. Split AC8 into:
   - **AC8a (CI):** Compose UI tests assert every interactive node (steppers, Complete Set pill, control buttons, timer) has a non-empty `contentDescription` and that values update when state changes.
   - **AC8b (Manual gate, M5):** TalkBack on a real Pixel Watch 2 reads the values correctly. Owner sign-off captured as a comment on the M5 PR.
   The current AC8 implies CI coverage of behavior CI cannot give.

4. **AC9 (Battery) is not a CI gate.** Battery measurement requires a physical watch and a 30-minute workout. Move AC9 out of any CI gate language; add a Manual QA Gates section that lists battery, TalkBack, on-device pairing, and Bluetooth-disconnect behavior. Also tighten the budget: ≤25%/30 min ≈ 50%/hour is loose for a Wear OS workout app — competitive bar (Strong, Hevy) is closer to 15–20%/hour with screen-on. Recommend ≤15% per 30-min workout (≤30%/hour with screen on for active set, ambient during rest); if the implementation can't hit that, defer ambient mode out of M5 per your risk-mitigation note (consistency check: that mitigation already exists).

5. **AC8 contentDescription bar exceeds the phone baseline (Open Q3).** Direct-evidence answer: `grep -r "accessibilityLabel\|accessibilityRole\|accessibilityHint" --include="*.tsx"` in `app/` and `components/` returns **0 hits**. The phone app today has zero explicit screen-reader annotations and relies entirely on visible-text exposure. Shipping the watch app with first-class TalkBack labels is a *higher* bar than the phone — defensible, but creates a UX regression for TalkBack users who, mid-workout, will hear curated labels on the watch and silence/raw text on the phone. Pick one and document it in the plan:
   - **(a)** Match the phone baseline: ship watch with text-driven a11y only (no contentDescription overrides). Cheap, but loses the watch a11y story. Or
   - **(b)** Bring phone parity into scope: add a sub-task "Phone-side a11y pass on workout-session screens (`app/session/*`, `components/SetRow.*`) — labels and roles on weight/reps inputs and Complete Set" sized into M2 or M3. Recommend (b).

**Major UX gaps (should fix):**

6. **Edge cases missing — clock/timestamp authority.** AC4 says set inserts within 500ms with watch's weight/reps; AC6 says "all 3 sets reconciled with original timestamps." Whose clock generates `completedAt`? Watch and phone clocks routinely diverge by seconds (no NTP on Wear during a BT-only session). Spec must say: phone is timestamp authority on reconcile, OR watch timestamp + drift compensation, OR LWW with clock-skew tolerance. Today's edit conflict row says "phone wins" but doesn't cover timestamps.

7. **Edge cases missing — watch app process death mid-workout.** Plan's `SetEventQueue.kt` description says "persists pending events when phone is disconnected" but does not specify *durable* storage. If the watch app process is killed (Wear OS aggressively reaps backgrounded apps), are queued events lost? Specify: DataStore / Room / file-backed, plus a recovery-on-launch step. Add edge-case row.

8. **Edge cases missing — multi-watch pairing.** `DataClient` broadcasts to all paired nodes. If a user has 2 watches paired (e.g., personal + Garmin testing), `/set-complete` events could fire from both. Either document "first-event-wins per setNumber" or "exactly one Wear OS companion permitted per session" with an explicit guard. Add edge-case row.

9. **Asymmetric workout-start flow.** Plan only describes watch→phone start (`/active-workout` from watch). What if the user starts a workout on the phone? Does the watch auto-jump to Live Tracking? Currently undocumented; AC3 only covers watch-initiated start. Either add an AC for phone-initiated start, OR explicitly out-of-scope for v1 (and add the empty-state banner: "Workout in progress on phone — open on phone to track").

10. **"Defer until user releases focus" is undefined.** In the edge-case row about phone-side edits clobbering an in-progress watch stepper, "release focus" needs a concrete trigger (e.g., 1500ms idle on the stepper, or explicit Complete Set). Otherwise an absent-minded user with focus-locked steppers permanently desyncs.

**Suggestions (not blockers):**

- **Behavior-design re-classification at M5:** the classification is correctly NO today, but M5 includes release-notes copy. Add a checklist item: "M5 PR description includes self-classification of release-notes copy (no streaks/never-miss-a-day language)." Cheap guardrail.
- **Empty Template Library copy:** "No templates synced — open CableSnap on your phone." Owner spec is fine but `ScalingLazyColumn` with no items can collapse to a tiny region on Wear OS — confirm the empty-state Compose surface is full-screen with reasonable line-wrap on a 384px display. Add to AC2 visual review.
- **Long-press for Workout Controls (header) and Set Management (Set Counter):** two distinct long-presses on adjacent UI is discoverability-fragile. Consider replacing one with a `SwipeToReveal` row action (Compose-for-Wear primitive) and document the choice.
- **AC11 "no new lint warnings":** if the watch module adds Kotlin lint to CI, the baseline differs from JS lint. Specify which linters and threshold ("zero new ktlint findings on watch module").

**Open Question answers:**

- **Q3 (a11y baseline):** Answered above (Blocker #5). Current phone baseline = informal/zero. Recommend option (b): bring phone parity into M2/M3 to avoid regression for TalkBack users.
- **Q4 (heart-rate / Health Connect):** Keep deferred. BLD-715 owns it. Adding it as M6 doubles the scope and conflates platform-bridge work with a separate sensor-integration domain. If the owner asks for it later, treat as a fresh plan.

**What's right (don't change):**

- 5-PR sequenced milestones behind a feature flag, no stacking — correct cadence for a feature this size.
- Phone-as-source-of-truth + optimistic watch UI — correct invariant.
- Behavior-design classification (NO) is correct for the surface as drawn.
- AC10 (Pristine off when flag is OFF) is well-specified — non-watch users see zero impact.
- Out-of-scope list is appropriately tight (iOS, standalone, custom faces all deferred).

**Re-review trigger:** Update plan to address Blockers 1–5 + Major Gaps 6–10. CEO can re-ping `@quality-director` for sign-off; expect ~10 min turnaround for delta review.

### Tech Lead (Feasibility)
_Pending — review request to follow_

### Psychologist (Behavior-Design)
_N/A — Behavior-Design Classification = NO. CEO will re-classify per-milestone if scope drifts._

### CEO Decision
_Pending reviews_
