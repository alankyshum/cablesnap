import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

interface FormClipsBackupNativeModule {
  setExcludedFromBackup(uri: string): Promise<void>;
  readBackupExclusion(uri: string): Promise<boolean>;
  excludeFormClipsFromBackup(): Promise<{ ok: boolean; path: string }>;
}

// Resolved lazily so tests can mock Platform.OS before calling functions.
function getNativeModule(): FormClipsBackupNativeModule | null {
  if (Platform.OS !== "ios") return null;
  return requireOptionalNativeModule<FormClipsBackupNativeModule>("FormClipsBackup");
}

/**
 * Marks a file or directory as excluded from iCloud backup (iOS only).
 * On Android, backup exclusion is handled by the manifest data_extraction_rules.xml
 * written by the with-form-clips-backup config plugin — this function is a no-op.
 */
export async function setExcludedFromBackup(uri: string): Promise<void> {
  const NativeModule = getNativeModule();
  if (!NativeModule) {
    return;
  }
  return NativeModule.setExcludedFromBackup(uri);
}

/**
 * Reads back the backup-exclusion flag for a URI (iOS only).
 * Returns true if the file/directory is excluded from backup, false otherwise.
 * Always returns false on Android.
 */
export async function readBackupExclusion(uri: string): Promise<boolean> {
  const NativeModule = getNativeModule();
  if (!NativeModule) {
    return false;
  }
  return NativeModule.readBackupExclusion(uri);
}

/**
 * Boot-time call: ensures form-clips/ directory exists and sets its
 * backup-exclusion flag. Should be called once from app/_layout.tsx.
 * Returns {ok, path} on iOS; returns {ok: true, path: ''} on Android (no-op).
 */
export async function excludeFormClipsFromBackup(): Promise<{ ok: boolean; path: string }> {
  const NativeModule = getNativeModule();
  if (!NativeModule) {
    return { ok: true, path: "" };
  }
  return NativeModule.excludeFormClipsFromBackup();
}
