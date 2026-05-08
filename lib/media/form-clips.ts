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
  getSetMediaStats as dbGetSetMediaStats,
  deleteClipsForSet as dbDeleteClipsForSet,
  deleteSetMediaForSession as dbDeleteSetMediaForSession,
} from "../db/form-clips";
import { setExcludedFromBackup } from "./backup-exclusion";
import type { SetMediaRow } from "../db/form-clips";

export type { SetMediaRow };

const FORM_CLIPS_DIR = "form-clips";
const THUMBS_DIR = ".thumbs";
const ORPHAN_GRACE_MS = 30_000;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

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

/** Convert an absolute file URI to the rel_path stored in set_media. */
export function toRelPath(absUri: string): string {
  const base = Paths.document.uri;
  return absUri.startsWith(base) ? absUri.slice(base.length) : absUri;
}

/** Convert a rel_path back to an absolute file URI. */
export function toAbsPath(relPath: string): string {
  return new File(Paths.document, relPath).uri;
}

// ---------------------------------------------------------------------------
// Ensure directory exists
// ---------------------------------------------------------------------------

function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

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

/**
 * Save a recorded clip for a set.
 *
 * Order: write file → exclude from backup (iOS) → INSERT set_media row.
 * A crash before INSERT leaves an orphaned file; reconcileOrphans() cleans it.
 * A crash after INSERT but before backup-exclusion is non-fatal (privacy
 * defense-in-depth: the manifest XML covers Android; iOS is best-effort on
 * this code path).
 */
export async function recordClip(params: RecordClipParams): Promise<SetMediaRow> {
  if (Platform.OS === "web") {
    throw new Error("Form clips are not supported on web");
  }

  const { setId, exerciseId, uri, durationMs, sizeBytes, width, height } = params;
  const clipId = uuid();
  const destFile = clipFile(exerciseId, clipId);
  const destDir = new Directory(Paths.document, `${FORM_CLIPS_DIR}/${exerciseId}`);

  ensureDir(destDir);

  // Move the temp recording into the permanent location.
  const sourceFile = new File(uri);
  sourceFile.move(destFile);

  // iOS: exclude from iCloud Backup immediately after write.
  // This is a hard precondition — if exclusion fails the clip is not inserted
  // (privacy invariant: we must not silently persist a clip that could be backed
  // up). Android is covered by manifest XML from with-form-clips-backup plugin.
  if (Platform.OS === "ios") {
    await setExcludedFromBackup(destFile.uri);
  }

  const relPath = toRelPath(destFile.uri);
  const row = await insertSetMedia({
    id: clipId,
    set_id: setId,
    exercise_id: exerciseId,
    kind: "video",
    rel_path: relPath,
    duration_ms: durationMs,
    size_bytes: sizeBytes,
    width,
    height,
    created_at: Date.now(),
  });

  return row;
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
    await deleteClip(row.id, row.rel_path);
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
    try {
      const f = new File(Paths.document, row.rel_path);
      if (f.exists) f.delete();
      // Also remove thumbnail if present.
      const parts = row.rel_path.split("/");
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
function maybeUnlinkOrphan(fileEntry: File, liveRelPaths: Set<string>, nowMs: number): void {
  if (!fileEntry.uri.endsWith(".mp4")) return;
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
