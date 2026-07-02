#!/usr/bin/env node
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
// "missing text/label" findings (BLD-2581 / BLD-2582 / BLD-2585). Only the
// bundled `material-community` icon font renders.
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
//      browser resolve the stack left-to-right to a real font.)
//   2. Emit a blocking inline `<script>` (in `<head>`, BEFORE the expo entry
//      bundle) that constructs a `FontFace` per family, `await ff.load()`,
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
// The font asset lives under `e2e/` (never `public/` or `assets/`) and is
// never imported by app code, so `expo export` of a normal build does not
// bundle it and `public/index.html` is untouched. This script only ever edits
// the transient `dist/index.html` produced for an audit run. The shipped app
// bundle carries no new font and no visual-identity change (BLD-2586 AC3).
//
// # Usage
//   node scripts/inject-audit-fonts.mjs [--dist <dir>] [--force] [--quiet]
//
// Refs: BLD-2586 (this fix), BLD-2585 / BLD-2581 / BLD-2582 (false positives),
//       BLD-645 (audit workflow), BLD-481 (audit loop).

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
function buildLoader(dataUri) {
  const families = JSON.stringify(FAMILIES);
  const loader =
    `(function(){` +
    `var URI=${JSON.stringify(dataUri)};` +
    `var FAMS=${families};` +
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
    `Promise.all(FAMS.map(function(f){` +
    `try{var ff=new FontFace(f,'url("'+URI+'") format("woff2")',{weight:"100 900"});` +
    `return ff.load().then(function(l){document.fonts.add(l);}).catch(function(){});` +
    `}catch(e){return Promise.resolve();}` +
    `})).then(function(){return document.fonts.ready;})` +
    // Boot after fonts settle whether the load resolved or rejected — a failed
    // font must not permanently block the app from mounting. bootWhenDomReady
    // additionally ensures the parked body tags exist before we query them.
    `.then(bootWhenDomReady,bootWhenDomReady);` +
    `})();`;

  return `<script id="audit-font-loader">${loader}</script>`;
}

// Build the <head> block: marker comment + @font-face rules + blocking loader.
function buildInjection(dataUri) {
  return (
    `\n    <!-- ${MARKER} — E2E-only audit text font; no-op on font-equipped hosts. -->\n` +
    `    ${buildFontFaceStyle(dataUri)}\n` +
    `    ${buildLoader(dataUri)}\n`
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

  const injection = buildInjection(dataUri);
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
  log(
    `injected font-gated loader (${FAMILIES.length} families, ${kb} KB data-URI); ` +
      `parked ${parked.parkedCount} entry bundle(s) until document.fonts.ready → ${indexPath}`,
  );
}

main();
