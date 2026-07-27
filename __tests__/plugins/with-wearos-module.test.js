const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  patchSettingsGradle,
  patchAppBuildGradle,
  patchProjectBuildGradle,
  copyDirRecursive,
  rmDirRecursive,
  writeFdroidManifest,
  patchFdroidExpoDependencies,
  patchFdroidSourceFiles,
  FDROID_MANIFEST_CONTENTS,
} = require("../../plugins/with-wearos-module");

// Minimal but realistic fixtures matching the shape Expo's Android template
// emits for SDK 55 (verified against `expo prebuild --platform android` on
// 2026-04-28). If this template ever changes, the plugin's anchor regex
// must also change — these tests catch that drift loudly.

const SETTINGS_FIXTURE = `rootProject.name = 'cablesnap'

apply from: new File(["node", "--print", "require.resolve('expo/package.json')"].execute(null, rootDir).text.trim(), "../scripts/autolinking.gradle");
useExpoModules()

apply from: new File(["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json')"].execute(null, rootDir).text.trim(), "../react-native.gradle");
applyNativeModulesSettingsGradle(settings)

include ':app'
includeBuild('../node_modules/@react-native/gradle-plugin')
`;

const APP_BUILD_GRADLE_FIXTURE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

android {
    ndkVersion rootProject.ext.ndkVersion

    namespace 'com.persoack.cablesnap'
    defaultConfig {
        applicationId 'com.persoack.cablesnap'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 68
        versionName "0.26.15"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.0.0")
}

apply from: new File(["node", "--print", "require.resolve('@react-native-community/cli-platform-android/package.json')"].execute(null, rootDir).text.trim(), "../native_modules.gradle");
applyNativeModulesAppBuildGradle(project)
`;

// ----------------------------------------------------------------------------
// patchSettingsGradle
// ----------------------------------------------------------------------------
describe("patchSettingsGradle", () => {
  it("appends include ':wear' with explicit projectDir", () => {
    const out = patchSettingsGradle(SETTINGS_FIXTURE);
    expect(out).toContain("include ':wear'");
    expect(out).toContain(
      "project(':wear').projectDir = new File(rootProject.projectDir, 'wear')",
    );
    // Sentinel marker is present so re-runs are idempotent.
    expect(out).toContain("// cablesnap:wearos:settings-include");
  });

  it("emits an env-gated early dependency rewrite in settings.gradle", () => {
    const previous = process.env.CABLESNAP_FDROID;
    process.env.CABLESNAP_FDROID = "1";
    const out = patchSettingsGradle(SETTINGS_FIXTURE);
    expect(out).toContain('if (System.getenv("CABLESNAP_FDROID") == "1")');
    expect(out).toContain("gradle.beforeProject { project ->");
    expect(out).toContain("com\\.google\\.firebase:");
    expect(out).toContain("com\\.android\\.installreferrer:");
    if (previous === undefined) delete process.env.CABLESNAP_FDROID;
    else process.env.CABLESNAP_FDROID = previous;
  });

  it("omits the F-Droid settings rewrite for Play prebuild", () => {
    const previous = process.env.CABLESNAP_FDROID;
    delete process.env.CABLESNAP_FDROID;
    const out = patchSettingsGradle(SETTINGS_FIXTURE);
    expect(out).not.toContain("fdroid-settings-filter");
    expect(out).not.toContain("beforeProject");
    if (previous === undefined) delete process.env.CABLESNAP_FDROID;
    else process.env.CABLESNAP_FDROID = previous;
  });

  it("does not duplicate the include block on re-run", () => {
    const once = patchSettingsGradle(SETTINGS_FIXTURE);
    const twice = patchSettingsGradle(once);
    expect(twice).toBe(once);
    // Belt-and-suspenders: count the include line.
    const occurrences = once.split("include ':wear'").length - 1;
    expect(occurrences).toBe(1);
  });

  it("preserves the existing `include ':app'` line", () => {
    const out = patchSettingsGradle(SETTINGS_FIXTURE);
    expect(out).toContain("include ':app'");
  });
});

// ----------------------------------------------------------------------------
// patchAppBuildGradle
// ----------------------------------------------------------------------------
describe("patchAppBuildGradle", () => {
  it("emits a `releaseFdroid` build type that initWith release", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    // The pivot from productFlavors to buildTypes (CEO-approved 2026-04-28)
    // is required because the Expo autolinker propagates productFlavors into
    // every Expo subproject, breaking expo-module-gradle-plugin's
    // singular-`release`-component publishing config. buildTypes are NOT
    // propagated. See plugins/with-wearos-module.js header for full
    // root-cause writeup.
    expect(out).toMatch(/buildTypes\s*\{[\s\S]*releaseFdroid\s*\{/);
    // Inheritance from `release` keeps signing/minify/shrinker config
    // single-sourced — Play <-> F-Droid drift is structurally impossible.
    expect(out).toMatch(/releaseFdroid\s*\{[\s\S]*?initWith release/);
    // matchingFallbacks lets dependency variant resolution fall back to
    // `release` for upstream singleVariant publishing.
    expect(out).toMatch(/releaseFdroid\s*\{[\s\S]*?matchingFallbacks\s*=\s*\["release"\]/);
    // Sentinel marker for idempotency.
    expect(out).toContain("// cablesnap:wearos:build-types");
  });

  it("uses debug signing for releaseFdroid without making it debuggable", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(
      /releaseFdroid\s*\{[\s\S]*?initWith release[\s\S]*?signingConfig signingConfigs\.debug/,
    );
    expect(out).not.toMatch(/releaseFdroid\s*\{[\s\S]*?debuggable\s+true/);
  });

  it("does NOT emit productFlavors or flavorDimensions", () => {
    // Regression guard: the autolinker conflict that drove the pivot must
    // never silently come back. If a future refactor reaches for flavors,
    // this test fails loudly.
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).not.toContain("flavorDimensions");
    expect(out).not.toContain("productFlavors");
    expect(out).not.toContain("playRelease");
    expect(out).not.toContain("fdroidRelease ");
  });

  it("does NOT inject -DCMAKE_BUILD_TYPE on releaseFdroid (regression guard)", () => {
    // Earlier iteration injected `externalNativeBuild { cmake { arguments
    // "-DCMAKE_BUILD_TYPE=Release" } }` as defence-in-depth. CEO + QD
    // determined on 2026-04-28 that this never reached the actually-
    // failing process (Skia subproject's CMake configure runs in the
    // library subproject's classpath, not :app's). The real fix lives in
    // patchProjectBuildGradle (beforeVariants disable). Removed to avoid
    // misleading future readers.
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).not.toContain("-DCMAKE_BUILD_TYPE");
    expect(out).not.toMatch(
      /releaseFdroid\s*\{[\s\S]*?externalNativeBuild\s*\{[\s\S]*?cmake/,
    );
  });

  it("places releaseFdroid inside the existing buildTypes { ... } block", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    const buildTypesIdx = out.indexOf("buildTypes {");
    const releaseFdroidIdx = out.indexOf("releaseFdroid {");
    const dependenciesIdx = out.indexOf("\ndependencies {");
    expect(buildTypesIdx).toBeGreaterThan(-1);
    expect(releaseFdroidIdx).toBeGreaterThan(buildTypesIdx);
    expect(releaseFdroidIdx).toBeLessThan(dependenciesIdx);
    // releaseFdroid must come AFTER the inner `release { ... }` block so
    // `initWith release` resolves to an already-defined build type.
    const releaseInnerIdx = out.indexOf(
      "release {\n            signingConfig",
    );
    expect(releaseInnerIdx).toBeGreaterThan(-1);
    expect(releaseFdroidIdx).toBeGreaterThan(releaseInnerIdx);
  });

  it("leaves dependency exclusions to the project-level patch", () => {
    expect(patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE)).not.toContain(
      "cablesnap:wearos:fdroid-excludes",
    );
  });

  it("does NOT exclude the entire androidx.camera group (regression guard)", () => {
    // androidx.camera provides camera-core / camera-camera2 / camera-lifecycle
    // / camera-view — all required for CameraView to render. A future patch
    // that reaches for `exclude group: "androidx.camera"` would silently
    // remove ALL camera functionality in F-Droid, not just the MLKit wrapper.
    // Only the specific `camera-mlkit-vision` module is safe to exclude.
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).not.toMatch(/exclude group:\s*"androidx\.camera"/);
  });

  it("is idempotent across multiple prebuilds", () => {
    const once = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    const twice = patchAppBuildGradle(once);
    const thrice = patchAppBuildGradle(twice);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });

  it("throws a clear error when the buildTypes/release anchor is missing", () => {
    expect(() => patchAppBuildGradle("// empty gradle\n")).toThrow(
      /with-wearos-module.*buildTypes.*release/,
    );
  });

  it("preserves all existing dependencies declarations", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).toContain('implementation("com.facebook.react:react-android")');
    expect(out).toContain(
      'implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.0.0")',
    );
  });

  it("preserves the existing release signingConfig line", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).toContain("signingConfig signingConfigs.debug");
  });

  it("preserves the existing release block's minify/shrinker settings", () => {
    // The whole point of `initWith release` is that we don't duplicate this
    // config — but the original release block must remain intact. If a
    // future patch accidentally rewrites the release block contents, this
    // test catches it.
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).toContain("shrinkResources enableShrinkResources.toBoolean()");
  });
});

// ----------------------------------------------------------------------------
// patchProjectBuildGradle — disable releaseFdroid variant in library subprojects
// ----------------------------------------------------------------------------
//
// Verifies the project-level android/build.gradle patch that injects a
// `subprojects { plugins.withId("com.android.library") { androidComponents {
// beforeVariants(selector().withBuildType("releaseFdroid")) { variant.enable
// = false } } } }` block. Without this patch, RN native libs (notably
// shopify/react-native-skia) hit "Skia prebuilt binaries not found!" on
// `:shopify_react-native-skia:configureCMakeRelWithDebInfo[arm64-v8a]`
// because AGP picks `RelWithDebInfo` as the CMake build type for any
// non-canonical release buildType.
//
// Initial implementation used the legacy `android.variantFilter { setIgnore
// (true) }` API. CI run 25044680026 (2026-04-28) showed that variantFilter
// does NOT drop the variant from the task graph — it's a publishing filter,
// not a configuration filter — so configureCMake* tasks still ran on the
// propagated `releaseFdroid` variant. CEO + QD aligned on the modern
// `AndroidComponentsExtension.beforeVariants` API which actually disables
// variant configuration. Available since AGP 7.0; RN 0.83 ships AGP 8.x.
const PROJECT_BUILD_GRADLE_FIXTURE = `buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 35
        ndkVersion = "27.1.12297006"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
    }
}

apply plugin: "com.facebook.react.rootproject"

allprojects {
    repositories {
        maven {
            url(new File(['node', '--print', "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim(), '../android'))
        }
        google()
        mavenCentral()
    }
}
`;

describe("patchProjectBuildGradle", () => {
  it("emits the subproject-variant-filter sentinel marker", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toContain("// cablesnap:wearos:subproject-variant-filter");
  });

  it("emits a subprojects block scoped to com.android.library", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(
      /subprojects\s*\{[\s\S]*subproject\.plugins\.withId\("com\.android\.library"\)/,
    );
  });

  it("emits gated all-project F-Droid exclusions for every SUSS group", () => {
    const previous = process.env.CABLESNAP_FDROID;
    process.env.CABLESNAP_FDROID = "1";
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(
      /if \(System\.getenv\("CABLESNAP_FDROID"\) == "1"\)\s*\{[\s\S]*allprojects\s*\{[\s\S]*configurations\.all\s*\{/,
    );
    for (const group of [
      "com.google.android.gms",
      "com.google.firebase",
      "com.google.mlkit",
      "com.android.installreferrer",
    ]) {
      expect(out).toContain(`exclude group: "${group}"`);
    }
    expect(out).toContain("resolutionStrategy.eachDependency");
    expect(out).toContain("F-Droid build rejected proprietary dependency");
    expect(out).toContain('exclude module: "camera-mlkit-vision"');
    expect(out).toContain('exclude module: "expo-wearos-bridge"');
    if (previous === undefined) delete process.env.CABLESNAP_FDROID;
    else process.env.CABLESNAP_FDROID = previous;
  });

  it("places every exclusion inside the CABLESNAP_FDROID gate", () => {
    const previous = process.env.CABLESNAP_FDROID;
    process.env.CABLESNAP_FDROID = "1";
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    const gateStart = out.indexOf('if (System.getenv("CABLESNAP_FDROID") == "1")');
    const gateEnd = out.indexOf("\n}\n", gateStart);
    const exclusions = out.indexOf('exclude group: "com.google.firebase"');
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    expect(exclusions).toBeGreaterThan(gateStart);
    expect(exclusions).toBeLessThan(gateEnd);
    if (previous === undefined) delete process.env.CABLESNAP_FDROID;
    else process.env.CABLESNAP_FDROID = previous;
  });

  it("omits F-Droid exclusions from Play prebuild output", () => {
    const previous = process.env.CABLESNAP_FDROID;
    delete process.env.CABLESNAP_FDROID;
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).not.toContain("cablesnap:wearos:fdroid-excludes");
    if (previous === undefined) delete process.env.CABLESNAP_FDROID;
    else process.env.CABLESNAP_FDROID = previous;
  });

  it("emits an androidComponents.beforeVariants selector for releaseFdroid", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(
      /androidComponents\s*\{[\s\S]*?beforeVariants\(\s*selector\(\)\.withBuildType\("releaseFdroid"\)\s*\)/,
    );
  });

  it("disables matching variants via variant.enable = false", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(/beforeVariants[\s\S]*?variant\.enable\s*=\s*false/);
  });

  it("does NOT use the legacy variantFilter / setIgnore API (regression guard)", () => {
    // The legacy `android.variantFilter { setIgnore(true) }` API is a
    // publishing filter — it does NOT drop the variant from the task graph,
    // so configureCMake* tasks still run on the propagated buildType. This
    // test guards against silently reverting to that broken approach.
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).not.toMatch(/variantFilter/);
    expect(out).not.toMatch(/setIgnore\s*\(/);
  });

  it("preserves the existing buildscript and allprojects blocks intact", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toContain('apply plugin: "com.facebook.react.rootproject"');
    expect(out).toContain("allprojects {");
    // Filter block appended after the existing top-level config — order
    // doesn't matter for `subprojects {}` but appending at end keeps the
    // template's original layout intact for diff readability.
    expect(out.indexOf("// cablesnap:wearos:subproject-variant-filter"))
      .toBeGreaterThan(out.indexOf("allprojects {"));
  });

  it("is idempotent (running twice yields the same output as running once)", () => {
    const once = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    const twice = patchProjectBuildGradle(once);
    const thrice = patchProjectBuildGradle(twice);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });
});

// ----------------------------------------------------------------------------
// copyDirRecursive / rmDirRecursive
// ----------------------------------------------------------------------------
describe("copyDirRecursive + rmDirRecursive", () => {
  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wearos-plugin-"));
  });
  afterEach(() => {
    rmDirRecursive(tmpRoot);
  });

  it("copies a nested tree exactly", () => {
    const src = path.join(tmpRoot, "src");
    const dst = path.join(tmpRoot, "dst");
    fs.mkdirSync(path.join(src, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(src, "top.txt"), "hello");
    fs.writeFileSync(path.join(src, "a", "mid.txt"), "world");
    fs.writeFileSync(path.join(src, "a", "b", "leaf.txt"), "leaf");

    copyDirRecursive(src, dst);

    expect(fs.readFileSync(path.join(dst, "top.txt"), "utf8")).toBe("hello");
    expect(fs.readFileSync(path.join(dst, "a", "mid.txt"), "utf8")).toBe(
      "world",
    );
    expect(fs.readFileSync(path.join(dst, "a", "b", "leaf.txt"), "utf8")).toBe(
      "leaf",
    );
  });

  it("rmDirRecursive wipes a stale destination cleanly", () => {
    const dst = path.join(tmpRoot, "stale");
    fs.mkdirSync(dst, { recursive: true });
    fs.writeFileSync(path.join(dst, "old.txt"), "stale");

    rmDirRecursive(dst);

    expect(fs.existsSync(dst)).toBe(false);
  });

  it("rmDirRecursive is a no-op on a missing path", () => {
    const missing = path.join(tmpRoot, "nope");
    expect(() => rmDirRecursive(missing)).not.toThrow();
  });

  it("copyDirRecursive throws a clear error if source directory is missing", () => {
    const missing = path.join(tmpRoot, "missing-src");
    const dst = path.join(tmpRoot, "dst");
    expect(() => copyDirRecursive(missing, dst)).toThrow(
      /with-wearos-module.*wear-template/,
    );
  });
});

describe("patchFdroidExpoDependencies", () => {
  it("removes direct proprietary Expo dependency sources only for F-Droid", () => {
    const previous = process.env.CABLESNAP_FDROID;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-deps-"));
    try {
      for (const [pkg, contents] of [
        ["expo-notifications", "implementation 'com.google.firebase:firebase-messaging:25.0.1'"],
        ["expo-application", "implementation 'com.android.installreferrer:installreferrer:2.2'"],
      ]) {
        const dir = path.join(tmp, "node_modules", pkg, "android");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "build.gradle"), contents, "utf8");
      }
      process.env.CABLESNAP_FDROID = "1";
      patchFdroidExpoDependencies(tmp);
      expect(fs.readFileSync(path.join(tmp, "node_modules", "expo-notifications", "android", "build.gradle"), "utf8")).not.toMatch(/com\.google\.firebase:/);
      expect(fs.readFileSync(path.join(tmp, "node_modules", "expo-application", "android", "build.gradle"), "utf8")).not.toMatch(/com\.android\.installreferrer:/);
    } finally {
      if (previous === undefined) delete process.env.CABLESNAP_FDROID;
      else process.env.CABLESNAP_FDROID = previous;
      rmDirRecursive(tmp);
    }
  });

  it("removes expo-camera barcode artifacts declared through add()", () => {
    const previous = process.env.CABLESNAP_FDROID;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-camera-"));
    try {
      const dir = path.join(tmp, "node_modules", "expo-camera", "android");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "build.gradle"),
        [
          'add(barcodeDependencyConfiguration, "com.google.android.gms:play-services-code-scanner:16.1.0")',
          'add(barcodeDependencyConfiguration, "com.google.mlkit:barcode-scanning:17.3.0")',
          'add(barcodeDependencyConfiguration, "androidx.camera:camera-mlkit-vision:1.5.1")',
        ].join("\n"),
        "utf8",
      );
      process.env.CABLESNAP_FDROID = "1";
      patchFdroidExpoDependencies(tmp);
      const out = fs.readFileSync(path.join(dir, "build.gradle"), "utf8");
      expect(out).not.toContain("play-services-code-scanner");
      expect(out).not.toContain("com.google.mlkit:barcode-scanning");
      expect(out).toContain("camera-mlkit-vision");
    } finally {
      if (previous === undefined) delete process.env.CABLESNAP_FDROID;
      else process.env.CABLESNAP_FDROID = previous;
      rmDirRecursive(tmp);
    }
  });
});

// ----------------------------------------------------------------------------
// patchFdroidSourceFiles — BLD-4226 source-level proprietary class stripping
// ----------------------------------------------------------------------------
//
// AC10b greps DEX *strings* for four proprietary class prefixes.  Prior
// approaches that only patched build.gradle files left class-name strings
// baked into compiled bytecode.  This function replaces / patches the source
// files so no proprietary imports are present at compile time.

describe("patchFdroidSourceFiles", () => {
  // Helper: create a minimal node_modules directory tree for the three
  // modules under test, populate their source files with content that
  // references proprietary classes, run patchFdroidSourceFiles, then assert.
  function withFdroidRoot(testFn) {
    const previous = process.env.CABLESNAP_FDROID;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-src-"));
    try {
      // ---- expo-camera -------------------------------------------------------
      const cameraBase = path.join(
        tmp, "node_modules", "expo-camera", "android", "src", "main", "java",
        "expo", "modules", "camera",
      );
      fs.mkdirSync(path.join(cameraBase, "analyzers"), { recursive: true });
      fs.mkdirSync(path.join(cameraBase, "records"), { recursive: true });
      fs.mkdirSync(path.join(cameraBase, "utils"), { recursive: true });

      fs.writeFileSync(path.join(cameraBase, "analyzers", "BarcodeAnalyzer.kt"),
        "package expo.modules.camera.analyzers\nimport com.google.mlkit.vision.barcode.BarcodeScanning\nclass BarcodeAnalyzer", "utf8");
      fs.writeFileSync(path.join(cameraBase, "analyzers", "MLKitBarcodeAnalyzer.kt"),
        "package expo.modules.camera.analyzers\nimport com.google.android.gms.tasks.Task\nimport com.google.mlkit.vision.barcode.BarcodeScanning\nclass MLKitBarCodeScanner", "utf8");
      fs.writeFileSync(path.join(cameraBase, "analyzers", "BarcodeScannerResultSerializer.kt"),
        "package expo.modules.camera.analyzers\nimport com.google.mlkit.vision.barcode.common.Barcode\nobject BarCodeScannerResultSerializer", "utf8");
      fs.writeFileSync(path.join(cameraBase, "records", "CameraRecords.kt"),
        "package expo.modules.camera.records\nimport com.google.mlkit.vision.barcode.common.Barcode\nval x = Barcode.FORMAT_QR_CODE", "utf8");
      fs.writeFileSync(path.join(cameraBase, "CameraViewModule.kt"),
        "package expo.modules.camera\nimport com.google.mlkit.vision.codescanner.GmsBarcodeScanning\nimport com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions\nclass CameraViewModule", "utf8");
      fs.writeFileSync(path.join(cameraBase, "utils", "CameraUtils.kt"),
        "package expo.modules.camera.utils\nobject CameraUtils {\n  fun isMLKitBarcodeScannerAvailable(): Boolean {\n    return try { Class.forName(\"com.google.mlkit.vision.barcode.BarcodeScanning\"); true } catch(_: ClassNotFoundException) { false }\n  }\n}", "utf8");

      // ---- expo-notifications ------------------------------------------------
      const notifBase = path.join(
        tmp, "node_modules", "expo-notifications", "android", "src", "main", "java",
        "expo", "modules", "notifications",
      );
      fs.mkdirSync(path.join(notifBase, "service", "delegates"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "service", "interfaces"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "tokens"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "topics"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "notifications", "debug"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "notifications", "model", "triggers"), { recursive: true });
      fs.mkdirSync(path.join(notifBase, "notifications"), { recursive: true });

      fs.writeFileSync(path.join(notifBase, "service", "ExpoFirebaseMessagingService.kt"),
        "package expo.modules.notifications.service\nimport com.google.firebase.messaging.FirebaseMessagingService\nclass ExpoFirebaseMessagingService : FirebaseMessagingService()", "utf8");
      fs.writeFileSync(path.join(notifBase, "service", "delegates", "FirebaseMessagingDelegate.kt"),
        "package expo.modules.notifications.service.delegates\nimport com.google.firebase.messaging.FirebaseMessaging\nobject FirebaseMessagingDelegate", "utf8");
      fs.writeFileSync(path.join(notifBase, "service", "interfaces", "FirebaseMessagingDelegate.kt"),
        "package expo.modules.notifications.service.interfaces\nimport com.google.firebase.messaging.RemoteMessage\ninterface FirebaseMessagingDelegate", "utf8");
      fs.writeFileSync(path.join(notifBase, "tokens", "PushTokenModule.kt"),
        "package expo.modules.notifications.tokens\nimport com.google.firebase.messaging.FirebaseMessaging\nclass PushTokenModule", "utf8");
      fs.writeFileSync(path.join(notifBase, "topics", "TopicSubscriptionModule.kt"),
        "package expo.modules.notifications.topics\nimport com.google.firebase.messaging.FirebaseMessaging\nclass TopicSubscriptionModule", "utf8");
      fs.writeFileSync(path.join(notifBase, "notifications", "debug", "DebugLogging.kt"),
        "package expo.modules.notifications.notifications.debug\nimport com.google.firebase.messaging.RemoteMessage\nobject DebugLogging", "utf8");
      fs.writeFileSync(path.join(notifBase, "notifications", "model", "RemoteNotificationContent.kt"),
        "package expo.modules.notifications.notifications.model\nimport com.google.firebase.messaging.RemoteMessage\nclass RemoteNotificationContent(val m: RemoteMessage)", "utf8");
      fs.writeFileSync(path.join(notifBase, "notifications", "model", "triggers", "FirebaseNotificationTrigger.kt"),
        "package expo.modules.notifications.notifications.model.triggers\nimport com.google.firebase.messaging.RemoteMessage\nclass FirebaseNotificationTrigger(val m: RemoteMessage)", "utf8");
      fs.writeFileSync(path.join(notifBase, "notifications", "NotificationSerializer.java"),
        [
          "import com.google.firebase.messaging.RemoteMessage;",
          "import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger;",
          "class NotificationSerializer {",
          "  void toBundle() {",
          "    if (requestTrigger instanceof FirebaseNotificationTrigger trigger) {",
          "      RemoteMessage message = trigger.getRemoteMessage();",
          "      Map<String, String> data = message.getData();",
          "    }",
          "  }",
          "}",
        ].join("\n"), "utf8");
      fs.writeFileSync(path.join(tmp, "node_modules", "expo-notifications", "expo-module.config.json"),
        JSON.stringify({ android: { modules: [
          "expo.modules.notifications.tokens.PushTokenModule",
          "expo.modules.notifications.topics.TopicSubscriptionModule",
          "expo.modules.notifications.notifications.background.ExpoBackgroundNotificationTasksModule",
          "expo.modules.notifications.SomeOtherModule",
        ] } }), "utf8");

      // ---- expo-application --------------------------------------------------
      const appBase = path.join(
        tmp, "node_modules", "expo-application", "android", "src", "main", "java",
        "expo", "modules", "application",
      );
      fs.mkdirSync(appBase, { recursive: true });
      fs.writeFileSync(path.join(appBase, "ApplicationModule.kt"),
        [
          "package expo.modules.application",
          "import com.android.installreferrer.api.InstallReferrerClient",
          "import com.android.installreferrer.api.InstallReferrerStateListener",
          "class ApplicationModule {",
          "  AsyncFunction(\"getInstallReferrerAsync\") { promise: Promise ->",
          "    val referrerClient = InstallReferrerClient.newBuilder(context).build()",
          "    referrerClient.startConnection(object : InstallReferrerStateListener {",
          "      override fun onInstallReferrerSetupFinished(responseCode: Int) { promise.resolve(responseCode) }",
          "      override fun onInstallReferrerServiceDisconnected() {}",
          "    })",
          "  }",
          "",
          "  AsyncFunction(\"getApplicationNameAsync\") { \"CableSnap\" }",
          "}",
        ].join("\n"), "utf8");

      process.env.CABLESNAP_FDROID = "1";
      patchFdroidSourceFiles(tmp);
      testFn(tmp, cameraBase, notifBase, appBase);
    } finally {
      if (previous === undefined) delete process.env.CABLESNAP_FDROID;
      else process.env.CABLESNAP_FDROID = previous;
      rmDirRecursive(tmp);
    }
  }

  it("is a no-op when CABLESNAP_FDROID is not set", () => {
    const previous = process.env.CABLESNAP_FDROID;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-noop-"));
    try {
      delete process.env.CABLESNAP_FDROID;
      // Empty tmp dir — function should not throw, not create any files.
      patchFdroidSourceFiles(tmp);
      // No directories created
      expect(fs.readdirSync(tmp)).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.CABLESNAP_FDROID;
      else process.env.CABLESNAP_FDROID = previous;
      rmDirRecursive(tmp);
    }
  });

  it("expo-camera: BarcodeAnalyzer.kt stub does NOT import mlkit", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "analyzers", "BarcodeAnalyzer.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.mlkit/);
      expect(out).not.toMatch(/com\.google\.android\.gms/);
      // Stub still declares the class
      expect(out).toMatch(/class BarcodeAnalyzer/);
    });
  });

  it("expo-camera: MLKitBarcodeAnalyzer.kt stub does NOT import mlkit or gms.tasks", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "analyzers", "MLKitBarcodeAnalyzer.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.mlkit/);
      expect(out).not.toMatch(/com\.google\.android\.gms/);
      expect(out).toMatch(/class MLKitBarCodeScanner/);
    });
  });

  it("expo-camera: BarcodeScannerResultSerializer.kt stub does NOT import Barcode", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "analyzers", "BarcodeScannerResultSerializer.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.mlkit/);
      expect(out).toMatch(/object BarCodeScannerResultSerializer/);
    });
  });

  it("expo-camera: CameraRecords.kt has Barcode import removed and FORMAT_* replaced with integers", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "records", "CameraRecords.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.mlkit/);
      // FORMAT_QR_CODE = 256
      expect(out).not.toMatch(/Barcode\.FORMAT_QR_CODE/);
      expect(out).toMatch(/256/);
    });
  });

  it("expo-camera: CameraViewModule.kt has GmsBarcodeScannerOptions import removed", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "CameraViewModule.kt"), "utf8");
      expect(out).not.toMatch(/GmsBarcodeScannerOptions/);
      expect(out).not.toMatch(/GmsBarcodeScanning/);
    });
  });

  it("expo-camera: CameraUtils.kt does NOT contain Class.forName mlkit string", () => {
    withFdroidRoot((tmp, cameraBase) => {
      const out = fs.readFileSync(
        path.join(cameraBase, "utils", "CameraUtils.kt"), "utf8");
      // The string "com.google.mlkit" must not appear in any form
      expect(out).not.toMatch(/com\.google\.mlkit/);
      expect(out).not.toMatch(/com\/google\/mlkit/);
    });
  });

  it("expo-notifications: ExpoFirebaseMessagingService.kt stub does NOT extend FirebaseMessagingService", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "service", "ExpoFirebaseMessagingService.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      expect(out).not.toMatch(/FirebaseMessagingService\(\)/);
      expect(out).toMatch(/class ExpoFirebaseMessagingService/);
    });
  });

  it("expo-notifications: FirebaseMessagingDelegate.kt stub does NOT import Firebase", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "service", "delegates", "FirebaseMessagingDelegate.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      // Stub must still expose runTaskManagerTasks (called by ExpoHandlingDelegate)
      expect(out).toMatch(/runTaskManagerTasks/);
      expect(out).toMatch(/object FirebaseMessagingDelegate/);
    });
  });

  it("expo-notifications: PushTokenModule.kt stub does NOT import FirebaseMessaging", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "tokens", "PushTokenModule.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      expect(out).toMatch(/class PushTokenModule/);
    });
  });

  it("expo-notifications: TopicSubscriptionModule.kt stub does NOT import Firebase", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "topics", "TopicSubscriptionModule.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      expect(out).toMatch(/class TopicSubscriptionModule/);
    });
  });

  it("expo-notifications: DebugLogging.kt stub does NOT import RemoteMessage", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "notifications", "debug", "DebugLogging.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      // logRemoteMessage must still exist (called by FirebaseMessagingDelegate, which we stub)
      expect(out).toMatch(/logRemoteMessage/);
    });
  });

  it("expo-notifications: RemoteNotificationContent.kt stub does NOT import RemoteMessage", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "notifications", "model", "RemoteNotificationContent.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      // Must still declare the class (used by NotificationsHandler instanceof check)
      expect(out).toMatch(/class RemoteNotificationContent/);
      expect(out).toMatch(/isDataOnly/);
    });
  });

  it("expo-notifications: FirebaseNotificationTrigger.kt stub does NOT import RemoteMessage", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "notifications", "model", "triggers", "FirebaseNotificationTrigger.kt"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase/);
      expect(out).toMatch(/class FirebaseNotificationTrigger/);
    });
  });

  it("expo-notifications: NotificationSerializer.java has Firebase import and trigger branch removed", () => {
    withFdroidRoot((tmp, _c, notifBase) => {
      const out = fs.readFileSync(
        path.join(notifBase, "notifications", "NotificationSerializer.java"), "utf8");
      expect(out).not.toMatch(/com\.google\.firebase\.messaging\.RemoteMessage/);
      expect(out).not.toMatch(/FirebaseNotificationTrigger/);
    });
  });

  it("expo-notifications: expo-module.config.json has Firebase-backed modules removed", () => {
    withFdroidRoot((tmp) => {
      const config = JSON.parse(fs.readFileSync(
        path.join(tmp, "node_modules", "expo-notifications", "expo-module.config.json"), "utf8"));
      const modules = config.android.modules;
      expect(modules).not.toContain("expo.modules.notifications.tokens.PushTokenModule");
      expect(modules).not.toContain("expo.modules.notifications.topics.TopicSubscriptionModule");
      expect(modules).not.toContain("expo.modules.notifications.notifications.background.ExpoBackgroundNotificationTasksModule");
      // Non-Firebase modules must be preserved
      expect(modules).toContain("expo.modules.notifications.SomeOtherModule");
    });
  });

  it("expo-application: ApplicationModule.kt has InstallReferrerClient import removed and getInstallReferrerAsync stubbed", () => {
    withFdroidRoot((tmp, _c, _n, appBase) => {
      const out = fs.readFileSync(
        path.join(appBase, "ApplicationModule.kt"), "utf8");
      expect(out).not.toMatch(/com\.android\.installreferrer/);
      expect(out).not.toMatch(/InstallReferrerClient/);
      // Stub must still declare the AsyncFunction with "getInstallReferrerAsync"
      expect(out).toMatch(/getInstallReferrerAsync/);
      // Other functions in the file must be preserved
      expect(out).toMatch(/getApplicationNameAsync/);
    });
  });

  it("produces ZERO proprietary class-name strings across all patched files (AC10b proxy)", () => {
    withFdroidRoot((tmp, cameraBase, notifBase, appBase) => {
      const SUSS_PATTERN = /com[\./](google[\./](firebase|mlkit|android[\./]gms)|android[\./]installreferrer)/;
      const filesToCheck = [
        path.join(cameraBase, "analyzers", "BarcodeAnalyzer.kt"),
        path.join(cameraBase, "analyzers", "MLKitBarcodeAnalyzer.kt"),
        path.join(cameraBase, "analyzers", "BarcodeScannerResultSerializer.kt"),
        path.join(cameraBase, "records", "CameraRecords.kt"),
        path.join(cameraBase, "CameraViewModule.kt"),
        path.join(cameraBase, "utils", "CameraUtils.kt"),
        path.join(notifBase, "service", "ExpoFirebaseMessagingService.kt"),
        path.join(notifBase, "service", "delegates", "FirebaseMessagingDelegate.kt"),
        path.join(notifBase, "tokens", "PushTokenModule.kt"),
        path.join(notifBase, "topics", "TopicSubscriptionModule.kt"),
        path.join(notifBase, "notifications", "debug", "DebugLogging.kt"),
        path.join(notifBase, "notifications", "model", "RemoteNotificationContent.kt"),
        path.join(notifBase, "notifications", "model", "triggers", "FirebaseNotificationTrigger.kt"),
        path.join(notifBase, "notifications", "NotificationSerializer.java"),
        path.join(appBase, "ApplicationModule.kt"),
      ];
      for (const f of filesToCheck) {
        const content = fs.readFileSync(f, "utf8");
        expect({ file: path.basename(f), content }).not.toMatchObject({
          content: expect.stringMatching(SUSS_PATTERN),
        });
      }
    });
  });
});
// ----------------------------------------------------------------------------
//
// The F-Droid build-type manifest overlay is AGP's standard mechanism for
// per-buildType manifest customization. Files at
// `android/app/src/<buildType>/AndroidManifest.xml` participate in manifest
// merging at the highest priority and can use `tools:node="remove"` to drop
// nodes contributed by other libraries.
//
// We use this to strip two manifest entries from the F-Droid APK that would
// otherwise crash the app at launch:
//   1. <provider FirebaseInitProvider> — auto-registered by firebase-common.aar,
//      runs at Application init, references excluded GMS Preconditions class.
//   2. <service ExpoFirebaseMessagingService> — declared by expo-notifications,
//      extends FirebaseMessagingService whose parent class is now missing.
describe("writeFdroidManifest + FDROID_MANIFEST_CONTENTS", () => {
  it("declares the tools namespace required by tools:node directives", () => {
    // Without xmlns:tools on the root <manifest>, AGP's manifest merger
    // logs a warning and silently ignores `tools:node="remove"` — leaving
    // the offending nodes in place. This is the exact failure mode that
    // would silently re-introduce the F-Droid crash.
    expect(FDROID_MANIFEST_CONTENTS).toMatch(
      /<manifest\b[^>]*xmlns:tools="http:\/\/schemas\.android\.com\/tools"/,
    );
  });

  it("removes FirebaseInitProvider via tools:node='remove'", () => {
    // Match across attribute order — AGP's tools:node attribute can appear
    // before or after android:authorities. We assert both the provider name
    // and the remove directive co-occur within the same <provider> element.
    expect(FDROID_MANIFEST_CONTENTS).toMatch(
      /<provider\b[\s\S]*?android:name="com\.google\.firebase\.provider\.FirebaseInitProvider"[\s\S]*?tools:node="remove"[\s\S]*?\/>/,
    );
  });

  it("removes ExpoFirebaseMessagingService via tools:node='remove'", () => {
    expect(FDROID_MANIFEST_CONTENTS).toMatch(
      /<service\b[\s\S]*?android:name="expo\.modules\.notifications\.service\.ExpoFirebaseMessagingService"[\s\S]*?tools:node="remove"[\s\S]*?\/>/,
    );
  });

  it("removes MlKitInitProvider via tools:node='remove'", () => {
    // Same crash pattern as FirebaseInitProvider — a content provider that
    // auto-runs at app start and calls into excluded GMS classes. Surfaced
    // by run 25244727127 after the Firebase fix unblocked it.
    expect(FDROID_MANIFEST_CONTENTS).toMatch(
      /<provider\b[\s\S]*?android:name="com\.google\.mlkit\.common\.internal\.MlKitInitProvider"[\s\S]*?tools:node="remove"[\s\S]*?\/>/,
    );
  });

  it("removes the dormant ModuleDependencies service from expo-image-picker (defence-in-depth)", () => {
    // expo-image-picker declares <service ModuleDependencies android:enabled="false">
    // for Google Photo Picker module-on-demand discovery. Disabled, so it
    // does not crash on launch — but stripping it eliminates a dangling
    // reference to an excluded GMS class, future-proofing against tighter
    // manifest parsing in newer Android versions.
    expect(FDROID_MANIFEST_CONTENTS).toMatch(
      /<service\b[\s\S]*?android:name="com\.google\.android\.gms\.metadata\.ModuleDependencies"[\s\S]*?tools:node="remove"[\s\S]*?\/>/,
    );
  });

  it("nests the strip directives inside <application> at the correct depth", () => {
    // AGP's manifest merger only matches removal directives when the node
    // appears at the same depth as the node it replaces. <provider> and
    // <service> live inside <application> — if we accidentally placed them
    // at the manifest root, the merger would silently no-op the removal.
    const appOpen = FDROID_MANIFEST_CONTENTS.indexOf("<application>");
    const appClose = FDROID_MANIFEST_CONTENTS.indexOf("</application>");
    const providerIdx = FDROID_MANIFEST_CONTENTS.indexOf("FirebaseInitProvider");
    const serviceIdx = FDROID_MANIFEST_CONTENTS.indexOf(
      "ExpoFirebaseMessagingService",
    );
    expect(appOpen).toBeGreaterThan(-1);
    expect(appClose).toBeGreaterThan(appOpen);
    expect(providerIdx).toBeGreaterThan(appOpen);
    expect(providerIdx).toBeLessThan(appClose);
    expect(serviceIdx).toBeGreaterThan(appOpen);
    expect(serviceIdx).toBeLessThan(appClose);
  });

  it("writeFdroidManifest creates app/src/releaseFdroid/AndroidManifest.xml at the platform root", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-manifest-"));
    try {
      writeFdroidManifest(tmp);
      const manifestPath = path.join(
        tmp,
        "app",
        "src",
        "releaseFdroid",
        "AndroidManifest.xml",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const written = fs.readFileSync(manifestPath, "utf8");
      expect(written).toBe(FDROID_MANIFEST_CONTENTS);
    } finally {
      rmDirRecursive(tmp);
    }
  });

  it("writeFdroidManifest is idempotent (overwrites existing file)", () => {
    // The withDangerousMod step that calls writeFdroidManifest runs on
    // every prebuild; it must safely clobber any prior version of the file
    // (e.g. from a previous prebuild that wrote a different overlay).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-manifest-"));
    try {
      const dir = path.join(tmp, "app", "src", "releaseFdroid");
      fs.mkdirSync(dir, { recursive: true });
      const manifestPath = path.join(dir, "AndroidManifest.xml");
      fs.writeFileSync(manifestPath, "STALE PREVIOUS PREBUILD CONTENTS", "utf8");

      writeFdroidManifest(tmp);

      const written = fs.readFileSync(manifestPath, "utf8");
      expect(written).toBe(FDROID_MANIFEST_CONTENTS);
      expect(written).not.toContain("STALE");
    } finally {
      rmDirRecursive(tmp);
    }
  });

  it("writeFdroidManifest creates intermediate directories if missing", () => {
    // A fresh `expo prebuild --clean` wipes the entire android/ directory.
    // The plugin must create app/src/releaseFdroid/ from scratch — not
    // assume any parent directory already exists.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fdroid-manifest-"));
    try {
      writeFdroidManifest(tmp);
      expect(
        fs.existsSync(path.join(tmp, "app", "src", "releaseFdroid")),
      ).toBe(true);
    } finally {
      rmDirRecursive(tmp);
    }
  });
});
