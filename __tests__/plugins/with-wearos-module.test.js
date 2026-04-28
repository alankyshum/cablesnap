const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  patchSettingsGradle,
  patchAppBuildGradle,
  patchProjectBuildGradle,
  copyDirRecursive,
  rmDirRecursive,
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

  it("emits releaseFdroid excludes for com.google.android.gms and the bridge module", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    expect(out).toContain("// cablesnap:wearos:fdroid-excludes");
    // Each of the three configurations names must carry both excludes —
    // this is the core AC10b safeguard. Belt-and-suspenders across
    // Implementation + RuntimeClasspath + CompileClasspath.
    for (const cfg of [
      "releaseFdroidImplementation",
      "releaseFdroidRuntimeClasspath",
      "releaseFdroidCompileClasspath",
    ]) {
      const blockRegex = new RegExp(
        `${cfg}\\s*\\{[\\s\\S]*?exclude group: "com\\.google\\.android\\.gms"[\\s\\S]*?exclude module: "expo-wearos-bridge"[\\s\\S]*?\\}`,
      );
      expect(out).toMatch(blockRegex);
    }
  });

  it("places the configurations excludes block at top level, before dependencies", () => {
    const out = patchAppBuildGradle(APP_BUILD_GRADLE_FIXTURE);
    const excludesIdx = out.indexOf("// cablesnap:wearos:fdroid-excludes");
    const depsIdx = out.indexOf("\ndependencies {");
    expect(excludesIdx).toBeGreaterThan(-1);
    expect(depsIdx).toBeGreaterThan(excludesIdx);
    // It must NOT be nested inside the android { ... } block.
    const androidClose = out.indexOf("\n}\n", out.indexOf("android {"));
    expect(excludesIdx).toBeGreaterThan(androidClose);
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

  it("throws a clear error when the dependencies anchor is missing", () => {
    // Fixture has buildTypes/release but no top-level `dependencies {`.
    const noDeps = `apply plugin: "com.android.application"
android {
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}
`;
    expect(() => patchAppBuildGradle(noDeps)).toThrow(
      /with-wearos-module.*dependencies/,
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
// patchProjectBuildGradle — drop releaseFdroid from library subprojects
// ----------------------------------------------------------------------------
//
// Verifies the project-level android/build.gradle patch that injects a
// `subprojects { android.variantFilter { ... setIgnore(true) } }` block to
// keep AGP from synthesising the propagated `releaseFdroid` buildType in
// every library subproject. Without this patch, RN native libs (notably
// shopify/react-native-skia) hit "Skia prebuilt binaries not found!" on
// `:shopify_react-native-skia:configureCMakeRelWithDebInfo[arm64-v8a]`
// because AGP picks `RelWithDebInfo` for non-canonical release buildTypes.
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

  it("filters out variants whose buildType is releaseFdroid via setIgnore(true)", () => {
    const out = patchProjectBuildGradle(PROJECT_BUILD_GRADLE_FIXTURE);
    expect(out).toMatch(
      /variantFilter\s*\{[\s\S]*?variant\.buildType\.name\s*==\s*"releaseFdroid"[\s\S]*?setIgnore\(true\)/,
    );
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
