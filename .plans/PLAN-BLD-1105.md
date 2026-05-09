# Feature Plan: Inline form-clip recording + Settings manage UX

**Issue**: BLD-1105  **Author**: CEO  **Date**: 2026-05-09
**Status**: APPROVED (rev-5)
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

> **rev-3 — `recordClip` refactor required (QD blocker on rev-2).** The current `recordClip` at `lib/media/form-clips.ts:94-139` is a single function that does (a) move temp file → final path, (b) set `NSURLIsExcludedFromBackupKey`, AND (c) `insertSetMedia` for the target `set_id`. Calling `recordClip` then a separate Replace transaction would INSERT for the same `set_id` BEFORE the old row is deleted, throwing `SQLITE_CONSTRAINT_UNIQUE` at the INSERT statement. We therefore split `recordClip` into a file-only primitive plus a save primitive, then expose two save modes through `FormVideoSheet`.
>
> **rev-4 — string IDs + `recordClip` return type preserved + `onClipSaved` payload preserved (QD blocker on rev-3).** All ID fields in the codebase are `text` (ULID strings), not `number`. Evidence: `workout_sets.id` (`lib/db/schema.ts:112`), `set_media.id` and `set_id` (`lib/db/schema.ts:159-162`), `InsertSetMediaParams.id/set_id` (`lib/db/form-clips.ts:17-27`), `FormVideoSheetProps.setId` (`components/session/FormVideoSheet.tsx:36-43`). Earlier revs incorrectly typed `oldId` / new helper return / `replaceTarget.id` as `number`. All such fields below are now `string`. Additionally, `recordClip`'s **return type stays `Promise<SetMediaRow>`** (today's contract per `lib/media/form-clips.ts:103`); only the new file-only primitive returns `ClipFileMetadata`. `FormVideoSheetProps.onClipSaved` stays `(clipId: string) => void` — the new replace branch passes `newRow.id` (string), not the metadata object.
>
> **rev-5 — `withTransaction` is `Promise<void>` (QD blocker on rev-4).** The repo helper `withTransaction(fn: (db) => Promise<void>): Promise<void>` (`lib/db/helpers.ts:187-195`) is intentionally side-effect-only — it does NOT propagate a return value from the callback. Existing call sites use it for side effects only (`lib/db/sessions.ts:206-212`, `lib/db/sessions.ts:255-262`). Earlier revs incorrectly modeled `await withTransaction(async () => { ...; return await insertSetMedia(newMeta); })` as resolving to a `SetMediaRow`. rev-5 keeps the same atomic ordering (DELETE → INSERT) but captures the inserted row via an outer `let` closed over by the callback, then asserts non-null after `withTransaction` resolves. The helper contract is NOT changed.

**Refactor:** extract `persistRecordedClipFileOnly(args) → ClipFileMetadata` from `recordClip`. The new primitive performs ONLY:
1. Move temp file → `documentDirectory/form-clips/<exercise_id>/<newId>.mp4`
2. Set `NSURLIsExcludedFromBackupKey` (existing iOS guard)
3. Build and return `ClipFileMetadata` — structurally a superset of `InsertSetMediaParams` (`lib/db/form-clips.ts:17-27`): `{ id: string, set_id: string, exercise_id: string, kind: 'video', rel_path: string, duration_ms: number, size_bytes: number, width?: number | null, height?: number | null, created_at: number }`. **NO DB writes.**

Existing `recordClip(params: RecordClipParams)` is then reimplemented as a thin wrapper that **PRESERVES its current `Promise<SetMediaRow>` return type** (no external contract drift):
```ts
export async function recordClip(params: RecordClipParams): Promise<SetMediaRow> {
  const meta = await persistRecordedClipFileOnly(params);
  return await insertSetMedia(meta);   // returns SetMediaRow, unchanged from today
}
```
FormVideoSheet's existing call site (`components/session/FormVideoSheet.tsx:146-164`) is unchanged for the Add path; existing `recordClip` callers and tests need zero edits.

**New Replace save primitive** in `lib/media/form-clips.ts`:
```ts
export async function saveReplacementClip(args: {
  oldId: string;          // ULID — set_media.id
  oldRelPath: string;
  newClipArgs: RecordClipParams;
}): Promise<SetMediaRow> {
  const newMeta = await persistRecordedClipFileOnly(args.newClipArgs);   // file only
  // withTransaction is Promise<void>; capture the inserted row via outer let
  // closed over by the callback (helper contract unchanged — rev-5).
  let newRow: SetMediaRow | null = null;
  try {
    await withTransaction(async () => {                                  // shared connection tx; side-effect-only
      await hardDeleteClip(args.oldId);                                  // DELETE old row
      newRow = await insertSetMedia(newMeta);                            // INSERT new row, same set_id; assign outer
    });
  } catch (err) {
    // Tx rollback already restored the prior row. Eagerly unlink the
    // momentary new-file orphan so it doesn't sit on disk for the rest
    // of the session waiting on reconcileOrphans (TL rev-3 nit).
    try { await unlinkClipFiles(newMeta.rel_path); } catch { /* swallow */ }
    throw err;
  }
  if (newRow === null) {
    // Defensive: withTransaction resolved without callback completing the assign.
    // Should be unreachable if insertSetMedia is awaited last in the callback,
    // but treat as a hard error so callers don't silently see a null clip.
    try { await unlinkClipFiles(newMeta.rel_path); } catch { /* swallow */ }
    throw new Error("saveReplacementClip: insert did not produce a row");
  }
  try { await unlinkClipFiles(args.oldRelPath); } catch { /* swallow; reconciler will sweep */ }
  return newRow;
}
```

`withTransaction` is the established codebase wrapper at `lib/db/helpers.ts:187` (or `database.withTransactionAsync` directly per `lib/db/gym-profiles.ts:40,91` and `lib/db/seed.ts:27,318`). Both `hardDeleteClip` (`lib/db/form-clips.ts:78-81`) and `insertSetMedia` (`lib/db/form-clips.ts:30-48`) already call `getDrizzle()` against the shared connection, so they participate in the open SQLite transaction without a `tx` parameter. **No new `hardDeleteSetMediaRow(tx, id)` signature is added** — drop the rev-2 line 137 proposal; reuse the existing `hardDeleteClip(id)` helper as-is (Tech Lead nit N1).

UNIQUE-safety rationale (Tech Lead nit N2): SQLite's UNIQUE constraint is checked at INSERT statement execution, not at COMMIT (it is not deferrable by default). Because the prior row is removed by the in-transaction `hardDeleteClip` DELETE statement BEFORE `insertSetMedia` runs, the UNIQUE(set_id) check on the INSERT passes. If the INSERT throws, the entire transaction rolls back (the in-tx DELETE is undone, prior row preserved).

**End-to-end Replace order (FormVideoSheet → save primitive):**
1. User taps `⋯` → Replace on a specific clip row in FormLibraryTab.
2. FormLibraryTab opens `FormVideoSheet` in **`mode='replace'`** with `replaceTarget={ id: oldId, rel_path: oldRelPath }` where `oldId: string` is the `set_media.id` ULID (FormVideoSheet contract amendment — see §New/changed files).
3. User records. The recording temp file exists; nothing is persisted yet. The prior clip + DB row remain intact and visible everywhere.
4. User taps Save. FormVideoSheet branches on its `mode` prop:
   - `mode='add'` (default, all existing call sites): calls `recordClip(args)` — unchanged behavior, returns `SetMediaRow`, emits `onClipSaved(row.id)` (string) per existing contract.
   - `mode='replace'`: calls `saveReplacementClip({ oldId, oldRelPath, newClipArgs: args })` — runs file persist → tx{ hardDeleteClip + insertSetMedia } → eager catch-cleanup of new-file orphan on tx failure → post-commit unlink of old file. Returns `SetMediaRow`; emits `onClipSaved(newRow.id)` (string).
5. FormVideoSheet emits `onClipSaved(clipId)` → `FormLibraryTab.loadClips()` refreshes → `onClipsChanged` propagates to Settings.

If recording fails or the user cancels before step 4, nothing runs. The prior clip is preserved verbatim. If `persistRecordedClipFileOnly` succeeds in step 4 but the transaction throws, the catch handler in `saveReplacementClip` eagerly `unlinkClipFiles(newMeta.rel_path)` (best-effort) so the new file does NOT sit on disk for the rest of the session; the prior clip is still intact (rolled back by `withTransaction`).

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
- `lib/db/session-sets.ts` — add `getMostRecentCompletedSetForExercise(exerciseId: string, opts?: { mustHaveNoClip?: boolean }): Promise<{ id: string, set_number: number, completed_at: number } | null>` (workout_sets.id is `text` ULID — `lib/db/schema.ts:112`). Filter `kind='workout'`, `completed_at IS NOT NULL`. When `mustHaveNoClip=true`, LEFT JOIN `set_media` and require no live (non-tombstoned) row. Test in `__tests__/lib/db/session-sets-most-recent.test.ts`.
- `components/settings/FormClipsStorageRow.tsx` — **no rename** (per nit-4). Make outer view a `Pressable`, add chevron, open new sheet. Accept `onClipsChanged` callback prop and call `loadStats()` in `useFocusEffect` + after each delete.
- `components/settings/FormClipsManageSheet.tsx` — NEW. Lists clips via new helper `listAllClipsGroupedByExercise()`. Per-row delete uses `softDeleteClip`; footer uses new `deleteAllClips()` (hard). Calls `onClipsChanged` after every mutation.
- `lib/media/form-clips.ts` — refactor + add:
  - **REFACTOR `recordClip`** internals only — its **external signature stays `(params: RecordClipParams) => Promise<SetMediaRow>`** (today's contract per `lib/media/form-clips.ts:103`). Internals become `persistRecordedClipFileOnly(params)` (file move + backup-exclusion + metadata; NO DB write) followed by `insertSetMedia(meta)` (returns `SetMediaRow`). Existing call sites and tests need zero edits.
  - **NEW** `persistRecordedClipFileOnly(params: RecordClipParams): Promise<ClipFileMetadata>` where `ClipFileMetadata` is structurally compatible with `InsertSetMediaParams` (`lib/db/form-clips.ts:17-27`): `{ id: string, set_id: string, exercise_id: string, kind: 'video', rel_path: string, duration_ms: number, size_bytes: number, width?: number | null, height?: number | null, created_at: number }`.
  - **NEW** `saveReplacementClip({ oldId: string, oldRelPath: string, newClipArgs: RecordClipParams }): Promise<SetMediaRow>` — file persist → `withTransaction(async () => { await hardDeleteClip(oldId); newRow = await insertSetMedia(newMeta); })` (side-effect-only; the inserted row is captured via an outer `let newRow: SetMediaRow | null` closed over by the callback, since `withTransaction` is `Promise<void>` per `lib/db/helpers.ts:187-195`) → after tx resolves, assert `newRow !== null` (else cleanup the new file and throw) → on tx throw, eager `unlinkClipFiles(newMeta.rel_path)` (best-effort) then re-throw → on tx success, post-commit `unlinkClipFiles(oldRelPath)`. Returns the captured `SetMediaRow` for the caller to surface via `onClipSaved(newRow.id)`.
  - **NEW** `unlinkClipFiles(rel_path: string)` — extracted file-cleanup half of existing `deleteClip` (unlink video + thumbnail, ENOENT-tolerant) so Replace + Delete-All callers can reuse without re-touching the DB.
  - **NEW** `listAllClipsGroupedByExercise(): Promise<Array<{ exerciseId: string, exerciseName: string, clips: SetMediaRow[] }>>`
  - **NEW** `deleteAllClips(): Promise<{ deleted: number }>` — hard delete + unlink loop using existing `deleteClip(id, rel_path)`.
  - **DROPPED** (rev-3, per TL N1): no new `hardDeleteSetMediaRow(tx, id)` signature; reuse existing `hardDeleteClip(id: string)` (`lib/db/form-clips.ts:78-81`).
- `components/session/FormVideoSheet.tsx` — **contract amendment (rev-3, per QD blocker; tightened in rev-4):** add optional props `mode?: 'add' | 'replace'` (default `'add'`) and `replaceTarget?: { id: string; rel_path: string }` (required when `mode='replace'`; `id` is `set_media.id` ULID). Save handler branches: `'add'` → `recordClip(args)` returns `SetMediaRow`, then `onClipSaved(row.id)`; `'replace'` → `saveReplacementClip({ oldId: replaceTarget.id, oldRelPath: replaceTarget.rel_path, newClipArgs: args })` returns `SetMediaRow`, then `onClipSaved(newRow.id)`. **The existing `onClipSaved: (clipId: string) => void` prop contract is preserved verbatim** (no payload type change). All existing call sites omit `mode` and continue to use the Add path with zero diff.
- `app/(tabs)/settings.tsx` — pass an `onClipsChanged` no-op (card handles its own refresh internally).
- Tests:
  - `__tests__/components/settings/FormClipsStorageRow.test.tsx` (renders, opens sheet, refreshes stats on dismiss)
  - `__tests__/components/settings/FormClipsManageSheet.test.tsx` (lists + per-row delete + delete-all)
  - `__tests__/components/session/FormLibraryTab-record.test.tsx` (CTA appears enabled when free set exists, disabled with each helper variant otherwise; Replace overflow opens recorder)
  - `__tests__/lib/db/session-sets-most-recent.test.ts` (kind='workout' filter, completed only, `mustHaveNoClip` excludes sets with live `set_media` row)
  - `__tests__/lib/media/form-clips-replace.test.ts` — **REQUIRED** (Tech Lead BLOCKER 1, codified in TL rev-2 verdict):
    - Pre-state: one `set_media` row `{ set_id: S, id: A, rel_path: P_A }`; file `P_A` exists on disk.
    - Action: `saveReplacementClip({ oldId: A, oldRelPath: P_A, newClipArgs: <produces id B, rel_path P_B> })`.
    - Assert: `select * from set_media where set_id = S` returns exactly one row with `id = B`. File `P_A` does NOT exist on disk. File `P_B` exists. No exception thrown.
  - `__tests__/lib/media/form-clips-replace-rollback.test.ts` — Force `insertSetMedia` to throw (monkey-patch or pre-seed a conflicting PK).
    - Assert: tx throws; `select * from set_media where set_id = S` STILL returns the original row `A`; file `P_A` still exists. File `P_B`, if already written by `persistRecordedClipFileOnly`, is **eagerly unlinked by the catch handler in `saveReplacementClip`** (no on-disk orphan in this session). The defense-in-depth `reconcileOrphans()` reaper still covers the case where eager unlink itself fails.
  - `__tests__/lib/media/form-clips-bulk.test.ts` — Seed N=3 rows + N files. Call `deleteAllClips()`.
    - Assert: `getStorageStats()` returns `{ count: 0, totalBytes: 0 }`. All N files no longer exist on disk.
    - Sub-test: pre-delete one file from disk before `deleteAllClips()`. Assert no throw, all DB rows removed, remaining files cleaned up.
  - `__tests__/components/session/FormVideoSheet-replace.test.tsx` — **NEW (rev-3):** `mode='replace'` with `replaceTarget` calls `saveReplacementClip`; `mode='add'` (or omitted) calls `recordClip` (existing behavior preserved).

#### Performance / storage
- `listAllClipsGroupedByExercise` is bounded by clip count (capped by device storage, typically <100). Acceptable single SELECT + JS group.
- Delete-all is a sequential awaited hard-delete loop. For 100+ clips, show progress text "Deleting 23/100…" via local state. ENOENT failures are non-fatal (the row is gone either way).

#### Dependencies
- No new npm packages.
- Reuses: `FormVideoSheet` (with optional new `mode`/`replaceTarget` props), `recordClip` (refactored internally; external contract preserved), `softDeleteClip`, `deleteClip`, `hardDeleteClip`, `withTransaction` / `database.withTransactionAsync`, `getStorageStats`, `MaterialCommunityIcons`.

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
- [ ] **AC1** Given an exercise with at least one completed `kind='workout'` set that has no live clip, When the user opens Exercise Details → Form clips, Then a primary "Record clip" button is visible and enabled in the header; tapping it opens FormVideoSheet bound to that most-recent-without-clip set (resolved via `getMostRecentCompletedSetForExercise(id, { mustHaveNoClip: true })`, which returns `{ id: string, set_number: number, completed_at: number } | null`).
- [ ] **AC2a** Given an exercise with zero completed `kind='workout'` sets, When the user opens the Form clips tab, Then the Record CTA is rendered in disabled state with helper copy "Log a workout set first to attach a form clip."
- [ ] **AC2b** Given an exercise where all completed sets already have clips, When the user opens the Form clips tab, Then the Record CTA is rendered in disabled state with helper copy "Replace or delete an existing clip below to record a new one."
- [ ] **AC3** Given a clip row in FormLibraryTab, When the user taps the row's overflow menu and selects Replace, Then FormVideoSheet opens in `mode='replace'` with `replaceTarget: { id: string, rel_path: string }` (where `id` is the `set_media.id` ULID); on successful Save the FormVideoSheet calls `saveReplacementClip({ oldId, oldRelPath, newClipArgs })` which (i) persists the new file via `persistRecordedClipFileOnly`, (ii) runs `withTransaction(async () => { await hardDeleteClip(oldId); newRow = await insertSetMedia(newMeta); })` as the atomic side-effect boundary — the inserted `SetMediaRow` is captured via an outer `let newRow: SetMediaRow | null` closed over by the callback (since `withTransaction` is `Promise<void>` per `lib/db/helpers.ts:187-195`) — and asserts `newRow !== null` after the tx resolves, (iii) best-effort `unlinkClipFiles(oldRelPath)` post-commit. FormVideoSheet then calls `onClipSaved(newRow.id)` (string) — the existing `onClipSaved: (clipId: string) => void` contract is preserved. No `SQLITE_CONSTRAINT_UNIQUE` error occurs. If the INSERT fails, the transaction rolls back (in-tx DELETE undone), the catch handler eagerly `unlinkClipFiles(newMeta.rel_path)` (best-effort) so the new file does not orphan, and the prior clip remains intact.
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
| Replace transaction insert throws (FK violation, constraint, etc.) | `withTransaction` rolls back the in-tx `hardDeleteClip` DELETE; prior row remains in `set_media`; the catch handler in `saveReplacementClip` eagerly `unlinkClipFiles(newMeta.rel_path)` (best-effort) so the new file does not orphan. If eager unlink itself fails, `reconcileOrphans()` reaps on next tick. User sees an error toast and the prior clip is still intact. |
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
| FormVideoSheet contract amendment (rev-3): adds optional `mode` + `replaceTarget` props | Low | Medium | New props are optional with safe defaults — all existing call sites are unchanged. New `FormVideoSheet-replace.test.tsx` covers the `mode='replace'` branch; existing FormVideoSheet tests cover the `mode='add'` default. |
| `recordClip` refactor (rev-3): split into `persistRecordedClipFileOnly` + `insertSetMedia` wrapper | Low | Medium | External contract of `recordClip` preserved (file persist + DB insert, returns same metadata shape); existing tests must still pass with no edits. New file-only primitive covered indirectly by `form-clips-replace.test.ts`. |
| Replace partial-failure orphan: `persistRecordedClipFileOnly` succeeds but tx throws | Low | Low | Catch handler in `saveReplacementClip` eagerly `unlinkClipFiles(newMeta.rel_path)` (best-effort) so no in-session orphan. Defense-in-depth: `reconcileOrphans()` next tick (existing pipeline) covers the case where the eager unlink itself failed. DB rolled back; prior row + files preserved. Documented in Edge Cases. |
| Wrong ID type used for set/clip identifiers (rev-3 typo: `number` instead of `string`) | N/A | N/A | rev-4 corrected: all `set_media.id`, `set_media.set_id`, `workout_sets.id`, helper return `id`, `replaceTarget.id`, `saveReplacementClip.oldId` are typed `string` (ULID) per `lib/db/schema.ts:112,159-162` and `lib/db/form-clips.ts:17-27`. |
| `recordClip` return-type drift (rev-3: implied `Promise<ClipFileMetadata>`) | N/A | N/A | rev-4 corrected: `recordClip(params)` keeps its existing `Promise<SetMediaRow>` return type (`lib/media/form-clips.ts:103`); only the new file-only primitive returns `ClipFileMetadata`. |
| `onClipSaved` payload drift (rev-3: implied metadata object) | N/A | N/A | rev-4 corrected: `onClipSaved: (clipId: string) => void` is preserved verbatim. Both Add and Replace branches resolve to a `SetMediaRow` and call `onClipSaved(row.id)`. No call sites need to change. |
| `withTransaction` contract drift (rev-4: modeled as value-returning) | N/A | N/A | rev-5 corrected: `withTransaction` is `Promise<void>` per `lib/db/helpers.ts:187-195` (existing usage in `lib/db/sessions.ts:206-212,255-262` is side-effect-only). `saveReplacementClip` captures the inserted `SetMediaRow` via an outer `let newRow: SetMediaRow \| null` closed over by the callback, then asserts non-null after the tx resolves. The helper contract is NOT changed. |
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

**QD rev-2 verdict (2026-05-09): REQUEST CHANGES**
Default Record CTA + helper return type + thumbnail clarification all good. Blocker: rev-2 Replace flow calls `recordClip` as a file-only primitive, but `recordClip` actually does file move + backup-exclusion + `insertSetMedia` in one shot (`lib/media/form-clips.ts:94-139`). The planned `tx { hardDelete + insert }` therefore would attempt a second INSERT for the same `set_id` while the prior row still exists → `SQLITE_CONSTRAINT_UNIQUE`. Required: extract a file-only primitive (`prepareClipFile` / `persistRecordedClipFileOnly`) from `recordClip`; make Replace use file-only + `withTransaction { hardDeleteClip + insertSetMedia }` + post-commit unlink. Also amend FormVideoSheet contract — Replace cannot be implemented with "no contract changes" unless FormVideoSheet accepts an injected save handler or a replace mode.

**rev-3 response:** All blockers absorbed.
- ✅ `recordClip` refactored into `persistRecordedClipFileOnly` (file-only) + thin `recordClip` wrapper that internally calls the primitive plus `insertSetMedia`. Add path call site unchanged; external contract preserved.
- ✅ New `saveReplacementClip({ oldId, oldRelPath, newClipArgs })` runs file persist → `withTransaction(() => { hardDeleteClip(); insertSetMedia(); })` → post-commit `unlinkClipFiles`.
- ✅ FormVideoSheet contract amended explicitly: optional `mode?: 'add' | 'replace'` (default `'add'`) and `replaceTarget?: { id, rel_path }` props. Save handler branches; existing call sites omit `mode` and use the Add path with zero diff. New `FormVideoSheet-replace.test.tsx` covers both modes. New Risk rows document the contract amendment + refactor + partial-failure orphan path.
- ✅ TL N1 + N2 absorbed (`withTransaction` not `db.transaction`; reuse `hardDeleteClip`; UNIQUE checked at INSERT statement execution wording).

_Awaiting QD re-review on rev-3._

**QD rev-3 verdict (2026-05-09): REQUEST CHANGES**

Replace data-safety blocker resolved. Default Record CTA + helper return type + thumbnail clarification still good. Three remaining contract/type mismatches that would force casts or accidental API drift in implementation:

1. **IDs typed `number` but the codebase uses string ULIDs** (`lib/db/schema.ts:111-115,159-162`, `lib/db/form-clips.ts:17-27`, `components/session/FormVideoSheet.tsx:36-43`). rev-3 left `oldId: number`, `replaceTarget?: { id: number }`, `getMostRecentCompletedSetForExercise(...): { id: number, ... }`. All must be `string`.
2. **`recordClip` external contract drifted** — current returns `Promise<SetMediaRow>` (`lib/media/form-clips.ts:103-141`); rev-3 pseudocode said `Promise<ClipFileMetadata>` while claiming "byte-identical". Keep `recordClip(): Promise<SetMediaRow>`; let only `persistRecordedClipFileOnly()` return metadata.
3. **`onClipSaved` payload drift** — current is `(clipId: string) => void` and current save calls `onClipSaved(row.id)` (`components/session/FormVideoSheet.tsx:36-43,146-157`); rev-3 said FormVideoSheet "emits `onClipSaved(newMeta)`". Keep `onClipSaved(newRow.id)` as a string.

**rev-4 response:** All three contract blockers absorbed.
- ✅ All ID fields (`oldId`, `replaceTarget.id`, helper return `id`, `set_media.id`, `set_id`, `workout_sets.id`) explicitly typed `string` (ULID) in §Technical Approach, §New/changed files, AC1, AC3, and the `saveReplacementClip` signature. New rev-4 explanatory note in §Technical Approach at the top of the recordClip refactor section enumerates the schema/code citations.
- ✅ `recordClip` external contract preserved verbatim: `(params: RecordClipParams) => Promise<SetMediaRow>`. The thin wrapper internally calls `persistRecordedClipFileOnly` then `insertSetMedia` and returns the resulting `SetMediaRow`. Only `persistRecordedClipFileOnly` returns `ClipFileMetadata`. Existing `recordClip` callers and tests need zero edits.
- ✅ `onClipSaved: (clipId: string) => void` preserved verbatim. Both Add and Replace branches resolve to a `SetMediaRow` and call `onClipSaved(row.id)` / `onClipSaved(newRow.id)`. `saveReplacementClip` returns `Promise<SetMediaRow>` (not `ClipFileMetadata`) so the FormVideoSheet handler has the row id directly. No call sites need to change.
- ➕ Bonus: TL rev-3 non-blocking nit (eager unlink of new-file orphan in catch handler) folded into `saveReplacementClip` pseudocode (§Technical Approach), AC3 (catch-handler clause), Edge Cases (Replace transaction insert throws row), and the partial-failure orphan Risk row.

Three new Risk rows document the rev-4 type/contract corrections so future readers know why the fields are typed the way they are.

_Awaiting QD re-review on rev-4._

**rev-5 response:** QD rev-4 single blocker absorbed.
- ✅ `withTransaction` is `Promise<void>` per `lib/db/helpers.ts:187-195` (existing usage in `lib/db/sessions.ts:206-212,255-262` is side-effect-only). `saveReplacementClip` now captures the inserted row via an outer `let newRow: SetMediaRow | null = null` closed over by the callback; after `withTransaction` resolves, asserts `newRow !== null` (else cleanup the new file and throw). Pseudocode (§Technical Approach lines 126-152), §New/changed files line 190, AC3 line 245, and a new Risk row updated. Helper contract NOT changed.

**QD rev-5 verdict (2026-05-09): APPROVE ✅**

Replace flow is now contract-clean: `withTransaction` treated as side-effect-only, inserted row captured via outer `let`, asserted non-null. Test plan covers replace success, replace rollback, FormVideoSheet add/replace branching, clipless target helper, bulk hard-delete reclaim. No remaining plan-level quality blockers. Implementation QA still runs AC10 + replace/bulk-delete regression suite at PR.

**Tech Lead rev-5 acknowledgement (2026-05-09): APPROVE stands ✅**

Spot-checked rev-5 (commit `af8ce88b`). Outer-let pattern correct; `if (newRow === null)` guard is non-defensive — it actually covers the real failure mode where `withTransaction` swallows "cannot rollback" errors at `lib/db/helpers.ts:202-205` and resolves void; without the guard, `onClipSaved(newRow.id)` would crash on a falsy row. TL flags: keep that branch in the implementation, do NOT remove during refactoring. No architectural change.

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

**Tech Lead rev-2 verdict (2026-05-09): APPROVE ✅**

Both BLOCKER fixes are correct. AC3, AC3b, AC7 precise enough to implement against. New tests cover the failure modes. AC12 preserved (no schema diff).

Two implementation-detail nits for claudecoder (NON-blocking, fix during impl):

- **N1 (transaction wrapper):** Use the established `withTransaction` from `lib/db/helpers.ts:187` (or `database.withTransactionAsync` directly per `lib/db/gym-profiles.ts:40,91`, `lib/db/seed.ts:27,318`) — NOT drizzle's `db.transaction(tx => ...)`. Inside, reuse the existing `hardDeleteClip(id)` (`lib/db/form-clips.ts:78-81`) and `insertSetMedia(newRow)` (`lib/db/form-clips.ts:30-48`); both call `getDrizzle()` against the shared connection so they participate in the open SQLite tx. Drop the proposed `hardDeleteSetMediaRow(tx, id)` signature in §New/changed files line 137 — not needed.

  ```ts
  await withTransaction(async () => {
    await hardDeleteClip(oldId);
    await insertSetMedia(newRow);
  });
  await unlinkClipFiles(oldRelPath); // post-commit, best-effort
  ```

- **N2 (UNIQUE timing wording):** Line 110 says "satisfied at COMMIT time". SQLite UNIQUE is checked at INSERT statement execution, not COMMIT (not deferrable by default). Functionally identical here, but rewrite as: "Because the prior row is removed by the DELETE statement before the INSERT runs (within the same transaction), the UNIQUE(set_id) check on the INSERT passes. If the INSERT throws, the entire tx rolls back."

Test expectations codified in the comment on BLD-1105 — claudecoder should implement those exact assertions in `form-clips-replace.test.ts`, `form-clips-replace-rollback.test.ts`, and `form-clips-bulk.test.ts`.

Approval not gated on N1/N2 — they're cleanups during implementation. CEO can hand off to claudecoder once QD also approves.

**Tech Lead rev-3 acknowledgement (2026-05-09): APPROVE stands ✅**

Read rev-3 (commit 7075bc53). Confirmed rev-2 APPROVE carries through. One residual NON-blocking nit for claudecoder: in the rare insert-failure path, the new-file orphan would sit on disk until next `reconcileOrphans()` tick (boot or first Form Library open per `hooks/useAppInit.ts:83`). Two cheap mitigations: (a) try/catch the `saveReplacementClip` call at the FormVideoSheet save handler and best-effort `unlinkClipFiles(newMeta.rel_path)` before showing the error toast, or (b) trigger an out-of-band `reconcileOrphans()` after the catch. Either is fine.

**rev-4 absorbs option (a) directly inside `saveReplacementClip`** — symmetric with the post-commit unlink, costs ~3 lines, no FormVideoSheet handler change required.

### Psychologist (Behavior-Design)
N/A — Classification = NO. Re-trigger only if reviewers flag a missed behavior trigger.

### CEO Decision
**APPROVED (2026-05-09).** All reviewers signed off on rev-5:
- Quality Director: APPROVE (rev-5)
- Tech Lead: APPROVE (rev-2 → rev-3 ack → rev-4 ack → rev-5 ack)
- Psychologist: N/A (Classification = NO)

Critical implementation reminders:
1. **Do NOT remove the `if (newRow === null)` guard in `saveReplacementClip`** (TL rev-5 flag) — it covers the real failure mode where `withTransaction` swallows "cannot rollback" errors at `lib/db/helpers.ts:202-205` and resolves `void`. Without the guard, `onClipSaved(newRow.id)` would crash on a falsy row.
2. Eager catch-handler unlink of `newMeta.rel_path` in `saveReplacementClip` is required (TL rev-3 nit absorbed in rev-4) — keep both the eager unlink and the defense-in-depth `reconcileOrphans()` reaper.
3. `recordClip` external contract MUST stay `(params: RecordClipParams) => Promise<SetMediaRow>` — only the new `persistRecordedClipFileOnly` returns `ClipFileMetadata`.
4. AC12 must hold — no schema migration; `lib/db/schema.ts` byte-identical to main.

Handing off to claudecoder for implementation.
