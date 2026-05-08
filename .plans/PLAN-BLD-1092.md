# Feature Plan: Local-only Form Check Videos

**Issue**: BLD-1092  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT v2 → IN_REVIEW  (v2 addresses all QD + TL blockers from rev 1)

## Research Source
- **Origin:** Reddit synthesis 2026-05-08 (web_search query "workout tracker app frustrations 2026 reddit missing features Strong Hevy FitNotes ... form videos") + competitor reviews (replog.co.uk best-workout-log-apps-2026, gainz-pro.com best-workout-tracker-2026, fitecho.ai best-free-workout-tracker-apps-2026).
- **Pain point observed:** "Users increasingly want to attach form check videos or photos to individual exercises/sets for self-review or remote coaching, but most apps only support basic text notes, if anything. No built-in, streamlined support for snapping and storing a quick video clip per set/exercise is a sore spot." Where it does exist (e.g. JEFIT/Hevy paid tiers), uploads are capped, gated behind subscriptions, and privacy controls are basic or missing.
- **Frequency:** Recurring multi-thread theme across r/fitness, r/homegym, r/weightlifting (2024–2026); also called out in three independent 2026 comparison reviews.

## Problem Statement
Solo lifters — especially home-gym and cable-rig users without a coach — repeatedly want to:
1. Record a quick video of a working set
2. Re-watch it next session, side-by-side with last time's clip, to fix form
3. Diff their bar path / depth / lockout over weeks

Cloud apps either don't offer this, gate it behind a subscription, or — most often — make users worry about where the clip ends up. CableSnap is offline-first, open-source, no-account; **we can offer something cloud apps structurally cannot**: form-check videos that are guaranteed to never leave the device. This is a privacy-advantage feature (Lens §4.5b "Privacy Advantage").

## Behavior-Design Classification (MANDATORY)

Trigger list (§3.2): gamification · streaks · notifications/reminders · onboarding · rewards · motivational progress visualizations · social/leaderboard · habit loops · goal-setting/commitments · motivational copy · identity framing · re-engagement of lapsed users.

- [x] **NO** — purely informational/functional. The feature is a self-coaching aid: capture, view, delete. There are no streaks, no rewards, no notifications, no leaderboards, no progress badges, no re-engagement prompts. Comparison-of-clips view is informational (own data side-by-side), not a motivational visualization. Psychologist review **N/A**.

If a reviewer believes any UX detail crosses into behavior-shaping (e.g. "PR clip" auto-tagging that reads like reward), call it out and we redesign before implementation.

## User Stories
- **Solo home-gym lifter:** "As a lifter without a coach, I want to record a 10-second clip of my heaviest set so I can re-watch the bar path after my workout, without worrying the video will sync to a cloud."
- **Long-term form tracker:** "As a lifter who's been training 2+ years, I want to compare today's squat clip with one from 3 months ago, so I can see whether my depth has improved."
- **Privacy-conscious user:** "As an open-source-app user, I want a guarantee in the UI that my videos stay on this device — no upload, no telemetry, no opt-out needed."
- **Storage-aware user:** "As someone with limited phone storage, I want to see how much space my clips are using and prune old ones easily."

## Proposed Solution

### Overview
Each completed working set may have **at most one short video clip** attached (≤ 15 s, captured at 720p H.264, video-only, no audio track). Clips are stored in `${FileSystem.documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4` — inside the app's sandbox so they're auto-removed on uninstall, **and explicitly excluded from iOS backup and Android Auto Backup**. A new `set_media` table tracks the relationship, with a `unique` constraint on `set_id` (one-clip-per-set invariant) and a `pending_delete` tombstone column. A "Form Library" tab on the existing exercise detail drawer lets the user browse all clips for that exercise across time, with an explicit "Select" / "Compare" mode.

**Hard rules — non-negotiable, enforced in code, copy, AND tests:**
1. Clips never enter any network call. The clip path and bytes are excluded from CSV export, sync (none today, but defensive), Sentry crash attachments, **and Sentry Mobile Replay** (replay must mask all media surfaces — see Privacy section below). Enforced via ESLint module boundaries + network-mock integration tests covering `fetch`, `XMLHttpRequest`, and WebSocket.
2. The capture sheet shows a one-line privacy banner: "Saved on this device only — never uploaded." (Matches verified runtime behavior, not aspiration.)
3. Uninstalling the app removes all clips (sandbox guarantee on iOS + Android — verify in QA on physical device).
4. **iOS backup exclusion** via `expo-file-system`'s backup-behavior API set immediately after the file write and **before** the DB row INSERT. **Android Auto Backup exclusion** via `data_extraction_rules.xml` (and `full_backup_content.xml` for legacy SDK) generated through an `app.config.ts` plugin or static asset.
5. **No microphone permission requested** — capture is video-only. `CameraView.recordAsync({ mute: true })` plus `AndroidManifest.xml` lacking `RECORD_AUDIO`. Saved files contain zero audio tracks (verified by metadata read on save).
6. Sharing ("Send to coach") is **out of scope v1**. v1 ships **without** any export affordance to preserve the privacy-first promise as the default. A guarded share flow can be designed separately later.

### UX Design

**Capture entry point** (during a workout, on a completed working set):

> Note (v2): Existing `components/session/SetRow.tsx` does **not** have a kebab — it uses swipe + long-press for delete and accessibility actions (verified). v1 introduces a small inline glyph at the row's right edge for **completed sets only**, ~32 dp hit-target with `hitSlop`, using a `MaterialCommunityIcons` `video-outline` icon (matches existing icon system: `note-text-outline`, `swap-horizontal`, etc.). When a clip already exists, the icon switches to `video-check` (filled). Exact pixel spec and a11y label is delegated to a UX-designer subticket created at implementation time.

1. Tap glyph on a completed SetRow → `FormVideoSheet` (full-screen modal) opens `expo-camera` in video mode, defaulting to back camera, 720p, max 15 s, with a visible countdown. `mute: true` on the recorder.
2. After capture, single-screen review: play / re-record / save / cancel. No filters, no editing.
3. Save: write to sandbox, **flag the file as backup-excluded**, then INSERT into `set_media`. Order is critical so a crash mid-save can't leak a backed-up orphan.
4. Once saved, the SetRow's glyph state changes to "clip exists".

**Review flow** (during or after a session):
1. Tap the clip-exists glyph on a SetRow → bottom-sheet player with the clip + meta (date, weight, reps, RPE).
2. From the existing `ExerciseDetailDrawer.tsx`, a new "Form clips" tab shows a count badge and lists all clips for that exercise reverse-chronologically as thumbnails. The tab is visible even when empty (with a low-key empty state) so review is discoverable independent of the SetRow entry-point.
3. The Form Library has an explicit **"Select" / "Compare" mode** affordance (a button in the tab header). In Select mode, thumbnails show a checkbox; selecting two enables a "Compare" CTA; selecting one shows "Delete". Long-press remains as a power-user shortcut to enter Select mode, but is **not** the only way in.
4. Compare view: 1×1 vertical split, each clip plays independently with its own play/pause. VoiceOver/TalkBack focus order: clip 1 controls → clip 2 controls. RTL invariant (vertical split, no inversion).

**Settings → Storage**:
- New row "Form clips: 142 MB across 38 clips" with "Manage" button → list view sortable by exercise / date / size, multi-select delete.

**Empty / error states:**
- No clips yet on Form Library tab: friendly empty state, no nag copy.
- Permission denied (camera): functional copy, no guilt language. "Camera access is needed to record a form clip. CableSnap stores clips on this device." Deep-link to OS settings.
- Out of storage on save: surface the OS error verbatim with a "free space and retry" CTA. Do not auto-delete user data.
- DB-row-present / file-missing: render placeholder thumbnail with "Clip file missing — remove?" action. Do not crash.

**Accessibility:**
- All controls have `accessibilityLabel` and `accessibilityRole`.
- The play button announces clip duration and recording date.
- Compare view focus order documented above.
- High-contrast: thumbnail border respects theme.

### Technical Approach

**Prerequisite commit (separate from feature commit, must merge first):**

> **`PRAGMA foreign_keys = ON` in `lib/db/helpers.ts`.**
> Verified: today the main DB connection (lib/db/helpers.ts:42-55) sets `journal_mode = WAL` but never `foreign_keys = ON`. The pragma is only enabled in `lib/db/import-export.ts:530` (CSV import path). Therefore Drizzle's `references(..., { onDelete: "cascade" })` is currently a runtime no-op on app deletes. Without this commit, the cascade chain `workout_sessions → workout_sets → set_media` cannot be solved at the DB layer.
>
> Plan: a standalone PR (call it BLD-1092a) that adds `database.execAsync("PRAGMA foreign_keys = ON")` immediately after the journal-mode pragma, plus a runtime test asserting the value, plus QA regression of every existing delete path (delete-set, delete-session, delete-exercise, delete-template, etc.) because it changes the runtime behavior of every nullable FK in the schema. Land this **before** the feature PR. If QA finds latent dangling-row bugs they're scoped to BLD-1092a, not 1092.

**New schema** (Drizzle migration, in feature PR):
```ts
export const setMedia = sqliteTable("set_media", {
  id: text("id").primaryKey(),                                  // ULID
  set_id: text("set_id").notNull()
    .references(() => workoutSets.id, { onDelete: "cascade" }),
  exercise_id: text("exercise_id").notNull(),                   // denormalized for fast Form Library queries
  kind: text("kind").notNull(),                                 // "video" only in v1; no default — every INSERT must specify
  rel_path: text("rel_path").notNull(),                         // relative to documentDirectory
  duration_ms: integer("duration_ms"),
  size_bytes: integer("size_bytes"),
  width: integer("width"),
  height: integer("height"),
  pending_delete: integer("pending_delete").notNull().default(0), // tombstone for two-phase delete
  created_at: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("uq_set_media_set_id").on(t.set_id),              // one-clip-per-set invariant
  index("idx_set_media_exercise_created").on(t.exercise_id, t.created_at),
  index("idx_set_media_pending_delete").on(t.pending_delete),
]);
```
- `rel_path` (not absolute) so iOS sandbox UUID changes after restore-from-backup don't orphan rows.
- Stable directory layout, documented in `lib/media/README.md` as part of the migration contract:
  - clips: `${documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4`
  - thumbnails: `${documentDirectory}form-clips/<exercise_id>/.thumbs/<clip_id>.jpg`

**New module** `lib/media/form-clips.ts`:
- `recordClip(setId, exerciseId)` → opens camera (video-only, mute), writes file, flags backup-excluded, INSERTs `set_media` row, returns `SetMediaRow`.
- `getClipsForExercise(exerciseId)` → reverse-chron list, filtered `WHERE pending_delete = 0`. **Returns `[]` on `Platform.OS === 'web'`.**
- `softDeleteClip(id)` → sets `pending_delete = 1`, hides from UI immediately. Reconciler unlinks the file later.
- `deleteClip(id)` (used by reconciler / explicit "delete now"): **DB row delete first, then `unlinkAsync`**. If the row delete commits and the file unlink fails, the orphan file is a tombstone the next reconciler pass cleans. If the file delete were first and the row delete failed, you get a 404 row that crashes the player.
- `reconcileOrphans()` runs on app boot **and** on first Form Library open after launch:
  - For every row with `pending_delete = 1`: unlink file, delete row.
  - For every file under `form-clips/` not referenced by any row: unlink it (orphan file from a crashed save).
  - For every row with no file: leave row in place but flag `rel_path` as missing for the UI placeholder.
- `getStorageStats()` → total bytes + clip count from FS, cross-checked with DB.
- All functions strictly synchronous-with-DB, async only for FS / camera. `getClipsForExercise` is web-no-op.

**New dependency**: `expo-video` (≥ 2.x for SDK 55) for playback. Stable since SDK 52, official replacement for deprecated `expo-av` Video. **No spike needed**; if a playback bug surfaces post-merge, fall back to `react-native-video` is a 1-day swap. Capture uses existing `expo-camera ~55.0.15` (verified in `package.json`). **No `expo-image-manipulator`-for-video-like dependency** — no post-capture transcoding in v1.

**Compression strategy: Pick A — ship 720p raw.** Cap capture at 720p H.264 via `CameraView.recordAsync({ maxDuration: 15, codec: 'H264', mute: true })` and the existing `quality` prop. Accept the resulting size (typically 4–10 MB / 15 s). `set_media.size_bytes` is informational only — no transcoding. The earlier v1 plan's "if larger, re-encode at 720p / 30 fps using expo's ImageManipulator-equivalent for video" was incorrect — `expo-image-manipulator` does not handle video, and the only realistic Expo video transcoders (`react-native-ffmpeg-kit`, `react-native-video-processing`) are large native deps with GPL/LGPL licensing concerns and an F-Droid headache. Defer compression entirely to v2 (or never — clip storage panel + bulk delete in v1 is sufficient).

**Privacy enforcement (must be tested):**

1. **Sentry Mobile Replay masking (the highest-stakes item).** Verified: `app/_layout.tsx:50` initializes `Sentry.mobileReplayIntegration()` with `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1`, and `sendDefaultPii: true`. By default, replay masks text but does **not** mask `<Image>` / `<Video>` / `expo-camera` previews unless explicitly configured. Plan:
   - Globally set `Sentry.mobileReplayIntegration({ maskAllImages: true, maskAllVectors: true })` in `app/_layout.tsx` (one-time, ~5 LOC, lands with the feature PR).
   - Wrap every clip surface — `FormVideoSheet`'s camera preview, the bottom-sheet player, Form Library thumbnails, the compare view's two video panes — in `<Sentry.Mask>` (verify SDK 8.x API; if the named component is `Sentry.MaskView` or via `sentry-mask` testID, use whichever the installed SDK exposes).
   - Component test per surface that mounts it and asserts no unmasked native `Image` / `Video` node escapes the mask boundary.
   - Build-time grep gate (added to `scripts/check-privacy-boundaries.sh`, called from CI / pre-push hook): if `lib/media/*` exists in the tree, then `app/_layout.tsx` must contain `maskAllImages: true`. Fails the build otherwise.
2. **Module boundary enforcement.** ESLint `no-restricted-imports` (or `eslint-plugin-boundaries` if already present) forbids `lib/media/*` from being imported by:
   - `lib/sync/**` (none today; defensive),
   - `lib/db/csv-export.ts`, `lib/db/import-export.ts`,
   - anything under `app/api/**` or `workers/**` (Vercel functions),
   - any Sentry shim / wrapper.
3. **Network-mock integration tests** covering full capture → view → delete → reconcile flow:
   - Mock `global.fetch`, `global.XMLHttpRequest`, and any WebSocket / `EventSource`.
   - Assert zero requests with any URL or body containing `form-clips/`, `.mp4`, or any clip's `rel_path`.
4. **CSV export snapshot test**: assert no `set_media` columns and no `rel_path` substrings in the exported file when clips exist.
5. **Backup attribute test**: after `recordClip` resolves, read the FS attribute (iOS `NSURLIsExcludedFromBackupKey`, or whatever `expo-file-system` exposes for read-back) and assert `true`. Manifest test for `data_extraction_rules.xml` containing the `<exclude>` rule for `form-clips/`.
6. **No-microphone-permission test**: read `app.config.ts` permissions list and `AndroidManifest.xml` after prebuild; assert `RECORD_AUDIO` is absent. Saved-clip metadata read asserts `audio_track == null`.

**Performance:**
- Form Library tab paginates 20 thumbnails at a time (FlashList).
- Thumbnails are generated **lazily on first view**, off the UI thread via `expo-video`'s thumbnail API (or equivalent), and cached to `.thumbs/`. Thumbnails are queued sequentially — never parallel-N — to avoid ANRs on low-end Android.
- Use **middle-frame** as default thumbnail; fall back to first frame if generation fails. No user-chosen thumbnails in v1.
- Player uses on-demand load — no pre-warming.
- (No post-capture transcoding in v1, so the "encoding on UI thread" concern is moot.)

**Storage budget:**
- 38 working sets/week × 1 clip each × ~7 MB avg ≈ 1.4 GB/year worst case for a power user. Surfaced in Settings; no auto-delete.

**F-Droid / bundle size:**
- `expo-video` adds ExoPlayer (~1.5–2 MB AAB on Android, similar on iOS via AVKit which is already in the platform). `expo-camera` is already shipping. Estimated delta: ~2–3 MB AAB / ~1 MB IPA. Well under the 5 MB AC ceiling. ExoPlayer is Apache-2.0, FOSS-clean, **no F-Droid blocker**. F-Droid build (`scripts/build-fdroid.sh` or current equivalent) must complete successfully and the resulting APK size delta is reported in the QD merge comment.

### Scope
**In v1:**
- Capture (video-only, 720p, 15 s, no audio, no transcoding).
- Save with backup-exclusion.
- Soft-delete + reconciler (`reconcileOrphans`).
- View (bottom-sheet player + Form Library tab with explicit Select/Compare mode).
- Side-by-side compare (2 clips, vertical split).
- Storage settings panel with stats + bulk delete.
- Privacy banner + hardcoded no-network promise.
- Sentry Mobile Replay masking (global config + per-surface wrappers + grep gate).
- `PRAGMA foreign_keys = ON` (lands first in BLD-1092a).

**Out of v1:**
- Photo support (schema is video-only via `kind`; UI deferred).
- Drawing / annotation overlays.
- Bar-path overlay / ML pose detection.
- Cross-device sync of clips (would break the privacy promise).
- "Share to coach" / export affordance.
- More than 1 clip per set (uniqueness constraint enforces this; future extension drops the constraint).
- Compression / transcoding (Pick A only).
- Web capture (web hides every entry-point — see AC16).

## Acceptance Criteria
- [ ] AC1: Given a completed working set When the user taps the inline `video-outline` glyph on the SetRow Then the camera opens in video mode and records up to 15 s with `mute: true`. Saving creates one `set_media` row and one file under `form-clips/<exercise_id>/`. The glyph state changes to `video-check`.
- [ ] AC2: Given a set with an attached clip When the user taps the clip-exists glyph on the SetRow Then a bottom-sheet player plays the clip without any network request (verify via test that mocks `fetch` + `XMLHttpRequest` + WebSocket and asserts zero calls referencing the clip).
- [ ] AC3: Given an exercise with ≥ 2 clips When the user opens the "Form clips" tab in `ExerciseDetailDrawer` Then the tab shows a count badge and thumbnails render reverse-chronologically with date+weight overlay. Empty state is visible when count is 0.
- [ ] AC4: Given the user enters Select mode and selects two thumbnails When they tap "Compare" Then a 1×1 vertical-split view loads both clips with independent play/pause controls. Long-press also enters Select mode (power-user shortcut).
- [ ] AC5: Given any clip exists When the user invokes CSV export Then the exported file contains zero `set_media` columns, zero `rel_path` substrings, and zero references to clip files (snapshot regression test required).
- [ ] AC6: Given a clip exists When the user uninstalls and reinstalls the app on iOS / Android Then the clip is gone (sandbox enforcement; manually verified by QD on physical device).
- [ ] AC7: Given the user denies camera permission When the FormVideoSheet opens Then a non-blocking dialog explains why and offers a deep-link to OS settings; no clip is created. Copy is functional, no guilt language.
- [ ] AC8: Given storage usage of N clips When the user opens Settings → Storage Then total MB and per-exercise breakdown match `du -sh` of the form-clips directory ± 1 MB.
- [ ] AC9: PR passes typecheck (`npm run typecheck`), all tests, no new lint warnings.
- [ ] AC10: Bundle size delta ≤ 5 MB (verified by F-Droid build and reported in QD merge comment as APK size before/after).
- [ ] AC11: All clip files include `NSFileProtectionCompleteUntilFirstUserAuthentication` (or platform equivalent) — clips are not accessible to other apps.
- [ ] AC12: **Sentry Mobile Replay** payloads contain zero pixels from `FormVideoSheet`, the bottom-sheet player, Form Library thumbnails, and the compare view. Verified by (a) `mobileReplayIntegration({ maskAllImages: true, maskAllVectors: true })` configured in `app/_layout.tsx`, (b) `<Sentry.Mask>` wrappers (or SDK-equivalent API) present on every media surface — asserted by component tests, (c) build-time grep gate that fails the build if `lib/media/*` exists without `maskAllImages: true` set.
- [ ] AC13: **`PRAGMA foreign_keys = ON`** is set on every `getDatabase()` connection (asserted by a runtime test). Cascade chain `workout_sessions → workout_sets → set_media` is verified by an integration test that creates a session/set/clip, deletes the session, and asserts both the DB row and the FS file are gone after `reconcileOrphans()` runs. *(Implemented in pre-requisite PR BLD-1092a; verified in BLD-1092 integration test.)*
- [ ] AC14: **No microphone permission** is requested. `app.config.ts` permissions list and prebuilt `AndroidManifest.xml` lack `RECORD_AUDIO`. iOS `Info.plist` lacks `NSMicrophoneUsageDescription`. Saved clip files contain no audio track (verified via metadata read on save, or by `ffprobe` in QA).
- [ ] AC15: **Backup exclusion.** All clip + thumbnail files are flagged excluded from iOS backup (`NSURLIsExcludedFromBackupKey == 1` verified by reading the attribute back) and from Android Auto Backup (`data_extraction_rules.xml` contains an exclude rule for `form-clips/`, manifest test asserts this).
- [ ] AC16: **Web target** hides every Form-Clips entry point: SetRow glyph not rendered on `Platform.OS === 'web'`, "Form clips" tab not rendered, Settings → Storage row not rendered. `getClipsForExercise` returns `[]` on web. Verified by web-build smoke test.
- [ ] AC17: **Module-boundary enforcement.** ESLint config forbids imports of `lib/media/*` from `lib/sync/**`, `lib/db/csv-export.ts`, `lib/db/import-export.ts`, `app/api/**`, `workers/**`, and any Sentry wrapper. Lint passes with the rule active.
- [ ] AC18: **Reconciler correctness.** Three integration tests pass: (a) DB-row-present + file-missing → placeholder thumbnail rendered, no crash; (b) file-present + no-DB-row → reconciler unlinks the file on next boot/Form-Library-open; (c) parent-set deleted via cascade → both row and file gone after `reconcileOrphans()`.

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Clip recording interrupted (call, app backgrounded mid-record) | Discard in-progress capture; surface a one-line toast; no DB row created; partial file (if any) reaped by reconciler. |
| User deletes the parent set | Cascade-delete `set_media` row (FK + `PRAGMA foreign_keys = ON`); file unlinked by service-layer + reconciler safety net. |
| User deletes the parent session | Cascade through `workout_sets → set_media`; same safety net. |
| User deletes the parent exercise | Soft-delete: clips remain queryable via "Orphaned clips" in Storage Settings; user purges manually. (Avoids data loss on accidental exercise reorg.) |
| Filesystem reports clip missing but DB row exists | Mark row's display as missing; render placeholder thumbnail with "Clip file missing — remove?" action. Do not crash. |
| DB row missing but file exists | Reconciler unlinks the file on next boot or Form-Library-open. |
| User exceeds device storage during save | Show OS error verbatim; do NOT delete other clips; row not INSERTed. |
| Side-by-side compare with portrait + landscape clips | Letterbox each independently inside its half-pane; do not stretch. |
| RTL locale | Compare view splits left/right invariant of writing direction (vertical split, no inversion). |
| Tablet / large screen | Form Library uses 3-column grid; compare can use horizontal split if width > 600 dp. |
| Light / dark theme | Thumbnails use theme-appropriate placeholder + chrome. |
| Locked-screen recording attempt | Use OS guard via expo-camera; if blocked, show clear "unlock to record" copy. |
| Existing CSV import containing media-like columns | Ignore — current CSV format does not include media; importing legacy data must not create stub rows. |
| Web build target (Vercel preview) | Camera unavailable → entry-points entirely hidden; Form Library tab not rendered; `getClipsForExercise` returns `[]`. *(v1 web is fully read-only and shows no Form-Clips UI; the v1 plan's stale "transferred via export" sentence is removed since v1 has no export mechanism.)* |
| Sentry crash during a session with a clip on screen | Replay payload masks the clip surface (AC12); crash report breadcrumbs do not contain `rel_path`. |
| iOS restore-from-backup with old sandbox UUID baked into rows | `rel_path` is relative; resolves correctly under the new sandbox. Backup-excluded clips themselves do not restore (by design). |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Sentry Mobile Replay leaks media pixels | Medium (default SDK behavior) | **Critical** (breaks privacy promise on every error) | AC12: global `maskAllImages` + per-surface `<Sentry.Mask>` + build-time grep gate. |
| `PRAGMA foreign_keys = ON` exposes latent dangling-row bugs in unrelated tables | Medium | High (regressions in delete-set/session/exercise paths) | BLD-1092a is a separate PR with its own QA regression sweep across every existing delete path. |
| Filesystem orphans accumulate (DB row deleted, file leaked) | Medium | Medium (storage growth, no crashes) | Two-phase soft-delete + `reconcileOrphans()` on boot and on Form-Library open. |
| Storage explosion → user complaints | Medium | Medium | Settings panel with stats + bulk delete shipped in v1, not deferred. |
| Bundle size grows past F-Droid expectations | Low | Medium | Estimated 2–3 MB AAB delta, FOSS-clean ExoPlayer. AC10 + F-Droid build gate. |
| Battery / CPU during recording | Low | Medium | Use expo-camera defaults; cap duration at 15 s; mute capture; no transcoding. |
| iOS Photos / Android Gallery accidentally indexes our sandbox | Low | High (privacy promise broken) | Use plain `documentDirectory`; do **not** use `MediaLibrary`. Document in QD checklist. AC15 verifies backup exclusion as a defense-in-depth. |
| Permission denial spirals (user denied → can't recover) | Low | Low | Deep-link to OS settings; never block the rest of the app. |
| `expo-video` SDK 55 playback bug | Low | Medium | Stable since SDK 52; if surfaces post-merge, 1-day swap to `react-native-video`. *(No upfront spike — TL recommendation.)* |

## Open Questions for Reviewers
1. **(closed)** ~~Tech Lead: expo-video maturity / spike?~~ — Closed: stable on SDK 55, no spike.
2. **(closed)** ~~Tech Lead: compression in v1?~~ — Closed: Pick A (720p raw, no transcoding).
3. **(closed)** ~~QD: Form Library location?~~ — Closed: tab inside `ExerciseDetailDrawer` with visible count, even when empty.
4. **(closed)** ~~QD: default thumbnail?~~ — Closed: middle frame, fall back to first.
5. **(closed)** ~~QD: emoji vs MCI icon for entry-point?~~ — Closed: MCI `video-outline` / `video-check`, no emoji.
6. **(closed)** ~~QD: in-v1 share affordance?~~ — Closed: no share/export in v1.
7. **(closed)** ~~CEO/QD: consent dialog?~~ — Closed: inline banner only, no onboarding-style consent wall.
8. **(open, low priority)** Final pixel spec for the SetRow glyph (size, color, hit-target, exact a11y label) — defer to a UX-designer subticket at implementation time. Not a plan blocker.

## Review Feedback

### Quality Director (UX) — rev 1: REQUEST CHANGES
**Verdict (rev 1):** REQUEST CHANGES (2026-05-08T04:06Z, comment 4bc80e3d).

**Blockers from rev 1 and how v2 addresses each:**

| # | Rev-1 Blocker | v2 Resolution |
|---|--------------|---------------|
| 1 | "Never uploaded" promise weak — backups not blocked | New §5 "Privacy Hard Rule 4" + AC15: iOS `NSURLIsExcludedFromBackupKey` set immediately after write, before DB INSERT. Android `data_extraction_rules.xml` exclude rule. Manifest + read-back test. |
| 2 | No-audio capture not explicit | New §5 "Privacy Hard Rule 5" + AC14: `recordAsync({ mute: true })`, no `RECORD_AUDIO` permission, no `NSMicrophoneUsageDescription`, file-metadata audio-track assertion on save. |
| 3 | Long-press-to-compare not discoverable / accessible | UX Design §"Review flow" rewritten: explicit "Select / Compare" mode toggle in tab header with checkboxes and visible selection state; long-press kept as a power-user shortcut. |
| 4 | DB cascade ≠ filesystem cascade; no rollback wishful thinking | Tech Approach §"New module" rewritten: two-phase soft-delete with `pending_delete` tombstone, DB-row-first ordering, `reconcileOrphans()` on boot and on Form-Library open. AC18 covers all three failure modes. Removed the "single try/catch with rollback" claim. |
| 5 | Privacy enforcement test too narrow (rel_path grep insufficient) | Tech Approach §"Privacy enforcement" rewritten: ESLint module-boundary rule (AC17), network mocks for fetch + XMLHttpRequest + WebSocket (AC2), CSV export snapshot (AC5), backup-attribute test (AC15), no-mic test (AC14). |

**QD calls on open questions** — all incorporated above (Q3 form library tab w/ count, Q4 middle-frame thumbnail, Q5 MCI icon, Q6 no share v1, Q7 inline banner only).

**Non-blocking refinements** — all incorporated:
- SetRow glyph + Form-Clips tab count addresses discoverability balance.
- Web "transferred via export" sentence removed (v1 has no export).
- Permission-denied copy now functional, no guilt: "Camera access is needed to record a form clip. CableSnap stores clips on this device."

**Re-review requested:** v2 commit (this revision) on `main`.

### Quality Director (UX) — rev 2: REQUEST CHANGES
**Verdict (rev 2):** REQUEST CHANGES (2026-05-08T04:32Z re-review).

v2 is substantially safer than rev 1, but it still cannot be handed to implementation because several privacy and accessibility guarantees rely on APIs or UI contracts that do not match the current tree.

**Blockers before implementation:**

1. **Backup exclusion is still not implementable as written.** The plan references an `expo-file-system` backup-behavior API / `setBackupBehaviorAsync` and a read-back of `NSURLIsExcludedFromBackupKey`, but Expo SDK 55's installed `expo-file-system` types expose `File`, `Directory`, `info`, write/delete/move/copy, etc. and do not expose any backup-exclusion setter or read-back field. The plan must name the real implementation path: either a native config plugin / tiny native module that sets and verifies `NSURLIsExcludedFromBackupKey`, or remove the "Saved on this device only — never uploaded" copy until that guarantee is real. AC15 must be executable, not aspirational.

2. **Camera recording API details are incorrect for SDK 55.** `CameraRecordingOptions` supports `maxDuration`, `maxFileSize`, `mirror`, and iOS-only `codec` values (`avc1`, `hvc1`, etc.); `mute` is a `CameraView` prop, not a `recordAsync` option, and `codec: 'H264'` is not a valid type. The plan must specify `CameraView mode="video" mute videoQuality="720p"` (or the exact SDK-valid equivalent), then `recordAsync({ maxDuration: 15, codec: 'avc1' /* iOS only if needed */ })`. AC1/AC14 currently direct implementers toward code that will fail typecheck or silently miss the no-audio guarantee.

3. **The OS camera permission copy is currently wrong for this feature.** `app.config.ts` says "CableSnap needs camera access to scan food barcodes for quick nutrition logging." If form clips use the same camera permission, users will see a barcode-only OS prompt while recording workout videos. The plan must require updating `cameraPermission` to cover both barcode scanning and local form clips, while still omitting microphone permission/copy.

4. **SetRow capture affordance underspecifies the accessibility floor.** v2 says an inline glyph at the row's right edge with "~32 dp hit-target with hitSlop"; the existing SetRow right edge already contains the complete checkbox and delete affordance. The plan must hard-require an effective >=48x48 dp touch target, no overlap with check/delete hit regions, and a large-text/landscape row-density test. Visual icon size can be 24-32 dp; touch target cannot be.

5. **Sentry Replay proof is still too weak for a critical privacy promise.** Component tests that inspect React trees do not prove native replay payloads contain zero camera/video pixels. AC12 must require either (a) replay is disabled while any media surface is mounted, or (b) an instrumented/native verification that captures an actual replay artifact and confirms the camera/player/thumbnail regions are redacted. `maskAllImages` + wrapper presence is necessary but not sufficient evidence for the "zero pixels" claim.

**Behavior-design classification:** still **NO**, provided comparison remains informational and no scoring/streak/reward/callout language is added.

### Tech Lead (Feasibility) — rev 1: REQUEST CHANGES
**Verdict (rev 1):** REQUEST CHANGES (2026-05-08T04:13–04:17Z, comments c5bc6731 / a7c49b44).

**Blockers from rev 1 and how v2 addresses each:**

| # | Rev-1 Blocker | v2 Resolution |
|---|--------------|---------------|
| 1 | Sentry Mobile Replay is the actual privacy hole | Tech Approach §"Privacy enforcement" item 1 + AC12: global `maskAllImages: true` + `maskAllVectors: true`, per-surface `<Sentry.Mask>`, component tests, build-time grep gate. |
| 2 | Compression strategy as written is impossible | Tech Approach §"Compression strategy: Pick A" — 720p raw, no transcoding, no ffmpeg. v1 plan's "expo's ImageManipulator-equivalent for video" line removed. AC reframed accordingly (AC1 spec, AC10 bundle ceiling). |
| 3 | `ON DELETE CASCADE` is a no-op without `PRAGMA foreign_keys = ON` | Tech Approach §"Prerequisite commit" (BLD-1092a) — separate PR landing first, with regression sweep. AC13 verifies. |
| 4 | Filesystem deletion ≠ DB deletion ≠ atomic | Tech Approach §"New module" — two-phase soft-delete + `pending_delete` + `reconcileOrphans()` + DB-row-first ordering. AC18. |

**Spec gaps from rev 1 — all addressed:**

| # | Rev-1 Spec Gap | v2 Resolution |
|---|--------------|---------------|
| 5 | expo-video maturity (Open Q1) | No spike. Risk Assessment row updated. Open Q1 closed. |
| 6 | Kebab fiction in SetRow | UX Design §"Capture entry point" rewritten — inline `video-outline` glyph at row right edge, completed sets only, MCI icon. UX-designer subticket noted. |
| 7 | No-audio capture concrete tech | AC14 + Tech §Privacy Hard Rule 5. `mute: true`, no MIC permission, manifest test. |
| 8 | iOS/Android backup exclusion concrete tech | AC15 + Tech §Privacy Hard Rule 4. `setBackupBehaviorAsync` after write, before INSERT. `data_extraction_rules.xml`. Read-back test. |
| 9 | `set_media.kind` should be NOT NULL with no default | Schema updated: `kind: text("kind").notNull()` — no default. |
| 10 | One-clip-per-set unique constraint | Schema updated: `uniqueIndex("uq_set_media_set_id").on(t.set_id)`. |
| 11 | Privacy enforcement test scope | Tech §"Privacy enforcement" items 2–6 — ESLint boundaries, network mocks for fetch + XHR + WebSocket, CSV snapshot, backup attribute test, no-mic test. AC17 codifies the ESLint rule. |
| 12 | F-Droid bundle delta | Risk Assessment + AC10 — estimated 2–3 MB AAB, FOSS-clean ExoPlayer, F-Droid build gate. |
| 13 | Web target contradiction (export in v1?) | Edge Cases row + AC16 — v1 web hides everything; "transferred via export" sentence removed. |
| 14 | Stable directory layout | Tech §"New schema" — paths documented as part of migration contract, in `lib/media/README.md`. |
| 15 | Performance / threading post-transcoding-removal | "No UI-thread encoding" risk dropped (no transcoding in v1). Thumbnail generation off-thread, sequential, on first view. |

**New ACs added:** AC12 (Sentry mask), AC13 (FK pragma + cascade), AC14 (no audio), AC15 (backup excl), AC16 (web hide), AC17 (ESLint boundaries), AC18 (reconciler correctness).

**Tech Lead's open-question answers** — all adopted.

**Re-review requested:** v2 commit (this revision) on `main`.

### Psychologist (Behavior-Design)
_N/A — Classification = NO. If a reviewer believes any UX detail crosses the line, flag it and we redesign._

### CEO Decision
_Pending QD + TL re-review of v2._
