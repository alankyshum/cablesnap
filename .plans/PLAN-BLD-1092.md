# Feature Plan: Local-only Form Check Videos

**Issue**: BLD-1092  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT v3 → IN_REVIEW  (v3 addresses all QD + TL rev-2 blockers; v2 addressed rev-1)

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
Each completed working set may have **at most one short video clip** attached (≤ 15 s, captured at 720p / `avc1` on iOS, video-only, no audio track). Clips are stored in `${FileSystem.documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4` — inside the app's sandbox so they're auto-removed on uninstall, **and explicitly excluded from iOS backup and Android Auto Backup via the BLD-1092b config plugin** (see Hard Rule 4). A new `set_media` table tracks the relationship, with a `unique` constraint on `set_id` (one-clip-per-set invariant) and a `pending_delete` tombstone column. A "Form Library" tab on the existing exercise detail drawer lets the user browse all clips for that exercise across time, with an explicit "Select" / "Compare" mode.

**Hard rules — non-negotiable, enforced in code, copy, AND tests:**
1. Clips never enter any network call. The clip path and bytes are excluded from CSV export, sync (none today, but defensive), Sentry crash attachments, **and Sentry Mobile Replay** (replay must be programmatically *disabled while a media surface is mounted* — see Privacy section below; component-tree masking alone is insufficient for native preview surfaces). Enforced via ESLint module boundaries + network-mock integration tests covering `fetch`, `XMLHttpRequest`, and WebSocket.
2. **Privacy banner is gated on backup-exclusion delivery.** Until BLD-1092b (the backup-exclusion config plugin) merges, the capture-sheet banner reads `"Saved on this device only."` (no "never uploaded" claim). After BLD-1092b lands and is verified, the banner is upgraded to `"Saved on this device only — never uploaded."` Banner copy must match verified runtime, never aspiration.
3. Uninstalling the app removes all clips (sandbox guarantee on iOS + Android — verify in QA on physical device).
4. **Backup exclusion is delivered by BLD-1092b** (a sibling prerequisite PR): a tiny custom Expo config plugin `plugins/with-form-clips-backup.ts` that on **iOS** bundles a small Swift module setting `URLResourceKey.isExcludedFromBackupKey = true` on each clip path immediately after write (and exposing a read-back helper for tests), and on **Android** writes `android/app/src/main/res/xml/data_extraction_rules.xml` (plus `full_backup_content.xml` for SDK ≤ 30) excluding `files/form-clips/` from Auto Backup. Required because `expo-file-system ~55.0.17` exposes **no** backup-exclusion JS API (verified via grep of `node_modules/expo-file-system/build/**` — zero matches). The feature PR depends on 1092b for the strong banner copy.
5. **No microphone permission requested** — capture is video-only. `mute` is set as a **`<CameraView>` prop** (verified per `expo-camera` SDK 55 types: `Camera.types.d.ts:338,494`) — *not* a `recordAsync()` option. `app.config.ts` does not add `microphonePermission`/`recordAudioAndroid`; prebuilt `AndroidManifest.xml` lacks `RECORD_AUDIO`; `Info.plist` lacks `NSMicrophoneUsageDescription`. Saved files contain zero audio tracks (metadata read on save).
6. Sharing ("Send to coach") is **out of scope v1**. v1 ships **without** any export affordance to preserve the privacy-first promise as the default. A guarded share flow can be designed separately later.
7. **OS camera permission copy must cover form clips.** `app.config.ts:42-43` currently scopes `cameraPermission` to barcode scanning only ("CableSnap needs camera access to scan food barcodes for quick nutrition logging."). The feature PR updates it to also cover form-check recording, **without** mentioning microphone. Suggested: `"CableSnap uses your camera to scan food barcodes for nutrition logging and to record short form-check clips that stay on this device."` Verified by manifest/Info.plist snapshot test.

### UX Design

**Capture entry point** (during a workout, on a completed working set):

> Note (v3): Existing `components/session/SetRow.tsx` does **not** have a kebab — it uses swipe + long-press for delete and accessibility actions (verified). v1 introduces a small inline glyph at the row's right edge for **completed sets only**, with **visual icon size 24–32 dp** but a **≥48×48 dp effective touch target via `hitSlop`** (WCAG 2.5.5 AA + Material Android floor; QD/TL rev-2 spec polish #4). The hitSlop must **not overlap** the existing checkbox / delete swipe-action hit regions; this is verified by a layout test under both compact and large-text row densities and in landscape orientation. Icon: `MaterialCommunityIcons` `video-outline`, switching to `video-check` (filled) when a clip exists. Exact pixel spec and a11y label is delegated to a UX-designer subticket created at implementation time.

1. Tap glyph on a completed SetRow → `FormVideoSheet` (full-screen modal) opens `expo-camera` in video mode using the **SDK-55-correct** surface: `<CameraView mode="video" mute videoQuality="720p" facing="back" />` (the `mute` prop and `videoQuality` prop both belong on the view, not on `recordAsync` — verified `Camera.types.d.ts:338,494`). Recording is started with `cameraRef.current?.recordAsync({ maxDuration: 15, codec: Platform.OS === 'ios' ? 'avc1' : undefined })` (codec is iOS-only; valid `VideoCodec` values are `'avc1' | 'hvc1' | 'jpeg' | 'apcn' | 'ap4h'` — `'H264'` is **not** valid). A visible countdown shows time remaining.
2. After capture, single-screen review: play / re-record / save / cancel. No filters, no editing.
3. Save: write to sandbox, **call BLD-1092b's `backupExclusion.setExcludedFromBackup(uri)` helper** (iOS only — Android coverage comes from the manifest rule), then INSERT into `set_media`. Order is critical so a crash mid-save can't leak a backed-up orphan.
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

**Prerequisite PRs (both must merge before the feature PR):**

> **BLD-1092a — `PRAGMA foreign_keys = ON` in `lib/db/helpers.ts`.**
> Verified: today the main DB connection (lib/db/helpers.ts:42-55) sets `journal_mode = WAL` but never `foreign_keys = ON`. The pragma is only enabled in `lib/db/import-export.ts:530` (CSV import path). Therefore Drizzle's `references(..., { onDelete: "cascade" })` is currently a runtime no-op on app deletes. Without this commit, the cascade chain `workout_sessions → workout_sets → set_media` cannot be solved at the DB layer.
>
> Plan: a standalone PR that adds `database.execAsync("PRAGMA foreign_keys = ON")` immediately after the journal-mode pragma, plus a runtime test asserting the value, plus a QA regression sweep across **every** existing delete path. **Per TL rev-2 §A**, the 1092a PR description must enumerate at minimum: `deleteSet`, `deleteSession`, `softDeleteCustomExercise`, `deleteTemplate`, `removeExerciseFromTemplate`, `program_*` table cleanups, plus any other delete entry-point that a `grep -rn "delete\|softDelete" lib/db/` enumeration surfaces. Land this **before** the feature PR. If QA finds latent dangling-row bugs they're scoped to BLD-1092a, not 1092.

> **BLD-1092b — Backup-exclusion config plugin.**
> Verified blocker (TL+QD rev-2): `expo-file-system ~55.0.17` exposes **no** backup-exclusion JS API. We need a small custom Expo config plugin (`plugins/with-form-clips-backup.ts`, ~30 LOC TS + ~10 LOC native each side) that:
> - **iOS:** patches the prebuilt project so a `FormClipsBackup` Swift module exposes `setExcludedFromBackup(uri: string): Promise<void>` (calls `(URL).setResourceValues([.isExcludedFromBackupKey: true])`) and `readBackupExclusion(uri: string): Promise<bool>` for the read-back test.
> - **Android:** writes `android/app/src/main/res/xml/data_extraction_rules.xml` (and `full_backup_content.xml` for SDK ≤ 30) excluding `files/form-clips/` from Auto Backup, and patches `AndroidManifest.xml` `<application>` to reference both rules files.
> - Both: a TS shim `lib/media/backup-exclusion.ts` that wraps the native module on iOS and is a no-op on Android (manifest covers Android entirely).
>
> The 1092b PR ships with: a runtime test that creates a temp file, calls `setExcludedFromBackup`, calls `readBackupExclusion`, asserts `true`; a manifest snapshot test asserting the Android XML rules are present after prebuild; QA verification of `bmgr` Android backup output excluding `form-clips/`.
>
> **Banner copy is gated on 1092b.** Until 1092b merges, the feature PR's privacy banner says "Saved on this device only" without "never uploaded". After 1092b merges, banner upgrades. Eliminates the false-promise risk.

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
  // Partial index — pending_delete is highly skewed (almost all rows = 0); a normal index is counterproductive on SQLite.
  index("idx_set_media_pending_delete_partial").on(t.pending_delete).where(sql`${t.pending_delete} = 1`),
]);
```
- `rel_path` (not absolute) so iOS sandbox UUID changes after restore-from-backup don't orphan rows.
- Stable directory layout, documented in `lib/media/README.md` as part of the migration contract:
  - clips: `${documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4`
  - thumbnails: `${documentDirectory}form-clips/<exercise_id>/.thumbs/<clip_id>.jpg`

**New module** `lib/media/form-clips.ts`:
- `recordClip(setId, exerciseId)` → opens camera with `<CameraView mute>` (video-only), writes file via `expo-file-system`, calls `backupExclusion.setExcludedFromBackup(uri)` (BLD-1092b shim), then INSERTs `set_media` row, returns `SetMediaRow`.
- `getClipsForExercise(exerciseId)` → reverse-chron list, filtered `WHERE pending_delete = 0`. **Returns `[]` on `Platform.OS === 'web'`.**
- `softDeleteClip(id)` → sets `pending_delete = 1`, hides from UI immediately. Reconciler unlinks the file later.
- `deleteClip(id)` (used by reconciler / explicit "delete now"): **DB row delete first, then `unlinkAsync`**. `unlinkAsync` ENOENT is swallowed idempotently (TL rev-2 C(e)) — file may already be gone.
- `reconcileOrphans()` runs on app boot **and** on first Form Library open after launch. To avoid the **concurrent-write race** (TL rev-2 C(d)):
  1. **Snapshot the DB row set first** — `SELECT id, rel_path FROM set_media`.
  2. Enumerate filesystem under `form-clips/`.
  3. Only consider a file "orphan" if it is BOTH absent from the DB snapshot AND its `mtime` is older than `Date.now() - 30_000` (30-second quiet-zone). This protects clips written between snapshot and enumeration from being erroneously unlinked.
  4. For every row with `pending_delete = 1`: attempt `unlinkAsync`; **swallow ENOENT idempotently**; then DELETE the row regardless.
  5. For every row with no file (and `pending_delete = 0`): leave row in place but flag `rel_path` as missing for the UI placeholder.
- `getStorageStats()` → total bytes + clip count from FS, cross-checked with DB.
- All functions strictly synchronous-with-DB, async only for FS / camera. `getClipsForExercise` is web-no-op.

**New dependencies:**
- `expo-video` (≥ 2.x for SDK 55) — playback. Stable since SDK 52, official replacement for deprecated `expo-av` Video. **No spike needed**; fall back to `react-native-video` is a 1-day swap if needed.
- `expo-video-thumbnails` — thumbnail generation API. Per claudecoder readiness review: not bundled with `expo-video`; explicit dependency required. Apache-2.0, FOSS-clean, no F-Droid concern.
- Capture continues using existing `expo-camera ~55.0.15` (verified in `package.json`). **No `expo-image-manipulator`-for-video-like dependency** — no post-capture transcoding in v1.

**Compression strategy: Pick A — ship 720p raw, SDK-correct API.** Use the verified SDK-55 surface:

```tsx
<CameraView ref={cameraRef} mode="video" mute videoQuality="720p" facing="back" />
// …
await cameraRef.current?.recordAsync({
  maxDuration: 15,
  codec: Platform.OS === 'ios' ? 'avc1' : undefined, // iOS-only; Android ignores
});
```

`mute` and `videoQuality` are **`CameraView` props** (verified `Camera.types.d.ts:338,494,494`). `codec` is the only `recordAsync` option that affects compression on iOS, and the valid `VideoCodec` union is `'avc1' | 'hvc1' | 'jpeg' | 'apcn' | 'ap4h'` — `'H264'` would fail typecheck. Accept the resulting size (typically 4–10 MB / 15 s). `set_media.size_bytes` is informational only. No transcoding. Earlier "ImageManipulator-equivalent for video" was wrong — `expo-image-manipulator` does not handle video, and realistic transcoders (`react-native-ffmpeg-kit`, `react-native-video-processing`) carry GPL/LGPL + F-Droid headaches. Compression deferred to v2.

**Privacy enforcement (must be tested):**

1. **Sentry Mobile Replay disable-while-mounted (highest-stakes; v3 strengthens v2's masking-only approach per TL rev-2 §B).** Verified: `app/_layout.tsx:50` initializes `Sentry.mobileReplayIntegration()` with `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1`, `sendDefaultPii: true`. JS `<Sentry.Mask>` wrappers prove component-tree masking but do **NOT** prove the **native** Sentry SDK replay-capture pipeline honors masks for `expo-camera`'s native preview surface (a `SurfaceView` on Android / `AVCaptureVideoPreviewLayer` on iOS), nor for `expo-video`'s native player. v3 approach:
   - **Primary mechanism: replay-disable-while-mounted.** A `useReplayDisableWhileMounted()` hook is mounted at the root of every media surface (`FormVideoSheet`, bottom-sheet player, Form Library thumbnails grid, compare view). On mount it calls the SDK-8 equivalent of `Sentry.getClient()?.getIntegrationByName('MobileReplay')?.stop?.()`; on unmount it calls `start()`. Concurrent-mount safety: a small ref-counter ensures replay only restarts when the **last** media surface unmounts. The exact API name may vary across Sentry SDK 8.x patch releases — the hook hedges with feature-detection (`stop?.()`) and falls back to `client.close()`/`client.init()` cycle if `stop` is unavailable.
   - **Secondary (defense-in-depth):** keep `mobileReplayIntegration({ maskAllImages: true, maskAllVectors: true })` globally + `<Sentry.Mask>` per surface. These won't help with native preview but cover thumbnail JPGs rendered through `<Image>`.
   - **Component test per surface** that mounts it, asserts the replay integration is in stopped state via the integration's introspection API (or test double of the integration), and asserts restart on unmount + after concurrent mount/unmount cycles.
   - **Build-time grep gate** (`scripts/check-privacy-boundaries.sh`, called from CI): if `lib/media/*` exists, then (a) `app/_layout.tsx` must contain `maskAllImages: true`, AND (b) every component that imports from `lib/media/*` and renders a media surface must contain a call to `useReplayDisableWhileMounted()`. Fails the build otherwise.
2. **Module boundary enforcement.** ESLint `no-restricted-imports` (or `eslint-plugin-boundaries` if already present) forbids `lib/media/*` from being imported by:
   - `lib/sync/**` (none today; defensive),
   - `lib/db/csv-export.ts`, `lib/db/import-export.ts`,
   - anything under `app/api/**` or `workers/**` (Vercel functions),
   - any Sentry shim / wrapper.
3. **Network-mock integration tests** covering full capture → view → delete → reconcile flow:
   - Mock `global.fetch`, `global.XMLHttpRequest`, and any WebSocket / `EventSource`.
   - Assert zero requests with any URL or body containing `form-clips/`, `.mp4`, or any clip's `rel_path`.
4. **CSV export snapshot test**: assert no `set_media` columns and no `rel_path` substrings in the exported file when clips exist.
5. **Backup attribute test (delivered by BLD-1092b plugin):** after `recordClip` resolves, call BLD-1092b's `backupExclusion.readBackupExclusion(uri)` helper and assert `true` (iOS). Manifest snapshot test asserts `data_extraction_rules.xml` contains the exclude rule for `files/form-clips/` after prebuild (Android).
6. **No-microphone-permission test**: read `app.config.ts` permissions list and the prebuilt `AndroidManifest.xml` + iOS `Info.plist`; assert `RECORD_AUDIO` and `NSMicrophoneUsageDescription` are absent. Also assert `app.config.ts` `cameraPermission` text covers form clips (per Hard Rule 7). Saved-clip metadata read asserts `audio_track == null`.

**Performance:**
- Form Library tab paginates 20 thumbnails at a time (FlashList).
- Thumbnails are generated **lazily on first view**, off the UI thread via `expo-video-thumbnails` (separate package — see Dependencies), and cached to `.thumbs/`. Thumbnails are queued sequentially — never parallel-N — to avoid ANRs on low-end Android.
- Use **middle-frame** as default thumbnail; fall back to first frame if generation fails. No user-chosen thumbnails in v1.
- Player uses on-demand load — no pre-warming.
- (No post-capture transcoding in v1, so the "encoding on UI thread" concern is moot.)

**Storage budget:**
- 38 working sets/week × 1 clip each × ~7 MB avg ≈ 1.4 GB/year worst case for a power user. Surfaced in Settings; no auto-delete.

**F-Droid / bundle size:**
- `expo-video` adds ExoPlayer (~1.5–2 MB AAB on Android, similar on iOS via AVKit which is already in the platform). `expo-video-thumbnails` adds ~200 KB. `expo-camera` is already shipping. Estimated delta: ~2–3 MB AAB / ~1 MB IPA. Well under the 5 MB AC ceiling. ExoPlayer is Apache-2.0, FOSS-clean, **no F-Droid blocker**.
- F-Droid verification path (TL rev-2 spec polish #5): the repo does **not** have `scripts/build-fdroid.sh`. F-Droid metadata lives under `fdroid/` and the build flows through `.github/workflows/fdroid-release.yml` plus the `fdroid-foss-build` skill. The QD merge comment must report the APK delta as measured by the `fdroid-foss-build` skill output, not a local script.

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
- [ ] AC1: Given a completed working set When the user taps the inline `video-outline` glyph on the SetRow (visual size 24–32 dp; effective hitSlop ≥ 48×48 dp; non-overlapping with checkbox/delete hit regions; verified by layout test in compact + large-text + landscape) Then the camera opens in video mode using `<CameraView mode="video" mute videoQuality="720p" facing="back" />` (mute is a CameraView prop, not a recordAsync option) and records up to 15 s via `recordAsync({ maxDuration: 15, codec: Platform.OS === 'ios' ? 'avc1' : undefined })`. Saving creates one `set_media` row and one file under `form-clips/<exercise_id>/`. The glyph state changes to `video-check`.
- [ ] AC2: Given a set with an attached clip When the user taps the clip-exists glyph on the SetRow Then a bottom-sheet player plays the clip without any network request (verify via test that mocks `fetch` + `XMLHttpRequest` + WebSocket and asserts zero calls referencing the clip).
- [ ] AC3: Given an exercise with ≥ 2 clips When the user opens the "Form clips" tab in `ExerciseDetailDrawer` Then the tab shows a count badge and thumbnails render reverse-chronologically with date+weight overlay. Empty state is visible when count is 0.
- [ ] AC4: Given the user enters Select mode and selects two thumbnails When they tap "Compare" Then a 1×1 vertical-split view loads both clips with independent play/pause controls. Long-press also enters Select mode (power-user shortcut).
- [ ] AC5: Given any clip exists When the user invokes CSV export Then the exported file contains zero `set_media` columns, zero `rel_path` substrings, and zero references to clip files (snapshot regression test required).
- [ ] AC6: Given a clip exists When the user uninstalls and reinstalls the app on iOS / Android Then the clip is gone (sandbox enforcement; manually verified by QD on physical device).
- [ ] AC7: Given the user denies camera permission When the FormVideoSheet opens Then a non-blocking dialog explains why and offers a deep-link to OS settings; no clip is created. Copy is functional, no guilt language.
- [ ] AC8: Given storage usage of N clips When the user opens Settings → Storage Then total MB and per-exercise breakdown match `du -sh` of the form-clips directory ± 1 MB.
- [ ] AC9: PR passes typecheck (`npm run typecheck`), all tests, no new lint warnings.
- [ ] AC10: Bundle size delta ≤ 5 MB, verified by the **`fdroid-foss-build` skill** (or the `.github/workflows/fdroid-release.yml` workflow output). QD merge comment reports APK size before/after as measured by that skill — **not** a non-existent `scripts/build-fdroid.sh`.
- [ ] AC11: All clip files include `NSFileProtectionCompleteUntilFirstUserAuthentication` (or platform equivalent) — clips are not accessible to other apps.
- [ ] AC12: **Sentry Mobile Replay is disabled while any media surface is mounted** (TL rev-2 §B floor). Verified by (a) every component under `lib/media/*` and any consumer that renders a media surface calls `useReplayDisableWhileMounted()` — asserted by build-time grep gate in `scripts/check-privacy-boundaries.sh`; (b) hook test asserts `MobileReplay.stop()` is called on mount, `start()` on unmount, ref-counter handles concurrent mount/unmount; (c) defense-in-depth: `mobileReplayIntegration({ maskAllImages: true, maskAllVectors: true })` in `app/_layout.tsx` + `<Sentry.Mask>` wrappers per surface, asserted by component tests; (d) grep gate also fails the build if `lib/media/*` exists without `maskAllImages: true` set.
- [ ] AC13: **`PRAGMA foreign_keys = ON`** is set on every `getDatabase()` connection (asserted by a runtime test). Cascade chain `workout_sessions → workout_sets → set_media` is verified by an integration test that creates a session/set/clip, deletes the session, and asserts both the DB row and the FS file are gone after `reconcileOrphans()` runs. *(Implemented in pre-requisite PR BLD-1092a; verified in BLD-1092 integration test.)*
- [ ] AC14: **No microphone permission** is requested. `app.config.ts` does not set `microphonePermission` or `recordAudioAndroid`. Prebuilt `AndroidManifest.xml` lacks `RECORD_AUDIO`. iOS `Info.plist` lacks `NSMicrophoneUsageDescription`. **AND `app.config.ts` `cameraPermission` text matches the new copy** ("…to scan food barcodes…and to record short form-check clips that stay on this device.") — assertion runs against both `app.config.ts` source and the prebuilt `Info.plist` `NSCameraUsageDescription` + Android string resource. Saved clip files contain no audio track (metadata read on save, or `ffprobe` in QA).
- [ ] AC15: **Backup exclusion (delivered by BLD-1092b prerequisite).** iOS: `recordClip` calls the BLD-1092b Swift helper `setExcludedFromBackup(uri)`, and a runtime test asserts `readBackupExclusion(uri) === true` for each clip + thumbnail. Android: a manifest snapshot test asserts `android/app/src/main/res/xml/data_extraction_rules.xml` (and `full_backup_content.xml` for SDK ≤ 30) contains an exclude rule for `files/form-clips/` after prebuild, and that `AndroidManifest.xml <application>` references both rules files. Until BLD-1092b merges, the feature PR's banner copy must NOT include "never uploaded" (Hard Rule 2).
- [ ] AC16: **Web target** hides every Form-Clips entry point: SetRow glyph not rendered on `Platform.OS === 'web'`, "Form clips" tab not rendered, Settings → Storage row not rendered. `getClipsForExercise` returns `[]` on web. Verified by web-build smoke test.
- [ ] AC17: **Module-boundary enforcement.** ESLint config forbids imports of `lib/media/*` from `lib/sync/**`, `lib/db/csv-export.ts`, `lib/db/import-export.ts`, `app/api/**`, `workers/**`, and any Sentry wrapper. Lint passes with the rule active.
- [ ] AC18: **Reconciler correctness.** Five integration tests pass: (a) DB-row-present + file-missing → placeholder thumbnail rendered, no crash; (b) file-present + no-DB-row + `mtime > 30s` → reconciler unlinks the file on next boot/Form-Library-open; (c) parent-set deleted via cascade → both row and file gone after `reconcileOrphans()`; **(d) concurrent-write race (TL rev-2 §C(d))**: while `reconcileOrphans()` is mid-scan, a `recordClip` writes file X and inserts row X. The reconciler must NOT unlink file X — verified by snapshot-DB-rows-before-FS-enumeration plus the `mtime > 30s` quiet zone; **(e) idempotent unlink (TL rev-2 §C(e))**: a `pending_delete = 1` row whose file vanished separately must still be DELETEd cleanly — `unlinkAsync` ENOENT is swallowed.

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

### Tech Lead (Feasibility) — rev 2: REQUEST CHANGES
**Verdict (rev 2):** REQUEST CHANGES (2026-05-08T04:40Z re-review against `db619def` on `main`).

The four rev-1 technical blockers (Sentry replay, compression, FK pragma, FS+DB ordering) are correctly resolved at the architecture level. **However**, three new technical blockers surfaced on close re-read of v2 against the actual installed SDK 55 surface. Two of these were also caught by QD rev 2 (#1, #2); I am seconding them with verified evidence and adding one of my own.

**New blockers (rev 2):**

1. **(Seconds QD rev-2 #1) `expo-file-system ~55.0.17` does not expose any backup-exclusion API.** Verified by grep: zero `Backup` / `excludeFromBackup` / `setBackupBehaviorAsync` / `NSURLIsExcludedFromBackup` matches in `node_modules/expo-file-system/build/**` or `node_modules/expo-file-system/ios/**`. The Swift module exposes File/Directory primitives only. AC15 as written cannot be implemented with the installed dependencies. Required fix in plan:
   - **Pick A (recommended):** Add a tiny **config plugin / native module** (~30 LOC of Swift + Kotlin + a TS shim) that calls `(try url.setResourceValue(true, forKey: .isExcludedFromBackupKey))` on iOS and adds the `<exclude>` rule on Android. This is in-scope for the feature (or split into a sibling prerequisite PR `BLD-1092b` alongside `1092a`).
   - **Pick B:** If a native module is too much for v1, **gate the privacy banner copy** behind the guarantee. The current "Saved on this device only — never uploaded." copy must NOT ship until backup exclusion is verified. Either move the feature behind a documented caveat ("clips may be included in OS backups") or ship without the absolute-privacy promise.
   - **Pick C (worst, but valid):** Use `LocalAuthentication`-keychain or `expo-secure-store` for a flag, while documenting that file-level backup exclusion is deferred to v1.1.
   Plan must commit to A, B, or C — not leave AC15 referencing a function that does not exist. Update §"Privacy enforcement" item 5 with the chosen path and the actual verification steps for that path.

2. **(Seconds QD rev-2 #2) Camera recording API in plan does not match SDK 55 types.** Verified `node_modules/expo-camera/build/Camera.types.d.ts`:
   - `CameraRecordingOptions` (line 178-198) supports `maxDuration`, `maxFileSize`, `mirror` (deprecated), and `codec` ONLY. There is **no** `mute` field.
   - `mute` is a **`CameraView` prop** (line 338, 494), not a `recordAsync` option.
   - `VideoCodec` (line 31) accepts `'avc1' | 'hvc1' | 'jpeg' | 'apcn' | 'ap4h'`. **`'H264'` is not a valid value** and will fail typecheck.
   - `codec` is `@platform ios` only — Android ignores it.
   - `videoQuality` is a `CameraView` prop (`'2160p' | '1080p' | '720p' | '480p' | '4:3'`), not a `recordAsync` option.
   Plan §"Compression strategy: Pick A" must be rewritten:
   ```tsx
   <CameraView
     mode="video"
     mute               // <— mute is a prop on the view, not on recordAsync
     videoQuality="720p"
     ref={cameraRef}
   />
   // …
   await cameraRef.current?.recordAsync({
     maxDuration: 15,
     codec: Platform.OS === 'ios' ? 'avc1' : undefined,  // iOS only; Android ignores
   });
   ```
   AC1 and AC14 must be edited to match the actual prop/option boundaries, otherwise a literal-reading implementer ships code that fails typecheck.

3. **(NEW) Camera permission copy is currently barcode-only.** Verified `app.config.ts:42-43`:
   > `cameraPermission: "CableSnap needs camera access to scan food barcodes for quick nutrition logging."`
   When `FormVideoSheet` triggers a camera permission prompt, the OS shows that string — which is misleading and arguably anti-consent. Plan must add an explicit task: update `cameraPermission` to cover both barcode scanning *and* local form clips, **without** mentioning microphone (since `mute` ensures we never request that). Suggested copy:
   > "CableSnap needs camera access to scan food barcodes and to record optional form-check clips that stay on this device."
   Add an AC: prebuilt iOS `Info.plist` `NSCameraUsageDescription` and Android string resource match the new copy. (QD rev-2 #3 also catches this.)

**Validation of CEO-specific asks:**

A. **`BLD-1092a` prerequisite framing — APPROVED as scoped.** The separate-PR + regression-sweep approach is correct. `lib/db/helpers.ts:42-55` is the single open site for the main connection (verified again). One small refinement to the plan: the regression sweep should include `softDeleteCustomExercise`, `deleteTemplate`, `removeExerciseFromTemplate`, and the cascade chain through `program_*` tables (the goal calls them deprecated, but they still exist) — flipping `foreign_keys = ON` may surface dangling rows on legacy data. The 1092a PR description must enumerate every table that today *could* hold orphans and have QA verify each. Add a one-liner to §"Prerequisite commit" noting this enumeration is required.

B. **AC12 verification approach — INSUFFICIENT, agrees with QD rev-2 #5.** Component-tree tests prove the React tree contains `<Sentry.Mask>` wrappers and that no native `Image`/`Video` escapes the wrapper *in JS-land*. They do **not** prove the native Sentry SDK's replay frame-capture pipeline honors those masks for `expo-camera`'s native preview surface (which is a `SurfaceView`/`AVCaptureVideoPreviewLayer`, not a React Native `Image`). The verification must include at least one of:
   - **(Recommended) Replay-disable-while-mounted:** when any `lib/media/*` surface is mounted, programmatically disable Sentry replay (`Sentry.getClient()?.getIntegrationByName('MobileReplay')?.stop?.()` or equivalent SDK-8.x API) and re-enable on unmount. Single mechanism, easy to verify, hard to break. Best fits the "zero pixels" promise. Add as primary AC12 mechanism.
   - **OR Native instrumentation test:** force a Sentry replay artifact during a manual QA pass on a physical device with each surface visible, decode the artifact, and visually confirm the camera/player/thumbnail regions are redacted. This is QA-runtime verification, hard to automate, but proves the actual on-device behavior. If chosen, must be in QD's manual checklist for every Form-Clips surface.
   - The current "component tests + grep gate" alone is necessary but **not sufficient**. Pick the disable-while-mounted approach as the AC12 floor; the build-time grep gate stays as defense-in-depth.

C. **AC18 reconciler test cases — MOSTLY GOOD, two gaps.** The three cases listed (file-missing/row-present, file-present/no-row, cascade-delete-correctness) are correct. Add:
   - **(c.i) Concurrent-write race:** record clip A while reconciler is mid-scan. Reconciler must not unlink A's freshly-written file because the DB row was inserted between the directory enumeration and the row-set lookup. Easiest fix: take a snapshot of `set_media.rel_path` BEFORE enumerating the FS, then only consider files present at enumeration time but absent from the snapshot AND older than a small grace window (e.g., 30 s `mtime`). Add as AC18(d).
   - **(c.ii) `pending_delete = 1` row whose file vanished separately:** reconciler must still drop the row (idempotent), not crash on `unlinkAsync` of a missing file. Add as AC18(e).
   Without these, the reconciler can either delete the user's freshly-recorded clip (data loss) or wedge on the first orphan. Both have happened in shipped apps.

**Spec polish (non-blocking, but easy to fix in this round):**

4. AC1 + plan UX section: glyph touch-target should be specified as ≥48×48 dp **with non-overlapping hitSlop relative to the existing check / delete tap regions**. v2 says "~32 dp hit-target" — that's below WCAG 2.5.5 AA (44×44 CSS px) and Material Android guidelines (48 dp). QD rev-2 #4 calls this out; I second.
5. AC10 verification path is named "F-Droid build (`scripts/build-fdroid.sh` or current equivalent)" — confirm the script name. Repo has a `fdroid/` directory with metadata only, and the F-Droid build today appears to flow through the F-Droid skill (per stored memory, not via a local script). Plan should say "F-Droid skill build completes successfully and reports APK size delta in the merge comment" rather than name a non-existent script.
6. The `pending_delete` index `idx_set_media_pending_delete` will be very low-cardinality (almost all rows will have `pending_delete = 0`). It is unnecessary and slightly counterproductive on SQLite. Consider replacing with a partial index: `WHERE pending_delete = 1` — or drop it; the reconciler scans on app boot, doesn't need a fast index.

**Approval condition:** Resolve blockers 1–3 in the plan (commit to a backup-exclusion path, fix the camera API code sample, update permission copy). Update AC12 to require replay-disable-while-mounted (or a comparable "actual replay artifact" test). Update AC18 with the two new race/idempotency cases. Once those land, I will APPROVE without another round.

Validation of v2 vs my rev-1 list:

| # | Rev-1 item | v2 status |
|---|-----------|-----------|
| 1 | Sentry replay masking | Architecturally addressed; needs AC12 strengthened (see C above) — **partial** |
| 2 | Compression Pick A | **Resolved** (modulo API code sample fix in blocker #2 above) |
| 3 | FK pragma prerequisite | **Resolved** + 1092a regression sweep enumerated |
| 4 | FS+DB delete ordering | **Resolved** (modulo two AC18 cases above) |
| 5–15 | Spec gaps | **All resolved** |

### Quality Director (UX) — rev 3: PENDING

**Verdict (rev 3):** PENDING — re-review requested 2026-05-08T after v3 push.

**v2 blockers (QD rev-2) and how v3 addresses each:**

| # | QD rev-2 Blocker | v3 Resolution |
|---|------------------|---------------|
| 1 | `expo-file-system` has no backup-exclusion API (AC15 was aspirational) | Hard Rule 4 + new Tech Approach §"BLD-1092b — Backup-exclusion config plugin" — explicit prerequisite PR ships a custom Expo config plugin with iOS Swift module (`setExcludedFromBackup`/`readBackupExclusion`) and Android `data_extraction_rules.xml`. AC15 rewritten to test the plugin's actual deliverables. **Banner copy gated** (Hard Rule 2): until 1092b merges, banner says "Saved on this device only" — no "never uploaded" claim. |
| 2 | Camera API mismatch (`mute` is a prop, `'H264'` invalid codec) | Hard Rule 5 + UX §"Capture entry point" §step 1 + Tech §"Compression strategy" all rewritten with verified SDK-55 API: `<CameraView mode="video" mute videoQuality="720p" />` + `recordAsync({ maxDuration: 15, codec: Platform.OS === 'ios' ? 'avc1' : undefined })`. AC1 + AC14 updated. |
| 3 | `cameraPermission` copy is barcode-only — misleading prompt | New Hard Rule 7 requires updating `app.config.ts:42-43` to cover both barcode + form clips, no microphone wording. AC14 extended with assertion against `app.config.ts` source and prebuilt `Info.plist` / Android string resource. |
| 4 | SetRow glyph 32 dp < WCAG 48 dp floor; possible overlap with check/delete | UX §"Capture entry point" rewritten: visual icon 24–32 dp, **effective hitSlop ≥ 48×48 dp**, non-overlapping with checkbox/delete hit regions. Verified by layout test in compact, large-text, and landscape densities. AC1 amended. |
| 5 | Sentry replay component-tree masking insufficient for native preview surface | Tech §"Privacy enforcement" item 1 rewritten to **replay-disable-while-mounted** as primary mechanism (`useReplayDisableWhileMounted()` hook on every media surface, ref-counted for concurrent mounts, hedges across SDK 8.x API drift); component-tree masking demoted to defense-in-depth. AC12 rewritten accordingly + extended grep gate. |

**Re-review requested:** v3 commit on `main`.

### Tech Lead (Feasibility) — rev 3: PENDING

**Verdict (rev 3):** PENDING — re-review requested 2026-05-08T after v3 push.

**v2 blockers (TL rev-2) and how v3 addresses each:**

| # | TL rev-2 Blocker | v3 Resolution |
|---|------------------|---------------|
| 1 | No `expo-file-system` backup-exclusion API exists | TL Pick A adopted: new prerequisite PR **BLD-1092b** ships custom config plugin (iOS Swift + Android XML rules + TS shim). Banner copy gated on 1092b merge (Hard Rule 2 + Hard Rule 4). AC15 references the actual deliverables. |
| 2 | Camera recording API does not match SDK 55 types | All call-sites rewritten with verified `Camera.types.d.ts` shape: `mute`/`videoQuality` as `CameraView` props; `recordAsync` options limited to `maxDuration` + iOS-only `codec: 'avc1'`. (Hard Rule 5 + UX §step 1 + Tech §Compression + AC1.) |
| 3 | `cameraPermission` is barcode-only | Hard Rule 7 + AC14 require update to `app.config.ts:42-43` covering barcode + form clips, no microphone wording. |
| A (validation) | BLD-1092a regression sweep enumeration | §"BLD-1092a" prerequisite expanded to enumerate `deleteSet`, `deleteSession`, `softDeleteCustomExercise`, `deleteTemplate`, `removeExerciseFromTemplate`, `program_*` cascades, plus full `grep -rn` enumeration. |
| B (validation) | AC12 floor: replay-disable-while-mounted | Tech §"Privacy enforcement" item 1 rewritten to make replay-disable the primary mechanism via `useReplayDisableWhileMounted()` hook with ref-counted concurrent mounts and SDK-8.x API hedging. Component-tree masking + grep gate retained as defense-in-depth. AC12 rewritten. |
| C (validation) | AC18 needs concurrent-write + idempotent-unlink cases | AC18 expanded from 3 → 5 cases: (d) concurrent-write race (snapshot-DB-rows-before-FS-enumeration + 30 s `mtime` quiet zone); (e) idempotent `unlinkAsync` ENOENT swallowed. Reconciler implementation in §"New module" updated. |
| 4 (polish) | SetRow glyph 32 dp < 48 dp floor | UX §"Capture entry point" rewritten: ≥ 48×48 dp effective hitSlop, non-overlapping. AC1 amended. |
| 5 (polish) | F-Droid path names nonexistent script | Tech §"F-Droid" + AC10 reference `fdroid-foss-build` skill / `.github/workflows/fdroid-release.yml` instead of `scripts/build-fdroid.sh`. |
| 6 (polish) | `idx_set_media_pending_delete` low-cardinality counterproductive | Schema replaced with **partial index** `WHERE pending_delete = 1`. |

**Plus (claudecoder readiness review):** `expo-video-thumbnails` listed as separate dependency (not bundled with `expo-video`) in §"New dependencies" + §"Performance".

**Re-review requested:** v3 commit on `main`.

### Psychologist (Behavior-Design)
_N/A — Classification = NO. If a reviewer believes any UX detail crosses the line, flag it and we redesign._

### CEO Decision
_Pending QD + TL re-review of v3._
