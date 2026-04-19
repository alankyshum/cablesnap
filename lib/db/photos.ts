import { File, Directory, Paths } from "expo-file-system";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { uuid } from "../uuid";
import { getDrizzle, query, execute } from "./helpers";
import { progressPhotos } from "./schema";

export type ProgressPhoto = {
  id: string;
  file_path: string;
  thumbnail_path: string | null;
  capture_date: string;
  display_date: string;
  pose_category: string | null;
  note: string | null;
  width: number | null;
  height: number | null;
  deleted_at: string | null;
  created_at: string;
};

export type PoseCategory = "front" | "back" | "side_left" | "side_right";

const PHOTO_DIR_NAME = "progress-photos";
const THUMB_DIR_NAME = "thumbnails";
const CLEANUP_DAYS = 30;

export function getPhotoDir(): string {
  return new Directory(Paths.document, PHOTO_DIR_NAME).uri;
}

export function getThumbnailDir(): string {
  return new Directory(Paths.document, PHOTO_DIR_NAME, THUMB_DIR_NAME).uri;
}

export function ensurePhotoDirs(): void {
  const photoDir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!photoDir.exists) photoDir.create({ intermediates: true });
  const thumbDir = new Directory(Paths.document, PHOTO_DIR_NAME, THUMB_DIR_NAME);
  if (!thumbDir.exists) thumbDir.create({ intermediates: true });
}

export async function insertPhoto(params: {
  filePath: string;
  thumbnailPath: string | null;
  displayDate: string;
  poseCategory: PoseCategory | null;
  note: string | null;
  width: number | null;
  height: number | null;
}): Promise<ProgressPhoto> {
  const id = uuid();
  await execute(
    `INSERT INTO progress_photos (id, file_path, thumbnail_path, display_date, pose_category, note, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.filePath, params.thumbnailPath, params.displayDate, params.poseCategory, params.note, params.width, params.height]
  );
  const db = await getDrizzle();
  const row = await db.select().from(progressPhotos).where(eq(progressPhotos.id, id)).get();
  return row as unknown as ProgressPhoto;
}

export async function getPhotos(
  limit = 20,
  offset = 0,
  poseFilter?: PoseCategory
): Promise<ProgressPhoto[]> {
  const db = await getDrizzle();
  const baseQuery = db.select()
    .from(progressPhotos)
    .where(
      poseFilter
        ? and(isNull(progressPhotos.deleted_at), eq(progressPhotos.pose_category, poseFilter))
        : isNull(progressPhotos.deleted_at)
    )
    .orderBy(desc(progressPhotos.display_date), desc(progressPhotos.created_at))
    .limit(limit)
    .offset(offset);
  return baseQuery as unknown as Promise<ProgressPhoto[]>;
}

export async function getPhotoById(id: string): Promise<ProgressPhoto | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(progressPhotos)
    .where(and(eq(progressPhotos.id, id), isNull(progressPhotos.deleted_at)))
    .get();
  return (row as unknown as ProgressPhoto) ?? null;
}

export async function getPhotoCount(poseFilter?: PoseCategory): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(progressPhotos)
    .where(
      poseFilter
        ? and(isNull(progressPhotos.deleted_at), eq(progressPhotos.pose_category, poseFilter))
        : isNull(progressPhotos.deleted_at)
    )
    .get();
  return row?.count ?? 0;
}

export async function softDeletePhoto(id: string): Promise<void> {
  await execute(
    "UPDATE progress_photos SET deleted_at = datetime('now') WHERE id = ?",
    [id]
  );
}

export async function restorePhoto(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(progressPhotos)
    .set({ deleted_at: null })
    .where(eq(progressPhotos.id, id));
}

export async function permanentlyDeletePhoto(id: string): Promise<void> {
  const db = await getDrizzle();
  const photo = await db.select()
    .from(progressPhotos)
    .where(eq(progressPhotos.id, id))
    .get();
  if (!photo) return;

  await db.delete(progressPhotos).where(eq(progressPhotos.id, id));

  // Delete files after DB row is removed
  try {
    const file = new File(photo.file_path);
    if (file.exists) file.delete();
  } catch {
    // File already gone — ignore
  }
  if (photo.thumbnail_path) {
    try {
      const thumb = new File(photo.thumbnail_path);
      if (thumb.exists) thumb.delete();
    } catch {
      // Thumbnail already gone — ignore
    }
  }
}

export async function cleanupDeletedPhotos(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = await query<ProgressPhoto>(
    "SELECT * FROM progress_photos WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  for (const photo of expired) {
    await permanentlyDeletePhoto(photo.id);
  }
}

export async function cleanupOrphanFiles(): Promise<void> {
  try {
    ensurePhotoDirs();
    const photoDir = new Directory(Paths.document, PHOTO_DIR_NAME);
    const thumbDir = new Directory(Paths.document, PHOTO_DIR_NAME, THUMB_DIR_NAME);

    const entries = photoDir.list();
    const thumbEntries = thumbDir.list();

    const allPhotos = await query<{ file_path: string; thumbnail_path: string | null }>(
      "SELECT file_path, thumbnail_path FROM progress_photos"
    );
    const dbPaths = new Set(allPhotos.map((p) => p.file_path));
    const dbThumbPaths = new Set(
      allPhotos.map((p) => p.thumbnail_path).filter(Boolean) as string[]
    );

    for (const entry of entries) {
      if (entry instanceof Directory) continue;
      if (!dbPaths.has(entry.uri)) {
        try { entry.delete(); } catch { /* ignore */ }
      }
    }
    for (const entry of thumbEntries) {
      if (entry instanceof Directory) continue;
      if (!dbThumbPaths.has(entry.uri)) {
        try { entry.delete(); } catch { /* ignore */ }
      }
    }
  } catch {
    // Non-critical cleanup — don't crash app startup
  }
}

export async function updatePhotoMeta(
  id: string,
  displayDate: string,
  poseCategory: PoseCategory | null,
  note: string | null
): Promise<void> {
  const db = await getDrizzle();
  await db.update(progressPhotos)
    .set({ display_date: displayDate, pose_category: poseCategory, note })
    .where(eq(progressPhotos.id, id));
}

export async function getPhotosByMonth(): Promise<{ month: string; count: number }[]> {
  return query<{ month: string; count: number }>(
    `SELECT strftime('%Y-%m', display_date) as month, COUNT(*) as count
     FROM progress_photos WHERE deleted_at IS NULL
     GROUP BY month ORDER BY month DESC`
  );
}
