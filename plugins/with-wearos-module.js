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
            .replaceAll(/(?m)^\\s*(?:implementation|api|compileOnly)\\s+["']com\\.google\\.firebase:[^\\r\\n]+\\r?\\n?/, "")
            .replaceAll(/(?m)^\\s*(?:implementation|api|compileOnly)\\s+["']com\\.android\\.installreferrer:[^\\r\\n]+\\r?\\n?/, "")
            .replaceAll(/(?m)^\\s*(?:implementation|api|compileOnly)\\s+["']com\\.google\\.mlkit:[^\\r\\n]+\\r?\\n?/, "")
            .replaceAll(/(?m)^\\s*(?:implementation|api|compileOnly)\\s+["']com\\.google\\.android\\.gms:[^\\r\\n]+\\r?\\n?/, "")
            .replaceAll(/(?m)^\\s*add\\(barcodeDependencyConfiguration,\\s*["'](?:com\\.google\\.android\\.gms|com\\.google\\.mlkit):[^\\r\\n]+\\r?\\n?/, "")
        // Proprietary declarations are removed above for F-Droid.
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
    \${FDROID_MANIFEST_MARKER}
    <application>
        <!-- firebase-common.aar — auto-runs at app start, calls into excluded
             com.google.android.gms.common.internal.Preconditions. Removing
             this provider prevents NoClassDefFoundError on F-Droid launch. -->
        <provider
            tools:node="removeAll"
            tools:selector="com.google.firebase" />

        <!-- expo-notifications declares this service inheriting from
             FirebaseMessagingService. With Firebase excluded the parent
             class is missing; AGP's class verifier on Android 14+ rejects
             the manifest entry. Strip it — push tokens (which would use it)
             aren't reachable in F-Droid anyway. CableSnap's local-notification
             code path (lib/notifications.ts) does not touch this service. -->
        <service
            tools:node="removeAll"
            tools:selector="expo.modules.notifications" />

        <!-- mlkit-common.aar — same crash pattern as FirebaseInitProvider.
             Auto-registered \`<provider MlKitInitProvider>\` runs during
             Application init (installContentProviders frame in the stack)
             and calls \`com.google.android.gms.common.internal.Preconditions\`
             on its very first line. With \`com.google.mlkit\` excluded the
             provider class itself is gone, but the manifest entry survives
             AGP's manifest merger because AAR manifests get merged before
             classpath resolution. tools:node="removeAll" deletes the entry
             from the merged output so installProvider() never tries to
             instantiate the missing class. Surfaced by run 25244727127. -->
        <provider
            tools:node="removeAll"
            tools:selector="com.google.mlkit" />

        <!-- expo-image-picker declares \`<service ModuleDependencies>\` for
             Google Photo Picker module-on-demand discovery. The declaration
             carries \`android:enabled="false"\` so the service is never
             actually instantiated, AND \`tools:ignore="MissingClass"\` to
             keep AGP's lint quiet. It would not crash on launch (the
             service is dormant), but stripping it for F-Droid removes a
             dangling reference to an excluded GMS class — defence-in-depth
             against any future Android version that tightens its parser. -->
        <service
            tools:node="removeAll"
            tools:selector="com.google.android.gms" />
    </application>
</manifest>
`;

function writeFdroidManifest(platformRoot) {
  const dir = path.join(platformRoot, "app", "src", "releaseFdroid");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "AndroidManifest.xml"), FDROID_MANIFEST_CONTENTS, "utf8");
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
        ["add(barcodeDependencyConfiguration, \"androidx.camera:camera-mlkit-vision:${camerax_version}\")", "// F-Droid: barcode scanner replaced by expo-foss-barcode-scanner"],
      ],
    ],
  ];
  for (const [file, fileReplacements] of replacements) {
    if (!fs.existsSync(file)) continue;
    let contents = fs.readFileSync(file, "utf8");
    for (const [from, to] of fileReplacements) contents = contents.replaceAll(from, to);
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

  // 1. Delete the files in expo-notifications that reference firebase.
  const notificationsFilesToDelete = [
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "service", "ExpoFirebaseMessagingService.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "service", "delegates", "FirebaseMessagingDelegate.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "service", "interfaces", "FirebaseMessagingDelegate.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "tokens", "PushTokenModule.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "topics", "TopicSubscriptionModule.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "background", "BackgroundRemoteNotificationTaskConsumer.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "background", "ExpoBackgroundNotificationTasksModule.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "RemoteMessageSerializer.java"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "model", "RemoteNotificationContent.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "model", "triggers", "FirebaseNotificationTrigger.kt"),
    path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "debug", "DebugLogging.kt")
  ];
  for (const file of notificationsFilesToDelete) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }

  // 2. Modify expo-notifications/android/src/main/AndroidManifest.xml
  const manifestFile = path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "AndroidManifest.xml");
  if (fs.existsSync(manifestFile)) {
    let content = fs.readFileSync(manifestFile, "utf8");
    content = content.replace(/<service\s+android:name="\.service\.ExpoFirebaseMessagingService"[\s\S]*?<\/service>/g, "");
    fs.writeFileSync(manifestFile, content, "utf8");
  }

  // 3. Modify expo-notifications/expo-module.config.json
  const configFile = path.join(projectRoot, "node_modules", "expo-notifications", "expo-module.config.json");
  if (fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (config.android && config.android.modules) {
      config.android.modules = config.android.modules.filter(m => 
        m !== "expo.modules.notifications.tokens.PushTokenModule" &&
        m !== "expo.modules.notifications.topics.TopicSubscriptionModule" &&
        m !== "expo.modules.notifications.notifications.background.ExpoBackgroundNotificationTasksModule"
      );
    }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
  }

  // 4. Modify NotificationSerializer.java
  const serializerFile = path.join(projectRoot, "node_modules", "expo-notifications", "android", "src", "main", "java", "expo", "modules", "notifications", "notifications", "NotificationSerializer.java");
  if (fs.existsSync(serializerFile)) {
    let content = fs.readFileSync(serializerFile, "utf8");
    content = content.replace("import com.google.firebase.messaging.RemoteMessage;", "");
    content = content.replace("import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger;", "");
    const oldIfBlock = `      if (requestTrigger instanceof FirebaseNotificationTrigger trigger) {
        RemoteMessage message = trigger.getRemoteMessage();
        Map<String, String> data = message.getData();
        String dataBody = data.get("body");
        if (isValidJSONString(dataBody)) {
          // If the body is a JSON object string, the notification was sent by the Expo notification service,
          // so we do the expected remapping of fields (we JSON-parse the string into an object in JS)
          content.putString("dataString", dataBody);
        } else {
          // The message was sent directly from Firebase or some other service,
          // and we copy the data as is
          content.putBundle("data", toBundle(data));
        }
      }`;
    content = content.replace(oldIfBlock, "");
    fs.writeFileSync(serializerFile, content, "utf8");
  }

  // 5. Modify expo-application's ApplicationModule.kt (Stub getInstallReferrerAsync)
  const appModuleFile = path.join(projectRoot, "node_modules", "expo-application", "android", "src", "main", "java", "expo", "modules", "application", "ApplicationModule.kt");
  if (fs.existsSync(appModuleFile)) {
    let content = fs.readFileSync(appModuleFile, "utf8");
    content = content.replace("import com.android.installreferrer.api.InstallReferrerClient", "");
    content = content.replace("import com.android.installreferrer.api.InstallReferrerStateListener", "");
    const regex = /AsyncFunction\("getInstallReferrerAsync"\)\s*(\{\s*promise:\s*Promise\s*->|\{[\s\S]*?)onInstallReferrerServiceDisconnected\(\)[\s\S]*?\}\s*\}\)\s*\}/;
    content = content.replace(regex, `AsyncFunction("getInstallReferrerAsync") { promise: Promise ->
      promise.resolve("")
    }`);
    fs.writeFileSync(appModuleFile, content, "utf8");
  }

  // 6. Stub BarcodeAnalyzer.kt, MLKitBarcodeAnalyzer.kt, and BarcodeScannerResultSerializer.kt under expo-camera
  const cameraAnalyzersDir = path.join(projectRoot, "node_modules", "expo-camera", "android", "src", "main", "java", "expo", "modules", "camera", "analyzers");
  if (fs.existsSync(cameraAnalyzersDir)) {
    const analyzerStub = `package expo.modules.camera.analyzers

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import expo.modules.camera.records.BarcodeType
import expo.modules.camera.utils.BarCodeScannerResult

class BarcodeAnalyzer(formats: List<BarcodeType>, val onComplete: (BarCodeScannerResult) -> Unit) : ImageAnalysis.Analyzer {
  override fun analyze(imageProxy: ImageProxy) {
    imageProxy.close()
  }
}

fun Array<ImageProxy.PlaneProxy>.toByteArray(): ByteArray {
  val totalSize = this.sumOf { it.buffer.remaining() }
  val result = ByteArray(totalSize)
  var offset = 0

  for (plane in this) {
    val buffer = plane.buffer
    val size = buffer.remaining()
    buffer.get(result, offset, size)
    offset += size
  }

  return result
}
`;
    const mlkitStub = `package expo.modules.camera.analyzers

import android.graphics.Bitmap
import expo.modules.camera.utils.BarCodeScannerResult

class MLKitBarCodeScanner {
  suspend fun scan(bitmap: Bitmap): List<BarCodeScannerResult> {
    return emptyList()
  }

  fun setSettings(formats: List<Int>) {
  }
}
`;
    const serializerStub = `package expo.modules.camera.analyzers

import android.os.Bundle
import android.util.Pair
import expo.modules.camera.utils.BarCodeScannerResult

object BarCodeScannerResultSerializer {
  fun toBundle(result: BarCodeScannerResult, density: Float) =
    Bundle().apply {
      putString("data", result.value)
      putString("raw", result.raw)
      putInt("type", result.type)
      putBundle("extra", result.extra)
      val cornerPointsAndBoundingBox = getCornerPointsAndBoundingBox(result.cornerPoints, result.boundingBox, density)
      putParcelableArrayList("cornerPoints", cornerPointsAndBoundingBox.first)
      putBundle("bounds", cornerPointsAndBoundingBox.second)
    }

  fun parseBarcodeScanningResult(barcode: Any, inputImage: Any? = null): BarCodeScannerResult {
    return BarCodeScannerResult(0, "", "", Bundle(), emptyList(), 0, 0)
  }

  private fun getCornerPointsAndBoundingBox(
    cornerPoints: List<Int>,
    boundingBox: BarCodeScannerResult.BoundingBox,
    density: Float
  ): Pair<ArrayList<Bundle>, Bundle> {
    val convertedCornerPoints = ArrayList<Bundle>()
    for (i in cornerPoints.indices step 2) {
      val x = cornerPoints[i].toFloat() / density
      val y = cornerPoints[i + 1].toFloat() / density

      convertedCornerPoints.add(getPoint(x, y))
    }
    val boundingBoxBundle = Bundle().apply {
      putParcelable("origin", getPoint(boundingBox.x.toFloat() / density, boundingBox.y.toFloat() / density))
      putParcelable("size", getSize(boundingBox.width.toFloat() / density, boundingBox.height.toFloat() / density))
    }
    return Pair(convertedCornerPoints, boundingBoxBundle)
  }

  fun parseExtraDate(barcode: Any): Bundle {
    return Bundle()
  }

  private fun getSize(width: Float, height: Float) =
    Bundle().apply {
      putFloat("width", width)
      putFloat("height", height)
    }

  private fun getPoint(x: Float, y: Float) =
    Bundle().apply {
      putFloat("x", x)
      putFloat("y", y)
    }
}
`;
    fs.writeFileSync(path.join(cameraAnalyzersDir, "BarcodeAnalyzer.kt"), analyzerStub, "utf8");
    fs.writeFileSync(path.join(cameraAnalyzersDir, "MLKitBarcodeAnalyzer.kt"), mlkitStub, "utf8");
    fs.writeFileSync(path.join(cameraAnalyzersDir, "BarcodeScannerResultSerializer.kt"), serializerStub, "utf8");
  }

  // 7. Modify CameraRecords.kt (Replace Barcode.FORMAT_* references)
  const recordsFile = path.join(projectRoot, "node_modules", "expo-camera", "android", "src", "main", "java", "expo", "modules", "camera", "records", "CameraRecords.kt");
  if (fs.existsSync(recordsFile)) {
    let content = fs.readFileSync(recordsFile, "utf8");
    content = content.replace("import com.google.mlkit.vision.barcode.common.Barcode", "");
    content = content.replaceAll("Barcode.FORMAT_AZTEC", "4096");
    content = content.replaceAll("Barcode.FORMAT_EAN_13", "32");
    content = content.replaceAll("Barcode.FORMAT_EAN_8", "64");
    content = content.replaceAll("Barcode.FORMAT_QR_CODE", "256");
    content = content.replaceAll("Barcode.FORMAT_PDF417", "2048");
    content = content.replaceAll("Barcode.FORMAT_UPC_E", "1024");
    content = content.replaceAll("Barcode.FORMAT_DATA_MATRIX", "16");
    content = content.replaceAll("Barcode.FORMAT_CODE_39", "2");
    content = content.replaceAll("Barcode.FORMAT_CODE_93", "4");
    content = content.replaceAll("Barcode.FORMAT_ITF", "128");
    content = content.replaceAll("Barcode.FORMAT_CODABAR", "8");
    content = content.replaceAll("Barcode.FORMAT_CODE_128", "1");
    content = content.replaceAll("Barcode.FORMAT_UPC_A", "512");
    content = content.replaceAll("Barcode.FORMAT_UNKNOWN", "-1");
    fs.writeFileSync(recordsFile, content, "utf8");
  }

  // 8. Modify CameraViewModule.kt (Stub launchScanner)
  const cameraModuleFile = path.join(projectRoot, "node_modules", "expo-camera", "android", "src", "main", "java", "expo", "modules", "camera", "CameraViewModule.kt");
  if (fs.existsSync(cameraModuleFile)) {
    let content = fs.readFileSync(cameraModuleFile, "utf8");
    content = content.replace("import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions", "");
    content = content.replace("import com.google.mlkit.vision.codescanner.GmsBarcodeScanning", "");
    
    const oldLaunchScannerBlock = `AsyncFunction("launchScanner") { settings: BarcodeSettings, promise: Promise ->
      if (!CameraUtils.isMLKitBarcodeScannerAvailable()) {
        promise.reject(CameraExceptions.MLKitUnavailableException())
        return@AsyncFunction
      }

      if (!CameraUtils.hasGooglePlayServices(appContext.reactContext)) {
        promise.reject(CameraExceptions.GooglePlayServicesUnavailableException())
        return@AsyncFunction
      }

      val reactContext = appContext.reactContext

      if (reactContext == null) {
        promise.reject(Exceptions.ReactContextLost())
        return@AsyncFunction
      }

      try {
        val options = GmsBarcodeScannerOptions.Builder().apply {
          if (settings.barcodeTypes.isNotEmpty()) {
            setBarcodeFormats(
              settings.barcodeTypes.first().mapToBarcode(),
              *settings.barcodeTypes.drop(1).map { it.mapToBarcode() }.toIntArray()
            )
          }
        }.build()

        val scanner = GmsBarcodeScanning.getClient(reactContext, options)
        scanner.startScan()
          .addOnSuccessListener { barcode ->
            val result = BarCodeScannerResultSerializer.parseBarcodeScanningResult(barcode)
            sendEvent("onModernBarcodeScanned", BarCodeScannerResultSerializer.toBundle(result, 1.0f))
            promise.resolve()
          }
          .addOnCanceledListener {
            promise.reject(CameraExceptions.BarcodeScanningCancelledException())
          }
          .addOnFailureListener {
            promise.reject(CameraExceptions.BarcodeScanningFailedException())
          }
      } catch (_: Exception) {
        promise.reject(CameraExceptions.GooglePlayServicesUnavailableException())
      }
    }`;

    const newLaunchScannerBlock = `AsyncFunction("launchScanner") { settings: BarcodeSettings, promise: Promise ->
      promise.reject(CameraExceptions.MLKitUnavailableException())
    }`;

    content = content.replace(oldLaunchScannerBlock, newLaunchScannerBlock);
    fs.writeFileSync(cameraModuleFile, content, "utf8");
  }
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
      patchFdroidExpoDependencies(projectRoot);
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
module.exports.patchFdroidExpoDependencies = patchFdroidExpoDependencies;
module.exports.FDROID_MANIFEST_CONTENTS = FDROID_MANIFEST_CONTENTS;
module.exports.WEAR_TEMPLATE_RELATIVE = WEAR_TEMPLATE_RELATIVE;
module.exports.WEAR_PROJECT_RELATIVE = WEAR_PROJECT_RELATIVE;
