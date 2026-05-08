import {
  ConfigPlugin,
  withDangerousMod,
  withAndroidManifest,
  AndroidConfig,
} from "expo/config-plugins";
import type { ExpoConfig } from "expo/config";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Sentinel markers — kept for future use if patching strategy changes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Android XML file contents
// ---------------------------------------------------------------------------

/**
 * data_extraction_rules.xml — used on Android API >= 31.
 * Excludes form-clips/ from both cloud backup and device transfer.
 */
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

/**
 * full_backup_content.xml (backup_rules.xml) — used on Android API < 31.
 * Excludes form-clips/ from Auto Backup on older SDKs.
 */
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

function writeAndroidXmlFiles(projectRoot: string): void {
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

function applyAndroidManifestMod(
  androidManifest: AndroidConfig.Manifest.AndroidManifest
): AndroidConfig.Manifest.AndroidManifest {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

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

const withFormClipsBackup: ConfigPlugin = (config: ExpoConfig) => {
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

  // iOS: The FormClipsBackup Swift module in modules/form-clips-backup/ is
  // automatically included by Expo's autolinking via expo-module.config.json.
  // No additional prebuild patching is required for iOS.

  return config;
};

export default withFormClipsBackup;

// Export helpers for unit testing
export { writeAndroidXmlFiles, DATA_EXTRACTION_RULES_XML, FULL_BACKUP_CONTENT_XML };
