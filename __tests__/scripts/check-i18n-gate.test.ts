import { makeCatalogEntry } from "../../scripts/i18n/catalog-entry";
import { tw2sp } from "../../scripts/i18n/opencc";
import { renderRuntimeCatalogs, RUNTIME_LOCALES } from "../../scripts/i18n/runtime-catalogs";
import {
  checkCatalog,
  checkRedundantOverrides,
  checkZhCnGenerated,
  generateMessageKeys,
  generateZhCnJson,
  runI18nGateCheck,
  checkConditionalMessages,
  checkScriptPurity,
  checkSourceCatalogCompleteness,
} from "../../scripts/check-i18n-gate";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const source = {
  a: makeCatalogEntry("a", "Workout", "Workout"),
  b: makeCatalogEntry("b", "影片", "影片"),
};

describe("i18n gate catalog checks", () => {
  it("reports stale and stale-human entries", () => {
    const stale = { a: { ...source.a, srcHash: "000000000000" } };
    const human = { a: { ...stale.a, origin: "human" as const } };
    expect(checkCatalog(source, stale, { full: false }).map(v => v.class)).toEqual(["I18N_STALE"]);
    expect(checkCatalog(source, human, { full: false }).map(v => v.class)).toEqual(["I18N_STALE", "I18N_STALE_HUMAN"]);
  });

  it("reports missing and orphan keys", () => {
    expect(checkCatalog(source, { a: source.a }, { full: true }).map(v => v.class)).toContain("I18N_MISSING_KEY");
    expect(checkCatalog(source, { a: source.a, extra: source.a }, { full: true }).map(v => v.class)).toContain("I18N_ORPHAN_KEY");
  });

  it("reports a redundant partial value", () => {
    expect(checkCatalog(source, { a: source.a }, { full: false, inherited: source })[0].class).toBe("I18N_REDUNDANT");
  });

  it("reports stale generated zh-CN and redundant overrides", () => {
    const zhTW = { b: makeCatalogEntry("b", "影片", "影片") };
    const overrides = { b: makeCatalogEntry("b", "影片", tw2sp("影片")) };
    expect(checkZhCnGenerated(zhTW, {}, "{}\n")[0].class).toBe("I18N_ZHCN_STALE");
    expect(checkRedundantOverrides(zhTW, overrides)[0].class).toBe("I18N_REDUNDANT_OVERRIDE");
  });

  it("uses the shared OpenCC converter and deterministic generator", () => {
    expect(tw2sp("影片")).toBe("影片");
    expect(generateZhCnJson({ b: "影片" }, { b: "视频" })).toBe('{\n  "b": "视频"\n}\n');
  });

  it("rejects locale-code echoes", () => {
    const catalog = { a: makeCatalogEntry("a", "Yes", "zh-TW") };
    expect(checkCatalog(source, catalog, { full: false, locale: "zh-TW" }).map(v => v.class)).toContain("I18N_LOCALE_CODE_ECHO");
    expect(checkCatalog(source, { a: makeCatalogEntry("a", "Yes", "是") }, { full: false, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_LOCALE_CODE_ECHO");
  });

  it("rejects untranslated CJK-locale text with explicit exceptions", () => {
    const latinSource = { a: makeCatalogEntry("a", "Workout now", "Workout now") };
    expect(checkCatalog(latinSource, latinSource, { full: true, locale: "zh-TW" }).map(v => v.class)).toContain("I18N_UNTRANSLATED_CJK_LOCALE");
    expect(checkCatalog(latinSource, { a: makeCatalogEntry("a", "Workout now", "現在訓練") }, { full: true, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_UNTRANSLATED_CJK_LOCALE");
    const placeholder = { a: makeCatalogEntry("a", "{value}", "{value}") };
    expect(checkCatalog(placeholder, placeholder, { full: true, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_UNTRANSLATED_CJK_LOCALE");
  });

  it("checks ICU placeholder names without parsing plural branch text", () => {
    const plural = "{count, plural, one {# exercise} other {# exercises}}";
    expect(checkCatalog({ a: makeCatalogEntry("a", plural, plural) }, { a: makeCatalogEntry("a", plural, plural) }, { full: true, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_PLACEHOLDER_MISMATCH");
    expect(checkCatalog({ a: makeCatalogEntry("a", "Hello {name}", "Hello {name}") }, { a: makeCatalogEntry("a", "你好", "你好") }, { full: true, locale: "zh-TW" }).map(v => v.class)).toContain("I18N_PLACEHOLDER_MISMATCH");
  });

  it("flags English words inside ICU branches but allows technical tokens", () => {
    const sourceMessage = "{count, plural, one {# record} other {# records}}";
    const translated = makeCatalogEntry("a", sourceMessage, "{count, plural, one {# 筆紀錄} other {# 筆紀錄}}");
    expect(checkCatalog({ a: makeCatalogEntry("a", sourceMessage, sourceMessage) }, { a: makeCatalogEntry("a", sourceMessage, "{count, plural, one {# record} other {# records}}") }, { full: true, locale: "zh-TW" }).map(v => v.class)).toContain("I18N_UNTRANSLATED_ICU_BRANCH");
    expect(checkCatalog({ a: makeCatalogEntry("a", sourceMessage, sourceMessage) }, { a: translated }, { full: true, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_UNTRANSLATED_ICU_BRANCH");
    const technical = "{unit, select, kg {kg} ml {ml} other {CableSnap JSON}}";
    expect(checkCatalog({ a: makeCatalogEntry("a", technical, technical) }, { a: makeCatalogEntry("a", technical, technical) }, { full: true, locale: "zh-TW" }).map(v => v.class)).not.toContain("I18N_UNTRANSLATED_ICU_BRANCH");
  });
});

describe("gate and MessageKey codegen", () => {
  it("passes a clean catalog set and emits the MessageKey union", () => {
    const zhTW = { a: makeCatalogEntry("a", "Workout", "鍛鍊"), b: makeCatalogEntry("b", "影片", "影片") };
    const zhCN = { ...zhTW, a: makeCatalogEntry("a", "Workout", tw2sp("鍛鍊")) };
    const result = runI18nGateCheck({
      source,
      enGB: {},
      zhTW,
      zhCN,
      zhCNOverrides: {},
      zhCNCommitted: generateZhCnJson(zhTW, {}),
    });
    expect(result.passed).toBe(true);
    expect(generateMessageKeys(source)).toContain('  | "a"');
    expect(generateMessageKeys(source)).toContain('  | "b"');
  });
});

describe("compiled runtime catalogs", () => {
  const catalogs = (message: string) => Object.fromEntries(
    RUNTIME_LOCALES.map(locale => [locale, { greeting: makeCatalogEntry("greeting", message, message) }])
  );

  it("compiles ICU messages into the committed runtime representation", () => {
    expect(renderRuntimeCatalogs(catalogs("Hello {name}"))).toContain('["Hello ",["name"]]');
  });

  it("rejects invalid ICU before a bundle can be built", () => {
    expect(() => renderRuntimeCatalogs(catalogs("{unit, select, fl oz {fl oz}}")))
      .toThrow("en-US:greeting");
  });
});

describe("source conditional-message gate", () => {
  function scan(source: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-gate-"));
    fs.mkdirSync(path.join(root, "app"));
    fs.writeFileSync(path.join(root, "app", "fixture.tsx"), source);
    return checkConditionalMessages(root);
  }

  it("flags conditional and concatenated Lingui messages and Trans children", () => {
    const findings = scan([
      'import { t } from "@lingui/core/macro";',
      'import { Trans } from "@lingui/react/macro";',
      'const a = t({ id: "a", message: `A ${ok ? "yes" : "no"}` });',
      'const b = t({ id: "b", message: "A " + value });',
      'const c = <Trans id="c">{ok ? "yes" : "no"}</Trans>;',
    ].join("\n"));
    expect(findings).toHaveLength(3);
    expect(findings.every(f => f.class === "I18N_CONDITIONAL_MESSAGE")).toBe(true);
  });

  it("does not flag simple template interpolation", () => {
    expect(scan('import { t } from "@lingui/core/macro"; t({ id: "a", message: `Hello ${name}` });')).toEqual([]);
  });

  it("flags literal accessibility labels and hints, but not translated expressions", () => {
    const findings = scan([
      'const a = <Button accessibilityLabel="Close" accessibilityHint={"Tap to close"} />;',
      'const b = <Button accessibilityLabel={t({ id: "close", message: "Close" })} />;',
    ].join("\n"));
    expect(findings.map(f => f.class)).toEqual(["I18N_LITERAL_A11Y_LABEL", "I18N_LITERAL_A11Y_LABEL"]);
  });
});

describe("source catalog completeness gate", () => {
  it("reports ids from macro, runtime facade, wrapped macro, and Trans calls", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-completeness-"));
    fs.mkdirSync(path.join(root, "app"));
    fs.writeFileSync(path.join(root, "app", "fixture.tsx"), [
      'import { t } from "@lingui/core/macro";',
      'import { t as runtimeT } from "@/lib/i18n";',
      'import { t as linguiT } from "@lingui/core/macro";',
      'import { Trans } from "@lingui/react/macro";',
      'const wrappedT = (descriptor: { id: string; message: string }) =>',
      '  (linguiT as unknown as (value: typeof descriptor) => string)(descriptor);',
      't({ id: "missing.call", message: "Missing" });',
      'const nested = <Text>{runtimeT({',
      '  id: "common.retry",',
      '  message: "Retry",',
      '})}</Text>;',
      'wrappedT({ id: "stravaError.network", message: "Check your internet and try again." });',
      '<Trans id="missing.trans">Missing</Trans>;',
    ].join("\n"));
    const violations = checkSourceCatalogCompleteness({
      "present.call": makeCatalogEntry("present.call", "Present", "Present"),
    }, root);
    expect(violations.map(violation => violation.key)).toEqual([
      "common.retry", "missing.call", "missing.trans", "stravaError.network",
    ]);
  });

  it("fails closed on genuinely dynamic ids instead of silently skipping them", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-dynamic-id-"));
    fs.mkdirSync(path.join(root, "app"));
    fs.writeFileSync(path.join(root, "app", "fixture.ts"), [
      'import { t } from "@/lib/i18n";',
      't({ id: dynamicId, message: "Dynamic" });',
    ].join("\n"));
    expect(checkSourceCatalogCompleteness({}, root).map(violation => violation.class)).toEqual([
      "I18N_DYNAMIC_ID",
    ]);
  });
});

describe("catalog script-purity gate", () => {
  it("flags wrong-script characters but not shared characters", () => {
    expect(checkScriptPurity({ a: "準備", b: "准备" }, "zh-TW").map(v => v.key)).toEqual(["b"]);
    expect(checkScriptPurity({ a: "删除", b: "刪除" }, "zh-CN").map(v => v.key)).toEqual(["b"]);
    expect(checkScriptPurity({ a: "活動" }, "zh-TW")).toEqual([]);
  });
});
