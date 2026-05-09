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
 * Android — combined backup exclusion strategy:
 *
 *   app.config.ts registers expo-secure-store with configureAndroidBackup: false,
 *   which tells expo-secure-store NOT to set android:dataExtractionRules or
 *   android:fullBackupContent in the manifest. This plugin then takes sole
 *   ownership of those attributes and emits a single combined XML that includes:
 *     - SecureStore sharedpref exclusion (preserving auth-token privacy)
 *     - form-clips/ file exclusion (form-check video clips)
 *
 *   This avoids the "other backup rules are already present" conflict and ensures
 *   neither exclusion silently disappears when the two plugins compose.
 *
 * This plugin is idempotent — safe to re-run on every `expo prebuild`.
 *
 * See also:
 *   app.config.ts — `["expo-secure-store", { configureAndroidBackup: false }]`
 *   node_modules/expo-secure-store/plugin/build/withSecureStore.js — the guard
 *     `canApplyDataExtractionRules` that bails out when attributes are already set
 *   node_modules/expo-secure-store/android/src/main/res/xml/ — original SecureStore
 *     exclusion entries this plugin preserves
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// ---------------------------------------------------------------------------
// Combined XML constants — own both exclusions since we pass
// configureAndroidBackup: false to expo-secure-store in app.config.ts.
// ---------------------------------------------------------------------------

/**
 * Combined data_extraction_rules.xml for Android API >= 31.
 * Preserves the SecureStore sharedpref exclusion (auth tokens) from
 * expo-secure-store AND adds the form-clips/ file exclusion.
 */
const COMBINED_DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.

  Combined backup exclusion rules (takes ownership from expo-secure-store via
  configureAndroidBackup: false). Excludes:
    - SecureStore EncryptedSharedPreferences (auth tokens, biometrics)
    - form-clips/ directory (user form-check video clips)
-->
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <include domain="file" path="."/>
    <exclude domain="file" path="form-clips/"/>
    <exclude domain="file" path="set-media/"/>
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <include domain="file" path="."/>
    <exclude domain="file" path="form-clips/"/>
    <exclude domain="file" path="set-media/"/>
  </device-transfer>
</data-extraction-rules>
`;

/**
 * Combined full_backup_content.xml for Android API < 31.
 * Preserves the SecureStore sharedpref exclusion AND adds form-clips/.
 */
const COMBINED_FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.

  Combined Auto Backup rules for Android API < 31. Excludes:
    - SecureStore EncryptedSharedPreferences (auth tokens, biometrics)
    - form-clips/ directory (user form-check video clips)
-->
<full-backup-content>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
  <include domain="file" path="."/>
  <exclude domain="file" path="form-clips/"/>
  <exclude domain="file" path="set-media/"/>
</full-backup-content>
`;

// Resource file names for the combined rules.
const COMBINED_DATA_EXTRACTION_FILE = "form_clips_data_extraction_rules.xml";
const COMBINED_FULL_BACKUP_FILE = "form_clips_backup_rules.xml";

// ---------------------------------------------------------------------------
// Android — write combined XML resource files
// ---------------------------------------------------------------------------

/**
 * Writes combined backup exclusion XML files into res/xml/.
 * All writes are idempotent: files are only written if content differs.
 *
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

  function writeIfChanged(filePath, content) {
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf-8") !== content) {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  writeIfChanged(
    path.join(xmlDir, COMBINED_DATA_EXTRACTION_FILE),
    COMBINED_DATA_EXTRACTION_RULES_XML
  );
  writeIfChanged(
    path.join(xmlDir, COMBINED_FULL_BACKUP_FILE),
    COMBINED_FULL_BACKUP_CONTENT_XML
  );
}

// ---------------------------------------------------------------------------
// Android — patch AndroidManifest.xml <application> element
// ---------------------------------------------------------------------------

/**
 * @param {object} androidManifest
 * @returns {object}
 */
function applyAndroidManifestMod(androidManifest) {
  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!mainApplication.$) mainApplication.$ = {};
  // expo-secure-store has configureAndroidBackup: false so it will not set
  // these attributes — we set them unconditionally.
  mainApplication.$["android:dataExtractionRules"] =
    `@xml/${COMBINED_DATA_EXTRACTION_FILE.replace(".xml", "")}`;
  mainApplication.$["android:fullBackupContent"] =
    `@xml/${COMBINED_FULL_BACKUP_FILE.replace(".xml", "")}`;
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
  // Step 1: Write combined Android XML resource files.
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      writeAndroidXmlFiles(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  // Step 2: Set manifest attributes to our combined resource files.
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidManifestMod(cfg.modResults);
    return cfg;
  });

  // iOS: FormClipsBackup Swift module is automatically linked by Expo CocoaPods
  // autolinking via modules/form-clips-backup/expo-module.config.json.
  // No additional prebuild patching needed.

  return config;
};

module.exports = withFormClipsBackup;
module.exports.withFormClipsBackup = withFormClipsBackup;
module.exports.writeAndroidXmlFiles = writeAndroidXmlFiles;
// Combined XML constants — exported for regression tests
module.exports.COMBINED_DATA_EXTRACTION_RULES_XML = COMBINED_DATA_EXTRACTION_RULES_XML;
module.exports.COMBINED_FULL_BACKUP_CONTENT_XML = COMBINED_FULL_BACKUP_CONTENT_XML;
module.exports.COMBINED_DATA_EXTRACTION_FILE = COMBINED_DATA_EXTRACTION_FILE;
module.exports.COMBINED_FULL_BACKUP_FILE = COMBINED_FULL_BACKUP_FILE;
