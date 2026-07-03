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
 *   AC-j. boot() is gated on DOM availability (bootWhenDomReady), never called
 *         directly from the font promise — the loader runs in <head> while the
 *         body (and its parked entry <script>) is unparsed, and the data-URI
 *         FontFace loads resolve without a network hop, so booting off the font
 *         promise alone would querySelectorAll an empty set and leave the page
 *         permanently blank (BLD-2586 second review).
 *   AC-k. Behavioral proof: with a synchronous-resolving FontFace and
 *         readyState="loading", the emitted loader does NOT un-park until
 *         DOMContentLoaded fires, then un-parks exactly the entry bundle.
 *
 * BLD-2744 — the same fontless container also blanks every
 * @expo/vector-icons MaterialCommunityIcons glyph (icon renders <Text/> until
 * fontfaceobserver resolves, and on Chromium that observer polls
 * document.fonts.load('… "material-community"') which only matches a loaded
 * FontFace). So the injector also eager-loads the bundled icon font:
 *   AC-L. The injected loader registers a FontFace under the CSS family
 *         `material-community` (the createIconSet name — NOT the ttf filename
 *         `MaterialCommunityIcons`) with the ttf inlined as a data-URI, and
 *         adds it to document.fonts inside the same document.fonts.ready gate.
 *   AC-M. The icon ttf is resolved by GLOB (content-hashed basename), never a
 *         hardcoded hash — a fixture ttf named `MaterialCommunityIcons.<hash>`
 *         is still found and inlined.
 *   AC-N. A dist missing the bundled icon ttf hard-errors (non-zero exit,
 *         actionable message) and leaves dist/index.html untouched (no marker)
 *         — mirroring the no-entry-bundle policy.
 *   AC-O. Behavioral proof: the emitted loader adds the `material-community`
 *         icon face to document.fonts (alongside the text families) before it
 *         un-parks the entry bundle.
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
// The injector's own source — asserted against in AC-M to prove the icon ttf
// hash is resolved by glob at runtime, never hardcoded in the script.
const INJECTOR_SOURCE = fs.readFileSync(INJECTOR, "utf8");
const FONT_ASSET = path.join(REPO_ROOT, "e2e", "assets", "fonts", "audit-latin.woff2");
// The app's OWN bundled MaterialCommunityIcons ttf. `expo export` emits a
// content-hashed copy under dist/assets/**; the injector must resolve it by
// GLOB (never a hardcoded hash) and eager-load it under the CSS family
// `material-community` so @expo/vector-icons glyphs paint (BLD-2744).
const MCI_TTF_SRC = path.join(
  REPO_ROOT,
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "Fonts",
  "MaterialCommunityIcons.ttf",
);
// Where the injector globs for it inside a dist. A content hash is baked into
// the basename to prove the resolver does not depend on a fixed name.
const MCI_TTF_DIST_REL = path.join(
  "assets",
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "Fonts",
  "MaterialCommunityIcons.deadbeefdeadbeefdeadbeefdeadbeef.ttf",
);

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

// Write the bundled MCI ttf into a dist under a content-hashed name so the
// injector's glob resolver is exercised realistically. Skips silently only if
// the source ttf is somehow absent (it ships with @expo/vector-icons).
function writeIconTtf(distDir: string): void {
  const dest = path.join(distDir, MCI_TTF_DIST_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(MCI_TTF_SRC, dest);
}

function makeDist(opts: { withIconTtf?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-inject-"));
  fs.writeFileSync(path.join(dir, "index.html"), FIXTURE_HTML, "utf8");
  // By default include the icon ttf so injection succeeds (the injector
  // hard-errors when it is missing — asserted separately in AC-N).
  if (opts.withIconTtf !== false) writeIconTtf(dir);
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
      // rejects — bootWhenDomReady is passed as BOTH handlers so a font failure
      // still boots rather than leaving the page permanently blank).
      expect(loader).toContain("document.fonts.ready");
      expect(loader).toMatch(
        /\.then\(\s*bootWhenDomReady\s*,\s*bootWhenDomReady\s*\)/,
      );
      // Graceful fallback: if FontFace is unsupported, still un-park (via the
      // DOM-ready gate) rather than hanging the page.
      expect(loader).toMatch(
        /FontFace==="undefined"[\s\S]*?bootWhenDomReady\(\);\s*return/,
      );
    } finally {
      cleanup(dist);
    }
  });

  // BLD-2586 SECOND review (blocking): the loader runs in <head> while
  // document.readyState === "loading", BEFORE the parser reaches the parked
  // entry <script> tags in <body>. The data-URI FontFace loads have no network
  // hop, so fonts can become ready while the body is still unparsed. If boot()
  // were called directly from the font promise (or the FontFace-unsupported
  // path) at that moment, querySelectorAll would return an empty NodeList,
  // nothing would un-park, and the page would stay permanently blank. These
  // tests pin that boot() is gated on DOM availability, not just font
  // readiness.
  it("AC-j: boot() is gated on DOM availability, never called directly from the font promise", () => {
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      const loader = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      )![1];

      // A bootWhenDomReady() indirection exists and it is what waits on
      // DOMContentLoaded when the document is still parsing.
      expect(loader).toContain("function bootWhenDomReady()");
      expect(loader).toContain('document.readyState==="loading"');
      expect(loader).toMatch(
        /addEventListener\(\s*"DOMContentLoaded"\s*,\s*boot\s*,\s*\{\s*once\s*:\s*true\s*\}\s*\)/,
      );

      // The font promise chain must hand off to bootWhenDomReady, NOT to boot
      // directly — that is the whole fix. Assert there is no `.then(boot` /
      // `.then( boot` promise wiring that would bypass the DOM gate.
      expect(loader).not.toMatch(/\.then\(\s*boot\b/);
      // Likewise the FontFace-unsupported early path must go through the gate,
      // not call boot() directly.
      expect(loader).not.toMatch(/\|\|\s*!document\.fonts\)\s*\{\s*boot\(\)/);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-k: emitted loader actually defers un-parking until DOMContentLoaded when the document is still loading", () => {
    // Behavioral proof (not just source-shape): execute the real emitted loader
    // in a JSDOM-like harness where document.readyState starts as "loading" and
    // FontFace/document.fonts resolve SYNCHRONOUSLY (worst case for the race).
    // The parked entry <script> is added to the DOM only AFTER the loader has
    // run — mimicking the parser reaching <body> after <head>. Un-parking must
    // not happen until we fire DOMContentLoaded.
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      const loaderSrc = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      )![1];

      // Drive the loader through a real node child process with a tiny DOM
      // shim so we don't need jsdom. The shim records appended <script src>
      // elements (the un-park action) and lets us control readyState +
      // DOMContentLoaded timing.
      const harness = `
        const appended = [];
        let readyState = "loading";
        const dclListeners = [];
        const parkedSrc = "/_expo/static/js/web/entry-abc.js";
        // The parked tag does NOT exist yet when the loader runs (head parsed,
        // body not). It is added just before we flush microtasks / DCL.
        let parkedTag = null;
        function makeParkedTag() {
          return {
            getAttribute: (k) =>
              k === "data-audit-entry-src" ? parkedSrc : null,
            crossOrigin: "",
          };
        }
        global.document = {
          get readyState() { return readyState; },
          fonts: {
            _ready: Promise.resolve(),
            get ready() { return this._ready; },
            add() {},
          },
          addEventListener(type, cb) {
            if (type === "DOMContentLoaded") dclListeners.push(cb);
          },
          querySelectorAll(sel) {
            // Only the parked entry tag matches, and only once it "exists".
            if (sel.includes("x-audit-parked-entry") && parkedTag) return [parkedTag];
            return [];
          },
          createElement() {
            const el = { src: "", async: true, crossOrigin: "" };
            return el;
          },
          head: { appendChild(el) { appended.push(el.src); } },
        };
        global.FontFace = function () {
          return {
            load() { return Promise.resolve({}); }, // synchronous resolve
          };
        };
        // Run the emitted loader.
        ${loaderSrc}
        // Give the (already-resolved) font promise chain a chance to run. If the
        // loader were buggy (booting straight off the font promise), it would
        // querySelectorAll now — but the parked tag doesn't exist yet, so it
        // would append NOTHING and the app would be blank forever.
        setTimeout(() => {
          const bootedEarly = appended.length;
          // NOW the parser "reaches" <body>: the parked tag appears and DCL fires.
          parkedTag = makeParkedTag();
          readyState = "interactive";
          dclListeners.forEach((cb) => cb());
          setTimeout(() => {
            const bootedAfterDcl = appended.length;
            // Correct behavior: nothing un-parked before DCL, exactly the entry
            // bundle un-parked after DCL.
            if (bootedEarly !== 0) {
              console.error("FAIL: un-parked BEFORE DOMContentLoaded (race):", appended);
              process.exit(3);
            }
            if (bootedAfterDcl !== 1 || appended[0] !== parkedSrc) {
              console.error("FAIL: entry bundle not un-parked after DCL:", appended);
              process.exit(4);
            }
            console.log("OK");
          }, 0);
        }, 0);
      `;
      const tmp = path.join(dist, "loader-dom-harness.mjs");
      fs.writeFileSync(tmp, harness, "utf8");
      const r = spawnSync("node", [tmp], { encoding: "utf8", timeout: 30_000 });
      expect(r.stderr + r.stdout).toContain("OK");
      expect(r.status).toBe(0);
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

  // BLD-2744 — icon-font eager-load. @expo/vector-icons renders a blank <Text/>
  // until fontfaceobserver resolves; on Chromium that observer polls
  // document.fonts.load('… "material-community"'), which only matches once a
  // loaded FontFace under that family exists. So the injector must register the
  // icon FontFace under the createIconSet family name `material-community`
  // (NOT the ttf filename) and gate the entry bundle on it.
  it("AC-L: registers a FontFace under the CSS family 'material-community' (not the ttf filename) inside the fonts.ready gate", () => {
    const dist = makeDist();
    try {
      const r = runInjector(dist);
      expect(r.status).toBe(0);
      const html = readIndex(dist);
      const loader = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      )![1];

      // The icon family must be the createIconSet NAME, which is what RNW sets
      // as `font-family`. Registering under the ttf FILENAME would never match.
      expect(loader).toContain('"material-community"');
      expect(loader).not.toContain('"MaterialCommunityIcons"');

      // The icon ttf is inlined as a data-URI and registered via the FontFace
      // constructor (a CSS @font-face throws NetworkError on document.fonts.load
      // in the fontless headless config — the whole reason for the ctor path).
      expect(loader).toContain("data:font/ttf;base64,");
      expect(loader).toContain('format("truetype")');
      expect(loader).toContain("new FontFace(pair[0]");
      // …and it is added to document.fonts (so the observer's load() matches).
      expect(loader).toContain("document.fonts.add");

      // Crucially the icon loads are part of the SAME promise set that gates the
      // entry bundle on document.fonts.ready (they are pushed onto `loads`).
      expect(loader).toContain("loads.push");
      expect(loader).toContain("Promise.all(loads)");
      expect(loader).toContain("document.fonts.ready");
    } finally {
      cleanup(dist);
    }
  });

  it("AC-M: resolves the icon ttf by GLOB (content-hashed basename), never a hardcoded hash", () => {
    // The fixture writes MaterialCommunityIcons.<hash>.ttf; the injector must
    // find it by pattern, inline its bytes, and NOT depend on any fixed hash.
    const dist = makeDist();
    try {
      const r = runInjector(dist);
      expect(r.status).toBe(0);
      const html = readIndex(dist);

      // The exact bytes of the bundled ttf must be inlined (base64), proving the
      // glob resolved the real hashed file rather than emitting an empty/dummy.
      const expectedB64 = fs.readFileSync(MCI_TTF_SRC).toString("base64");
      expect(html).toContain(expectedB64);

      // The hashed basename must NOT appear literally in the SCRIPT source — the
      // resolver globs, it does not hardcode the hash.
      expect(INJECTOR_SOURCE).not.toContain("deadbeefdeadbeefdeadbeefdeadbeef");
      // Only the un-hashed logical name may appear (as the glob target).
      expect(INJECTOR_SOURCE).toContain("MaterialCommunityIcons");
    } finally {
      cleanup(dist);
    }
  });

  it("AC-N: hard-errors when the bundled icon ttf is missing (no silent icon-blank build)", () => {
    // A dist with an entry bundle but NO MaterialCommunityIcons ttf under
    // assets/** must fail loudly — otherwise we'd emit an audit build that
    // re-blanks every icon (the exact bug this fixes).
    const dist = makeDist({ withIconTtf: false });
    try {
      const r = runInjector(dist);
      expect(r.status).not.toBe(0);
      expect(r.combined).toMatch(/icon font MaterialCommunityIcons.*not found/i);
      // dist/index.html left untouched (no marker) on this failure.
      expect(readIndex(dist)).not.toContain("audit-font-inject:BLD-2586");
    } finally {
      cleanup(dist);
    }
  });

  it("AC-O: emitted loader adds the 'material-community' icon face (with the text families) before un-parking", () => {
    // Behavioral proof (not just source-shape): run the real emitted loader in a
    // DOM shim with synchronous-resolving FontFaces. Assert the icon family is
    // among the faces added to document.fonts, and that un-parking still waits
    // for DOMContentLoaded (the DOM gate must not regress).
    const dist = makeDist();
    try {
      runInjector(dist);
      const html = readIndex(dist);
      const loaderSrc = html.match(
        /<script id="audit-font-loader">([\s\S]*?)<\/script>/,
      )![1];

      const harness = `
        const added = [];
        const appended = [];
        let readyState = "loading";
        const dcl = [];
        let parkedTag = null;
        global.document = {
          get readyState() { return readyState; },
          fonts: {
            _ready: Promise.resolve(),
            get ready() { return this._ready; },
            add(f) { added.push(f && f.__fam); },
          },
          addEventListener(type, cb) { if (type === "DOMContentLoaded") dcl.push(cb); },
          querySelectorAll(sel) {
            return (sel.includes("x-audit-parked-entry") && parkedTag) ? [parkedTag] : [];
          },
          createElement() { return { src: "", async: true, crossOrigin: "" }; },
          head: { appendChild(el) { appended.push(el.src); } },
        };
        global.FontFace = function (fam) {
          return { __fam: fam, load() { return Promise.resolve({ __fam: fam }); } };
        };
        ${loaderSrc}
        setTimeout(() => {
          const early = appended.length;
          parkedTag = {
            getAttribute: (k) => (k === "data-audit-entry-src" ? "/_expo/static/js/web/entry-abc.js" : null),
            crossOrigin: "",
          };
          readyState = "interactive";
          dcl.forEach((cb) => cb());
          setTimeout(() => {
            const hasIcon = added.includes("material-community");
            const hasText = added.includes("Roboto");
            if (early !== 0) { console.error("FAIL: un-parked before DCL"); process.exit(3); }
            if (!hasIcon) { console.error("FAIL: icon face not added:", JSON.stringify(added)); process.exit(4); }
            if (!hasText) { console.error("FAIL: text face not added:", JSON.stringify(added)); process.exit(5); }
            if (appended.length !== 1 || appended[0] !== "/_expo/static/js/web/entry-abc.js") {
              console.error("FAIL: entry not un-parked after DCL:", JSON.stringify(appended)); process.exit(6);
            }
            console.log("OK");
          }, 0);
        }, 0);
      `;
      const tmp = path.join(dist, "icon-loader-harness.mjs");
      fs.writeFileSync(tmp, harness, "utf8");
      const r = spawnSync("node", [tmp], { encoding: "utf8", timeout: 30_000 });
      expect(r.stderr + r.stdout).toContain("OK");
      expect(r.status).toBe(0);
    } finally {
      cleanup(dist);
    }
  });

  it("AC-i: hard-errors when no expo entry bundle is present (no silent no-fix)", () => {
    // A dist/index.html with fonts injected but NO entry bundle to gate would
    // mean the fonts race nothing / RNW is never gated — that must fail loudly
    // rather than emit a build that silently reproduces the 0x0 bug. The icon
    // ttf IS present so we reach the entry-bundle check (the missing-icon-ttf
    // hard error is asserted separately in AC-N).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2586-noentry-"));
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!DOCTYPE html><html><head><title>x</title></head><body><div id="root"></div></body></html>`,
      "utf8",
    );
    writeIconTtf(dir);
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
