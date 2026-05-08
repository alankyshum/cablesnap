# Feature Plan: Local-only Form Check Videos

**Issue**: BLD-1092  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT → IN_REVIEW

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

- [x] **NO** — purely informational/functional. The feature is a self-coaching aid: capture, view, delete. There are no streaks, no rewards, no notifications, no leaderboards, no progress badges, no re-engagement prompts. Comparison-of-clips view (§Solution) is informational (own data side-by-side), not a motivational visualization. Psychologist review **N/A**.

If a reviewer believes any UX detail crosses into behavior-shaping (e.g. "PR clip" auto-tagging that reads like reward), call it out and we redesign before implementation.

## User Stories
- **Solo home-gym lifter:** "As a lifter without a coach, I want to record a 10-second clip of my heaviest set so I can re-watch the bar path after my workout, without worrying the video will sync to a cloud."
- **Long-term form tracker:** "As a lifter who's been training 2+ years, I want to compare today's squat clip with one from 3 months ago, so I can see whether my depth has improved."
- **Privacy-conscious user:** "As an open-source-app user, I want a guarantee in the UI that my videos stay on this device — no upload, no telemetry, no opt-out needed."
- **Storage-aware user:** "As someone with limited phone storage, I want to see how much space my clips are using and prune old ones easily."

## Proposed Solution

### Overview
Each completed working set may have **at most one short video clip** attached (≤ 15 s, ≤ ~20 MB after compression). Clips are stored in `${FileSystem.documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4` — inside the app's sandbox so they're auto-removed on uninstall. A new `set_media` table tracks the relationship. A "Form Library" sub-screen on the exercise detail drawer lets the user browse all clips for that exercise across time, two-up.

**Hard rules — non-negotiable, enforced in code AND copy:**
1. Clips never enter any network call. The clip path is excluded from CSV export, sync (none today, but defensive), Sentry attachments, and crash dumps.
2. The capture sheet shows a one-line privacy banner: "Saved on this device only — never uploaded."
3. Uninstalling the app removes all clips (sandbox guarantee on iOS + Android — verify in QA).
4. Sharing ("Send to coach") is **out of scope v1**. If the user wants to share, they use the OS share sheet on the exported file via expo-sharing — explicit, manual, one clip at a time. v1 ships **without** this affordance to preserve the privacy-first promise as the default.

### UX Design

**Capture flow** (during a workout, on a completed set):
1. SetRow gains a small "🎥 form" affordance in the existing kebab menu (alongside notes, swap, delete). Not a primary chip — must not crowd the row.
2. Tap → `FormVideoSheet` (full-screen modal) opens expo-camera in video mode, defaulting to back camera, 720p, max 15 s, with a visible countdown.
3. After capture, single-screen review: play / re-record / save / cancel. No filters, no editing.
4. Save: compress (target ≤ 20 MB; if larger, re-encode at 720p / 30 fps using expo's ImageManipulator-equivalent for video — see Open Question 2), write to sandbox, INSERT into `set_media`.
5. Once saved, the SetRow shows a small ▶ glyph indicating a clip exists.

**Review flow** (during or after a session):
1. Tap the ▶ on a SetRow → bottom-sheet player with the clip + meta (date, weight, reps, RPE).
2. From the exercise detail drawer (existing `ExerciseDetailDrawer.tsx`), a new "Form Library" tab lists all clips for that exercise reverse-chronologically as thumbnails.
3. Long-press two thumbnails → side-by-side compare view (1×1 vertical split, each clip plays independently with its own play/pause).

**Settings → Storage**:
- New row "Form clips: 142 MB across 38 clips" with "Manage" button → list view sortable by exercise / date / size, multi-select delete.

**Empty / error states:**
- No clips yet on Form Library tab: friendly empty state, no nag copy.
- Permission denied: clear explanation + deep-link to OS settings.
- Out of storage on save: surface the OS error verbatim with a "free space and retry" CTA. Do not auto-delete user data.

**Accessibility:**
- All controls have `accessibilityLabel` and `accessibilityRole`.
- The play button announces clip duration and recording date.
- Compare view supports VoiceOver/TalkBack focus order: clip 1 controls → clip 2 controls.
- High-contrast: thumbnail border respects theme.

### Technical Approach

**New schema** (Drizzle migration):
```ts
export const setMedia = sqliteTable("set_media", {
  id: text("id").primaryKey(),                 // ULID
  set_id: text("set_id").notNull(),            // FK -> workout_sets.id
  exercise_id: text("exercise_id").notNull(), // denormalized for fast Form Library queries
  kind: text("kind").default("video"),         // future-proof: "video" | "photo"
  rel_path: text("rel_path").notNull(),        // relative to documentDirectory (e.g. "form-clips/<exercise>/<id>.mp4")
  duration_ms: integer("duration_ms"),
  size_bytes: integer("size_bytes"),
  width: integer("width"),
  height: integer("height"),
  created_at: integer("created_at").notNull(),
}, (t) => [
  index("idx_set_media_set").on(t.set_id),
  index("idx_set_media_exercise_created").on(t.exercise_id, t.created_at),
]);
```
Store `rel_path` (not absolute) so OS-level documentDirectory churn (rare, but real on iOS app updates) doesn't orphan rows.

**New module** `lib/media/form-clips.ts`:
- `recordClip(setId, exerciseId)` → opens camera, returns `SetMediaRow`.
- `getClipsForExercise(exerciseId)` → reverse-chron list.
- `deleteClip(id)` → DB row + filesystem delete in a single try/catch with rollback.
- `getStorageStats()` → total bytes + clip count.
- All functions strictly synchronous-with-DB, async only for FS / camera.

**New dependency**: `expo-video` (≥ 2.x for SDK 55) for playback. Capture uses existing `expo-camera`. Compression: investigate expo-camera's native recording quality presets (`'480p' | '720p' | '1080p' | '4:3'`) — likely sufficient without post-processing; if not, defer to v2.

**Privacy enforcement (must be tested):**
- Add `set_media.rel_path` to the explicit deny-list in `lib/db/csv-export.ts` (no clip paths in CSV).
- Search Sentry initialization for any auto-attach hooks; ensure FS attachments are off.
- Add a unit test that grep's the codebase for `rel_path` usages and asserts they only appear in `lib/media/*` and in DB internals.

**Performance:**
- Form Library tab paginates 20 thumbnails at a time (FlashList).
- Thumbnails are generated **lazily** on first view and cached at `form-clips/<exercise_id>/.thumbs/<clip_id>.jpg` (256 px).
- Player uses on-demand load — no pre-warming.

**Storage budget:**
- 38 working sets/week × 1 clip each × 10 MB avg ≈ 1.5 GB/year worst case for a power user. We surface this in Settings; we do not auto-delete.

### Scope
**In v1:**
- Capture, save, view, delete (single + bulk).
- Form Library per exercise.
- Side-by-side compare (2 clips).
- Storage settings panel.
- Privacy banner + hardcoded no-network promise.

**Out of v1:**
- Photo support (schema is ready; UI deferred).
- Drawing / annotation overlays.
- Bar-path overlay / ML pose detection.
- Cross-device sync of clips (would break the privacy promise).
- "Share to coach" affordance (defer until we have a privacy-preserving design).
- More than 1 clip per set (out v1; future extension via the same table).

## Acceptance Criteria
- [ ] AC1: Given a completed working set When the user opens the kebab → "🎥 Add form clip" Then the camera opens in video mode and records up to 15 s. Saving creates one `set_media` row and one file under `form-clips/<exercise_id>/`.
- [ ] AC2: Given a set with an attached clip When the user taps the ▶ glyph on the SetRow Then a bottom-sheet player plays the clip without any network request (verify via test that mocks fetch and asserts zero calls).
- [ ] AC3: Given an exercise with ≥ 2 clips When the user opens the Form Library tab in ExerciseDetailDrawer Then thumbnails render reverse-chronologically with date+weight overlay.
- [ ] AC4: Given two clips selected (long-press on each) When the user taps "Compare" Then a 1×1 vertical split view loads both clips with independent play/pause controls.
- [ ] AC5: Given any clip exists When the user invokes CSV export Then the exported file contains zero references to `set_media` rows or clip paths (regression test required).
- [ ] AC6: Given a clip exists When the user uninstalls and reinstalls the app on iOS / Android Then the clip is gone (sandbox enforcement; manually verified by QD on physical device).
- [ ] AC7: Given the user denies camera permission When the FormVideoSheet opens Then a non-blocking dialog explains why and offers a deep-link to OS settings; no clip is created.
- [ ] AC8: Given storage usage of N clips When the user opens Settings → Storage Then total MB and per-exercise breakdown match `du -sh` of the form-clips directory ± 1 MB.
- [ ] AC9: PR passes typecheck (`npm run typecheck`), all tests, no new lint warnings.
- [ ] AC10: Bundle size delta ≤ 5 MB (expo-video native frameworks are the only addition; verify in QD report).
- [ ] AC11: All clip files include `NSFileProtectionCompleteUntilFirstUserAuthentication` (or platform equivalent) — clips are not accessible to other apps.

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Clip recording interrupted (call, app backgrounded mid-record) | Discard in-progress capture; surface a one-line toast; no DB row created. |
| User deletes the parent set | Cascade-delete `set_media` rows + files. Add ON DELETE CASCADE in migration; integration test required. |
| User deletes the parent session | Cascade through workout_sets → set_media (existing cascade chain extended). |
| User deletes the parent exercise | Soft-delete: clips remain queryable via "Orphaned clips" in Storage Settings; user purges manually. (Avoids data loss on accidental exercise reorg.) |
| Filesystem reports clip missing but DB row exists | Mark row `rel_path` as missing; render placeholder thumbnail with "Clip file missing — remove?" action. Do not crash. |
| User exceeds device storage during save | Show OS error verbatim; do NOT delete other clips. |
| Side-by-side compare with portrait + landscape clips | Letterbox each independently inside its half-pane; do not stretch. |
| RTL locale | Compare view splits left/right invariant of writing direction (vertical split, no inversion). |
| Tablet / large screen | Form Library uses 3-column grid; compare can use horizontal split if width > 600 dp. |
| Light / dark theme | Thumbnails use theme-appropriate placeholder + chrome. |
| Locked-screen recording attempt | Use OS guard via expo-camera; if blocked, show clear "unlock to record" copy. |
| Existing CSV import containing `set_media` columns | Ignore — current CSV format does not include media; importing legacy data must not create stub rows. |
| Web build target (Vercel preview) | Camera unavailable → hide entry-points entirely; Form Library renders thumbnails read-only if any clips were transferred via export; for v1 web is read-only, capture is hidden. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-video SDK 55 immaturity / playback bugs | Medium | High (breaks core flow) | Spike: build throwaway prototype before committing the plan to implementation; if blocked, fall back to react-native-video. |
| Storage explosion → user complaints | Medium | Medium | Settings panel with stats + bulk delete shipped in v1, not deferred. |
| Privacy regression (someone wires media to Sentry attachments) | Low | Critical (kills the entire value proposition) | Code-search lint rule + integration test; documented in `lib/media/README.md`. |
| Bundle size grows past F-Droid expectations | Medium | Medium | Verify F-Droid build still completes; gate the feature behind a build flag if size delta > 5 MB. |
| Battery / CPU during recording | Low | Medium | Use expo-camera defaults; cap duration at 15 s; do not chain encoding on UI thread. |
| Cascade delete bug orphans GBs of files | Low | High | Drizzle migration adds explicit ON DELETE CASCADE on `set_media.set_id`; QD must verify after a session deletion. |
| iOS Photos / Android Gallery accidentally indexes our sandbox | Low | High (privacy promise broken) | Verify sandbox is NOT shared with media stores (don't use `MediaLibrary`; we use plain documentDirectory). Document in QD checklist. |
| Permission denial spirals (user denied → can't recover) | Low | Low | Deep-link to OS settings; never block the rest of the app. |

## Open Questions for Reviewers
1. **Tech Lead:** Is `expo-video` mature enough on SDK 55? Is the spike worth gating Phase 4 on?
2. **Tech Lead:** Should compression be a v1 concern, or do we ship at 720p raw and add re-encode in v2?
3. **QD:** Should the Form Library tab live inside `ExerciseDetailDrawer.tsx`, or is a dedicated route better for discoverability?
4. **QD:** What's the right default thumbnail (first frame? middle frame? user-chosen)?
5. **QD:** Is the "🎥" emoji in the kebab acceptable in our icon system, or should we use an MCI icon to match `note-text-outline`, `swap-horizontal`, etc.? (probably the latter.)
6. **QD:** Should we offer an explicit "Export this clip" affordance in v1 via expo-sharing, or keep the privacy promise tighter by hiding it entirely until we design a guarded share flow?
7. **CEO/QD:** Should video capture be gated on a one-time consent dialog ("This stays on your device — got it") to align with our open-source/privacy-first identity, or is the inline banner enough?

## Review Feedback

### Quality Director (UX)
**Verdict: REQUEST CHANGES**

The concept is strong and aligned with CableSnap's offline-first, privacy-first identity, but the plan is not implementation-ready until the privacy/data-integrity and interaction risks below are resolved.

**Blockers before implementation:**
1. **"Never uploaded" is not yet true enough.** Storing clips under `FileSystem.documentDirectory` can still place them in OS/device backup flows unless explicitly excluded. The plan must require iOS `NSURLIsExcludedFromBackupKey`/Expo equivalent for clips and thumbnails, Android Auto Backup exclusion/manifest review, and copy should say "CableSnap never uploads this" unless the OS-backup behavior is fully blocked and verified.
2. **No-audio capture must be explicit.** Form checks do not need microphone audio; recording audio increases permission friction and privacy blast radius. v1 should capture video-only or strip audio before save, with tests/QA confirming no audio track is persisted.
3. **Long-press-to-compare is not discoverable or accessible enough.** Keep thumbnails simple, but add an explicit "Select" / "Compare" mode affordance, visible selection state, and screen-reader-accessible controls. Long press may remain as a shortcut, not the only path.
4. **File deletion cannot rely on DB cascade alone.** SQLite can delete rows, not sandbox files. The plan needs a concrete service-layer deletion path for set/session deletion plus an orphan cleanup/reconciliation check for files and thumbnails. Avoid promising rollback around filesystem deletes; instead define ordering and recovery behavior.
5. **Network/privacy enforcement test is too narrow.** A grep for `rel_path` is insufficient. Add a stronger privacy boundary: all clip and thumbnail paths stay behind `lib/media/*`, CSV/export/import/sync/Sentry tests assert no media path bytes are emitted, and network mocks cover `fetch`, `XMLHttpRequest`, and any app network helper.

**QD calls on open questions:**
- Q3: Put Form Library in `ExerciseDetailDrawer` for context, but add a visible "Form clips" entry/tab with count; do not hide review entirely behind set rows.
- Q4: Use middle-frame thumbnail by default; fall back to first frame if thumbnail generation fails. Do not add user-chosen thumbnails in v1.
- Q5: Use a MaterialCommunityIcons video/camera icon and text label, not emoji, to match the existing icon system and accessibility labels.
- Q6: No export/share affordance in v1. Preserve the privacy default; design a guarded share flow separately if needed later.
- Q7: Use an inline privacy banner plus first-save confirmation only if the copy is short and non-blocking. Do not add an onboarding-style consent wall.

**Non-blocking UX refinements:**
- The kebab-menu capture entry is acceptable only because set rows are already crowded; discoverability should be balanced by showing the saved-clip glyph and the Exercise Detail "Form clips" count.
- Web v1 should hide capture and show a clear unsupported/read-only empty state. The "clips transferred via export" path conflicts with the no-export v1 stance and should be removed or deferred.
- Permission-denied copy should avoid guilt or motivation language; keep it functional: "Camera access is needed to record a form clip. CableSnap stores clips on this device."

### Tech Lead (Feasibility)
**Verdict: REQUEST CHANGES**

The architectural shape is sound (sandbox files + denormalized `set_media` table + dedicated `lib/media/*` module), but four feasibility blockers and several spec gaps must be fixed in the plan before claudecoder picks this up. I second every QD blocker; the ones below are **additional** technical objections.

**Blockers (technical):**

1. **Sentry Mobile Replay is the actual privacy hole — and the fix is concrete code, not a one-liner AC.** `app/_layout.tsx:37-50` initializes `Sentry.mobileReplayIntegration()` with `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1`. That ships rendered screen frames to `o4511267124215808.ingest.us.sentry.io`. `mobileReplayIntegration` defaults mask text but **does not mask `<Image>`/`<Video>`/`expo-camera` previews unless `maskAllImages: true` is set** — and even then `expo-camera` and any custom view are not native `Image` components and may render through. Plan must:
   - Set `mobileReplayIntegration({ maskAllImages: true, maskAllVectors: true })` globally (one-time fix, ~5 LOC).
   - Wrap every clip surface (`FormVideoSheet`, bottom-sheet player, Form Library thumbnails, compare view) in `<Sentry.Mask>` (or pass `sentry-mask` testID; verify the SDK API for SDK 8.x).
   - Add an integration test that mounts each surface and asserts its rendered tree does not contain an unmasked native `Image`/`Video` node.
   - Add a build-time grep gate: "if `lib/media/*` ships, then `mobileReplayIntegration` config object must contain `maskAllImages: true`" — fails the build otherwise. Cheaper than relying on humans.
   This deserves its own AC (e.g., AC12 below) and should not be folded into AC2's `fetch` mock.

2. **Compression strategy as written is impossible.** Plan §"Save" says: "if larger, re-encode at 720p / 30 fps using expo's ImageManipulator-equivalent for video — see Open Question 2". **There is no such thing.** `expo-image-manipulator` does not handle video. The only realistic post-capture transcoders in Expo land are `react-native-ffmpeg-kit` / `react-native-video-processing` — both are large native deps, GPL/LGPL-tinged, and a real F-Droid headache. Decision required in the plan, not deferred:
   - **Pick A (recommended for v1):** Cap capture at 720p via `CameraView.recordAsync({ maxDuration: 15, codec: 'H264' })` and the existing `quality` prop, accept the resulting size (typically 4–10 MB / 15 s), and document that `size_bytes` is informational only. Drop the "if larger, re-encode" branch entirely.
   - **Pick B:** Cap at 480p for storage savings; visual quality acceptable for form review. Mention as a setting later.
   - **Do NOT** ship plan B-with-ffmpeg — it doubles bundle size, introduces F-Droid licensing risk, and is too much for v1.
   Plan must commit to A or B and remove the "compress to ≤ 20 MB" target (or reframe it as a *display warning* threshold, not a transcoding requirement). AC must be revised accordingly.

3. **`ON DELETE CASCADE` is a no-op on this codebase right now.** `lib/db/helpers.ts:42-55` opens the main DB connection and sets `PRAGMA journal_mode = WAL` but **never sets `PRAGMA foreign_keys = ON`**. SQLite defaults to OFF. The only place that pragma is enabled is `lib/db/import-export.ts:530` (CSV import path). That means:
   - Drizzle's `references(() => workoutSets.id, { onDelete: "cascade" })` is silently a no-op for runtime app deletes today.
   - `workoutSets` itself has zero FKs (I verified `lib/db/schema.ts:95-133`). Adding a single FK from `set_media` while leaving the rest unenforced is fine in isolation, but only IF the pragma is on.
   Plan must add an explicit task: enable `PRAGMA foreign_keys = ON` in `lib/db/helpers.ts` immediately after the journal-mode pragma, with a regression test that asserts the pragma value at runtime. Do this in a **separate commit** (it changes the behavior of every existing nullable FK column across the schema — there could be latent bugs where dangling rows currently survive deletes; QA must regression-test the full delete-session/delete-set/delete-exercise paths). Without this commit, item #4 below cannot be solved at the DB layer.

4. **Filesystem deletion ≠ DB deletion ≠ atomic.** I agree with QD: "single try/catch with rollback" is wishful thinking. SQLite + `expo-file-system` are not transactional together. Required design:
   - Order: **DB row first, then file**. If the row delete commits and the file unlink fails, the orphan is a tombstone the reconciler can clean up. If you delete the file first and the DB row delete fails, you have a 404 row that crashes the player.
   - Add a `pending_delete` column (or a tombstone table) — every clip with `pending_delete = 1` is hidden from the UI and reconciled on app start.
   - Add `reconcileOrphans()` to `lib/media/form-clips.ts`: on app boot (or first Form Library open), scan `form-clips/` and the DB and resolve mismatches both directions.
   - Tests: DB-row-missing/file-present (orphan file → reconciler unlinks), DB-row-present/file-missing (placeholder thumbnail + "remove?" CTA), parent-set-deleted-but-clip-survives (cascade misfire).

**High-priority spec gaps (must be fixed in plan, not implementation):**

5. **`expo-video` SDK 55 maturity (Open Q1):** No spike needed. expo-video has been stable since SDK 52 and is the official replacement for the deprecated `expo-av` Video component. SDK 55.0.x is fine; we already have `expo-camera ~55.0.15` in `package.json` so the toolchain is consistent. Recommendation: **drop the spike** and proceed. If a playback bug surfaces later, fall back to `react-native-video` is a 1-day swap. Update plan §Risk Assessment accordingly.

6. **Capture entry point doesn't exist (QD blocker #2 mirrored):** I verified `components/session/SetRow.tsx` has no kebab — the row uses swipe + long-press for delete and accessibility actions. Plan's "kebab menu (alongside notes, swap, delete)" is fiction. Either:
   - Add an explicit set-level affordance design (e.g., a small inline `▶/+` glyph at row right edge for completed sets only, ~32 dp hit-target with hitSlop), with a separate UX subticket for QD/UX-designer to approve, **or**
   - Defer the entry-point UX to a real design iteration before implementation. Either way, "kebab" must be removed from the plan.

7. **No-audio capture (QD blocker #2):** Concrete tech: `expo-camera`'s `CameraView.recordAsync({ mute: true })` exists in v15+. Verify on `expo-camera ~55.0.15` and add an AC: "Saved clip files contain zero audio tracks (verify via `ffprobe` in QA, or via an in-app metadata check on save)." Also: do **not** request `MICROPHONE` permission. Only request `CAMERA`. Update `app.config.ts` permissions list accordingly and add an AC checking the manifest.

8. **iOS/Android backup exclusion (QD blocker #1):** `expo-file-system` exposes `setBackupBehaviorAsync` (or the equivalent `excludeFromBackup` flag depending on minor version). Spec: every file written to `form-clips/` must be flagged excluded **immediately after `writeAsStringAsync`/move**, before the DB row is INSERTed (so a crash mid-save can't leak a backed-up orphan). On Android, add `<no-backup>` rule via `android/app/src/main/res/xml/data_extraction_rules.xml` (or equivalent in `app.config.ts` plugin) to exclude `form-clips/` from Auto Backup. Add a unit test that reads the FS attribute and asserts the file is excluded. Without this, the privacy banner copy is false.

9. **`set_media.kind` default of `"video"` is wrong for v1.** With photo support out of scope, the column should be `text("kind").notNull()` with NO default — every INSERT must explicitly state `"video"`. Defaulting risks silent stub rows from other code paths.

10. **One-clip-per-set invariant must be enforced at the schema level.** Plan says "at most one short video clip" but `set_media.set_id` has only an index, not a unique constraint. Add `unique("uq_set_media_set_id").on(t.set_id)` (or use `set_id` as the primary key with an additional `id` ULID column for auditability). This also makes the future "more than 1 clip per set" extension explicit (drop the unique constraint then).

11. **Privacy enforcement test scope (QD blocker #5 reinforced):**
    - A grep for `rel_path` is too narrow. Use **module-boundary enforcement**: ESLint `no-restricted-imports` or `eslint-plugin-boundaries` to forbid `lib/media/*` from being imported by `lib/sync*`, `lib/db/csv-export.ts`, `lib/db/import-export.ts`, anything under `app/api/` (if Vercel functions exist), and any Sentry shim.
    - Add network-mock test using `nock` or jest's `global.fetch = jest.fn()` PLUS `global.XMLHttpRequest = MockXHR` PLUS WebSocket — assert zero requests with any URL containing `form-clips/` or `.mp4` during the full capture→view→delete flow.
    - Snapshot test on `csv-export` output asserting no `set_media` columns / no `rel_path` substrings.

12. **Bundle-size delta on F-Droid (Open Q5):** `expo-video` adds ExoPlayer (~1.5–2 MB AAB on Android, similar on iOS via AVKit which is already in the platform). `expo-camera` is already shipping. Ballpark delta: **~2–3 MB AAB / ~1 MB IPA**. Well under AC10's 5 MB ceiling. F-Droid risk: ExoPlayer is Apache-2.0, FOSS-clean, no concern. Plan can keep AC10 but tighten the verification: "F-Droid build under `scripts/build-fdroid.sh` (or whatever exists) completes successfully and the resulting APK size delta is reported in the QD merge comment."

13. **Web target (Open Q6 + plan §Edge Cases): contradiction must be removed.** Plan currently says "Form Library renders thumbnails read-only if any clips were transferred via export" — but v1 has **no export mechanism** (out-of-scope). Strip that sentence. Web should fully hide capture surfaces *and* the Form Library tab. `Platform.OS === 'web'` early-return at the entry-point and at `getClipsForExercise` (return `[]`). Add an AC.

14. **`rel_path` durability (good as written, one tweak):** Storing relative paths is correct — iOS sandbox UUID changes after restore-from-backup are real. But the plan should also commit to a stable directory layout that survives schema migrations. Pin: `${documentDirectory}form-clips/<exercise_id>/<clip_id>.mp4` and `${documentDirectory}form-clips/<exercise_id>/.thumbs/<clip_id>.jpg`. Document in `lib/media/README.md` that these paths are part of the public migration contract.

15. **Performance/threading:** Plan says "do not chain encoding on UI thread." Since we're dropping post-capture transcoding (per blocker #2), this risk is moot. Drop from plan. The remaining perf concern is thumbnail generation on first Form Library view: do this off-thread via `expo-video`'s `generateThumbnailsAsync` (or equivalent) and queue thumbnails sequentially — never parallel-N — to avoid ANRs on low-end Android.

**New Acceptance Criteria to add (renumber as appropriate):**
- AC12: Sentry Mobile Replay payloads contain zero pixels from `FormVideoSheet`, the bottom-sheet player, Form Library thumbnails, and the compare view. Verified by (a) `mobileReplayIntegration({ maskAllImages: true })` configured, (b) `<Sentry.Mask>` wrappers present on every media surface (asserted by component tests), (c) build-time grep gate.
- AC13: `PRAGMA foreign_keys = ON` is set on every `getDatabase()` connection (asserted by a runtime test). Cascade chain `workout_sessions → workout_sets → set_media` is verified by an integration test that creates a session/set/clip, deletes the session, and asserts both the row and the file are gone after `reconcileOrphans()` runs.
- AC14: No microphone permission is requested. Saved clip files contain no audio track (verified via metadata read on save, or by `ffprobe` in QA).
- AC15: All clip + thumbnail files are excluded from iOS backup (`NSURLIsExcludedFromBackupKey == 1`) and from Android Auto Backup (manifest rule present).
- AC16: Web build hides every Form-Clips entry point; `getClipsForExercise` returns `[]` on `Platform.OS === 'web'`.

**Approval condition:** When the plan is updated to remove the kebab fiction, drop the impossible compression branch (commit to Pick A or B), add the four QD blockers + my 1–4, add AC12–AC16, and confirm the FK-pragma prerequisite is its own commit, I will re-review and approve. Estimated: 1 plan-author iteration + ~30 min re-review.

**Open-Question answers from Tech Lead:**
- Q1 (expo-video maturity): **No spike needed.** Stable on SDK 55. Drop the spike from §Risk Assessment.
- Q2 (compression v1): **Ship 720p raw.** Do not add ffmpeg in v1. Defer compression entirely to v2 (or never — clip storage panel + bulk delete is sufficient).
- Q5 (F-Droid bundle): **~2–3 MB AAB delta**, FOSS-clean, no F-Droid blocker. Verify in QD merge.
- Q7 (one-time consent dialog): **Inline banner is enough.** Adding a consent wall is anti-fluent-UX (goal §1). Stick with inline copy + the saved-clip glyph.

### Psychologist (Behavior-Design)
_N/A — Classification = NO. If a reviewer believes any UX detail crosses the line, flag it and we redesign._

### CEO Decision
_Pending all three reviewer verdicts._
