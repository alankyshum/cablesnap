/* eslint-disable */
/**
 * Expo config plugin: with-form-clips-backup
 *
 * Excludes the `form-clips/` directory from iCloud backup (iOS) and
 * Android Auto Backup. Required by BLD-1092 Hard Rule 4.
 *
 * iOS: The FormClipsBackup Swift module in modules/form-clips-backup/ is
 * automatically included by Expo's autolinking via expo-module.config.json.
 * No additional prebuild patching is required on the iOS side — autolinking
 * handles CocoaPods pod inclusion and JSI bridging.
 *
 * Android:
 *   - Writes data_extraction_rules.xml (API >= 31) and
 *     full_backup_content.xml (API < 31) to res/xml/.
 *   - Patches AndroidManifest.xml <application> with
 *     android:dataExtractionRules and android:fullBackupContent.
 *
 * This plugin is idempotent — safe to re-run on every `expo prebuild`.
 * Existing in-repo plugins (with-release-signing.js, with-wearos-module.js)
 * use the same CJS pattern; see those files for additional context.
 */

const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest } = require("expo/config-plugins");
const { getMainApplicationOrThrow } = require("@expo/config-plugins/build/android/Manifest");

// ---------------------------------------------------------------------------
// Android XML file contents
// ---------------------------------------------------------------------------

/** data_extraction_rules.xml — used on Android API >= 31. */
const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.
  Excludes the form-clips directory from cloud backup and device transfer
  so that user form-check videos stay on-device only.
-->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="file" path="form-clips/" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="file" path="form-clips/" />
    </device-transfer>
</data-extraction-rules>
`;

/** full_backup_content.xml — used on Android API < 31. */
const FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.
  Excludes the form-clips directory from Auto Backup on API < 31.
-->
<full-backup-content>
    <exclude domain="file" path="form-clips/" />
</full-backup-content>
`;

// ---------------------------------------------------------------------------
// Android — write XML resource files
// ---------------------------------------------------------------------------

/**
 * @param {string} projectRoot
 */
function writeAndroidXmlFiles(projectRoot) {
  const xmlDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "res",
    "xml"
  );
  if (!fs.existsSync(xmlDir)) {
    fs.mkdirSync(xmlDir, { recursive: true });
  }

  const dataExtractionPath = path.join(xmlDir, "data_extraction_rules.xml");
  const fullBackupPath = path.join(xmlDir, "full_backup_content.xml");

  // Idempotent: overwrite only if content differs or file is missing.
  if (
    !fs.existsSync(dataExtractionPath) ||
    fs.readFileSync(dataExtractionPath, "utf-8") !== DATA_EXTRACTION_RULES_XML
  ) {
    fs.writeFileSync(dataExtractionPath, DATA_EXTRACTION_RULES_XML, "utf-8");
  }

  if (
    !fs.existsSync(fullBackupPath) ||
    fs.readFileSync(fullBackupPath, "utf-8") !== FULL_BACKUP_CONTENT_XML
  ) {
    fs.writeFileSync(fullBackupPath, FULL_BACKUP_CONTENT_XML, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Android — patch AndroidManifest.xml <application> element
// ---------------------------------------------------------------------------

/**
 * @param {import("@expo/config-plugins/build/android/Manifest").AndroidManifest} androidManifest
 * @returns {import("@expo/config-plugins/build/android/Manifest").AndroidManifest}
 */
function applyAndroidManifestMod(androidManifest) {
  const app = getMainApplicationOrThrow(androidManifest);

  // Set android:dataExtractionRules (API >= 31)
  if (!app.$["android:dataExtractionRules"]) {
    app.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
  }

  // Set android:fullBackupContent (API < 31) — only set if not already present
  // to avoid overriding any existing full backup rules from other plugins.
  if (!app.$["android:fullBackupContent"]) {
    app.$["android:fullBackupContent"] = "@xml/full_backup_content";
  }

  return androidManifest;
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

/**
 * @param {import("expo/config").ExpoConfig} config
 * @returns {import("expo/config").ExpoConfig}
 */
const withFormClipsBackup = (config) => {
  // Step 1: Write Android XML resource files via withDangerousMod
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      writeAndroidXmlFiles(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  // Step 2: Patch AndroidManifest.xml <application> attributes
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidManifestMod(cfg.modResults);
    return cfg;
  });

  // iOS: FormClipsBackup Swift module is automatically linked by Expo's
  // CocoaPods autolinking via modules/form-clips-backup/expo-module.config.json.
  // No additional prebuild patching needed here.

  return config;
};

module.exports = withFormClipsBackup;

// Export helpers for unit testing
module.exports.writeAndroidXmlFiles = writeAndroidXmlFiles;
module.exports.DATA_EXTRACTION_RULES_XML = DATA_EXTRACTION_RULES_XML;
module.exports.FULL_BACKUP_CONTENT_XML = FULL_BACKUP_CONTENT_XML;
