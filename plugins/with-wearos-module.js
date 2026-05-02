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
 * - §"F-Droid + Play split (TL-2)" (PIVOTED — see Implementation Addendum in
 *   PLAN-BLD-716.md): emit a `buildTypes { releaseFdroid { initWith release } }`
 *   block under `android { ... }` in `android/app/build.gradle`. The
 *   `releaseFdroid` build type:
 *     - Inherits all signing config / minify / shrinker settings from `release`
 *       (Play build path) — no duplication, no drift.
 *     - Has GMS Wearable + the Wear bridge module excluded via
 *       `configurations { releaseFdroidImplementation { exclude ... } }` etc.
 *       AC10b verifies the resulting APK contains zero
 *       `com/google/android/gms/wearable/*` classes.
 *
 * IMPORTANT — why buildTypes, not productFlavors:
 *   The original plan called for `productFlavors { playRelease, fdroidRelease }`.
 *   That hits a structural conflict between two upstream Expo modules:
 *     1. `expo-modules-autolinking`'s `ExpoAutolinkingPlugin.kt` UNCONDITIONALLY
 *        propagates the consumer app's `flavorDimensions` + `productFlavors`
 *        into every Expo subproject (`:expo`, `:expo-modules-core`, every
 *        `:expo-*`).
 *     2. `expo-modules-core`'s `expo-module-gradle-plugin/MavenPublicationExtension.kt:39`
 *        does `project.components.getByName("release")`. With propagated
 *        flavors, AGP creates per-flavor variants and the singular `release`
 *        SoftwareComponent no longer exists → configure-time failure on
 *        `:expo` (`SoftwareComponent with name 'release' not found`).
 *   `buildTypes` are NOT propagated by the autolinker (verified: `grep -n
 *   "buildType\|BuildType"` on ExpoAutolinkingPlugin.kt returns 0 matches),
 *   so a `releaseFdroid` build type lives entirely in `:app` and produces no
 *   ripple. CEO approved this pivot 2026-04-28; AC10b semantics are
 *   bit-for-bit unchanged (still exclude-based + grep gate).
 *
 * Anchor strategy mirrors `with-release-signing.js`: every patched region is
 * fenced by a sentinel marker (`// cablesnap:wearos:*`) so re-running the
 * plugin never duplicates output. If an expected anchor is missing the
 * plugin fails loudly rather than silently producing a half-patched build.
 *
 * Flavor-aware contract: the SAME prebuild output supports both build types.
 * Selecting the F-Droid build is a Gradle invocation concern
 * (`./gradlew :app:assembleReleaseFdroid`), not a prebuild-time concern.
 * F-Droid's build server invokes Gradle with the F-Droid build type only,
 * per the `Builds: ... gradle: [releaseFdroid]` block in
 * `fdroid/metadata/com.persoack.cablesnap.yml`.
 */

const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withSettingsGradle,
  withDangerousMod,
} = require("expo/config-plugins");

// ---------------------------------------------------------------------------
// Sentinel markers — every patched region carries one so the plugin is safe
// to re-run on every `expo prebuild`.
// ---------------------------------------------------------------------------
const SETTINGS_MARKER = "// cablesnap:wearos:settings-include";
const BUILD_TYPES_MARKER = "// cablesnap:wearos:build-types";
const FDROID_EXCLUDES_MARKER = "// cablesnap:wearos:fdroid-excludes";
const SUBPROJECT_FILTER_MARKER = "// cablesnap:wearos:subproject-variant-filter";
// Sentinel for the F-Droid manifest strip that removes FirebaseInitProvider and
// ExpoFirebaseMessagingService — see FDROID_MANIFEST_CONTENTS below.
const FDROID_MANIFEST_MARKER = "<!-- cablesnap:wearos:fdroid-manifest-strip -->";

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
// app/build.gradle patch — `releaseFdroid` build type + F-Droid excludes.
// ---------------------------------------------------------------------------
//
// We inject a `releaseFdroid` BUILD TYPE (NOT a product flavor — see the
// upstream-conflict comment in the file header) inside the existing
// `android { buildTypes { ... } }` block, then add a top-level
// `configurations { releaseFdroidImplementation { exclude ... } }` block.
//
// `releaseFdroid initWith release` inherits ALL settings from the canonical
// `release` build type (signing config, minify, shrinker, proguard, crunch).
// Drift between Play and F-Droid is structurally impossible because there
// is exactly one source of truth — the existing `release` block.
//
// We intentionally do NOT change `applicationId` for F-Droid — the F-Droid
// catalog metadata uses the canonical `com.persoack.cablesnap` package id.
//
// We intentionally do NOT add `versionNameSuffix` — F-Droid's reproducible
// build server compares versionName byte-for-byte against the source tree;
// any suffix would flag the build as a non-deterministic edit.

const RELEASE_FDROID_BUILD_TYPE = `
        ${BUILD_TYPES_MARKER}
        releaseFdroid {
            // Inherit signing/minify/shrinker/proguard from the canonical
            // \`release\` build type so Play <-> F-Droid drift is impossible.
            initWith release
            // matchingFallbacks lets dependency variant resolution fall back
            // to \`release\` when an upstream library only ships a release
            // variant (the common case). Without this, Gradle errors with
            // "could not resolve releaseFdroidApiElements" against
            // expo/react-native sub-projects that publish singleVariant
            // \`release\`. Critically, this is ALSO what makes the project-
            // level \`androidComponents.beforeVariants { enable = false }\`
            // patch (see patchProjectBuildGradle) safe — when libraries
            // disable their propagated \`releaseFdroid\` variant entirely,
            // \`:app\` resolves through to each library's \`release\` variant.
            matchingFallbacks = ["release"]
        }
`;

// `configurations { ... }` blocks placed at the project script level apply to
// the whole module. The plan's AC10b is: `unzip -l app-releaseFdroid.apk |
// grep -c 'com/google/android/gms/wearable' == 0`. We hit that by:
//
//   1. Excluding GMS Wearable from every releaseFdroid* config.
//   2. Excluding the Expo Wear bridge library project (which transitively
//      pulls in GMS Wearable) from the same configs.
//
// Belt-and-suspenders across Implementation + RuntimeClasspath +
// CompileClasspath: even if Expo's autolinker adds `implementation
// project(':expo-wearos-bridge')` unconditionally, the runtime/compile
// classpath under releaseFdroid never resolves it. The bridge module's own
// `:expo-wearos-bridge` project is still configured by Gradle (cheap), but
// no classes from it land in the F-Droid APK.
const FDROID_EXCLUDES_BLOCK = `
${FDROID_EXCLUDES_MARKER}
configurations {
    releaseFdroidImplementation {
        // F-Droid Inclusion Criteria reject GMS — exclude the entire group
        // transitively from the F-Droid runtime + compile classpath.
        exclude group: "com.google.android.gms"
        // F-Droid also rejects Firebase (proprietary, GMS-dependent). Without
        // this exclusion, expo-notifications' transitive dep
        // \`com.google.firebase:firebase-messaging\` brings \`firebase-common\`
        // into the F-Droid APK, whose \`<provider android:name="com.google.firebase.provider.FirebaseInitProvider" />\`
        // (auto-registered by the firebase-common AAR manifest) runs at app
        // start and references \`com.google.android.gms.common.internal.Preconditions\`
        // — which is excluded above, producing
        // \`NoClassDefFoundError\` → app crashes before MainActivity loads.
        // CableSnap only uses local notifications (see \`lib/notifications.ts\`,
        // every API wrapped in \`require()\` + try/catch), so dropping Firebase
        // is safe: scheduled reminders + rest-complete notifications still
        // work via expo-notifications' local-notification path which does not
        // touch FirebaseMessaging at runtime. Push tokens (PushTokenModule)
        // would fail, but CableSnap doesn't use them.
        exclude group: "com.google.firebase"
        // F-Droid also rejects Google ML Kit (proprietary). \`expo-camera\`
        // pulls in \`com.google.mlkit:barcode-scanning\` for its built-in
        // barcode scanner; that drags \`com.google.mlkit:common\` whose
        // \`<provider MlKitInitProvider>\` auto-runs at app start and (same
        // pattern as Firebase) calls into the now-missing GMS Preconditions
        // class → NoClassDefFoundError → crash. Surfaced by run 25244727127.
        // Functional impact in F-Droid: barcode scanning in food search
        // (components/BarcodeScanner.tsx) won't detect codes — the camera
        // preview still renders but \`onBarcodeScanned\` never fires. Manual
        // food entry remains fully functional. Acceptable trade-off for FOSS
        // distribution; the alternative is shipping no F-Droid build at all.
        exclude group: "com.google.mlkit"
        // \`androidx.camera:camera-mlkit-vision\` is a thin wrapper around
        // ML Kit and is non-functional once \`com.google.mlkit\` is excluded.
        // Its classes reference the missing MLKit types and would throw at
        // class-load time if any UI invokes the wrapper. Excluding it as a
        // module (NOT the whole \`androidx.camera\` group, which provides
        // core camera functionality CableSnap requires) keeps the camera
        // preview working without the MLKit-dependent vision pipeline.
        exclude module: "camera-mlkit-vision"
        // Drop the Expo Wear bridge library project so its compiled
        // .class files never reach app-releaseFdroid.apk.
        exclude module: "expo-wearos-bridge"
    }
    releaseFdroidRuntimeClasspath {
        exclude group: "com.google.android.gms"
        exclude group: "com.google.firebase"
        exclude group: "com.google.mlkit"
        exclude module: "camera-mlkit-vision"
        exclude module: "expo-wearos-bridge"
    }
    releaseFdroidCompileClasspath {
        exclude group: "com.google.android.gms"
        exclude group: "com.google.firebase"
        exclude group: "com.google.mlkit"
        exclude module: "camera-mlkit-vision"
        exclude module: "expo-wearos-bridge"
    }
}
`;

function patchAppBuildGradle(contents) {
  let out = contents;

  // 1. Inject `releaseFdroid` build type inside `android { buildTypes { ... } }`.
  if (!out.includes(BUILD_TYPES_MARKER)) {
    // Anchor on the inner `release { ... }` block within buildTypes. Every
    // Expo-prebuilt app/build.gradle has exactly one. We insert immediately
    // AFTER its closing brace so `initWith release` always resolves to a
    // already-defined build type. We MUST NOT match the outer `release`
    // signingConfig (which lives in `signingConfigs { release { ... } }`),
    // so we anchor on `buildTypes {` first then look for `release {` inside.
    //
    // The regex: find `buildTypes` { ..., then within that body find a
    // `release { ... }` sub-block whose closing brace is at the same nesting
    // depth as its opening brace (we approximate this with the smallest
    // lazy match — Gradle's well-formed templates don't nest braces inside
    // `release { ... }` deeper than 1 level, so `[^{}]*\{[^{}]*\}[^{}]*`
    // captures content like `signingConfig signingConfigs.debug; ...; ... { foo }`).
    const releaseBlockRegex =
      /(buildTypes\s*\{[\s\S]*?release\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/;
    if (!releaseBlockRegex.test(out)) {
      throw new Error(
        "with-wearos-module: could not find `buildTypes { ... release { ... } }` anchor in app/build.gradle",
      );
    }
    out = out.replace(releaseBlockRegex, `$1${RELEASE_FDROID_BUILD_TYPE}`);
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
// android/build.gradle (project-level) patch — disable the `releaseFdroid`
// variant in every library subproject.
// ---------------------------------------------------------------------------
//
// AGP propagates buildTypes declared on `:app` to every library subproject
// it resolves against, just like it does for productFlavors. Each library
// subproject then synthesises its own `releaseFdroid` variant; for the
// minority of libs that ship CMake-built native code (notably
// `:shopify_react-native-skia`), AGP picks `RelWithDebInfo` as the CMake
// build type for any non-canonical release buildType. Skia hardcodes its
// prebuilt-binary path under a `release`-named directory and fails with
// "Skia prebuilt binaries not found!" on `:shopify_react-native-skia:
// configureCMakeRelWithDebInfo[...]`.
//
// Fix: disable the `releaseFdroid` variant in every library subproject so
// AGP never configures it (no CMake configure task, no dependency
// resolution, no published outputs). With `matchingFallbacks = ["release"]`
// already declared on `:app`'s `releaseFdroid` buildType, dependency
// resolution falls back to each library's `release` variant — which is
// exactly what we want (Play and F-Droid only differ in JVM-side excludes,
// never in library internals).
//
// API choice — `AndroidComponentsExtension.beforeVariants { enable = false }`:
//   The legacy `android.variantFilter { setIgnore(true) }` API does NOT drop
//   the variant from the task graph. AGP treats it as a *publishing* filter
//   (output won't be uploaded) but still configures the variant — including
//   creating its `configureCMake*` task — during the configuration phase.
//   That's exactly what we DON'T want: we need the CMake task to never
//   exist for `releaseFdroid` in library subprojects. The modern
//   `androidComponents.beforeVariants(selector) { variant.enable = false }`
//   API drops the variant before its tasks are wired in. Available since
//   AGP 7.0; RN 0.83 ships AGP 8.x. Confirmed by CEO + QD on 2026-04-28
//   after run 25044680026 surfaced the variantFilter limitation empirically.

const SUBPROJECT_FILTER_BLOCK = `
${SUBPROJECT_FILTER_MARKER}
subprojects { subproject ->
    subproject.plugins.withId("com.android.library") {
        subproject.androidComponents {
            beforeVariants(selector().withBuildType("releaseFdroid")) { variant ->
                // Drops the variant entirely — no configureCMake* task, no
                // dependency resolution, no published outputs. :app's
                // matchingFallbacks routes consumption to each library's
                // \`release\` variant.
                variant.enable = false
            }
        }
    }
}
`;

function patchProjectBuildGradle(contents) {
  if (contents.includes(SUBPROJECT_FILTER_MARKER)) {
    return contents;
  }
  // Append at end-of-file. `subprojects { ... }` blocks are
  // order-independent — Gradle accumulates and applies them in the
  // configuration phase before any subproject is evaluated.
  let out = contents;
  if (!out.endsWith("\n")) {
    out = out + "\n";
  }
  return out + SUBPROJECT_FILTER_BLOCK;
}

// ---------------------------------------------------------------------------
// withDangerousMod: copy modules/expo-wearos-bridge/wear-template → android/wear
// ---------------------------------------------------------------------------
//
// `withDangerousMod` runs after the Android template has been written. We
// recursively copy the wear-template directory into the prebuild output. If
// `android/wear` already exists from a previous prebuild, we wipe it first to
// avoid stale files (e.g. if the template renamed a file between prebuilds).

// ---------------------------------------------------------------------------
// F-Droid build-type-specific manifest — strip Firebase manifest contributors.
// ---------------------------------------------------------------------------
//
// AGP merges manifests from the consumer app + every AAR/library subproject.
// `expo-notifications` declares `<service ExpoFirebaseMessagingService>` in
// its own manifest, and the transitively-pulled `firebase-common.aar`
// declares `<provider FirebaseInitProvider>`. The F-Droid build excludes the
// `com.google.firebase` group at the classpath level (see
// FDROID_EXCLUDES_BLOCK), but AGP's manifest merger may still surface stale
// `<provider>` / `<service>` declarations from the build cache or from
// `expo-notifications`'s own AAR (which references the now-missing
// `FirebaseMessagingService` parent class).
//
// AGP's `src/<buildType>/AndroidManifest.xml` is an *overlay* that participates
// in manifest merging with the highest priority (AGP 8.x manifest merger
// reference: "Build type manifests are merged AFTER product flavor manifests
// AFTER main manifest"). The `tools:node="remove"` directive deletes a node
// from the merged output; combined with `tools:selector` it targets a specific
// manifest contributor. We don't need a selector here because the node-name
// + node-attribute pair (`<provider android:name="...FirebaseInitProvider"/>`,
// `<service android:name="...ExpoFirebaseMessagingService"/>`) uniquely
// identifies the entries we want to remove.
//
// `tools:node="remove"` requires the `xmlns:tools` namespace declared on the
// root `<manifest>` element. The `<application>` wrapper here is not actually
// merged as new content — it exists only so `<provider>` / `<service>` are
// nested at the correct depth for the merger.
const FDROID_MANIFEST_CONTENTS = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    ${FDROID_MANIFEST_MARKER}
    <application>
        <!-- firebase-common.aar — auto-runs at app start, calls into excluded
             com.google.android.gms.common.internal.Preconditions. Removing
             this provider prevents NoClassDefFoundError on F-Droid launch. -->
        <provider
            android:name="com.google.firebase.provider.FirebaseInitProvider"
            android:authorities="\${applicationId}.firebaseinitprovider"
            tools:node="remove" />

        <!-- expo-notifications declares this service inheriting from
             FirebaseMessagingService. With Firebase excluded the parent
             class is missing; AGP's class verifier on Android 14+ rejects
             the manifest entry. Strip it — push tokens (which would use it)
             aren't reachable in F-Droid anyway. CableSnap's local-notification
             code path (lib/notifications.ts) does not touch this service. -->
        <service
            android:name="expo.modules.notifications.service.ExpoFirebaseMessagingService"
            tools:node="remove" />

        <!-- mlkit-common.aar — same crash pattern as FirebaseInitProvider.
             Auto-registered \`<provider MlKitInitProvider>\` runs during
             Application init (installContentProviders frame in the stack)
             and calls \`com.google.android.gms.common.internal.Preconditions\`
             on its very first line. With \`com.google.mlkit\` excluded the
             provider class itself is gone, but the manifest entry survives
             AGP's manifest merger because AAR manifests get merged before
             classpath resolution. tools:node="remove" deletes the entry
             from the merged output so installProvider() never tries to
             instantiate the missing class. Surfaced by run 25244727127. -->
        <provider
            android:name="com.google.mlkit.common.internal.MlKitInitProvider"
            android:authorities="\${applicationId}.mlkitinitprovider"
            tools:node="remove" />

        <!-- expo-image-picker declares \`<service ModuleDependencies>\` for
             Google Photo Picker module-on-demand discovery. The declaration
             carries \`android:enabled="false"\` so the service is never
             actually instantiated, AND \`tools:ignore="MissingClass"\` to
             keep AGP's lint quiet. It would not crash on launch (the
             service is dormant), but stripping it for F-Droid removes a
             dangling reference to an excluded GMS class — defence-in-depth
             against any future Android version that tightens its parser. -->
        <service
            android:name="com.google.android.gms.metadata.ModuleDependencies"
            tools:node="remove" />
    </application>
</manifest>
`;

function writeFdroidManifest(platformRoot) {
  const dir = path.join(platformRoot, "app", "src", "releaseFdroid");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "AndroidManifest.xml"), FDROID_MANIFEST_CONTENTS, "utf8");
}

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

  // 3. Patch project-level android/build.gradle: drop `releaseFdroid` from
  //    library subprojects so AGP doesn't synthesise CMake configure tasks
  //    for it. See the SUBPROJECT_FILTER_BLOCK comment above.
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `with-wearos-module: expected Groovy project build.gradle, got ${cfg.modResults.language}`,
      );
    }
    cfg.modResults.contents = patchProjectBuildGradle(cfg.modResults.contents);
    return cfg;
  });

  // 4. Copy wear-template → android/wear, and write the F-Droid build-type
  //    manifest overlay that strips Firebase manifest contributors. Both
  //    operations live in the same withDangerousMod step because they share
  //    `platformProjectRoot` and want a single regen-cycle on prebuild.
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
      // Write/overwrite the F-Droid manifest overlay. Idempotent — same
      // contents every prebuild — so safe to clobber unconditionally.
      writeFdroidManifest(platformRoot);
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
module.exports.patchProjectBuildGradle = patchProjectBuildGradle;
module.exports.copyDirRecursive = copyDirRecursive;
module.exports.rmDirRecursive = rmDirRecursive;
module.exports.writeFdroidManifest = writeFdroidManifest;
module.exports.FDROID_MANIFEST_CONTENTS = FDROID_MANIFEST_CONTENTS;
module.exports.WEAR_TEMPLATE_RELATIVE = WEAR_TEMPLATE_RELATIVE;
module.exports.WEAR_PROJECT_RELATIVE = WEAR_PROJECT_RELATIVE;
