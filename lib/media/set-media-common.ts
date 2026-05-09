/**
 * lib/media/set-media-common.ts
 *
 * Shared helpers for all set_media file management (form-clip videos + setup photos).
 */
import { File, Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { setExcludedFromBackup } from "./backup-exclusion";

export const FORM_CLIPS_DIR = "form-clips";
export const SETUP_PHOTOS_DIR = "set-media";

/** Convert an absolute file URI to the rel_path stored in set_media. */
export function toRelPath(absUri: string): string {
  const base = Paths.document.uri;
  return absUri.startsWith(base) ? absUri.slice(base.length) : absUri;
}

/** Convert a rel_path back to an absolute file URI. */
export function toAbsPath(relPath: string): string {
  return new File(Paths.document, relPath).uri;
}

/** Idempotently create a directory (including intermediates). */
export function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

/** Mark a file excluded from backup on iOS. No-op on other platforms. */
export async function excludeFromBackup(fileUri: string): Promise<void> {
  if (Platform.OS === "ios") {
    await setExcludedFromBackup(fileUri);
  }
}
