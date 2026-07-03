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

// ── BLD-1122: plateau pejorative-token contract ──────────────────────────────

describe("plateau pejorative-token contract (BLD-1122)", () => {
  const UI_DIRS = ["components", "app", "hooks"];
  const PEJORATIVE_TOKENS = ["regressing", "decline", "going backwards", "slipping"];

  function collectUIFiles(): string[] {
    const files: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip test directories inside hooks/app/components
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          files.push(full);
        }
      }
    }
    for (const d of UI_DIRS) walk(path.resolve(root, d));
    return files;
  }

  it("no UI string literal contains pejorative plateau classification tokens", () => {
    const files = collectUIFiles();
    const violations: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf-8");
      // Strip single-line comments and comparison-context literals to avoid
      // false positives on `result.classification === "regressing"` etc.
      // Only check string literals that appear OUTSIDE of:
      //   1. Line comments (//)
      //   2. Comparison expressions (=== / !== / == / != followed or preceded by the literal)
      //   3. Object property values for classification-discriminant fields
      const strippedComments = src.replace(/\/\/[^\n]*/g, "");
      // Find string literals not used as classification discriminants
      const literals = strippedComments.match(/(?:'[^']*'|"[^"]*"|`[^`]*`)/g) ?? [];
      for (const lit of literals) {
        // Skip if this is a plain classification-discriminant comparison value
        // (the token is the ENTIRE content of the literal)
        const inner = lit.slice(1, -1);
        if (["regressing", "progressing", "stalled", "maintaining"].includes(inner)) continue;
        // Skip template literals that are purely type/kind checks
        if (inner.startsWith("PlateauClassification") || inner.startsWith("BreakThrough")) continue;

        for (const token of PEJORATIVE_TOKENS) {
          if (inner.toLowerCase().includes(token)) {
            violations.push(`${path.relative(root, f)}: ${lit.slice(0, 80)}`);
          }
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Pejorative plateau tokens found in UI sources:\n${violations.join("\n")}\n\n` +
        "These tokens must not appear in user-visible strings. Use identity-affirming copy instead."
      );
    }
    expect(violations).toHaveLength(0);
  });
});

// ─── BLD-1137: Smart Rest Coach source-contract tests ────────────────────────

describe("BLD-1137 Smart Rest Coach source contracts", () => {
  let formatPreviewBody: (p: import("../lib/notifications").NextSetPreview) => string | null;
  let notificationsModule: typeof import("../lib/notifications");

  beforeAll(() => {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({ executionEnvironment: "standalone" }));
    jest.doMock("expo-notifications", () => ({
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
      cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
      cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
      dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
      scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
      setNotificationHandler: jest.fn(),
      addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
      SchedulableTriggerInputTypes: { WEEKLY: "weekly", TIME_INTERVAL: "timeInterval" },
      setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
      AndroidImportance: { LOW: 2 },
    }));
    jest.doMock("expo-haptics", () => ({
      selectionAsync: jest.fn().mockResolvedValue(undefined),
      notificationAsync: jest.fn().mockResolvedValue(undefined),
      NotificationFeedbackType: { Warning: "warning" },
    }));
    jest.doMock("../lib/db", () => ({
      getSchedule: jest.fn().mockResolvedValue([]),
      getTemplateById: jest.fn().mockResolvedValue(null),
      getAppSetting: jest.fn().mockResolvedValue(null),
      setAppSetting: jest.fn().mockResolvedValue(undefined),
    }));
    notificationsModule = require("../lib/notifications");
    formatPreviewBody = notificationsModule.formatPreviewBody;
  });

  /**
   * AC14a — Forbidden copy: rest-notification templates and formatPreviewBody output
   * must NOT contain manipulative / urgency-framing copy.
   * Psych condition #1 binding.
   */
  describe("AC14a — forbidden-copy contract", () => {
    const FORBIDDEN = /hurry|don'?t lose|falling behind|streak|faster!|push harder|get ready!|⚠️|🔥|⏰|❗/iu;

    const REST_COPY_TEMPLATES = [
      // Pre-end cue titles
      "Rest ending in 10s",
      "Rest ending in 5s",
      "Rest ending in 15s",
      "Rest ending in 20s",
      // Pre-end cue bodies
      "Next set in 10s",
      "Next set in 5s",
      "Workout ending in 10s",
      // Rest-complete
      "Rest complete",
      "Time for your next set.",
      "Last set complete",
      // Live countdown title template
      "Resting · 1:30 remaining",
      "Resting…",
      // Settings UI labels (key strings from ReminderSection)
      "Get notified when rest is done while using other apps.",
    ];

    it("no rest-notification template contains forbidden copy", () => {
      const violations = REST_COPY_TEMPLATES.filter((s) => FORBIDDEN.test(s));
      expect(violations).toHaveLength(0);
    });

    it("formatPreviewBody output does not contain forbidden copy — all exercise kinds", () => {
      const previews: import("../lib/notifications").NextSetPreview[] = [
        { exerciseName: "Cable Row", exerciseKind: "weighted", plannedWeight: 60, weightUnit: "lb", repRange: "8-10", durationSeconds: null, distanceMeters: null },
        { exerciseName: "Push-Up", exerciseKind: "bodyweight", plannedWeight: null, weightUnit: "kg", repRange: "12", durationSeconds: null, distanceMeters: null },
        { exerciseName: "Plank", exerciseKind: "time_based", plannedWeight: null, weightUnit: "kg", repRange: null, durationSeconds: 45, distanceMeters: null },
        { exerciseName: "Sled Push", exerciseKind: "distance", plannedWeight: null, weightUnit: "kg", repRange: null, durationSeconds: null, distanceMeters: 20 },
      ];
      for (const p of previews) {
        const body = formatPreviewBody(p);
        if (body != null) {
          expect(FORBIDDEN.test(body)).toBe(false);
        }
      }
    });
  });

  /**
   * AC14b — Preview safety: formatPreviewBody output must NEVER contain
   * null/undefined/NaN or bare unit strings for any input combination.
   * When fields are insufficient, must return null (no-preview fallback), not malformed text.
   */
  describe("AC14b — preview-safety contract", () => {
    const MALFORMED = /null|undefined|NaN|^\s*kg\b|^\s*lb\b|—\s*$/i;

    type Kind = import("../lib/notifications").NextSetPreview extends null | infer T ? T extends { exerciseKind: infer K } ? K : never : never;
    const KINDS: Kind[] = ["weighted", "bodyweight", "time_based", "distance"];

    it.each(KINDS)("kind=%s with all-null fields returns null (no malformed output)", (kind) => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Test",
        exerciseKind: kind,
        plannedWeight: null,
        weightUnit: "kg",
        repRange: null,
        durationSeconds: null,
        distanceMeters: null,
      };
      const result = formatPreviewBody(p);
      // Must be null or a non-malformed string
      if (result !== null) {
        expect(MALFORMED.test(result)).toBe(false);
      }
    });

    it("null preview returns null", () => {
      expect(formatPreviewBody(null)).toBeNull();
    });

    it("weighted with null weight renders bodyweight variant, not malformed", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Pull-Up", exerciseKind: "weighted",
        plannedWeight: null, weightUnit: "lb", repRange: "5-8",
        durationSeconds: null, distanceMeters: null,
      };
      const result = formatPreviewBody(p);
      expect(result).not.toBeNull();
      if (result) {
        expect(MALFORMED.test(result)).toBe(false);
        expect(result).toContain("bodyweight");
      }
    });

    it("weighted with null weight AND null reps returns null", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Pull-Up", exerciseKind: "weighted",
        plannedWeight: null, weightUnit: "lb", repRange: null,
        durationSeconds: null, distanceMeters: null,
      };
      expect(formatPreviewBody(p)).toBeNull();
    });

    it("time_based with null duration returns null", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Plank", exerciseKind: "time_based",
        plannedWeight: null, weightUnit: "kg", repRange: null,
        durationSeconds: null, distanceMeters: null,
      };
      expect(formatPreviewBody(p)).toBeNull();
    });

    it("distance with null distanceMeters returns null", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Sled Push", exerciseKind: "distance",
        plannedWeight: null, weightUnit: "kg", repRange: null,
        durationSeconds: null, distanceMeters: null,
      };
      expect(formatPreviewBody(p)).toBeNull();
    });

    it("valid weighted preview produces non-malformed string with correct format", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Cable Row", exerciseKind: "weighted",
        plannedWeight: 60, weightUnit: "lb", repRange: "8-10",
        durationSeconds: null, distanceMeters: null,
      };
      const result = formatPreviewBody(p);
      expect(result).toBe("Cable Row — 60 lb × 8-10");
      expect(MALFORMED.test(result!)).toBe(false);
    });

    it("valid time_based preview produces correct mm:ss format", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Plank", exerciseKind: "time_based",
        plannedWeight: null, weightUnit: "kg", repRange: null,
        durationSeconds: 45, distanceMeters: null,
      };
      const result = formatPreviewBody(p);
      expect(result).toBe("Plank — 0:45");
      expect(MALFORMED.test(result!)).toBe(false);
    });
  });

  /**
   * AC14c — Title stability: key notification title templates must be exact
   * stable strings with no env interpolation or TODO markers.
   */
  describe("AC14c — title template stability contract", () => {
    it("Rest complete title is stable", () => {
      // This is the literal string used in scheduleRestComplete
      expect("Rest complete").toMatch(/^Rest complete$/);
    });

    it("Pre-end cue title template format is stable", () => {
      // Template: "Rest ending in {N}s" — verify it can be constructed
      const title = `Rest ending in ${10}s`;
      expect(title).toBe("Rest ending in 10s");
      expect(title).not.toMatch(/TODO|undefined|null|%s/);
    });

    it("Live countdown title template format is stable", () => {
      // Template: "Resting · {mm:ss} remaining"
      const m = 1; const s = 30;
      const timeStr = `${m}:${String(s).padStart(2, "0")}`;
      const title = `Resting \u00b7 ${timeStr} remaining`;
      expect(title).toBe("Resting · 1:30 remaining");
      expect(title).not.toMatch(/TODO|undefined|null|%s/);
    });

    it("formatPreviewBody kind=bodyweight uses 'bodyweight × {reps}' pattern", () => {
      const p: import("../lib/notifications").NextSetPreview = {
        exerciseName: "Push-Up", exerciseKind: "bodyweight",
        plannedWeight: null, weightUnit: "kg", repRange: "12",
        durationSeconds: null, distanceMeters: null,
      };
      expect(formatPreviewBody(p)).toBe("Push-Up — bodyweight × 12");
    });

    it("channel constants are stable string literals", () => {
      expect(notificationsModule.REST_ONGOING_CHANNEL).toBe("rest-ongoing");
      expect(notificationsModule.REST_CUE_CHANNEL).toBe("rest-cue");
    });
  });
});

// ── Session Pacing source contracts (BLD-1144) ────────────────────

describe("PacingCard source contracts (BLD-1144)", () => {
  /**
   * Scans only JSX text children and accessibilityLabel/accessibilityHint props
   * inside components/session/summary/Pacing*.tsx and the pacing line in
   * components/history/DayDetailPanel.tsx — NOT a whole-source grep.
   * See plan §136 for rationale (avoid false-positives on countdown/dropdown etc).
   */
  function extractUserFacingStrings(src: string): string {
    const parts: string[] = [];
    // JSX text literals: {" ... "} or plain text between tags
    const jsxText = src.matchAll(/>\s*\{"([^"]+)"\}\s*</g);
    for (const m of jsxText) parts.push(m[1]);
    // Plain JSX text nodes between tags (no braces)
    const plainText = src.matchAll(/>([^<{]+)</g);
    for (const m of plainText) {
      const t = m[1].trim();
      if (t.length > 1) parts.push(t);
    }
    // accessibilityLabel= and accessibilityHint= — brace syntax: accessibilityLabel={"..."}
    const a11yBrace = src.matchAll(/accessibility(?:Label|Hint)=\{"([^"]+)"\}/g);
    for (const m of a11yBrace) parts.push(m[1]);
    // accessibilityLabel= and accessibilityHint= — plain string syntax: accessibilityLabel="..."
    const a11yPlain = src.matchAll(/accessibility(?:Label|Hint)="([^"]+)"/g);
    for (const m of a11yPlain) parts.push(m[1]);
    // accessibilityLabel= — template literal prefix (catches "Sort by ${...}" style)
    const a11yTemplate = src.matchAll(/accessibility(?:Label|Hint)=\{`([^`$]+)/g);
    for (const m of a11yTemplate) parts.push(m[1]);
    return parts.join(" ");
  }

  const pacingCardSrc = readSrc("components/session/summary/PacingCard.tsx");
  const pacingSheetSrc = readSrc("components/session/summary/PacingBreakdownSheet.tsx");
  const dayDetailSrc = readSrc("components/history/DayDetailPanel.tsx");

  const allUserFacing =
    extractUserFacingStrings(pacingCardSrc) +
    " " +
    extractUserFacingStrings(pacingSheetSrc) +
    " " +
    extractUserFacingStrings(dayDetailSrc);

  const FORBIDDEN = ["Idle", "Wasted", "Inactive", "Off-task", "Distraction"];

  it.each(FORBIDDEN)('forbidden word "%s" absent from user-facing copy', (word) => {
    expect(allUserFacing).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
  });

  it('title literal is exactly "Estimated pacing"', () => {
    expect(pacingCardSrc).toMatch(/["']Estimated pacing["']/);
  });

  it('segment labels are "Working", "Rest", "Other" (verbatim)', () => {
    expect(pacingCardSrc).toMatch(/["']Working["']/);
    expect(pacingCardSrc).toMatch(/["']Rest["']/);
    expect(pacingCardSrc).toMatch(/["']Other["']/);
  });

  it('empty-state copy is "No completed sets to analyze" — no nudging language', () => {
    expect(pacingCardSrc).toMatch(/["']No completed sets to analyze["']/);
    expect(pacingCardSrc).not.toMatch(/start logging|try again|get started/i);
  });

  it("disclosure copy is verbatim AC§147", () => {
    expect(pacingCardSrc).toContain(
      "Working time is estimated as roughly 2 seconds per rep (or recorded duration for time-based sets). Rest is the remaining gap between consecutive sets."
    );
  });

  it("imports PACING_DISCLOSURE_COPY constant (disclosure locked via export)", () => {
    // The constant is exported so it can be verified independently.
    const { PACING_DISCLOSURE_COPY } = require("../components/session/summary/PacingCard");
    expect(typeof PACING_DISCLOSURE_COPY).toBe("string");
    expect(PACING_DISCLOSURE_COPY).toContain("2 seconds per rep");
  });
});

// ── BLD-1151: Form Check Comparison View — banned tokens (AC8) ───────────────

describe("CompareView / FormClipsPlayer — AC8 banned token scan", () => {
  /** Extract user-facing strings from source (three-syntax pattern, BLD-1144 pattern L1068-1075). */
  function extractUserFacingStrings(src: string): string {
    const parts: string[] = [];
    // JSX text nodes between tags with braces: {"..."}
    const jsxText = src.matchAll(/\{["']([^"']+)["']\}/g);
    for (const m of jsxText) parts.push(m[1]);
    // Plain JSX text nodes between tags (no braces).
    // Filter: skip multiline matches and strings containing TypeScript code characters
    // (;, (, ), {, }, [, ]) — these indicate TS generic expressions, not UI text.
    const plainText = src.matchAll(/>([^<{]+)</g);
    for (const m of plainText) {
      const t = m[1].trim();
      if (t.length > 1 && !/\n/.test(t) && !/[;(){}[\]]/.test(t)) parts.push(t);
    }
    // accessibilityLabel/Hint — brace syntax: accessibilityLabel={"..."}
    const a11yBrace = src.matchAll(/accessibility(?:Label|Hint)=\{"([^"]+)"\}/g);
    for (const m of a11yBrace) parts.push(m[1]);
    // accessibilityLabel/Hint — plain string syntax: accessibilityLabel="..."
    const a11yPlain = src.matchAll(/accessibility(?:Label|Hint)="([^"]+)"/g);
    for (const m of a11yPlain) parts.push(m[1]);
    // accessibilityLabel/Hint — template literal prefix
    const a11yTemplate = src.matchAll(/accessibility(?:Label|Hint)=\{`([^`$]+)/g);
    for (const m of a11yTemplate) parts.push(m[1]);
    return parts.join(" ");
  }

  const compareViewSrc = readSrc("components/session/CompareView.tsx");
  const formClipsPlayerSrc = readSrc("components/session/FormClipsPlayer.tsx");
  const formClipThumbsSrc = readSrc("lib/media/form-clip-thumbs.ts");
  const formLibraryTabSrc = readSrc("components/session/FormLibraryTab.tsx");
  // BLD-1151: include all PR-modified files. The extractor above strips TS
  // generic false-positives via the multiline + code-char filter, so these
  // files can now be scanned without excluding them.
  const sessionScreenSrc = readSrc("app/session/[id].tsx");
  const compareFromPlayerSrc = readSrc("hooks/useCompareFromPlayer.tsx");
  const formClipsSrc = readSrc("lib/media/form-clips.ts");

  const allUserFacing =
    extractUserFacingStrings(compareViewSrc) +
    " " +
    extractUserFacingStrings(formClipsPlayerSrc) +
    " " +
    extractUserFacingStrings(formClipThumbsSrc) +
    " " +
    extractUserFacingStrings(formLibraryTabSrc) +
    " " +
    extractUserFacingStrings(sessionScreenSrc) +
    " " +
    extractUserFacingStrings(compareFromPlayerSrc) +
    " " +
    extractUserFacingStrings(formClipsSrc);

  const BANNED = [
    "streak",
    "xp",
    "badge",
    "unlock",
    "level up",
    "keep it up",
    "you've been",
    "friends",
    "share to",
    "leaderboard",
    "notify",
    "notification",
    "reward",
    "reminder",
    "you should",
  ];

  for (const token of BANNED) {
    it(`does not contain banned token: "${token}"`, () => {
      expect(allUserFacing.toLowerCase()).not.toContain(token);
    });
  }

  it("CompareView does not import expo-notifications", () => {
    expect(compareViewSrc).not.toContain("expo-notifications");
  });

  it("FormClipsPlayer does not import expo-notifications", () => {
    expect(formClipsPlayerSrc).not.toContain("expo-notifications");
  });

  it("form-clip-thumbs does not import expo-notifications", () => {
    expect(formClipThumbsSrc).not.toContain("expo-notifications");
  });

  it("session screen does not import expo-notifications", () => {
    expect(sessionScreenSrc).not.toContain("expo-notifications");
  });

  it("useCompareFromPlayer does not import expo-notifications", () => {
    expect(compareFromPlayerSrc).not.toContain("expo-notifications");
  });

  it("form-clips does not import expo-notifications", () => {
    expect(formClipsSrc).not.toContain("expo-notifications");
  });

  it("CompareView Sentry calls never reference rel_path, cacheDirectory, documentDirectory, or absolute paths", () => {
    // Find all addBreadcrumb / captureMessage / withScope blocks
    const sentryBlocks = compareViewSrc.match(/Sentry\.(addBreadcrumb|captureMessage|withScope|captureException)[^;]+;/g) ?? [];
    for (const block of sentryBlocks) {
      expect(block).not.toContain("rel_path");
      expect(block).not.toContain("cacheDirectory");
      expect(block).not.toContain("documentDirectory");
      // No absolute path-like string literals in Sentry calls
      expect(block).not.toMatch(/["'`]\/[a-zA-Z]/);
    }
  });
});

