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

### Added
- Hydration tracking — log water in ml or fl oz from the Nutrition tab; configurable daily goal and preset volumes in Settings.
- Workout templates now remember the training mode you pick per Voltra exercise; sessions started from the template open in the saved mode automatically.

### Changed
- Workout duration now starts when you log your first completed set, not the moment you tap Start (BLD-630).

### Removed
- Removed the **Eccentric** training mode chip and tempo tracking. Existing eccentric sets in your history are preserved as standard sets; other Voltra modes (Band, Damper, Isokinetic, Isometric, Custom, Rowing) are unchanged.

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
