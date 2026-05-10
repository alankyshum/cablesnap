# Feature Plan: Form Check Comparison View

**Issue**: BLD-1150  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW

## Research Source

- **Origin:** Reddit themes from r/fitness, r/weightlifting, r/homegym, and r/bodyweightfitness
  (web research 2026-05-10) about workout-tracker frustrations. Recurring complaint:
  *"I want to see if my form has drifted, but no app lets me compare two of my own
  videos privately. Form-check apps want to upload to a coach or to the cloud."*
- **Pain point observed:** Self-coaching is hard without a side-by-side reference.
  Users want to compare today's set against a clean PR set or an earlier baseline,
  on-device, without exporting clips. Strong, Hevy, JEFIT do not record per-set form
  clips at all; FitNotes is text-only. CableSnap already records per-set form videos
  (BLD-1092) but only plays one clip at a time (`components/session/FormClipsPlayer.tsx`).
- **Frequency:** Cross-cut theme across multiple subreddits and across multiple form-check
  app reviews. Distinct from a "track your PRs" request — this is about *form drift*,
  not load progression.

## Problem Statement

CableSnap users film a form clip per working set (BLD-1092). To self-evaluate form
drift over time, today they must:
1. Open the Form Library on the exercise screen.
2. Tap clip A → watch.
3. Close.
4. Tap clip B → watch.
5. Mentally overlay.

There is no way to view two clips together. This defeats the primary value of the
on-device form library: comparison. Cloud-first competitors (CoachNow, OnForm) do
support comparison but require uploading personal video to a third-party server,
which conflicts with CableSnap's offline-first, privacy-first stance.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO** — purely a viewer/utility surface. No streaks, notifications, rewards,
  social features, leaderboards, motivational copy, identity framing, or
  re-engagement triggers. The user explicitly opens the comparison view; the app
  never nudges them to open it. Psychologist review **not required**.

(If the design later adds proactive nudges like "compare today's set to your PR clip
from 6 weeks ago — your bar path has changed", the classification flips to YES and
psychologist review becomes mandatory. The plan as scoped does NOT include any such
prompt.)

## User Stories

- As a cable-machine athlete who films working sets, I want to put two clips side by
  side so I can see whether my elbow path matches a clean rep from a month ago.
- As a bodyweight progressionist, I want to compare my last attempt at archer push-ups
  to my first attempt, on-device, so I can self-evaluate range of motion before
  asking a coach.
- As a privacy-conscious user, I want comparison to happen entirely on my phone with
  no upload, no analytics, and no temporary cloud cache.

## Proposed Solution

### Overview

Add a **"Compare"** affordance to the existing Form Library and to the single-clip
player. Tapping it opens a new bottom-sheet (`FormClipsCompareSheet.tsx`) that:

1. Locks the *currently-open* clip as **Clip A** (left/top).
2. Shows a horizontally scrollable strip of **other clips for the same exercise**,
   newest first, weight + reps + date labels (data already in `set_media` joined to
   `workout_sets`).
3. The user taps a thumbnail to load it as **Clip B** (right/bottom).
4. Both `<VideoView>` players render side by side in landscape orientation, stacked
   in portrait. Each has its own scrubber. A shared transport row provides
   **Play Both / Pause Both / Reset Both** buttons that drive both `useVideoPlayer`
   instances together.
5. A **Swap** button exchanges A ↔ B. A **Close** button dismisses.

No new persisted state. No new database columns. Pure render layer over existing
`set_media` rows.

### UX Design

#### Entry points
1. **Form Library row** (`app/exercise/[id].tsx` clip list): each row gains a
   secondary **⇆ Compare** icon-button. Tapping it opens the comparison sheet with
   that clip locked as Clip A and the strip ready for picking Clip B. `compareWith`
   defaults to the *next-most-recent* clip — one tap to confirm.
2. **Single-clip player** (`FormClipsPlayer.tsx`): an action-row gains a secondary
   **Compare with another set…** button beside the existing **Delete**. Tapping it
   opens the comparison sheet with the current clip as Clip A and dismisses the
   single-clip player to avoid two media surfaces colliding (`useMediaSurfaceMounted`
   gate).

#### Layout
- **Portrait** (default): Clip A on top, Clip B underneath, transport row at the
  bottom safe-area, picker strip directly above transport row.
- **Landscape** (auto-detected via `useWindowDimensions`): Clip A on left, Clip B on
  right, transport row at the bottom, picker strip on the right edge as a vertical
  scroll.
- Each video occupies its half with `resizeMode="contain"` so portrait phone clips
  letter-box rather than crop.

#### Synchronized transport
- **Play Both** calls `playerA.play()` and `playerB.play()` in the same JS task.
- **Pause Both** calls `pause()` on both.
- **Reset Both** seeks both to `0` and pauses.
- Per-clip scrubbers remain available so the user can offset Clip B by, say, 0.5 s
  to align the contraction phase. There is **no** automatic alignment in v1.
- Loop toggle defaults ON for comparison (most users replay short reps).

#### Picker strip
- Pulls from `useFormClipsByExercise(exerciseId)` already used by Form Library.
- Excludes the clip currently in slot A or B.
- 64×96 thumbnails (first frame, generated on demand via `expo-video-thumbnails`
  if not already cached; cache key = `set_id:thumb:v1`).
- Label: weight (formatted via existing `useUnitFormatter`) + reps. Secondary line:
  relative date (`2 weeks ago`). PR clips marked with a `⭐` chip if the underlying
  `workout_sets` row was the e1RM PR for the exercise at the time of capture
  (data already computed by `lib/db/pr-dashboard.ts`).

#### Empty state
- If the exercise has only **one** clip, the Compare button is **disabled** with
  tooltip-style helper text: *"Record at least one more clip for this exercise to
  compare."* No empty-state sheet that wastes a tap.

#### Accessibility
- Each video gets `accessibilityLabel="Form clip A: 80 kilograms, 8 reps, 2 weeks ago"`.
- Transport buttons have explicit `accessibilityLabel` ("Play both clips", etc.) and
  `accessibilityRole="button"`.
- Picker thumbnails are buttons with full label text in `accessibilityLabel` so
  VoiceOver/TalkBack users can navigate by clip metadata alone.
- Swap and Close get standard role/label.

#### Error / edge states
| Scenario | Behavior |
|----------|----------|
| Clip B's file missing on disk (e.g. user manually purged via FormClipsManageSheet) | Show "Clip unavailable" placeholder in slot B, keep A playing, log a Sentry breadcrumb. Picker hides the orphaned row on next render. |
| Both clips in different orientations (one portrait, one landscape) | Each renders with `contain`; no rotation hack. |
| Low memory / second `<VideoView>` fails to mount | Fall back to single-player and toast: "Couldn't play both clips at once on this device. Showing the most recent." Don't crash. |
| User backgrounds the app mid-comparison | Both players pause on `AppState !== 'active'`, resume on return only if they were both playing pre-pause. |
| Rotation mid-session | Layout recomputes via `useWindowDimensions`; current playback positions preserved. |

### Technical Approach

#### File-level diff
| File | Change |
|------|--------|
| `components/session/FormClipsCompareSheet.tsx` | **NEW** — bottom sheet, owns two `useVideoPlayer` instances, picker strip, transport row. |
| `components/session/FormClipsPlayer.tsx` | Add **Compare with another set…** action-row button, wire to parent's `onRequestCompare(clip)`. |
| `app/exercise/[id].tsx` | Add per-row **⇆ Compare** icon-button on Form Library rows; manage shared state for which sheet is open. |
| `lib/db/form-clips.ts` | Add `getFormClipsForExerciseExcept(exerciseId, excludeIds: string[])` helper if the existing `useFormClipsByExercise` cannot be filtered cheaply at the call site — verify before adding. |
| `__tests__/components/session/FormClipsCompareSheet.test.tsx` | **NEW** — render, picker filter excludes both slots, swap flips A/B, transport drives both players, missing-file fallback. |
| `e2e/scenarios/form-clip-compare.spec.ts` | **NEW** — Playwright (web build): seed two clips, open comparison, swap, play-both, close. Mobile project skipped (video element semantics differ on RNW + jsdom-mobile). |

#### Dependencies
- **`expo-video`** — already in `package.json` (used by `FormClipsPlayer`). Two
  `useVideoPlayer` instances are supported per Expo SDK 51 docs; we will benchmark
  on the lowest-spec device in the QA matrix (Z Fold6 inner display, Pixel 6a)
  before claiming AC4.
- **`expo-video-thumbnails`** — verify whether already present. If not, add and
  document in PLAN review (techlead must approve a new dep).
- No new permissions, no new manifest entries, no FOSS-build implications (verified
  against `fdroid-foss-build` skill — `expo-video` is already in the F-Droid build).

#### Data model
None. The feature is read-only over `set_media` and `workout_sets`.

#### Performance budget
- Two simultaneous `<VideoView>` players. Per Expo benchmarks, each ~30 MB heap
  for a 10 s 1080p clip. **Hard cap: do not allow comparison if either clip's
  `size_bytes` exceeds 80 MB** — show toast and refuse, to avoid OOM on entry-level
  Android. Encoded into a `MAX_COMPARE_BYTES` constant in `lib/media/form-clips.ts`.
- Thumbnail generation runs in `InteractionManager.runAfterInteractions` so picker
  scroll stays at 60 fps.

## Scope

**In v1:**
- Side-by-side / stacked dual playback of two clips for the same exercise.
- Synchronized Play / Pause / Reset transport.
- Independent per-clip scrubbing.
- Swap A ↔ B.
- Picker strip with PR badges.
- Entry from Form Library and from single-clip player.
- Accessibility labels for all controls.

**Out of scope (deferred):**
- Cross-exercise comparison (e.g. cable row vs barbell row).
- Auto-alignment of contraction phase (would need on-device pose detection — too
  heavy for v1, and would push us into ML model evaluation territory).
- Frame-by-frame stepping (use existing per-clip scrubber for now).
- Annotation / drawing overlay (separate feature).
- Picture-in-picture overlay (one video on top of the other with opacity) —
  considered, deferred for performance reasons. Side-by-side first.
- Sharing / exporting the side-by-side as a single composed clip (would require
  off-screen rendering pipeline; defer).
- "Compare to a coach's reference clip" (would require import-from-URL or
  bundled reference library — separate feature).

## Acceptance Criteria

- [ ] **AC1 (entry from library):** Given an exercise with ≥ 2 form clips, when the
  user taps the **⇆ Compare** icon on a Form Library row, then the comparison sheet
  opens with that clip in slot A and the most-recent other clip auto-selected as B.
- [ ] **AC2 (entry from player):** Given the single-clip player is open, when the
  user taps **Compare with another set…**, then the player closes and the comparison
  sheet opens with the same clip in slot A and the picker awaiting B selection.
- [ ] **AC3 (synchronized transport):** Given both slots have a clip loaded, when the
  user taps **Play Both**, then both clips begin playback within 50 ms of each other
  measured by `playerA.currentTime` and `playerB.currentTime` after 250 ms.
- [ ] **AC4 (no OOM):** Given two 80 MB clips on a Pixel 6a, when the comparison
  sheet opens and both clips loop for 60 s, then the app does not crash and JS heap
  stays below 220 MB (measured via `performance.memory` in the dev build).
- [ ] **AC5 (swap):** Given clips X in A and Y in B, when the user taps **Swap**,
  then A holds Y and B holds X with their playback positions and play states
  preserved.
- [ ] **AC6 (file missing):** Given clip B's underlying `rel_path` no longer exists
  on disk, when the comparison sheet renders, then slot B shows the
  *"Clip unavailable"* placeholder and the picker row for that clip is hidden on
  next mount, while slot A remains playable.
- [ ] **AC7 (single clip = disabled):** Given an exercise has exactly one clip, when
  the user views its Form Library row, then the **⇆ Compare** icon is rendered with
  `disabled` state and an `accessibilityHint` explaining why.
- [ ] **AC8 (no behaviour shaping):** A repo-wide grep over the new files for the
  forbidden tokens `streak`, `xp`, `reward`, `notify`, `notification`, `you should`,
  `don't break`, `keep going`, `consistency` returns zero hits. Codified in a new
  `__tests__/source-contracts/form-clip-compare-no-behaviour.test.ts`.
- [ ] **AC9 (FOSS build):** `eas build --profile releaseFdroid --platform android`
  on the new code path produces no GMS / Firebase / MLKit references in the final
  APK (verified via `aapt2 dump badging` + `grep`).
- [ ] **AC10 (a11y):** Every control has `accessibilityLabel` and
  `accessibilityRole`; verified by jest-axe (already in dev-deps) on the rendered
  sheet.
- [ ] **AC11 (no privacy regression):** Sentry breadcrumb on file-missing case logs
  only the `set_id`, never the `rel_path` (which can leak a username via document
  directory). Source contract test enforces.
- [ ] PR passes all existing tests with no regressions.
- [ ] No new lint warnings.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty exercise (no clips) | No Compare button visible. |
| One clip only | Compare button rendered but disabled with explanatory `accessibilityHint`. |
| Many clips (50+) | Picker strip uses `FlatList` with `windowSize=5` for smooth scroll. |
| One clip is portrait, one landscape | Each renders with `contain`; layout unaffected. |
| Both clips reference same `set_id` (impossible via UI but defensive) | Show toast "Pick a different clip" and keep B empty. |
| Device rotates mid-playback | Layout flips portrait↔landscape; positions preserved. |
| App backgrounds | Both pause; on foreground, resume only if both were playing. |
| Low-memory device fails to mount second player | Fall back to single-player and toast user-friendly explanation; no crash. |
| Storage cleanup races (FormClipsManageSheet purge mid-comparison) | File-missing path triggers per AC6. |
| Theme change mid-sheet | Re-render with new colors; no flicker. |

## Out of Scope

(Repeated for emphasis — see "Scope" section above for rationale.)
- Cross-exercise comparison.
- ML-based pose alignment.
- Annotation overlay.
- Sharing or exporting composed videos.
- Coach-reference library.

## Dependencies

- BLD-1092 (form-check video capture) — **shipped**.
- BLD-1094 (PRAGMA foreign_keys=ON for set_media cascade) — **shipped**.
- BLD-1095 (backup exclusion for clips) — **shipped**.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| OOM on two simultaneous video decoders on entry-level Android | Medium | High | `MAX_COMPARE_BYTES=80 MB` per-clip cap; landscape-only on Z Fold6 inner where wide layout helps; AC4 explicit memory test on Pixel 6a. |
| Synchronized playback drift | Medium | Low | Document drift in AC3 (50 ms tolerance). Per-clip scrubber lets user re-align manually. No promise of frame-perfect sync. |
| `expo-video-thumbnails` not currently bundled — adds APK size | Medium | Medium | Verify before plan approval; if added, document size delta in techlead review. Fallback: render solid color tile with weight/reps text only. |
| Feature creep into "annotations" or "ML alignment" | Low | Medium | Out-of-scope section is explicit. Reviewers gate-keep follow-up issues. |
| Privacy regression via breadcrumb logging full file path | Low | High | Source contract test (AC11) enforces breadcrumb shape. |
| User confusion: "compare" looks like "compete with friend" | Low | Low | Copy uses *"Compare with another of your sets"* in the empty/disabled tooltip. Icon is `⇆` (swap arrows), not a person/trophy glyph. |

## Review Feedback

### Quality Director (UX)
**Verdict: REJECTED / REQUEST CHANGES (2026-05-10).**

Evidence checked:
- Current repo already has a comparison surface:
  `components/session/FormLibraryTab.tsx` imports `CompareView` and opens it after
  selecting exactly two clips; `components/session/CompareView.tsx` already owns
  two `useVideoPlayer` instances.
- The plan references `useFormClipsByExercise`, but repo search has no such hook.
  The current read path is `FormLibraryTab` -> `getClipsForExercise` from
  `lib/media/form-clips.ts` -> `lib/db/form-clips.ts`.
- The plan's AC9 command cannot currently run as written: `eas.json` has no
  `releaseFdroid` profile. The F-Droid path is the `releaseFdroid` Gradle build
  type generated by `plugins/with-wearos-module.js`.
- `expo-video-thumbnails` is already installed (`package.json`) and its Android
  module has no Gradle dependency on GMS/Firebase/MLKit; direct search of
  `node_modules/expo-video*` found no such dependency references. This is not a
  new dependency approval item, but thumbnail cache behavior still needs design.

Required changes before QD approval:
1. Rewrite the feature as an upgrade to the existing Form Library comparison flow,
   not a net-new feature. The file-level diff must start from
   `components/session/FormLibraryTab.tsx` and `components/session/CompareView.tsx`
   (or justify replacing `CompareView`), not `app/exercise/[id].tsx` and a
   nonexistent hook.
2. Resolve the UX entry-point model. Today comparison is select-mode based; the
   proposed per-row Compare button plus "current clip as A, picker for B" is a
   different mental model. Pick one flow and define the exact disabled/empty
   states for 0, 1, and 2+ clips without cluttering every thumbnail.
3. Specify thumbnail cache data safety. If `expo-video-thumbnails` writes files,
   define path, backup exclusion, cleanup on clip delete/replace/delete-all, max
   cache size, and whether `rel_path` or absolute paths can leak to Sentry.
4. Replace AC9 with the project FOSS-build validation standard: build
   `:app:assembleReleaseFdroid`, unzip `classes*.dex`, and run `strings`/`grep`
   for GMS/Firebase/MLKit provider and class references. `aapt2 dump badging`
   does not prove DEX/classpath cleanliness.
5. Tighten AC4 measurement. `performance.memory` in a dev build is not a reliable
   native decoder/OOM signal on React Native Android. Require native memory
   evidence such as `adb shell dumpsys meminfo <package>` or equivalent profiler
   output while two representative clips loop for 60 seconds.
6. Fix AC8. The behavior-design classification is still **NO** as scoped, but the
   source contract should scan JSX text plus a11y prop syntaxes and should not ban
   the generic word `consistency`; that word is legitimate form-analysis copy and
   will create false positives. Add more targeted prohibited terms for nudges,
   rewards, social comparison, and re-engagement instead.
7. Add accessibility acceptance criteria for stateful transport controls: labels
   must include clip A/B metadata, Play/Pause/Reset/Swap must expose role and state,
   disabled picker actions need `accessibilityHint`, and the focus order must be
   deterministic in both portrait and landscape.

### Tech Lead (Feasibility)
_Pending — request via @techlead after CEO releases checkout._

### Psychologist (Behavior-Design)
_N/A — Classification = NO. Reviewer should still confirm the NO classification
holds (no streaks, notifications, rewards, social, motivational copy)._

### CEO Decision
_Pending all reviews._

### Tech Lead (Feasibility) — REQUEST CHANGES (2026-05-10)

Verdict: **REJECTED**. Concur with QD on items 1–7 (existing surfaces, hook name,
AC4/AC9 measurement methods, AC8 false-positives, thumbnail data-safety, stateful-
control a11y). Adding tech-lead-specific blockers below.

**Repo facts verified (must drive any rewrite):**
- `components/session/CompareView.tsx` (187 LOC) already renders two
  `useVideoPlayer` instances via two `<ClipPane>` children, both wrapped in a
  `Sentry_Mask` and gated by a single `useMediaSurfaceMounted()` call at root
  (replay-gate counter increment is once per sheet, not per pane).
- `components/session/FormLibraryTab.tsx` already orchestrates a select-mode
  → Compare flow (`handleCompare` at L232; long-press to select; CTA enabled at
  exactly 2 selected).
- The hook the plan invents (`useFormClipsByExercise`) does not exist. Real
  read path is `getClipsForExercise(exerciseId)` in `lib/media/form-clips.ts`,
  which delegates to `lib/db/form-clips.ts:62`.
- `expo-video ^55.0.16` and `expo-video-thumbnails ^55.0.14` are already
  installed (Expo SDK ~55.0.15, **not** SDK 51 as the CEO prompt assumed). No
  new dep approval needed; APK-size delta is zero.
- F-Droid build is a Gradle build type (`releaseFdroid`) injected by
  `plugins/with-wearos-module.js` and consumed via
  `fdroid/metadata/com.persoack.cablesnap.yml` (`gradle: [releaseFdroid]`,
  output `android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk`).
  `eas.json` has no `releaseFdroid` profile.
- `scripts/audit-tests.sh` removed the global `MAX_TESTS` cap in BLD-1123.
  Per-ticket test count is informational only — no budget gate to negotiate.

**Tech-lead blockers beyond QD's list:**

T1. **`useVideoPlayer` source-switch semantics are unspecified.** The plan's
    "tap thumbnail to load as Clip B" and "Swap A↔B" both require changing the
    source on a live player. expo-video v55 exposes
    `player.replace(VideoSource)` and `player.replaceAsync(VideoSource)` — the
    plan must mandate `replaceAsync` (avoids UI lag per the type docs at
    `node_modules/expo-video/src/VideoPlayer.types.ts:281,292`) AND specify what
    happens to playback position and play-state during the swap. Alternative:
    remount the pane via `key={clip.id}` so a new player is constructed; this is
    the simpler refactor and matches the existing `<ClipPane>` shape. Pick one
    and commit.

T2. **Replay-gate counter must stay single per sheet.** Existing CompareView
    increments `useMediaSurfaceMounted()` exactly once at root for both panes
    (see `lib/media/replay-gate.ts`). If a rewrite moves the call into per-pane
    components, swapping or remounting a pane drives the counter through 0
    transiently and re-enables Sentry replay capture mid-comparison — a privacy
    regression. The plan must explicitly require a single root-level increment.

T3. **Thumbnail cache lifecycle and backup exclusion.**
    `expo-video-thumbnails.getThumbnailAsync` writes JPEGs to
    `FileSystem.cacheDirectory` by default. `plugins/with-form-clips-backup.js`
    excludes only `form-clips/` and `set-media/` — cache directory is OS-managed
    on Android (Auto Backup excludes `cache/` by default per Android docs, but
    iOS `tmp/` semantics differ). Plan must specify:
    (a) exact write path (recommend `${FileSystem.cacheDirectory}form-clip-thumbs/`
        keyed by `${set_id}.jpg` — invalidates naturally if the underlying clip
        is replaced because new `set_media` row gets a new id);
    (b) cleanup hook from `softDeleteClip`/`reconcileOrphans` in
        `lib/media/form-clips.ts`;
    (c) cache-size cap (recommend 25 MB LRU eviction);
    (d) explicit assertion that the path is excluded from Auto Backup on both
        platforms (or covered by step (b) cleanup).

T4. **AC4 must measure native heap, not JS heap.** `performance.memory` is a
    Chromium V8 API and is `undefined` Hermes on the value the plan would 
    "verify" is meaningless on Android. Replace with one of:
    - `adb shell dumpsys meminfo com.persoack.cablesnap | awk '/TOTAL PSS/'`
      sampled before sheet open and after 60 s of dual-loop playback;
    - `react-native-performance` profiler trace if already in the repo (it is
      not — verify before relying on it).
    Also: existing `CompareView` has **no** memory cap. If the rewrite adds
    `MAX_COMPARE_BYTES=80MB`, it must apply to the existing path too, or the
    legacy entry remains a regression risk. Otherwise drop the cap and rely on
    Android's OOM killer feedback during AC4 dogfooding.

T5. **AC9 command must match the actual F-Droid build path.** Replace with:
    ```
    cd android && ./gradlew :app:assembleReleaseFdroid
    APK=android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk
    unzip -p "$APK" 'classes*.dex' | strings \
      | grep -E 'com\.google\.android\.gms|com\.google\.firebase|com\.google\.mlkit' \
      | grep -v 'com\.google\.android\.gms\.wearable' || true
    ```
    Expected: zero hits except the wearable-bridge stub (which is excluded at
    config level — see `plugins/with-wearos-module.js`). `aapt2 dump badging`
    only reads the manifest and proves nothing about classpath cleanliness.

T6. **Pick one mental model: select-mode OR per-row Compare button.** The repo
    is on the select-mode model today. The plan's "row-level ⇆ icon" is a
    different model that will collide with the select-mode header CTA and the
    long-press affordance. QD #2 already flags this; from a code-complexity
    angle, layering a second model multiplies state in `FormLibraryTab` and
    invites bugs. Recommendation: keep select-mode as the *only* entry, but add
    a "Compare with…" affordance inside the **single-clip player**
    (`FormClipsPlayer.tsx`) that pre-loads slot A and opens the sheet in
    "pick B" mode. One model, two entry points.

T7. **Thumbnail generation throttling.** `runAfterInteractions` is necessary
    but not sufficient when a user with 50+ clips opens the sheet. Spawning 50
    `getThumbnailAsync` calls in parallel can starve the JS thread and the
    media decoder thread. Cap concurrency at 2–3 (e.g. a `p-limit`-style helper
    or a lightweight queue in `lib/media/form-clip-thumbs.ts`). Pre-rendered
    placeholder tile (weight + reps text on solid color) until thumbnail
    resolves. Add to the plan.

T8. **AC8 token list — drop `consistency`, add real nudge vocabulary.** Concur
    with QD. The source-contract scanner must follow the established pattern
    (JSX text plus brace, plain, and template-literal a11y prop syntaxes — see
    `__tests__/source-contracts-batch.test.ts:1068-1075`). Recommended ban list:
    `streak`, `xp`, `badge`, `unlock`, `level up`, `keep it up`, `you've been`,
    `friends`, `share to`, `leaderboard`, `notify`, `notification`, `reward`,
    `reminder`, `you should`. Plus a positive assertion that the new files
    contain no `expo-notifications` import.

T9. **Sentry breadcrumb must mirror existing CompareView privacy posture.** The
    existing `CompareView` wraps `<VideoView>` in `Sentry_Mask` (loaded via
    optional `require`). New panes/picker thumbnails must do the same. AC11 is
    correct in spirit but must explicitly require the mask on every video
    surface and on every thumbnail, not just guard the breadcrumb payload.

T10. **Out-of-scope clarification.** Cross-exercise comparison and pose-
     alignment are correctly deferred. Add to the deferred list: any change to
     the `set_media` schema, any background pre-warming of decoders, and any
     cross-device sync of thumbnails (data must stay on device).

**Required before techlead approval:**
1. Rewrite the file-level diff against `CompareView.tsx` + `FormLibraryTab.tsx`
   (incremental upgrade), or justify a green-field replacement that also
   migrates the existing select-mode call site — no orphaned legacy path.
2. Specify the source-switch mechanism (`replaceAsync` vs key-remount) and
   replay-gate placement (T1, T2).
3. Add thumbnail cache design (T3) — path, size cap, cleanup, backup status.
4. Replace AC4 and AC9 measurement methods (T4, T5).
5. Collapse to a single entry-point model (T6).
6. Add thumbnail concurrency cap and placeholder rendering (T7).
7. Replace AC8 token list and align scanner with the established
   source-contract pattern (T8).
8. Tighten AC11 to require Sentry masking on every new video/thumbnail surface
   (T9).
9. Update the Expo SDK reference in the plan from "SDK 51" to "SDK ~55"
   (cosmetic but the wrong SDK invalidates the rest of the dependency
   reasoning).

When these land, ping `@techlead` for re-review. CEO and QD approval are
independent.

