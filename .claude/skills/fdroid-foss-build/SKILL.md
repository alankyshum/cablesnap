---
name: fdroid-foss-build
description: >-
  Diagnose and maintain CableSnap's Expo/Android F-Droid build when excluding
  GMS, Firebase, MLKit, and Play-only Wear dependencies.
---

# F-Droid FOSS Build Maintenance

Use this skill when changing CableSnap's Android F-Droid build, debugging
`releaseFdroid`, or removing proprietary Google dependencies from the APK.

## Core Pattern

CableSnap uses an app-only Gradle build type:

```gradle
releaseFdroid {
  initWith release
  matchingFallbacks = ["release"]
}
```

Do **not** replace this with `productFlavors`. Expo autolinking propagates app
product flavors into Expo subprojects, which breaks Expo module publication
paths that expect a singular `release` component. App build types keep the
F-Droid split local to `:app`, while `initWith release` keeps signing, minify,
shrinker, and ProGuard behavior single-sourced.

## Classpath and Manifest Must Match

For F-Droid purity, removing only `com.google.android.gms` is insufficient.
Transitive Firebase and MLKit artifacts arrive through different Maven groups
and can still auto-register Android components that run before `MainActivity`.

When excluding a proprietary dependency family:

1. Exclude the Maven group/module from every `releaseFdroid*` configuration
   that matters (`Implementation`, `RuntimeClasspath`, and `CompileClasspath`).
2. Remove any AAR-contributed manifest entries that would instantiate missing
   classes during app startup.
3. Add regression tests for both the Gradle excludes and the generated manifest
   overlay.

Known CableSnap launch-crash providers:

| Source | Manifest entry | Failure mode |
|---|---|---|
| `com.google.firebase:firebase-common` via `expo-notifications` | `FirebaseInitProvider` | Runs during `installContentProviders` and calls missing GMS `Preconditions`. |
| `com.google.mlkit:common` via `expo-camera` barcode scanning | `MlKitInitProvider` | Same auto-init and missing-GMS crash pattern. |
| `expo-image-picker` | `com.google.android.gms.metadata.ModuleDependencies` | Dormant service, but strip it to avoid dangling GMS references. |

## Build-Type Manifest Overlay

Use `android/app/src/releaseFdroid/AndroidManifest.xml` as the build-type
overlay for removals. The overlay must declare:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
```

Then remove unwanted entries with `tools:node="remove"` inside an
`<application>` wrapper. Without `xmlns:tools`, the removal directives do not
apply.

## Current Source of Truth

- `plugins/with-wearos-module.js` writes the `releaseFdroid` build type,
  classpath excludes, subproject variant filter, and manifest overlay.
- `__tests__/plugins/with-wearos-module.test.js` guards the F-Droid excludes,
  manifest removals, and the product-flavor regression.
- `.github/workflows/scheduled-release.yml` builds both `:app:assembleRelease`
  and `:app:assembleReleaseFdroid`, then smoke-tests the generated APKs.

## Verification Checklist

Before changing F-Droid dependency filtering:

1. Run the config-plugin tests for `with-wearos-module`.
2. Prebuild Android and inspect generated `android/app/build.gradle` plus
   `android/app/src/releaseFdroid/AndroidManifest.xml`.
3. Build `:app:assembleReleaseFdroid`.
4. Launch-smoke-test the F-Droid APK and hard-fail only process death or
   `FATAL EXCEPTION`; activity-state parsing is diagnostic because Android API
   output varies.
