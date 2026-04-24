#!/usr/bin/env tsx
/**
 * CHANGELOG.md → runtime data + F-Droid sidecar generator.
 *
 * BLD-571 / PLAN-BLD-571.md
 *
 * Inputs:
 *   - <repo>/CHANGELOG.md       (canonical source of truth)
 *   - <repo>/app.config.ts      (parsed for `android.package`, path-only)
 *
 * Outputs (atomic tmp + renameSync):
 *   - <repo>/lib/changelog.generated.ts
 *       committed; consumed by the in-app ReleaseNotesModal.
 *   - <repo>/fdroid/metadata/<pkg>/en-US/changelogs/<versionCode>.txt
 *       one file per CHANGELOG entry that carries a
 *       `<!-- versionCode: N -->` marker, always ≤500 bytes.
 *
 * Exit codes:
 *   0  success (at least one valid entry emitted)
 *   1  CHANGELOG.md missing, unreadable, or parses to zero valid entries
 *
 * Hard-requirements (see plan ACs):
 *   - Missing/empty CHANGELOG  → non-zero exit, no partial files written.
 *   - Package id read dynamically from app.config.ts (regex, no loader).
 *   - F-Droid sidecars ≤500 bytes; overflow trimmed with a trailing
 *     "…see in-app release notes" suffix.
 *   - Sidecars only written for entries with a versionCode marker;
 *     markerless entries log to stderr and are skipped (exit 0).
 *   - Atomic writes: write to <path>.tmp-<pid>, then renameSync.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const TRUNCATION_SUFFIX = "…see in-app release notes";
const FDROID_MAX_BYTES = 500;

export interface ReleaseEntry {
  version: string;
  date: string | null;
  versionCode: number | null;
  body: string;
}

/** Parse CHANGELOG.md markdown into release entries, preserving file order. */
export function parseChangelog(source: string): {
  entries: ReleaseEntry[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const entries: ReleaseEntry[] = [];

  // Split on lines that look like a header "## ...". Preserve file order.
  const lines = source.split(/\r?\n/);
  let current: { header: string; body: string[] } | null = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    const parsed = parseSection(current.header, current.body.join("\n"));
    if (parsed.kind === "ok") {
      entries.push(parsed.entry);
    } else if (parsed.kind === "skip") {
      warnings.push(parsed.reason);
    }
    current = null;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (current) current.body.push(line);
      continue;
    }
    if (!inFence && line.startsWith("## ")) {
      flush();
      current = { header: line, body: [] };
    } else if (current) {
      current.body.push(line);
    }
    // Lines before the first `##` (preamble) are ignored intentionally.
  }
  flush();

  return { entries, warnings };
}

function parseSection(
  header: string,
  body: string
): { kind: "ok"; entry: ReleaseEntry } | { kind: "skip"; reason: string } {
  // Header shape: `## v<semver>[ — YYYY-MM-DD]`
  // Accept em-dash (—) or hyphen ( - ) as separator for robustness.
  const match = /^##\s+v(\d+\.\d+\.\d+(?:[-.][\w.]+)?)\s*(?:[—-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(
    header
  );
  if (!match) {
    return {
      kind: "skip",
      reason: `skipping malformed header (no v<semver>): ${header.trim()}`,
    };
  }

  const version = match[1];
  const date = match[2] ?? null;

  // Extract versionCode marker (anywhere inside the body).
  let versionCode: number | null = null;
  const vcMatch = /<!--\s*versionCode:\s*(\d+)\s*-->/.exec(body);
  if (vcMatch) {
    versionCode = Number.parseInt(vcMatch[1], 10);
  }

  // Strip the versionCode marker line from the body and trim trailing
  // blank lines so emitted files don't carry the HTML comment.
  const cleanedBody = body
    .replace(/^\s*<!--\s*versionCode:\s*\d+\s*-->\s*\n?/gm, "")
    .replace(/\s+$/g, "")
    .replace(/^\s+/, "");

  if (cleanedBody.length === 0) {
    return {
      kind: "skip",
      reason: `skipping empty section body for v${version}`,
    };
  }

  return {
    kind: "ok",
    entry: { version, date, versionCode, body: cleanedBody },
  };
}

/**
 * Truncate a body to fit F-Droid's 500-byte sidecar limit.
 * Uses byte-length (UTF-8), not JS string length.
 */
/**
 * Truncate a body to fit F-Droid's 500-byte sidecar limit.
 * Uses byte-length (UTF-8), not JS string length.
 *
 * Contract (AC):
 *   - If body ≤ maxBytes: returned value is byte-equivalent to body.
 *   - If body >  maxBytes: returned value is ≤ maxBytes and ends with
 *     `…see in-app release notes`.
 */
export function truncateForFdroid(body: string, maxBytes = FDROID_MAX_BYTES): string {
  const utf8 = Buffer.from(body, "utf8");
  if (utf8.byteLength <= maxBytes) return body;

  // Reserve: one newline separator + the suffix.
  const suffixBytes = Buffer.from(`\n${TRUNCATION_SUFFIX}`, "utf8").byteLength;
  const budget = maxBytes - suffixBytes;
  if (budget <= 0) return TRUNCATION_SUFFIX.slice(0, maxBytes);

  // Byte-safe slice: walk back to avoid cutting a multi-byte char.
  const slice = utf8.slice(0, budget);
  let text = slice.toString("utf8");
  // If the tail is a replacement char due to a split codepoint, strip it.
  text = text.replace(/\uFFFD+$/g, "");
  // Prefer a clean break at newline / space boundary (within last 80 chars).
  const boundary = Math.max(text.lastIndexOf("\n"), text.lastIndexOf(" "));
  if (boundary > 0 && boundary > text.length - 80) {
    text = text.slice(0, boundary);
  }
  text = text.replace(/\s+$/g, "");
  return `${text}\n${TRUNCATION_SUFFIX}`;
}

/** Read `android.package` from app.config.ts via regex (no loader). */
export function readAndroidPackage(appConfigSource: string): string {
  // Matches `package: "com.example.foo",` or single-quoted variants.
  const match = /package\s*:\s*["']([a-zA-Z][\w.]+)["']/.exec(appConfigSource);
  if (!match) {
    throw new Error(
      "unable to parse android.package from app.config.ts — generator cannot emit F-Droid sidecars"
    );
  }
  return match[1];
}

/** Serialize entries into the runtime module source. */
export function renderGeneratedModule(entries: ReleaseEntry[]): string {
  const header = [
    "// AUTO-GENERATED by scripts/generate-changelog.ts from CHANGELOG.md.",
    "// Do not edit by hand — run `npm run changelog:gen` to refresh.",
    "",
    "export interface ReleaseEntry {",
    "  version: string;",
    "  date: string | null;",
    "  versionCode: number | null;",
    "  body: string;",
    "}",
    "",
  ].join("\n");

  const body = JSON.stringify(entries, null, 2);
  return `${header}\nexport const CHANGELOG: ReleaseEntry[] = ${body};\n`;
}

function atomicWrite(targetPath: string, contents: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  writeFileSync(tmpPath, contents, "utf8");
  renameSync(tmpPath, targetPath);
}

export interface GenerateOptions {
  repoRoot: string;
  changelogPath?: string;
  appConfigPath?: string;
  outputModulePath?: string;
  fdroidChangelogsDir?: (pkg: string) => string;
  logger?: Pick<Console, "error" | "warn">;
}

export interface GenerateResult {
  entries: ReleaseEntry[];
  modulePath: string;
  sidecarsWritten: string[];
  warnings: string[];
  androidPackage: string;
}

export function generate(opts: GenerateOptions): GenerateResult {
  const {
    repoRoot,
    changelogPath = join(repoRoot, "CHANGELOG.md"),
    appConfigPath = join(repoRoot, "app.config.ts"),
    outputModulePath = join(repoRoot, "lib", "changelog.generated.ts"),
    logger = console,
  } = opts;

  if (!existsSync(changelogPath)) {
    throw new Error(`ERR: CHANGELOG.md not found at ${changelogPath}`);
  }

  const changelogSource = readFileSync(changelogPath, "utf8");
  const { entries, warnings } = parseChangelog(changelogSource);

  for (const warning of warnings) {
    logger.warn(`[changelog] ${warning}`);
  }

  if (entries.length === 0) {
    throw new Error(
      "ERR: no valid release entries parsed from CHANGELOG.md (expected at least one `## v<semver>` section)"
    );
  }

  const appConfigSource = readFileSync(appConfigPath, "utf8");
  const androidPackage = readAndroidPackage(appConfigSource);

  const fdroidDir =
    opts.fdroidChangelogsDir?.(androidPackage) ??
    join(
      repoRoot,
      "fdroid",
      "metadata",
      androidPackage,
      "en-US",
      "changelogs"
    );

  // 1) Write the runtime module (atomic).
  atomicWrite(outputModulePath, renderGeneratedModule(entries));

  // 2) Emit F-Droid sidecars for entries with an explicit marker.
  const sidecarsWritten: string[] = [];
  for (const entry of entries) {
    if (entry.versionCode == null) {
      logger.warn(
        `[changelog] skipping F-Droid sidecar for v${entry.version} (no versionCode marker)`
      );
      continue;
    }
    const target = join(fdroidDir, `${entry.versionCode}.txt`);
    // truncateForFdroid always returns a value ending with `\n` and ≤500 bytes.
    const finalBody = truncateForFdroid(entry.body);
    atomicWrite(target, finalBody);
    sidecarsWritten.push(target);
  }

  return {
    entries,
    modulePath: outputModulePath,
    sidecarsWritten,
    warnings,
    androidPackage,
  };
}

function main(): void {
  const repoRoot = resolve(__dirname, "..");
  try {
    const result = generate({ repoRoot });
    // eslint-disable-next-line no-console
    console.log(
      `[changelog] wrote ${result.modulePath} (${result.entries.length} entries) + ${result.sidecarsWritten.length} F-Droid sidecar(s)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }
}

// Execute when run as a script (tsx) but not when imported by tests.
// __filename is defined in CJS; use a tsx-safe check.
if (typeof require !== "undefined" && require.main === module) {
  main();
}
