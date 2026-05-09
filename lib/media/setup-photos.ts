/**
 * lib/media/setup-photos.ts
 *
 * Core operations for Setup Photos (BLD-1114).
 * Mirrors lib/media/form-clips.ts but for still JPEG captures.
 *
 * File layout: ${documentDirectory}set-media/setup-<photoId>.jpg
 */
import { File, Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { uuid } from "../uuid";
import {
  insertSetMedia,
  hardDeleteClip as dbHardDeleteClip,
} from "../db/form-clips";
import {
  getSetupPhotoForSet as dbGetSetupPhotoForSet,
  getSetupPhotoStats,
} from "../db/setup-photos";
import { withTransaction } from "../db/helpers";
import { SETUP_PHOTOS_DIR, toRelPath, ensureDir, excludeFromBackup } from "./set-media-common";
import type { SetMediaRow } from "../db/form-clips";

export type { SetMediaRow };

function setupPhotoFile(photoId: string): File {
  return new File(Paths.document, `${SETUP_PHOTOS_DIR}/setup-${photoId}.jpg`);
}

function setupPhotosRootDir(): Directory {
  return new Directory(Paths.document, SETUP_PHOTOS_DIR);
}

export interface CaptureSetupPhotoParams {
  setId: string;
  exerciseId: string;
  uri: string;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface SetupPhotoFileMetadata {
  id: string;
  set_id: string;
  exercise_id: string;
  kind: "setup_photo";
  rel_path: string;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  created_at: number;
}

export async function persistSetupPhotoFileOnly(
  params: CaptureSetupPhotoParams,
): Promise<SetupPhotoFileMetadata> {
  if (Platform.OS === "web") {
    throw new Error("Setup photos are not supported on web");
  }

  const { setId, exerciseId, uri, sizeBytes, width, height } = params;
  const photoId = uuid();
  const destFile = setupPhotoFile(photoId);
  const destDir = setupPhotosRootDir();

  ensureDir(destDir);

  const sourceFile = new File(uri);
  sourceFile.move(destFile);

  // Read the actual file size after the move so size_bytes is always populated.
  const readSize = destFile.size ?? sizeBytes ?? null;

  await excludeFromBackup(destFile.uri);

  return {
    id: photoId,
    set_id: setId,
    exercise_id: exerciseId,
    kind: "setup_photo",
    rel_path: toRelPath(destFile.uri),
    size_bytes: readSize,
    width,
    height,
    created_at: Date.now(),
  };
}

export async function captureSetupPhoto(params: CaptureSetupPhotoParams): Promise<SetMediaRow> {
  const meta = await persistSetupPhotoFileOnly(params);
  try {
    return await insertSetMedia(meta);
  } catch (err) {
    try { await unlinkSetupPhotoFiles(meta.rel_path); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

export async function unlinkSetupPhotoFiles(relPath: string): Promise<void> {
  try {
    const f = new File(Paths.document, relPath);
    if (f.exists) f.delete();
  } catch {
    // ENOENT / permission errors are non-fatal.
  }
}

export async function deleteSetupPhoto(id: string, relPath: string): Promise<void> {
  await dbHardDeleteClip(id);
  await unlinkSetupPhotoFiles(relPath);
}

export async function saveReplacementSetupPhoto(args: {
  oldId: string;
  oldRelPath: string;
  newCaptureArgs: CaptureSetupPhotoParams;
}): Promise<SetMediaRow> {
  const newMeta = await persistSetupPhotoFileOnly(args.newCaptureArgs);
  let newRow: SetMediaRow | null = null;
  try {
    await withTransaction(async () => {
      await dbHardDeleteClip(args.oldId);
      newRow = await insertSetMedia(newMeta);
    });
  } catch (err) {
    try { await unlinkSetupPhotoFiles(newMeta.rel_path); } catch { /* best-effort cleanup */ }
    throw err;
  }
  if (newRow === null) {
    try { await unlinkSetupPhotoFiles(newMeta.rel_path); } catch { /* best-effort cleanup */ }
    throw new Error("saveReplacementSetupPhoto: insert did not produce a row");
  }
  try { await unlinkSetupPhotoFiles(args.oldRelPath); } catch { /* best-effort cleanup */ }
  return newRow;
}

export async function getSetupPhotoForSet(setId: string): Promise<SetMediaRow | null> {
  if (Platform.OS === "web") return null;
  return dbGetSetupPhotoForSet(setId);
}

export { getSetupPhotoStats };
