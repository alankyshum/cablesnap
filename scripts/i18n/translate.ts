#!/usr/bin/env tsx
import path from "node:path";
import { makeCatalogEntry, shouldSkipEntry, sourceHash, type CatalogEntry } from "./catalog-entry";
import { readCatalog, writeCatalog, type Catalog } from "./catalog-io";
import { sp2tw } from "./opencc";

export interface TranslationRequest { key: string; source: string; }
export interface TranslationAdapter {
  name: string;
  translateBatch(requests: TranslationRequest[], targetLocale: string, systemPrompt: string): Promise<Record<string, string>>;
}
export interface TranslationPlan { missing: string[]; stale: string[]; skipped: string[]; }

const BATCH_SIZE = 1;
const LATIN_ONLY_ALLOWLIST = new Set(["settings.integrations.strava", "settings.about.version"]);
const GLOSSARY = "Taiwan fitness glossary: use 深蹲 for squat, 臥推 for bench press, 硬舉 for deadlift, 組數 for sets, and 次數 for reps; use 影片, not 视频, and 滑鼠, not 鼠標. Use Taiwan-localized Traditional Chinese, not mainland vocabulary and not a bare Simplified-to-Traditional script conversion. Preserve exercise names, RPE, PR, 1RM, tempo, warm-up, cooldown, macros, units, and interpolation-like tokens accurately.";

// The planning conditions intentionally combine cache, script, and ICU checks.
// eslint-disable-next-line complexity
export function planTranslations(source: Catalog, target: Catalog): TranslationPlan {
  const plan: TranslationPlan = { missing: [], stale: [], skipped: [] };
  for (const [key, entry] of Object.entries(source)) {
    const existing = getEntry(target[key]);
    const sourceMessage = getMessage(entry);
    const hasCjk = /[\u3400-\u9fff]/.test(existing?.message ?? "");
    const needsTaiwanScript = target !== source && Boolean(existing) && sp2tw(existing!.message) !== existing!.message;
    const needsCjk = target !== source && !LATIN_ONLY_ALLOWLIST.has(key) && /[A-Za-z]{3}/.test(sourceMessage) && !isPlaceholderOnly(sourceMessage) && !hasCjk && existing?.message === sourceMessage;
    const sourceIsCurrent = existing?.srcHash === sourceHash(key, sourceMessage);
    // A human entry is normally authoritative, but source edits can make its
    // ICU shape stale. Let the configured translator repair those entries
    // rather than allowing the gate to keep reporting old placeholders.
    const humanEntryNeedsRepair = existing?.origin === "human" && (!sourceIsCurrent || placeholderNames(existing.message) !== placeholderNames(sourceMessage));
    if (shouldSkipEntry(existing, key, sourceMessage) && !humanEntryNeedsRepair && sourceIsCurrent && !needsTaiwanScript && !needsCjk && (!existing || placeholderNames(existing.message) === placeholderNames(sourceMessage))) { plan.skipped.push(key); continue; }
    if (!existing) plan.missing.push(key);
    else plan.stale.push(key);
  }
  return plan;
}

export function placeholderNames(message: string): string {
  const names: string[] = [];
  let depth = 0;
  for (let index = 0; index < message.length; index++) {
    if (message[index] === "{") {
      if (depth === 0) {
        const match = message.slice(index + 1).match(/^\s*([A-Za-z_][\w.-]*|\d+)\s*(?:[,}])/);
        if (match) names.push(match[1]);
      }
      depth++;
    } else if (message[index] === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return names.sort().join("\u0000");
}

function isPlaceholderOnly(message: string): boolean {
  return message.replace(/\{[^{}]*\}/g, "").replace(/[\s,():+./%×–—-]/g, "").trim() === "";
}

function getMessage(entry: Catalog[string]): string {
  return typeof entry === "string" ? entry : entry.message;
}

function getEntry(entry: Catalog[string] | undefined): CatalogEntry | undefined {
  return entry && typeof entry !== "string" ? entry : undefined;
}

export function systemPrompt(targetLocale: string): string {
  return `You translate CableSnap fitness UI strings into ${targetLocale}. For every entry, translate the source value; never return the locale name, key name, source value, an explanation, or a placeholder label as the translation. Return only a flat JSON object mapping each exact, opaque key string to its translated string. Keys may contain dots; never nest or restructure keys. ICU syntax is immutable: copy every brace-delimited ICU expression byte-for-byte, including its argument name/number, plural/select keyword, exact branch selectors, and nested braces; translate only human-readable text inside the branches. Preserve every ICU expression exactly once, in the same position, without translating, omitting, renaming, reordering, or inventing placeholders. If you return an entries array, use fields {key, translation}; never put the translation in source or message. Keep markup unchanged. Every human-readable branch must be translated into natural ${targetLocale}: do not leave English words such as one, other, up, down, session, set, exercise, selected, or rest day inside the translated prose. Never output the literal string zh-TW or zh-CN. Use Traditional Chinese characters for zh-TW (Taiwan register: 組, 匯入, 影片) and do not emit Simplified characters. Use a natural, concise, respectful native-speaker persona. ${GLOSSARY}`;
}

export function selectAdapter(name = process.env.I18N_ADAPTER ?? "ollama"): TranslationAdapter {
  if (name === "ollama") {
    // Dynamic import keeps adapter implementations out of the application graph.
    // This function is used only by the dev-only CLI entrypoint.
    const { createOllamaAdapter } = require("./adapters/ollama") as typeof import("./adapters/ollama");
    return createOllamaAdapter();
  }
  if (name === "openai") {
    const { createOpenAIAdapter } = require("./adapters/openai") as typeof import("./adapters/openai");
    return createOpenAIAdapter();
  }
  throw new Error(`Unknown adapter: ${name}`);
}

export async function translateCatalog(options: {
  locale: string; dryRun?: boolean; adapter?: TranslationAdapter; root?: string;
}): Promise<TranslationPlan> {
  const root = options.root ?? process.cwd();
  const source = readCatalog("en-US", root);
  const target = readCatalog(options.locale, root);
  const plan = planTranslations(source, target);
  if (options.dryRun) return plan;
  const adapter = options.adapter ?? selectAdapter();
  const keys = [...plan.missing, ...plan.stale];
  for (let start = 0; start < keys.length; start += BATCH_SIZE) {
    const requests = keys.slice(start, start + BATCH_SIZE).map(key => ({ key, source: getMessage(source[key]) }));
    let translated: Record<string, string> = {};
    let pending = requests;
    for (const request of requests) {
      if (isPlaceholderOnly(request.source)) translated[request.key] = request.source;
    }
    pending = pending.filter(request => !(request.key in translated));
    for (let attempt = 0; attempt < 10 && pending.length; attempt++) {
      const retryPrompt = attempt === 0 ? systemPrompt(options.locale) : `${systemPrompt(options.locale)} Retry only the following entries. Return {key, translation}. Copy every brace-delimited ICU token byte-for-byte into translation before translating the surrounding words. Never replace a token such as {weightUnit}, {UNICODE_MINUS}, or {0} with a localized word. Source entries: ${pending.map(request => `${request.key} SOURCE=${JSON.stringify(request.source)}`).join("; ")}`;
      const response = await adapter.translateBatch(pending, options.locale, retryPrompt);
      translated = {
        ...translated,
        ...Object.fromEntries(Object.entries(response).filter(([key, message]) =>
          placeholderNames(message) === placeholderNames(getMessage(source[key]))
        )),
      };
      pending = pending.filter(request => typeof translated[request.key] !== "string");
    }
    for (const request of requests) {
      const message = translated[request.key];
      if (typeof message !== "string") throw new Error(`Adapter omitted translation for ${request.key}`);
      target[request.key] = makeCatalogEntry(request.key, request.source, message);
    }
    writeCatalog(options.locale, target, root);
  }
  writeCatalog(options.locale, target, root);
  return plan;
}

export function parseArgs(argv: string[]): { locale: string; dryRun: boolean; adapter?: string } {
  let locale = ""; let dryRun = false; let adapter: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--locale") locale = argv[++i] ?? "";
    else if (arg === "--adapter") adapter = argv[++i] ?? "";
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (!locale) throw new Error("--locale is required");
  return { locale, dryRun, adapter };
}

function printPlan(plan: TranslationPlan): void {
  console.log(`missing (${plan.missing.length}): ${plan.missing.join(", ") || "none"}`);
  console.log(`stale (${plan.stale.length}): ${plan.stale.join(", ") || "none"}`);
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = await translateCatalog({ ...args, adapter: args.adapter ? selectAdapter(args.adapter) : undefined });
  printPlan(plan);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
