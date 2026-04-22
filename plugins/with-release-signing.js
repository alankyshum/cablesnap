/* eslint-disable */
/**
 * Expo config plugin: with-release-signing
 *
 * Patches the generated `android/app/build.gradle` to support signing release
 * builds with a persistent production keystore.
 *
 * Behavior:
 *   - Adds a top-of-file block that loads `android/keystore.properties` if it
 *     exists. In CI, the scheduled-release workflow writes this file from
 *     GitHub Actions secrets.
 *   - Registers a `release` entry under `signingConfigs { ... }` that reads
 *     from the loaded properties.
 *   - Rewrites `buildTypes.release.signingConfig` to use `signingConfigs.release`
 *     when the properties file is present; otherwise falls back to the existing
 *     `signingConfigs.debug` so local `./gradlew assembleRelease` still works
 *     for smoke tests (the resulting APK will NOT be publishable).
 *
 * This plugin runs on every `expo prebuild`, so the edits are idempotent and
 * safe to re-apply.
 */

const { withAppBuildGradle } = require("expo/config-plugins");

const LOAD_PROPS_MARKER = "// cablesnap:release-signing:load-properties";
const SIGNING_CONFIG_MARKER = "// cablesnap:release-signing:signing-config";
const BUILD_TYPE_MARKER = "// cablesnap:release-signing:build-type";

const LOAD_PROPS_BLOCK = `
${LOAD_PROPS_MARKER}
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const SIGNING_CONFIG_BLOCK = `        release {
            ${SIGNING_CONFIG_MARKER}
            if (keystoreProperties['storeFile']) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

function patchBuildGradle(contents) {
  let out = contents;

  // 1. Load properties at top of file (after `apply plugin` lines).
  if (!out.includes(LOAD_PROPS_MARKER)) {
    const applyPluginRegex = /(apply plugin:\s*"com\.facebook\.react"\s*\n)/;
    if (applyPluginRegex.test(out)) {
      out = out.replace(applyPluginRegex, `$1${LOAD_PROPS_BLOCK}`);
    } else {
      throw new Error(
        "with-release-signing: could not find `apply plugin: \"com.facebook.react\"` anchor in build.gradle",
      );
    }
  }

  // 2. Add `release` signingConfig next to the existing `debug` one.
  //    Match the signingConfigs { debug { ... } } block; insert `release` before the closing brace.
  if (!out.includes(SIGNING_CONFIG_MARKER)) {
    const signingConfigsRegex =
      /(signingConfigs\s*\{\s*\n\s*debug\s*\{[\s\S]*?\n\s*\}\s*\n)(\s*\})/;
    if (signingConfigsRegex.test(out)) {
      out = out.replace(signingConfigsRegex, `$1${SIGNING_CONFIG_BLOCK}$2`);
    } else {
      throw new Error(
        "with-release-signing: could not find `signingConfigs { debug { ... } }` anchor in build.gradle",
      );
    }
  }

  // 3. Rewrite `buildTypes.release.signingConfig` to pick `release` when
  //    properties are present, else fall back to debug.
  if (!out.includes(BUILD_TYPE_MARKER)) {
    const releaseSigningRegex =
      /signingConfig signingConfigs\.debug(\s*\n\s*def enableShrinkResources)/;
    if (releaseSigningRegex.test(out)) {
      const replacement =
        `signingConfig keystoreProperties['storeFile'] ? signingConfigs.release : signingConfigs.debug ${BUILD_TYPE_MARKER}$1`;
      out = out.replace(releaseSigningRegex, replacement);
    } else {
      throw new Error(
        "with-release-signing: could not find release `signingConfig signingConfigs.debug` anchor in build.gradle",
      );
    }
  }

  return out;
}

const withReleaseSigning = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `with-release-signing: expected Groovy build.gradle, got ${cfg.modResults.language}`,
      );
    }
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
};

module.exports = withReleaseSigning;
module.exports.patchBuildGradle = patchBuildGradle;
