/**
 * lib/db/setup-photos.ts
 *
 * Database-layer CRUD for setup_photo rows in set_media.
 * Symmetric with lib/db/form-clips.ts but scoped to kind='setup_photo'.
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { setMedia } from "./schema";
import type { SetMediaRow } from "./schema";

export type { SetMediaRow };

/** Get the setup photo for a specific set, or null if none. Excludes pending_delete rows. */
export async function getSetupPhotoForSet(setId: string): Promise<SetMediaRow | null> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(setMedia)
    .where(and(eq(setMedia.set_id, setId), eq(setMedia.kind, "setup_photo"), eq(setMedia.pending_delete, 0)))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all setup photos for an exercise, reverse-chronological. */
export async function getSetupPhotosForExercise(exerciseId: string): Promise<SetMediaRow[]> {
  const db = await getDrizzle();
  return db
    .select()
    .from(setMedia)
    .where(and(eq(setMedia.exercise_id, exerciseId), eq(setMedia.kind, "setup_photo"), eq(setMedia.pending_delete, 0)))
    .orderBy(desc(setMedia.created_at));
}

/** Total size of setup photos in bytes (for Settings → Storage panel). */
export async function getSetupPhotoStats(): Promise<{ count: number; totalBytes: number }> {
  const db = await getDrizzle();
  const result = await db
    .select({
      count: sql<number>`count(*)`,
      totalBytes: sql<number>`coalesce(sum(size_bytes), 0)`,
    })
    .from(setMedia)
    .where(and(eq(setMedia.kind, "setup_photo"), eq(setMedia.pending_delete, 0)));
  const row = result[0];
  return { count: Number(row?.count ?? 0), totalBytes: Number(row?.totalBytes ?? 0) };
}
