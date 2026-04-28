/* eslint-disable */
/**
 * Expo config plugin: with-wearos-module
 *
 * Stitches the CableSnap Wear OS companion into the managed-Expo Android
 * prebuild output. Sister plugin of `with-release-signing`; runs on every
 * `expo prebuild` and is fully idempotent.
 *
 * Implements the build-infrastructure decisions in `.plans/PLAN-BLD-716.md`:
 *
 * - §"Repo integration strategy (TL-1b)": copy the in-tree
 *   `modules/expo-wearos-bridge/wear-template/` directory into
 *   `android/wear/` of the prebuild output and register `:wear` as a Gradle
 *   subproject in `android/settings.gradle`.
 * - §"F-Droid + Play split (TL-2)": emit a `flavorDimensions ["distribution"]`
 *   block under `android { ... }` in `android/app/build.gradle` with two
 *   product flavors:
 *     - `playRelease` — Wear bridge module + GMS deps included.
 *     - `fdroidRelease` — bridge module excluded; `com.google.android.gms.*`
 *       transitively excluded from the runtime classpath. AC10b verifies the
 *       resulting APK contains zero `com/google/android/gms/wearable/*`
 *       classes.
 *
 * Anchor strategy mirrors `with-release-signing.js`: every patched region is
 * fenced by a sentinel marker (`// cablesnap:wearos:*`) so re-running the
 * plugin never duplicates output. If an expected anchor is missing the
 * plugin fails loudly rather than silently producing a half-patched build.
 *
 * Flavor-aware contract: the SAME prebuild output supports both flavors.
 * Selecting the F-Droid build is a Gradle invocation concern
 * (`./gradlew assembleFdroidRelease`), not a prebuild-time concern. F-Droid's
 * build server invokes Gradle with the F-Droid flavor only, per the
 * `Builds:` block in `fdroid/metadata/com.persoack.cablesnap.yml`.
 */

const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withSettingsGradle,
  withDangerousMod,
} = require("expo/config-plugins");

// ---------------------------------------------------------------------------
// Sentinel markers — every patched region carries one so the plugin is safe
// to re-run on every `expo prebuild`.
// ---------------------------------------------------------------------------
const SETTINGS_MARKER = "// cablesnap:wearos:settings-include";
const FLAVORS_MARKER = "// cablesnap:wearos:flavor-dimensions";
const FDROID_EXCLUDES_MARKER = "// cablesnap:wearos:fdroid-excludes";

// Where the wear-template lives in the source tree, and where the prebuild
// output expects to find the `:wear` subproject.
const WEAR_TEMPLATE_RELATIVE = path.join(
  "modules",
  "expo-wearos-bridge",
  "wear-template",
);
const WEAR_PROJECT_RELATIVE = path.join("android", "wear");

// ---------------------------------------------------------------------------
// settings.gradle patch — register `:wear` as a Gradle subproject.
// ---------------------------------------------------------------------------
const SETTINGS_BLOCK = `
${SETTINGS_MARKER}
include ':wear'
project(':wear').projectDir = new File(rootProject.projectDir, 'wear')
`;

function patchSettingsGradle(contents) {
  if (contents.includes(SETTINGS_MARKER)) {
    return contents;
  }
  // Append at the end of settings.gradle. Order doesn't matter for
  // `include` calls — Gradle accumulates them all before evaluating
  // subprojects.
  let out = contents;
  if (!out.endsWith("\n")) {
    out = out + "\n";
  }
  return out + SETTINGS_BLOCK;
}

// ---------------------------------------------------------------------------
// app/build.gradle patch — product flavors + F-Droid excludes.
// ---------------------------------------------------------------------------
//
// `flavorDimensions` and `productFlavors` are added inside the existing
// `android { ... }` block. The F-Droid exclude block is added at top level
// (outside `android { ... }`) so it can manipulate `configurations { ... }`
// directly without nesting issues.
//
// We intentionally do NOT add `applicationIdSuffix` — the F-Droid build keeps
// the canonical `com.persoack.cablesnap` package id so the F-Droid catalog
// metadata does not need to track a distinct app id.
//
// `versionNameSuffix` is set on `playRelease` only so installed users can
// tell at a glance which build channel they are on (Settings → About). The
// F-Droid build keeps the bare `versionName` to avoid F-Droid's reproducible
// build server flagging the suffix as a non-deterministic edit.

const FLAVORS_BLOCK = `    ${FLAVORS_MARKER}
    flavorDimensions "distribution"
    productFlavors {
        playRelease {
            dimension "distribution"
            // Watch bridge + GMS Wearable: present.
            versionNameSuffix "-play"
        }
        fdroidRelease {
            dimension "distribution"
            // Watch bridge module + GMS Wearable: excluded via the
            // configurations { fdroidReleaseImplementation { exclude ... } }
            // block immediately after the android { ... } block.
        }
    }
`;

// `configurations { ... }` blocks placed at the project script level apply to
// the whole module. The plan's AC10b is: `unzip -l app-fdroidRelease.apk |
// grep -c 'com/google/android/gms/wearable' == 0`. We hit that by:
//
//   1. Excluding the GMS Wearable artifact from every fdroidRelease* config.
//   2. Excluding the Expo Wear bridge library project (which transitively
//      pulls in GMS Wearable) from the same configs.
//
// Belt-and-suspenders: even if Expo's autolinker adds `implementation
// project(':expo-wearos-bridge')` unconditionally, the runtime/compile
// classpath under fdroidRelease never resolves it. The bridge module's own
// `:expo-wearos-bridge` project is still configured by Gradle (cheap), but
// no classes from it land in the F-Droid APK.
const FDROID_EXCLUDES_BLOCK = `
${FDROID_EXCLUDES_MARKER}
configurations {
    fdroidReleaseImplementation {
        // F-Droid Inclusion Criteria reject GMS — exclude the entire group
        // transitively from the F-Droid runtime + compile classpath.
        exclude group: "com.google.android.gms"
        // Drop the Expo Wear bridge library project so its compiled
        // .class files never reach app-fdroidRelease.apk.
        exclude module: "expo-wearos-bridge"
    }
    fdroidReleaseRuntimeClasspath {
        exclude group: "com.google.android.gms"
        exclude module: "expo-wearos-bridge"
    }
    fdroidReleaseCompileClasspath {
        exclude group: "com.google.android.gms"
        exclude module: "expo-wearos-bridge"
    }
}
`;

function patchAppBuildGradle(contents) {
  let out = contents;

  // 1. Inject flavor dimensions + productFlavors inside `android { ... }`.
  if (!out.includes(FLAVORS_MARKER)) {
    // Anchor on `defaultConfig {` — every Expo-prebuilt app/build.gradle has
    // exactly one. We insert immediately AFTER the closing brace of
    // defaultConfig so flavors sit alongside it (Gradle does not require a
    // particular order, but this matches Android Studio's generated layout
    // and reads cleanly).
    const defaultConfigRegex = /(defaultConfig\s*\{[\s\S]*?\n\s*\}\s*\n)/;
    if (!defaultConfigRegex.test(out)) {
      throw new Error(
        "with-wearos-module: could not find `defaultConfig { ... }` anchor in app/build.gradle",
      );
    }
    out = out.replace(defaultConfigRegex, `$1${FLAVORS_BLOCK}`);
  }

  // 2. Inject the configurations excludes at the top level (outside
  //    android { ... }). We anchor on the top-level `dependencies {` block
  //    and insert the excludes immediately before it. Anchoring on the
  //    line start (`\ndependencies\s*\{`) ensures we don't match a nested
  //    dependencies block accidentally.
  if (!out.includes(FDROID_EXCLUDES_MARKER)) {
    const depsAnchor = /(\ndependencies\s*\{)/;
    if (!depsAnchor.test(out)) {
      throw new Error(
        "with-wearos-module: could not find top-level `dependencies {` anchor in app/build.gradle",
      );
    }
    out = out.replace(depsAnchor, `${FDROID_EXCLUDES_BLOCK}\n$1`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// withDangerousMod: copy modules/expo-wearos-bridge/wear-template → android/wear
// ---------------------------------------------------------------------------
//
// `withDangerousMod` runs after the Android template has been written. We
// recursively copy the wear-template directory into the prebuild output. If
// `android/wear` already exists from a previous prebuild, we wipe it first to
// avoid stale files (e.g. if the template renamed a file between prebuilds).

function copyDirRecursive(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(
      `with-wearos-module: wear-template source directory missing at ${srcDir}`,
    );
  }
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
    // Symlinks/sockets/etc are intentionally ignored — none should appear
    // in a Gradle module template, and we do not want to silently follow
    // them into surprising places.
  }
}

function rmDirRecursive(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

const withWearOsModule = (config) => {
  // 1. Patch settings.gradle to register :wear.
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = patchSettingsGradle(cfg.modResults.contents);
    return cfg;
  });

  // 2. Patch app/build.gradle: flavors + F-Droid excludes.
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `with-wearos-module: expected Groovy build.gradle, got ${cfg.modResults.language}`,
      );
    }
    cfg.modResults.contents = patchAppBuildGradle(cfg.modResults.contents);
    return cfg;
  });

  // 3. Copy wear-template → android/wear.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const srcDir = path.join(projectRoot, WEAR_TEMPLATE_RELATIVE);
      const dstDir = path.join(platformRoot, "wear");
      // Wipe stale outputs so a renamed/deleted file in the template does
      // not linger. The template is the source of truth.
      rmDirRecursive(dstDir);
      copyDirRecursive(srcDir, dstDir);
      return cfg;
    },
  ]);

  return config;
};

module.exports = withWearOsModule;
// Named exports for unit testing — the full plugin is integration-tested by
// `expo prebuild` in CI; the patch helpers below are unit-tested directly.
module.exports.patchSettingsGradle = patchSettingsGradle;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
module.exports.copyDirRecursive = copyDirRecursive;
module.exports.rmDirRecursive = rmDirRecursive;
module.exports.WEAR_TEMPLATE_RELATIVE = WEAR_TEMPLATE_RELATIVE;
module.exports.WEAR_PROJECT_RELATIVE = WEAR_PROJECT_RELATIVE;
