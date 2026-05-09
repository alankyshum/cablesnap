/**
 * lib/db/form-clips.ts
 *
 * Database-layer CRUD for the set_media table.
 *
 * All writes go through getDrizzle(). Reads return plain row objects.
 * File I/O is handled exclusively in lib/media/form-clips.ts — this
 * file never touches the filesystem.
 */
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { setMedia, workoutSets, exercises } from "./schema";
import type { SetMediaRow } from "./schema";

export type { SetMediaRow };

export interface InsertSetMediaParams {
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

/** Insert a new set_media row. Throws if the set already has a clip (unique constraint). */
export async function insertSetMedia(params: InsertSetMediaParams): Promise<SetMediaRow> {
  const db = await getDrizzle();
  const row: typeof setMedia.$inferInsert = {
    id: params.id,
    set_id: params.set_id,
    exercise_id: params.exercise_id,
    kind: params.kind,
    rel_path: params.rel_path,
    duration_ms: params.duration_ms ?? null,
    size_bytes: params.size_bytes ?? null,
    width: params.width ?? null,
    height: params.height ?? null,
    pending_delete: 0,
    created_at: params.created_at,
  };
  const result = await db.insert(setMedia).values(row).returning();
  return result[0];
}

/** Get the clip for a specific set, or null if none. Excludes pending_delete rows. */
export async function getClipForSet(setId: string): Promise<SetMediaRow | null> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(setMedia)
    .where(and(eq(setMedia.set_id, setId), eq(setMedia.pending_delete, 0)))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all clips for an exercise, reverse-chronological, excluding pending_delete rows. */
export async function getClipsForExercise(exerciseId: string): Promise<SetMediaRow[]> {
  const db = await getDrizzle();
  return db
    .select()
    .from(setMedia)
    .where(and(eq(setMedia.exercise_id, exerciseId), eq(setMedia.pending_delete, 0)))
    .orderBy(desc(setMedia.created_at));
}

/** Soft-delete a clip by id (sets pending_delete = 1). */
export async function softDeleteClip(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(setMedia).set({ pending_delete: 1 }).where(eq(setMedia.id, id));
}

/** Hard-delete a clip by id (used by reconciler after file unlink). */
export async function hardDeleteClip(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(setMedia).where(eq(setMedia.id, id));
}

/** Get ALL rows (including pending_delete) — for reconciler snapshot. */
export async function getAllSetMediaRows(): Promise<SetMediaRow[]> {
  const db = await getDrizzle();
  return db.select().from(setMedia);
}

/** Get rows with pending_delete = 1 — for reconciler sweep. */
export async function getPendingDeleteRows(): Promise<SetMediaRow[]> {
  const db = await getDrizzle();
  return db.select().from(setMedia).where(eq(setMedia.pending_delete, 1));
}

/** Total clip count and sum of size_bytes (for Settings → Storage panel). */
export async function getSetMediaStats(): Promise<{ count: number; totalBytes: number }> {
  const db = await getDrizzle();
  const result = await db
    .select({
      count: sql<number>`count(*)`,
      totalBytes: sql<number>`coalesce(sum(size_bytes), 0)`,
    })
    .from(setMedia)
    .where(eq(setMedia.pending_delete, 0));
  const row = result[0];
  return { count: Number(row?.count ?? 0), totalBytes: Number(row?.totalBytes ?? 0) };
}

/** Delete set_media rows for a given set_id (service-layer cascade helper). */
export async function deleteClipsForSet(setId: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(setMedia).where(eq(setMedia.set_id, setId));
}

/**
 * Delete all set_media rows for a given session and return them for file cleanup.
 *
 * Resolves set IDs via a sub-query on workout_sets, then deletes matching
 * set_media rows in one pass.  Returns the deleted rows so the caller can
 * unlink files from the filesystem.
 */
export async function deleteSetMediaForSession(sessionId: string): Promise<SetMediaRow[]> {
  const db = await getDrizzle();
  const sets = await db.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.session_id, sessionId));
  if (sets.length === 0) return [];
  const setIds = sets.map((s) => s.id);
  const rows = await db.select().from(setMedia).where(inArray(setMedia.set_id, setIds));
  if (rows.length > 0) {
    await db.delete(setMedia).where(inArray(setMedia.set_id, setIds));
  }
  return rows;
}

/**
 * BLD-1105: Get all live (pending_delete=0) set_media rows joined with exercise name.
 * Used by FormClipsManageSheet to list clips grouped by exercise.
 */
export async function getAllLiveSetMediaWithExerciseName(): Promise<
  Array<SetMediaRow & { exercise_name: string | null }>
> {
  const db = await getDrizzle();
  return db
    .select({
      id: setMedia.id,
      set_id: setMedia.set_id,
      exercise_id: setMedia.exercise_id,
      kind: setMedia.kind,
      rel_path: setMedia.rel_path,
      duration_ms: setMedia.duration_ms,
      size_bytes: setMedia.size_bytes,
      width: setMedia.width,
      height: setMedia.height,
      pending_delete: setMedia.pending_delete,
      created_at: setMedia.created_at,
      exercise_name: exercises.name,
    })
    .from(setMedia)
    .leftJoin(exercises, eq(setMedia.exercise_id, exercises.id))
    .where(eq(setMedia.pending_delete, 0))
    .orderBy(desc(setMedia.created_at));
}
