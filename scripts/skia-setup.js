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

const skiaDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "@shopify",
  "react-native-skia"
);
const skiaPkg = path.join(skiaDir, "package.json");

// Step 1: Restore Skia package if npm cleaned it up after postinstall failure
if (!fs.existsSync(skiaPkg)) {
  console.log("-- Skia package incomplete, reinstalling with --ignore-scripts...");
  try {
    execSync(
      "npm install --ignore-scripts --no-save @shopify/react-native-skia@2.6.2",
      { stdio: "inherit", cwd: path.join(__dirname, "..") }
    );
    console.log("-- Skia package restored");
  } catch (e) {
    console.error("-- Failed to restore Skia package:", e.message);
    // Non-fatal — TypeScript checking will fail but the app still builds
    process.exit(0);
  }
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
    cwd: path.join(__dirname, ".."),
  });
} catch (e) {
  console.error("-- Skia install-libs.js failed:", e.message);
  // Non-fatal on macOS too — native build will fail but JS/TS works
  process.exit(0);
}
