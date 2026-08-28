import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const ROOT = join(__dirname, "..");
const AI_PATHS = [
  "app/(tabs)/ai-coach.tsx",
  "app/settings/ai-key.tsx",
  "components/settings/KeyStatusCard.tsx",
  "components/coach",
  "lib/ai",
  "hooks/useCoachSessions.ts",
  "hooks/useModelCatalog.ts",
  "hooks/useKeyStatus.ts",
];
const ALLOWED_NETWORK_HOST = "openrouter.ai";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function collectFiles(relativePath: string): string[] {
  const absolutePath = join(ROOT, relativePath);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    throw new Error(`NO-SERVER guard could not inspect missing path: ${relativePath}`);
  }
  if (!stats.isDirectory()) return [absolutePath];
  return readdirSync(absolutePath).flatMap((entry) =>
    collectFiles(join(relativePath, entry)),
  );
}

function resolveRelativeImport(importer: string, specifier: string): string | null {
  const base = resolve(importer, "..");
  const candidates = [
    resolve(base, specifier),
    ...SOURCE_EXTENSIONS.map((extension) => resolve(base, `${specifier}${extension}`)),
    ...SOURCE_EXTENSIONS.map((extension) => resolve(base, specifier, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next TypeScript/JavaScript resolution candidate.
    }
  }
  return null;
}

function collectReachableFiles(seedFiles: string[]): string[] {
  const files = new Set<string>();
  const pending = [...seedFiles];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || files.has(file)) continue;
    files.add(file);

    const source = readFileSync(file, "utf8");
    const importPattern = /(?:from\s+|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const importedFile = resolveRelativeImport(file, specifier);
      if (importedFile) pending.push(importedFile);
    }
  }

  return [...files];
}

function collectDirectImports(files: string[]): Set<string> {
  const imports = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const importPattern = /(?:from\s+|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      if (match[1].startsWith(".")) {
        const importedFile = resolveRelativeImport(file, match[1]);
        if (importedFile) imports.add(importedFile);
      }
    }
  }
  return imports;
}

describe("AI path has no server relay", () => {
  it("permits only direct OpenRouter destinations and no workers imports", () => {
    const seedFiles = AI_PATHS.flatMap(collectFiles);
    const seedFileSet = new Set(seedFiles);
    const directImportSet = collectDirectImports(seedFiles);
    const files = collectReachableFiles(seedFiles);
    const violations: string[] = [];
    const destinationPattern = /(?:https?:)?\/\/([^/\s"'`]+)/g;

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/process\.env|expoConfig\.extra|Constants\.expoConfig/.test(source)) {
        violations.push(`${relative(ROOT, file)}: dynamic AI destination configuration`);
      }
      if (seedFileSet.has(file) || directImportSet.has(file) || /\b(fetch|XMLHttpRequest|axios|request)\s*\(/.test(source)) {
        for (const match of source.matchAll(destinationPattern)) {
          if (match[1] !== ALLOWED_NETWORK_HOST) {
            violations.push(`${relative(ROOT, file)}: network destination ${match[1]}`);
          }
        }
      }
      if (/\bworkers\//.test(source) || /from\s+["'][^"']*workers\//.test(source)) {
        violations.push(`${relative(ROOT, file)}: imports or references workers/`);
      }
    }

    const appConfig = readFileSync(join(ROOT, "app.config.ts"), "utf8");
    if (/(?:aiProxyUrl|coachBaseUrl|relayHost|coach(?:Endpoint|Url|URL))/.test(appConfig)) {
      violations.push("app.config.ts: coach endpoint in Expo extra");
    }

    if (violations.length > 0) {
      throw new Error(
        `NO-SERVER guard failed: AI Coach must call OpenRouter directly so private workout data and the BYOK key never pass through a server relay. Violations:\n${violations.join("\n")}`,
      );
    }
  }, 10_000);
});
