/**
 * lib/media/backup-exclusion.ts
 *
 * TS shim for the FormClipsBackup native module (form-clips-backup Expo module).
 *
 * - iOS: delegates to the Swift FormClipsBackupModule via Expo Modules API.
 * - Android: backup exclusion is provided entirely by the manifest
 *   data_extraction_rules.xml written by the with-form-clips-backup config
 *   plugin — all functions are no-ops that return safe defaults.
 * - Web: no-op (form clips are not supported on web).
 *
 * Import from here (not from the module source directly) so that consumers
 * always get the correct platform-appropriate implementation.
 */
export {
  setExcludedFromBackup,
  readBackupExclusion,
  excludeFormClipsFromBackup,
} from "../../modules/form-clips-backup/src/index";
