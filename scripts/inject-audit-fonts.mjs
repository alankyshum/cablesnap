#!/usr/bin/env node
/* eslint-env node */
// inject-audit-fonts.mjs — make the visual-audit harness render text in the
// fontless agent-runtime container (BLD-2586).
//
// # Why this exists
//
// The daily UX-audit (`scripts/daily-audit.sh`) exports the web bundle and
// serves `dist/` under Chromium. In the agent-runtime container there are NO
// system text fonts: `/usr/share/fonts` does not exist and `fontconfig`
// (`fc-list`/`fc-match`) is absent. With no font to fall back to, Chromium
// measures every sans/serif text run as **0x0** — so ALL app text vanishes
// from audit screenshots and the audit emits a whole CLASS of false
// "missing text/label" findings (BLD-2581 / BLD-2582 / BLD-2585).
//
// The SAME fontless container also blanks every `@expo/vector-icons`
// `MaterialCommunityIcons` glyph (BLD-2744). Each vector icon renders an empty
// `<Text/>` until `state.fontIsLoaded` flips, which only happens once
// `Font.loadAsync('material-community', …)` → `fontfaceobserver` resolves. On
// Chromium, fontfaceobserver takes its NATIVE branch —
// `document.fonts.load('100px "material-community"', 'BESbswy')` — and in this
// fontless config a CSS `@font-face` with a data/URL src makes that call throw
// `NetworkError`, so the observer rejects and the glyph stays blank forever.
// (The CSS family the app actually renders icons with is `material-community`,
// from `createIconSet(glyphMap,'material-community',font)` — NOT the ttf
// filename `MaterialCommunityIcons`.) Constructing the `FontFace` explicitly
// and `document.fonts.add()`-ing it — exactly how we handle the text stack
// below — makes `document.fonts.load(...)` match, so the observer resolves and
// glyphs paint. So this script eager-loads the bundled icon font too.
//
// # What this does
//
// After `expo export`, it patches the SERVED `dist/index.html` to:
//   1. Declare `@font-face` for each **concrete** family in react-native-web's
//      default font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI",
//      Roboto, Helvetica, Arial`, plus `Helvetica Neue`, `Noto Sans`),
//      pointing at a base64 data-URI of `e2e/assets/fonts/audit-latin.woff2`.
//      (You CANNOT alias the reserved keywords `sans-serif`/`serif`/
//      `monospace`/`system-ui`, but aliasing the concrete members makes the
//      browser resolve the stack left-to-right to a real font.) It also loads
//      the bundled **icon** font family `material-community` from the ttf that
//      `expo export` already emitted into `dist/assets/**` (resolved by glob so
//      the content-hash is never hardcoded) — see the loader (step 2) which
//      registers it via the `FontFace` constructor so `document.fonts.load()`
//      matches and `@expo/vector-icons` glyphs paint (BLD-2744).
//   2. Emit a blocking inline `<script>` (in `<head>`, BEFORE the expo entry
//      bundle) that constructs a `FontFace` per family (text families AND the
//      `material-community` icon family), `await ff.load()`,
//      `document.fonts.add(ff)`, then `await document.fonts.ready`.
//   3. **Park the expo entry bundle so it cannot execute until step 2 finishes.**
//      A CSS-only `@font-face` does NOT force-load in time, and — crucially —
//      merely *starting* the FontFace loads does not gate the bundle either:
//      a `<script>` completes synchronously the instant it returns, so the
//      deferred entry bundle would still mount react-native-web and cache text
//      metrics at its FIRST layout while the font is unloaded (RNW does not
//      re-measure when fonts arrive later — proven in BLD-2585) → text stays
//      0x0. So we rewrite the entry `<script src="/_expo/static/js/…">` to an
//      inert type the browser parses but never runs, and the loader clones it
//      back into an executable `<script src>` ONLY after BOTH
//      `document.fonts.ready` AND the DOM is available. The DOM gate matters
//      because the loader runs in `<head>` while `document.readyState` is
//      still `"loading"`; the data-URI FontFace loads have no network hop, so
//      fonts can become ready before the parser reaches the parked entry
//      `<script>` in `<body>` — un-parking then would find nothing and leave
//      the page permanently blank. So boot() is deferred to `DOMContentLoaded`
//      whenever the document is still parsing.
//      react-native-web therefore literally cannot measure text until the audit
//      font is loaded.
//
// # Gating (critical): no-op when real fonts are present
//
// If the host already has system fonts (`/usr/share/fonts` exists), this is a
// **no-op** — it exits 0 without touching `dist/index.html`. That keeps CI's
// `ubuntu-latest` (which apt-installs OS fonts via
// `playwright install --with-deps`) byte-for-byte unchanged, so we never
// silently alter CI audit screenshots. Only the fontless agent path is
// patched. Pass `--force` to patch regardless of the probe (used by the
// regression test).
//
// # Production safety
//
// The text font asset lives under `e2e/` (never `public/` or `assets/`) and is
// never imported by app code, so `expo export` of a normal build does not
// bundle it and `public/index.html` is untouched. The icon ttf is the app's
// OWN already-bundled `MaterialCommunityIcons` font — we only re-reference it
// (base64-inlined into the transient audit HTML), we never add a new asset to
// the shipped bundle. This script only ever edits the transient
// `dist/index.html` produced for an audit run. The shipped app bundle carries
// no new font and no visual-identity change (BLD-2586 AC3 / BLD-2744).
//
// # Usage
//   node scripts/inject-audit-fonts.mjs [--dist <dir>] [--force] [--quiet]
//
// Refs: BLD-2586 (text half), BLD-2744 (icon half), BLD-2585 / BLD-2581 /
//       BLD-2582 (false positives), BLD-645 (audit workflow), BLD-481 (loop).

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Sentinel so re-running the injector (e.g. HEAD + pre-fix passes both call
// daily-audit's build step) never double-injects.
const MARKER = "audit-font-inject:BLD-2586";

// Concrete family names to alias. Order/content mirror react-native-web's
// SYSTEM_FONT_STACK (createReactDOMStyle.js): '-apple-system,
// BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'. We add a
// couple of common concrete fallbacks apps sometimes name explicitly. The
// reserved generics (sans-serif/serif/monospace/system-ui) are intentionally
// omitted — the browser rejects FontFace registration for them.
const FAMILIES = [
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "Helvetica",
  "Helvetica Neue",
  "Arial",
  "Noto Sans",
];

// Bundled `@expo/vector-icons` icon fonts to eager-load so their glyphs paint
// in the fontless audit (BLD-2744). Each entry maps the CSS `font-family` the
// app actually renders with (react-native-web sets `fontFamily` to the name
// passed to `createIconSet`) to the ttf basename `expo export` emits under
// `dist/assets/**`. NOTE the family is the createIconSet NAME
// (`material-community`), NOT the ttf filename (`MaterialCommunityIcons`) — a
// FontFace registered under the filename would never match the rendered
// `font-family: material-community` and glyphs would stay blank.
//
// The daily audit's blank-glyph findings are all MaterialCommunityIcons (the
// only vector family the app uses in the audited screens), so we register just
// that one. Adding more families later is a one-line append here — the loader
// treats icon families generically.
const ICON_FONTS = [
  { family: "material-community", ttfBasename: "MaterialCommunityIcons" },
];

// Resolve each ICON_FONTS entry to its built ttf under `<dist>/assets/**` by
// GLOB (the content-hash in `MaterialCommunityIcons.<hash>.ttf` is
// build-generated and MUST NOT be hardcoded). Returns
// [{ family, dataUri }, …]. Missing a ttf is a hard error (mirrors the
// `parkedCount===0` policy) so we never emit an audit build that silently
// re-blanks the icons this script exists to fix.
function resolveIconFonts(distDir) {
  const assetsRoot = resolve(distDir, "assets");
  return ICON_FONTS.map(({ family, ttfBasename }) => {
    const ttf = findTtf(assetsRoot, ttfBasename);
    if (!ttf) {
      process.stderr.write(
        `[inject-audit-fonts] ERROR: bundled icon font ${ttfBasename}.<hash>.ttf ` +
          `not found under ${assetsRoot} — cannot eager-load the '${family}' ` +
          `family, so @expo/vector-icons glyphs would render blank in the audit ` +
          `(the exact bug this fixes). Did \`expo export -p web\` change its ` +
          `asset layout?\n`,
      );
      process.exit(1);
    }
    const dataUri =
      "data:font/ttf;base64," + readFileSync(ttf).toString("base64");
    return { family, dataUri };
  });
}

// Recursively find `<basename>.<hash>.ttf` (or bare `<basename>.ttf`) under
// `dir`. Returns the absolute path of the first match, or null. Kept dependency
// free (no glob package): a small readdir walk over the dist assets tree.
function findTtf(dir, basename) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  // Match `<basename>.<anything>.ttf` and the un-hashed `<basename>.ttf`.
  const re = new RegExp(
    `^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.[^/]+)?\\.ttf$`,
    "i",
  );
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      const hit = findTtf(full, basename);
      if (hit) return hit;
    } else if (re.test(ent.name)) {
      return full;
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = { dist: resolve(ROOT, "dist"), force: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dist") args.dist = resolve(argv[++i]);
    else if (a === "--force") args.force = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "-h" || a === "--help") {
      process.stdout.write(
        "Usage: node scripts/inject-audit-fonts.mjs [--dist <dir>] [--force] [--quiet]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`[inject-audit-fonts] unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

// Probe: does this host already have system text fonts? If so, the audit
// browser can render text on its own and we must NOT override it. The probed
// path is overridable via AUDIT_FONT_PROBE_DIR purely so the regression test
// can exercise both branches deterministically without mutating the real
// /usr/share/fonts; production/CI leave it unset.
function systemFontsPresent() {
  const dir = process.env.AUDIT_FONT_PROBE_DIR || "/usr/share/fonts";
  try {
    return existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// The <script> `type` we use to PARK the expo entry bundle so the browser
// parses but does NOT execute it. After fonts are ready the loader clones each
// parked tag back into an executable `<script src>` (see buildLoader).
const PARKED_TYPE = "text/x-audit-parked-entry";

// Attribute the loader reads to recover the parked bundle URL.
const PARKED_SRC_ATTR = "data-audit-entry-src";

// Substring identifying an expo entry/JS bundle `<script src>`. We only ever
// park scripts under this path so we never touch unrelated inline scripts.
const ENTRY_SRC_MATCH = "/_expo/static/js/";

// Build the @font-face <style> for the concrete RNW-stack families.
function buildFontFaceStyle(dataUri) {
  const faces = FAMILIES.map(
    (fam) =>
      `@font-face{font-family:${JSON.stringify(fam)};` +
      `src:url("${dataUri}") format("woff2");` +
      `font-weight:100 900;font-style:normal;font-display:block;}`,
  ).join("");
  return `<style id="audit-font-face">${faces}</style>`;
}

// Build the blocking loader <script>.
//
// CRITICAL (BLD-2586 review): merely kicking off FontFace.load() does NOT gate
// the entry bundle — a <script> completes synchronously the instant the IIFE
// returns, and the deferred expo entry bundle then mounts react-native-web
// which caches text metrics at its FIRST layout (it does not re-measure when
// fonts arrive later, proven in BLD-2585). So the fonts MUST finish loading
// BEFORE the entry bundle executes.
//
// We guarantee ordering by PARKING the entry bundle: main() rewrites the expo
// entry `<script src>` to `type="${PARKED_TYPE}"` (a bogus MIME the browser
// will parse but never execute) and stashes its real URL in
// `${PARKED_SRC_ATTR}`. This loader then:
//   1. loads every FontFace (data-URI, so no network), awaits document.fonts.ready
//   2. ONLY THEN clones each parked tag into a live `<script src>` that runs
// react-native-web therefore cannot mount — and cannot measure text — until
// the audit font is loaded. If FontFace is unsupported we still un-park the
// entry so the page is never permanently blank (graceful degradation).
//
// ICON FONTS (BLD-2744): the same Promise.all also constructs a FontFace for
// each bundled `@expo/vector-icons` family (e.g. `material-community`) from its
// own ttf data-URI and `document.fonts.add()`s it. This is what makes the icon
// glyphs paint: `@expo/vector-icons` renders a blank `<Text/>` until its
// `fontfaceobserver` resolves, and on Chromium that observer polls
// `document.fonts.load('… "material-community"')` — which only matches once a
// loaded FontFace under that family exists. Registering via the FontFace
// constructor (not a CSS `@font-face`, which throws `NetworkError` on
// `document.fonts.load` in the fontless headless config) is the empirically
// verified working path.
//
// CRITICAL (BLD-2586 second review): boot() MUST also wait for the DOM.
// This loader is injected in <head>, so it runs while
// `document.readyState === "loading"` and BEFORE the parser has reached the
// parked entry `<script>` tags in <body>. The data-URI FontFace loads have no
// network round-trip, so `document.fonts.ready` (and the unsupported-FontFace
// early path) can resolve while the body is still unparsed — at which point
// `querySelectorAll('script[type=PARK]')` returns an EMPTY NodeList, nothing
// is un-parked, and the app is permanently blank. So every boot path funnels
// through bootWhenDomReady(), which defers boot() to `DOMContentLoaded` while
// the document is still loading and runs it immediately once parsing is done.
function buildLoader(dataUri, iconFonts) {
  const families = JSON.stringify(FAMILIES);
  // [ [family, dataUri], … ] — kept as a plain array literal so the emitted
  // IIFE has no dependency on how the build resolved the ttf paths.
  const icons = JSON.stringify(
    (iconFonts || []).map(({ family, dataUri: uri }) => [family, uri]),
  );
  const loader =
    `(function(){` +
    `var URI=${JSON.stringify(dataUri)};` +
    `var FAMS=${families};` +
    `var ICONS=${icons};` +
    `var PARK=${JSON.stringify(PARKED_TYPE)};` +
    `var SRCATTR=${JSON.stringify(PARKED_SRC_ATTR)};` +
    // Re-inject every parked entry bundle as an executable <script src>, in
    // document order, so react-native-web finally boots.
    `function boot(){` +
    `var parked=document.querySelectorAll('script[type="'+PARK+'"]');` +
    `for(var i=0;i<parked.length;i++){(function(old){` +
    `var s=document.createElement("script");` +
    `s.src=old.getAttribute(SRCATTR);` +
    `s.async=false;` + // preserve execution order across multiple bundles
    `if(old.crossOrigin)s.crossOrigin=old.crossOrigin;` +
    `document.head.appendChild(s);` +
    `})(parked[i]);}` +
    `}` +
    // Gate boot() on DOM availability. The loader runs in <head>, so the parked
    // entry <script> tags in <body> may not be parsed yet; booting now would
    // querySelectorAll an empty set and leave the page blank forever. When the
    // document is still parsing, defer to DOMContentLoaded (one-shot); once
    // parsing is complete, boot synchronously.
    `function bootWhenDomReady(){` +
    `if(document.readyState==="loading"){` +
    `document.addEventListener("DOMContentLoaded",boot,{once:true});` +
    `}else{boot();}` +
    `}` +
    // No FontFace API (or already-font-equipped host that we force-patched):
    // don't hang the page — un-park as soon as the DOM is ready.
    `if(typeof FontFace==="undefined"||!document.fonts){bootWhenDomReady();return;}` +
    // Text families: one shared woff2 data-URI aliased to every concrete name.
    `var loads=FAMS.map(function(f){` +
    `try{var ff=new FontFace(f,'url("'+URI+'") format("woff2")',{weight:"100 900"});` +
    `return ff.load().then(function(l){document.fonts.add(l);}).catch(function(){});` +
    `}catch(e){return Promise.resolve();}` +
    `});` +
    // Icon families (BLD-2744): each has its OWN ttf data-URI. Registering a
    // loaded FontFace under the createIconSet family name is what lets
    // @expo/vector-icons' fontfaceobserver resolve so glyphs paint.
    `ICONS.forEach(function(pair){` +
    `try{var iff=new FontFace(pair[0],'url("'+pair[1]+'") format("truetype")');` +
    `loads.push(iff.load().then(function(l){document.fonts.add(l);}).catch(function(){}));` +
    `}catch(e){}` +
    `});` +
    `Promise.all(loads).then(function(){return document.fonts.ready;})` +
    // Boot after fonts settle whether the load resolved or rejected — a failed
    // font must not permanently block the app from mounting. bootWhenDomReady
    // additionally ensures the parked body tags exist before we query them.
    `.then(bootWhenDomReady,bootWhenDomReady);` +
    `})();`;

  return `<script id="audit-font-loader">${loader}</script>`;
}

// Build the <head> block: marker comment + @font-face rules + blocking loader.
function buildInjection(dataUri, iconFonts) {
  return (
    `\n    <!-- ${MARKER} — E2E-only audit text+icon fonts; no-op on font-equipped hosts. -->\n` +
    `    ${buildFontFaceStyle(dataUri)}\n` +
    `    ${buildLoader(dataUri, iconFonts)}\n`
  );
}

// Park the expo entry bundle(s): rewrite `<script src="/_expo/static/js/…">`
// so the browser will NOT auto-execute them. The loader un-parks them only
// after fonts are ready. Returns { html, parkedCount }.
//
// We match on the entry-src substring so unrelated inline scripts are never
// touched. Each matched tag keeps its original src in `${PARKED_SRC_ATTR}` and
// gets `type="${PARKED_TYPE}"`; any pre-existing type is dropped (the expo
// entry has none). `defer`/`async` on the parked tag are now inert (the
// browser ignores them on a non-executing type), and the loader re-applies
// ordered execution via `script.async=false`.
function parkEntryScripts(html) {
  let parkedCount = 0;
  const scriptTag = /<script\b([^>]*?)\bsrc="([^"]*)"([^>]*)>/gi;
  const patched = html.replace(scriptTag, (full, pre, src, post) => {
    if (!src.includes(ENTRY_SRC_MATCH)) return full;
    parkedCount++;
    // Strip any existing type=… from the surrounding attrs so ours is the only
    // one. (Expo's entry tag has no type; this is defensive.)
    const stripType = (s) => s.replace(/\stype="[^"]*"/gi, "");
    const attrs = `${stripType(pre)}${stripType(post)}`.replace(/\s+/g, " ").trimEnd();
    return `<script type="${PARKED_TYPE}" ${PARKED_SRC_ATTR}="${src}"${attrs ? " " + attrs.trimStart() : ""}>`;
  });
  return { html: patched, parkedCount };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => {
    if (!args.quiet) process.stdout.write(`[inject-audit-fonts] ${m}\n`);
  };

  if (!args.force && systemFontsPresent()) {
    const probeDir = process.env.AUDIT_FONT_PROBE_DIR || "/usr/share/fonts";
    log(`system fonts present (${probeDir}) — no-op (CI/desktop path).`);
    return;
  }

  const indexPath = resolve(args.dist, "index.html");
  if (!existsSync(indexPath)) {
    process.stderr.write(
      `[inject-audit-fonts] ERROR: ${indexPath} not found — run \`expo export -p web\` first.\n`,
    );
    process.exit(1);
  }

  let html = readFileSync(indexPath, "utf8");
  if (html.includes(MARKER)) {
    log("already injected — idempotent no-op.");
    return;
  }

  const fontPath = resolve(ROOT, "e2e/assets/fonts/audit-latin.woff2");
  if (!existsSync(fontPath)) {
    process.stderr.write(
      `[inject-audit-fonts] ERROR: font asset missing at ${fontPath}\n`,
    );
    process.exit(1);
  }
  const dataUri =
    "data:font/woff2;base64," + readFileSync(fontPath).toString("base64");

  // Resolve the bundled icon fonts (glob, no hardcoded hash). Hard-errors if a
  // ttf is missing so we never emit an audit build that re-blanks icons
  // (BLD-2744). Done BEFORE we mutate `dist/index.html` so a missing ttf leaves
  // the file untouched (no marker), consistent with the parkedCount===0 policy.
  const iconFonts = resolveIconFonts(args.dist);

  // Park the expo entry bundle FIRST so the loader can gate its execution on
  // font readiness. If nothing parks, the fonts would race the bundle and RNW
  // would measure text 0x0 again (the exact bug this script fixes), so a
  // zero-parked result is a hard error rather than a silent no-fix.
  const parked = parkEntryScripts(html);
  if (parked.parkedCount === 0) {
    process.stderr.write(
      "[inject-audit-fonts] ERROR: no expo entry <script src=\"" +
        ENTRY_SRC_MATCH +
        "…\"> found in dist/index.html — cannot gate the bundle on font " +
        "readiness (font load would race react-native-web's first measure). " +
        "Did `expo export -p web` change its HTML shape?\n",
    );
    process.exit(1);
  }
  html = parked.html;

  const injection = buildInjection(dataUri, iconFonts);
  const idx = html.lastIndexOf("</head>");
  if (idx === -1) {
    process.stderr.write(
      "[inject-audit-fonts] ERROR: no </head> in dist/index.html — cannot inject.\n",
    );
    process.exit(1);
  }
  html = html.slice(0, idx) + injection + html.slice(idx);
  writeFileSync(indexPath, html, "utf8");

  const kb = (Buffer.byteLength(dataUri) / 1024).toFixed(1);
  const iconKb = (
    iconFonts.reduce((n, f) => n + Buffer.byteLength(f.dataUri), 0) / 1024
  ).toFixed(1);
  log(
    `injected font-gated loader (${FAMILIES.length} text families, ${kb} KB; ` +
      `${iconFonts.length} icon font(s) [${iconFonts
        .map((f) => f.family)
        .join(", ")}], ${iconKb} KB); ` +
      `parked ${parked.parkedCount} entry bundle(s) until document.fonts.ready → ${indexPath}`,
  );
}

main();
