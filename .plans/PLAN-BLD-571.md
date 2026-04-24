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
- **Affordance**: Split the version out of the concatenated About paragraph into its **own Settings row** above the app description, matching the `FeedbackCard` row pattern. Row contents: label `CableSnap v{version}` on the left, `chevron-right` icon + subtle `"What's new"` hint on the right; whole row is a single `Pressable` with a ripple (Android) / opacity (iOS) feedback. Description paragraph + AGPL link + BuyMeACoffee badge remain below in a separate non-pressable block — no nested pressables, no conflict with the AGPL `Linking.openURL`.
- **Modal**: Full-screen `Modal` (RN) using `presentationStyle="pageSheet"` on iOS, default slide-up on Android. Header: title "What's New", close (X) top-right, safe-area aware (use `useSafeAreaInsets()` — Z Fold 6 cutout memory).
- **List**: A `ScrollView` with `showsVerticalScrollIndicator` of release entries (QD rec 7 — FlatList is over-engineered for ~50 entries and the implied nested-scroll-inside-modal is a known mobile antipattern). Each item: version header (`v0.26.8` bold) + date (if available) + body (multi-line, preserves line breaks). Dividers between entries. Current version pinned at top with subtle "Current" chip (see detection rule below).
- **Current-version detection** (QD rec 8): runtime computes `const currentVersion = Constants.expoConfig?.version;` and matches case-insensitively against each `entry.version` (which the generator has already stripped of the leading `v`). The top entry whose `version === currentVersion` renders with a "Current" chip. If no match (local dev bumped `package.json` but not CHANGELOG.md, or vice versa), **no chip is rendered on any entry** — modal still renders cleanly, does not crash.
- **Empty/fallback**: Build-time, a missing/empty CHANGELOG is now a hard error (see Technical Approach §2). At runtime, if `CHANGELOG` is unexpectedly empty (defensive), show "No release notes available" centered.
- **A11y**: Pressable has `accessibilityRole="button"`, `accessibilityLabel="View release notes, current version {v}"` (no trailing "button" — `accessibilityRole` already appends it via screen reader — QD nit 9). Modal close button labeled "Close release notes". Entry headings marked `accessibilityRole="header"`.
- **Theming**: Uses existing `colors` / `fontSizes` tokens. No hardcoded colors.

### Technical Approach

**Data source** — bundle release notes at build time. The plan adopts QD's blocker resolutions (no prior `*.generated.ts` precedent in repo; no `build`/`prebuild` npm hook exists today):

1. **Canonical source**: `CHANGELOG.md` at repo root, human-authored as part of the release flow:
   ```
   ## v0.26.8 — 2026-04-24
   - Bullet
   - Bullet

   ## v0.26.7 — 2026-04-20
   - ...
   ```
   Version header format: `## v<semver> — YYYY-MM-DD` (leading `v`, em-dash separator, ISO date). The generator strips the leading `v` when emitting the data structure so runtime compares cleanly against `Constants.expoConfig?.version` (which has no `v`).

2. **Generator**: `scripts/generate-changelog.ts` reads `CHANGELOG.md`, parses sections into `{ version: string, date: string | null, body: string }[]` (newest first — order of appearance in file), writes two outputs atomically (tmp + `renameSync`):
   - `lib/changelog.generated.ts` — `export const CHANGELOG: ReleaseEntry[] = [...]` (committed to repo, see freshness gate below).
   - `fdroid/metadata/com.alankyshum.cablesnap/en-US/changelogs/<versionCode>.txt` — one file per entry, containing that section's body only. Matches the existing F-Droid convention; `<versionCode>` is read from `app.config.ts`'s current versionCode for the top entry, and for historical entries uses an optional `<!-- versionCode: N -->` HTML comment inside the section (fallback: skip writing if absent — historical F-Droid files stay as-is).

   **Hard-require** (QD blocker 3 resolution): if `CHANGELOG.md` is missing OR parses to zero valid entries, generator exits non-zero — build fails fast. Missing source = bug, not a soft fallback. The modal empty-state string ("No release notes available") remains only as a defensive runtime fallback, not a build mode.

3. **Commit the generated file** (QD blocker 1 resolution). `lib/changelog.generated.ts` is committed. `.gitignore` is **not** updated to exclude it. Freshness gate: CI (and Husky pre-commit, if present) runs `npm run changelog:gen && git diff --exit-code lib/changelog.generated.ts`. This mirrors the committed `assets/store-screenshots/` convention rather than the gitignored R2-hosted `generated-illustrations/` convention — because the changelog is small (<20KB), must be present in every build without a codegen dependency, and must work in F-Droid's reproducible-build CI with no network.

4. **npm script wiring** (QD blocker 2 resolution). `package.json`:
   ```json
   "changelog:gen": "tsx scripts/generate-changelog.ts",
   "prestart":    "npm run changelog:gen",
   "preandroid":  "npm run changelog:gen",
   "preios":      "npm run changelog:gen",
   "preweb":      "npm run changelog:gen",
   "prebuild:apk":     "npm run changelog:gen",
   "prebuild:apk:prod":"npm run changelog:gen",
   "prebuild:apk:cloud":"npm run changelog:gen"
   ```
   (npm respects `pre<name>` for any script lifecycle.) Since the output is committed, these hooks are belt-and-suspenders: a cold `eas build --local` still works against the committed file even if the hook is skipped; the hook just keeps the committed file fresh during active dev.

5. **Runtime consumption**: `components/ReleaseNotesModal.tsx` imports `{ CHANGELOG } from '@/lib/changelog.generated'`. No network, no async, no storage. Works offline. Zero runtime cost.

6. **`publish-release` skill integration** (QD major 5 resolution): `publish-release/SKILL.md` becomes the single source of truth orchestrator:
   - **Step 2** (version bump) is extended: alongside bumping `package.json`, `app.config.ts`, and F-Droid metadata files, **prepend a new `## v<new> — <date>` section to `CHANGELOG.md`** with the operator-authored bullets (prompt in the skill).
   - **Step 6** (regenerate): run `npm run changelog:gen` so `lib/changelog.generated.ts` and the F-Droid `<versionCode>.txt` for the new version are rewritten from CHANGELOG.md.
   - **Step 7** (GitHub Release): change from `gh release create --notes '...'` to `gh release create --notes-file <(sed -n '/^## v<new>/,/^## v/p' CHANGELOG.md | head -n -1)` (or a temp file written by the skill). Prevents the two surfaces from drifting.

**Files touched**:
- NEW `CHANGELOG.md` (seeded with last ≥5 versions, handwritten by implementer from `git log --oneline` + tag annotations + existing F-Droid `changelogs/1.txt, 2.txt, 7.txt, 11.txt`).
- NEW `scripts/generate-changelog.ts`.
- NEW `lib/changelog.generated.ts` (**committed**; regenerated from CHANGELOG.md).
- UPDATED `fdroid/metadata/com.alankyshum.cablesnap/en-US/changelogs/<versionCode>.txt` — one new/overwritten file per CHANGELOG entry that carries a `<!-- versionCode: N -->` marker (see AC F-Droid-sync).
- NEW `components/ReleaseNotesModal.tsx`.
- EDIT `app/(tabs)/settings.tsx` — **split the version into its own dedicated row** above the app description (QD blocker 4 resolution). New visual pattern: a standalone row matching `FeedbackCard` (label `CableSnap v{version}` on the left, `chevron-right` + "What's new" hint on the right) inside a `Pressable`. The existing description paragraph + AGPL link + BuyMeACoffee badge stay in a *separate* non-pressable block below the new row. No nested pressables; AGPL `Linking.openURL` stays a `Text` child with its own `onPress`.
- EDIT `package.json` — add `changelog:gen` script + `pre<lifecycle>` hooks (see §4 above).
- EDIT `publish-release/SKILL.md` — wire CHANGELOG.md into Steps 2, 6, 7.
- NEW `__tests__/components/ReleaseNotesModal.test.tsx` — render, tap close, renders entries, current-version chip logic.
- NEW `__tests__/scripts/generate-changelog.test.ts` — parser covers happy path, malformed section skip-with-warning, missing file → non-zero exit, atomic-write verification, F-Droid sidecar file emission.

### Dependencies
None. Pure RN primitives + existing repo conventions.

## Scope

**In:**
- `CHANGELOG.md` as canonical single source of truth for release notes (app + GitHub Releases + F-Droid).
- Build-time generator emitting a committed `lib/changelog.generated.ts` (not gitignored) plus per-version F-Droid `<versionCode>.txt` sidecar files.
- npm `pre<lifecycle>` hooks to keep the committed file fresh during dev; CI freshness gate.
- Dedicated Settings row split out of the About paragraph, with `Pressable` + chevron + "What's new" hint.
- Modal (`ScrollView`, not FlatList) listing all historical release notes newest-first with a "Current" chip on the matching entry.
- Seeded with ≥5 historical versions (claudecoder writes from git log + existing F-Droid changelogs).
- Safe-area aware, no hardcoded cutout constants.
- `publish-release` skill updated to author releases through CHANGELOG.md (Steps 2, 6, 7).
- Tests (modal + parser + regression-lock for cutout literals).

**Out:**
- Auto-popup on launch (explicit owner preference: NO).
- Remote fetch / dynamic changelog (offline-first, no runtime network).
- i18n of release-note bodies (English only for now — same as rest of app).
- Push notification "new version has release notes!" (behavior-shaping — explicitly out).
- "Mark as read" / unread badge on version row (behavior-shaping — explicitly out).
- Deep linking to a specific version.
- Backfilling historical F-Droid `<versionCode>.txt` files that have no `<!-- versionCode -->` marker in CHANGELOG.md — existing files (1.txt, 2.txt, 7.txt, 11.txt) stay untouched; only new entries with explicit markers produce sidecar files.

## Acceptance Criteria

- [ ] GIVEN I am on the Settings tab WHEN I look at the About card THEN a **dedicated version row** (label `CableSnap v0.26.8`, right-aligned chevron + "What's new" hint) is visible above the description paragraph; the description + AGPL link + BuyMeACoffee badge remain in a separate non-pressable block below.
- [ ] GIVEN I tap the version row THEN a modal opens with the title "What's New" and a close (X) button in the top-right. Tapping anywhere on the description block (AGPL link excepted) does NOT open the modal.
- [ ] GIVEN the modal is open THEN it lists release entries newest-first (preserving CHANGELOG.md order); the entry whose `version` matches `Constants.expoConfig?.version` is annotated with a "Current" chip. If no entry matches, no chip is rendered and the modal still renders the list cleanly.
- [ ] GIVEN I tap the close button OR swipe down (iOS pageSheet) OR press Android back THEN the modal closes and I return to the Settings tab.
- [ ] GIVEN the modal is rendered on a Z Fold 6 / Pixel punch-hole THEN the header does not collide with the status bar / display cutout (`useSafeAreaInsets()` applied; no hardcoded `Platform.OS === 'ios' ? N : N` constants).
- [ ] GIVEN `CHANGELOG.md` exists with ≥1 valid `## v<semver>` section WHEN I run `npm run changelog:gen` THEN `lib/changelog.generated.ts` is written deterministically (atomic tmp+rename, sorted by file order), and one F-Droid `fdroid/metadata/com.alankyshum.cablesnap/en-US/changelogs/<versionCode>.txt` file is written for every CHANGELOG entry that carries a `<!-- versionCode: N -->` marker.
- [ ] GIVEN `CHANGELOG.md` is missing OR parses to zero entries WHEN `npm run changelog:gen` runs THEN it exits non-zero with a descriptive error and no partial files are written.
- [ ] The committed `CHANGELOG.md` is seeded with **≥5** most recent release sections (the ≥5 requirement applies to the source file, not to whether the generator tolerates empty input).
- [ ] `lib/changelog.generated.ts` is committed to the repo. CI fails if `npm run changelog:gen && git diff --exit-code lib/changelog.generated.ts` detects drift.
- [ ] `publish-release/SKILL.md` is updated so Step 2 prepends a new CHANGELOG.md section, Step 6 runs `npm run changelog:gen`, and Step 7 creates the GitHub Release via `gh release create --notes-file` extracted from CHANGELOG.md (no duplicate hand-authored release notes).
- [ ] GIVEN a screen reader is on WHEN I focus the version row THEN it announces "View release notes, current version 0.26.8" (without a duplicated "button" in the label — the role appends it).
- [ ] PR passes all tests (`npm test`), typecheck, and existing lint with no regressions. No new warnings.
- [ ] No new runtime dependencies added (generator may add `tsx` as a devDependency only if it isn't already present; current repo already uses `tsx` for `scripts/generate-exercise-illustrations.ts` — reuse).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| `CHANGELOG.md` missing at build | Generator exits non-zero with `ERR: CHANGELOG.md not found`; build fails fast. No partial files written. |
| `CHANGELOG.md` present but zero `## v` sections parsed | Generator exits non-zero with `ERR: no valid release entries parsed`. |
| Malformed section (missing version header, e.g. `## something else`) | Generator skips that block, logs a warning to stderr; other entries still parse; overall exit 0 iff ≥1 valid entry. |
| Version header without date (`## v0.26.8`) | Parser accepts; `date` field is `null`; modal hides the date line. |
| Very long release-note body | `ScrollView` scrolls the whole modal; entry text wraps naturally; no nested-scroll antipattern. |
| User taps version row repeatedly | Modal opens once; second tap while open is a no-op (controlled `visible` state). |
| Android back button while modal open | Closes modal, does NOT navigate away from Settings tab. |
| Z Fold 6 / Pixel punch-hole | Safe-area insets applied to header. Regression-lock test greps component for `Platform\.OS === 'ios' \? \d+ : \d+` literals → must be zero. |
| Offline | Works — bundle-time data, no network. |
| Small / large font scale | Respects system font scale (use `fontSizes` tokens, no absolute sizes). |
| Dark mode | Uses theme `colors` tokens. Verified both themes. |
| Local dev: `package.json` bumped but `CHANGELOG.md` not | `Constants.expoConfig?.version` won't match any entry → no "Current" chip rendered; modal still renders list. |
| CHANGELOG has entry with `<!-- versionCode: N -->` marker | Generator writes `fdroid/.../changelogs/N.txt` with the section body. |
| CHANGELOG entry has no versionCode marker | Generator skips F-Droid sidecar for that entry (no overwrite of existing historical files). |
| `lib/changelog.generated.ts` drifts from CHANGELOG.md (dev forgot to run generator) | CI step `npm run changelog:gen && git diff --exit-code lib/changelog.generated.ts` fails the build. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CHANGELOG becomes stale — devs forget to update | Medium | Medium | `publish-release/SKILL.md` Step 2 mandates prepending a CHANGELOG section; Step 6 runs the generator; Step 7 reads the top section via `--notes-file`. Drift between the committed `lib/changelog.generated.ts` and `CHANGELOG.md` is caught by CI freshness gate. |
| Three surfaces drift (app modal, GitHub Release, F-Droid `<versionCode>.txt`) | Low (after skill wiring) | Medium | CHANGELOG.md is the single source; all three surfaces derive from it via generator + skill. |
| Generator breaks build in CI | Low | High | Parser unit-tested on happy / malformed / missing inputs. Atomic tmp+rename write prevents partial-file corruption. Hard exit codes only on missing source or zero entries. |
| Modal collides with display cutouts | Low (pattern established) | Medium | Enforce `useSafeAreaInsets()` via code review + regression-lock test that greps component for `Platform\.OS === 'ios' \? \d+ : \d+` literals → zero matches required. |
| Scope creep into auto-popup / "new release" nag / unread-badge | Low | High (behavior-design territory) | PLAN explicitly forbids; Behavior-Design Classification = NO hinges on this; ANY future push toward either requires a fresh PLAN + psychologist review. |
| Bundle size bloat from committed `lib/changelog.generated.ts` | Very low | Very low | Changelog is <20KB even with 100 entries; Metro tree-shakes unused fields. |
| F-Droid sidecar files overwrite hand-curated history | Low | Medium | Generator only writes `<versionCode>.txt` when the CHANGELOG section carries an explicit `<!-- versionCode: N -->` marker; existing files without a marked source are left untouched. |

## Review Feedback

### Quality Director (UX) — REQUEST CHANGES (2026-04-24 17:41Z)

Directionally good, but four concrete blockers and two major concerns must be resolved before APPROVE.

**🔴 Blockers**

1. **`manifest.generated.ts` pattern cited in plan does not exist in this repo.** Grepped the tree: the only generator is `scripts/generate-exercise-illustrations.ts`, whose output (`generated-illustrations/illustrations-manifest.json`) is **gitignored and hosted on R2** (external) — not a committed-TS precedent. Plan must decide explicitly:
   - **Commit `lib/changelog.generated.ts`** (recommended) — mirrors committed `assets/store-screenshots/`; CI freshness gate = `npm run changelog:gen && git diff --exit-code lib/changelog.generated.ts`. OR
   - **Gitignore + regenerate at build time** — but then see blocker 2 (no prebuild hook wired) and F-Droid CI must run generator before `eas build`.

2. **No `build`/`prebuild` npm script exists today.** `package.json` scripts are `start`, `android`, `ios`, `web`, `build:apk[:prod|:cloud]` — no `build` and no lifecycle hook point. `expo start` does NOT invoke npm `prebuild`; `eas build --local` also does not run arbitrary npm scripts before Metro bundles. Plan's "add prebuild/predev hook" is aspirational. Concrete fix: add `"changelog:gen": "tsx scripts/generate-changelog.ts"` and invoke from `prestart`, `preandroid`, `preios`, `preweb` (npm honors `pre<name>` lifecycle). Combined with blocker 1 → commit the output so cold CI is never dependent on codegen timing.

3. **AC/back-compat contradiction.** AC "app bundle includes at least 5 release entries" vs back-compat "missing CHANGELOG → empty array, build succeeds". Pick one:
   - **Hard-require** (preferred): generator fails non-zero if `CHANGELOG.md` missing or has <1 entries. Missing source = bug.
   - **Soft fallback kept**: drop the ≥5 AC, add a CI job to assert entry count, retain the "No release notes available" empty-state.

4. **Settings version row is not a standalone block today** (`app/(tabs)/settings.tsx:157-180`). The version text is concatenated with the app description inside the same `<Text>` and followed by an AGPL `Linking.openURL` link + BuyMeACoffee badge in the same `<CardContent>`. Wrapping the current `<Text>` in a `Pressable` will either make the description tappable (wrong touch target) or fight the AGPL link's onPress. Plan must specify: **split the version into its own dedicated row above the description**, matching the visual pattern of other Settings rows (e.g., FeedbackCard). The chevron + "What's new" hint should live only on that row.

**🟡 Major concerns**

5. **Single-source-of-truth / duplication risk.** `publish-release/SKILL.md` Step 7 has operators hand-write release notes into `gh release create --notes '...'`. Adding `CHANGELOG.md` without integrating it will cause drift within 2 releases. Fix: designate `CHANGELOG.md` as canonical, have the skill extract the top section and pass via `gh release create --notes-file`, and **have Step 2 of the skill include updating CHANGELOG.md** alongside the 3 version-bump files.

6. **F-Droid per-version changelogs demoted to "stretch" is wrong.** F-Droid users read `fdroid/metadata/.../changelogs/<versionCode>.txt` in-client. Today only 1, 2, 7, 11 exist vs actual version codes 51+ — F-Droid is already lying to users. Writing the newest section to the corresponding `<versionCode>.txt` during release is ~10 lines in the generator/skill. Promote to AC.

**🟢 Recommended**

7. **`FlatList` for ~50 entries is over-engineered and nested-scroll implies antipattern.** Use `ScrollView` with `showsVerticalScrollIndicator`; entries wrap naturally. Perf diff negligible <200 items.

8. **"Current version" detection is unspecified.** Plan says current is pinned with a chip but not *how*. Implementation compares `entry.version` to `Constants.expoConfig?.version`; generator must strip leading `v` from headers (or runtime tolerates both). Edge case: mismatch → omit chip, don't crash.

9. **A11y label nit.** `accessibilityLabel="View release notes, current version {v}"` is correct; the trailing `"button"` in the example duplicates `accessibilityRole="button"` (screen readers append the role automatically). Remove from the plan example.

**✅ Behavior-Design Classification: I concur with NO.**

Sanity-checked against SKILL §3.2 triggers:
- ❌ No gamification, streaks, rewards, badges
- ❌ No notifications (explicit out)
- ❌ No auto-popup (explicit out, owner preference)
- ❌ No unread indicator on version row (explicit out)
- ❌ No motivational copy, identity framing, re-engagement
- ✅ User-initiated, pull-based, purely informational

The classification holds **iff** the scope exclusions stay hard-excluded — particularly the "unread dot" temptation and "what's new" push nudge. Plan's Risk row 4 already codifies this; keep it. Any future move toward either = fresh Behavior-Design review (psychologist + QD).

**Summary:** Fix blockers 1–4 and major concerns 5–6. 7–8 strongly recommended, 9 is a nit. After those, clean APPROVE.

### CEO Response to QD — Revisions applied (2026-04-24 17:5xZ)

All QD blockers and major concerns incorporated into the plan above:

- **Blocker 1** (no `*.generated.ts` precedent) → Plan now explicitly commits `lib/changelog.generated.ts` (the "recommended" branch), mirroring committed `assets/store-screenshots/` rather than the gitignored R2 pattern. CI freshness gate added to ACs.
- **Blocker 2** (no `prebuild` hook exists) → Plan now adds a `changelog:gen` script invoked from `prestart`, `preandroid`, `preios`, `preweb`, and each `prebuild:apk*` (npm `pre<name>` lifecycle). Committed output means cold `eas build --local` still works even without the hook.
- **Blocker 3** (AC/back-compat contradiction) → Resolved by picking **hard-require**: missing or empty CHANGELOG fails the generator with non-zero exit. The "≥5 entries" AC now applies to the seeded source file, not generator behavior. Runtime empty-state is defensive only.
- **Blocker 4** (Settings version row not standalone) → Plan now specifies splitting the version into its own dedicated `FeedbackCard`-style row above the description. AGPL link + BuyMeACoffee badge stay in a separate non-pressable block. New AC asserts tapping description does NOT open the modal.
- **Major 5** (single source of truth / publish-release skill drift) → Plan now updates `publish-release/SKILL.md` Steps 2 (prepend section), 6 (run generator), 7 (`gh release create --notes-file` from CHANGELOG top section). AC added.
- **Major 6** (F-Droid per-version changelog promoted from stretch) → Generator now emits `fdroid/metadata/.../changelogs/<versionCode>.txt` for every CHANGELOG entry with an explicit `<!-- versionCode: N -->` marker. AC added. (Historical files without a marker are not overwritten — see Scope Out + Edge Cases.)
- **Rec 7** (`FlatList` over-engineered) → Changed to `ScrollView` with `showsVerticalScrollIndicator`.
- **Rec 8** ("Current" detection unspecified) → Plan now specifies `Constants.expoConfig?.version` vs generator-stripped `entry.version`; mismatch → no chip, no crash. AC added.
- **Nit 9** (duplicated "button" in a11y label) → Example cleaned up; AC now specifies the correct announcement.

Re-requesting QD review.

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO (purely informational, user-initiated, no re-engagement mechanics).

### CEO Decision
_Pending_
