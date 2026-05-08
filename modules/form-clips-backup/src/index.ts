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

/** Throws if on iOS but the native module is unavailable (autolinking failure). */
function requireNativeModuleOrThrow(): FormClipsBackupNativeModule {
  const mod = requireOptionalNativeModule<FormClipsBackupNativeModule>("FormClipsBackup");
  if (!mod) {
    throw new Error(
      "FormClipsBackup native module is unavailable on iOS. " +
      "Ensure expo-module.config.json is present and the app was built with `expo prebuild`."
    );
  }
  return mod;
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
 * Always returns false on Android/web.
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
 *
 * - iOS: calls the native module; throws if native module is unavailable
 *   (autolinking failure) so Sentry captures the failure and the capture
 *   banner can be gated on success.
 * - Android: no-op returning {ok: true, path: ''} — backup exclusion is
 *   handled entirely by the manifest data_extraction_rules.xml.
 * - Web: no-op.
 */
export async function excludeFormClipsFromBackup(): Promise<{ ok: boolean; path: string }> {
  if (Platform.OS !== "ios") {
    return { ok: true, path: "" };
  }
  // On iOS, throw if the native module is missing so failures surface in Sentry
  // rather than silently succeeding while iCloud exclusion was never applied.
  const NativeModule = requireNativeModuleOrThrow();
  return NativeModule.excludeFormClipsFromBackup();
}
