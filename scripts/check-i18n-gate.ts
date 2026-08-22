#!/usr/bin/env tsx
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { sourceHash, type CatalogEntry } from "./i18n/catalog-entry";
import { generateZhCnCatalog, sp2tw, tw2sp } from "./i18n/opencc";
import { readCatalog, type Catalog } from "./i18n/catalog-io";

export type ViolationClass =
  | "I18N_STALE"
  | "I18N_MISSING_KEY"
  | "I18N_ORPHAN_KEY"
  | "I18N_REDUNDANT"
  | "I18N_STALE_HUMAN"
  | "I18N_ZHCN_STALE"
  | "I18N_REDUNDANT_OVERRIDE"
  | "I18N_LOCALE_CODE_ECHO"
  | "I18N_UNTRANSLATED_CJK_LOCALE"
  | "I18N_PLACEHOLDER_MISMATCH"
  | "I18N_UNTRANSLATED_ICU_BRANCH"
  | "I18N_CONDITIONAL_MESSAGE"
  | "I18N_DYNAMIC_ID"
  | "I18N_INVALID_ICU"
  | "I18N_WRONG_SCRIPT";

const SUPPORTED_LOCALES = ["en-US", "en-GB", "zh-TW", "zh-CN"] as const;
// Explicit key exceptions for intentionally Latin-only strings.
const REVIEWED_LATIN_ALLOWLIST = new Set([
  "settings.integrations.strava", "settings.about.version",
  "strava", "cablesnap", "mev", "mrv", "json", "amrap", "pr", "pb", "1rm", "kg", "ml", "oz", "fl",
]);
// Reviewed Latin tokens which are proper nouns, acronyms, or measurement units,
// rather than English UI words. This is intentionally separate from the
// key-level Latin-only allowlist because it applies inside ICU branch prose.
const ICU_KEYWORDS = new Set(["one", "other", "zero", "two", "few", "many", "true", "false", "select", "plural", "offset"]);
const PLACEHOLDER_ONLY_RE = /^(?:\s*(?:\{[^{}]+\}|[\s,():+./%×–—-])+\s*)$/;
const CJK_RE = /[\u3400-\u9fff]/;

function placeholderNames(message: string): Set<string> {
  const names = new Set<string>();
  // Walk balanced ICU arguments. Once a plural/select argument is found, skip
  // its balanced body so branch labels and prose cannot look like arguments.
  for (let index = 0; index < message.length; index += 1) {
    if (message[index] !== "{") continue;
    const close = matchingBrace(message, index);
    if (close < 0) continue;
    const body = message.slice(index + 1, close);
    const match = body.match(/^\s*([A-Za-z_][\w.-]*|\d+)(?:\s*,\s*(plural|select|selectordinal)\b)?/);
    if (match) names.add(match[1]);
    index = close;
  }
  return names;
}

function matchingBrace(message: string, start: number): number {
  let depth = 0;
  for (let index = start; index < message.length; index += 1) {
    if (message[index] === "{") depth += 1;
    else if (message[index] === "}" && --depth === 0) return index;
  }
  return -1;
}

/** Extract literal text from every plural/select branch using the balanced parser above. */
export function icuBranchLiterals(message: string): string[] {
  const branches: string[] = [];
  const visit = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== "{") continue;
      const close = matchingBrace(text, index);
      if (close < 0) continue;
      const body = text.slice(index + 1, close);
      const header = body.match(/^\s*([A-Za-z_][\w.-]*|\d+)\s*,\s*(plural|select|selectordinal)\b/);
      if (!header) {
        index = close;
        continue;
      }
      const branchStart = header[0].length;
      const branchText = body.slice(branchStart);
      const labels = /(?:^|\s)([A-Za-z_][\w.-]*|=\d+)\s*\{/g;
      let match: RegExpExecArray | null;
      while ((match = labels.exec(branchText))) {
        const open = branchStart + match.index + match[0].lastIndexOf("{");
        const branchClose = matchingBrace(body, open);
        if (branchClose < 0) continue;
        const branchBody = body.slice(open + 1, branchClose);
        // Keep this branch's literal prose, while recursively visiting nested ICU.
        branches.push(branchBody.replace(/\{[^{}]*\}/g, ""));
        visit(branchBody);
        labels.lastIndex = branchClose - branchStart;
      }
      index = close;
    }
  };
  visit(message);
  return branches;
}

function untranslatedIcuWords(message: string): string[] {
  return [...new Set(icuBranchLiterals(message).flatMap(branch => branch.match(/[A-Za-z]{2,}/g) ?? []))]
    .filter(word => !ICU_KEYWORDS.has(word.toLowerCase()) && !REVIEWED_LATIN_ALLOWLIST.has(word.toLowerCase()));
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every(value => right.has(value));
}

export interface I18nViolation {
  class: ViolationClass;
  key?: string;
  message: string;
}

export interface CheckResult {
  passed: boolean;
  violations: I18nViolation[];
}

export function entryMessage(value: Catalog[string]): string {
  return typeof value === "string" ? value : value.message;
}

export function entryObject(value: Catalog[string] | undefined): CatalogEntry | undefined {
  return value && typeof value !== "string" ? value : undefined;
}

// The catalog gate intentionally combines independent assertions so each
// violation remains reported with the existing per-entry context.
// eslint-disable-next-line complexity
export function checkCatalog(source: Catalog, catalog: Catalog, options: {
  full: boolean;
  inherited?: Catalog;
  locale?: string;
}): I18nViolation[] {
  const violations: I18nViolation[] = [];
  for (const [key, value] of Object.entries(catalog)) {
    if (!(key in source)) {
      violations.push({ class: "I18N_ORPHAN_KEY", key, message: `${key}: catalog key is absent from source` });
      continue;
    }
    const sourceMessage = entryMessage(source[key]);
    const translatedMessage = entryMessage(value);
    const entry = entryObject(value);
    if (entry && entry.srcHash !== sourceHash(key, sourceMessage)) {
      violations.push({ class: "I18N_STALE", key, message: `${key}: srcHash does not match source` });
      if (entry.origin === "human") {
        violations.push({ class: "I18N_STALE_HUMAN", key, message: `${key}: human entry has a stale srcHash` });
      }
    }
    if (!options.full && options.inherited && key in options.inherited && translatedMessage === entryMessage(options.inherited[key])) {
      violations.push({ class: "I18N_REDUNDANT", key, message: `${key}: partial value duplicates inherited value` });
    }
    const isLocaleCodeEcho = options.locale !== undefined && SUPPORTED_LOCALES.some(locale => translatedMessage.trim().toLowerCase() === locale.toLowerCase());
    if (isLocaleCodeEcho) {
      violations.push({ class: "I18N_LOCALE_CODE_ECHO", key, message: `${key}: translation echoes a locale code` });
    }
    if ((options.locale === "zh-TW" || options.locale === "zh-CN") &&
      !REVIEWED_LATIN_ALLOWLIST.has(key) &&
      !isLocaleCodeEcho &&
      !PLACEHOLDER_ONLY_RE.test(translatedMessage) &&
      (sourceMessage.match(/[A-Za-z]/g) ?? []).length >= 3 &&
      !CJK_RE.test(translatedMessage)) {
      violations.push({ class: "I18N_UNTRANSLATED_CJK_LOCALE", key, message: `${key}: CJK translation contains no CJK characters` });
    }
    if ((options.locale === "zh-TW" || options.locale === "zh-CN") && !REVIEWED_LATIN_ALLOWLIST.has(key)) {
      const words = untranslatedIcuWords(translatedMessage);
      if (words.length) violations.push({ class: "I18N_UNTRANSLATED_ICU_BRANCH", key, message: `${key}: ICU branch contains untranslated Latin word(s): ${words.join(", ")}` });
    }
    if (!setsEqual(placeholderNames(sourceMessage), placeholderNames(translatedMessage))) {
      violations.push({ class: "I18N_PLACEHOLDER_MISMATCH", key, message: `${key}: placeholder names differ from source` });
    }
  }
  if (options.full) {
    for (const key of Object.keys(source)) {
      if (!(key in catalog)) {
        violations.push({ class: "I18N_MISSING_KEY", key, message: `${key}: source key is missing from full catalog` });
      }
    }
  }
  return violations;
}

export function checkZhCnGenerated(zhTw: Catalog, overrides: Catalog, committed: string): I18nViolation[] {
  const generated = `${JSON.stringify(generateZhCnCatalog(zhTw, overrides), null, 2)}\n`;
  return generated === committed ? [] : [{ class: "I18N_ZHCN_STALE", message: "locales/zh-CN.json: generated content is stale" }];
}

export function checkRedundantOverrides(zhTw: Catalog, overrides: Catalog): I18nViolation[] {
  const generated = generateZhCnCatalog(zhTw);
  return Object.entries(overrides)
    .filter(([key, value]) => key in generated && entryMessage(value) === entryMessage(generated[key]))
    .map(([key]) => ({ class: "I18N_REDUNDANT_OVERRIDE" as const, key, message: `${key}: override duplicates OpenCC output` }));
}

function catalogText(value: Catalog[string]): string {
  return entryMessage(value);
}

export function checkCatalogIcu(catalog: Catalog, locale: string): I18nViolation[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    try {
      compileMessageOrThrow(entryMessage(value));
      return [];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return [{
        class: "I18N_INVALID_ICU" as const,
        key,
        message: `${locale}:${key}: ${detail}`,
      }];
    }
  });
}

/** Return true only for the AST constructs Lingui hoists incorrectly. */
function hasForbiddenMessageExpression(node: t.Node): boolean {
  if (node.type === "BinaryExpression" && node.operator === "+") return true;
  if (node.type !== "TemplateLiteral") return false;
  return node.expressions.some(expression => {
    let found = false;
    traverse(t.file(t.program([t.expressionStatement(expression as t.Expression)])), {
      ConditionalExpression(path) {
        found = true;
        path.stop();
      },
      BinaryExpression(path) {
        if (path.node.operator === "+") {
          found = true;
          path.stop();
        }
      },
    });
    return found;
  });
}

function sourceFiles(root: string): string[] {
  const result: string[] = [];
  const excludedDirectories = new Set([
    ".git", "node_modules", "dist", "e2e", "__tests__", "__test__", "__fixtures__", "__mocks__",
  ]);
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (excludedDirectories.has(name)) continue;
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) visit(file);
      else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) result.push(file);
    }
  };
  visit(root);
  return result;
}

function checkSourceFile(file: string): I18nViolation[] {
  const code = fs.readFileSync(file, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const violations: I18nViolation[] = [];
  const tBindings = new Set<string>();
  const transBindings = new Set<string>();
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      for (const specifier of path.node.specifiers) {
        if (specifier.type !== "ImportSpecifier") continue;
        const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
        if (source === "@lingui/core/macro" && imported === "t") tBindings.add(specifier.local.name);
        if (source === "@lingui/react/macro" && imported === "Trans") transBindings.add(specifier.local.name);
      }
    },
    CallExpression(path) {
      const callee = path.node.callee;
      const isMacroT = callee.type === "Identifier" && tBindings.has(callee.name);
      const isLinguiMethod = callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "_";
      if (!isMacroT && !isLinguiMethod) return;
      const argument = path.node.arguments[0];
      if (!argument || argument.type !== "ObjectExpression") return;
      const message = argument.properties.find(property => property.type === "ObjectProperty" && ((property.key.type === "Identifier" && property.key.name === "message") || (property.key.type === "StringLiteral" && property.key.value === "message")));
      if (message?.type !== "ObjectProperty" || !hasForbiddenMessageExpression(message.value)) return;
      violations.push({ class: "I18N_CONDITIONAL_MESSAGE", message: `${file}:${message.loc?.start.line ?? 1}: Lingui message contains a conditional or string concatenation` });
    },
    JSXElement(path) {
      const opening = path.node.openingElement.name;
      const isTrans = opening.type === "JSXIdentifier" && transBindings.has(opening.name);
      if (!isTrans) return;
      let found = false;
      for (const child of path.get("children") as NodePath<t.Node>[]) {
        child.traverse({
          ConditionalExpression(inner) { found = true; inner.stop(); },
        });
        if (found) break;
      }
      if (found) violations.push({ class: "I18N_CONDITIONAL_MESSAGE", message: `${file}:${path.node.loc?.start.line ?? 1}: Trans children contain a conditional` });
    },
  });
  return violations;
}

/**
 * Collect the literal ids that Lingui can reach from application source.
 * This deliberately mirrors the macro forms used by the app rather than
 * scraping arbitrary `id` properties (which are commonly database ids).
 * Non-literal ids are not catalogable and are left to Lingui's own checks.
 */
function scanSourceMessages(root: string): { ids: Set<string>; dynamic: I18nViolation[] } {
  const ids = new Set<string>();
  const dynamic: I18nViolation[] = [];
  for (const file of sourceFiles(root)) {
    const code = fs.readFileSync(file, "utf8");
    const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
    const tBindings = new Set<string>();
    const transBindings = new Set<string>();
    const useLinguiBindings = new Set<string>();
    const i18nBindings = new Set<string>();
    const forwardingCalls = new Set<t.CallExpression>();
    const unwrapCallee = (node: t.Expression | t.V8IntrinsicIdentifier): t.Expression | t.V8IntrinsicIdentifier => {
      let current = node;
      while (current.type === "TSAsExpression" || current.type === "TSTypeAssertion" || current.type === "TypeCastExpression") current = current.expression;
      return current;
    };
    const isTranslatorCallee = (node: t.Expression | t.V8IntrinsicIdentifier): boolean => {
      const callee = unwrapCallee(node);
      if (callee.type === "Identifier" && tBindings.has(callee.name)) return true;
      return callee.type === "MemberExpression" && !callee.computed &&
        callee.object.type === "Identifier" && i18nBindings.has(callee.object.name) &&
        callee.property.type === "Identifier" && callee.property.name === "_";
    };
    const importedName = (specifier: t.ImportSpecifier): string =>
      specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;

    // First identify imports. The app intentionally has both Lingui macro calls
    // and a runtime `t` facade in lib/i18n; both produce runtime message lookups.
    traverse(ast, {
      ImportDeclaration(importPath) {
        const source = importPath.node.source.value;
        for (const specifier of importPath.node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported = importedName(specifier);
          if (source === "@lingui/core/macro" && imported === "t") tBindings.add(specifier.local.name);
          if (source === "@lingui/react/macro" && imported === "Trans") transBindings.add(specifier.local.name);
          if (source === "@lingui/react/macro" && imported === "useLingui") useLinguiBindings.add(specifier.local.name);
          if (source === "@lingui/core" && imported === "i18n") i18nBindings.add(specifier.local.name);
          if ((source === "@/lib/i18n" || /(?:^|\/)lib\/i18n(?:\/index)?$/.test(source)) && imported === "t") tBindings.add(specifier.local.name);
        }
      },
      VariableDeclarator(variablePath) {
        const init = variablePath.node.init;
        const id = variablePath.node.id;
        if (id.type !== "ObjectPattern" || init?.type !== "CallExpression" || init.callee.type !== "Identifier" || !useLinguiBindings.has(init.callee.name)) return;
        for (const property of id.properties) {
          if (property.type !== "ObjectProperty" || property.value.type !== "Identifier") continue;
          const imported = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : "";
          if (imported === "t") tBindings.add(property.value.name);
          if (imported === "i18n") i18nBindings.add(property.value.name);
        }
      },
    });

    // Some non-React modules wrap the macro/runtime translator to provide a
    // defensive fallback. Discover those facades from their forwarding call
    // instead of hardcoding wrapper names or files.
    let changed = true;
    while (changed) {
      changed = false;
      traverse(ast, {
        CallExpression(callPath) {
          if (!isTranslatorCallee(callPath.node.callee)) return;
          const argument = callPath.node.arguments[0];
          const functionPath = callPath.getFunctionParent();
          if (!functionPath) return;
          const parameter = functionPath.node.params[0];
          if (parameter?.type !== "Identifier") return;
          const forwardsParameter = argument?.type === "Identifier" && argument.name === parameter.name;
          const spreadsParameter = argument?.type === "ObjectExpression" && argument.properties.some(property =>
            property.type === "SpreadElement" && property.argument.type === "Identifier" && property.argument.name === parameter.name
          );
          if (!forwardsParameter && !spreadsParameter) return;
          const parent = functionPath.parentPath;
          const wrapperName = functionPath.node.type === "FunctionDeclaration"
            ? functionPath.node.id?.name
            : parent?.isVariableDeclarator() && parent.node.id.type === "Identifier"
              ? parent.node.id.name
              : undefined;
          if (wrapperName && !tBindings.has(wrapperName)) {
            tBindings.add(wrapperName);
            changed = true;
          }
          if (wrapperName) forwardingCalls.add(callPath.node);
        },
      });
    }

    traverse(ast, {
      CallExpression(callPath) {
        if (forwardingCalls.has(callPath.node) || !isTranslatorCallee(callPath.node.callee)) return;
        const argument = callPath.node.arguments[0];
        if (!argument || argument.type !== "ObjectExpression") {
          dynamic.push({
            class: "I18N_DYNAMIC_ID",
            message: `${file}:${callPath.node.loc?.start.line ?? 1}: translation call has a non-static descriptor`,
          });
          return;
        }
        const id = argument.properties.find(property => property.type === "ObjectProperty" && ((property.key.type === "Identifier" && property.key.name === "id") || (property.key.type === "StringLiteral" && property.key.value === "id")));
        if (id?.type !== "ObjectProperty" || id.value.type !== "StringLiteral") {
          dynamic.push({
            class: "I18N_DYNAMIC_ID",
            message: `${file}:${callPath.node.loc?.start.line ?? 1}: translation call has a non-literal id`,
          });
          return;
        }
        ids.add(id.value.value);
      },
      JSXOpeningElement(elementPath) {
        const name = elementPath.node.name;
        if (name.type !== "JSXIdentifier" || !transBindings.has(name.name)) return;
        const id = elementPath.node.attributes.find(attribute => attribute.type === "JSXAttribute" && attribute.name.name === "id");
        if (id?.type === "JSXAttribute" && id.value?.type === "StringLiteral") ids.add(id.value.value);
        else dynamic.push({
          class: "I18N_DYNAMIC_ID",
          message: `${file}:${elementPath.node.loc?.start.line ?? 1}: Trans has a missing or non-literal id`,
        });
      },
    });
  }
  return { ids, dynamic };
}

export function sourceMessageIds(root: string): Set<string> {
  return scanSourceMessages(root).ids;
}

export function checkSourceCatalogCompleteness(source: Catalog, root: string): I18nViolation[] {
  const scan = scanSourceMessages(root);
  return [...scan.dynamic, ...[...scan.ids]
    .filter(id => !(id in source))
    .sort()
    .map(key => ({ class: "I18N_MISSING_KEY" as const, key, message: `${key}: source message id is missing from locales/en-US.json` }))];
}

export function checkConditionalMessages(root: string): I18nViolation[] {
  return sourceFiles(root).flatMap(checkSourceFile);
}

export function checkScriptPurity(catalog: Catalog, locale: "zh-TW" | "zh-CN" | "zh-CN.overrides"): I18nViolation[] {
  const converter = locale === "zh-TW" ? sp2tw : tw2sp;
  return Object.entries(catalog)
    .filter(([, value]) => converter(catalogText(value)) !== catalogText(value))
    .map(([key]) => ({ class: "I18N_WRONG_SCRIPT" as const, key, message: `${key}: ${locale} translation contains characters from the wrong script` }));
}

export function runI18nGateCheck(input: {
  source: Catalog;
  enGB: Catalog;
  zhTW: Catalog;
  zhCN: Catalog;
  zhCNOverrides: Catalog;
  zhCNCommitted: string;
  sourceRoot?: string;
}): CheckResult {
  const violations = [
    ...(input.sourceRoot ? checkConditionalMessages(input.sourceRoot) : []),
    ...(input.sourceRoot ? checkSourceCatalogCompleteness(input.source, input.sourceRoot) : []),
    ...checkCatalog(input.source, input.enGB, { full: false, inherited: input.source }),
    ...checkCatalog(input.source, input.zhTW, { full: true, locale: "zh-TW" }),
    // zh-CN is generated deterministically from zh-TW; checking content in the
    // source catalog avoids reporting every defect twice while the generated
    // catalog check still guarantees propagation cannot bypass the gate.
    ...checkCatalog(input.source, input.zhCN, { full: true, locale: "zh-CN" }),
    ...checkCatalog(input.source, input.zhCNOverrides, { full: false, inherited: generateZhCnCatalog(input.zhTW) }),
    ...checkZhCnGenerated(input.zhTW, input.zhCNOverrides, input.zhCNCommitted),
    ...checkRedundantOverrides(input.zhTW, input.zhCNOverrides),
    ...checkScriptPurity(input.zhTW, "zh-TW"),
    ...checkScriptPurity(input.zhCN, "zh-CN"),
    ...checkScriptPurity(input.zhCNOverrides, "zh-CN.overrides"),
    ...checkCatalogIcu(input.source, "en-US"),
    ...checkCatalogIcu(input.enGB, "en-GB"),
    ...checkCatalogIcu(input.zhTW, "zh-TW"),
    ...checkCatalogIcu(input.zhCN, "zh-CN"),
    ...checkCatalogIcu(input.zhCNOverrides, "zh-CN.overrides"),
  ];
  return { passed: violations.length === 0, violations };
}

export function generateMessageKeys(source: Catalog): string {
  const keys = Object.keys(source).sort();
  const union = keys.length ? keys.map(key => `  | ${JSON.stringify(key)}`).join("\n") : "  | never";
  return `// Generated by npm run i18n:codegen. Do not edit.\n/* eslint-disable max-lines */\nexport type MessageKey =\n${union};\n`;
}

export function generateZhCnJson(zhTW: Catalog, overrides: Catalog): string {
  return `${JSON.stringify(generateZhCnCatalog(zhTW, overrides), null, 2)}\n`;
}

function main(): void {
  const root = process.cwd();
  const source = readCatalog("en-US", root);
  if (process.argv.includes("--codegen")) {
    fs.writeFileSync(path.join(root, "lib/i18n/message-keys.generated.ts"), generateMessageKeys(source), "utf8");
    return;
  }
  if (process.argv.includes("--zhcn")) {
    fs.writeFileSync(
      path.join(root, "locales/zh-CN.json"),
      generateZhCnJson(readCatalog("zh-TW", root), readCatalog("zh-CN.overrides", root)),
      "utf8"
    );
    return;
  }
  const result = runI18nGateCheck({
    source,
    enGB: readCatalog("en-GB", root),
    zhTW: readCatalog("zh-TW", root),
    zhCN: readCatalog("zh-CN", root),
    zhCNOverrides: readCatalog("zh-CN.overrides", root),
    zhCNCommitted: fs.existsSync(path.join(root, "locales/zh-CN.json")) ? fs.readFileSync(path.join(root, "locales/zh-CN.json"), "utf8") : "",
    sourceRoot: root,
  });
  for (const violation of result.violations) console.error(`${violation.class}${violation.key ? ` ${violation.key}` : ""}: ${violation.message}`);
  process.exit(result.passed ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
