---
name: fdroid-foss-build
description: >-
  Build and review CableSnap's F-Droid/FOSS Android variant. Use when changing
  releaseFdroid, GMS/Firebase/MLKit exclusions, manifest overlays, or Expo
  Android build splits.
---

# F-Droid FOSS Build

Use this skill when editing CableSnap's F-Droid Android path: the
`releaseFdroid` build type, `plugins/with-wearos-module.js`, generated Android
manifest overlays, or workflow steps that build `cablesnap-fdroid.apk`.

## Core Rules

### Use `buildTypes`, not `productFlavors`, for Expo channel splits

Do not model Play vs F-Droid as `productFlavors`. `expo-modules-autolinking`
propagates `flavorDimensions` and `productFlavors` from `:app` into every Expo
subproject (`:expo`, `:expo-modules-core`, and each `:expo-*`). That breaks
`expo-module-gradle-plugin` publishing because
`MavenPublicationExtension.kt` expects `components.getByName("release")`, but
AGP creates per-flavor release components instead.

Use an app-only build type:

```gradle
buildTypes {
    releaseFdroid {
        initWith release
        matchingFallbacks = ["release"]
    }
}
```

`buildTypes` avoid the Expo product-flavor publishing conflict while inheriting
release signing, minify, shrinker, and ProGuard settings from the canonical
`release` block.

### Exclude both classes and manifest auto-init entries

Classpath excludes alone are not enough for a FOSS build. Firebase and MLKit
AAR manifests can contribute auto-registered providers that Android starts
during `installContentProviders`, before `MainActivity` runs. If those providers
or their dependencies reference excluded GMS classes, the app crashes on launch.

| Library source | Manifest entry | Why it must be stripped |
|---|---|---|
| `expo-notifications` -> `firebase-messaging` -> `firebase-common` | `com.google.firebase.provider.FirebaseInitProvider` | Auto-runs at app start and calls excluded `com.google.android.gms.common.internal.Preconditions`. |
| `expo-camera` -> `com.google.mlkit:barcode-scanning` -> `mlkit-common` | `com.google.mlkit.common.internal.MlKitInitProvider` | Same auto-init crash pattern as Firebase after GMS classes are excluded. |
| `expo-image-picker` | `com.google.android.gms.metadata.ModuleDependencies` | Dormant disabled service, but strip it to remove dangling references to excluded GMS classes. |

The fix must be paired:

1. Exclude the dependency group/module from every `releaseFdroid*`
   configuration (`Implementation`, `RuntimeClasspath`, `CompileClasspath`).
2. Remove the manifest node in the F-Droid build-type overlay with
   `tools:node="remove"`.

### Put F-Droid manifest overrides in the build-type overlay

AGP merges `android/app/src/<buildType>/AndroidManifest.xml` with high priority.
For CableSnap the plugin writes:

```text
android/app/src/releaseFdroid/AndroidManifest.xml
```

The overlay must:

- Declare `xmlns:tools="http://schemas.android.com/tools"` on the root
  `<manifest>`.
- Put removal directives inside `<application>`, at the same depth as the
  providers/services they remove.
- Use `tools:node="remove"` on each target provider/service.

Without the `tools` namespace or correct nesting, the manifest merger can leave
the offending entries in place and the F-Droid APK will crash before the React
Native app starts.

### Keep camera exclusions narrow

Exclude `com.google.mlkit` and the specific `camera-mlkit-vision` module for
F-Droid. Do not exclude the entire `androidx.camera` group: Camera preview
depends on the core AndroidX Camera artifacts. The expected trade-off is that
barcode scanning is unavailable in F-Droid while manual food entry and camera
preview remain available.

## Validation

When changing the F-Droid build path, run the focused plugin tests:

```bash
npx jest __tests__/plugins/with-wearos-module.test.js --runInBand
```

For release-path validation, build the F-Droid APK and inspect DEX contents
rather than relying on zip entry names:

```bash
npx expo prebuild --clean --platform android
cd android
./gradlew :app:assembleReleaseFdroid
cd ..
TMPDIR_DEX=$(mktemp -d)
unzip -q -o android/app/build/outputs/apk/releaseFdroid/app-releaseFdroid.apk 'classes*.dex' -d "$TMPDIR_DEX"
strings "$TMPDIR_DEX"/classes*.dex | grep -E 'com/google/android/gms/wearable|FirebaseInitProvider|MlKitInitProvider' || true
rm -rf "$TMPDIR_DEX"
```
