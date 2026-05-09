# Feature Plan: Inline form-clip recording + Settings manage UX

**Issue**: BLD-1105  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT (rev-2) → IN_REVIEW → APPROVED / REJECTED
**Source**: GitHub #534 (alankyshum, product owner)

## Research Source
- **Origin:** https://github.com/alankyshum/cablesnap/issues/534
- **Pain point observed:** Two related UX gaps reported in the same ticket:
  1. Exercise Details → Form clips tab is read-only; users can browse but not record/upload directly from this surface. The only documented record path is "Tap the video icon on a completed set" inside an in-progress session.
  2. Settings → Form clips card is a passive info row (icon + size string). No tappable affordance to manage / delete clips. User says: "at least like the user [should have a] price button to open the modal and delete videos as needed".
- **Frequency:** Reported by product owner; reflects a genuine cognitive gap discovered while exercising real navigation flows captured in the diagnostic interaction log.

## Problem Statement
The Form Clips feature has matured (record, library, compare, delete-from-set, storage stats) but the **management surface area** does not match user expectations:

- The Library tab on each exercise reads as a viewer-only experience because the only "+"-style affordance lives on a completed set inside a live session. Users browsing exercise details outside a session have no way to add a clip.
- The Settings card looks like a label/value statistic, not a tappable manage entry point. Users coming from iOS/Android settings paradigms expect a chevron + sheet to inspect and delete content that consumes device storage.

Both gaps shrink usable functionality and increase support load on the maintainer.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO §3.2 trigger list)
- [ ] **YES** — triggers: …
- [x] **NO** — purely functional UX. No streaks, notifications, gamification, social, motivational copy, identity framing, or re-engagement of lapsed users. Adding a record button + manage sheet are functional affordances exposing capabilities that already exist (record, delete, list).

Psychologist review: **N/A** unless reviewers flag a missed trigger.

## User Stories
- As a lifter reviewing an exercise outside an active session, I want a clear "Record clip" button on the Form clips tab so I can capture form check footage tied to that exercise without having to start a workout first.
- As a privacy-conscious user managing on-device storage, I want a Settings entry that opens a manageable list of all my clips so I can delete individual or batches of clips without navigating to every exercise's library.
- As a user with limited device storage, I want to see total bytes used and have a one-tap "Delete all" with confirmation so I can reclaim space quickly.
- As a user who recorded a form check at a poor angle, I want an explicit per-clip Replace action so I can re-record without losing the slot.

## Proposed Solution

### Overview
1. **`FormLibraryTab`**: Add a primary "Record clip" CTA. Target = most recent completed `kind='workout'` set for this exercise that has **no live `set_media` row**. Each existing clip row gains a per-clip overflow menu with Replace + Delete actions.
2. **`FormClipsStorageRow`** (no rename — see nit-4): make the existing card `Pressable`, add chevron, open new `FormClipsManageSheet`. Sheet lists clips grouped by exercise with per-row delete + footer "Delete all clips".

### UX Design

#### Exercise Details — Form clips tab
- Header right gains a second button: `[Record]` (primary) next to existing `[Select]`.
- **Enabled** when a "free" recent set exists (most recent completed `kind='workout'` set without an existing clip).
- **Disabled** otherwise. Helper copy depends on root cause:
  - Zero completed `kind='workout'` sets ever → "Log a workout set first to attach a form clip."
  - All recent sets already have clips → "Replace or delete an existing clip below to record a new one."
- Empty state body (no clips yet): replace "Tap the video icon on a completed set to record one" with primary CTA `[ Record a clip ]` (full-width filled button) when enabled, or the disabled-state helper copy above.
- Each clip row in the grid gains a tappable overflow (`⋯`) opening an action sheet with **Replace** and **Delete**. Replace flow: open recorder → on Save, atomically hard-delete the prior clip + unlink files + insert the new row in a single drizzle transaction (see Technical Approach).
- After a successful record (new or replace), `loadClips()` refreshes the grid; `onClipsChanged` callback fires upward so Settings stats stay coherent.

#### Settings — Form clips card
- Card layout (single-line collapsed): `[icon] Form clips    12.4 MB · 8 clips    [chevron]`
- Tap → opens `FormClipsManageSheet` (bottom sheet on Android, modal on iOS), which shows:
  - Header: "Form clips" + close `X`.
  - Subheader stat strip: total MB, total count, exercises covered.
  - List grouped by exercise name, each row: thumbnail (or placeholder icon — see nit), date, duration, size, `[trash]` icon.
  - Footer destructive button: "Delete all clips" (Alert confirm, copy: "Delete N clips? This permanently removes them from this device. This cannot be undone.").
- Empty state inside sheet: "No clips recorded yet. Record one from any exercise's Form clips tab."
- On sheet dismiss (or after every delete), the parent card calls `getStorageStats()` again via an `onClipsChanged` callback so the byte/count display stays in sync.

#### Thumbnails (clarifies QD non-blocking)
The current Form Library uses placeholder thumbnails (`components/session/FormLibraryTab.tsx:252`). The Manage sheet **reuses the same placeholder/icon fallback** (a `MaterialCommunityIcons` "video" glyph on a tinted square). No new thumbnail-generation pipeline is introduced in this ticket.

#### Accessibility
- All new buttons have `accessibilityRole="button"` and concrete `accessibilityLabel` (e.g., "Record new form clip", "Manage form clips", "Replace clip recorded on May 8 2026", "Delete clip recorded on May 8 2026", "Delete all 8 form clips").
- Destructive actions use `accessibilityHint` describing irreversibility.
- Manage sheet swipe-down to dismiss; close button has 44pt touch target.
- Disabled Record CTA exposes `accessibilityState={{ disabled: true }}` and the disabled helper copy is announced via `accessibilityLabel`.

#### Error / empty / offline
- FormVideoSheet already handles permission denied + recording failure (see existing code).
- Replace flow recording failure: prior clip is preserved (hard-delete only runs INSIDE the same transaction as the new insert; if recording never produces a file, the transaction never runs, so nothing changes).
- Manage sheet delete failures: show Alert "Couldn't delete clip" + retain row.
- Web platform: both new affordances are hidden (`Platform.OS === "web"` guards reuse existing pattern in `FormClipsStorageRow:36`).

### Technical Approach

#### Data-model decision (key)
Form clips are stored in `set_media` with NOT NULL `set_id` and a UNIQUE constraint per set (`lib/db/schema.ts:151-172`, `lib/db/form-clips.ts:30-50`). Critically, the unique index is **not partial** (no `WHERE pending_delete=0`), and `softDeleteClip` only flips the tombstone bit (`lib/db/form-clips.ts:71-75`); the row keeps the unique slot until `reconcileOrphans()` fires (next app boot or first Form Library open per `lib/media/form-clips.ts:304` + `hooks/useAppInit.ts:83`).

Three options were considered for "record from exercise details outside a live set":

| Option | Schema change | UX clarity | Risk |
|---|---|---|---|
| (a) Allow nullable `set_id`, introduce "library clip" concept | YES — migration + new query paths + cascade rules | Cleanest model | High — touches FK cascade, BLD-1094 invariants, sync, backup-exclusion |
| (b) Auto-create placeholder set on record | NO — but creates phantom workout_set/session rows | Confusing in history/PR/e1RM aggregates | High — pollutes analytics; potential psych trigger (phantom data) |
| (c) Restrict inline record to exercises that have ≥1 historic completed set, attach to most recent | NO | Acceptable — most users have history per exercise they care about | Low — additive, no schema/cascade churn |
| (d) **Recommended**: hybrid — use (c) targeting the most recent completed set **without an existing clip**, otherwise show CTA disabled with explicit helper | NO | Honest about constraint; matches today's mental model; never accidentally overwrites | Lowest — purely UX-layer |

**Recommendation: option (d).** Zero schema churn, no behavior-shaping side effects, no analytics pollution. Aligns with the existing invariant from BLD-1088/1089 that workouts in count surfaces remain semantically meaningful (`kind='workout'` filter etc.).

The Record CTA targets `getMostRecentCompletedSetForExercise(exerciseId, { mustHaveNoClip: true })` (most recent `kind='workout'` set with no live `set_media` row). If null → CTA disabled with helper copy that distinguishes the two root causes (no history vs. all sets already have clips).

Replace is a separate, **explicit per-clip** action (overflow menu on each clip row in FormLibraryTab — and optionally on Manage sheet rows; not in scope for this ticket if it requires nav). It uses the transactional hard-delete pattern below to remain UNIQUE-safe.

#### Replace flow (UNIQUE-safe transaction)
Order:
1. User taps `⋯` → Replace on a specific clip row.
2. Open `FormVideoSheet` for recording. Existing prior clip stays intact and visible until step 5 succeeds.
3. User records a new clip; `recordClip` writes the new `.mp4` (and thumbnail placeholder) to disk under `documentDirectory/form-clips/<exercise_id>/<newId>.mp4` and sets `NSURLIsExcludedFromBackupKey` (existing iOS guard).
4. On Save, run a single drizzle transaction:
   ```ts
   await db.transaction(async (tx) => {
     await hardDeleteSetMediaRow(tx, oldId);           // DELETE FROM set_media WHERE id = oldId
     await insertSetMedia(tx, newRow);                  // INSERT new row, same set_id
   });
   ```
   Because the prior row is removed inside the same transaction before the insert, the UNIQUE(set_id) constraint is satisfied at COMMIT time. If the insert throws, the delete rolls back automatically and the prior row remains.
5. After the transaction commits, unlink the prior file + thumbnail off the transaction (best-effort, ENOENT-tolerant via existing `deleteClip` cleanup helper at `lib/media/form-clips.ts:180-197` — refactored to expose `unlinkClipFiles(rel_path)` without the DB step).
6. Emit `onClipSaved` → `FormLibraryTab` refreshes; `onClipsChanged` propagates to Settings.

If recording fails before step 4, no DB or FS mutation runs and the prior clip is preserved verbatim.

#### Bulk Delete-All (reclaim space, AC7)
`deleteAllClips()` uses **hard delete + file unlink** so the user-visible "Delete all" actually frees disk:
```ts
const rows = await db.select({ id, rel_path }).from(setMedia).where(eq(setMedia.pending_delete, 0));
for (const row of rows) {
  await deleteClip(row.id, row.rel_path);   // hard delete + unlink, ENOENT-tolerant
}
```
- `deleteClip` already swallows `ENOENT` idempotently and removes the thumbnail (`lib/media/form-clips.ts:180-197`).
- After the loop, `getStorageStats()` returns true zero. No reconciler tick required.
- Per-row delete (AC6) keeps using `softDeleteClip` (preserves the existing crash-recovery window); only the explicit "Delete all" goes hard. Rationale: bulk delete is an explicit "reclaim space" action, while per-row delete is an "I made a mistake" action where a soft-delete safety net is valuable.

#### New / changed files
- `components/session/FormLibraryTab.tsx` — add Record CTA (enabled/disabled with cause-specific helper) + per-clip overflow menu (Replace, Delete). Wire into existing `FormVideoSheet`. Resolve target `setId` via new helper.
- `lib/db/session-sets.ts` — add `getMostRecentCompletedSetForExercise(exerciseId, { mustHaveNoClip?: boolean })` returning `{ id: number, set_number: number, completed_at: number } | null`. Filter `kind='workout'`, `completed_at IS NOT NULL`. When `mustHaveNoClip=true`, LEFT JOIN `set_media` and require no live (non-tombstoned) row. Test in `__tests__/lib/db/session-sets-most-recent.test.ts`.
- `components/settings/FormClipsStorageRow.tsx` — **no rename** (per nit-4). Make outer view a `Pressable`, add chevron, open new sheet. Accept `onClipsChanged` callback prop and call `loadStats()` in `useFocusEffect` + after each delete.
- `components/settings/FormClipsManageSheet.tsx` — NEW. Lists clips via new helper `listAllClipsGroupedByExercise()`. Per-row delete uses `softDeleteClip`; footer uses new `deleteAllClips()` (hard). Calls `onClipsChanged` after every mutation.
- `lib/media/form-clips.ts` — add:
  - `listAllClipsGroupedByExercise(): Promise<Array<{ exerciseId: string, exerciseName: string, clips: ClipRow[] }>>`
  - `deleteAllClips(): Promise<{ deleted: number }>` — hard delete + unlink loop above
  - `unlinkClipFiles(rel_path)` — extracted file-cleanup half of existing `deleteClip` so the Replace transaction can call it post-commit without re-touching the DB.
  - `hardDeleteSetMediaRow(tx, id)` (or expose existing helper) — pure DB delete callable inside a drizzle transaction, no FS work.
- `app/(tabs)/settings.tsx` — pass an `onClipsChanged` no-op (card handles its own refresh internally).
- Tests:
  - `__tests__/components/settings/FormClipsStorageRow.test.tsx` (renders, opens sheet, refreshes stats on dismiss)
  - `__tests__/components/settings/FormClipsManageSheet.test.tsx` (lists + per-row delete + delete-all)
  - `__tests__/components/session/FormLibraryTab-record.test.tsx` (CTA appears enabled when free set exists, disabled with each helper variant otherwise; Replace overflow opens recorder)
  - `__tests__/lib/db/session-sets-most-recent.test.ts` (kind='workout' filter, completed only, `mustHaveNoClip` excludes sets with live `set_media` row)
  - `__tests__/lib/media/form-clips-replace.test.ts` — **REQUIRED** per Tech Lead BLOCKER 1: existing clip + record-and-save → no UNIQUE error, exactly one row in `set_media` for that `set_id`, prior file unlinked, prior thumbnail unlinked.
  - `__tests__/lib/media/form-clips-replace-rollback.test.ts` — recording succeeds but `insertSetMedia` is forced to throw (e.g., FK violation simulation) → prior row still present, prior files still present.
  - `__tests__/lib/media/form-clips-bulk.test.ts` — `deleteAllClips()` removes all rows AND unlinks all files; `getStorageStats()` returns `{ count: 0, bytes: 0 }`. ENOENT during unlink does not abort the loop.

#### Performance / storage
- `listAllClipsGroupedByExercise` is bounded by clip count (capped by device storage, typically <100). Acceptable single SELECT + JS group.
- Delete-all is a sequential awaited hard-delete loop. For 100+ clips, show progress text "Deleting 23/100…" via local state. ENOENT failures are non-fatal (the row is gone either way).

#### Dependencies
- No new npm packages.
- Reuses: `FormVideoSheet`, `recordClip`, `softDeleteClip`, `deleteClip`, `getStorageStats`, `MaterialCommunityIcons`.

## Scope
**In:**
- Inline Record CTA in FormLibraryTab (header + empty state).
- Disabled-with-helper state when no eligible target set exists, with cause-specific helper copy.
- Per-clip overflow menu (Replace + Delete) in FormLibraryTab clip rows. Replace uses UNIQUE-safe transactional hard-delete.
- Convert `FormClipsStorageRow` into a tappable manage card (no rename).
- New `FormClipsManageSheet` with grouped list, per-row soft-delete + bulk hard-delete that frees disk.
- New helper queries + tests (including the two required replace-flow tests and bulk-delete test).
- Stats refresh wired via `onClipsChanged` callback + `useFocusEffect`.

**Out:**
- Schema change to allow nullable `set_id` (option a) — defer; revisit if user feedback shows option (d) is insufficient.
- Auto-creating placeholder sessions/sets (option b) — explicitly rejected; pollutes analytics + behavior-shaping concern.
- Cloud upload / cross-device sync of clips — existing privacy posture (on-device only) unchanged.
- Replacing the in-session SetRow video icon flow.
- Compare-clip workflow changes.
- iOS-specific PhotoKit picker for importing from camera roll (separate ticket if requested).
- Real thumbnail generation (still placeholder pipeline).
- A "Replace" action inside the Manage sheet (per-clip Replace lives only in FormLibraryTab where the user already has exercise context).

## Acceptance Criteria
- [ ] **AC1** Given an exercise with at least one completed `kind='workout'` set that has no live clip, When the user opens Exercise Details → Form clips, Then a primary "Record clip" button is visible and enabled in the header; tapping it opens FormVideoSheet bound to that most-recent-without-clip set (resolved via `getMostRecentCompletedSetForExercise(id, { mustHaveNoClip: true })`).
- [ ] **AC2a** Given an exercise with zero completed `kind='workout'` sets, When the user opens the Form clips tab, Then the Record CTA is rendered in disabled state with helper copy "Log a workout set first to attach a form clip."
- [ ] **AC2b** Given an exercise where all completed sets already have clips, When the user opens the Form clips tab, Then the Record CTA is rendered in disabled state with helper copy "Replace or delete an existing clip below to record a new one."
- [ ] **AC3** Given a clip row in FormLibraryTab, When the user taps the row's overflow menu and selects Replace, Then FormVideoSheet opens for re-recording; on successful Save the prior `set_media` row + files are removed and the new row + files are persisted **inside a single drizzle transaction** (DB-level delete + insert) followed by post-commit file unlink. No `SQLITE_CONSTRAINT_UNIQUE` error occurs. If the insert fails, the transaction rolls back and the prior clip remains intact.
- [ ] **AC3b** Given a Replace flow where recording fails or is cancelled before Save, Then no DB mutation and no file unlink occurs; the prior clip is preserved verbatim.
- [ ] **AC4** Given a saved new or replaced clip, When recording completes, Then the FormLibraryTab grid refreshes (the new clip appears at top; replaced clips swap in place) and `onClipsChanged` fires.
- [ ] **AC5** Given any number of clips, When the user opens Settings, Then the Form clips card is tappable, has a chevron, and tapping it opens FormClipsManageSheet. After the sheet dismisses, the card's stats refresh via `onClipsChanged` (count + bytes reflect any deletions).
- [ ] **AC6** Given the manage sheet open, When the user taps the trash icon on a row, Then an Alert confirms and on Confirm the clip is **soft-deleted** (preserves crash-recovery window) and removed from the list without dismissing the sheet; the sheet stat strip updates immediately.
- [ ] **AC7** Given multiple clips, When the user taps "Delete all clips" and confirms, Then every clip is **hard-deleted** (DB row removed AND file + thumbnail unlinked from `documentDirectory/form-clips/...`); `getStorageStats()` returns `{ count: 0, bytes: 0 }`; the sheet shows the empty state; the Settings card returns to "0 MB across 0 clips" via `onClipsChanged`. ENOENT during unlink does NOT abort the loop or leave the DB row behind.
- [ ] **AC8** Given web platform, When Settings or FormLibraryTab render, Then no new affordances appear (existing `Platform.OS` guards extended).
- [ ] **AC9** All new components meet a11y: each interactive element has role + label + 44pt touch target; destructive actions include `accessibilityHint`; disabled Record CTA exposes `accessibilityState={{ disabled: true }}` and the disabled helper copy via `accessibilityLabel`.
- [ ] **AC10** PR passes `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e` (existing form-clip e2e suite if any) with no regressions.
- [ ] **AC11** No new lint warnings; no new Sentry breadcrumb categories beyond existing `form-clips`.
- [ ] **AC12** No schema migrations introduced; `lib/db/schema.ts` byte-identical to main.
- [ ] **AC13** Manage sheet thumbnails reuse the existing FormLibraryTab placeholder/icon pipeline; no new thumbnail-generation code is added.

## Edge Cases
| Scenario | Expected behavior |
|---|---|
| Exercise has zero completed sets | Record CTA disabled, helper copy AC2a. |
| Exercise has completed sets but every recent set already has a clip | Record CTA disabled, helper copy AC2b. User uses per-clip Replace overflow to free a slot. |
| User taps Replace, records, hits Save | Prior row + files removed; new row + files saved in one tx + post-commit unlink (AC3). |
| User taps Replace, recording fails or user cancels | Prior clip preserved verbatim — no DB writes, no file unlinks (AC3b). |
| Replace transaction insert throws (FK violation, constraint, etc.) | drizzle rolls back the in-tx delete; prior row remains; new file orphan is reaped by `reconcileOrphans()` next tick. |
| 0 clips total | Settings card still tappable (AC5); sheet shows empty state with deep-link copy. |
| Storage stats stale after delete | Card refreshes via `onClipsChanged` on every delete and on sheet dismiss (AC5/AC6/AC7). |
| Web | All new UI hidden (AC8). |
| Very large clip count (>200) | List virtualizes via FlatList; bulk delete shows progress text. |
| Bulk delete: file already missing on disk (ENOENT) | Loop continues; row is still hard-deleted; no error toast (AC7). |
| Backup-exclusion failure during record | Existing FormVideoSheet behavior preserved (no regression). |
| User backgrounds app mid-bulk-delete | Loop pauses on suspension; resumes on next foreground if process still alive; if killed, half-deleted state has no DB rows for completed iterations and any orphan files are reaped by `reconcileOrphans()` on next boot. |
| In-flight session completes a new set on this exercise mid-screen | `getMostRecentCompletedSetForExercise` is read-once on mount; the new set is not picked up until the user re-enters the screen (acceptable; see Risk row). |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "Most recent set" attachment surprises users (clip lands on a set from days ago) | Medium | Low | Helper copy below CTA: "Saves to your most recent set: <date>"; show date in CTA tooltip and in FormVideoSheet header. |
| Bulk hard-delete leaves DB in inconsistent state if app is killed mid-loop | Low | Low | Each iteration is its own atomic DB delete; orphan files reaped by `reconcileOrphans()` next boot. ENOENT-tolerant. |
| Replace transaction file-unlink fails post-commit | Low | Low | Best-effort unlink; orphan file reaped by `reconcileOrphans()` next tick (existing pipeline). DB state is already correct. |
| Read-once race on most-recent-set resolution: an in-flight session completing a new set won't be picked up until the user re-enters the screen | Low | Low | Single-user, single-device app; one-line note documented in Edge Cases. Re-entering Exercise Details refreshes. |
| Renamed export breaking imports elsewhere | N/A | N/A | Rename dropped per nit-4. |
| FormVideoSheet contract change | Low | Medium | No contract changes — pass existing `setId`/`exerciseId` props; verify with existing FormVideoSheet tests. |
| User assumes inline record uploads to cloud | Low | Medium (privacy expectation) | Reuse existing privacy strip "Saved on this device only — never uploaded" verbatim from FormVideoSheet:235. |
| Confusion between soft-delete (per-row) and hard-delete (Delete all) — same bytes-on-disk behavior expected? | Medium | Low | Footer Delete-all copy explicitly says "permanently removes them from this device"; per-row delete copy stays generic ("Delete this clip?") since reconcile cleans it shortly. |

## Review Feedback

### Quality Director (UX) — REQUEST CHANGES (rev 1, 2026-05-09)
Verdict: blocking on data-safety + UX clarity.

Blockers:
1. Replace flow deletes prior clip too early — old clip lost if recording fails.
2. Default Record CTA must NOT target a set that already has a clip ("Add" should not silently become "Overwrite").
3. Helper return type is incomplete — must include `set_number` (FormVideoSheet consumes it).

Non-blocking: Manage sheet thumbnails — specify placeholder fallback so this ticket doesn't invent a thumbnail pipeline.

**rev-2 response:** All three blockers absorbed.
- Blocker 1 → Replace is now an explicit per-clip action with a UNIQUE-safe transaction (record + write file FIRST, then atomic tx { hardDelete + insert }, then best-effort unlink). Recording failure leaves the prior clip intact (AC3b). New tests `form-clips-replace.test.ts` + `form-clips-replace-rollback.test.ts` cover both paths.
- Blocker 2 → Record CTA targets `mustHaveNoClip: true`. If no eligible set, CTA is disabled with cause-specific helper (AC2a vs AC2b).
- Blocker 3 → `getMostRecentCompletedSetForExercise` returns `{ id, set_number, completed_at }`.
- Non-blocking → AC13 + UX section explicitly state thumbnails reuse the existing placeholder/icon pipeline.

_Awaiting QD re-review on rev-2._

### Tech Lead (Feasibility) — REQUEST CHANGES (rev 1, 2026-05-09)

Verdict: option (d) is the right architectural call but two data-layer blockers must be resolved before implementation.

**BLOCKER 1 — Replace flow violates UNIQUE(set_id)** — `softDeleteClip` keeps the row in the unique slot until reconciler runs; insert for same `set_id` will throw `SQLITE_CONSTRAINT_UNIQUE`.

**BLOCKER 2 — Delete-All won't reclaim space** — `softDeleteClip` loop satisfies stats (filtered by `pending_delete=0`) but bytes stay on disk until next reconcile tick.

Non-blocking nits 3–8: BLD-1094/1095 not re-triggered ✅; drop the rename; helper must include `set_number`; specify stats-refresh trigger; defer option (a); add race-window risk.

**rev-2 response:** All blockers and applicable nits absorbed.
- BLOCKER 1 → Replace flow now uses the recommended **option A** (transactional hard-delete + insert in one drizzle tx; post-commit file unlink). AC3 + AC3b spell out the order. Two new tests (`form-clips-replace.test.ts`, `form-clips-replace-rollback.test.ts`) prove no UNIQUE error and clean rollback. AC12 ("schema.ts byte-identical") preserved — no partial unique index introduced.
- BLOCKER 2 → `deleteAllClips()` now uses **hard-delete via `deleteClip(id, rel_path)` inside the loop**. AC7 explicitly requires `getStorageStats()` returns `{ count: 0, bytes: 0 }` and disk bytes are reclaimed; ENOENT tolerance documented. Per-row delete (AC6) keeps `softDeleteClip` for crash-recovery safety net.
- Nit 3 → Acknowledged ✅, no change needed.
- Nit 4 → Rename dropped; `FormClipsStorageRow` keeps its name and gets the `Pressable`+chevron in place.
- Nit 5 → Helper return type now includes `set_number` (typed in §New/changed files + AC1).
- Nit 6 → Stats-refresh wired via `onClipsChanged` callback **and** `useFocusEffect` on the card (AC5).
- Nit 7 → Option (a) explicitly deferred in §Out.
- Nit 8 → New Risk row + Edge-Case row for the read-once race.

_Awaiting Tech Lead re-review on rev-2._

### Psychologist (Behavior-Design)
N/A — Classification = NO. Re-trigger only if reviewers flag a missed behavior trigger.

### CEO Decision
Pending all reviewer re-approvals on rev-2.
