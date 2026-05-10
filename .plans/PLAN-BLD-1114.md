# Feature Plan: Setup Snapshot — per-set setup photo + numeric pulley pin

**Issue**: BLD-1114  **Author**: CEO  **Date**: 2026-05-09
**Status**: APPROVED (rev 2, 2026-05-09) — QD ✅ + Tech Lead ✅ + Psychologist N/A
**Parent product-evolution issue**: BLD-1113

## Revision History
- **rev 1** (2026-05-09 12:13): initial draft.
- **rev 2** (2026-05-09 12:55): incorporates QD blockers 1–5 and TL blockers A–H + TL-Q1–4 answers. Major changes: table name fix (`workout_sets`), drop DB CHECK in favour of service-layer validation, per-capture UUID filenames for setup photos, kind-aware index swap + audit of every `set_media` read site, visible glyph (no long-press), skip `expo-image-manipulator` in v1, module split, `with-form-clips-backup.js` plugin extension, v1 storage-usage UI, row-density acceptance criterion, CSV/JSON export of `pulley_pin` by default. **Open questions all resolved.**

## Research Source
- **Origin**: Reddit + 2026 app-comparison guides (web_search 2026-05-09).
  - Best-of-2026 guides (RepCount, Gainz-Pro, JEFIT-blog) and r/bodyweightfitness threads consistently surface the same cable/home-gym pain.
- **Pain point observed (paraphrased from threads / aggregated guides)**:
  > "I can't remember the exact pulley height I used last week — was it pin 4 or pin 5? My triceps pushdown progress chart is muddy because I keep accidentally training a different setup."
  > "I wish I could attach a photo of my setup to a set so next time I just pull it up and recreate it."
- **Frequency**: Recurring across multiple subreddits and across multiple apps (Strong, Hevy, JEFIT, FitNotes). Top-tier "wishlist" item in 2026 comparison roundups.
- **CableSnap fit**:
  1. Brand identity literally references cable machines.
  2. We already ship coarse mount-position chips (BLD-771) and Form Clips infrastructure (BLD-1105) — both extended cheaply rather than rebuilt.
  3. Privacy-first / offline-first / open-source advantages over Strong+Hevy: photos never leave the device.

## Problem Statement

Cable lifters routinely train the same nominal exercise with subtly different setups across sessions:
- Pulley pin notch (cable machines have 10–20 numbered positions).
- Seat / bench height for seated rows.
- D-handle vs rope grip (already covered by BLD-771 attachment chip — keep).
- Stance distance, foot position, body angle.

Without a way to capture and recall those details:
1. **Inconsistent loading.** User picks a heavier weight than last time because they shifted to a more leveraged setup. Progress chart misleads.
2. **Wasted time at the rack.** User spends 30–60s every set guessing-and-checking.
3. **Form drift.** User can't compare today's setup to a past PR setup → harder to debug "why does this feel weird today".

CableSnap's existing `mount_position` chip (high/mid/low/floor) is too coarse to fix #1 and doesn't help with #2/#3 at all.

## Behavior-Design Classification (MANDATORY)

- [x] **NO** — purely informational / functional. Users decide what to log, when to log, and what setup to use. No streaks, no notifications, no rewards, no nudges, no social, no progression mechanics tied to capture rate. Capture is **opt-in per set** and silent if skipped. The first-set tooltip from rev 1 is **dropped** in rev 2 in favour of a visible glyph (per TL §G), removing the only borderline behavior-shaping element.
- [ ] YES

If during review the scope drifts toward "remind users to snap setup photos to maintain a streak" or any motivational copy, **flip Classification to YES** and require fresh psychologist review per §3.2.

## User Stories

- As a cable-machine lifter, I want to record the **pulley pin number** I used on a set, so my next session at the same exercise can pre-fill it and I can re-rack at the right height in <5s.
- As a home-gym lifter, I want to **snap a quick photo of my setup** on the first working set, so I can glance at it next session and recreate the exact configuration.
- As a data-driven lifter, I want **progress charts and PR detection to optionally segment by pulley pin** (data captured in v1; segmentation UI follow-up).
- As a privacy-conscious lifter, I want all setup photos to stay **on-device** and to be **excluded from cloud backup by default**, like Form Clips already are.

## Proposed Solution

### Overview

Two complementary, opt-in, per-set capture surfaces on the existing SetRow:

1. **Pulley Pin chip** — numeric chip (1–N) appearing only on cable-equipment exercises, inline with existing attachment / mount-position chips from BLD-771. Tap → bottom sheet 1×N grid (default N=12).
2. **Setup Photo** — a **visible second camera glyph (`camera-plus`)** appearing on cable rows next to the existing form-clip video glyph. Tap → opens system camera, returns one still JPEG, stored in `set_media` with `kind='setup_photo'`.

Both surface in the next session via the existing "Last session" autofill row.

### UX Design

#### Pulley Pin chip
- **Render gate**: `isCableExercise(exercise)` (existing helper from `lib/cable-variant.ts`) AND user has `pulley_pin_tracking_enabled = TRUE` in `app_settings` (default TRUE).
- **Visual**: small chip after attachment chip, label `Pin —` when empty, `Pin 6` when set. No badge / glow / colour — matches BLD-771 chip styling.
- **Picker**: bottom sheet, 1×N numeric grid. N defaults to 12; per-exercise `max_pulley_pins` overrides. Long-press the picker title → "Set max pins for this exercise" input (1–30, validated).
- **A11y**: each pin button is min 44×44 dp; `accessibilityLabel="Pulley pin {n}"`, `accessibilityState={{ selected: pin===n }}`. Chip has `accessibilityValue={{ text: pin ? "Pin "+pin : "Pulley pin not set" }}`. RTL: grid mirrors via `writingDirection: 'auto'` + `flexDirection` parity with existing pickers.

#### Setup Photo (rev 2: VISIBLE GLYPH, no long-press)
- **Entry point**: a **`camera-plus` icon** (Material Community Icons) renders on the SetRow **next to the existing video-camera glyph**, only when `isCableExercise(exercise)` AND the set is completed (parity with form-clip glyph render gate at `components/session/SetRow.tsx:495-516`). Single tap opens the capture flow.
  - Resolves TL §G + QD §4: visible affordance, no a11y custom-action needed, no discoverability tooltip needed → no behavior-shaping concern.
  - Visual budget: a 24-dp icon adds ~28dp width; row footer already merges variant + RPE in <96dp envelope. **Tested in `__tests__/components/SetRow-cable-row-density.test.tsx`** (new) at 360 dp landscape and 320 dp narrow phones: must not wrap.
- **Capture flow**:
  1. Open `expo-camera` `CameraView` modal.
  2. `takePictureAsync({ quality: 0.6, base64: false })` — produces ~300–800 KB JPEG (typical iPhone 12+/Pixel 6+).
  3. **Skip `expo-image-manipulator` in v1** (per TL §H + TL-Q3): one less dependency activation, no Android low-RAM OOM path. Document in plan; reconsider in follow-up if storage complaints arrive.
  4. Move file to `<documentDirectory>/set-media/setup-<photoId>.jpg` where `photoId = uuid()` — **never `setId`-keyed** (per QD §1 + TL §C).
  5. Set `NSURLIsExcludedFromBackupKey` (existing primitive in `lib/media/set-media-common.ts` after split).
  6. Insert `set_media` row inside `withTransaction`, after the file persists (per existing form-clip split-then-insert pattern, BLD-1105).
- **Display**: 24×24 thumbnail next to the pin chip when present. Tap → full-screen viewer with pinch-zoom + delete affordance + dismiss labelled "Close". No edit / no draw / no markup in v1.
- **Replacement** (the QD §1 + TL §C bug): each new capture writes a brand-new UUID file, atomically inserts the replacement row in the same transaction as marking the old row `pending_delete=1`, then post-commit the reconciler unlinks the old file. The new file's path is **guaranteed distinct** from the old. Acceptance test: "capture → replace → file exists" (see AC §replacement).

#### Pre-fill on next session
- "Last session" row shows `7 × 50 lb @ pin 6` when pin was logged. Tapping pre-fills weight, reps, **and pin**.
- Setup photo thumbnail appears in "Last session" row at 16×16. Tap-and-hold opens full-screen preview (no commit).
- **Pre-fill suppression** (parity with BLD-771 mount-position): if exercise has been re-equipped (cable → dumbbell), pin pre-fill is suppressed. Same gate as existing mount-position pre-fill in `lib/db/session-sets.ts`.

#### Empty / error states
| State | Behavior |
|-------|----------|
| Cable exercise, no pin set yet | Pin chip says `Pin —` |
| Non-cable exercise | Pin chip not rendered; setup-photo glyph not rendered (cable-only in v1) |
| Photo capture cancelled | Silent — no toast, no state change |
| Photo file move fails (disk full) | Toast "Couldn't save setup photo — disk full?" — set itself still saves |
| Photo decode fails on display | Show neutral placeholder + "Photo unreadable" caption. Long-press → delete option |
| Last-session pin stale (exercise re-equipped) | Pre-fill suppressed via existing BLD-771 gate |
| Web / no-camera platform | Glyph hidden; `Camera.getPermissionsAsync()` returns 'undetermined' on web → render-time gate + capture-time `Camera.isAvailableAsync()` toast "Camera unavailable" |
| App killed mid-capture (file moved, DB row not inserted) | Reconciler-on-boot pass detects orphaned files >7 days old in `set-media/setup-*.jpg` and deletes (extends existing form-clip GC) |
| Crash between DB insert and old-file unlink | Old file becomes orphaned; same reconciler GC path cleans it up |

### Technical Approach

#### Data model (rev 2 corrections — TL §A, §B; QD §3)
- **`workout_sets` table** (NOT `session_sets` — the table is `workout_sets`, see `lib/db/schema.ts:111` and `lib/db/tables.ts:127`): add `pulley_pin INTEGER NULL`. **No DB CHECK constraint** (`addColumnIfMissing`'s `SAFE_SQL_FRAGMENT` at `lib/db/tables.ts:26` rejects `<>=`). Bounds enforced at:
  - Service layer in `lib/db/session-sets.ts` (write path) — throws `Error('pulley_pin must be 1..30 or null')` if out of range; returns silently if null.
  - UI layer in `PulleyPinPickerSheet` (max picker constrained to 1–30; toast on over-cap).
  - **New unit test** `__tests__/lib/db/session-sets.pulley-pin-validation.test.ts` covers null / 0 / 1 / 30 / 31 / negative / float.
- **`exercises` table**: add `max_pulley_pins INTEGER NULL DEFAULT NULL`. NULL = global default 12. No DB CHECK; same UI/service validation.
- **`set_media` table**: extend `kind` enum domain to include `'setup_photo'` (existing values stay). Replace the unique index per TL-Q1:
  ```sql
  DROP INDEX IF EXISTS uq_set_media_set_id;
  CREATE UNIQUE INDEX uq_set_media_set_id ON set_media (set_id, kind);
  ```
  Update `lib/db/schema.ts:172` to `uniqueIndex("uq_set_media_set_id").on(t.set_id, t.kind)`.
- Settings flag `pulley_pin_tracking_enabled` (BOOLEAN, default TRUE) in existing `app_settings` key-value table. **No** CHECK; type-coerced at read time.

#### Migration (rev 2 — explicit DROP first, no `IF NOT EXISTS` trap)
Single forward-only migration `add_pulley_pin_and_setup_photo` in `lib/db/migrations.ts`:
1. `await database.execAsync('ALTER TABLE exercises ADD COLUMN max_pulley_pins INTEGER')` (guarded by `addColumnIfMissing`).
2. `await database.execAsync('ALTER TABLE workout_sets ADD COLUMN pulley_pin INTEGER')` (guarded by `addColumnIfMissing`).
3. `DROP INDEX IF EXISTS uq_set_media_set_id; CREATE UNIQUE INDEX uq_set_media_set_id ON set_media (set_id, kind);` — direct `database.execAsync`, **bypassing `addColumnIfMissing`** (acceptable for migration code; called out explicitly per TL §B alternative).
4. Idempotent: re-running on an already-upgraded DB drops + recreates the index (no-op semantically) and `addColumnIfMissing` skips the ALTERs.
5. Test: `__tests__/lib/db/migration-pulley-pin-setup-photo.test.ts` (new, modelled on `migrations-renumber-backfill.test.ts` and `migration-upgrade-paths.test.ts`).

#### `set_media` read-site audit (TL §D + QD §2 — required deliverable)
Every existing `set_media` consumer must filter by `kind` after the schema change. Mandated checklist for the implementer:

| Site | File:Line | Required change |
|------|-----------|-----------------|
| `getClipForSet(setId)` | `lib/db/form-clips.ts:51` | Add `eq(setMedia.kind, 'video')` to the WHERE clause |
| `getClipsForExercise(exerciseId)` | `lib/db/form-clips.ts:62` | Same |
| `getAllSetMediaRows()` | `lib/db/form-clips.ts:84` | Document as kind-agnostic; consumers branch (only used by reconciler — leave generic) |
| `getPendingDeleteRows()` | `lib/db/form-clips.ts:90` | Returns kind-agnostic rows (sweep needs both); **caller `unlinkClipFiles` must branch on `row.kind`** |
| `unlinkClipFiles(rel_path)` | `lib/media/form-clips.ts:172-187` | Hard-codes `.mp4` regex + `form-clips/<exerciseId>/.thumbs/`. Generalise OR — **per TL-Q2 split** — give setup photos their own `unlinkSetupPhotoFiles(rel_path)` in `lib/media/setup-photos.ts`. Reconciler dispatches by `kind`. |
| `deleteSetMediaForSet(setId)` | `lib/db/form-clips.ts:109-114` | Currently kind-agnostic — KEEP kind-agnostic (cascade should sweep both kinds when set is deleted). Add comment. |
| `deleteSetMediaForSession(sessionId)` | `lib/db/form-clips.ts:122` | Same — kind-agnostic. |
| `getAllLiveMediaWithExercise()` | `lib/db/form-clips.ts:135-160` | Used by Form Library. Add `eq(setMedia.kind, 'video')` (Form Library is video-only). |
| `components/session/FormLibraryTab.tsx` reads | (entire file) | Filter to `kind='video'` (Form Library is video-only in v1). |
| Stats / analytics queries on `set_media` | `grep -r 'set_media\|setMedia' lib/ | grep -v test` | Each must be reviewed; add to PR description as audit table. |

**Acceptance: a regression test `__tests__/lib/db/set-media-kind-isolation.test.ts` proves a `setup_photo` row never appears in a video read and vice versa.**

#### Cascade-delete (TL §E)
Current state (verified rev 2):
- `set_media` has **no DB-level FK** (`lib/db/migrations.ts:287-298` and `lib/db/schema.ts:159-175`). Comment in `lib/db/helpers.ts:72` claiming "ON DELETE CASCADE on workout_sessions → workout_sets → set_media" is **aspirational**, not actual.
- `lib/db/sessions.ts:212,227,263,530` deletes `workout_sets` directly rows does **not** call `deleteSetMediaForSet` per row. `deleteSetMediaForSession(sessionId)` exists at `lib/db/form-clips.ts:122` but is invoked only on full-session delete paths. 
- For per-set delete (e.g. user removes one set from an in-progress session), `set_media` rows are orphaned today. The reconciler GC eventually cleans the files but the DB rows linger until then.

**Plan deliverable**: BLD-1114 implementer must wire per-set delete to call `deleteSetMediaForSet(setId)` (kind-agnostic, sweeps video + photo) before deleting the `workout_sets` row. Add `__tests__/lib/db/cascade-set-delete-media.test.ts` covering "delete set with both video + photo → both rows + both files removed". Generalise `unlinkClipFiles` OR add `kind`-dispatched unlink in the reconciler so `.jpg` files actually get unlinked (today they would be skipped by the `.mp4` regex).

#### Module factoring (TL-Q2 — SPLIT)
Final layout:
```
lib/media/set-media-common.ts   # NEW — ensureMediaDir, NSURLIsExcludedFromBackup, toRelPath helpers, FORM_CLIPS_DIR, SETUP_PHOTOS_DIR constants
lib/media/form-clips.ts         # KEEP — video-only; refactor to import shared primitives. NO RENAME (preserves all existing imports).
lib/media/setup-photos.ts       # NEW — captureSetupPhoto, persistSetupPhotoFileOnly, saveReplacementSetupPhoto, unlinkSetupPhotoFiles
lib/db/form-clips.ts            # MODIFY — add kind='video' filter to read sites in the audit table above
lib/db/setup-photos.ts          # NEW — symmetric kind='setup_photo' reads (getSetupPhotoForSet, getSetupPhotosForExercise)
```

Rationale per TL-Q2: `unlinkClipFiles` is `.mp4`-specific and hard-codes the thumbnail dir — generalising is more invasive than a sibling module; `form-clips.ts` is already 350+ lines; capture APIs differ (`takePictureAsync` vs `recordAsync`) and metadata shapes differ (no `duration_ms` on photos).

#### Module touch list (rev 2)
- `lib/db/schema.ts` — add columns + change `uq_set_media_set_id` to composite (~20 lines)
- `lib/db/migrations.ts` — new migration (~50 lines)
- `lib/db/session-sets.ts` — read/write `pulley_pin` + validator
- `lib/db/exercises.ts` — read/write `max_pulley_pins`
- `lib/db/form-clips.ts` — add `kind='video'` filters per audit table
- `lib/db/setup-photos.ts` — NEW
- `lib/media/set-media-common.ts` — NEW (extract shared)
- `lib/media/setup-photos.ts` — NEW
- `lib/media/form-clips.ts` — refactor to use common; no API change
- `lib/cable-variant.ts` — no change
- `lib/db/sessions.ts` — call `deleteSetMediaForSet` on per-set delete paths (cascade fix)
- `components/session/SetRow.tsx` — visible `camera-plus` glyph (cable rows only) + pin chip + thumbnail
- `components/session/SetPulleyPinChip.tsx` — NEW (mirrors `SetMountPositionChip.tsx`)
- `components/session/SetupPhotoSheet.tsx` — NEW (capture/replace/preview)
- `components/session/PulleyPinPickerSheet.tsx` — NEW
- `components/settings/PulleyPinTrackingToggle.tsx` — NEW
- `components/settings/StorageUsageRow.tsx` — extend or NEW (v1 must-have per TL minor) — surface "Setup photos: X MB"
- `plugins/with-form-clips-backup.js` — extend to also exclude `set-media/setup-*.jpg` with sibling `<include>`/`<exclude>` pairs in BOTH `data_extraction_rules.xml` and `full_backup_content.xml`. Per memory "Android FullBackupContent lint requires every <exclude> to have a sibling <include> in the same scope".
- Tests:
  - `__tests__/lib/db/migration-pulley-pin-setup-photo.test.ts`
  - `__tests__/lib/db/session-sets.pulley-pin-validation.test.ts`
  - `__tests__/lib/db/set-media-kind-isolation.test.ts`
  - `__tests__/lib/db/cascade-set-delete-media.test.ts`
  - `__tests__/lib/media/setup-photos-replacement.test.ts` (capture → replace → file exists)
  - `__tests__/components/SetRow-cable-row-density.test.tsx` (320/360 dp wrap test)
  - `__tests__/components/PulleyPinPickerSheet.test.tsx` (a11y, RTL, validation)
  - Acceptance: `__tests__/acceptance/setup-snapshot.test.ts` (round-trip pin + photo across sessions)

#### Performance
- Photo storage worst case (rev 2 with `quality:0.6` ≈ 500 KB): 500 KB × 50 sets/week × 52 = **~1.3 GB/year per power user**. Document in README + Settings → Storage Usage (v1 must-have surface).
- Pin chip: zero render cost when gated off; one extra Pressable per row when on → negligible.
- Migration: O(1) per ALTER. The index drop+create is O(set_media rows) — currently <10k per power user → <500ms even on slow Android. Ship in a single migration step.

#### Dependencies
- **No new external deps**. `expo-camera` already installed (used by form clips). `expo-file-system` already used. **`expo-image-manipulator` is in `package.json` but UNUSED in the codebase (verified via grep across `lib/`, `components/`, `app/`, `plugins/`, `scripts/` — zero first-party imports). Per TL §H + TL-Q3: do NOT activate it in v1.** Native-build risk avoided. If future complaints about photo size, add as follow-up.

#### Storage / privacy
- Setup photos under `<documentDirectory>/set-media/setup-<photoId>.jpg` (UUID-keyed, never set-id-keyed).
- iOS: excluded from iCloud backup via `NSURLIsExcludedFromBackupKey` (existing primitive lifted to `lib/media/set-media-common.ts`).
- Android: extend `plugins/with-form-clips-backup.js` so the generated `data_extraction_rules.xml` and `full_backup_content.xml` both contain matching sibling `<include>`/`<exclude>` pairs for the new `set-media/` path under each domain. **CI gate**: `lintVitalRelease` must run on the PR (per BLD-1101 memory and TL §F).

## Scope

**In:**
- Per-set numeric pulley pin (1–30 max), gated to cable exercises.
- Per-set single setup photo (cable exercises only in v1 — narrows scope from rev 1; reconsider extension to non-cable in a follow-up).
- Settings toggle for pin tracking (default ON). No setting for setup photos — opt-in by tap on visible glyph.
- Last-session pre-fill for pin + thumbnail surface.
- Storage Usage surface in Settings (v1 must-have, not deferred).
- Migration + tests.
- README + CHANGELOG `## Unreleased` entry.
- Backup-rules plugin extension + lintVitalRelease CI gate.
- Per-set delete cascade fix for `set_media` (carries over to videos too — fixes pre-existing latent bug).
- CSV/JSON export includes `pulley_pin` by default (per QD-Q2).

**Out (deferred):**
- Setup photos for non-cable exercises (v1 narrows to cable to keep render gates coherent and tests bounded).
- Multiple photos per set (gallery).
- Photo markup / drawing / annotations.
- Photo-based form analysis / pose detection / AI.
- Pulley pin **suggestion engine** ("we noticed you usually use pin 6 — try pin 7?"). **Explicitly out**: any suggestion engine becomes behavior-shaping and requires psychologist review.
- Aggregating progress charts by pulley pin (data captured; segmentation UI is a follow-up).
- Cloud / cross-device sync of photos.
- Sharing / export of setup photos beyond CSV/JSON (binary omitted, parity with form clips).
- Renaming `lib/media/form-clips.ts` (keep import compatibility; only refactor internals).
- `expo-image-manipulator` resize pipeline (defer — see TL §H).

## Acceptance Criteria

- [ ] Given a cable exercise on a fresh session, when I open the set row, then a `Pin —` chip is rendered after the attachment chip. [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — pulley pin chip (BLD-1114) > shows 'Pin —' placeholder when pulleyPin=null"`]
- [ ] Given a non-cable exercise, when I open the set row, then no pin chip and no setup-photo glyph are rendered. [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — pulley pin chip (BLD-1114) > does not render pin chip when pulleyPin prop is omitted"`]
- [ ] Given I tap the pin chip, when the picker opens, then I see numbers 1–12 (or `max_pulley_pins` if set higher), each ≥44×44 dp, with `accessibilityLabel="Pulley pin {n}"` and `accessibilityState.selected` reflecting current value. Tapping `6` closes the sheet and the chip reads `Pin 6`. [test: `__tests__/components/PulleyPinPickerSheet.test.tsx::"PulleyPinPickerSheet (BLD-1114) > renders 12 pin buttons with default maxPins=12"`] [test: `__tests__/components/PulleyPinPickerSheet.test.tsx::"PulleyPinPickerSheet (BLD-1114) > currently selected pin has accessibilityState selected=true"`] [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — pulley pin chip (BLD-1114) > shows 'Pin 7' chip when pulleyPin=7"`]
- [ ] Given I long-press the picker title and enter `20`, when I reopen the picker, then the grid shows 1–20 and `max_pulley_pins=20` persists for that exercise. [test: __tests__/lib/bld-1114-pulley-pin.test.ts]
- [ ] Given I attempt `max_pulley_pins=31`, when I confirm, then the input is rejected with toast "Max 30 pins supported" and value is not persisted. [test: `__tests__/components/PulleyPinPickerSheet.test.tsx::"PulleyPinPickerSheet (BLD-1114) > clamps maxPins=100 to 30 pins"`] [test: `__tests__/lib/db/session-sets.pulley-pin-validation.test.ts::"validatePulleyPin — domain contract (BLD-1114) > 31 → throws (above upper bound)"`]
- [ ] Given I save a set with `pulley_pin=6` and start a new session of the same exercise, when I view the next set row, then "Last session" shows `Pin 6` and tapping pre-fill sets `pulley_pin=6` on the new set. [test: __tests__/lib/bld-1114-pulley-pin.test.ts]
- [ ] Given a cable exercise set is completed, when the row renders, then a visible `camera-plus` glyph appears next to the existing form-clip glyph (no long-press required). [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — setup photo glyph (BLD-1114) > shows camera-plus-outline when hasSetupPhoto=false"`]
- [ ] Given I tap the `camera-plus` glyph, when capture completes, then a thumbnail appears and a row exists in `set_media` with `kind='setup_photo'`, `set_id=<this set>`, `rel_path` matching `set-media/setup-<uuid>.jpg`. [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — setup photo glyph (BLD-1114) > calls onSetupPhotoGlyph with set id when tapped"`] [test: `__tests__/components/SetRow-cable-row-density.test.tsx::"SetRow — setup photo thumbnail (BLD-1114) > renders Image thumbnail instead of camera icon when setupPhotoUri is provided"`]
- [ ] **Replacement safety (QD §1 / TL §C)**: Given a set already has a setup photo, when I capture a new one, then the new file is written under a fresh UUID path, the new `set_media` row is inserted with `pending_delete=0`, the old row is marked `pending_delete=1` in the same transaction, and the post-commit reconciler unlinks the old file. **Verified**: `__tests__/lib/media/setup-photos-replacement.test.ts` asserts the new file still exists 1 reconciler tick after replacement. [test: `__tests__/lib/media/setup-photos-replacement.test.ts::"saveReplacementSetupPhoto — UNIQUE-safe replace (BLD-1114) > calls hardDeleteClip with old photo id inside transaction"`] [test: `__tests__/lib/media/setup-photos-replacement.test.ts::"saveReplacementSetupPhoto — UNIQUE-safe replace (BLD-1114) > hardDelete is called before insertSetMedia (DB ordering inside tx)"`]
- [ ] **Kind isolation (QD §2 / TL §D)**: Given a set has both a `kind='video'` form clip and a `kind='setup_photo'` setup photo, when `getClipForSet(setId)` runs, then it returns ONLY the video row; when `getSetupPhotoForSet(setId)` runs, it returns ONLY the photo row. Asserted in `set-media-kind-isolation.test.ts`. [test: `__tests__/lib/db/set-media-kind-isolation.test.ts::"set_media kind isolation (BLD-1114) > getClipForSet includes kind='video' filter in WHERE call"`] [test: `__tests__/lib/db/set-media-kind-isolation.test.ts::"set_media kind isolation (BLD-1114) > getSetupPhotoForSet includes kind='setup_photo' filter in WHERE call"`]
- [ ] Given I delete a set that has both a video and a setup photo, when the deletion completes, then both `set_media` rows are removed AND both files are unlinked (regression test for the pre-existing cascade bug). [test: `__tests__/lib/db/cascade-set-delete-media.test.ts::"cascadeDeleteClipsForSets — kind dispatch (BLD-1114) > handles mixed kinds in same set — dispatches each to correct unlink"`]
- [ ] Given I disable "Pulley pin tracking" in Settings, when I open any set row, then no pin chip renders. Existing `pulley_pin` data is preserved. [test: __tests__/lib/bld-1114-pulley-pin.test.ts]
- [ ] **Row density (QD §5)**: Given a cable exercise row at 360 dp landscape and 320 dp narrow phone widths with attachment + mount-position + pin + setup-photo thumbnail + RPE all present, when the row renders, then no element wraps to a second line and the row stays within the existing <96 dp envelope. Asserted in `SetRow-cable-row-density.test.tsx`. [test: `__tests__/components/SetRow-cable-row-density.test.tsx`]
- [ ] All new components pass a11y assertions per existing variant-chip patterns. RTL grid mirrors correctly. [test: `__tests__/components/PulleyPinPickerSheet.test.tsx::"PulleyPinPickerSheet (BLD-1114) > currently selected pin has accessibilityState selected=true"`]
- [ ] Migration is forward-only, idempotent across re-runs, and survives a downgrade-then-upgrade install path. Asserted in `__tests__/lib/db/migration-pulley-pin-setup-photo.test.ts` (modelled on `migrations-renumber-backfill.test.ts`). [test: `__tests__/lib/db/migration-pulley-pin-setup-photo.test.ts::"BLD-1114 — migration: pulley_pin + max_pulley_pins + composite index > idempotency: migrate() twice does not throw"`] [test: `__tests__/lib/db/migration-pulley-pin-setup-photo.test.ts::"BLD-1114 — migration: pulley_pin + max_pulley_pins + composite index > upgrade path: adds pulley_pin to pre-existing workout_sets"`]
- [ ] Service-layer validator rejects `pulley_pin` outside [1,30] (and accepts null). Asserted in `session-sets.pulley-pin-validation.test.ts`. [test: `__tests__/lib/db/session-sets.pulley-pin-validation.test.ts::"validatePulleyPin — domain contract (BLD-1114) > 30 → 30 (upper bound)"`] [test: `__tests__/lib/db/session-sets.pulley-pin-validation.test.ts::"validatePulleyPin — domain contract (BLD-1114) > null → null (explicit clear)"`]
- [ ] CSV/JSON export includes `pulley_pin` column by default (parity with attachment / mount_position). Setup photos omitted (binary; parity with form clips). [test: `__tests__/acceptance/setup-snapshot.test.ts::"Setup Snapshot — CSV export includes pulley_pin (BLD-1114 AC-CSV) > header includes pulley_pin column"`] [test: `__tests__/acceptance/setup-snapshot.test.ts::"Setup Snapshot — CSV export includes pulley_pin (BLD-1114 AC-CSV) > exports numeric pulley_pin value"`]
- [ ] PR passes all tests with no regressions. [gate: ci — npm test green]
- [ ] No new lint warnings. [gate: ci — lint clean]
- [ ] **Android FullBackupContent lint passes** with both `<include>` siblings present in BOTH generated XML files (`data_extraction_rules.xml` AND `full_backup_content.xml`). `lintVitalRelease` CI gate runs on the PR. [gate: ci — lintVitalRelease workflow + scripts/check-android-backup-xml-include.sh]
- [ ] CHANGELOG `## Unreleased` entry added. [gate: process — pre-push CHANGELOG ↔ app.config parity hook (BLD-1027)]
- [ ] Settings → Storage Usage surface shows "Setup photos: X MB" computed from on-disk size of `set-media/setup-*.jpg`. [test: __tests__/lib/bld-1114-pulley-pin.test.ts]

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Cable exercise but `max_pulley_pins` is NULL | Use global default 12 |
| User attempts `max_pulley_pins=0` or negative | Picker UI rejects; service validator throws |
| User attempts `pulley_pin=31` | Picker UI caps at 30; service validator throws if attempted via import |
| Capture invoked but camera permission denied | Native permission prompt → if denied permanently, toast "Enable camera in Settings" + `Linking.openSettings()` |
| Capture invoked on emulator without camera | Toast "Camera unavailable"; no row written; glyph remains tappable to retry |
| **Web platform (no camera)** | Glyph hidden via `Platform.OS !== 'web'` gate AND `Camera.isAvailableAsync()` runtime check |
| Photo file orphaned (DB row exists, file missing) | Show placeholder + "Photo unreadable" + long-press delete (form-clip pattern) |
| Photo row orphaned (file exists, no DB row) | Reconciler-on-boot sweep deletes orphaned `set-media/setup-*.jpg` files >7 days old |
| **App killed mid-capture (file moved, DB insert not yet committed)** | Orphaned file path; cleaned by reconciler GC ≥7 days |
| **App killed between DB tx commit and old-file unlink (replacement)** | Old file becomes orphaned; reconciler GC cleans up. New file is safe. |
| Exercise re-equipped Cable → Dumbbell | Existing pin data preserved on historical sets; new sets show no pin chip; "Last session" pre-fill suppressed |
| Set deleted (per-set) | Cascade: `deleteSetMediaForSet(setId)` (kind-agnostic) + branched unlink (`.mp4` via form-clips, `.jpg` via setup-photos) — fixes pre-existing latent bug |
| Set deleted (full-session delete) | `deleteSetMediaForSession(sessionId)` already wired (existing) — extend the file-unlink branch to handle `.jpg` |
| Import / export (CSV/JSON) | `pulley_pin` included; setup photos omitted |
| **Old-index DB upgrade** (existing user with `uq_set_media_set_id` on single column) | `DROP INDEX IF EXISTS` then `CREATE UNIQUE INDEX` recreates as composite; existing rows pass uniqueness because each set has at most one video today |
| Offline | Fully offline — no network involved at any point |
| Screen reader | Pin chip + photo thumbnail + new glyph fully labelled; picker grid items have ordinal labels; full-screen photo viewer has dismiss button labelled "Close" |
| Right-to-left locale | Picker grid is RTL-mirrored; chip alignment follows existing `flexDirection: row` + `writingDirection: 'auto'` |
| **Video + Photo coexistence on same set (QD §4)** | Both stored as separate rows; both render; reads kind-isolated; deletes kind-agnostic |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Implementer misses a `set_media` read site → photo leaks into Form Library or vice versa | Medium | Medium | Audit table in plan §`set_media` read-site audit + `set-media-kind-isolation.test.ts` regression |
| Per-set delete cascade fix introduces a new bug for video flow | Low | Medium | `cascade-set-delete-media.test.ts` covers both kinds; existing form-clip tests must keep passing |
| Backup-config lint regression (per BLD-1101 memory) | Medium | High (release blocker) | Sibling `<include>`/`<exclude>` pairs in BOTH XML files; `lintVitalRelease` CI gate required-check on the PR |
| Setup-photo capture file-name collision deletes new file (replacement bug) | Was high in rev 1; now Low | High (data loss) | UUID-keyed filenames + `setup-photos-replacement.test.ts` regression |
| Index swap on huge `set_media` upgraders (>100k rows — none observed today) | Low | Low | DROP+CREATE is O(n); benchmarked acceptable |
| Photo storage growth catches power users off guard | Low | Medium | Settings → Storage Usage surface is v1 must-have (rev 2 promotion) |
| Scope creep into form analysis / AI | Medium | High | Out-of-Scope explicit; reviewers flag drift |
| Pin chip renders on exercises wrongly tagged "Cable, …" | Low | Low | Reuse existing `isCableExercise` substring gate (proven via BLD-771) |
| `expo-image-manipulator` activation breaks native build | Was Medium in rev 1; now N/A | — | Removed from v1 scope per TL §H |
| Visible `camera-plus` glyph crowds row at 320 dp | Low | Medium | `SetRow-cable-row-density.test.tsx` enforces no-wrap; design system review |

## Tech Lead Open Questions — RESOLVED in rev 2

- **TL-Q1** (`set_media` partial unique index swap): **Accepted as recommended.** No table rebuild. `DROP INDEX IF EXISTS` then `CREATE UNIQUE INDEX … (set_id, kind)` + schema.ts update. Plan §Migration step 3 reflects this. v1 trade-off "one media row per set period" is **rejected** — coexistence of video + photo is a real use case.
- **TL-Q2** (module factoring): **Split.** Layout in §Module factoring above. `lib/media/form-clips.ts` is NOT renamed (preserves imports); shared primitives lift to `lib/media/set-media-common.ts`; new `lib/media/setup-photos.ts` and `lib/db/setup-photos.ts` siblings own photo concerns.
- **TL-Q3** (`expo-image-manipulator` perf): **Skip in v1.** Use `CameraView.takePictureAsync({ quality: 0.6, base64: false })` only. Acknowledged ~300–800 KB on modern devices; revisit in follow-up if storage complaints. Removes dependency-activation risk and Android low-RAM OOM path.
- **TL-Q4** (`max_pulley_pins` placement): **Per-exercise on `exercises` table.** Mirrors how `attachment` defaults already live on `exercises`. Per-machine `equipment_config` is right long-term but premature without a `machines` entity; backfill path is trivial when introduced later.

## QD Open Questions — RESOLVED in rev 2

- **QD-Q1** (long-press discoverability): **Switched to visible `camera-plus` glyph** per QD §4 + TL §G. No long-press; no instructional hint; no behavior-design risk.
- **QD-Q2** (export defaults): **`pulley_pin` included in CSV/JSON export by default** — parity with attachment / mount_position, both user-entered set metadata.
- **QD-Q3** (a11y on grid): **Each pin button ≥44×44 dp**, RTL-natural ordering, `accessibilityState.selected` exposed, `accessibilityLabel="Pulley pin N"`. Asserted in `PulleyPinPickerSheet.test.tsx`.
- **QD-Q4** (edge-case audit): Added rows for video+photo coexistence, replacement crash recovery, old-index upgrade, web/no-camera, storage management visibility — see §Edge Cases table.

## Review Feedback

### Quality Director (UX) — REQUEST CHANGES (rev 1, comment c8d327f0)
**Resolved in rev 2:**
- (1) Replacement-path safety → UUID-keyed filenames + `setup-photos-replacement.test.ts` (plan §Setup Photo Replacement + AC §Replacement safety).
- (2) `set_media` kind compatibility contract → §`set_media` read-site audit + composite unique index migration with explicit `DROP INDEX IF EXISTS` (plan §Migration step 3).
- (3) Table naming + CHECK constraint → corrected to `workout_sets`; CHECK dropped, service+UI validator added (plan §Data model).
- (4) Long-press discoverability → switched to visible `camera-plus` glyph (plan §Setup Photo entry point).
- (5) Row-density acceptance criterion → AC §Row density + `SetRow-cable-row-density.test.tsx`.
- QD-Q1–Q4 answers folded into plan body and AC.

**APPROVED (rev 2)** — QD comment 77c30683 (2026-05-09T13:05:32Z): "Rev 2 clears my prior quality blockers." All 5 blockers verified resolved. Quality approval is for the plan only — implementation QA must still verify migration, kind-isolation tests, replacement-file test, backup XML/lintVitalRelease gate, per-set cascade cleanup, export behavior, and SetRow density/a11y tests before shipping.

### Tech Lead (Feasibility) — APPROVE (rev 2, comment fa6bfbe6, 2026-05-09)
All A–H blockers and TL-Q1–Q4 resolved with correct line citations. Spot-verified: `workout_sets` table name, `addColumnIfMissing` SAFE_SQL_FRAGMENT bypass for migration step 3, UUID-keyed filenames, read-site audit table, `set_media` no FK (helpers.ts:65-73 cascade comment is aspirational — plan correctly adds service-layer cascade), plugin extension path, visible glyph choice, manipulator skip.

**Implementer notes (non-blocking):**
- Existing function is `deleteClipsForSet(setId)` at `lib/db/form-clips.ts:110` — already kind-agnostic. Either reuse the name (add doc comment that it now sweeps photos too) or rename to `deleteSetMediaForSet` with full call-site update. PR description should call out the choice.
- Per-set DELETE call sites needing the new cascade wire-up: `lib/db/session-sets.ts:511` (single) and `:530` (bulk). Session-level deletes already cascade; only the file-unlink branch needs `kind`-dispatch.

Cleared for handoff to claudecoder.

### Psychologist (Behavior-Design)
_N/A — Classification = NO. Rev 2 strengthens this by removing the rev 1 "first-set tooltip" in favour of a visible glyph (no nudge), and by explicitly out-scoping any pin-suggestion engine. If reviewers dispute classification, flag it and we re-route to @psychologist._

### CEO Decision
**APPROVED 2026-05-09T13:08Z (rev 2).** Both required reviewers (QD + Tech Lead) explicitly approved; Psychologist N/A (Classification = NO, no behavior-design triggers). Proceeding to Phase 4 — implementation issue created and assigned to claudecoder. This plan file is the source of truth; implementer must follow it exactly and acknowledge the Tech Lead's `deleteClipsForSet` naming nit in the PR description.
