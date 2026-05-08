/* eslint-disable */
/**
 * Expo config plugin: with-form-clips-backup
 *
 * Excludes the `form-clips/` directory from iCloud backup (iOS) and
 * Android Auto Backup. Required by BLD-1092 Hard Rule 4.
 *
 * iOS: The FormClipsBackup Swift module in modules/form-clips-backup/ is
 * automatically included by Expo's autolinking via expo-module.config.json.
 * No additional prebuild patching is required on the iOS side.
 *
 * Android — two-file strategy:
 *
 *   expo-secure-store (registered before this plugin in app.config.ts) sets:
 *     android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
 *     android:fullBackupContent="@xml/secure_store_backup_rules"
 *   and ships those XML files inside its AAR.
 *
 *   Android resource merging means that app-level resources in
 *   android/app/src/main/res/xml/ always override library resources. This
 *   plugin writes MERGED versions of expo-secure-store's XML files into the
 *   app-level res/xml/ directory so that BOTH the SecureStore sharedpref
 *   exclusion (auth tokens) AND the form-clips/ file exclusion are active.
 *
 *   If expo-secure-store is absent (e.g., the FOSS variant), fallback
 *   standalone files are also written and the manifest attributes are set.
 *
 * This plugin is idempotent — safe to re-run on every `expo prebuild`.
 *
 * See also:
 *   node_modules/expo-secure-store/plugin/build/withSecureStore.js:8-9
 *     (BACKUP_RULES_PATH / EXTRACTION_RULES_PATH constants — file names)
 *   node_modules/expo-secure-store/android/src/main/res/xml/
 *     (SecureStore exclude entries we must preserve)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { withDangerousMod, withAndroidManifest } = require("expo/config-plugins");

// ---------------------------------------------------------------------------
// expo-secure-store XML file names (from withSecureStore.js:8-9)
// If expo-secure-store changes these, update here too.
// ---------------------------------------------------------------------------
const SECURE_STORE_DATA_EXTRACTION_XML = "secure_store_data_extraction_rules.xml";
const SECURE_STORE_FULL_BACKUP_XML = "secure_store_backup_rules.xml";

// ---------------------------------------------------------------------------
// Merged XML — expo-secure-store's SecureStore sharedpref exclusion PLUS
// our form-clips/ file exclusion in a single app-level resource file.
// This overrides expo-secure-store's AAR version via Android resource merging.
// ---------------------------------------------------------------------------

/**
 * Merged data_extraction_rules for Android API >= 31.
 * Preserves SecureStore sharedpref exclusion from expo-secure-store while
 * adding form-clips/ file exclusion.
 */
const MERGED_DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.

  This file OVERRIDES expo-secure-store's secure_store_data_extraction_rules.xml
  via Android app-level resource merging (app resources win over library resources).
  It preserves the SecureStore sharedpref exclusion (auth tokens) AND adds the
  form-clips/ directory exclusion (user form-check video clips).

  SecureStore pref name: "SecureStore"
  Source: node_modules/expo-secure-store/android/src/main/res/xml/
-->
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="file" path="form-clips/"/>
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="file" path="form-clips/"/>
  </device-transfer>
</data-extraction-rules>
`;

/**
 * Merged full_backup_content for Android API < 31.
 * Preserves SecureStore sharedpref exclusion and adds form-clips/ exclusion.
 */
const MERGED_FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.

  This file OVERRIDES expo-secure-store's secure_store_backup_rules.xml
  via Android app-level resource merging (app resources win over library resources).
  It preserves the SecureStore sharedpref exclusion AND adds the
  form-clips/ directory exclusion.

  SecureStore pref name: "SecureStore"
  Source: node_modules/expo-secure-store/android/src/main/res/xml/
-->
<full-backup-content>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
  <exclude domain="file" path="form-clips/"/>
</full-backup-content>
`;

// ---------------------------------------------------------------------------
// Standalone XML — used when expo-secure-store is absent (FOSS variant etc.)
// In this case our withAndroidManifest fallback sets the manifest to our own
// resource names, so these standalone files are what the manifest points to.
// ---------------------------------------------------------------------------

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.
  Excludes the form-clips directory from cloud backup and device transfer.
-->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="file" path="form-clips/"/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="file" path="form-clips/"/>
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Managed by the with-form-clips-backup Expo config plugin.
  DO NOT EDIT manually — changes will be overwritten on expo prebuild.
  Excludes the form-clips directory from Auto Backup on Android API < 31.
-->
<full-backup-content>
  <exclude domain="file" path="form-clips/"/>
</full-backup-content>
`;

// ---------------------------------------------------------------------------
// Android — write XML resource files
// ---------------------------------------------------------------------------

/**
 * Writes all Android backup exclusion XML files into res/xml/.
 *
 * Strategy:
 *  1. ALWAYS write the merged files (secure_store_*.xml) so they override
 *     expo-secure-store's library resources at build time. These include both
 *     the SecureStore sharedpref exclusion and the form-clips file exclusion.
 *  2. ALSO write standalone fallback files (data_extraction_rules.xml,
 *     full_backup_content.xml) used when expo-secure-store is absent and
 *     withAndroidManifest falls back to pointing at our own resource names.
 *
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

  /** @param {string} filePath @param {string} content */
  function writeIfChanged(filePath, content) {
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf-8") !== content) {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  // (1) Merged files — override expo-secure-store's AAR resources.
  writeIfChanged(
    path.join(xmlDir, SECURE_STORE_DATA_EXTRACTION_XML),
    MERGED_DATA_EXTRACTION_RULES_XML
  );
  writeIfChanged(
    path.join(xmlDir, SECURE_STORE_FULL_BACKUP_XML),
    MERGED_FULL_BACKUP_CONTENT_XML
  );

  // (2) Standalone fallback files — used when expo-secure-store is absent.
  writeIfChanged(
    path.join(xmlDir, "data_extraction_rules.xml"),
    DATA_EXTRACTION_RULES_XML
  );
  writeIfChanged(
    path.join(xmlDir, "full_backup_content.xml"),
    FULL_BACKUP_CONTENT_XML
  );
}

// ---------------------------------------------------------------------------
// Android — patch AndroidManifest.xml <application> element
// ---------------------------------------------------------------------------

/**
 * Sets android:dataExtractionRules and android:fullBackupContent on the
 * <application> element only if they are not already set.
 *
 * When expo-secure-store is present (the common case), it runs first and
 * already sets these to @xml/secure_store_*. Our withDangerousMod writes
 * merged versions of those files, so we intentionally leave the attribute
 * values alone here.
 *
 * When expo-secure-store is absent, we set the attributes to our standalone
 * fallback file names.
 *
 * @param {object} androidManifest
 * @returns {object}
 */
function applyAndroidManifestMod(androidManifest) {
  const applications = androidManifest.manifest.application;
  if (!applications || applications.length === 0) {
    throw new Error(
      "with-form-clips-backup: could not find <application> in AndroidManifest.xml"
    );
  }
  const app = applications[0];
  if (!app.$) app.$ = {};

  // Fallback: only set if expo-secure-store has NOT already set them.
  // If they ARE set, withDangerousMod's merged files will take care of adding
  // the form-clips exclusion to whichever resource names the manifest points at.
  if (!app.$["android:dataExtractionRules"]) {
    app.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
  }
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
  // Step 1: Write Android XML resource files.
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      writeAndroidXmlFiles(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  // Step 2: Set manifest attributes if not already set by expo-secure-store.
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
// Merged XML (expo-secure-store present) — exported for regression tests
module.exports.MERGED_DATA_EXTRACTION_RULES_XML = MERGED_DATA_EXTRACTION_RULES_XML;
module.exports.MERGED_FULL_BACKUP_CONTENT_XML = MERGED_FULL_BACKUP_CONTENT_XML;
// Standalone XML (expo-secure-store absent) — exported for unit tests
module.exports.DATA_EXTRACTION_RULES_XML = DATA_EXTRACTION_RULES_XML;
module.exports.FULL_BACKUP_CONTENT_XML = FULL_BACKUP_CONTENT_XML;
module.exports.SECURE_STORE_DATA_EXTRACTION_XML = SECURE_STORE_DATA_EXTRACTION_XML;
module.exports.SECURE_STORE_FULL_BACKUP_XML = SECURE_STORE_FULL_BACKUP_XML;
