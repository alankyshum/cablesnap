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
//   2. Emit a **blocking** inline `<script>` (placed in `<head>` BEFORE the
//      expo entry bundle) that constructs a `FontFace` per family,
//      `await ff.load()`, `document.fonts.add(ff)`, then
//      `await document.fonts.ready`. A CSS-only `@font-face` does NOT
//      force-load in time; react-native-web caches text metrics at mount and
//      does not re-measure when fonts arrive later (proven in BLD-2585), so
//      the font MUST be loaded before RNW's first layout.
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

// Build the <head> block: @font-face rules + blocking loader script.
function buildInjection(dataUri) {
  const faces = FAMILIES.map(
    (fam) =>
      `@font-face{font-family:${JSON.stringify(fam)};` +
      `src:url("${dataUri}") format("woff2");` +
      `font-weight:100 900;font-style:normal;font-display:block;}`,
  ).join("");

  // The loader is synchronous-in-order and awaits document.fonts.ready before
  // yielding, so it completes before the deferred entry bundle's first frame.
  const families = JSON.stringify(FAMILIES);
  const loader =
    `(function(){` +
    `var URI=${JSON.stringify(dataUri)};` +
    `var FAMS=${families};` +
    `if(typeof FontFace==="undefined"||!document.fonts){return;}` +
    `Promise.all(FAMS.map(function(f){` +
    `try{var ff=new FontFace(f,'url("'+URI+'")',{weight:"100 900"});` +
    `return ff.load().then(function(l){document.fonts.add(l);}).catch(function(){});` +
    `}catch(e){return Promise.resolve();}` +
    `})).then(function(){return document.fonts.ready;});` +
    `})();`;

  return (
    `\n    <!-- ${MARKER} — E2E-only audit text font; no-op on font-equipped hosts. -->\n` +
    `    <style id="audit-font-face">${faces}</style>\n` +
    `    <script id="audit-font-loader">${loader}</script>\n`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => {
    if (!args.quiet) process.stdout.write(`[inject-audit-fonts] ${m}\n`);
  };

  if (!args.force && systemFontsPresent()) {
    log("system fonts present (/usr/share/fonts) — no-op (CI/desktop path).");
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
    `injected blocking FontFace loader (${FAMILIES.length} families, ${kb} KB data-URI) into ${indexPath}`,
  );
}

main();
