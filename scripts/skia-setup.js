#!/usr/bin/env node
"use strict";

// BLD-832: Post-install setup for @shopify/react-native-skia
//
// Skia is listed as an optionalDependency because its postinstall script
// fails on Linux (EACCES from cpSync on virtiofs/SELinux). When the
// postinstall fails, npm removes most of the package files. This script:
//
// 1. Checks if Skia's package.json exists (meaning the package is intact)
// 2. If missing, reinstalls Skia with --ignore-scripts to restore JS/TS files
// 3. On macOS, runs Skia's install-libs.js to copy native frameworks
// 4. On Linux, skips native lib setup (not needed for typecheck/lint/test)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");
const skiaDir = path.join(
  projectRoot,
  "node_modules",
  "@shopify",
  "react-native-skia"
);
const skiaPkg = path.join(skiaDir, "package.json");

// Read Skia version from project package.json optionalDependencies
const projectPkg = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
);
const skiaVersion =
  (projectPkg.optionalDependencies &&
    projectPkg.optionalDependencies["@shopify/react-native-skia"]) ||
  (projectPkg.dependencies &&
    projectPkg.dependencies["@shopify/react-native-skia"]) ||
  "2.6.2"; // fallback

// Step 1: Restore Skia package if npm cleaned it up after postinstall failure
if (!fs.existsSync(skiaPkg)) {
  console.log("-- Skia package incomplete, reinstalling with --ignore-scripts...");
  try {
    execSync(
      "npm install --ignore-scripts --no-save @shopify/react-native-skia@" + skiaVersion,
      { stdio: "inherit", cwd: projectRoot }
    );
    console.log("-- Skia package restored");
  } catch (e) {
    console.error("-- Failed to restore Skia package:", e.message);
    // Non-fatal — TypeScript checking will fail but the app still builds
    process.exit(0);
  }
}

// Step 1b (BLD-2078): stage CanvasKit's WASM into public/ for web.
//
// On web, react-native-skia loads Skia from `canvaskit-wasm`. `LoadSkiaWeb()`
// calls `CanvasKitInit()` which fetches `canvaskit.wasm` relative to the page
// origin. Expo copies everything under `public/` to the web bundle root on
// `expo export`, so placing the wasm at `public/canvaskit.wasm` makes it
// available same-origin at `/canvaskit.wasm` (both under `npx serve -s dist`
// for the screenshot/e2e pipeline and on the deployed static host). Without
// this, `LoadSkiaWeb()` fetches the SPA fallback HTML, fails to instantiate
// (`expected magic word 00 61 73 6d`), CanvasKit never initialises, and the
// Progress-tab charts can never render. Runs on ALL platforms (web needs it
// regardless of host OS). The file is git-ignored — it is a build artifact
// reproduced from node_modules on every install.
try {
  const wasmSrc = path.join(
    projectRoot,
    "node_modules",
    "canvaskit-wasm",
    "bin",
    "full",
    "canvaskit.wasm"
  );
  const publicDir = path.join(projectRoot, "public");
  const wasmDest = path.join(publicDir, "canvaskit.wasm");
  if (fs.existsSync(wasmSrc)) {
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.copyFileSync(wasmSrc, wasmDest);
    console.log("-- Staged canvaskit.wasm -> public/canvaskit.wasm");
  } else {
    console.warn(
      "-- canvaskit-wasm/bin/full/canvaskit.wasm not found; web charts will not render until it is staged"
    );
  }
} catch (e) {
  console.error("-- Failed to stage canvaskit.wasm:", e.message);
  // Non-fatal — native/typecheck/lint unaffected; only web chart rendering needs it.
}

// Step 2: On macOS, run Skia's install-libs.js to copy native frameworks
if (process.platform !== "darwin") {
  console.log(
    "-- Skipping Skia native lib setup (platform: " +
      process.platform +
      ")"
  );
  process.exit(0);
}

const skiaScript = path.join(skiaDir, "scripts", "install-libs.js");
if (!fs.existsSync(skiaScript)) {
  console.log("-- Skia install script not found, skipping");
  process.exit(0);
}

try {
  execSync("node " + JSON.stringify(skiaScript), {
    stdio: "inherit",
    cwd: projectRoot,
  });
} catch (e) {
  console.error("-- Skia install-libs.js failed:", e.message);
  // Non-fatal on macOS too — native build will fail but JS/TS works
  process.exit(0);
}
