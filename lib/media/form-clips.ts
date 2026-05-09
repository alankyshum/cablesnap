/**
 * lib/media/form-clips.ts
 *
 * Core operations for Form Check Videos (BLD-1092).
 *
 * PRIVACY INVARIANTS — do not remove:
 *   1. This module MUST NOT make any network calls.
 *   2. rel_path values MUST NOT appear in Sentry crash breadcrumbs or
 *      attachments (see AC12 gate in app/_layout.tsx).
 *   3. clip bytes MUST NOT be included in CSV export (enforced by ESLint).
 *
 * File layout: ${documentDirectory}form-clips/<exerciseId>/<clipId>.mp4
 *              ${documentDirectory}form-clips/<exerciseId>/.thumbs/<clipId>.jpg
 * See lib/media/README.md for the full contract.
 */
import { File, Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { uuid } from "../uuid";
import {
  insertSetMedia,
  getClipsForExercise as dbGetClipsForExercise,
  getClipForSet as dbGetClipForSet,
  softDeleteClip as dbSoftDeleteClip,
  hardDeleteClip as dbHardDeleteClip,
  getAllSetMediaRows,
  getAllLiveSetMediaWithExerciseName,
  getSetMediaStats as dbGetSetMediaStats,
  deleteClipsForSet as dbDeleteClipsForSet,
  deleteSetMediaForSession as dbDeleteSetMediaForSession,
} from "../db/form-clips";
import { withTransaction } from "../db/helpers";
import type { SetMediaRow } from "../db/form-clips";
import {
  FORM_CLIPS_DIR,
  ensureDir,
  excludeFromBackup,
  toAbsPath,
  toRelPath,
} from "./set-media-common";
import { unlinkSetupPhotoFiles } from "./setup-photos";

export type { SetMediaRow };

const THUMBS_DIR = ".thumbs";
const ORPHAN_GRACE_MS = 30_000;

/** Directory object for root form-clips directory. */
function clipsRootDir(): Directory {
  return new Directory(Paths.document, FORM_CLIPS_DIR);
}

/** File object for a clip. */
function clipFile(exerciseId: string, clipId: string): File {
  return new File(Paths.document, `${FORM_CLIPS_DIR}/${exerciseId}/${clipId}.mp4`);
}

/** File object for a thumbnail. */
function thumbFile(exerciseId: string, clipId: string): File {
  return new File(Paths.document, `${FORM_CLIPS_DIR}/${exerciseId}/${THUMBS_DIR}/${clipId}.jpg`);
}

export { toAbsPath, toRelPath };

// ---------------------------------------------------------------------------
// recordClip
// ---------------------------------------------------------------------------

export interface RecordClipParams {
  setId: string;
  exerciseId: string;
  /** Absolute file URI returned by expo-camera recordAsync. */
  uri: string;
  durationMs?: number | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}

// ---------------------------------------------------------------------------
// recordClip (public type for metadata returned by file-only primitive)
// ---------------------------------------------------------------------------

export interface ClipFileMetadata {
  id: string;
  set_id: string;
  exercise_id: string;
  kind: "video";
  rel_path: string;
  duration_ms?: number | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  created_at: number;
}

/**
 * BLD-1105: File-only half of recordClip.
 * Moves the temp recording to the permanent location and sets iOS backup-exclusion.
 * Does NOT write to the database — returns metadata for the caller to INSERT.
 */
export async function persistRecordedClipFileOnly(
  params: RecordClipParams
): Promise<ClipFileMetadata> {
  if (Platform.OS === "web") {
    throw new Error("Form clips are not supported on web");
  }

  const { setId, exerciseId, uri, durationMs, sizeBytes, width, height } = params;
  const clipId = uuid();
  const destFile = clipFile(exerciseId, clipId);
  const destDir = new Directory(Paths.document, `${FORM_CLIPS_DIR}/${exerciseId}`);

  ensureDir(destDir);

  const sourceFile = new File(uri);
  sourceFile.move(destFile);

  await excludeFromBackup(destFile.uri);

  return {
    id: clipId,
    set_id: setId,
    exercise_id: exerciseId,
    kind: "video",
    rel_path: toRelPath(destFile.uri),
    duration_ms: durationMs,
    size_bytes: sizeBytes,
    width,
    height,
    created_at: Date.now(),
  };
}

/**
 * Save a recorded clip for a set.
 *
 * Preserved external contract: (params: RecordClipParams) => Promise<SetMediaRow>.
 * Internals delegate to persistRecordedClipFileOnly + insertSetMedia.
 *
 * Order: write file → exclude from backup (iOS) → INSERT set_media row.
 * A crash before INSERT leaves an orphaned file; reconcileOrphans() cleans it.
 */
export async function recordClip(params: RecordClipParams): Promise<SetMediaRow> {
  const meta = await persistRecordedClipFileOnly(params);
  return await insertSetMedia(meta);
}

/**
 * BLD-1105: Unlink a clip's video + thumbnail files from disk (ENOENT-tolerant).
 * Extracted from deleteClip so Replace and Delete-All callers can reuse it
 * without touching the DB.
 */
export async function unlinkClipFiles(relPath: string): Promise<void> {
  try {
    const f = new File(Paths.document, relPath);
    if (f.exists) f.delete();
    const parts = relPath.split("/");
    const filename = parts[parts.length - 1];
    const clipId = filename.replace(/\.mp4$/, "");
    const exerciseId = parts[parts.length - 2];
    if (clipId && exerciseId) {
      const thumb = thumbFile(exerciseId, clipId);
      if (thumb.exists) thumb.delete();
    }
  } catch {
    // ENOENT / permission errors are non-fatal.
  }
}

/**
 * BLD-1105: UNIQUE-safe replace flow.
 *
 * File-persist → withTransaction { hardDeleteClip(old) + insertSetMedia(new) }
 * → post-commit unlink old file.
 *
 * The inserted row is captured via an outer let since withTransaction is Promise<void>.
 * If the transaction fails, eagerly unlinks the new file (best-effort) before re-throwing.
 */
export async function saveReplacementClip(args: {
  oldId: string;
  oldRelPath: string;
  newClipArgs: RecordClipParams;
}): Promise<SetMediaRow> {
  const newMeta = await persistRecordedClipFileOnly(args.newClipArgs);
  let newRow: SetMediaRow | null = null;
  try {
    await withTransaction(async () => {
      await dbHardDeleteClip(args.oldId);
      newRow = await insertSetMedia(newMeta);
    });
  } catch (err) {
    try { await unlinkClipFiles(newMeta.rel_path); } catch { /* swallow */ }
    throw err;
  }
  if (newRow === null) {
    // CRITICAL: covers the real failure mode where withTransaction swallows
    // "cannot rollback" errors (lib/db/helpers.ts:202-205) and resolves void.
    // Without this guard, onClipSaved(newRow.id) would crash on a falsy row.
    try { await unlinkClipFiles(newMeta.rel_path); } catch { /* swallow */ }
    throw new Error("saveReplacementClip: insert did not produce a row");
  }
  try { await unlinkClipFiles(args.oldRelPath); } catch { /* swallow; reconciler will sweep */ }
  return newRow;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Get the clip for a specific set, or null. Returns null on web. */
export async function getClipForSet(setId: string): Promise<SetMediaRow | null> {
  if (Platform.OS === "web") return null;
  return dbGetClipForSet(setId);
}

/**
 * Get all clips for an exercise, reverse-chronological.
 * Returns [] on web (web hides all form-clips UI per AC16).
 */
export async function getClipsForExercise(exerciseId: string): Promise<SetMediaRow[]> {
  if (Platform.OS === "web") return [];
  return dbGetClipsForExercise(exerciseId);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Soft-delete a clip by id (sets pending_delete = 1, hides from UI).
 * reconcileOrphans() unlinks the file later.
 */
export async function softDeleteClip(id: string): Promise<void> {
  await dbSoftDeleteClip(id);
}

/**
 * Hard-delete a clip: DB row first, then unlink file.
 * ENOENT on unlink is swallowed idempotently (file may already be gone).
 * Used by reconcileOrphans() and explicit "delete now" flows.
 */
export async function deleteClip(id: string, relPath: string): Promise<void> {
  await dbHardDeleteClip(id);
  try {
    const f = new File(Paths.document, relPath);
    if (f.exists) f.delete();
    // Also remove thumbnail if it exists.
    const parts = relPath.split("/");
    const filename = parts[parts.length - 1];
    const clipId = filename.replace(/\.mp4$/, "");
    const exerciseId = parts[parts.length - 2];
    if (clipId && exerciseId) {
      const thumb = thumbFile(exerciseId, clipId);
      if (thumb.exists) thumb.delete();
    }
  } catch {
    // ENOENT / permission errors are non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Cascade delete — called by DB service layer on parent-set/session removal
// ---------------------------------------------------------------------------

/**
 * Delete all clips (files + DB rows) for the given set IDs.
 *
 * Must be called BEFORE the corresponding workout_sets rows are deleted so
 * rel_path data is still available for file cleanup.
 *
 * File-unlink errors (ENOENT, permission) are swallowed — the DB row is
 * removed regardless so ghost rows do not accumulate.
 */
export async function cascadeDeleteClipsForSets(setIds: string[]): Promise<void> {
  if (Platform.OS === "web" || setIds.length === 0) return;
  const rows = await getAllSetMediaRows();
  const targets = rows.filter((r) => setIds.includes(r.set_id));
  for (const row of targets) {
    if (row.kind === "setup_photo") {
      await dbHardDeleteClip(row.id);
      await unlinkSetupPhotoFiles(row.rel_path);
    } else {
      await deleteClip(row.id, row.rel_path);
    }
  }
  // Belt-and-braces: remove any DB rows whose files may already be gone
  // (deleteClip already deletes the DB row via dbHardDeleteClip, but call
  // dbDeleteClipsForSet to cover rows missed by the in-memory filter).
  for (const setId of setIds) {
    await dbDeleteClipsForSet(setId);
  }
}

/**
 * Cascade-delete all clips for a workout session.
 *
 * Resolves set IDs from workout_sets internally — the caller does NOT need to
 * pre-select them.  File unlinks happen before the DB delete so ENOENT is
 * swallowed idempotently.  Must be called BEFORE the workout_sets rows are
 * deleted (file cleanup uses rel_path stored on set_media).
 */
export async function cascadeDeleteClipsForSession(sessionId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const rows = await dbDeleteSetMediaForSession(sessionId);
  for (const row of rows) {
    if (row.kind === "setup_photo") {
      await unlinkSetupPhotoFiles(row.rel_path);
    } else {
      await unlinkClipFiles(row.rel_path);
    }
  }
}

// ---------------------------------------------------------------------------
// reconcileOrphans
// ---------------------------------------------------------------------------

/** Step 2: Hard-delete all pending_delete rows (unlink file, then DB delete). */
async function sweepPendingDeletes(rows: Awaited<ReturnType<typeof getAllSetMediaRows>>): Promise<void> {
  const pendingRows = rows.filter((r) => r.pending_delete === 1);
  for (const row of pendingRows) {
    try {
      const f = new File(Paths.document, row.rel_path);
      if (f.exists) f.delete();
    } catch {
      // Swallow ENOENT — AC18e.
    }
    await dbHardDeleteClip(row.id);
  }
}

/**
 * Step 4: For a single file entry, unlink if it is an orphan (absent from
 * liveRelPaths and older than ORPHAN_GRACE_MS).
 */
function maybeUnlinkOrphan(fileEntry: File, liveRelPaths: Set<string>, nowMs: number, allowedExt = ".mp4"): void {
  if (!fileEntry.uri.endsWith(allowedExt)) return;
  const relPath = toRelPath(fileEntry.uri);
  if (liveRelPaths.has(relPath)) return;
  try {
    if (!fileEntry.exists) return;
    const info = fileEntry.info();
    const mtime = info.modificationTime;
    if (mtime !== null && mtime !== undefined && nowMs - mtime < ORPHAN_GRACE_MS) return;
    fileEntry.delete();
  } catch {
    // Non-fatal.
  }
}

/**
 * Run on app boot and on first Form Library open after launch.
 *
 * Algorithm (AC18, TL rev-2):
 * 1. Snapshot DB rows BEFORE enumerating the FS.
 * 2. For each pending_delete=1 row: unlink (swallow ENOENT), then DELETE row.
 * 3. Enumerate FS under form-clips/.
 * 4. Files absent from snapshot AND modificationTime > 30s old → unlink (orphan).
 * 5. Rows with pending_delete=0 but file missing → leave in place (UI shows placeholder).
 */
export async function reconcileOrphans(): Promise<void> {
  if (Platform.OS === "web") return;

  // Step 1: snapshot DB before FS enumeration (prevents concurrent-write race — AC18d).
  const allRows = await getAllSetMediaRows();
  const liveRelPaths = new Set(
    allRows.filter((r) => r.pending_delete === 0).map((r) => r.rel_path)
  );

  // Step 2: sweep pending_delete rows.
  await sweepPendingDeletes(allRows);

  // Step 3: enumerate filesystem.
  const root = clipsRootDir();
  if (!root.exists) return;

  const nowMs = Date.now();
  const exerciseEntries = root.list();

  for (const entry of exerciseEntries) {
    if (!(entry instanceof Directory)) continue;
    let files: (File | Directory)[];
    try {
      files = entry.list();
    } catch {
      continue;
    }
    for (const fileEntry of files) {
      if (fileEntry instanceof File) {
        maybeUnlinkOrphan(fileEntry, liveRelPaths, nowMs);
      }
    }
  }

  const setupRoot = new Directory(Paths.document, "set-media");
  if (!setupRoot.exists) return;
  for (const entry of setupRoot.list()) {
    if (entry instanceof File) {
      maybeUnlinkOrphan(entry, liveRelPaths, nowMs, ".jpg");
    }
  }
}

// ---------------------------------------------------------------------------
// Storage stats
// ---------------------------------------------------------------------------

export interface StorageStats {
  /** Total size of all live clips in bytes (from set_media rows). */
  totalBytes: number;
  /** Number of live clips. */
  count: number;
}

/** Returns storage stats from DB (fast). Returns {0, 0} on web. */
export async function getStorageStats(): Promise<StorageStats> {
  if (Platform.OS === "web") return { totalBytes: 0, count: 0 };
  const stats = await dbGetSetMediaStats();
  return { totalBytes: stats.totalBytes, count: stats.count };
}

// ---------------------------------------------------------------------------
// Manage sheet helpers (BLD-1105)
// ---------------------------------------------------------------------------

export interface ClipGroupedByExercise {
  exerciseId: string;
  exerciseName: string;
  clips: SetMediaRow[];
}

/**
 * BLD-1105: Get all live clips grouped by exercise, for FormClipsManageSheet.
 * Exercise name falls back to exerciseId if not found in exercises table.
 */
export async function listAllClipsGroupedByExercise(): Promise<ClipGroupedByExercise[]> {
  if (Platform.OS === "web") return [];
  const rows = await getAllLiveSetMediaWithExerciseName();
  const map = new Map<string, ClipGroupedByExercise>();
  for (const row of rows) {
    const group = map.get(row.exercise_id);
    const exerciseName = row.exercise_name ?? row.exercise_id;
    if (group) {
      group.clips.push(row);
    } else {
      map.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        exerciseName,
        clips: [row],
      });
    }
  }
  return Array.from(map.values());
}

/**
 * BLD-1105: Hard-delete all live clips — DB rows AND files.
 * Uses existing deleteClip (hard delete + unlink, ENOENT-tolerant) so
 * getStorageStats() returns {count:0, bytes:0} immediately after.
 */
export async function deleteAllClips(): Promise<{ deleted: number }> {
  if (Platform.OS === "web") return { deleted: 0 };
  const rows = await getAllLiveSetMediaWithExerciseName();
  let deleted = 0;
  for (const row of rows) {
    await deleteClip(row.id, row.rel_path);
    deleted++;
  }
  return { deleted };
}
