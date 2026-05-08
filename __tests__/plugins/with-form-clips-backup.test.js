/**
 * Tests for the with-form-clips-backup Expo config plugin.
 *
 * Validates that the plugin:
 *  1. Writes merged XML files that include both SecureStore sharedpref exclusions
 *     AND form-clips/ file exclusion (privacy regression guard).
 *  2. Writes standalone fallback XML files for when expo-secure-store is absent.
 *  3. Is idempotent (safe to run on every expo prebuild).
 *  4. Does not overwrite files with identical content (no unnecessary writes).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  writeAndroidXmlFiles,
  MERGED_DATA_EXTRACTION_RULES_XML,
  MERGED_FULL_BACKUP_CONTENT_XML,
  DATA_EXTRACTION_RULES_XML,
  FULL_BACKUP_CONTENT_XML,
  SECURE_STORE_DATA_EXTRACTION_XML,
  SECURE_STORE_FULL_BACKUP_XML,
} = require("../../plugins/with-form-clips-backup");

describe("with-form-clips-backup plugin — Android XML files", () => {
  let tmpDir;
  let xmlDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cablesnap-plugin-test-"));
    xmlDir = path.join(tmpDir, "android", "app", "src", "main", "res", "xml");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates android/app/src/main/res/xml/ directory if it does not exist", () => {
    writeAndroidXmlFiles(tmpDir);
    expect(fs.existsSync(xmlDir)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // REGRESSION: expo-secure-store composition (privacy critical)
  // expo-secure-store sets android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
  // and ships that file in its AAR. Our plugin must write a merged app-level
  // override (app resources win over library resources) that preserves SecureStore's
  // sharedpref exclusion AND adds form-clips/ — otherwise auth tokens enter Auto Backup.
  // ---------------------------------------------------------------------------

  describe("merged files — expo-secure-store compatibility", () => {
    it("writes secure_store_data_extraction_rules.xml with BOTH SecureStore AND form-clips exclusions", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, SECURE_STORE_DATA_EXTRACTION_XML),
        "utf-8"
      );
      // SecureStore sharedpref exclusion must be preserved
      expect(content).toContain('domain="sharedpref" path="SecureStore"');
      // form-clips/ file exclusion must be present
      expect(content).toContain('domain="file" path="form-clips/"');
      // Both <cloud-backup> and <device-transfer> sections present
      expect(content).toContain("<cloud-backup>");
      expect(content).toContain("<device-transfer>");
      // Valid XML header
      expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    });

    it("secure_store_data_extraction_rules.xml cloud-backup excludes BOTH SecureStore and form-clips", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, SECURE_STORE_DATA_EXTRACTION_XML),
        "utf-8"
      );
      // Extract cloud-backup section
      const cloudBackupStart = content.indexOf("<cloud-backup>");
      const cloudBackupEnd = content.indexOf("</cloud-backup>") + "</cloud-backup>".length;
      const cloudBackupSection = content.slice(cloudBackupStart, cloudBackupEnd);
      expect(cloudBackupSection).toContain('domain="sharedpref" path="SecureStore"');
      expect(cloudBackupSection).toContain('domain="file" path="form-clips/"');
    });

    it("secure_store_data_extraction_rules.xml device-transfer excludes BOTH SecureStore and form-clips", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, SECURE_STORE_DATA_EXTRACTION_XML),
        "utf-8"
      );
      const dtStart = content.indexOf("<device-transfer>");
      const dtEnd = content.indexOf("</device-transfer>") + "</device-transfer>".length;
      const dtSection = content.slice(dtStart, dtEnd);
      expect(dtSection).toContain('domain="sharedpref" path="SecureStore"');
      expect(dtSection).toContain('domain="file" path="form-clips/"');
    });

    it("writes secure_store_backup_rules.xml with BOTH SecureStore AND form-clips exclusions (API < 31)", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, SECURE_STORE_FULL_BACKUP_XML),
        "utf-8"
      );
      expect(content).toContain('domain="sharedpref" path="SecureStore"');
      expect(content).toContain('domain="file" path="form-clips/"');
      expect(content).toContain("<full-backup-content>");
      expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    });

    it("merged XML constants have valid structure", () => {
      expect(MERGED_DATA_EXTRACTION_RULES_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(MERGED_DATA_EXTRACTION_RULES_XML).toContain("<data-extraction-rules>");
      expect(MERGED_DATA_EXTRACTION_RULES_XML).toContain('domain="sharedpref" path="SecureStore"');
      expect(MERGED_DATA_EXTRACTION_RULES_XML).toContain('domain="file" path="form-clips/"');

      expect(MERGED_FULL_BACKUP_CONTENT_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(MERGED_FULL_BACKUP_CONTENT_XML).toContain("<full-backup-content>");
      expect(MERGED_FULL_BACKUP_CONTENT_XML).toContain('domain="sharedpref" path="SecureStore"');
      expect(MERGED_FULL_BACKUP_CONTENT_XML).toContain('domain="file" path="form-clips/"');
    });
  });

  // ---------------------------------------------------------------------------
  // Standalone fallback files (when expo-secure-store is absent)
  // ---------------------------------------------------------------------------

  describe("standalone fallback files — expo-secure-store absent", () => {
    it("writes data_extraction_rules.xml with form-clips exclusion", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, "data_extraction_rules.xml"),
        "utf-8"
      );
      expect(content).toContain('domain="file" path="form-clips/"');
      expect(content).toContain("<cloud-backup>");
      expect(content).toContain("<device-transfer>");
    });

    it("writes full_backup_content.xml with form-clips exclusion", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, "full_backup_content.xml"),
        "utf-8"
      );
      expect(content).toContain('domain="file" path="form-clips/"');
      expect(content).toContain("<full-backup-content>");
    });

    it("standalone XML constants have valid structure", () => {
      expect(DATA_EXTRACTION_RULES_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(DATA_EXTRACTION_RULES_XML).toContain("<data-extraction-rules>");

      expect(FULL_BACKUP_CONTENT_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(FULL_BACKUP_CONTENT_XML).toContain("<full-backup-content>");
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("running writeAndroidXmlFiles twice produces identical content", () => {
      writeAndroidXmlFiles(tmpDir);
      const filesBefore = [
        SECURE_STORE_DATA_EXTRACTION_XML,
        SECURE_STORE_FULL_BACKUP_XML,
        "data_extraction_rules.xml",
        "full_backup_content.xml",
      ].reduce((acc, name) => {
        acc[name] = fs.readFileSync(path.join(xmlDir, name), "utf-8");
        return acc;
      }, {});

      writeAndroidXmlFiles(tmpDir);

      for (const [name, before] of Object.entries(filesBefore)) {
        const after = fs.readFileSync(path.join(xmlDir, name), "utf-8");
        expect(after).toBe(before);
      }
    });

    it("does not overwrite secure_store_data_extraction_rules.xml if content is unchanged", () => {
      writeAndroidXmlFiles(tmpDir);
      const filePath = path.join(xmlDir, SECURE_STORE_DATA_EXTRACTION_XML);
      const statBefore = fs.statSync(filePath);

      const waitUntil = Date.now() + 10;
      while (Date.now() < waitUntil) { /* spin */ }

      writeAndroidXmlFiles(tmpDir);
      const statAfter = fs.statSync(filePath);
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    });

    it("does not overwrite data_extraction_rules.xml if content is unchanged", () => {
      writeAndroidXmlFiles(tmpDir);
      const filePath = path.join(xmlDir, "data_extraction_rules.xml");
      const statBefore = fs.statSync(filePath);

      const waitUntil = Date.now() + 10;
      while (Date.now() < waitUntil) { /* spin */ }

      writeAndroidXmlFiles(tmpDir);
      const statAfter = fs.statSync(filePath);
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    });
  });
});
