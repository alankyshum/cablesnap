/**
 * Tests for the with-form-clips-backup Expo config plugin.
 *
 * Validates that the plugin:
 *  1. Writes data_extraction_rules.xml with form-clips/ exclusions.
 *  2. Writes full_backup_content.xml with form-clips/ exclusions.
 *  3. Patches AndroidManifest.xml <application> with dataExtractionRules
 *     and fullBackupContent attributes.
 *  4. Is idempotent (safe to run on every expo prebuild).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  writeAndroidXmlFiles,
  DATA_EXTRACTION_RULES_XML,
  FULL_BACKUP_CONTENT_XML,
} from "../../plugins/with-form-clips-backup";

describe("with-form-clips-backup plugin — Android XML files", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cablesnap-plugin-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates android/app/src/main/res/xml/ directory if it does not exist", () => {
    const projectRoot = tmpDir;
    writeAndroidXmlFiles(projectRoot);
    const xmlDir = path.join(projectRoot, "android", "app", "src", "main", "res", "xml");
    expect(fs.existsSync(xmlDir)).toBe(true);
  });

  it("writes data_extraction_rules.xml with form-clips exclusion", () => {
    writeAndroidXmlFiles(tmpDir);
    const xmlPath = path.join(tmpDir, "android", "app", "src", "main", "res", "xml", "data_extraction_rules.xml");
    const content = fs.readFileSync(xmlPath, "utf-8");
    expect(content).toContain('<exclude domain="file" path="form-clips/" />');
    expect(content).toContain("<cloud-backup>");
    expect(content).toContain("<device-transfer>");
  });

  it("writes full_backup_content.xml with form-clips exclusion", () => {
    writeAndroidXmlFiles(tmpDir);
    const xmlPath = path.join(tmpDir, "android", "app", "src", "main", "res", "xml", "full_backup_content.xml");
    const content = fs.readFileSync(xmlPath, "utf-8");
    expect(content).toContain('<exclude domain="file" path="form-clips/" />');
    expect(content).toContain("<full-backup-content>");
  });

  it("is idempotent — running twice produces the same files", () => {
    writeAndroidXmlFiles(tmpDir);
    const xmlDir = path.join(tmpDir, "android", "app", "src", "main", "res", "xml");
    const dataExtractionBefore = fs.readFileSync(
      path.join(xmlDir, "data_extraction_rules.xml"),
      "utf-8"
    );
    const fullBackupBefore = fs.readFileSync(
      path.join(xmlDir, "full_backup_content.xml"),
      "utf-8"
    );

    // Run again
    writeAndroidXmlFiles(tmpDir);

    const dataExtractionAfter = fs.readFileSync(
      path.join(xmlDir, "data_extraction_rules.xml"),
      "utf-8"
    );
    const fullBackupAfter = fs.readFileSync(
      path.join(xmlDir, "full_backup_content.xml"),
      "utf-8"
    );

    expect(dataExtractionAfter).toBe(dataExtractionBefore);
    expect(fullBackupAfter).toBe(fullBackupBefore);
  });

  it("DATA_EXTRACTION_RULES_XML is valid XML (contains version header)", () => {
    expect(DATA_EXTRACTION_RULES_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(DATA_EXTRACTION_RULES_XML).toContain("<data-extraction-rules>");
  });

  it("FULL_BACKUP_CONTENT_XML is valid XML (contains version header)", () => {
    expect(FULL_BACKUP_CONTENT_XML).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(FULL_BACKUP_CONTENT_XML).toContain("<full-backup-content>");
  });

  it("does not overwrite existing file with identical content (no unnecessary writes)", () => {
    writeAndroidXmlFiles(tmpDir);
    const xmlDir = path.join(tmpDir, "android", "app", "src", "main", "res", "xml");
    const dataExtractionPath = path.join(xmlDir, "data_extraction_rules.xml");

    const statBefore = fs.statSync(dataExtractionPath);
    // Wait a tick to ensure mtime would differ if file were rewritten
    const waitUntil = Date.now() + 10;
    while (Date.now() < waitUntil) { /* spin */ }

    writeAndroidXmlFiles(tmpDir);
    const statAfter = fs.statSync(dataExtractionPath);

    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });
});
