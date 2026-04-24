# Feature Plan: Release Notes Viewer from Settings Version Row

**Issue**: BLD-571  **Author**: CEO  **Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Source**: GitHub #356 (alankyshum)

## Problem Statement

Users on CableSnap have no in-app way to discover what changed between versions. The owner noted users may perceive the app as stale (no visible sign of active development) and miss valuable new features. Currently the About card in Settings shows only `CableSnap v0.26.8` as plain text — no link, no tap target, no changelog anywhere in-app.

Owner explicitly prefers an **on-demand** surface (tap version row → modal) over an auto-popup on launch, because users open the app to train, not to read release notes.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO SKILL §3.2 trigger list: gamification / streaks / notifications / onboarding / rewards / progress visualizations / social / habit loops / goal-setting / motivational copy / identity framing / re-engagement of lapsed users)

- [ ] YES
- [x] **NO** — this is purely informational. A user-initiated, pull-based changelog view. No notifications, no re-engagement push, no motivational copy, no streaks. Not a Hooked-model trigger. Pure transparency feature.

Psychologist review: **N/A**.

## User Stories

- As a returning user, I want to tap the app version in Settings so I can see what's changed since I last updated.
- As a curious user, I want to see a history of releases so I know the app is actively maintained.

## Proposed Solution

### Overview
Make the version row in the Settings "About" card a pressable element. On tap, open a full-screen modal listing release notes, newest first. Each entry shows version string + body text. Scrollable. Close button top-right.

### UX Design
- **Affordance**: Change the version line from static `Text` to a `Pressable` row with a right chevron icon (`chevron-right`) + subtle hint text: `"What's new"` below the version. Looks like other Settings rows.
- **Modal**: Full-screen `Modal` (RN) using `presentationStyle="pageSheet"` on iOS, default slide-up on Android. Header: title "What's New", close (X) top-right, safe-area aware (remember Z Fold6 cutout — use `useSafeAreaInsets()`, memory).
- **List**: `FlatList` of release entries. Each item: version header (`v0.26.8` bold) + date (if available) + body (multi-line, preserves line breaks). Dividers between entries. Current version pinned at top with subtle "Current" chip.
- **Empty/fallback**: If bundle ships with zero release notes (shouldn't happen post-implementation), show "No release notes available" centered.
- **A11y**: Pressable has `accessibilityRole="button"`, `accessibilityLabel="View release notes, current version {v}"`. Modal close button labeled "Close release notes". Entry headings marked `accessibilityRole="header"`.
- **Theming**: Uses existing `colors` / `fontSizes` tokens. No hardcoded colors.

### Technical Approach

**Data source** — bundle release notes at build time:

1. Create `CHANGELOG.md` at repo root as canonical source, human-authored during releases, using a simple format:
   ```
   ## v0.26.8 — 2026-04-24
   - Bullet
   - Bullet

   ## v0.26.7 — 2026-04-20
   - ...
   ```
2. Add a build-time parser `scripts/generate-changelog.ts` that reads `CHANGELOG.md`, parses into `{ version, date, body }[]`, writes `lib/changelog.generated.ts` exporting the array. Run as part of `prebuild`/`build` scripts (same pattern as other generators in repo — see `manifest.generated.ts` conventions from memory).
3. The modal imports `lib/changelog.generated.ts`. No network, no async, no storage needed. Bundle-time data → zero runtime cost and works offline (F-Droid requirement).
4. Update `publish-release` skill to prepend a new `## vX.Y.Z` section to `CHANGELOG.md` when bumping the version (additional step in existing release flow). Regenerate the .ts before tagging. This also lets us backfill F-Droid `fdroid/metadata/.../changelogs/{versionCode}.txt` from the same source (stretch, not required for AC).

**Back-compat**: If `CHANGELOG.md` is missing during build, generator writes an empty array and emits a warning — build does not fail (so feature branch can land before CHANGELOG is fully backfilled).

**Files touched**:
- NEW `CHANGELOG.md` (seeded with at least 3 most recent versions, handwritten by implementer from git log + F-Droid changelogs that exist: 1.txt, 2.txt, 7.txt, 11.txt).
- NEW `scripts/generate-changelog.ts`.
- NEW `lib/changelog.generated.ts` (generated; gitignored? — follow repo pattern for `manifest.generated.ts`; if that one is committed, commit this too).
- NEW `components/ReleaseNotesModal.tsx`.
- EDIT `app/(tabs)/settings.tsx` — wrap version block in a `Pressable`, add modal state + render.
- EDIT `package.json` — add `predev` / `prebuild` hook to run generator (follow existing pattern).
- NEW `__tests__/components/ReleaseNotesModal.test.tsx` — render, tap close, renders entries.
- NEW `__tests__/scripts/generate-changelog.test.ts` — parser covers happy path + malformed section + empty file.

### Dependencies
None. Pure RN primitives + existing repo conventions.

## Scope

**In:**
- CHANGELOG.md as source of truth
- Build-time generator
- Pressable version row with "What's new" affordance
- Modal listing all historical release notes, newest first
- Seeded with last ~5 versions minimum (claudecoder writes from git log)
- Safe-area aware
- Tests

**Out:**
- Auto-popup on launch (explicit user preference: NO)
- Remote fetch / dynamic changelog (offline-first, no runtime network)
- i18n of release-note bodies (author in English only — same as rest of app currently)
- Push notification "new version has release notes!" (behavior-shaping — explicitly out)
- "Mark as read" / unread badge on version row (behavior-shaping — explicitly out)
- Deep linking to a specific version

## Acceptance Criteria

- [ ] GIVEN I am on the Settings tab WHEN I look at the About card THEN the version row (`CableSnap v0.26.8`) shows a chevron-right icon and "What's new" hint text, and is visibly a tappable row.
- [ ] GIVEN I tap the version row THEN a modal opens with the title "What's New" and a close (X) button in the top-right.
- [ ] GIVEN the modal is open THEN it lists release entries newest-first; the current version is pinned at the top with a "Current" chip.
- [ ] GIVEN I tap the close button OR swipe down (iOS pageSheet) OR press Android back THEN the modal closes and I return to the Settings tab.
- [ ] GIVEN the modal is rendered on a Z Fold 6 / Pixel punch-hole THEN the header does not collide with the status bar / display cutout (`useSafeAreaInsets()` applied).
- [ ] GIVEN I run `npm run build` THEN `lib/changelog.generated.ts` is (re)generated from `CHANGELOG.md` deterministically and the app bundle includes at least 5 release entries.
- [ ] GIVEN a screen reader is on WHEN I focus the version row THEN it announces "View release notes, current version 0.26.8, button".
- [ ] PR passes all tests (`npm test`), typecheck, and existing lint with no regressions. No new warnings.
- [ ] No new runtime dependencies added.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| `CHANGELOG.md` missing | Generator emits warning, outputs empty array, build succeeds, modal shows fallback "No release notes available". |
| Malformed section (missing version header) | Generator skips that block and logs a warning; other entries still parse. |
| Very long release-note body | Modal `FlatList` virtualizes; individual entry scrolls inside overall list (or wraps); no clipping. |
| User taps version row repeatedly | Modal opens once; second tap while open is a no-op (controlled `visible` state). |
| Android back button while modal open | Closes modal, does NOT navigate away from Settings tab. |
| Z Fold 6 / Pixel punch-hole | Safe-area insets applied to header. |
| Offline | Works — bundle-time data, no network. |
| Small font scale / large font scale | Respects system font scale (use `fontSizes` tokens, no absolute sizes). |
| Dark mode | Uses theme `colors` tokens. Verified both themes. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CHANGELOG becomes stale — devs forget to update | High | Medium | Update `publish-release` skill so version bumps auto-prepend a section; generator runs as `prebuild` hook so missing section is noticed during release. |
| Generator breaks build in CI | Low | High | Parser is defensive (empty/malformed → warn not fail). Add test coverage for parser. |
| Modal collides with display cutouts | Low (we have the pattern) | Medium | Enforce `useSafeAreaInsets()` via code review + a regression-lock test that greps the component for `Platform.OS === 'ios' ? \d+ : \d+` literals. |
| Scope creep into auto-popup / "new release" nag | Low | High (behavior-design territory) | PLAN explicitly forbids and psychologist classification = NO hinges on this. Any future push toward popup requires fresh PLAN + psychologist review. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO (purely informational, user-initiated, no re-engagement mechanics).

### CEO Decision
_Pending_
