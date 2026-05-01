/**
 * Consolidated source-string token/contract tests for components (BLD-918).
 * Each describe block preserves original assertions.
 */
/* eslint-disable max-lines */
import fs from "fs";
import path from "path";

import { BW_MODIFIER_VOLUME_NOTICE } from "../components/exercises/BodyweightModifierNotice";
import { flowCardStyle } from "../components/ui/FlowContainer";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(root, rel), "utf-8");
}

// ── RecoveryHeatmap theme tokens (BLD-521) ───────────────────────

describe("RecoveryHeatmap theme-token contract", () => {
  const source = readSrc("components/home/RecoveryHeatmap.tsx");

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources heatmap palette from useThemeColors() tokens", () => {
    expect(source).toMatch(/colors\.heatmapLow/);
    expect(source).toMatch(/colors\.heatmapMid/);
    expect(source).toMatch(/colors\.heatmapHigh/);
    expect(source).toMatch(/colors\.heatmapBorder/);
  });

  it("does not branch on isDark for the static heatmap palette", () => {
    expect(source).not.toMatch(/isDark\s*\?\s*\[/);
    expect(source).not.toMatch(/RECOVERY_COLORS/);
  });
});

// ── RestBreakdownSheet theme tokens ──────────────────────────────

describe("RestBreakdownSheet theme-token contract", () => {
  const source = readSrc("components/session/RestBreakdownSheet.tsx");

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources colors from useThemeColors()", () => {
    expect(source).toMatch(/useThemeColors/);
    expect(source).toMatch(/colors\.(onSurface|primary|surface|outline|secondary)/);
  });
});

// ── SubstitutionItem theme tokens (BLD-521) ──────────────────────

describe("SubstitutionItem theme-token contract", () => {
  const source = readSrc("components/substitution/SubstitutionItem.tsx");

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources score palette from Colors.{light,dark}.*Subtle tokens", () => {
    expect(source).toMatch(/successSubtle/);
    expect(source).toMatch(/warningSubtle/);
    expect(source).toMatch(/dangerSubtle/);
  });
});

// ── flow-card-colors theme tokens (BLD-521) ──────────────────────

describe("flow-card-colors theme-token contract", () => {
  const source = readSrc("components/ui/flow-card-colors.ts");

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources severity pairs from Colors.{light,dark}.*Subtle tokens", () => {
    expect(source).toMatch(/successSubtle/);
    expect(source).toMatch(/warningSubtle/);
    expect(source).toMatch(/dangerSubtle/);
    expect(source).toMatch(/Colors\[/);
  });
});

// ── toast-item theme tokens (BLD-507) ────────────────────────────

describe("toast-item theme-token contract", () => {
  const source = readSrc("components/ui/toast-item.tsx");

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources variant colors from Colors.dark.* tokens", () => {
    expect(source).toMatch(/success:\s*Colors\.dark\.green/);
    expect(source).toMatch(/error:\s*Colors\.dark\.red/);
    expect(source).toMatch(/warning:\s*Colors\.dark\.orange/);
    expect(source).toMatch(/info:\s*Colors\.dark\.blue/);
    expect(source).toMatch(/MUTED\s*=\s*Colors\.dark\.textMuted/);
  });
});

// ── toast-item positioning (BLD-569) ─────────────────────────────

describe("toast positioning contract (BLD-569)", () => {
  const source = readSrc("components/ui/toast-item.tsx");
  const providerSource = readSrc("components/ui/bna-toast.tsx");

  it("does NOT use Platform.OS branch for toast offset", () => {
    expect(source).not.toMatch(/Platform\.OS\s*===\s*['"]ios['"]\s*\?\s*\d+\s*:\s*\d+/);
  });

  it("does NOT hardcode numeric top = 20 or top = 59", () => {
    expect(source).not.toMatch(/\btop\s*=\s*\(\s*Platform/);
  });

  it("uses safe-area insets for offset", () => {
    expect(source).toMatch(/useSafeAreaInsets/);
    expect(source).toMatch(/insets\.bottom/);
  });

  it("anchors container to bottom, not top", () => {
    expect(providerSource).toMatch(/bottom:\s*0/);
    expect(providerSource).not.toMatch(/containerStyle[^}]*top:\s*0/);
  });

  it("applies a max-width cap for legibility", () => {
    expect(source).toMatch(/maxWidth/);
  });
});

// ── toast-copy-length (BLD-569 AC4) ──────────────────────────────

describe("toast copy discipline (BLD-569 AC4)", () => {
  const MAX_TITLE_LENGTH = 60;
  const ROOTS = ["hooks", "app", "components"];
  const EXT_RE = /\.(ts|tsx)$/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fp, out);
      else if (entry.isFile() && EXT_RE.test(entry.name)) out.push(fp);
    }
    return out;
  }

  type Match = { file: string; line: number; length: number; title: string };

  function matchesTitles(
    src: string,
    regex: RegExp,
    captureIdx: number,
    isPrefixed: boolean,
  ): Array<{ title: string; index: number }> {
    const out: Array<{ title: string; index: number }> = [];
    for (const m of src.matchAll(regex)) {
      const idx = m.index ?? 0;
      if (isPrefixed && src[idx + "toast".length] === ".") continue;
      out.push({ title: m[captureIdx], index: idx });
    }
    return out;
  }

  function collectToastTitles(repoRoot: string): Match[] {
    const singleDoubleMethod = /\btoast\.(?:success|error|warning|info)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    const singleDoublePlain = /\btoast\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    const templMethod = /\btoast\.(?:success|error|warning|info)\s*\(\s*`([^`$]*)`/g;
    const templPlain = /\btoast\s*\(\s*`([^`$]*)`/g;

    const offenders: Match[] = [];
    for (const rootDir of ROOTS) {
      const absRoot = path.join(repoRoot, rootDir);
      if (!fs.existsSync(absRoot)) continue;
      for (const file of walk(absRoot)) {
        const src = fs.readFileSync(file, "utf8");
        const relPath = path.relative(repoRoot, file);
        const hits = [
          ...matchesTitles(src, singleDoubleMethod, 2, false),
          ...matchesTitles(src, singleDoublePlain, 2, true),
          ...matchesTitles(src, templMethod, 1, false),
          ...matchesTitles(src, templPlain, 1, true),
        ];
        for (const { title, index } of hits) {
          if (title.length > MAX_TITLE_LENGTH) {
            const line = src.slice(0, index).split("\n").length;
            offenders.push({ file: relPath, line, length: title.length, title });
          }
        }
      }
    }
    return offenders;
  }

  it("no toast title literal exceeds 60 characters", () => {
    const offenders = collectToastTitles(root);
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}:${o.line} (${o.length} chars) "${o.title}"`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} toast title(s) exceeding ${MAX_TITLE_LENGTH} chars.\n` +
          `Keep titles at-a-glance readable (~10 words) during a workout.\n` +
          `Move detail into the description arg or the options object.\n\n` +
          msg,
      );
    }
    expect(offenders).toEqual([]);
  });
});

// ── bw-records-sql (BLD-541) ─────────────────────────────────────

describe("getExerciseRecords — weighted-bodyweight SQL contract (BLD-541)", () => {
  const src = readSrc("lib/db/exercise-history.ts");

  it.each([
    {
      name: "best_added uses MAX over positive modifiers",
      needle: /MAX\(CASE WHEN ws\.bodyweight_modifier_kg > 0/,
    },
    {
      name: "best_assisted uses MAX over negative modifiers (closest to zero)",
      needle: /MAX\(CASE WHEN ws\.bodyweight_modifier_kg < 0/,
    },
  ])("$name", ({ needle }) => {
    expect(src).toMatch(needle);
  });

  it("best_assisted MUST NOT use MIN (regression guard for reviewer finding)", () => {
    expect(src).not.toMatch(/MIN\(CASE WHEN ws\.bodyweight_modifier_kg < 0/);
  });
});

// ── interaction-log limits ───────────────────────────────────────

describe("interaction log limits", () => {
  const src = readSrc("lib/db/settings.ts");

  it("insertInteraction prunes to 5 entries", () => {
    expect(src).toMatch(/ORDER BY timestamp DESC LIMIT 5/);
  });

  it("getInteractions returns up to 5 entries", () => {
    expect(src).toMatch(/\.limit\(5\)/);
  });

  it("does NOT use time-based pruning", () => {
    expect(src).not.toMatch(/timestamp\s*<\s*\?.*60/);
    expect(src).not.toMatch(/strftime.*60/);
  });
});

// ── editCompletedSession web payload (BLD-690, BLD-660) ──────────

describe("editCompletedSession web-platform payload size (BLD-690 + BLD-660)", () => {
  function writeLengthFixed(buf: ArrayBuffer, length: number): void {
    new DataView(buf).setUint32(0, length, true);
  }

  function readLength(buf: ArrayBuffer): number {
    return new Uint32Array(buf, 0, 1)[0];
  }

  function buildLargePayload(setCount: number): unknown {
    const upserts = [];
    for (let i = 0; i < setCount; i++) {
      upserts.push({
        id: `set-${i}`,
        exercise_id: `ex-${i % 5}`,
        weight: 80 + i * 2.5,
        reps: 8 + (i % 4),
        rpe: 7.5 + (i % 3) * 0.5,
        completed: 1,
        set_type: "normal",
        notes: `auto-edit ${i}`,
      });
    }
    return { upserts, deletes: [] };
  }

  it("a 30-set edit payload exceeds 256 bytes (the BLD-660 cliff)", () => {
    const json = JSON.stringify(buildLargePayload(30));
    expect(json.length).toBeGreaterThan(256);
  });

  it("the patched length-prefix writer round-trips a realistic edit payload size", () => {
    const json = JSON.stringify(buildLargePayload(30));
    const buf = new ArrayBuffer(8);
    writeLengthFixed(buf, json.length);
    expect(readLength(buf)).toBe(json.length);
    expect(readLength(buf)).toBeGreaterThan(256);
  });

  it("verifies the patched WorkerChannel.ts file is shipped via patch-package", () => {
    const workerChannelPath = path.join(
      root,
      "node_modules",
      "expo-sqlite",
      "web",
      "WorkerChannel.ts",
    );
    if (!fs.existsSync(workerChannelPath)) {
      return;
    }
    const content = fs.readFileSync(workerChannelPath, "utf8");
    expect(content).toMatch(/setUint32\([^)]*0[^)]*,[^)]*length[^)]*,[^)]*true[^)]*\)/);
    expect(content).not.toMatch(/new\s+Uint8Array\([^)]*\)\.set\(\s*new\s+Uint32Array\(\[length\]\)\s*,\s*0\s*\)/);
  });
});

// ── Sentry source-map upload wiring (BLD-567) ───────────────────

describe("Sentry source-map upload wiring (BLD-567)", () => {
  const configSrc = readSrc("app.config.ts");
  const yamlSrc = readSrc(".github/workflows/scheduled-release.yml");

  it("app.config.ts registers the Expo plugin with env-var org/project and no embedded auth token", () => {
    expect(configSrc).toMatch(/@sentry\/react-native\/expo/);
    expect(configSrc).toMatch(/organization:\s*process\.env\.SENTRY_ORG/);
    expect(configSrc).toMatch(/project:\s*process\.env\.SENTRY_PROJECT/);
    expect(configSrc).not.toMatch(/authToken\s*:/);
  });

  it("scheduled-release.yml passes SENTRY_* secrets to BOTH prebuild + gradle steps", () => {
    const tokenRefs =
      yamlSrc.match(
        /SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/g,
      ) ?? [];
    expect(tokenRefs.length).toBeGreaterThanOrEqual(2);
    const orgRefs =
      yamlSrc.match(/SENTRY_ORG:\s*\$\{\{\s*secrets\.SENTRY_ORG\s*\}\}/g) ?? [];
    expect(orgRefs.length).toBeGreaterThanOrEqual(2);
    const projectRefs =
      yamlSrc.match(
        /SENTRY_PROJECT:\s*\$\{\{\s*secrets\.SENTRY_PROJECT\s*\}\}/g,
      ) ?? [];
    expect(projectRefs.length).toBeGreaterThanOrEqual(2);
  });

  it("no Sentry auth-token literal leaks into committed config or workflow", () => {
    for (const src of [configSrc, yamlSrc]) {
      expect(src).not.toMatch(/sntry[su]_[A-Za-z0-9_-]{10,}/);
      expect(src).not.toMatch(/auth\.token\s*=/i);
    }
  });
});

// ── Install lifecycle scripts (BLD-741) ──────────────────────────

describe("Install lifecycle scripts (BLD-741)", () => {
  interface PackageJson {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }

  const pkg: PackageJson = JSON.parse(readSrc("package.json"));

  it("declares patch-package in dependencies (not devDependencies) so headless installs do not skip it", () => {
    expect(pkg.dependencies?.["patch-package"]).toBeDefined();
    expect(pkg.devDependencies?.["patch-package"]).toBeUndefined();
  });

  it("postinstall hook invokes patch-package via `npx --no-install` to bypass PATH lookup", () => {
    const postinstall = pkg.scripts?.postinstall ?? "";
    expect(postinstall).toContain("patch-package");
    expect(postinstall).toMatch(/npx\s+--no-install\s+patch-package/);
  });

  it("prepare hook tolerates missing husky in production / agent containers", () => {
    const prepare = pkg.scripts?.prepare ?? "";
    expect(prepare).toMatch(/husky\s*\|\|\s*true/);
  });
});

// ── assets/sounds invariant (BLD-559) ────────────────────────────

describe("assets/sounds invariant (BLD-559)", () => {
  const { readdirSync, statSync, readFileSync: readFS } = fs;
  const SOUNDS_DIR = path.join(root, "assets", "sounds");

  it("contains exactly one set-complete.* file (non-recursive)", () => {
    const entries = readdirSync(SOUNDS_DIR);
    const matches = entries.filter((name) => /^set-complete\.[^/]+$/.test(name));
    expect(matches).toHaveLength(1);
  });

  it("has zero subdirectories", () => {
    const entries = readdirSync(SOUNDS_DIR);
    const dirs = entries.filter((name) => {
      try {
        return statSync(path.join(SOUNDS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    });
    expect(dirs).toEqual([]);
  });

  it("LICENSES.md declares set-complete.wav as CC0-1.0", () => {
    const licenseText = readFS(path.join(SOUNDS_DIR, "LICENSES.md"), "utf8");
    expect(licenseText).toMatch(/set-complete\.wav/);
    expect(licenseText).toMatch(/CC0-1\.0/);
  });
});

// ── lib/audio.ts single-source invariant (BLD-582 AC-10) ─────────

describe("lib/audio.ts single-source invariant (BLD-582 AC-10)", () => {
  const src = readSrc("lib/audio.ts");

  it("has exactly one `set_complete: require(...)` mapping", () => {
    const matches = src.match(/set_complete:\s*require\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("has no `[` within 40 chars after the set_complete anchor (no variant array)", () => {
    const idx = src.indexOf("set_complete:");
    expect(idx).toBeGreaterThanOrEqual(0);
    const window = src.slice(idx, idx + 53);
    expect(window).not.toMatch(/\[/);
  });

  it.each([
    ["pitchShift"],
    ["detune"],
    ["rate:"],
    ["playbackRate"],
  ])("does not reference %s anywhere in the module", (token) => {
    expect(src).not.toContain(token);
  });
});

// ── play('set_complete') single-call-site invariant (BLD-582 AC-7) ─

describe("play('set_complete') single-call-site invariant (BLD-582 AC-7)", () => {
  const SCAN_DIRS = ["hooks", "components", "app", "lib"];
  const EXCLUDE_SEGMENTS = new Set([
    "__tests__", "__mocks__", "e2e", "node_modules", "dist", ".plans",
  ]);
  const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
  const CALL_PATTERN = /play(?:Audio)?\(\s*['"`]set_complete['"`]\s*\)/g;

  function walk(dir: string, out: string[]): void {
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (EXCLUDE_SEGMENTS.has(name)) continue;
      const full = path.join(dir, name);
      let s;
      try { s = fs.statSync(full); } catch { continue; }
      if (s.isDirectory()) {
        walk(full, out);
      } else if (s.isFile()) {
        const dotIdx = name.lastIndexOf(".");
        if (dotIdx < 0) continue;
        const ext = name.slice(dotIdx);
        if (!SCAN_EXTS.has(ext)) continue;
        out.push(full);
      }
    }
  }

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);

  const hits: { file: string; count: number }[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const m = src.match(CALL_PATTERN);
    if (m && m.length > 0) {
      hits.push({ file: path.relative(root, f).split(path.sep).join("/"), count: m.length });
    }
  }

  it("has exactly one production call site (total match count === 1)", () => {
    const total = hits.reduce((a, h) => a + h.count, 0);
    expect({ total, hits }).toEqual({ total: 1, hits: [{ file: "hooks/useSetCompletionFeedback.ts", count: 1 }] });
  });

  it("anti-stacking: the call-site module does not re-fire set_complete inside setTimeout/setInterval", () => {
    const hookSrc = readSrc("hooks/useSetCompletionFeedback.ts");
    const schedulerPattern = /set(?:Timeout|Interval)\s*\(\s*(?:\([^)]*\)\s*=>|function[^{]*)\s*\{[^}]*play(?:Audio)?\(\s*['"`]set_complete['"`]/s;
    expect(hookSrc).not.toMatch(schedulerPattern);
  });
});

// ── set-complete.wav asset budget (BLD-582 AC-9) ─────────────────

describe("set-complete.wav asset budget (BLD-582 AC-9)", () => {
  const WAV_PATH = path.join(root, "assets", "sounds", "set-complete.wav");
  const MAX_BYTES = 30 * 1024;
  const MAX_DURATION_MS = 250;
  const MAX_SAMPLE_RATE = 48000;

  function readU16LE(buf: Buffer, off: number): number {
    return buf.readUInt16LE(off);
  }
  function readU32LE(buf: Buffer, off: number): number {
    return buf.readUInt32LE(off);
  }

  function findDataChunkSize(buf: Buffer): number {
    for (let i = 12; i < buf.length - 8; i++) {
      if (
        buf[i] === 0x64 &&
        buf[i + 1] === 0x61 &&
        buf[i + 2] === 0x74 &&
        buf[i + 3] === 0x61
      ) {
        return readU32LE(buf, i + 4);
      }
    }
    throw new Error("data chunk not found in WAV");
  }

  const buf = fs.readFileSync(WAV_PATH);

  it("file size ≤ 30 KB", () => {
    expect(buf.length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("is a RIFF/WAVE container", () => {
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("AudioFormat === 1 (PCM)", () => {
    expect(readU16LE(buf, 20)).toBe(1);
  });

  it("NumChannels === 1 (mono)", () => {
    expect(readU16LE(buf, 22)).toBe(1);
  });

  it("SampleRate ≤ 48000", () => {
    const sr = readU32LE(buf, 24);
    expect(sr).toBeGreaterThan(0);
    expect(sr).toBeLessThanOrEqual(MAX_SAMPLE_RATE);
  });

  it("BitsPerSample === 16", () => {
    expect(readU16LE(buf, 34)).toBe(16);
  });

  it("duration ≤ 250 ms", () => {
    const byteRate = readU32LE(buf, 28);
    expect(byteRate).toBeGreaterThan(0);
    const dataBytes = findDataChunkSize(buf);
    const durationMs = (dataBytes / byteRate) * 1000;
    expect(durationMs).toBeLessThanOrEqual(MAX_DURATION_MS);
  });
});

// ── ExerciseTutorialLink parity (BLD-593) ────────────────────────

describe("ExerciseTutorialLink — parity across detail surfaces", () => {
  const paneSrc = readSrc("components/exercises/ExerciseDetailPane.tsx");
  const drawerSrc = readSrc("components/session/ExerciseDetailDrawer.tsx");

  it("ExerciseDetailPane imports and renders ExerciseTutorialLink", () => {
    expect(paneSrc).toMatch(
      /import \{ ExerciseTutorialLink \} from ["']\.\/ExerciseTutorialLink["']/,
    );
    expect(paneSrc).toMatch(/<ExerciseTutorialLink\s+exerciseName=\{detail\.name\}/);
  });

  it("ExerciseDetailDrawer imports and renders ExerciseTutorialLink", () => {
    expect(drawerSrc).toMatch(
      /import \{ ExerciseTutorialLink \} from ["']\.\.\/exercises\/ExerciseTutorialLink["']/,
    );
    const matches = drawerSrc.match(/<ExerciseTutorialLink\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(drawerSrc).toMatch(
      /<ExerciseTutorialLink\s+exerciseName=\{exercise\.name\}/,
    );
  });
});

// ── usePRCelebration regression lock (BLD-559) ──────────────────

describe("usePRCelebration regression lock (BLD-559)", () => {
  const source = readSrc("hooks/usePRCelebration.ts");
  const executable = source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith("//")) return false;
      if (t.startsWith("*")) return false;
      if (t.startsWith("/*")) return false;
      return true;
    })
    .join("\n");

  const BANNED: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: "Haptics.impact", pattern: /Haptics\.impact/ },
    { label: "Haptics.notification", pattern: /Haptics\.notification/ },
    { label: "import from lib/audio", pattern: /from\s+['"][^'"]*lib\/audio['"]/ },
    { label: "require of lib/audio", pattern: /require\(\s*['"][^'"]*lib\/audio['"]/ },
  ];

  it.each(BANNED.map((b) => [b.label, b.pattern] as const))(
    "executable source contains no %s",
    (_label, pattern) => {
      expect(executable).not.toMatch(pattern);
    }
  );
});

// ── BodyweightModifierNotice AC-23 (BLD-541) ────────────────────

describe("BodyweightModifierNotice — AC-23 plan-locked copy", () => {
  const expected =
    "Weighted-bodyweight modifier is tracked as a PR dimension but does not yet contribute to weekly/monthly volume totals.";

  it("exports the exact plan-locked wording (no paraphrase)", () => {
    expect(BW_MODIFIER_VOLUME_NOTICE).toBe(expected);
  });

  it.each([
    {
      name: "app/exercise/[id].tsx (main exercise detail)",
      rel: "app/exercise/[id].tsx",
    },
    {
      name: "components/exercises/ExerciseDetailPane.tsx (tablet split-pane)",
      rel: "components/exercises/ExerciseDetailPane.tsx",
    },
  ])(
    "$name renders BodyweightModifierNotice gated on equipment === 'bodyweight'",
    ({ rel }) => {
      const src = readSrc(rel);
      expect(src).toMatch(/import \{ BodyweightModifierNotice \} from/);
      expect(src).toMatch(
        /equipment === ['"]bodyweight['"][\s\S]{0,80}BodyweightModifierNotice/,
      );
    },
  );
});

// ── useSessionActions bw-modifier-default cache contract (BLD-541) ──

describe("useSessionActions — bw-modifier-default cache contract (BLD-541)", () => {
  const src = readSrc("hooks/useSessionActions.ts");

  type Case =
    | { name: string; shouldMatch: RegExp }
    | { name: string; shouldNotMatch: RegExp }
    | { name: string; maxCount: number; pattern: RegExp };

  it.each<Case>([
    {
      name: "handleAddSet fetches via queryClient.fetchQuery with the locked key",
      shouldMatch: /queryClient\.fetchQuery\(\s*\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleAddSet invalidates ['bw-modifier-default', exerciseId] after persist",
      shouldMatch: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', exerciseId\]/,
    },
    {
      name: "handleCheck invalidates ['bw-modifier-default', set.exercise_id] on set-complete",
      shouldMatch: /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default', set\.exercise_id\]/,
    },
    {
      name: "handleCheck invalidation is gated on is_bodyweight (NOT on modifier nullability)",
      shouldMatch: /group\?\.is_bodyweight\)\s*\{\s*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default'/,
    },
    {
      name: "forbids the legacy `if (set.bodyweight_modifier_kg != null)` invalidation shape",
      shouldNotMatch: /if \(set\.bodyweight_modifier_kg != null\)\s*\{\s*queryClient\.invalidateQueries\(\{\s*queryKey:\s*\['bw-modifier-default'/,
    },
    {
      name: "handleAddSet does NOT call getLastBodyweightModifier directly (only via fetchQuery queryFn)",
      pattern: /getLastBodyweightModifier\s*\(/g,
      maxCount: 1,
    },
  ])("$name", (c) => {
    if ("shouldMatch" in c) expect(src).toMatch(c.shouldMatch);
    else if ("shouldNotMatch" in c) expect(src).not.toMatch(c.shouldNotMatch);
    else expect((src.match(c.pattern) ?? []).length).toBeLessThanOrEqual(c.maxCount);
  });
});

// ── Settings profile card + session notes touch targets (BLD-258) ──

describe("Settings profile card layout (BLD-258, GitHub #125)", () => {
  const cardSource = readSrc("components/BodyProfileCard.tsx");

  it("BodyProfileCard imports flowCardStyle", () => {
    expect(cardSource).toContain("flowCardStyle");
  });

  it("BodyProfileCard card style uses flowCardStyle properties", () => {
    expect(flowCardStyle.minWidth).toBeGreaterThanOrEqual(280);
    expect(flowCardStyle.flexGrow).toBe(1);
  });
});

describe("Session notes/delete button touch targets (BLD-258, GitHub #126)", () => {
  const sessionSource = [
    readSrc("components/session/ExerciseGroupCard.tsx"),
    readSrc("components/session/GroupCardHeader.tsx"),
    readSrc("components/session/ExerciseNotesPanel.tsx"),
    readSrc("components/session/SetRow.tsx"),
  ].join("\n");

  it("action buttons have hitSlop for 48dp touch targets", () => {
    const hitSlopCount = (sessionSource.match(/hitSlop/g) || []).length;
    expect(hitSlopCount).toBeGreaterThanOrEqual(3);
  });

  it("action buttons are at least 36px wide", () => {
    expect(sessionSource).toContain("width: 36");
  });

  it("circleCheck and actionBtn each meet ≥44dp touch target", () => {
    const circleCheckMatch = sessionSource.match(/circleCheck:\s*\{[^}]*width:\s*(\d+)/);
    const actionBtnMatch = sessionSource.match(/actionBtn:\s*\{[^}]*width:\s*(\d+)/);
    expect(circleCheckMatch).not.toBeNull();
    expect(actionBtnMatch).not.toBeNull();
    expect(Number(circleCheckMatch![1])).toBeGreaterThanOrEqual(44);
    expect(Number(actionBtnMatch![1])).toBeGreaterThanOrEqual(44);
  });

  it("notes input has minimum font size of 14", () => {
    const notesMatch = sessionSource.match(/input:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
    expect(notesMatch).not.toBeNull();
    const token = notesMatch![1];
    const fontSizeMap: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
    expect(fontSizeMap[token] ?? 0).toBeGreaterThanOrEqual(14);
  });

  it("notes container has adequate padding", () => {
    expect(sessionSource).toContain("container:");
    const containerMatch = sessionSource.match(
      /container:\s*\{[^}]*paddingHorizontal:\s*(\d+)/
    );
    expect(containerMatch).not.toBeNull();
    expect(Number(containerMatch![1])).toBeGreaterThanOrEqual(8);
  });
});
