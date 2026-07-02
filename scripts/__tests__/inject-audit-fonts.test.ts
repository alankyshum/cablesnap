/**
 * BLD-2586 — scripts/inject-audit-fonts.mjs: make the visual-audit harness
 * render text in the fontless agent-runtime container.
 *
 * Context: in the agent container there are NO system text fonts, so Chromium
 * measures every sans/serif text run as 0x0 and ALL app text vanishes from
 * audit screenshots — a whole class of false "missing text/label" findings
 * (BLD-2581 / BLD-2582 / BLD-2585). The injector base64-inlines an E2E-only
 * Roboto WOFF2 into the served dist/index.html as a blocking FontFace loader,
 * aliased to the concrete family names in react-native-web's default stack.
 *
 * Acceptance criteria exercised here (fast, deterministic, no browser):
 *   AC-a. Fontless host → patches dist/index.html: injects the sentinel
 *         marker, an @font-face <style>, and a blocking FontFace <script>,
 *         all inside <head> (before </head>) and before the entry bundle.
 *   AC-b. Idempotent: a second run is a no-op (never double-injects).
 *   AC-c. Font-presence probe: when /usr/share/fonts exists (CI/desktop),
 *         the injector is a NO-OP and leaves dist/index.html byte-for-byte
 *         unchanged — so it never alters font-equipped audit runs. (Probed
 *         dir overridden via AUDIT_FONT_PROBE_DIR so we can assert both
 *         branches without mutating the real /usr/share/fonts.)
 *   AC-d. --force overrides the probe (used by CI-independent verification).
 *   AC-e. The @font-face aliases the concrete RNW-stack families and does NOT
 *         attempt to alias the reserved generic keywords (which the browser
 *         rejects).
 *   AC-f. The expo entry bundle is PARKED (rewritten to a non-executing type)
 *         so it cannot mount react-native-web before fonts load — no
 *         executable `<script src="/_expo/static/js/…">` remains.
 *   AC-g. The loader un-parks (boots) the entry bundle only AFTER
 *         document.fonts.ready, and boots on font failure too (never blank).
 *   AC-h. The emitted loader IIFE is syntactically valid JS.
 *   AC-i. A dist with no entry bundle hard-errors (no silent no-fix build).
 *
 * Strategy mirrors daily-audit-set-e-ordering.test.ts: drive the REAL script
 * via spawnSync against temp fixtures, assert on exit code + emitted HTML.
 */
import { spawnSync, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const INJECTOR = path.join(REPO_ROOT, "scripts", "inject-audit-fonts.mjs");
const FONT_ASSET = path.join(REPO_ROOT, "e2e", "assets", "fonts", "audit-latin.woff2");

// A minimal dist/index.html shaped like expo's output: entry bundle sits in
// <body> after </head>, so any <head> injection precedes it.
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CableSnap</title>
    <style id="expo-reset">html,body{height:100%}</style>
  <link rel="icon" href="/favicon.ico" /></head>
  <body>
    <div id="root"></div>
  <script src="/_expo/static/js/web/entry-abc.js" defer></script>
</body>
</html>
`;

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

function makeDist(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-inject-"));
  fs.writeFileSync(path.join(dir, "index.html"), FIXTURE_HTML, "utf8");
  return dir;
}

function runInjector(
  distDir: string,
  opts: { force?: boolean; probeDir?: string } = {},
): RunResult {
  const args = [INJECTOR, "--dist", distDir, "--quiet"];
  if (opts.force) args.push("--force");
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Default the probe to a definitely-absent dir so the "fontless" branch is
  // deterministic regardless of the host running the test. Individual tests
  // override this to simulate a font-equipped host.
  env.AUDIT_FONT_PROBE_DIR =
    opts.probeDir ?? path.join(distDir, "__no_such_fonts_dir__");
  const proc = spawnSync("node", args, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    status: proc.status,
    stdout: proc.stdout || "",
    stderr: proc.stderr || "",
    combined: (proc.stdout || "") + (proc.stderr || ""),
  };
}

function readIndex(distDir: string): string {
  return fs.readFileSync(path.join(distDir, "index.html"), "utf8");
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("inject-audit-fonts.mjs — BLD-2586 fontless-container text fix", () => {
  it("real script passes `node --check` syntax check", () => {
    expect(() =>
      execFileSync("node", ["--check", INJECTOR], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("ships the E2E-only font asset it inlines", () => {
    expect(fs.existsSync(FONT_ASSET)).toBe(true);
    const buf = fs.readFileSync(FONT_ASSET);
    // WOFF2 magic number: 'wOF2'.
    expect(buf.subarray(0, 4).toString("latin1")).toBe("wOF2");
    // The asset is E2E-only, never shipped: it must live under e2e/, not
    // under public/ or assets/ (which expo bundles).
    expect(FONT_ASSET).toContain(`${path.sep}e2e${path.sep}assets${path.sep}fonts${path.sep}`);
  });

  it("AC-a: fontless host → injects marker + @font-face + blocking loader inside <head>", () => {
    const dist = makeDist();
    try {
      const r = runInjector(dist);
      expect(r.status).toBe(0);
      const html = readIndex(dist);

      // Sentinel marker present.
      expect(html).toContain("audit-font-inject:BLD-2586");
      // @font-face style block + blocking FontFace loader script.
      expect(html).toContain('<style id="audit-font-face">');
      expect(html).toContain('<script id="audit-font-loader">');
      expect(html).toContain("@font-face");
      expect(html).toContain("new FontFace");
      expect(html).toContain("document.fonts.ready");
      // Inlined as a woff2 data-URI.
      expect(html).toContain("data:font/woff2;base64,");

      // Everything injected must sit INSIDE <head> (before </head>), and the
      // parked entry bundle must come AFTER it so the loader runs first.
      const headEnd = html.indexOf("</head>");
      const markerAt = html.indexOf("audit-font-inject:BLD-2586");
      const styleAt = html.indexOf('<style id="audit-font-face">');
      const loaderAt = html.indexOf('<script id="audit-font-loader">');
      // The entry bundle URL now lives in the PARKED tag's data attribute
      // (the executable `<script src="/_expo/static/js/…">` is gone — see the
      // dedicated parking test below).
      const parkedEntryAt = html.indexOf('data-audit-entry-src="/_expo/static/js/');
      expect(markerAt).toBeGreaterThan(-1);
      expect(markerAt).toBeLessThan(headEnd);
      expect(styleAt).toBeLessThan(headEnd);
      expect(loaderAt).toBeLessThan(headEnd);
      expect(parkedEntryAt).toBeGreaterThan(headEnd);
      expect(loaderAt).toBeLessThan(parkedEntryAt);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-e: aliases concrete RNW-stack families, never the reserved generics", () => {
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      // Concrete members of RNW's SYSTEM_FONT_STACK are aliased.
      for (const fam of ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial"]) {
        expect(html).toContain(`font-family:${JSON.stringify(fam)}`);
      }
      // Reserved generic keywords must NOT be declared as a @font-face family
      // (Chromium rejects those; declaring them is a bug).
      for (const generic of ["sans-serif", "serif", "monospace", "system-ui"]) {
        expect(html).not.toContain(`font-family:"${generic}"`);
      }
    } finally {
      cleanup(dist);
    }
  });

  // BLD-2586 review (blocking): starting the FontFace loads is NOT enough —
  // the expo entry bundle must be prevented from executing until the fonts are
  // ready, otherwise react-native-web mounts and measures text (caching 0x0)
  // before the font arrives. These tests pin that the entry bundle is parked
  // and only un-parked after document.fonts.ready.
  it("AC-f: parks the expo entry bundle so it cannot execute before fonts load", () => {
    const dist = makeDist();
    try {
      const r = runInjector(dist);
      expect(r.status).toBe(0);
      const html = readIndex(dist);

      // The entry bundle is rewritten to a non-executing type carrying its
      // real URL in a data attribute…
      expect(html).toContain('type="text/x-audit-parked-entry"');
      expect(html).toContain('data-audit-entry-src="/_expo/static/js/web/entry-abc.js"');

      // …and there is NO executable `<script src="/_expo/static/js/…">` left in
      // the document (that is the whole point — nothing runs RNW early). We
      // match a script tag whose FIRST attribute is src= (an executable bundle
      // tag), which the parked tag (type=… first, then data-audit-entry-src)
      // does not satisfy.
      expect(html).not.toMatch(/<script\s+src="\/_expo\/static\/js\//i);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-g: loader boots the parked entry only after document.fonts.ready", () => {
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      const loaderMatch = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      );
      expect(loaderMatch).not.toBeNull();
      const loader = loaderMatch![1];

      // The loader defines a boot() that re-creates executable <script src>
      // elements from the parked tags. The parked-type selector is assembled at
      // runtime from the PARK constant, so assert on both the constant and the
      // querySelector that consumes it.
      expect(loader).toContain('PARK="text/x-audit-parked-entry"');
      expect(loader).toContain("querySelectorAll('script[type=\"'+PARK+'\"]')");
      expect(loader).toContain("data-audit-entry-src");
      expect(loader).toContain('createElement("script")');
      // …preserves execution order (async=false)…
      expect(loader).toContain("s.async=false");
      // …and crucially chains boot AFTER document.fonts.ready resolves (or
      // rejects — boot is passed as BOTH handlers so a font failure still boots
      // rather than leaving the page permanently blank).
      expect(loader).toContain("document.fonts.ready");
      expect(loader).toMatch(/\.then\(\s*boot\s*,\s*boot\s*\)/);
      // Graceful fallback: if FontFace is unsupported, boot immediately.
      expect(loader).toMatch(/FontFace==="undefined"[\s\S]*?boot\(\);\s*return/);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-h: the emitted loader is valid JS (node --check on the extracted IIFE)", () => {
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      const loader = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      )![1];
      const tmp = path.join(dist, "loader.js");
      fs.writeFileSync(tmp, loader, "utf8");
      expect(() =>
        execFileSync("node", ["--check", tmp], { encoding: "utf8" }),
      ).not.toThrow();
    } finally {
      cleanup(dist);
    }
  });

  it("AC-i: hard-errors when no expo entry bundle is present (no silent no-fix)", () => {
    // A dist/index.html with fonts injected but NO entry bundle to gate would
    // mean the fonts race nothing / RNW is never gated — that must fail loudly
    // rather than emit a build that silently reproduces the 0x0 bug.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-noentry-"));
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!DOCTYPE html><html><head><title>x</title></head><body><div id="root"></div></body></html>`,
      "utf8",
    );
    try {
      const r = runInjector(dir);
      expect(r.status).not.toBe(0);
      expect(r.combined).toMatch(/no expo entry <script/i);
      // dist/index.html must be left untouched (no marker) on this failure.
      expect(readIndex(dir)).not.toContain("audit-font-inject:BLD-2586");
    } finally {
      cleanup(dir);
    }
  });

  it("AC-b: idempotent — a second run does not double-inject", () => {
    const dist = makeDist();
    try {
      const first = runInjector(dist);
      expect(first.status).toBe(0);
      const afterFirst = readIndex(dist);

      const second = runInjector(dist);
      expect(second.status).toBe(0);
      const afterSecond = readIndex(dist);

      // Byte-for-byte unchanged on the second run.
      expect(afterSecond).toBe(afterFirst);
      // Exactly one marker.
      const count = afterSecond.split("audit-font-inject:BLD-2586").length - 1;
      expect(count).toBe(1);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-c: probe skip — when /usr/share/fonts exists, injector is a byte-for-byte no-op", () => {
    const dist = makeDist();
    // Simulate a font-equipped host (CI/desktop) by pointing the probe at a
    // real, existing directory.
    const fakeFontsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-fonts-"));
    try {
      const before = readIndex(dist);
      const r = runInjector(dist, { probeDir: fakeFontsDir });
      expect(r.status).toBe(0);
      const after = readIndex(dist);
      // dist/index.html untouched — no injection on a font-equipped host.
      expect(after).toBe(before);
      expect(after).not.toContain("audit-font-inject:BLD-2586");
    } finally {
      cleanup(dist);
      cleanup(fakeFontsDir);
    }
  });

  it("AC-d: --force overrides the probe and patches even when fonts are present", () => {
    const dist = makeDist();
    const fakeFontsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-fonts-"));
    try {
      const r = runInjector(dist, { force: true, probeDir: fakeFontsDir });
      expect(r.status).toBe(0);
      expect(readIndex(dist)).toContain("audit-font-inject:BLD-2586");
    } finally {
      cleanup(dist);
      cleanup(fakeFontsDir);
    }
  });

  it("errors clearly when dist/index.html is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-empty-"));
    try {
      const r = runInjector(dir);
      expect(r.status).not.toBe(0);
      expect(r.combined).toMatch(/index\.html not found/);
    } finally {
      cleanup(dir);
    }
  });
});
