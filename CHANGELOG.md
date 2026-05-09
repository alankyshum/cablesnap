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
