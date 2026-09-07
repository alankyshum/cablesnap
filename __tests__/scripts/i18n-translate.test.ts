import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeCatalogEntry, shouldSkipEntry, sourceHash } from "../../scripts/i18n/catalog-entry";
import { parseArgs, planTranslations, type TranslationAdapter, translateCatalog } from "../../scripts/i18n/translate";

describe("catalog entries", () => {
  it("uses the locked truncated sha256 source hash", () => {
    expect(sourceHash("home.title", "Workout")).toHaveLength(12);
    expect(makeCatalogEntry("home.title", "Workout", "鍛鍊")).toEqual({
      message: "鍛鍊",
      srcHash: sourceHash("home.title", "Workout"),
      origin: "machine",
    });
  });

  it("skips matching hashes and human entries", () => {
    const matching = makeCatalogEntry("a", "Source", "Translated");
    const human = { ...matching, srcHash: "not-current", origin: "human" as const };
    expect(shouldSkipEntry(matching, "a", "Source")).toBe(true);
    expect(shouldSkipEntry(human, "a", "Changed source")).toBe(true);
    expect(shouldSkipEntry({ ...matching, srcHash: "stale000000" }, "a", "Changed source")).toBe(false);
  });
});

describe("translation planning", () => {
  it("reports missing, stale, and skipped keys without invoking an adapter", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-translate-"));
    fs.mkdirSync(path.join(root, "locales"));
    fs.writeFileSync(path.join(root, "locales", "en-US.json"), JSON.stringify({
      same: makeCatalogEntry("same", "Same", "Same"),
      stale: makeCatalogEntry("stale", "New source", "New source"),
      missing: makeCatalogEntry("missing", "Missing", "Missing"),
    }));
    fs.writeFileSync(path.join(root, "locales", "zh-TW.json"), JSON.stringify({
      same: makeCatalogEntry("same", "Same", "Old translation"),
      stale: makeCatalogEntry("stale", "Old source", "Old translation"),
    }));
    const adapter: TranslationAdapter = {
      name: "test",
      translateBatch: jest.fn(),
    };
    const targetBefore = fs.readFileSync(path.join(root, "locales", "zh-TW.json"), "utf8");
    const plan = await translateCatalog({ locale: "zh-TW", dryRun: true, adapter, root });
    expect(plan).toEqual({ missing: ["missing"], stale: ["stale"], skipped: ["same"] });
    expect(adapter.translateBatch).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(root, "locales", "zh-TW.json"), "utf8")).toBe(targetBefore);
  });

  it("classifies entries by source catalog", () => {
    const source = {
      same: makeCatalogEntry("same", "Same", "Same"),
      stale: makeCatalogEntry("stale", "New source", "New source"),
      missing: makeCatalogEntry("missing", "Missing", "Missing"),
    };
    const target = {
      same: makeCatalogEntry("same", "Same", "Old translation"),
      stale: makeCatalogEntry("stale", "Old source", "Old translation"),
    };
    expect(planTranslations(source, target)).toEqual({ missing: ["missing"], stale: ["stale"], skipped: ["same"] });
  });
});

describe("CLI arguments", () => {
  it("supports locale, dry-run, and explicit adapter", () => {
    expect(parseArgs(["--locale", "zh-TW", "--dry-run", "--adapter", "openai"])).toEqual({
      locale: "zh-TW", dryRun: true, adapter: "openai",
    });
  });
});
