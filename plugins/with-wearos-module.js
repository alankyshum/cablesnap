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
const FDROID_SETTINGS_MARKER = "// cablesnap:wearos:fdroid-settings-filter";
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

const FDROID_SETTINGS_BLOCK = `
${FDROID_SETTINGS_MARKER}
if (System.getenv("CABLESNAP_FDROID") == "1") {
    gradle.beforeProject { project ->
        if (project == gradle.rootProject || !project.buildFile.exists()) return
        def buildFile = project.buildFile
        def original = buildFile.getText("UTF-8")
        def patched = original
            .replaceAll(/(?m)^\\s*(?:implementation|api|compileOnly|debugOnly)\\s*\\(?\\s*["'](?:com\\.google\\.firebase|com\\.android\\.installreferrer|com\\.google\\.mlkit|com\\.google\\.android\\.gms):[^\\r\\n]+["']\\s*\\)?\\s*\\r?\\n?/, "")
            // SUSS groups covered: com\\.google\\.firebase: and
            // com\\.android\\.installreferrer: (kept in this comment so
            // generated diagnostics remain explicit).
        // Proprietary declarations are removed above for F-Droid. Do not
        // retain them as compileOnly: releaseFdroid can inherit those
        // declarations through variant fallback and package their classes.
        if (patched != original) buildFile.setText(patched, "UTF-8")
    }
}
`;

function patchSettingsGradle(contents) {
  if (
    contents.includes(SETTINGS_MARKER) &&
    (process.env.CABLESNAP_FDROID !== "1" || contents.includes(FDROID_SETTINGS_MARKER))
  ) {
    return contents;
  }
  // Append at the end of settings.gradle. Order doesn't matter for
  // `include` calls — Gradle accumulates them all before evaluating
  // subprojects.
  let out = contents;
  if (!out.endsWith("\n")) {
    out = out + "\n";
  }
  if (!out.includes(SETTINGS_MARKER)) out += SETTINGS_BLOCK;
  if (
    process.env.CABLESNAP_FDROID === "1" &&
    !out.includes(FDROID_SETTINGS_MARKER)
  ) {
    out += FDROID_SETTINGS_BLOCK;
  }
  return out;
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
            // F-Droid buildservers have no production keystore. Keep this
            // variant non-debuggable while allowing fdroidserver to replace
            // the debug signature with its own signing key.
            signingConfig signingConfigs.debug
            // The F-Droid graph keeps some Expo library code compile-only so
            // native compilation still succeeds. R8 is required here to
            // discard those unreachable compile-only classes from the final
            // dex; the Play release keeps its existing shrinker settings.
            minifyEnabled true
            shrinkResources true
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
            // R8 -dontwarn rules for GMS/MLKit/installreferrer classes that
            // are excluded from the F-Droid classpath but still referenced in
            // Expo library bytecode signatures. Without these rules R8 fails
            // with "Missing classes detected" during minifyReleaseFdroidWithR8.
            // Written to android/app/ by the Config Plugin's withDangerousMod.
            proguardFiles 'fdroid-r8-rules.pro'
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
if (System.getenv("CABLESNAP_FDROID") == "1") {
    allprojects {
        configurations.all {
            exclude group: "com.google.android.gms"
            exclude group: "com.google.firebase"
            exclude group: "com.google.mlkit"
            exclude group: "com.android.installreferrer"
            exclude module: "camera-mlkit-vision"
            exclude module: "expo-wearos-bridge"
            resolutionStrategy.eachDependency { dependency ->
                if (dependency.requested.group in [
                    "com.google.android.gms",
                    "com.google.firebase",
                    "com.google.mlkit",
                    "com.android.installreferrer",
                ]) {
                    throw new GradleException("F-Droid build rejected proprietary dependency: \${dependency.requested}")
                }
            }
        }
    }
}
`;

// The app's releaseFdroid configuration can consume a library's release
// variant via matchingFallbacks. Keep the exclusions on the app itself too;
// project-level exclusions do not reliably propagate across that fallback.
const FDROID_APP_EXCLUDES_BLOCK = `
${FDROID_EXCLUDES_MARKER}:app
if (System.getenv("CABLESNAP_FDROID") == "1") {
    configurations.configureEach {
        exclude group: "com.google.android.gms"
        exclude group: "com.google.firebase"
        exclude group: "com.google.mlkit"
        exclude group: "com.android.installreferrer"
        exclude module: "camera-mlkit-vision"
    }
    configurations.matching { it.name.toLowerCase().contains("releasefdroid") }.configureEach {
        // Explicitly bind the excludes to the F-Droid variant. This remains
        // effective when AGP resolves an Expo library through matchingFallbacks
        // to its release variant.
        exclude group: "com.google.android.gms"
        exclude group: "com.google.firebase"
        exclude group: "com.google.mlkit"
        exclude group: "com.android.installreferrer"
        exclude module: "camera-mlkit-vision"
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

  if (
    process.env.CABLESNAP_FDROID === "1" &&
    !out.includes(`${FDROID_EXCLUDES_MARKER}:app`)
  ) {
    out += FDROID_APP_EXCLUDES_BLOCK;
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
  let out = contents;
  if (contents.includes(SUBPROJECT_FILTER_MARKER)) {
    if (
      contents.includes(FDROID_EXCLUDES_MARKER) ||
      process.env.CABLESNAP_FDROID !== "1"
    ) {
      return contents;
    }
    return contents + FDROID_EXCLUDES_BLOCK;
  }
  // Append at end-of-file. `subprojects { ... }` blocks are
  // order-independent — Gradle accumulates and applies them in the
  // configuration phase before any subproject is evaluated.
  if (!out.endsWith("\n")) {
    out = out + "\n";
  }
  return (
    out +
    (process.env.CABLESNAP_FDROID === "1" ? FDROID_EXCLUDES_BLOCK : "") +
    SUBPROJECT_FILTER_BLOCK
  );
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

// Copy the canonical F-Droid R8 rules into the generated Android app. This is
// deliberately done during prebuild so a clean native regeneration cannot
// drop the rules required by the dependency-free releaseFdroid classpath.
function writeFdroidR8Rules(projectRoot, platformRoot) {
  const src = path.join(projectRoot, "fdroid", "fdroid-r8-rules.pro");
  const dst = path.join(platformRoot, "app", "fdroid-r8-rules.pro");
  if (!fs.existsSync(src)) {
    throw new Error(
      `with-wearos-module: fdroid/fdroid-r8-rules.pro not found at ${src} — ` +
      "the F-Droid R8 rules file must exist in the project root's fdroid/ directory.",
    );
  }
  fs.copyFileSync(src, dst);
}

function patchFdroidExpoDependencies(projectRoot) {
  if (process.env.CABLESNAP_FDROID !== "1") return;
  const replacements = [
    [
      path.join(projectRoot, "node_modules", "expo-notifications", "android", "build.gradle"),
      [
        ["implementation 'com.google.firebase:", "compileOnly 'com.google.firebase:"],
        ['implementation "com.google.firebase:', 'compileOnly "com.google.firebase:'],
      ],
    ],
    [
      path.join(projectRoot, "node_modules", "expo-application", "android", "build.gradle"),
      [
        ["implementation 'com.android.installreferrer:", "compileOnly 'com.android.installreferrer:"],
        ['implementation "com.android.installreferrer:', 'compileOnly "com.android.installreferrer:'],
      ],
    ],
    [
      path.join(projectRoot, "node_modules", "expo-camera", "android", "build.gradle"),
      [
        ["add(barcodeDependencyConfiguration, \"com.google.android.gms:play-services-code-scanner:16.1.0\")", "// F-Droid: barcode scanner replaced by expo-foss-barcode-scanner"],
        ["add(barcodeDependencyConfiguration, \"com.google.mlkit:barcode-scanning:17.3.0\")", "// F-Droid: barcode scanner replaced by expo-foss-barcode-scanner"],
        ["add(barcodeDependencyConfiguration, \"androidx.camera:camera-mlkit-vision:${camerax_version}\")", "// F-Droid: barcode scanner replaced by expo-foss-barcode-scanner; camera-mlkit-vision removed"],
      ],
    ],
  ];
  for (const [file, fileReplacements] of replacements) {
    if (!fs.existsSync(file)) continue;
    let contents = fs.readFileSync(file, "utf8");
    for (const [from, to] of fileReplacements) contents = contents.replaceAll(from, to);
    if (process.env.CABLESNAP_FDROID === "1") {
      contents = contents
        .replace(/^\s*(?:implementation|api|compileOnly|debugOnly)\s*\(?\s*["'](?:com\.google\.firebase|com\.android\.installreferrer|com\.google\.mlkit|com\.google\.android\.gms):[^\r\n]+["']\s*\)?\s*\r?\n?/gm, "")
        .replace(/^\s*add\(barcodeDependencyConfiguration,\s*["'](?:com\.google\.android\.gms|com\.google\.mlkit|androidx\.camera):[^\r\n]+\r?\n?/gm, "");
    }
    fs.writeFileSync(file, contents, "utf8");
  }

  // expo-camera declares barcode artifacts with Gradle's `add()` helper,
  // not ordinary implementation/api lines. Remove those declarations rather
  // than relying on compileOnly or configuration excludes, both of which can
  // leak into the releaseFdroid variant through variant fallback.
  const cameraGradle = path.join(
    projectRoot,
    "node_modules",
    "expo-camera",
    "android",
    "build.gradle",
  );
  if (fs.existsSync(cameraGradle)) {
    const contents = fs.readFileSync(cameraGradle, "utf8");
    const patched = contents.replace(
      /^\s*add\(barcodeDependencyConfiguration,\s*["'](?:com\.google\.android\.gms|com\.google\.mlkit):[^\r\n]+\r?\n?/gm,
      "",
    );
    fs.writeFileSync(cameraGradle, patched, "utf8");
  }

  // Expo packages that are not part of the primary three-module patch can
  // still contribute debugOnly/releaseCompileOnly declarations.  Those
  // configurations may participate in AGP's variant graph and leak classes
  // into releaseFdroid, so sanitize every installed Expo Android build file.
  const expoModules = path.join(projectRoot, "node_modules");
  if (fs.existsSync(expoModules)) {
    for (const packageName of fs.readdirSync(expoModules)) {
      if (!packageName.startsWith("expo-")) continue;
      const androidDir = path.join(expoModules, packageName, "android");
      if (!fs.existsSync(androidDir)) continue;
      const stack = [androidDir];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const target = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(target);
          else if (entry.name === "build.gradle" || entry.name === "build.gradle.kts") {
            const source = fs.readFileSync(target, "utf8");
            const sanitized = source
              .replace(/^\s*(?:implementation|api|compileOnly|releaseCompileOnly|debugOnly|releaseOnly|runtimeOnly)\s*\(?\s*["'](?:com\.google\.firebase|com\.android\.installreferrer|com\.google\.mlkit|com\.google\.android\.gms):[^\r\n]+["']\s*\)?\s*\r?\n?/gm, "")
              .replace(/^\s*add\([^\n]*(?:com\.google\.android\.gms|com\.google\.mlkit):[^\n]*\r?\n?/gm, "");
            if (sanitized !== source) fs.writeFileSync(target, sanitized, "utf8");
          }
        }
      }
    }
  }

  // The Expo Android publisher artifacts include local Maven POM/module
  // metadata. Gradle can resolve those metadata files even after the source
  // build.gradle has been sanitized, reintroducing the original optional
  // artifacts through the publication graph. Remove the banned dependency
  // entries from both metadata formats before dependency resolution.
  scrubFdroidLocalMavenMetadata(projectRoot);
}

function scrubFdroidLocalMavenMetadata(projectRoot) {
  const root = path.join(projectRoot, "node_modules");
  const bannedGroups = new Set([
    "com.android.installreferrer",
    "com.google.firebase",
    "com.google.mlkit",
    "com.google.android.gms",
  ]);
  const isBanned = (group, module) => bannedGroups.has(group) || module === "camera-mlkit-vision";
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (file.includes("local-maven-repo") && entry.name.endsWith(".pom")) {
        const original = fs.readFileSync(file, "utf8");
        const patched = original.replace(/^[ \t]*<dependency>([\s\S]*?)<\/dependency>\r?\n?/gm, (match, body) => {
          const group = body.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1] ?? "";
          const module = body.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1] ?? "";
          return isBanned(group, module) ? "" : match;
        });
        if (patched !== original) fs.writeFileSync(file, patched, "utf8");
      } else if (file.includes("local-maven-repo") && entry.name.endsWith(".module")) {
        const original = fs.readFileSync(file, "utf8");
        try {
          const metadata = JSON.parse(original);
          for (const variant of metadata.variants ?? []) {
            variant.dependencies = (variant.dependencies ?? []).filter(
              (dependency) => !isBanned(dependency.group, dependency.module),
            );
          }
          const patched = `${JSON.stringify(metadata, null, 2)}\n`;
          if (patched !== original) fs.writeFileSync(file, patched, "utf8");
        } catch {
          // Ignore malformed publisher metadata; Gradle will report it as such.
        }
      }
    }
  };
  visit(root);
}

// Source-level F-Droid patch. Gradle exclusions do not remove proprietary
// class descriptors emitted by Expo's Kotlin sources (and R8 must still parse
// those descriptors). Replace the optional integrations with no-op FOSS
// implementations before Gradle compiles the modules.
function patchFdroidLibrarySources(
  projectRoot,
  { removeGeneratedArtifacts = true, rewriteSources = true } = {},
) {
  if (process.env.CABLESNAP_FDROID !== "1") return;
  const sourceRoot = (...parts) => path.join(projectRoot, "node_modules", ...parts);
  const write = (file, contents) => {
    if (fs.existsSync(path.dirname(file))) fs.writeFileSync(file, contents, "utf8");
  };
  // expo-modules-autolinking can consume a publisher-side local AAR from an
  // Android module's build directory even after its publication entry and
  // source files have been rewritten. Those AARs are generated artifacts, so
  // remove them before Gradle configures the module; otherwise the original
  // Camera AAR restores ML Kit/GMS bytecode exactly as seen in AC10b.
  for (const packageName of [
    "expo-camera",
    "expo-application",
    "expo-notifications",
    "expo-dev-launcher",
  ]) {
    const buildDir = sourceRoot(packageName, "android", "build");
    if (removeGeneratedArtifacts && fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
    // Expo publishes a precompiled AAR beside the source module. Removing
    // only its POM/module metadata is insufficient: Gradle can still select
    // the AAR itself, which is the exact source of the surviving ML Kit/GMS
    // classes seen by AC10b.
    const localMavenRepo = sourceRoot(packageName, "local-maven-repo");
    if (fs.existsSync(localMavenRepo)) {
      fs.rmSync(localMavenRepo, { recursive: true, force: true });
    }
  }

  // The explicit CI pass runs after Expo prebuild has generated Android
  // module outputs. Source rewriting already happened during config
  // evaluation; avoid rewriting package/source files while Gradle is about
  // to fingerprint generated inputs.
  if (!rewriteSources) return;

  const camera = sourceRoot("expo-camera", "android", "src", "main", "java", "expo", "modules", "camera");
  const cameraConfig = sourceRoot("expo-camera", "expo-module.config.json");
  if (fs.existsSync(cameraConfig)) {
    const config = JSON.parse(fs.readFileSync(cameraConfig, "utf8"));
    // Force Expo autolinking to use the sanitized Android source project.
    // The publisher AAR contains the original ML Kit/GMS bytecode.
    if (config.android) delete config.android.publication;
    fs.writeFileSync(cameraConfig, JSON.stringify(config, null, 2) + "\n", "utf8");
  }

  // Balanced-brace replacement for a whole `fun <name>(...) { ... }` block.
  // Kotlin allows nested try/catch and lambda braces inside the body, so a
  // greedy/non-greedy regex is unsafe. Walk braces manually.
  const replaceKotlinFunction = (source, name, replacement) => {
    const funRegex = new RegExp(`fun\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`, "m");
    const match = funRegex.exec(source);
    if (!match) return source;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      const c = source[i++];
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    if (depth !== 0) return source; // unbalanced; leave as-is
    return source.slice(0, match.index) + replacement + source.slice(i);
  };
  write(path.join(camera, "analyzers", "BarcodeAnalyzer.kt"), `package expo.modules.camera.analyzers

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import expo.modules.camera.records.BarcodeType
import expo.modules.camera.utils.BarCodeScannerResult

// F-Droid: food barcode scanning is provided by expo-foss-barcode-scanner.
class BarcodeAnalyzer(formats: List<BarcodeType>, val onComplete: (BarCodeScannerResult) -> Unit) : ImageAnalysis.Analyzer {
  override fun analyze(imageProxy: ImageProxy) { imageProxy.close() }
}
`);
  write(path.join(camera, "analyzers", "MLKitBarcodeAnalyzer.kt"), `package expo.modules.camera.analyzers

import android.graphics.Bitmap
import expo.modules.camera.utils.BarCodeScannerResult

class MLKitBarCodeScanner {
  suspend fun scan(bitmap: Bitmap): List<BarCodeScannerResult> = emptyList()
  fun setSettings(formats: List<Int>) {}
}
`);
  write(path.join(camera, "analyzers", "BarcodeScannerResultSerializer.kt"), `package expo.modules.camera.analyzers

import android.os.Bundle
import expo.modules.camera.utils.BarCodeScannerResult

object BarCodeScannerResultSerializer {
  fun toBundle(result: BarCodeScannerResult, density: Float): Bundle = Bundle().apply {
    putString("data", result.value); putString("raw", result.raw); putInt("type", result.type)
  }
  fun parseBarcodeScanningResult(barcode: Any, inputImage: Any? = null) =
    BarCodeScannerResult(0, "", "", Bundle(), emptyList(), 0, 0)
  fun parseExtraDate(barcode: Any): Bundle = Bundle()
}
`);
  const cameraRecords = path.join(camera, "records", "CameraRecords.kt");
  if (fs.existsSync(cameraRecords)) {
    let source = fs.readFileSync(cameraRecords, "utf8")
      .replace(/^import com\.google\.mlkit\.[^\n]+\n/gm, "")
      .replaceAll("Barcode.FORMAT_CODE_128", "1").replaceAll("Barcode.FORMAT_CODE_39", "2")
      .replaceAll("Barcode.FORMAT_CODE_93", "4").replaceAll("Barcode.FORMAT_CODABAR", "8")
      .replaceAll("Barcode.FORMAT_DATA_MATRIX", "16").replaceAll("Barcode.FORMAT_EAN_13", "32")
      .replaceAll("Barcode.FORMAT_EAN_8", "64").replaceAll("Barcode.FORMAT_ITF", "128")
      .replaceAll("Barcode.FORMAT_QR_CODE", "256").replaceAll("Barcode.FORMAT_UPC_A", "512")
      .replaceAll("Barcode.FORMAT_UPC_E", "1024").replaceAll("Barcode.FORMAT_PDF417", "2048")
      .replaceAll("Barcode.FORMAT_AZTEC", "4096").replaceAll("Barcode.FORMAT_UNKNOWN", "-1")
      .replaceAll("Barcode.FORMAT_ALL_FORMATS", "0");
    fs.writeFileSync(cameraRecords, source, "utf8");
  }
  write(path.join(camera, "analyzers", "BarcodeScannerResultSerializer.kt"), `package expo.modules.camera.analyzers

import android.os.Bundle
import expo.modules.camera.utils.BarCodeScannerResult

object BarCodeScannerResultSerializer {
  fun toBundle(result: BarCodeScannerResult, density: Float): Bundle = Bundle().apply {
    putString("data", result.value); putString("raw", result.raw); putInt("type", result.type)
  }
  fun parseBarcodeScanningResult(barcode: Any, inputImage: Any? = null) =
    BarCodeScannerResult(0, "", "", Bundle(), emptyList(), 0, 0)
  fun parseExtraDate(barcode: Any): Bundle = Bundle()
}
`);

  // Robust sweep: any .kt file under expo-camera's Android source that still
  // references MLKit or GMS (imports, GmsBarcodeScanning/GmsBarcodeScannerOptions
  // calls, Class.forName reflection, or Barcode.FORMAT_* symbols) must be
  // neutralized before Kotlin compiles it. Hardcoding CameraViewModule.kt and
  // CameraUtils.kt broke on expo-camera bumps that added new call sites.
  const cameraSrcRoot = sourceRoot("expo-camera", "android", "src", "main", "java", "expo", "modules", "camera");
  const neutralizeMlkitGmsInKotlin = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { neutralizeMlkitGmsInKotlin(file); continue; }
      if (!entry.name.endsWith(".kt")) continue;
      const original = fs.readFileSync(file, "utf8");
      if (!/com\.google\.(mlkit|android\.gms)|GmsBarcodeScann|Barcode\.FORMAT_/.test(original)) continue;
      let source = original
        // 1. Strip all MLKit / GMS imports.
        .replace(/^import com\.google\.mlkit\.[^\n]+\n/gm, "")
        .replace(/^import com\.google\.android\.gms\.[^\n]+\n/gm, "")
        // 2. Neutralize reflection probes: keep syntax valid, drop the descriptor.
        .replace(/Class\.forName\("com\.google\.(?:mlkit|android\.gms)\.[^"]+"\)/g, "Any::class.java")
        // 3. Any remaining GmsBarcodeScanning* or GmsBarcodeScannerOptions* call
        //    chain becomes an unconditional throw. Kotlin still compiles because
        //    the throw expression has type Nothing and satisfies any expected type.
        .replace(/GmsBarcodeScanning\.[A-Za-z_]+\s*\([^)]*\)(?:\s*\.[A-Za-z_]+\s*\([^)]*\))*/g,
          "run<Nothing> { throw CameraExceptions.MLKitUnavailableException() }")
        .replace(/GmsBarcodeScannerOptions\.Builder\s*\(\s*\)(?:\s*\.[A-Za-z_]+\s*\([^)]*\))*(?:\s*\.build\s*\(\s*\))?/g,
          "run<Nothing> { throw CameraExceptions.MLKitUnavailableException() }")
        // 4. Barcode.FORMAT_* constants (MLKit) — map to numeric equivalents so
        //    files that mention them (e.g. records) still compile without pulling
        //    the com.google.mlkit.vision.barcode.common.Barcode class descriptor.
        .replace(/Barcode\.FORMAT_CODE_128/g, "1")
        .replace(/Barcode\.FORMAT_CODE_39/g, "2")
        .replace(/Barcode\.FORMAT_CODE_93/g, "4")
        .replace(/Barcode\.FORMAT_CODABAR/g, "8")
        .replace(/Barcode\.FORMAT_DATA_MATRIX/g, "16")
        .replace(/Barcode\.FORMAT_EAN_13/g, "32")
        .replace(/Barcode\.FORMAT_EAN_8/g, "64")
        .replace(/Barcode\.FORMAT_ITF/g, "128")
        .replace(/Barcode\.FORMAT_QR_CODE/g, "256")
        .replace(/Barcode\.FORMAT_UPC_A/g, "512")
        .replace(/Barcode\.FORMAT_UPC_E/g, "1024")
        .replace(/Barcode\.FORMAT_PDF417/g, "2048")
        .replace(/Barcode\.FORMAT_AZTEC/g, "4096")
        .replace(/Barcode\.FORMAT_UNKNOWN/g, "-1")
        .replace(/Barcode\.FORMAT_ALL_FORMATS/g, "0");
      // 5. File-specific stubs for known entry points. Kept for clarity and
      //    because these produce a nicer runtime error path than the generic
      //    throw substitution.
      if (/CameraUtils\.kt$/.test(file)) {
        // Replace the whole function including a try/catch body. We match the
        // opening brace and then walk balanced braces to find the true end so
        // we do not leave a dangling `catch` clause behind (the old regex
        // stopped at the first `}` inside the try block).
        source = replaceKotlinFunction(source, "isMLKitBarcodeScannerAvailable",
          "fun isMLKitBarcodeScannerAvailable(): Boolean = false");
      }
      if (/CameraViewModule\.kt$/.test(file)) {
        source = source.replace(
          /AsyncFunction\("launchScanner"\)\s*\{[\s\S]*?^\s{0,6}\}/m,
          `AsyncFunction("launchScanner") { _: BarcodeSettings, promise: Promise ->
      promise.reject(CameraExceptions.MLKitUnavailableException())
    }`,
        );
      }
      if (source !== original) fs.writeFileSync(file, source, "utf8");
    }
  };
  neutralizeMlkitGmsInKotlin(cameraSrcRoot);

  const app = sourceRoot("expo-application", "android", "src", "main", "java", "expo", "modules", "application", "ApplicationModule.kt");
  if (fs.existsSync(app)) {
    let source = fs.readFileSync(app, "utf8").replace(/^import com\.android\.installreferrer[^\n]+\n/gm, "");
    source = source.replace(/\n\s*AsyncFunction\("getInstallReferrerAsync"\)[\s\S]*?\n\s*\}\n\s*\}\n\n\s*private val packageName/m,
      `AsyncFunction("getInstallReferrerAsync") { promise: Promise -> promise.resolve("") }`);
    fs.writeFileSync(app, source, "utf8");
  }
  // CableSnap does not import expo-application.  Exclude its Android native
  // module entirely so a publisher AAR or stale generated project cannot
  // reintroduce Install Referrer classes through autolinking.
  const appConfig = sourceRoot("expo-application", "expo-module.config.json");
  if (fs.existsSync(appConfig)) {
    const config = JSON.parse(fs.readFileSync(appConfig, "utf8"));
    config.platforms = (config.platforms ?? []).filter((platform) => platform !== "android");
    fs.writeFileSync(appConfig, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
  const appPackageJson = sourceRoot("expo-application", "package.json");
  if (fs.existsSync(appPackageJson)) {
    const pkg = JSON.parse(fs.readFileSync(appPackageJson, "utf8"));
    pkg.expo = pkg.expo ?? {};
    pkg.expo.autolinking = pkg.expo.autolinking ?? {};
    pkg.expo.autolinking.exclude = [...new Set([...(pkg.expo.autolinking.exclude ?? []), "expo-application"] )];
    fs.writeFileSync(appPackageJson, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  }

  const notifications = sourceRoot("expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications");
  // These optional integrations also leave references in AAR manifests.  A
  // source-only rewrite is not enough: manifest merger can preserve the
  // metadata/intent action even after the corresponding dependency is gone.
  const cameraManifest = sourceRoot("expo-camera", "android", "src", "main", "AndroidManifest.xml");
  if (fs.existsSync(cameraManifest)) {
    let manifest = fs.readFileSync(cameraManifest, "utf8");
    manifest = manifest.replace(/\s*<application>[\s\S]*?<\/application>/, "");
    fs.writeFileSync(cameraManifest, manifest, "utf8");
  }
  const imagePickerManifest = sourceRoot("expo-image-picker", "android", "src", "main", "AndroidManifest.xml");
  if (fs.existsSync(imagePickerManifest)) {
    let manifest = fs.readFileSync(imagePickerManifest, "utf8");
    manifest = manifest.replace(/\s*<service\b[\s\S]*?<\/service>/g, "");
    fs.writeFileSync(imagePickerManifest, manifest, "utf8");
  }
  // expo-dev-launcher only uses ML Kit in its debug-only developer UI. It is
  // not part of the F-Droid release, and deleting that source set prevents a
  // future variant fallback from accidentally compiling it.
  const devLauncherDebug = sourceRoot("expo-dev-launcher", "android", "src", "debug");
  if (fs.existsSync(devLauncherDebug)) fs.rmSync(devLauncherDebug, { recursive: true, force: true });
  const notifConfig = sourceRoot("expo-notifications", "expo-module.config.json");
  if (fs.existsSync(notifConfig)) {
    const config = JSON.parse(fs.readFileSync(notifConfig, "utf8"));
    config.platforms = (config.platforms ?? []).filter((platform) => platform !== "android");
    fs.writeFileSync(notifConfig, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
  const packageJson = sourceRoot("expo-notifications", "package.json");
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    pkg.expo = pkg.expo ?? {};
    pkg.expo.autolinking = pkg.expo.autolinking ?? {};
    pkg.expo.autolinking.exclude = [...new Set([...(pkg.expo.autolinking.exclude ?? []), "expo-notifications"] )];
    fs.writeFileSync(packageJson, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  }
  // Remove Firebase-backed source files; local notifications remain available.
  for (const relative of [
    ["service", "ExpoFirebaseMessagingService.kt"],
    ["service", "delegates", "FirebaseMessagingDelegate.kt"],
    ["tokens", "PushTokenModule.kt"],
    ["topics", "TopicSubscriptionModule.kt"],
    ["notifications", "RemoteMessageSerializer.java"],
  ]) {
    const file = path.join(notifications, ...relative);
    if (fs.existsSync(file)) fs.writeFileSync(file, "package expo.modules.notifications;\n", "utf8");
  }
  write(path.join(notifications, "service", "interfaces", "FirebaseMessagingDelegate.kt"), `package expo.modules.notifications.service.interfaces

interface FirebaseMessagingDelegate {
  fun onMessageReceived(remoteMessage: Any?)
  fun onNewToken(token: String)
}
`);
  write(path.join(notifications, "notifications", "debug", "DebugLogging.kt"), `package expo.modules.notifications.notifications.debug

import android.os.Bundle
import expo.modules.notifications.notifications.model.Notification

object DebugLogging {
  fun logBundle(caller: String, bundleToLog: Bundle) {}
  fun logRemoteMessage(caller: String, message: Any) {}
  fun logNotification(caller: String, notification: Notification) {}
}
`);
  write(path.join(notifications, "notifications", "model", "RemoteNotificationContent.kt"), `package expo.modules.notifications.notifications.model

import android.content.Context
import android.graphics.Bitmap
import android.os.Parcel
import android.os.Parcelable
import expo.modules.notifications.notifications.enums.NotificationPriority
import expo.modules.notifications.notifications.interfaces.INotificationContent
import org.json.JSONObject

class RemoteNotificationContent private constructor() : INotificationContent {
  val isDataOnly: Boolean = false
  override val title: String? = null
  override val text: String? = null
  override val subText: String? = null
  override val badgeCount: Number? = null
  override val shouldPlayDefaultSound: Boolean = false
  override val soundName: String? = null
  override val shouldUseDefaultVibrationPattern: Boolean = false
  override val vibrationPattern: LongArray? = null
  override val body: JSONObject? = null
  override val priority: NotificationPriority? = null
  override val color: Number? = null
  override val isAutoDismiss: Boolean = false
  override val categoryId: String? = null
  override val isSticky: Boolean = false
  override suspend fun getImage(context: Context): Bitmap? = null
  override fun containsImage(): Boolean = false
  override fun describeContents(): Int = 0
  override fun writeToParcel(dest: Parcel, flags: Int) {}
  companion object CREATOR : Parcelable.Creator<RemoteNotificationContent> {
    override fun createFromParcel(parcel: Parcel) = RemoteNotificationContent()
    override fun newArray(size: Int): Array<RemoteNotificationContent?> = arrayOfNulls(size)
  }
}
`);
  write(path.join(notifications, "notifications", "model", "triggers", "FirebaseNotificationTrigger.kt"), `package expo.modules.notifications.notifications.model.triggers

import android.os.Bundle
import android.os.Parcel
import android.os.Parcelable
import expo.modules.notifications.notifications.interfaces.NotificationTrigger

class FirebaseNotificationTrigger private constructor() : NotificationTrigger {
  override fun toBundle(): Bundle = Bundle()
  override fun getNotificationChannel(): String? = null
  override fun describeContents(): Int = 0
  override fun writeToParcel(dest: Parcel, flags: Int) {}
  companion object CREATOR : Parcelable.Creator<FirebaseNotificationTrigger> {
    override fun createFromParcel(parcel: Parcel) = FirebaseNotificationTrigger()
    override fun newArray(size: Int): Array<FirebaseNotificationTrigger?> = arrayOfNulls(size)
  }
}
`);
  const serializer = path.join(notifications, "notifications", "NotificationSerializer.java");
  if (fs.existsSync(serializer)) {
    let source = fs.readFileSync(serializer, "utf8")
      .replace(/^import com\.google\.firebase\.[^\n]+\n/gm, "")
      .replace(/^import expo\.modules\.notifications\.notifications\.model\.triggers\.FirebaseNotificationTrigger;\n/gm, "")
      .replace(/\s*if\s*\(requestTrigger instanceof FirebaseNotificationTrigger trigger\)\s*\{[\s\S]*?^\s*\}\s*else if\s*\(/m,
        "\n      if (");
    fs.writeFileSync(serializer, source, "utf8");
  }

  const notificationsManifest = sourceRoot("expo-notifications", "android", "src", "main", "AndroidManifest.xml");
  if (fs.existsSync(notificationsManifest)) {
    let manifest = fs.readFileSync(notificationsManifest, "utf8");
    manifest = manifest.replace(/\s*<service\b[\s\S]*?<\/service>/, "");
    fs.writeFileSync(notificationsManifest, manifest, "utf8");
  }

  // Fail during prebuild rather than discovering a leaked descriptor only
  // after a 30-minute Android build.
  const forbidden = /com\.(?:google\.firebase|google\.mlkit|google\.android\.gms|android\.installreferrer)/;
  const verify = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) verify(file);
      else if (/\.(?:kt|java)$/.test(entry.name) && forbidden.test(fs.readFileSync(file, "utf8"))) {
        throw new Error(`F-Droid source patch incomplete: proprietary reference remains in ${file}`);
      }
    }
  };
  // Verify every Expo Android source tree, not just the modules with known
  // integrations. This turns a newly published optional Expo dependency into
  // an immediate, actionable prebuild failure instead of a 30-minute DEX
  // purity failure.
  const expoModulesRoot = sourceRoot();
  for (const packageName of fs.readdirSync(expoModulesRoot)) {
    if (!packageName.startsWith("expo-")) continue;
    verify(path.join(expoModulesRoot, packageName, "android", "src"));
  }
}

// Expo prebuild may copy an already-evaluated library build script into the
// generated Android project. Patch those generated app/library scripts too;
// changing node_modules alone is not sufficient when Gradle resolves a
// release library variant through releaseFdroid.matchingFallbacks.
function patchFdroidAndroidGradleTree(platformRoot) {
  if (process.env.CABLESNAP_FDROID !== "1") return;
  const banned = /^\s*(?:implementation|api|compileOnly|debugOnly)\s*\(?\s*["'](?:com\.google\.firebase|com\.google\.mlkit|com\.google\.android\.gms|com\.android\.installreferrer):[^\r\n]+["']\s*\)?\s*\r?\n?/gm;
  const barcode = /^\s*add\(barcodeDependencyConfiguration,\s*["'](?:com\.google\.android\.gms|com\.google\.mlkit|androidx\.camera):[^\r\n]+\r?\n?/gm;

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // npm packages can ship stale Android intermediates (including lint
        // dependency models) from their publisher's build. Gradle consumes
        // those models before evaluating the freshly patched scripts, which
        // can resurrect removed Firebase/ML Kit artifacts. They are generated
        // again by Gradle, so remove them from every installed Android module.
        if (
          entry.name === "build" &&
          (path.basename(dir) === "android" || dir.includes(`${path.sep}android${path.sep}`)) &&
          !dir.includes(`${path.sep}wear${path.sep}`)
        ) {
          fs.rmSync(target, { recursive: true, force: true });
          continue;
        }
        // The Play-only Wear APK is still built in this workflow; do not
        // remove its GMS wearable dependency while patching the phone tree.
        if (entry.name === "wear") continue;
        visit(target);
      } else if (entry.name === "build.gradle" || entry.name === "build.gradle.kts") {
        const original = fs.readFileSync(target, "utf8");
        const patched = original.replace(banned, "").replace(barcode, "");
        if (patched !== original) fs.writeFileSync(target, patched, "utf8");
      }
    }
  }

  visit(platformRoot);
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

function patchGradleWrapperProperties(platformRoot) {
  const propertiesPath = path.join(platformRoot, "gradle", "wrapper", "gradle-wrapper.properties");
  if (fs.existsSync(propertiesPath)) {
    let contents = fs.readFileSync(propertiesPath, "utf8");
    if (contents.includes("gradle-9.0.0-bin.zip")) {
      // Pin Gradle to 8.13 to resolve the Gradle 9 compileReleaseKotlin javaSources normalization race.
      // Gradle 9.0.0 tightened input/output state tracking, causing compileReleaseKotlin
      // to fail when reading the generated/writing BuildConfig.java. Pinning to Gradle 8.13
      // avoids this normalization race.
      contents = contents.replace("gradle-9.0.0-bin.zip", "gradle-8.13-bin.zip");
      fs.writeFileSync(propertiesPath, contents, "utf8");
    }
  }
}

const withWearOsModule = (config) => {
  // This runs during config evaluation, before Expo autolinking generates
  // Android's project dependency graph. The dangerous-mod hook below is too
  // late to affect that graph: removing a publisher AAR there leaves a
  // generated `host.exp.exponent:expo.modules.camera` dependency pointing at
  // a repository that no longer exists. Apply the source/publication rewrite
  // first, then repeat it in dangerous-mod for idempotence after prebuild.
  if (process.env.CABLESNAP_FDROID === "1") {
    const projectRoot = process.cwd();
    patchFdroidExpoDependencies(projectRoot);
    patchFdroidLibrarySources(projectRoot, { removeGeneratedArtifacts: true });
  }

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
      patchFdroidExpoDependencies(projectRoot);
      // The early config-evaluation pass already removed publisher artifacts.
      // Do not delete a freshly generated module build directory while Expo
      // prebuild is still materializing BuildConfig/source outputs.
      patchFdroidLibrarySources(projectRoot, {
        removeGeneratedArtifacts: false,
        rewriteSources: false,
      });
      const srcDir = path.join(projectRoot, WEAR_TEMPLATE_RELATIVE);
      const dstDir = path.join(platformRoot, "wear");
      // Wipe stale outputs so a renamed/deleted file in the template does
      // not linger. The template is the source of truth.
      rmDirRecursive(dstDir);
      copyDirRecursive(srcDir, dstDir);
      // Write/overwrite the F-Droid manifest overlay. Idempotent — same
      // contents every prebuild — so safe to clobber unconditionally.
      writeFdroidManifest(platformRoot);
      writeFdroidR8Rules(projectRoot, platformRoot);
      patchGradleWrapperProperties(platformRoot);
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
module.exports.writeFdroidR8Rules = writeFdroidR8Rules;
module.exports.patchFdroidExpoDependencies = patchFdroidExpoDependencies;
module.exports.scrubFdroidLocalMavenMetadata = scrubFdroidLocalMavenMetadata;
module.exports.patchFdroidLibrarySources = patchFdroidLibrarySources;
module.exports.patchFdroidAndroidGradleTree = patchFdroidAndroidGradleTree;
module.exports.patchGradleWrapperProperties = patchGradleWrapperProperties;
module.exports.FDROID_MANIFEST_CONTENTS = FDROID_MANIFEST_CONTENTS;
module.exports.WEAR_TEMPLATE_RELATIVE = WEAR_TEMPLATE_RELATIVE;
module.exports.WEAR_PROJECT_RELATIVE = WEAR_PROJECT_RELATIVE;
