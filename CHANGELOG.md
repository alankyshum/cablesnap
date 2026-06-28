# Changelog

All notable user-facing changes to CableSnap are listed here, newest first.
This file is the single source of truth for:

- The in-app **What's New** modal (read from `lib/changelog.generated.ts`).
- GitHub Releases (`gh release create --notes-file` extracted from this file).
- F-Droid per-version changelogs (`fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/<versionCode>.txt`).

Format:

```
## v<semver> — YYYY-MM-DD
<!-- versionCode: N -->
- Bullet describing a user-facing change.
- Another bullet.
```

The `<!-- versionCode: N -->` marker is optional but required for F-Droid
sidecar emission. The `publish-release` skill prepends a new section (with
marker) at release time.

## Unreleased

_No user-facing changes yet._

## v0.26.43 — 2026-06-28
<!-- versionCode: 113 -->

- Settings: tidied up text hierarchy so titles, labels, and helper text use consistent sizes and weights for a cleaner, less cluttered look.
- **Improvement: Settings tiles are lighter and less cluttered** — the Settings screen previously rendered as a vertical stack of drop-shadowed boxes. Each tile now uses a subtle 1px outline instead of a shadow, with slightly tighter padding, so the screen reads as a clean, calm list rather than a column of floating cards. (BLD-2030)
- Wide screens (foldables/tablets) now use the full width across the Workouts and Progress tabs — cards flow into 2–3 balanced columns instead of a single centered column, so you see more at a glance. (BLD-2033)
- **Improvement: Settings link rows are more legible and easier to tap** — the Gym Profiles, Advanced Set Types, and Adaptive Macro Coach entries now use a larger, consistent title size and a guaranteed 48 dp minimum touch target, and Settings tiles share a single, consistent density (padding and heading size). No functionality changed — the links open the same screens as before. (BLD-2032)
- **Improvement: Settings screen is reorganised into themed sections** — the previously long list of ~18 individual setting cards is now grouped into 9 clearly-labelled tiles (Profile, Units & Appearance, Training, Notifications, Coaching, Integrations, Data & Backup, Feedback, About) using a tidy masonry layout on wider screens. Related settings now sit together under a named heading, and the screen reads as a clean, scannable list instead of a tall stack of cards. All settings open the same screens as before. (BLD-2031)

## v0.26.42 — 2026-06-27
<!-- versionCode: 112 -->

- **Fix: Red error toast no longer appears on the session pacing and post-workout summary screens** — a React DOM prop warning caused by an accessibility attribute leaking onto an SVG element produced a persistent red error toast on these screens. The prop is now correctly scoped to native only; the web accessibility attribute (`aria-hidden`) handles screen readers on web as before. (BLD-1994)
- **Fix: "Sets" and "Volume" stat labels no longer truncate on the workout summary screen** — the stacked stat-tile captions on the completed-workout summary were clipped with an ellipsis on narrow viewports. The label layout was restructured so each caption renders on a single line at full width. (BLD-1993)
- **Fix: "Select" link in the Form clips header now meets the 44 dp touch target minimum** — the previous implementation used a small `hitSlop` that only extended the tappable area to ~36 dp, making the control difficult to tap reliably. The tap area is now at least 44×44 dp as required by HIG and Material guidelines. (BLD-1941)
- **Fix: Pacing bar is now distinguishable under red-green colour blindness** — the "Other" (grey) segment in the post-workout pacing bar now carries a diagonal hatch pattern so it remains separable from the "Working" (coral) segment for users with deuteranopia or protanopia. The hatch is mirrored on the matching legend dot. Full-colour appearance for sighted users is unchanged. (BLD-1939)
- **Fix: "Sets" stat label no longer truncates on the workout summary screen** — on 390 px viewports the "Sets (9 working)" caption was cut off with an ellipsis because the auto-shrink limit of 80% wasn't enough headroom. The minimum font scale is now 60%, giving the caption enough room to fit on one line. Duration and Volume captions are unchanged. (BLD-1938)

## v0.26.41 — 2026-06-25
<!-- versionCode: 111 -->

- **Fix: Advanced Set Types help screen now hints when there's more to scroll** — on narrow phones (e.g. 320px wide) the last "Myo-reps" section could sit at the bottom edge with no cue that more content existed below. The screen now shows a subtle bottom fade while the list can still be scrolled, and the fade disappears once you reach the end. (BLD-1916)

## v0.26.40 — 2026-06-24
<!-- versionCode: 110 -->

- **Fix: Sets stat tile caption no longer wraps to two lines on the summary screen** — on a 390px mobile viewport the "Sets (9 working)" caption wrapped to two lines, while Duration and Volume stayed on one line. All three stat tile captions now auto-shrink the font to fit on a single line (down to 80% of the baseline size), so the three-tile row stays visually consistent regardless of how many set types are present. Screen-reader accessibility labels are unchanged. (BLD-1873)
- **Fix: Error toasts now show full message** — error toasts that contained long messages (e.g. React runtime warnings) were truncated mid-word due to a single-line limit. Toasts now wrap to two lines so the full message is readable. Also fixed a React web rendering warning ("non-boolean attribute") caused by React Native accessibility props being passed to DOM elements on web, which was the root-cause message appearing in the toast. (BLD-1872)

## v0.26.39 — 2026-06-24
<!-- versionCode: 109 -->

- **Fix: Add Food sheet now scrolls to the "Log Food" button** — when adding a food via Manual Entry, the bottom sheet's drag-to-dismiss gesture was intercepting vertical swipes, so the form couldn't be scrolled and the "Log Food" button at the bottom was unreachable (especially with the keyboard open). The Add Food sheet's pan-to-dismiss is now disabled, so its content scrolls normally; the sheet is still dismissable via the backdrop or the in-form Cancel button. (BLD-1793)
- **Fix: "Log Food" submit button is now always reachable in the Add Food sheet** — the manual-entry form submit was laid out below the visible screen fold when the sheet was at its default snap point, making it unreachable by scrolling. The sheet's scroll container is now bounded to the visible on-screen height so the form scrolls correctly and the submit button is always accessible. (BLD-1819)

## v0.26.38 — 2026-06-22
<!-- versionCode: 108 -->

- **Fix: "Other" legend dot in the Estimated Pacing card is now visible** — the dot was near-white against a white card background, making it nearly invisible. It now uses a mid-grey colour with a subtle border so all three legend indicators (Working, Rest, Other) are clearly distinguishable. (BLD-1669)

## v0.26.37 — 2026-06-22
<!-- versionCode: 107 -->

- **Fix: Post-workout summary no longer crashes on the web build** — opening the workout summary in a browser could occasionally fail with a "Sync operation timeout" error that replaced the whole screen, when the database's web worker hadn't finished starting up. The app now warms the worker during startup so the summary (and every other database-backed screen) loads reliably, and if a database read ever does fail it now shows the recoverable retry screen instead of a blank crash. Native (iOS/Android) behaviour is unchanged. (BLD-1636, BLD-1635)

## v0.26.36 — 2026-05-16
<!-- versionCode: 106 -->

- **Fix: App no longer floods crash reports when the workout database fails to open** — on the rare devices where the native SQLite layer can't open the database (one cluster: Galaxy Z Fold 6 on Android 16), the app now shows a recoverable "Workout data can't be opened" screen with a Retry button and an Export-diagnostics action instead of leaving you on a blank/broken screen. Behind the scenes a single diagnostic event is reported per session rather than the previous 12+/minute burst. (#609, BLD-1257)
- **Fix: Bottom sheet drag handle is now clearly visible** — the small pill at the top of pull-up sheets (e.g. "Pacing by exercise") previously rendered near-invisible (~1.09:1 contrast) in light mode. It now uses a mid-gray meeting WCAG AA for non-text UI components (≥3:1). (#611, BLD-1260)
- **Fix: Web fallback no longer attempts native database init** — restored the BLD-565 invariant that web hosts without `SharedArrayBuffer` skip every database code path. A regression in the BLD-1257 recovery flow caused the new database-status hook to run `getDatabase()` even on the WebUnsupported screen, surfacing a `ReferenceError: SharedArrayBuffer is not defined`. The hook is now gated behind the same web-support check. (BLD-1262)
- **Fix: Advanced Set Types help page shows all content on narrow web viewports** — the page layout on web no longer clips the Myo-reps description mid-sentence on 390 px wide viewports. The ScrollView's flex constraint is now omitted on web so the full content is accessible without a bounded scroll region. (BLD-1261)

## v0.26.35 — 2026-05-16
<!-- versionCode: 105 -->

- **Fix: Workout input fields no longer reset while timer is running** — reps, weight, RPE, and duration values typed during an active set timer now persist through every second tick. Previously, the elapsed/countdown display caused the entire exercise list to re-render each second, overwriting in-progress edits with stale values. (#599, BLD-1235)
- **Fix: "Finish Workout" button now responds during rest timer (Android)** — tapping Finish Workout while the rest countdown is active now reliably opens the Complete Workout confirm dialog. Previously the button was unresponsive on Android (especially foldables like Galaxy Z Fold 6) because the footer re-mounted every second during rest ticks. (#600, BLD-1239)
- **Advanced Set Types help sheet**: Fixed Myo-reps description being clipped mid-sentence on narrow viewports (390 px wide). The help sheet now has sufficient bottom padding so the last card and footer are fully visible with breathing room.
- **Strava sync — duplicate upload fix**: Activities already uploaded to Strava no longer surface a "sync failed" toast or retry loop. Strava's 409 conflict response (same `external_id`) is now treated as a successful idempotent re-sync, clearing the queue entry silently.

## v0.26.34 — 2026-05-12
<!-- versionCode: 104 -->

- **Rest timer (Android)**: Fixed notification spam where finishing a set would stack 12–24+ shade entries instead of showing one. The live countdown now dismisses the previous entry before re-presenting, and updates every 15 s instead of every 5 s.
- **WearOS rest-complete bridging**: The "rest complete" chime now appears on paired Wear OS watches. Previously the notification used a low-importance channel that the Wear OS Companion skips; it now uses a HIGH-importance channel.
- **Fix: "Complete Workout" button no longer silently no-ops** — confirm dialog now reads "Complete" (was "OK"), and any error during finish (rest dismiss, pinned-note flush, session save) is surfaced as a toast instead of being swallowed. Your in-progress workout remains intact and resumable on failure. (#589, BLD-1207)
- Strava activities synced from CableSnap now include a small footer crediting the app with a link to the GitHub project.
- **Advanced set E2E tests**: fixed `.tap()` → `.click()`, strict-mode `getByText` for "Cluster", and added `E2E_USE_STATIC=1` skip guards on session-detail tests that require SharedArrayBuffer (COOP/COEP headers).
- **Strava connect** (Android): Fixed a silent connection failure on some OEM Android builds (Samsung Z Fold6 and similar) where the OAuth redirect was not intercepted, leaving the connection incomplete.
- **Strava sync**: Upload outcome is now accurately reflected in the post-workout toast — "Synced to Strava ✓" on success, "queued — will retry" on transient failure, and "check Settings" with a navigation shortcut on permanent failure (e.g. revoked token).
- Progression suggestions now correctly evaluate advanced set types (rest-pause, cluster, myo-reps) using the working-set reps of the activation segment, rather than the inflated total-reps sum.
- **CSV export/import round-trip for advanced sets**: rest-pause, cluster, and myo-rep set segment data (reps, weights, rests per mini-set) is now preserved when you export and re-import your workout CSV. Unknown set types in imported CSVs are automatically normalised to "normal" instead of being silently dropped.
- **Advanced set types — Mini-set editor**: Rest-pause, cluster, and myo-rep sets now show an inline mini-set editor during active sessions. Tap to log each sub-rep burst, long-press a mini-set row to delete it, or collapse all mini-sets back into a single normal set. Up to 8 mini-sets per parent set are supported.

## v0.26.33 — 2026-05-12
<!-- versionCode: 103 -->

- **Advanced set schemes (analytics)**: rest-pause, cluster, and myo-rep sets now contribute correct volume and e1RM values to all analytics surfaces (weekly/monthly trends, exercise history bests, achievements). Previously, multi-segment sets were excluded or under-counted due to the reps ≤ 12 filter.
- **Adaptive Macro Coach** (off by default): Enable in Settings → Nutrition → Adaptive Macro Coach to get a weekly advisory card that suggests a calorie target based on your trend weight and average intake over the past two weeks. The coach is advisory only — your target is never changed without your tap. Includes a hard safety floor (based on your sex and estimated metabolic rate), a ±300 kcal/week cap, Right Why check-in, and a one-tap one-month pause.
- **Tempo Coach (haptic engine)**: Enable "Tempo Coach" in Settings → Preferences to get a haptic rep guide during your sets. When active, a vibration cues each phase of your tempo (eccentric → bottom pause → concentric → top pause) in real time. A compact overlay shows the current phase and lets you stop the coach at any time. The coach auto-stops when the set is logged and cancels if you background the app.
- **Advanced Set Types — CSV round-trip**: CSV export now includes `set_type`, `mini_set_reps`, `mini_set_weights`, and `mini_set_rests` columns for rest-pause, cluster, and myo-rep sets. These trailing columns are ignored by older importers (back-compat). CSV import parses and clamps mini-set data to 8 segments. Settings → Advanced Set Types explains each set type in plain language.

## v0.26.32 — 2026-05-11
<!-- versionCode: 102 -->

- **Form Check Comparison**: Compare form clips side-by-side from the Form Library or from the clip player with synchronized play/pause/reset, A↔B swap, in-sheet clip picker, and landscape layout support.
- **Tempo Coach (data layer)**: Set a per-exercise default tempo (e.g. `3-1-2-0`), which auto-fills on every new set for that exercise. Edit tempo per-set via the new Set Options sheet. Tempo is preserved across CSV import/export and template initialization.

## v0.26.31 — 2026-05-11
<!-- versionCode: 101 -->

- **Settings cleanup**: Removed the Health Connect integration entry from Settings. The feature was never fully functional; removing it reduces permission surface and eliminates a confusing toggle for Android users.
- **Database cleanup**: Removed the legacy `health_connect_sync_log` database table and its associated app_settings key on device upgrade. New installs are not affected.
- **Smart Rest Coach (fix)**: Live countdown and scheduled rest notifications now correctly resume after the app is force-quit and reopened mid-rest on Android. Previously, OS-scheduled notifications could be lost on process kill; they are now re-scheduled on cold-start resume.
- **Session Pacing**: Post-session summary now includes an **Estimated pacing** card showing a stacked bar with time spent Working, Resting, and in Other (transition/setup) time. Tap the card to see a per-exercise breakdown table. Working time for rep-based sets is estimated at ~2 s/rep; rest is the gap between consecutive sets on the same exercise (capped at 10 min). Available on completed sessions only. Pacing duration now matches the session duration shown in the summary header.
- **Session Pacing (fix)**: Pacing totals now correctly align with the session duration shown in the summary header; the breakdown sheet tap interaction is restored on all devices.

## v0.26.30 — 2026-05-10
<!-- versionCode: 100 -->

- **Connect Strava (fix)**: The "Connect Strava" button in Settings → Integrations now actually works. Previously it always failed silently with an "invalid redirect URI" error from Strava's side. The OAuth flow now correctly hands off through a small HTTPS bouncer back to the app.

## v0.26.29 — 2026-05-10
<!-- versionCode: 99 -->

- **Smart Rest Coach**: Rest-timer notifications now include a pre-end cue (5–20s before rest ends), a live lock-screen countdown that updates every 5 seconds (Android), and an optional next-set preview showing exercise, target weight, and rep range right on the notification — so you never need to unlock the phone just to remember what's next. All three features are individually togglable under Settings → Rest Timer.
- **Stack marker quick-pick**: Cable exercises at calibrated gyms now show a marker pill instead of a numeric weight field. Tap to pick your stack position; the true weight is resolved automatically. Long-press to fall back to numeric entry on any set.
- **Stack marker hint**: Cable exercises at gyms without saved calibration now show a one-time, dismissible hint pointing to where to add stack calibration so future sessions can use marker quick-pick.
- **Marker autofill reliability**: First add-set after switching gyms now consistently fills in the right stack marker instead of occasionally dropping back to numeric entry.
- **Bug fix — marker/weight save reliability**: On rare DB write failures when logging a stack marker or manual weight, the set row now correctly reverts to its previous state instead of showing stale or blank values.

## v0.26.28 — 2026-05-10
<!-- versionCode: 98 -->

- **Plateau detection & break-through suggestions**: When an exercise stalls for 4+ sessions without weight or rep improvement, a suggestion card surfaces on the exercise detail screen with a context-aware action — deload to break a loaded stall, push for +2 reps at current weight, or check form if effort has been creeping up (BLD-1122).
- **Settings scroll fix (follow-up)**: Increased the bottom clearance buffer on the Settings screen to prevent the About section and links from being clipped behind the floating tab bar on Z Fold6 and other foldable or tall-nav Android devices (BLD-1124).

- **Track pulley pin position**: Tap the new pin chip next to any cable set to record which pulley pin you used (1 through your machine's max). Stored per set so your exact stack position is always in the history export (BLD-1114).
- **Setup photo per set**: Tap the camera icon on any completed cable set to snap a quick photo of the cable path, attachment, and pin — a visual reference so you can replicate the exact setup next time (BLD-1114).
- **RPE capture nudge**: Exercise detail now shows a one-time banner for users who have logged RPE before but haven't enabled live capture — tap "Turn on" to enable in one step, or "Not now" to dismiss forever (BLD-1117).

## v0.26.27 — 2026-05-09
<!-- versionCode: 97 -->

- **Record directly from Form tab**: Tap the new "Record clip" button in the Form clips tab (exercise detail drawer) to record a new clip without leaving the exercise view. The button auto-targets the most recent unclipped set, or shows a helper hint when all sets already have clips (BLD-1105).
- **Replace or delete individual clips**: Each clip row in the Form clips tab now has an overflow menu (⋯) with Replace and Delete actions. Replace atomically swaps the file and database row in a single transaction (BLD-1105).
- **Manage all clips from Settings**: The Form Clips card in Settings is now tappable and opens a full clip library grouped by exercise. Delete individual clips or bulk-delete all clips to reclaim storage instantly (BLD-1105).
- **Settings scroll fix**: Fixed settings screen content cut off behind the floating tab bar on tall Android devices (Galaxy Z Fold6, Pixel 7 Pro) — the About section and links at the bottom are now fully accessible (BLD-1106)
- **Live RPE capture**: Rate each set's effort with a tap (Easy / Moderate / Hard / Max) directly in the workout screen. Long-press for a precise value (6.0–10.0). RPE powers the smart rest timer and next-set suggestion — enable in Settings (BLD-1110).

## v0.26.26 — 2026-05-09
<!-- versionCode: 96 -->

- **Smart Rest Timer**: Rest suggestions now adapt to each exercise based on your actual median rest over the last 30 days. Pin a custom default per exercise, or let the timer learn automatically — templates and 90 s fallback remain for new users (BLD-1100).

## v0.26.25 — 2026-05-08
<!-- versionCode: 95 -->

- **Database upgrade fix**: Resolved a crash on first launch ("Database error: no such column: gym_id") that affected users upgrading from a much older install. Migration ordering is now phased to prevent this class of bug from recurring.

## v0.26.24 — 2026-05-08
<!-- versionCode: 94 -->
- **Form Check Videos**: Record short video clips (up to 15 s) on each completed working set to review technique over time. Clips are stored locally only — never uploaded, never backed up to iCloud/Google (BLD-1092).
- **Form Library**: "Form clips" tab in the exercise detail drawer shows all clips for an exercise reverse-chronologically with date, weight, and reps overlay (BLD-1092).
- **Side-by-side comparison**: Compare any two form clips from your library in a split-screen view (BLD-1092).
- **Storage panel**: Settings → Storage shows total clip size and count with a "Manage" shortcut (BLD-1092).
- **Privacy**: form-clips/ directory excluded from iOS iCloud and Android Auto Backup via Expo config plugin — form-check videos stay on-device only (BLD-1095).
- **Database integrity**: Enabled SQLite foreign-key enforcement on every connection so historic delete paths (workout history, CSV import undo, in-progress cancel) now correctly clean up Strava and Health Connect sync-log entries instead of leaving orphan rows.
- **Grease-the-Groove mode**: Log scattered sets throughout the day without starting a workout — tap the floating Quick Add button, pick an exercise, confirm reps/weight, and get a 4-second undo toast. Daily GTG totals appear as a summary card on the home screen and a light-fill dot on the calendar.

## v0.26.23 — 2026-05-08
<!-- versionCode: 93 -->

### New features
- **Per-variant PR cards for cable exercises** — strength records now track each cable exercise variant separately so PRs reflect the actual movement you trained (BLD-1086).
- **Per-Gym Cable Stack Calibration** — calibrate each gym's cable stack once and have plate math + load suggestions follow you between gyms (BLD-1060).
- **Pinned per-exercise notes** — pin a note to any exercise so it surfaces every time you start that exercise in a session (BLD-1028).
- **Curated Programs Library** — bundled r/bodyweightfitness Recommended Routine v1 as a starter program; more curated programs to follow.
- **Export workout templates** — long-press a template to export it for sharing or backup.
- **Template sync from completed sessions** — edits made to sets during a session now flow back into the source template on completion (BLD-1031).
- **128-exercise Gemini illustration set** — refreshed exercise illustrations using the new Gemini-generated set, retiring the older gpt-image-1 voltra subset (BLD-989).

### Fixes
- **History filter chips scroll correctly** — bounded the FilterBar container so the chip row actually scrolls instead of clipping.
- **Set numbering after delete** — deleting a set in a session now renumbers the remaining sets correctly (BLD-1044).
- **Body view padding** — Progress > Body list no longer hides its last row behind the floating tab bar (BLD-990).
- **Tablet home layout** — workout cards no longer get cropped on tablet flex-wrap rows (BLD-1011).
- **Monthly share button** — Progress > Monthly view share button no longer overlaps the floating navbar.

## v0.26.22 — 2026-05-03
<!-- versionCode: 92 -->
- Internal/CI: regression-catcher fixture migrated to wrapper-fixture pattern (BLD-1023).

## v0.26.21 — 2026-05-03
<!-- versionCode: 91 -->
- Internal/CI: routine release — no user-facing changes.

## v0.26.20 — 2026-05-02
<!-- versionCode: 90 -->
### Added
- Hydration tracking — log water in ml or fl oz from the Nutrition tab; configurable daily goal and preset volumes in Settings.
- Workout templates now remember the training mode you pick per Voltra exercise; sessions started from the template open in the saved mode automatically.

### Changed
- Workout duration now starts when you log your first completed set, not the moment you tap Start (BLD-630).

### Removed
- Removed the **Eccentric** training mode chip and tempo tracking. Existing eccentric sets in your history are preserved as standard sets; other Voltra modes (Band, Damper, Isokinetic, Isometric, Custom, Rowing) are unchanged.

### Internal/CI
- Merge gate: comment-fallback approvals for lenient branch protection.

## v0.26.19 — 2026-05-01
<!-- versionCode: 76 -->
- Fixed Android crash on app open caused by WearOS module class-loading failure on devices without Google Play Services.
- Replaced direct WearOS Wearable API import with Class.forName() reflection to prevent NoClassDefFoundError at startup.
- Removed WearOSModule from Expo autolinker to prevent F-Droid build crashes.
- Added Android emulator smoke test to CI pipeline to catch launch crashes before release.

## v0.26.12 — 2026-04-26
<!-- versionCode: 65 -->
- Web: fixed a crash on the Summary screen and other queries that returned larger result sets — the SQLite worker was truncating its length prefix to one byte, corrupting any payload ≥256 bytes (BLD-660).
- Workout history: heatmap now renders in a stable 7-column grid at every screen width — Sundays no longer wrap to a new row at narrow widths (BLD-661).
- Workout history: heatmap, streak, and dot map now populate correctly from seeded sessions — timestamps are stored in milliseconds end-to-end (BLD-662).
- Workout history: streak card labels clarified to make current vs longest streak unambiguous (BLD-663).

## v0.26.8 — 2026-04-24
<!-- versionCode: 57 -->
- Set-completion now confirms with a subtle haptic + audio cue — toggle separately from timer sounds in Settings → Preferences.
- Previous-performance chip on the session screen now looks tappable again (affordance restored).
- Adaptive rest timer now shows a "+N" overflow counter when the chip truncates.
- Strava auth errors surface a proper toast with a "Get help" CTA.
- Session screen performance pass: memoization + background-timer pause when the app is backgrounded.

## v0.26.7 — 2026-04-24
- Adaptive rest timer — intelligently suggests rest duration based on your recent set intensity.
- End-to-end visual regression suite now uses a deterministic exercise fixture.
- Bundle-gate CI check now runs on every PR so the required status always reports.
- F-Droid `versionCode` sync fix — updates now install cleanly without the "Installed" ghost.

## v0.26.6 — 2026-04-23
- Workouts tab now shows a more welcoming empty state when you have no sessions yet.
- New subtle severity + heatmap theme tokens for a calmer progress view.
- Strava connection actions emit Sentry breadcrumbs for faster triage of auth hiccups.

## v0.26.5 — 2026-04-23
- Body profile unit labels now refresh immediately when you change weight/measurement units in Settings.
- Strava configuration errors now surface a tappable "Get help" CTA in the toast.
- Removed the one-time post-BLD-485 reinstall banner now that the keystore transition is complete.

## v0.26.4 — 2026-04-23
- PR dashboard empty state now has a friendly retry button instead of a blank screen on fetch failure.
- Post-workout summary: Android hardware back is now intercepted so you don't accidentally drop out of the rating flow.
- Typography polish on the PR stats row.
- First release signed with the new persistent production keystore (future updates install cleanly in place).
