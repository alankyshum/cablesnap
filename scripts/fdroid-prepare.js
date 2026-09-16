#!/usr/bin/env node
// Run from the repo root in this order (npm/Expo remain recipe-owned steps):
//   node scripts/fdroid-prepare.js init
//   npm install
//   node scripts/fdroid-prepare.js prebuild-deps
//   CABLESNAP_FDROID=1 CI=true npx expo prebuild -p android --clean
//   FDROID_VERCODE=<code> FDROID_ARCH=<abi> node scripts/fdroid-prepare.js prebuild
// Keep CABLESNAP_FDROID=1 on the subsequent Gradle build too.

const fs = require("fs");
const path = require("path");

const wearGradleFiles = [
  "android/wear/build.gradle.kts",
  "modules/expo-wearos-bridge/wear-template/build.gradle.kts",
];

function log(message) {
  console.log(`fdroid-prepare: ${message}`);
}

function requireFile(file) {
  if (!fs.existsSync(file)) throw new Error(`required file missing: ${file}`);
}

function edit(file, transform, action, required = false) {
  if (required) requireFile(file);
  if (!fs.existsSync(file)) {
    log(`skip missing ${file}`);
    return;
  }
  fs.writeFileSync(file, transform(fs.readFileSync(file, "utf8")), "utf8");
  log(`${action}: ${file}`);
}

function remove(file) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    log(`remove ${file}`);
  } else {
    log(`skip missing ${file}`);
  }
}

function init() {
  edit("package.json", (text) => {
    const pkg = JSON.parse(text);
    for (const name of ["expo-dev-client", "victory-native", "@sentry/react-native"]) {
      delete pkg.dependencies?.[name];
    }
    delete pkg.optionalDependencies?.["@shopify/react-native-skia"];
    (pkg.scripts ??= {}).postinstall = "npx --no-install patch-package";
    pkg.expo ??= {};
    pkg.expo.autolinking ??= {};
    pkg.expo.autolinking.android ??= {};
    pkg.expo.autolinking.android.buildFromSource = [".*"];
    return `${JSON.stringify(pkg, null, 2)}\n`;
  }, "remove non-FOSS/dev dependencies; set postinstall and source autolinking", true);
  remove("patches/@shopify+react-native-skia+2.6.2.patch");
  edit("modules/expo-wearos-bridge/expo-module.config.json", (text) => {
    const config = JSON.parse(text);
    config.platforms = [];
    return `${JSON.stringify(config, null, 2)}\n`;
  }, "disable Wear bridge autolinking");
}

function patchJava21(text, includeJvmTarget = false) {
  return text.replace(/^.*(?:\r?\n|$)/gm, (line) => {
    if (/jvmToolchain|JavaVersion/.test(line) || (includeJvmTarget && /jvmTarget/.test(line))) {
      return line.replace(/(?<![\w])17(?![\w])|(?<=VERSION_)17\b/g, "21");
    }
    return line;
  });
}

function prebuildDeps() {
  const root = "node_modules/@react-native/gradle-plugin";
  if (!fs.existsSync(root)) {
    log(`skip missing ${root}`);
    return;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      edit(path.join(root, entry.name, "build.gradle.kts"), patchJava21, "set Java toolchain to 21");
    }
  }
  edit(path.join(root, "react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt"),
    patchJava21, "set Java alignment to 21");
}

function patchAppConfig(text, versionCode) {
  // The generated Groovy defaultConfig has a literal versionCode, before any nested blocks.
  const version = /(^[ \t]*defaultConfig[ \t]*\{[^{}]*?\bversionCode[ \t]+(?:=[ \t]*)?)\d+\b/m;
  if (!version.test(text)) {
    throw new Error("numeric versionCode missing from android/app/build.gradle defaultConfig");
  }
  let out = text.replace(version, (_, prefix) => `${prefix}${versionCode}`);
  const split = /^[ \t]*def enableSeparateBuildPerCPUArchitecture[ \t]*=[^\r\n]*/m;
  const declaration = "def enableSeparateBuildPerCPUArchitecture = true";
  out = split.test(out) ? out.replace(split, declaration) : `${declaration}\n${out}`;
  return out.replace(/^[^\r\n]*\bsigningConfig[ \t]+[^\r\n]*(?:\r?\n|$)/gm, "");
}

function prebuild() {
  const appGradle = "android/app/build.gradle";
  requireFile(appGradle);
  const { FDROID_VERCODE: versionCode, FDROID_ARCH: arch } = process.env;
  if (!/^[1-9]\d*$/.test(versionCode ?? "") || Number(versionCode) > 2100000000) {
    throw new Error("FDROID_VERCODE is required and must be an integer from 1 to 2100000000");
  }
  if (!["armeabi-v7a", "arm64-v8a", "x86", "x86_64"].includes(arch)) {
    throw new Error("FDROID_ARCH is required: armeabi-v7a | arm64-v8a | x86 | x86_64");
  }
  // Validate the generated anchor before any dependency/tree mutations.
  patchAppConfig(fs.readFileSync(appGradle, "utf8"), versionCode);
  // Plugin sanitizers are env-gated; this dedicated command must not silently no-op.
  process.env.CABLESNAP_FDROID = "1";
  const plugin = require("../plugins/with-wearos-module");
  plugin.patchFdroidExpoDependencies(process.cwd());
  log("apply F-Droid Expo dependency patches");
  plugin.patchFdroidLibrarySources(process.cwd(), {
    removeGeneratedArtifacts: false,
    rewriteSources: false,
  });
  log("apply F-Droid library patches (preserve generated artifacts and sources)");
  plugin.patchFdroidAndroidGradleTree("android");
  log("sanitize generated Android Gradle tree");
  edit(appGradle, plugin.patchAppBuildGradle, "apply F-Droid app Gradle patches", true);
  for (const file of [...wearGradleFiles, "modules/expo-wearos-bridge/android/build.gradle"]) {
    edit(file, (text) => text.replace(/^[^\r\n]*play-services-wearable[^\r\n]*(?:\r?\n|$)/gm, ""),
      "remove play-services-wearable");
  }
  remove("public/canvaskit.wasm");
  edit(appGradle, (text) => patchAppConfig(text, versionCode),
    `set versionCode=${versionCode}, enable ABI splits, remove signingConfig`, true);
  edit("android/gradle.properties", (text) => {
    const cleaned = text.replace(/^[ \t]*reactNativeArchitectures[ \t]*=[^\r\n]*(?:\r?\n|$)/gm, "");
    return `${cleaned}${cleaned && !cleaned.endsWith("\n") ? "\n" : ""}reactNativeArchitectures=${arch}\n`;
  }, `set reactNativeArchitectures=${arch}`);
  for (const file of wearGradleFiles) {
    edit(file, (source) => patchJava21(source, true), "set Wear Java/Kotlin targets to 21");
  }
}

// Runnable regression check without touching files:
// node -e 'const a=require("node:assert/strict"),p=require("./scripts/fdroid-prepare"); a.equal(p.patchJava21("jvmToolchain(17)\nJavaVersion.VERSION_17\nother=17"),"jvmToolchain(21)\nJavaVersion.VERSION_21\nother=17"); a.match(p.patchAppConfig("defaultConfig {\nversionCode 186\n}","186001"),/versionCode 186001/);'
module.exports = { patchJava21, patchAppConfig };

if (require.main === module) {
  const commands = { init, "prebuild-deps": prebuildDeps, prebuild };
  const command = process.argv[2];
  if (process.argv.length !== 3 || !Object.hasOwn(commands, command)) {
    console.error("Usage: node scripts/fdroid-prepare.js <init|prebuild-deps|prebuild>\nprebuild requires FDROID_VERCODE and FDROID_ARCH.");
    process.exitCode = 1;
  } else {
    try {
      commands[command]();
    } catch (error) {
      console.error(`fdroid-prepare: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
