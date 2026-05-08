/**
 * Tests for the with-form-clips-backup Expo config plugin.
 *
 * Validates that the plugin (configureAndroidBackup: false strategy):
 *  1. Takes sole ownership of Android backup rules — writes combined XML with
 *     BOTH SecureStore sharedpref exclusion (auth tokens) AND form-clips/
 *     file exclusion. This is the privacy-critical regression guard.
 *  2. Is idempotent (safe to run on every expo prebuild).
 *  3. Does not overwrite files with identical content (no unnecessary writes).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  writeAndroidXmlFiles,
  COMBINED_DATA_EXTRACTION_RULES_XML,
  COMBINED_FULL_BACKUP_CONTENT_XML,
  COMBINED_DATA_EXTRACTION_FILE,
  COMBINED_FULL_BACKUP_FILE,
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
  // PRIVACY REGRESSION GUARD: combined XML must contain BOTH exclusions.
  //
  // With configureAndroidBackup: false, this plugin takes sole ownership of
  // Android backup rules. If SecureStore exclusion is missing from the output,
  // auth tokens (EncryptedSharedPreferences) enter Android Auto Backup.
  // If form-clips/ exclusion is missing, user form-check videos enter backup.
  // Both must be present at ALL times.
  // ---------------------------------------------------------------------------

  describe("combined XML — both SecureStore AND form-clips exclusions (privacy critical)", () => {
    it("writes form_clips_data_extraction_rules.xml (API >= 31) with SecureStore AND form-clips excludes", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, COMBINED_DATA_EXTRACTION_FILE),
        "utf-8"
      );
      // SecureStore sharedpref exclusion MUST be present (auth token protection)
      expect(content).toContain('domain="sharedpref" path="SecureStore"');
      // form-clips file exclusion MUST be present (video clip protection)
      expect(content).toContain('domain="file" path="form-clips/"');
      // Both sections present
      expect(content).toContain("<cloud-backup>");
      expect(content).toContain("<device-transfer>");
      // Valid XML header
      expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    });

    it("cloud-backup section contains BOTH SecureStore AND form-clips excludes", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, COMBINED_DATA_EXTRACTION_FILE),
        "utf-8"
      );
      const cloudBackupStart = content.indexOf("<cloud-backup>");
      const cloudBackupEnd = content.indexOf("</cloud-backup>") + "</cloud-backup>".length;
      const cloudBackupSection = content.slice(cloudBackupStart, cloudBackupEnd);
      expect(cloudBackupSection).toContain('domain="sharedpref" path="SecureStore"');
      expect(cloudBackupSection).toContain('domain="file" path="form-clips/"');
      // Android lint [FullBackupContent] requires every <exclude> to have a
      // sibling <include> for the same domain. Without these, lintVitalRelease
      // fails the release build (BLD-1101 regression guard).
      expect(cloudBackupSection).toContain('<include domain="sharedpref" path="."/>');
      expect(cloudBackupSection).toContain('<include domain="file" path="."/>');
    });

    it("device-transfer section contains BOTH SecureStore AND form-clips excludes", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, COMBINED_DATA_EXTRACTION_FILE),
        "utf-8"
      );
      const dtStart = content.indexOf("<device-transfer>");
      const dtEnd = content.indexOf("</device-transfer>") + "</device-transfer>".length;
      const dtSection = content.slice(dtStart, dtEnd);
      expect(dtSection).toContain('domain="sharedpref" path="SecureStore"');
      expect(dtSection).toContain('domain="file" path="form-clips/"');
      // Same lint sibling-include requirement (BLD-1101).
      expect(dtSection).toContain('<include domain="sharedpref" path="."/>');
      expect(dtSection).toContain('<include domain="file" path="."/>');
    });

    it("writes form_clips_backup_rules.xml (API < 31) with SecureStore AND form-clips excludes", () => {
      writeAndroidXmlFiles(tmpDir);
      const content = fs.readFileSync(
        path.join(xmlDir, COMBINED_FULL_BACKUP_FILE),
        "utf-8"
      );
      expect(content).toContain('domain="sharedpref" path="SecureStore"');
      expect(content).toContain('domain="file" path="form-clips/"');
      expect(content).toContain("<full-backup-content>");
      expect(content).toContain('<?xml version="1.0" encoding="utf-8"?>');
      // full-backup-content also needs sibling <include> for each domain
      // referenced by <exclude> to satisfy lint [FullBackupContent] (BLD-1101).
      const fbStart = content.indexOf("<full-backup-content>");
      const fbEnd = content.indexOf("</full-backup-content>") + "</full-backup-content>".length;
      const fbSection = content.slice(fbStart, fbEnd);
      expect(fbSection).toContain('<include domain="sharedpref" path="."/>');
      expect(fbSection).toContain('<include domain="file" path="."/>');
    });

    it("COMBINED_DATA_EXTRACTION_RULES_XML constant has valid structure with both exclusions", () => {
      expect(COMBINED_DATA_EXTRACTION_RULES_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(COMBINED_DATA_EXTRACTION_RULES_XML).toContain("<data-extraction-rules>");
      expect(COMBINED_DATA_EXTRACTION_RULES_XML).toContain('domain="sharedpref" path="SecureStore"');
      expect(COMBINED_DATA_EXTRACTION_RULES_XML).toContain('domain="file" path="form-clips/"');
    });

    it("COMBINED_FULL_BACKUP_CONTENT_XML constant has valid structure with both exclusions", () => {
      expect(COMBINED_FULL_BACKUP_CONTENT_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(COMBINED_FULL_BACKUP_CONTENT_XML).toContain("<full-backup-content>");
      expect(COMBINED_FULL_BACKUP_CONTENT_XML).toContain('domain="sharedpref" path="SecureStore"');
      expect(COMBINED_FULL_BACKUP_CONTENT_XML).toContain('domain="file" path="form-clips/"');
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("running writeAndroidXmlFiles twice produces identical content", () => {
      writeAndroidXmlFiles(tmpDir);
      const filesBefore = [
        COMBINED_DATA_EXTRACTION_FILE,
        COMBINED_FULL_BACKUP_FILE,
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

    it("does not overwrite form_clips_data_extraction_rules.xml if content is unchanged", () => {
      writeAndroidXmlFiles(tmpDir);
      const filePath = path.join(xmlDir, COMBINED_DATA_EXTRACTION_FILE);
      const statBefore = fs.statSync(filePath);

      const waitUntil = Date.now() + 10;
      while (Date.now() < waitUntil) { /* spin */ }

      writeAndroidXmlFiles(tmpDir);
      const statAfter = fs.statSync(filePath);
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    });

    it("does not overwrite form_clips_backup_rules.xml if content is unchanged", () => {
      writeAndroidXmlFiles(tmpDir);
      const filePath = path.join(xmlDir, COMBINED_FULL_BACKUP_FILE);
      const statBefore = fs.statSync(filePath);

      const waitUntil = Date.now() + 10;
      while (Date.now() < waitUntil) { /* spin */ }

      writeAndroidXmlFiles(tmpDir);
      const statAfter = fs.statSync(filePath);
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    });
  });
});
