# Feature Plan: Form Check Comparison View

**Issue**: BLD-1150  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW (rev 1) → REJECTED → IN_REVIEW (rev 2) → TL APPROVED W/ CONDITIONS + QD REJECTED → **IN_REVIEW (rev 3)**

> **Rev 3 (2026-05-10):** Rev 2 carried a single bad anchor — it called the
> secondary single-clip entry `FormVideoSheet`, which is actually the *recorder*
> (`CameraView` + `recordClip`), not the viewer. The real single-clip viewer is
> `FormClipsPlayer.tsx`, mounted from `app/session/[id].tsx`. Rev 3 retargets the
> file-level diff, AC2/AC7/AC8/AC12 wording, callsite wiring, and prop shape
> accordingly; closes Tech Lead C1 + C2 (state-batching ordering rule for the
> player→compare handoff so the `useMediaSurfaceMounted()` counter never
> transients to 0); closes QD-rev2-1..4 (file mismatch, missing wiring,
> incorrect "scrubbers remain" claim, stale "no way to view two clips together"
> copy). See the "Rev-3 Changes" section at the end for a per-blocker map.

> **Rev 2 (2026-05-10):** Both QD and Tech Lead REJECTED rev 1 because comparison
> already exists in the repo (`components/session/CompareView.tsx` opened from
> `components/session/FormLibraryTab.tsx` select-mode `handleCompare` at L232) and
> rev 1 was scoped as a net-new feature against a non-existent hook
> (`useFormClipsByExercise`) on the wrong Expo SDK (51 vs the actual ~55). Rev 2
> rewrites the feature as an **incremental upgrade to the existing CompareView +
> FormLibraryTab surfaces**. See the "Rev-2 changes" section directly below the
> Proposed Solution for a per-blocker (Q1–Q7, T1–T10) resolution table.

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

Today's `CompareView` does open two clips side-by-side, but it ships only a play
overlay — no transport row, no Swap A↔B, no in-sheet picker, no landscape layout,
no thumbnail cache. The single-clip player (`FormClipsPlayer`) has no path into
comparison at all. The combined effect is that the side-by-side view defeats the
primary value of the
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

## Proposed Solution (rev 2 — incremental upgrade to existing surfaces)

### Overview

The feature is an **upgrade to the existing comparison surface**, not a new one.
Today (`components/session/CompareView.tsx`, 187 LOC) renders two `useVideoPlayer`
instances stacked vertically with independent per-pane play/pause and a single
root-level `useMediaSurfaceMounted()` call (replay-gate counter increments once
per sheet — preserved). It is opened from `components/session/FormLibraryTab.tsx`
select-mode `handleCompare` (L232) when exactly two clips are selected.

Rev-2 keeps that select-mode flow as the **primary entry**, keeps `CompareView`
as the only comparison surface, and adds the following user-facing capabilities
to it:

1. **Synchronized transport row** — Play Both / Pause Both / Reset Both. Per-pane
   toggles remain available for offsetting (e.g. align contraction phase).
2. **Swap A ↔ B** — exchange the two clips with playback positions and play
   states preserved.
3. **In-sheet B picker** — a horizontally scrollable strip of *other* clips for
   the same exercise, so the user can change Clip B without exiting the sheet
   back to select-mode and re-picking. Swapping into a fresh B is a `key={clip.id}`
   remount of the B `<ClipPane>` — no `replaceAsync` source-switch on a live
   player (matches the existing `<ClipPane>` shape and avoids the position-/state-
   semantics ambiguity flagged in T1).
4. **Landscape layout** — when `useWindowDimensions().width >
   useWindowDimensions().height`, panes lay out left/right with a vertical divider;
   portrait keeps today's top/bottom layout.
5. **Second entry point** — the single-clip player surface
   (`components/session/FormClipsPlayer.tsx`, the actual single-clip viewer at
   `BottomSheet` + `useVideoPlayer`; `FormVideoSheet.tsx` is the *recorder*, not
   a viewer — it owns `CameraView` / `recordClip` and never receives a
   `SetMediaRow`) gets a **"Compare with another set…"** action row that
   pre-loads the current clip as Clip A and opens `CompareView` in "pick B" mode
   (B starts unselected; picker strip is the only path forward). Per Tech Lead T6,
   we keep one mental model: **select-mode + this single new entry** — no per-row
   ⇆ icon on Form Library thumbnails.

No new persisted state. No new schema. Pure render-layer upgrade plus one new
thumbnail-cache helper module.

### UX Design

#### Entry points (final — 2 only)
1. **Form Library select mode (existing).** Long-press or "Select" → tap two
   thumbnails → "Compare" CTA in `SelectActionsBar` opens `CompareView` with both
   slots filled. Picker strip is hidden by default in this flow (both slots
   already chosen) but available behind a small "Change" affordance per pane.
2. **Single-clip player (new).** `FormClipsPlayer` gains a footer row button
   **"Compare with another set…"**. The player itself is presentational and
   does not own clip-list state, so two new props are added:
   `exerciseId: string` and `onRequestCompare: (clipA: SetMediaRow) => void`.
   The owning caller is `app/session/[id].tsx` (lines ~600–612), which already
   holds `playerClip` (the active `SetMediaRow`) and the resolved
   `playerSetInfo.exerciseId`. The caller passes both props in and implements
   `onRequestCompare` as a single batched state update (see "Player → Compare
   handoff sequencing" below) that closes the player and opens `CompareView`
   with `clipA = currentClip`, `clipB = null`, `pickerEnabled = true`,
   `pickerOpen = true`. Tech Lead T2 single-root-`useMediaSurfaceMounted()`
   invariant must hold across the transition (counter never < 1).

##### Player → Compare handoff sequencing (Tech Lead C2)

A naive `onClose() → setCompareOpen(true)` runs through a React commit where
**neither** surface is mounted, dropping the replay-gate counter to 0 and
re-enabling Sentry replay for one frame — the exact failure T2 warns against.
Required pattern in `app/session/[id].tsx`:

- `onRequestCompare(clipA)` performs **one** state update (single `setState`
  call, or `useReducer` action) that simultaneously sets
  `compareInitialA = clipA`, `compareOpen = true`, `playerSetId = null`,
  `playerClip = null`. React batches the resulting commits; `CompareView`'s
  mount commit is sequenced **before** `FormClipsPlayer`'s unmount commit, OR
  both surfaces are mounted for one frame with `CompareView` first, so the
  `useMediaSurfaceMounted()` counter never falls below 1.
- AC12 is extended to assert this invariant for the player→compare handoff
  (open player → tap Compare-with → assert counter ≥ 1 across every commit →
  close compare → assert counter back to 0).

#### Picker strip
- Data source: `getClipsForExercise(exerciseId)` from `lib/media/form-clips.ts`
  (the actual hook in the repo — rev 1's `useFormClipsByExercise` does not
  exist). Filtered at the call site to exclude clips currently in slot A or B.
  No new `lib/db/form-clips.ts` helper required.
- 64×96 thumbnails generated by `expo-video-thumbnails` (already installed at
  `^55.0.14`, no APK delta) and cached via the new
  `lib/media/form-clip-thumbs.ts` helper (see Tech Lead T3 below).
- Label line 1: weight + reps via existing `useUnitFormatter`.
- Label line 2: short relative date (`2w ago`).
- PR badge: `⭐` if the clip's underlying `workout_sets` row was the e1RM PR at
  capture time, sourced from existing `lib/db/pr-dashboard.ts`. Best-effort —
  if the lookup throws or returns null, render without the badge (no toast, no
  Sentry — informational only).
- Concurrency cap: 3 simultaneous `getThumbnailAsync` calls via a small
  `p-limit`-style queue inside `lib/media/form-clip-thumbs.ts` (Tech Lead T7).
  Until a thumbnail resolves, render a placeholder tile with weight/reps text on
  the exercise's themed background color.

#### Synchronized transport row
- **Play Both / Pause Both / Reset Both** call the matching method on both
  player refs in the same JS task. No promise of frame-perfect sync; AC3 below
  gives a 50 ms tolerance at 250 ms post-tap.
- **No independent per-clip scrubbing in v1.** Existing `CompareView`
  (`nativeControls={false}` + custom play overlay only, lines 107–129) has no
  scrubber today, and adding two custom scrubbers competes for vertical space
  with the new picker + transport row. Out of scope for v1; tracked as a
  follow-up. Users still get Play/Pause/Reset Both for synchronized motion.
- Loop is already on per pane (`p.loop = true` in CompareView); rev 2 leaves
  this default.

#### Swap A ↔ B
- A single `<Pressable>` with `accessibilityLabel="Swap clip A and B"` and
  `accessibilityRole="button"`. Internally swaps the two `clip` props; the
  `key={clip.id}` on each `<ClipPane>` remounts, constructing fresh
  `useVideoPlayer` instances at position 0, paused. Swap is therefore
  **destructive of position and play-state** by design — predictable, simple,
  and within budget. Documented in AC5.

#### Layout
- **Portrait** (today's behavior): vertical 1×1 split, A top, B bottom.
- **Landscape** (new): horizontal 1×1 split via
  `useWindowDimensions().width > height`. Divider is vertical, 2 px,
  `colors.outline`. Transport row sits across the bottom safe-area (both
  orientations). Picker strip sits directly above transport row in portrait;
  in landscape it sits at the right edge as a vertical scroll. RTL invariant
  (existing CompareView comment line 8 — preserved): vertical split is
  unmirrored.
- Each video uses `contentFit="contain"` (existing).

#### Empty / disabled states
- `FormLibraryTab` already gates select-mode CTAs at exactly 2 selected — no
  change.
- The new `FormClipsPlayer` "Compare with another set…" button is rendered
  `disabled` with `accessibilityHint="Record at least one more clip for this
  exercise to compare."` when `getClipsForExercise(exerciseId).length < 2`.
  The clip-count check runs in `app/session/[id].tsx` and is passed in via a
  new prop (`siblingClipCount: number`) so `FormClipsPlayer` stays
  presentational.

#### Accessibility (per QD #7 + Tech Lead T8)
- Each `<ClipPane>` keeps the existing `accessibilityLabel` ("Clip A, recorded
  …, clip 1 of 2.") and gains weight/reps in the label when available.
- Transport row: `Play Both` / `Pause Both` / `Reset Both` / `Swap` each have
  explicit `accessibilityLabel`, `accessibilityRole="button"`, and
  `accessibilityState={{ disabled: bothLoaded ? false : true }}` for the three
  transport buttons (disabled until both A and B are loaded). `accessibilityHint`
  on disabled state explains why.
- Picker thumbnail: `accessibilityRole="button"`, `accessibilityLabel` includes
  weight, reps, relative date, and PR badge if present.
- Focus order is deterministic in both orientations: Close → Swap → A pane → B
  pane → Picker → Transport row.

#### Error / edge states
| Scenario | Behavior |
|----------|----------|
| Clip B's file missing on disk (purged via `softDeleteClip` while sheet open) | `<ClipPane>` renders a "Clip unavailable" placeholder; picker hides the orphaned row on next render via `reconcileOrphans` already invoked by `getClipsForExercise`. Sentry breadcrumb logs only `set_id` + a constant tag — never `rel_path` (privacy, AC11). |
| Both clips different orientations (one portrait, one landscape) | Each pane uses `contentFit="contain"` (existing) — letterbox, no rotation. |
| Native decoder fails on second `<VideoView>` (low-memory) | `<ClipPane>` `onError` falls back to single-clip rendering and surfaces a non-modal toast `"Could not play both clips at once on this device. Showing one."`. No crash, no Sentry PII. |
| App backgrounds mid-comparison | Existing pattern — both pause on `AppState !== "active"`. Resume on return is *not* automatic (matches existing single-clip behavior; no surprise audio/motion). |
| Rotation mid-session | `useWindowDimensions` re-renders; player instances persist (no key change), positions preserved. |
| Theme change mid-sheet | Re-render only; no flicker (`useThemeColors` already memoized). |

### Technical Approach

#### File-level diff (rev 2 — anchored to actual files)
| File | Change |
|------|--------|
| `components/session/CompareView.tsx` | **MODIFY** — add transport row, Swap, picker strip, landscape layout, file-missing pane. Single root `useMediaSurfaceMounted()` retained (T2). `<ClipPane key={clip.id}>` for source-switch via remount (T1). |
| `components/session/FormLibraryTab.tsx` | **MODIFY** — keep `handleCompare` (existing); pass new `pickerEnabled={false}` prop so select-mode entry hides the picker by default but exposes a "Change" affordance per pane. |
| `components/session/FormClipsPlayer.tsx` | **MODIFY** — add footer "Compare with another set…" button. Two new props: `exerciseId: string`, `siblingClipCount: number`, `onRequestCompare: (clipA: SetMediaRow) => void`. Button is disabled when `siblingClipCount < 2` with `accessibilityHint`. No clip-list state owned here (presentational). |
| `app/session/[id].tsx` | **MODIFY** — pass `exerciseId={playerSetInfo.exerciseId}`, `siblingClipCount={getClipsForExercise(playerSetInfo.exerciseId).length}` (memoized), and `onRequestCompare` to `FormClipsPlayer`. Implement `onRequestCompare` as a single batched state update that closes player and opens `CompareView` per the "Player → Compare handoff sequencing" rule above. Existing `<FormVideoSheet>` callsite is unchanged (FormVideoSheet is the recorder and is not part of this feature). |
| `lib/media/form-clip-thumbs.ts` | **NEW** — `getOrCreateThumb(setId, srcRelPath)` writes to `${FileSystem.cacheDirectory}form-clip-thumbs/${setId}.jpg`, 25 MB LRU eviction, p-limit concurrency = 3. `purgeThumb(setId)` invoked from `softDeleteClip` and `reconcileOrphans` in `lib/media/form-clips.ts`. |
| `lib/media/form-clips.ts` | **MODIFY** — call `purgeThumb(id)` from `softDeleteClip` and `reconcileOrphans`. No schema change. |
| `__tests__/components/session/CompareView.test.tsx` | **NEW or EXTEND** — transport row drives both players, swap remounts both panes, picker excludes loaded slots, file-missing pane renders, landscape layout via mocked `useWindowDimensions`, Sentry_Mask wraps every video + thumbnail, replay-gate counter increments exactly once per sheet open. |
| `__tests__/source-contracts-batch.test.ts` | **EXTEND** — add the new ban list (T8) following the established pattern at L1068–L1075 (JSX text + brace + plain + template-literal a11y prop syntaxes). |
| `e2e/scenarios/form-clip-compare.spec.ts` | **NEW** — Playwright web project: seed two clips, open from select-mode, play-both, swap, change-B-via-picker, close. Use `.first()` on RN-Web Switch role queries (memory: e2e harness pattern). Use `.click()` not `.tap()` (memory: e2e harness pattern). |

#### Dependencies
- **`expo-video ^55.0.16`** and **`expo-video-thumbnails ^55.0.14`** — both
  already in `package.json`. Repo is on **Expo SDK ~55** (rev 1's "SDK 51"
  reference was wrong — corrected per Tech Lead T-final-9). No new dependency,
  no new permission, no manifest change, no APK-size delta.
- F-Droid build path verified via `fdroid-foss-build` skill (memory: cablesnap
  fdroid): `expo-video` and `expo-video-thumbnails` Android modules contain no
  `com.google.android.gms`, `com.google.firebase`, or `com.google.mlkit`
  references — confirmed by Tech Lead repo audit.

#### Source-switch mechanism (decision per T1)
- **Decision:** key-remount, not `player.replaceAsync`. Each `<ClipPane>` is
  rendered with `key={clip.id}`. Changing the clip in slot A or B (via swap or
  picker) unmounts the old pane and mounts a new one with a fresh
  `useVideoPlayer`. New player starts at position 0, paused. Loop=true is set in
  the existing `useVideoPlayer` factory callback.
- **Why:** matches the existing `<ClipPane>` shape (no refactor of the player
  hook into a ref-managed source-switch). Eliminates ambiguous "what happens to
  position/play-state on swap" — answer: both reset, documented in AC5. Avoids
  having to decide `replace` vs `replaceAsync` and the dev-build/Hermes
  semantics differences.
- **Trade-off:** pane unmount/remount briefly tears down the native decoder.
  AC4 measures heap PSS across multiple swap cycles to confirm no leak.

#### Replay-gate placement (decision per T2)
- `useMediaSurfaceMounted()` stays at the **root of `CompareBody`** — exactly
  one increment per sheet open, exactly one decrement per sheet close, regardless
  of swaps or picker changes. The hook is **never** moved into per-pane
  components. Enforced by a unit test in
  `__tests__/components/session/CompareView.test.tsx` that mocks
  `useMediaSurfaceMounted` and asserts call count = 1 across N swaps.

#### Thumbnail cache (T3 — full design)
- **Path:** `${FileSystem.cacheDirectory}form-clip-thumbs/${setId}.jpg`
  (cache directory, not document directory; auto-evictable by OS).
- **Generation:** `expo-video-thumbnails.getThumbnailAsync(absSrcUri, { time:
  500, quality: 0.6 })`. JPG, ~64×96, ~5–15 KB each.
- **Cache key invalidation:** the file name uses `set_media.id` (UUID) which
  changes whenever a clip is replaced (replace flow softs-deletes the old row
  and inserts a new row), so a stale thumb is impossible by construction.
- **Concurrency cap:** 3 simultaneous `getThumbnailAsync` calls via a
  `p-limit`-style queue inside `lib/media/form-clip-thumbs.ts`.
- **Cache size:** soft cap 25 MB (≈ 1700 thumbs). On generation, if directory
  size > 25 MB, evict oldest by mtime until under cap. Eviction runs at most
  once per minute (debounced).
- **Cleanup hooks:** `softDeleteClip(id)` and `reconcileOrphans()` in
  `lib/media/form-clips.ts` both call `purgeThumb(id)`.
- **Backup exclusion:** Android Auto Backup excludes `cache/` by default
  (verified via `plugins/with-form-clips-backup.js` semantics — only
  `form-clips/` and `set-media/` are explicitly excluded; cache lives outside
  those by virtue of being in the OS cache root). iOS `tmp/`-equivalent for
  `cacheDirectory` is also excluded from iCloud backup by default. Documented
  inline in `lib/media/form-clip-thumbs.ts` with a header comment.
- **Privacy:** thumbnail file path never reaches Sentry breadcrumbs. Only
  `setId` (UUID, opaque) is logged on error.

#### Data model
None. Feature is read-only over `set_media` and `workout_sets`.

#### Performance methodology (T4 — replaces rev 1's broken approach)
- **No `MAX_COMPARE_BYTES` cap.** Existing `CompareView` has no cap; adding one
  asymmetrically would gate the new entry but not the legacy one (Tech Lead
  T4). Instead, AC4 below uses the standard Android measurement.
- **Measurement (AC4):** `adb shell dumpsys meminfo com.persoack.cablesnap |
  grep "TOTAL PSS"` sampled before sheet open and after 60 s of dual-loop
  playback on a Pixel 6a release build. Recorded in the AC4 dogfood log.
  Threshold: **PSS delta ≤ 180 MB** for two 10–20 s 1080p clips. If two clips
  exceed this in dogfooding, we ship a "single-pane fallback on
  low-memory device" toast in a follow-up issue, not in v1.
- **Thumbnail generation throttling:** concurrency cap = 3 (T7), runs inside
  `InteractionManager.runAfterInteractions` so picker scroll stays 60 fps.

## Scope

**In v1:**
- Side-by-side / stacked dual playback of two clips for the same exercise.
- Synchronized Play / Pause / Reset transport.
- Swap A ↔ B.
- Picker strip with PR badges.
- Entry from Form Library and from single-clip player.
- Accessibility labels for all controls.

**Out of scope (deferred):**
- Cross-exercise comparison (e.g. cable row vs barbell row).
- Auto-alignment of contraction phase (would need on-device pose detection — too
  heavy for v1, and would push us into ML model evaluation territory).
- Independent per-clip scrubbers and frame-by-frame stepping. Existing
  `CompareView.tsx:107-129` is `nativeControls={false}` plus a play-only overlay,
  so there is no scrubber today; v1 keeps per-pane play/pause plus shared
  Play/Pause/Reset and defers scrubbing/frame-stepping to a follow-up.
- Annotation / drawing overlay (separate feature).
- Picture-in-picture overlay (one video on top of the other with opacity) —
  considered, deferred for performance reasons. Side-by-side first.
- Sharing / exporting the side-by-side as a single composed clip (would require
  off-screen rendering pipeline; defer).
- "Compare to a coach's reference clip" (would require import-from-URL or
  bundled reference library — separate feature).
- **Schema changes** to `set_media` or `workout_sets` (Tech Lead T10). The
  feature is read-only over existing rows.
- Background pre-warming of video decoders before sheet open (Tech Lead T10).
- Cross-device sync of thumbnail cache (Tech Lead T10) — thumbs stay on device
  by design.

## Dependencies

- BLD-1092 (form-check video capture) — **shipped**.
- BLD-1094 (PRAGMA foreign_keys=ON for set_media cascade) — **shipped**.
- BLD-1095 (backup exclusion for clips) — **shipped**.
- `expo-video ^55.0.16` and `expo-video-thumbnails ^55.0.14` — **already in
  package.json**.

## Acceptance Criteria (rev 2)

- [ ] **AC1 (entry from select-mode):** Given an exercise with ≥ 2 form clips and
  the user has selected exactly two via select-mode, when the user taps **Compare**
  in `SelectActionsBar`, then `CompareView` opens with both slots filled, picker
  hidden by default, and "Change" affordance available per pane.
- [ ] **AC2 (entry from single-clip player):** Given the single-clip player
  (`FormClipsPlayer`, mounted from `app/session/[id].tsx`) is open with a clip
  whose exercise has ≥ 2 clips, when the user taps **Compare with another
  set…**, then the caller invokes `onRequestCompare(currentClip)` which
  performs **one batched state update** that simultaneously closes the player
  and opens `CompareView` with `clipA = currentClip`, `clipB = null`, and the
  picker strip auto-opened. Across every React commit during the transition,
  the `useMediaSurfaceMounted()` counter is **≥ 1** (verified by mocking the
  hook in test — never observes 0 between player unmount and CompareView
  mount). After the transition exactly one `useMediaSurfaceMounted()` region
  (CompareView's root) is mounted.
- [ ] **AC3 (synchronized transport):** Given both slots are loaded, when the
  user taps **Play Both**, then 250 ms later
  `Math.abs(playerA.currentTime - playerB.currentTime) <= 0.05` (50 ms drift
  tolerance). Same assertion for **Pause Both** (both `playing === false`) and
  **Reset Both** (both `currentTime === 0` and `playing === false`).
- [ ] **AC4 (native heap stays bounded):** On a Pixel 6a release build, with two
  10–20 s 1080p clips loaded and dual-loop playback for 60 s,
  `adb shell dumpsys meminfo com.persoack.cablesnap | awk '/TOTAL PSS/ {print $3}'`
  delta ≤ 180 MB versus baseline (sheet closed). Method and raw measurements
  recorded in the implementation PR description. No `MAX_COMPARE_BYTES` constant
  added — measurement-driven, not gate-driven.
- [ ] **AC5 (swap):** Given clips X in A and Y in B, when the user taps **Swap**,
  then A holds Y and B holds X, both panes are remounted via `key={clip.id}`,
  both new players are at `currentTime === 0` and `playing === false`. This
  reset behavior is documented in the Swap button's `accessibilityHint`.
- [ ] **AC6 (file missing):** Given clip B's `rel_path` no longer exists on disk
  when `<ClipPane>` mounts, then the pane renders the *"Clip unavailable"*
  placeholder with `accessibilityLabel="Clip B unavailable. The recording was
  removed."`, the picker hides the orphaned row on next refresh (via
  `reconcileOrphans`), and slot A remains playable. Sentry breadcrumb logs
  `{ tag: "form-clip-compare.missing", setId }` only — never `rel_path`.
- [ ] **AC7 (single clip = compare disabled in single-player entry):** Given an
  exercise has exactly one clip and the user is viewing it in `FormClipsPlayer`,
  then **Compare with another set…** renders with `accessibilityState={{
  disabled: true }}` and `accessibilityHint="Record at least one more clip for
  this exercise to compare."`. (Select-mode entry is naturally gated by the
  existing 2-of-N selection requirement — no new code needed there.)
- [ ] **AC8 (no behaviour-shaping copy):** Repo-wide grep over the new and
  modified files (`CompareView.tsx`, `FormClipsPlayer.tsx`,
  `lib/media/form-clip-thumbs.ts`, the new test files) for the prohibited tokens
  `streak`, `xp`, `badge`, `unlock`, `level up`, `keep it up`, `you've been`,
  `friends`, `share to`, `leaderboard`, `notify`, `notification`, `reward`,
  `reminder`, `you should` returns zero hits, **and** new files contain no
  `expo-notifications` import. (`consistency` is removed from the ban list per
  QD #6 — legitimate form-analysis vocabulary.) The scanner extends
  `__tests__/source-contracts-batch.test.ts` and follows the established
  three-syntax pattern at L1068–L1075 (JSX text, brace `prop={"…"}`, plain
  `prop="…"`, template `prop={`…`}`).
- [ ] **AC9 (FOSS / F-Droid build clean):** Build the Gradle releaseFdroid
  variant and confirm zero GMS/Firebase/MLKit class references in the DEX:
  ```
  cd android && ./gradlew :app:assembleReleaseFdroid
  APK=android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk
  unzip -p "$APK" 'classes*.dex' | strings \
    | grep -E 'com\.google\.android\.gms|com\.google\.firebase|com\.google\.mlkit' \
    | grep -v 'com\.google\.android\.gms\.wearable' || true
  ```
  Expected: zero matches (the wearable bridge stub is excluded at config level
  per `plugins/with-wearos-module.js`). `aapt2 dump badging` is **not** an
  acceptable substitute — manifest only.
- [ ] **AC10 (a11y — stateful controls):** Every new control declares
  `accessibilityRole`, `accessibilityLabel`, and (for transport buttons)
  `accessibilityState={{ disabled }}` reflecting whether both slots are loaded.
  Disabled states declare `accessibilityHint` explaining how to enable. Focus
  order is deterministic: Close → Swap → A pane → B pane → Picker → Transport.
  Verified by `jest-axe` on the rendered sheet plus a manual VoiceOver pass
  recorded in the implementation PR description.
- [ ] **AC11 (Sentry mask + privacy):** Every `<VideoView>` and every
  `<Image>`/picker-thumbnail is wrapped in `Sentry_Mask` (the same
  optional-require pattern used by existing `CompareView` at L137). The
  file-missing breadcrumb shape (AC6) is enforced by a source-contract test:
  no `rel_path`, no `cacheDirectory`, no `documentDirectory`, no absolute
  filesystem path appears in any Sentry call inside the new files.
- [ ] **AC12 (replay-gate counter is single):** With `useMediaSurfaceMounted`
  mocked, opening `CompareView`, swapping panes 5 times, changing B via picker
  3 times, and closing the sheet results in **exactly one** increment and
  **exactly one** decrement of the counter. **Plus** the player→compare
  handoff: open `FormClipsPlayer`, tap **Compare with another set…**, and
  observe the mocked counter value at every React commit during the
  transition — it must remain **≥ 1** at all times (never 0 between player
  unmount and CompareView mount). After CompareView closes, the counter is
  back to 0. Asserted in
  `__tests__/components/session/CompareView.test.tsx` and a new
  `__tests__/app/session/player-to-compare-handoff.test.tsx`.
- [ ] **AC13 (thumbnail cache):** `lib/media/form-clip-thumbs.ts` writes only
  under `${FileSystem.cacheDirectory}form-clip-thumbs/`, evicts oldest by mtime
  when directory size > 25 MB, caps `getThumbnailAsync` concurrency at 3, and
  is invoked from `softDeleteClip` and `reconcileOrphans` to purge by `setId`.
  Unit test seeds 30 MB of fake thumbs and asserts post-eviction size ≤ 25 MB
  and oldest files removed.
- [ ] PR passes all existing tests with no regressions.
- [ ] No new lint warnings.

## Edge Cases (rev 2)

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise has 0 clips | Select-mode CTA never enables; "Compare with another set…" hidden in single-clip player (no clip is open). |
| Exercise has 1 clip | Select-mode CTA never enables (needs 2 selected); single-player "Compare with another set…" rendered disabled with `accessibilityHint`. |
| Many clips (50+) | Picker uses `FlatList` with `windowSize=5`, thumbnail concurrency cap = 3, placeholder tile until thumb resolves. |
| Mixed orientations (one portrait, one landscape) | Each pane uses `contentFit="contain"` (existing) — letterbox; no rotation. |
| Same `set_id` somehow loaded into both slots (defensive) | Picker filter at call site already excludes loaded slots; if it slips through, B pane shows toast `"Pick a different clip"` and returns to picker. |
| Device rotates mid-playback | `useWindowDimensions` re-renders; player instances persist (no key change), positions preserved. |
| App backgrounds | Both pause on `AppState !== "active"`. No automatic resume on foreground (matches existing single-clip player). |
| Native decoder OOM on second `<VideoView>` | `<ClipPane>` `onError` falls back to single-clip rendering and shows non-modal toast. No crash, no PII in Sentry. |
| `softDeleteClip` runs while sheet open and matches loaded clip | Pane shows "Clip unavailable" placeholder per AC6; thumbnail cache purged via `purgeThumb(setId)`. |
| Theme change mid-sheet | Re-render only via `useThemeColors` (already memoized); no flicker. |
| Swap during playback | Both panes remount per AC5; both end at position 0 paused. Documented in `accessibilityHint`. |

## Risk Assessment (rev 2)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Native OOM on dual decoder on entry-level Android | Medium | High | AC4 dogfood measurement on Pixel 6a (release build, dumpsys meminfo). If exceeded, ship single-pane fallback toast in a follow-up — not in v1. No `MAX_COMPARE_BYTES` cap (asymmetric with legacy entry, Tech Lead T4). |
| Replay-gate counter drift causing Sentry replay re-enable mid-comparison | Low | High | Single-root `useMediaSurfaceMounted()` enforced by AC12 unit test. |
| Privacy regression via Sentry breadcrumb / replay | Low | High | AC6 + AC11 source-contract tests; Sentry_Mask wraps every video and thumbnail. |
| Thumbnail cache unbounded growth | Medium | Medium | 25 MB LRU eviction + cleanup hooks in `softDeleteClip` and `reconcileOrphans`; AC13 unit test. |
| `getThumbnailAsync` starves JS / decoder threads with 50+ clips | Medium | Medium | Concurrency cap = 3; `runAfterInteractions`; placeholder tile until resolved (Tech Lead T7). |
| Source-contract scanner misses non-brace JSX text or false-positives `consistency` | Medium | Medium | Follow established three-syntax pattern at `__tests__/source-contracts-batch.test.ts:1068-1075` (memory: testing practices). Drop `consistency` (QD #6). |
| Layout regressions in landscape on tablets / Z Fold inner display | Low | Medium | E2E spec resizes viewport; manual dogfood on Z Fold6 inner before merge. |
| F-Droid AC9 false-positive from wearable stub | Low | Low | Grep filter excludes `com.google.android.gms.wearable` (memory: cablesnap fdroid). |
| Two reviewers re-reject because rev 2 still misses something | Low | Medium | Dedicated rev-2 changes table (next section) maps every Q1–Q7 / T1–T10 blocker to a section + AC. |

## Rev-2 Changes — Resolution of Rev-1 Blockers

| Blocker | Resolution in rev 2 |
|---------|---------------------|
| **QD-1 / TL final 1** Net-new feature vs existing surfaces | File-level diff now anchored on `CompareView.tsx` + `FormLibraryTab.tsx` + `FormClipsPlayer.tsx` + `app/session/[id].tsx` (rev-3 corrected the secondary-entry file from `FormVideoSheet` — the recorder — to `FormClipsPlayer` — the actual viewer). No `app/exercise/[id].tsx` change. No `useFormClipsByExercise` hook (used `getClipsForExercise` from `lib/media/form-clips.ts`). |
| **QD-2 / TL T6** One mental model | Single model: select-mode primary entry (existing) + single-clip player secondary entry (new). No per-row ⇆ icon. |
| **QD-3 / TL T3** Thumbnail cache data safety | Full design in Technical Approach §"Thumbnail cache (T3)". AC13 enforces. |
| **QD-4 / TL T5** AC9 wrong tool | AC9 rewritten to Gradle `:app:assembleReleaseFdroid` + DEX `strings` grep with wearable filter. |
| **QD-5 / TL T4** AC4 wrong measurement | AC4 rewritten to `adb shell dumpsys meminfo` PSS delta ≤ 180 MB on Pixel 6a release. No `MAX_COMPARE_BYTES`. |
| **QD-6 / TL T8** AC8 false-positive on `consistency` + scanner pattern | Token list rewritten; `consistency` dropped; scanner extends established three-syntax pattern. |
| **QD-7** Stateful a11y for transport | AC10 covers; transport buttons declare `accessibilityState={{ disabled }}` + `accessibilityHint`. |
| **TL T1** Source-switch unspecified | Decision documented: key-remount via `key={clip.id}`, not `replaceAsync`. AC5 documents reset semantics. |
| **TL T2** Replay-gate single increment | Documented; AC12 unit test enforces. |
| **TL T7** Thumbnail concurrency | Cap = 3 with `p-limit`-style queue + placeholder tile. AC13 covers. |
| **TL T9** Sentry_Mask on every surface | AC11 covers — every video and thumbnail. |
| **TL T10** Out-of-scope additions | Added to Out-of-scope list below: schema changes, decoder pre-warm, cross-device thumb sync. |
| **TL final-9** Wrong SDK reference | Updated SDK 51 → SDK ~55 throughout. |

## Rev-3 Changes — Resolution of Rev-2 Blockers

| Blocker | Resolution in rev 3 |
|---------|---------------------|
| **QD-rev2-1 / TL C1** Wrong file: `FormVideoSheet` (recorder) vs `FormClipsPlayer` (viewer) | Every secondary-entry reference retargeted to `FormClipsPlayer.tsx`. File-level diff, Overview item 5, UX entry #2, AC2, AC7, AC8 file list, AC12 test paths all updated. `FormVideoSheet.tsx` removed from the diff entirely; the line in §Overview now explicitly disambiguates the two files. |
| **QD-rev2-2** Missing callsite wiring | `app/session/[id].tsx` added to file-level diff. New `FormClipsPlayer` props enumerated: `exerciseId: string`, `siblingClipCount: number`, `onRequestCompare: (clipA: SetMediaRow) => void`. Caller passes `playerSetInfo.exerciseId` and the memoized `getClipsForExercise(...).length` (existing context at L600–612). |
| **QD-rev2-3** "Per-pane scrubbers remain" was false | Scrubber language removed from §UX Synchronized transport row; explicit "No independent per-clip scrubbing in v1" note added with rationale (`nativeControls={false}` + custom play overlay only at `CompareView.tsx:107-129` today). Frame-by-frame stepping was already in Out-of-scope; scrubbers join it. |
| **QD-rev2-4** Stale "no way to view two clips together" copy | Problem Statement rewritten to acknowledge that today's `CompareView` opens two clips but lacks transport / Swap / picker / landscape / cache, and that `FormClipsPlayer` has no path into comparison. |
| **TL C2** Player→Compare handoff replay-gate transient | New §"Player → Compare handoff sequencing" added under UX entry #2 specifying single batched state update (`onRequestCompare` performs one `setState`/`useReducer` action that simultaneously closes the player and opens `CompareView`, with mount-before-unmount ordering). AC12 extended to assert counter ≥ 1 at every commit during the transition, with a new test file `__tests__/app/session/player-to-compare-handoff.test.tsx`. |

## Review Feedback

### Quality Director (UX) — Rev 1: REJECTED (2026-05-10)
**Verdict: REJECTED / REQUEST CHANGES (rev 1).** Full QD blockers Q1–Q7 below.
**Rev 2 awaiting re-review** — see "Rev-2 Changes" table above for per-blocker
resolutions. Re-review request posted on BLD-1150.

Evidence checked (rev 1):
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

### Tech Lead (Feasibility) — Rev 1: REJECTED (2026-05-10) [duplicate header from rev-1 commit; see merged review below]
_See "Tech Lead (Feasibility) — Rev 1: REJECTED" section below for the canonical rev-1 verdict._

### Psychologist (Behavior-Design)
_N/A — Classification = NO. Reviewer should still confirm the NO classification
holds (no streaks, notifications, rewards, social, motivational copy)._

### CEO Decision
**Rev 1: NOT APPROVED** — both reviewers REJECTED. CEO acknowledges the rev-1
plan ignored existing surfaces (CompareView + FormLibraryTab), used a non-existent
hook, cited the wrong Expo SDK, and proposed unreliable AC measurement methods.
**Rev 2 published 2026-05-10**, anchored to the actual repo, addressing every
Q1–Q7 / T1–T10 blocker. CEO decision deferred until rev-2 reviews land.

### Tech Lead (Feasibility) — Rev 1: REJECTED (2026-05-10) [canonical]
**Verdict: REJECTED (rev 1).** Concur with QD on items 1–7 (existing surfaces, hook name,
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

