# Feature Plan: Setup Snapshot — per-set setup photo + numeric pulley pin

**Issue**: BLD-1114  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Parent product-evolution issue**: BLD-1113

## Research Source

- **Origin**: Reddit + 2026 app-comparison guides (web_search 2026-05-09).
  - Best-of-2026 guides (RepCount, Gainz-Pro, JEFIT-blog) and r/bodyweightfitness threads consistently surface the same cable/home-gym pain.
- **Pain point observed (paraphrased from threads / aggregated guides)**:
  > "I can't remember the exact pulley height I used last week — was it pin 4 or pin 5? My triceps pushdown progress chart is muddy because I keep accidentally training a different setup."
  > "I wish I could attach a photo of my setup to a set so next time I just pull it up and recreate it."
- **Frequency**: Recurring across multiple subreddits and across multiple apps (Strong, Hevy, JEFIT, FitNotes). Not a one-off rant — these are top-tier "wishlist" items in 2026 comparison roundups.
- **CableSnap fit**:
  1. Brand identity literally references cable machines — owning this niche is on-brand.
  2. We already ship coarse mount-position chips (BLD-771: high / mid / low / floor) and Form Clips infrastructure (BLD-1105) — both can be extended cheaply rather than rebuilt.
  3. Privacy-first / offline-first / open-source advantages over Strong+Hevy: photos never leave the device.

## Problem Statement

Cable lifters routinely train the same nominal exercise (e.g. "Cable Tricep Pushdown") with subtly different setups across sessions:
- Pulley pin notch (cable machines have 10–20 numbered positions, not just 4).
- Seat / bench height for seated rows.
- D-handle vs rope grip (already covered by BLD-771 attachment chip — keep).
- Stance distance, foot position, body angle.

Without a way to capture and recall those details, three failures happen:
1. **Inconsistent loading.** User picks a heavier weight than last time because they (consciously or not) shifted to a more leveraged setup. Progress chart misleads.
2. **Wasted time at the rack.** User spends 30–60s every set guessing-and-checking their setup.
3. **Form drift.** User can't compare today's setup to a past PR setup → harder to debug "why does this feel weird today".

CableSnap's existing `mount_position` chip (high/mid/low/floor) is too coarse to fix #1 and doesn't help with #2/#3 at all.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (See §3.2 trigger list.)

- [x] **NO** — purely informational / functional. Users still decide what to log, when to log, and what setup to use. No streaks, no notifications, no rewards, no nudges, no social, no progression mechanics tied to capture rate. The capture is **opt-in per set** and is silent if skipped.
- [ ] YES

If during review the scope drifts toward "remind users to snap setup photos to maintain a streak" or any motivational copy, **flip Classification to YES** and require fresh psychologist review per §3.2.

## User Stories

- As a cable-machine lifter, I want to record the **pulley pin number** I used on a set, so my next session at the same exercise can pre-fill it and I can re-rack at the right height in <5s.
- As a home-gym lifter, I want to **snap a quick photo of my setup** (rack pin, seat height, attachment) on the first working set, so I can glance at it next session and recreate the exact configuration.
- As a data-driven lifter, I want **progress charts and PR detection to optionally segment by pulley pin**, so a 50 lb pushdown at pin 6 doesn't get confused with a 50 lb pushdown at pin 4.
- As a privacy-conscious lifter, I want all setup photos to stay **on-device** and to be **excluded from cloud backup by default**, like Form Clips already are.

## Proposed Solution

### Overview

Add **two complementary, opt-in, per-set capture surfaces** to the existing SetRow:

1. **Pulley Pin chip** — a numeric chip (1–N) appearing only on cable-equipment exercises, inline with the existing attachment / mount-position chips from BLD-771. Tap → bottom sheet 1×N grid (default N=12, user can extend per machine).
2. **Setup Photo** — long-press the SetRow's existing camera affordance (currently form-clip video) → "Snap setup photo" alternative action. Stores a single still JPEG (~50–200 KB) in the same `set_media` table as form clips, distinguished by a new `kind = 'setup_photo'` column value.

Both are reused on the next session via the existing "Last session" autofill row already present on SetRow — pre-fill pulley pin, show thumbnail.

### UX Design

#### Pulley Pin chip
- **Render gate**: only when `isCableExercise(exercise)` (existing helper from `lib/cable-variant.ts`) AND user has set "Pulley pin tracking = on" in Settings (default: **on** — discoverable but skippable).
- **Visual**: small chip after attachment chip, label `Pin —` when empty, `Pin 6` when set. No badge / glow / color → matches BLD-771 chip styling exactly.
- **Picker**: bottom sheet, 1×N numeric grid. N defaults to 12 but the **last value used per (exercise, gym)** is remembered so a user with a 20-pin home rig sees 20 after their first long-press → "Set max pins for this exercise". Per-exercise max stored on the `exercises` table (new column `max_pulley_pins INTEGER NULL`).
- **A11y**: each pin has `accessibilityLabel="Pulley pin {n}"` and chip has `accessibilityValue={{ text: pin ? "Pin "+pin : "Pulley pin not set" }}`.

#### Setup Photo
- **Entry point**: **Re-uses the existing Form Library camera affordance.** No new icon on SetRow → zero added visual noise. Long-press the camera button → action sheet with two options: "Record form clip (video)" / "Snap setup photo (still)". Single tap defaults to current behavior (form clip video) so existing users see no change.
- **Capture flow**: opens system camera UI → returns a single still JPEG → stored in `<doc>/set-media/setup-<setId>.jpg` with `NSURLIsExcludedFromBackupKey` set, exactly like form clips. Max ~1920px long edge, 80 quality JPEG (target <200 KB).
- **Display**: tiny 24×24 thumbnail next to the pin chip when present. Tap → full-screen viewer with pinch-zoom + delete affordance. No edit / no draw / no markup in v1.
- **One photo per set max** — replacing follows the same atomic split-then-insert pattern as Form Clips replacement (per existing memory: "Form clip replacement must split file persistence from DB insert, then hard-delete old set_media inside withTransaction before inserting").

#### Pre-fill on next session
- "Last session" row that already shows `7 × 50 lb @ pin 6` if pin was logged. Tapping pre-fills weight, reps, **and pin**.
- Setup photo thumbnail appears in the "Last session" row at 16×16. Tap-and-hold → full-screen preview without committing to load.

#### Empty / error states
| State | Behavior |
|-------|----------|
| Cable exercise, no pin set yet | Pin chip says `Pin —` (parity with attachment chip when unset). |
| Non-cable exercise | Pin chip not rendered. |
| Photo capture cancelled | Silent — no toast, no state change. |
| Photo file move fails (disk full) | Toast "Couldn't save setup photo — disk full?" — set itself still saves. |
| Photo decode fails on display | Show neutral placeholder + "Photo unreadable" caption. Long-press → delete option. |
| Last-session pin stale (exercise re-equipped, e.g. cable→dumbbell) | Pre-fill suppressed via the same gate as BLD-771 mount-position pre-fill (don't carry stale variant data across equipment changes). |

### Technical Approach

#### Data model
- **`exercises` table** — add `max_pulley_pins INTEGER NULL DEFAULT NULL`. NULL = use global default (12).
- **`session_sets` table** — add `pulley_pin INTEGER NULL`. CHECK constraint `pulley_pin IS NULL OR (pulley_pin >= 1 AND pulley_pin <= 30)`.
- **`set_media` table** — extend existing `kind` enum with `'setup_photo'` value. Reuse existing `uq_set_media_set_id` unique index? **No** — that index is non-partial (per memory: "uq_set_media_set_id (non-partial unique index per schema.ts:172)"). Need to verify whether one set can have BOTH a form clip AND a setup photo. Per **TL Q1 below**, we likely need a partial unique index `(set_id, kind)`. Tech Lead to confirm.
- Settings flag `pulley_pin_tracking_enabled` (BOOLEAN, default TRUE) in existing `app_settings` key-value table.

#### Migration
- Single forward-only migration `add_pulley_pin_and_setup_photo`:
  1. `ALTER TABLE exercises ADD COLUMN max_pulley_pins INTEGER`.
  2. `ALTER TABLE session_sets ADD COLUMN pulley_pin INTEGER` (with CHECK).
  3. Recreate `uq_set_media_set_id` as `UNIQUE (set_id, kind)` partial index — **pending TL feasibility check** (SQLite ALTER limitations may force a table rebuild).
- Migration is idempotent (guarded by `PRAGMA user_version`) and additive — no data loss path.

#### Module touch list (estimated)
- `lib/db/schema.ts` (+~20 lines)
- `lib/db/migrations.ts` (+~50 lines new migration)
- `lib/db/session-sets.ts` (read/write `pulley_pin`)
- `lib/db/exercises.ts` (read/write `max_pulley_pins`)
- `lib/media/form-clips.ts` → likely renamed/extended to `lib/media/set-media.ts` or split into `setup-photos.ts` sibling. **TL to advise** on factoring (avoid bloating one module with two distinct kinds).
- `lib/cable-variant.ts` — no change to existing exports; pulley pin logic is per-exercise gated, not part of the variant union.
- `components/session/SetRow.tsx` (chip + thumbnail render)
- `components/session/SetPulleyPinChip.tsx` (new, mirrors `SetMountPositionChip.tsx`)
- `components/session/SetupPhotoSheet.tsx` (new, capture/replace/preview)
- `components/session/PulleyPinPickerSheet.tsx` (new)
- `components/settings/PulleyPinTrackingToggle.tsx` (new, simple Switch row)
- Tests: 1 migration test, 1 schema test, 2 component tests (chip + picker), 1 acceptance test (round-trip pin + photo across sessions).

#### Performance
- Photo storage worst case: 1 photo per set × 200 KB × ~50 sets/week × 52 weeks = ~520 MB/year per user. Acceptable on modern devices; document in README + Settings → Storage Usage.
- Pin chip: zero additional render cost when not rendered (gated). When rendered, one extra Pressable per row → negligible.
- Migration: O(1) per ALTER, table rebuild for unique-index swap is O(set_media row count) — currently under ~10k rows for power users → <500ms even on slow Android.

#### Dependencies
- **No new external deps**. Reuses `expo-camera` (already in for form clips), `expo-file-system`, `expo-image-manipulator` (already used for form-clip thumbs).

#### Storage / privacy
- Setup photos live under `<documentDirectory>/set-media/setup-*.jpg`.
- Excluded from iOS iCloud backup via `NSURLIsExcludedFromBackupKey` (existing form-clip pattern).
- Excluded from Android auto-backup via the existing `form_clips_backup_rules.xml` config — extend to include `set-media/setup-` prefix or rename rule file. **Watch the lint trap**: per memory "Android FullBackupContent lint requires every <exclude> to have a sibling <include> in the same scope" — both domains (sharedpref, file) must have `<include>` siblings. v0.26.24 broke on exactly this.

## Scope

**In:**
- Per-set numeric pulley pin (1–30 max), gated to cable exercises.
- Per-set single setup photo, gated to none (any exercise can have one — bench-press setup matters too).
- Settings toggle for pin tracking (default on). No setting needed for setup photos — entry point is opt-in by long-press.
- Last-session pre-fill for pin + thumbnail surface.
- Migration + tests.
- README + CHANGELOG entry.

**Out (deferred to future plans):**
- Multiple photos per set (gallery).
- Photo markup / drawing / annotations.
- Photo-based form analysis / pose detection / AI.
- Pulley pin _suggestion_ engine ("we noticed you usually use pin 6 here — try pin 7?"). **Explicitly out**: any suggestion engine becomes behavior-shaping and requires psychologist review.
- Aggregating progress charts by pulley pin (data is captured; segmentation UI is a follow-up).
- Cloud / cross-device sync of photos.
- Sharing / export of setup photos beyond existing CSV/JSON export (which will simply omit binary data, same as form clips today).

## Acceptance Criteria

- [ ] Given a cable exercise (e.g. "Cable Triceps Pushdown") on a fresh session, when I open the set row, then a `Pin —` chip is rendered after the attachment chip.
- [ ] Given a non-cable exercise (e.g. "Barbell Back Squat"), when I open the set row, then no pin chip is rendered.
- [ ] Given I tap the pin chip, when the picker opens, then I see numbers 1–12 (or `max_pulley_pins` if set higher), and tapping `6` closes the sheet and the chip reads `Pin 6`.
- [ ] Given I tap "Set max pins" in the picker overflow and enter `20`, when I reopen the picker, then the grid shows 1–20 and `max_pulley_pins=20` persists for that exercise (verified via DB read).
- [ ] Given I save a set with `pulley_pin=6` and start a new session of the same exercise, when I view the next set row, then the "Last session" pre-fill row shows `Pin 6` and tapping it sets `pulley_pin=6` on the new set.
- [ ] Given I long-press the camera affordance on a set, when the action sheet appears, then I see two options: "Record form clip" and "Snap setup photo".
- [ ] Given I capture a setup photo, when the capture completes, then a thumbnail appears on the set row and a row exists in `set_media` with `kind='setup_photo'`, `set_id=<this set>`.
- [ ] Given a set already has a setup photo, when I capture a new one, then the old file is deleted and exactly one row remains in `set_media` for that (set, kind) combination (replacement parity with form clips).
- [ ] Given a set has a setup photo, when I view "Last session" on the next session, then a 16×16 thumbnail appears and tap-and-hold opens full-screen preview.
- [ ] Given I disable "Pulley pin tracking" in Settings, when I open any set row, then no pin chip renders. Existing `pulley_pin` data is preserved (toggle is render-only).
- [ ] All new components have accessibilityLabel / accessibilityRole / accessibilityValue per existing variant-chip patterns.
- [ ] Migration is forward-only, idempotent across re-runs, and survives a downgrade-then-upgrade install path (verify in `migrations-renumber-backfill` test style).
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.
- [ ] Android FullBackupContent lint passes with both `<include>` siblings present per memory.
- [ ] CHANGELOG `## Unreleased` entry added.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Cable exercise but `max_pulley_pins` is NULL | Use global default 12 |
| User sets `max_pulley_pins=0` or negative | Reject in picker UI; CHECK constraint `>=1` at DB |
| User sets `max_pulley_pins=999` | Soft-cap UI at 30 (matches CHECK on `pulley_pin`); show toast "Max 30 pins supported" |
| Capture invoked but camera permission denied | Native permission prompt → if denied permanently, toast "Enable camera in Settings" + open `Linking.openSettings()` |
| Capture invoked on emulator without camera | Toast "Camera unavailable"; no row written |
| Photo file orphaned (DB row exists, file missing) | Show placeholder + "Photo unreadable" + long-press delete (existing form-clip pattern) |
| Photo row orphaned (file exists, no DB row) | Cleanup pass on app boot deletes orphaned files >7 days old (existing form-clip GC reused) |
| Exercise re-equipped from Cable → Dumbbell | Existing pin data preserved on historical sets; new sets show no pin chip; "Last session" pre-fill suppressed |
| Set deleted | Cascade-delete photo file + `set_media` row (existing form-clip cascade reused) |
| Import / export (BLD CSV/JSON) | `pulley_pin` included in export; setup photos omitted (binary; same as form clips); import gracefully ignores unknown columns |
| Offline | Fully offline — no network involved at any point |
| Screen reader | Pin chip and photo thumbnail fully labelled; picker grid items have ordinal labels; full-screen photo viewer has dismiss button labelled "Close" |
| Right-to-left locale | Picker grid is RTL-mirrored; chip alignment follows existing `flexDirection: row` + `writingDirection: 'auto'` pattern |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| `set_media` unique-index migration is non-trivial in SQLite | Medium | Medium — could need table rebuild | TL to confirm in Phase 2; fallback is to keep current unique-on-set_id and forbid coexisting form-clip + setup-photo on same set in v1 (acceptable trade-off; document in plan) |
| Photo storage growth catches power users off guard | Low | Medium | Surface "Storage used by setup photos: X MB" in Settings → Storage; add bulk-delete affordance (out of v1 scope, follow-up) |
| Long-press on camera affordance discovered slowly | Medium | Low | Add 1× tooltip on first cable exercise of a session; never repeat (no nudge / no streak — pure discoverability per §3.2) |
| Backup-config lint regression (per memory) | Medium | High (release blocker) | Mirror the BLD-1101 fix exactly: every `<exclude domain="X">` has matching `<include domain="X">` sibling. Add explicit pre-merge `lintVitalRelease` check |
| Scope creep into form analysis / AI | Medium | High | Plan Out-of-Scope section is explicit. Reviewers asked to flag any drift |
| Pin chip renders on exercises wrongly tagged "Cable, …" | Low | Low | Reuse existing `isCableExercise` substring gate from `lib/cable-variant.ts` (proven via BLD-771) |

## Tech Lead Open Questions (please answer in your review)

1. **TL-Q1 — `set_media` partial unique index swap**: is `UNIQUE(set_id, kind)` cheap to migrate in expo-sqlite, or does it require a table rebuild + data copy? If rebuild, do we accept the v1 trade-off above (one media row per set, period)?
2. **TL-Q2 — Module factoring**: extend `lib/media/form-clips.ts` to handle setup photos, or split into `lib/media/setup-photos.ts` sibling? My instinct is split, with shared primitives in `lib/media/set-media-common.ts`.
3. **TL-Q3 — Image processing on Android low-mem devices**: is `expo-image-manipulator` already proven for ~1920px JPEG resize at 80 quality across our supported devices, or do we need a memory budget guard?
4. **TL-Q4 — `max_pulley_pins` placement**: column on `exercises` (per-exercise) or on a new `equipment_config` JSON in `app_settings` (per-machine, decoupled from exercise)? Per-exercise is simpler; per-machine is more accurate but adds a new abstraction.

## QD Open Questions (please answer in your review)

1. **QD-Q1**: is the long-press-on-camera-affordance discoverability sufficient, or should setup-photo get its own visible icon? My preference is long-press to keep SetRow visual density unchanged; happy to reconsider with usability rationale.
2. **QD-Q2**: should `pulley_pin` be exposed in CSV/JSON export by default, or behind an "include detailed variants" toggle? Current default is "include all".
3. **QD-Q3**: any a11y concerns with a 1×12 numeric grid on small phones (TalkBack double-tap target spacing)? Minimum 44pt targets per existing design system.
4. **QD-Q4**: edge-case audit — what's missing from the table above?

## Review Feedback

### Quality Director (UX)
_Pending — please update this section AND post in BLD-1114 issue thread._

### Tech Lead (Feasibility)
_Pending — please update this section AND post in BLD-1114 issue thread._

### Psychologist (Behavior-Design)
_N/A — Classification = NO. No streaks, notifications, rewards, social, or motivational copy in scope. Out-of-scope explicitly bans suggestion engines that could drift behavioral. If reviewers disagree with classification, flag it and we re-route._

### CEO Decision
_Pending — final approval after QD + TL convergence._
