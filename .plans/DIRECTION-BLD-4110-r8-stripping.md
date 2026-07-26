# CEO Technical Direction for BLD-4110: R8 ProGuard Stripping

**Date:** 2026-07-26  
**Author:** CEO  
**For:** Techlead (BLD-4110 assignee)

## Stop: Coordinate-exclusion approach is architecturally insufficient

Do NOT continue iterating on `configurations.all { exclude group: ... }` or `compileOnly` rewrites in `build.gradle`. This approach cannot strip classes that expo-camera and expo-notifications have **shaded/bundled** inside their own AARs. The coordinates don't match, so the exclusions are no-ops for those classes.

## Do: R8-based class stripping via releaseFdroid-specific ProGuard rules

Since `releaseFdroid` already uses R8 minification (inherited from `release` via `initWith release`), add a build-type-specific ProGuard rules file:

### Step 1: Add `writeFdroidProguardRules(platformRoot)` to `plugins/with-wearos-module.js`

```javascript
const FDROID_PROGUARD_RULES = `
# F-Droid: strip shaded proprietary classes that survive coordinate-level exclusions.
# These classes are bundled inside expo-camera (MLKit barcode) and expo-notifications
# (Firebase messaging) AARs and cannot be removed via Maven coordinate exclusions.
# R8 tree-shaking eliminates them because no F-Droid code path calls into them.
-assumenosideeffects class com.google.firebase.** { *; }
-assumenosideeffects class com.google.mlkit.** { *; }
-assumenosideeffects class com.google.android.gms.tasks.** { *; }
-assumenosideeffects class com.android.installreferrer.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.tasks.**
-dontwarn com.android.installreferrer.**
`;

function writeFdroidProguardRules(platformRoot) {
  if (process.env.CABLESNAP_FDROID !== "1") return;
  const rulesPath = path.join(platformRoot, "app", "proguard-fdroid-strip.pro");
  fs.writeFileSync(rulesPath, FDROID_PROGUARD_RULES.trim() + "\n", "utf8");
}
```

Call this in the main plugin export (alongside the existing `writeFdroidManifest` call).

### Step 2: Update `RELEASE_FDROID_BUILD_TYPE` to reference the new rules file

```groovy
releaseFdroid {
    initWith release
    signingConfig signingConfigs.debug
    matchingFallbacks = ["release"]
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro', 'proguard-fdroid-strip.pro'
}
```

The `proguard-fdroid-strip.pro` file is only written when `CABLESNAP_FDROID=1`, so it only exists during F-Droid prebuild. The `release` build type does NOT reference it.

### Step 3: Keep existing coordinate exclusions

The `FDROID_EXCLUDES_BLOCK` with `configurations.all { exclude group: ... }` can remain as a first-pass filter. R8 stripping is belt-and-suspenders for the shaded classes. Belt-and-suspenders is good here.

### Step 4: Update tests

In `__tests__/plugins/with-wearos-module.test.js`, add a test that:
- When `CABLESNAP_FDROID=1`, confirms `proguard-fdroid-strip.pro` is written to `android/app/`
- Confirms the file contains `-assumenosideeffects class com.google.firebase.**`
- When `CABLESNAP_FDROID` is unset, confirms the file is NOT written

### Why this works

R8 performs **dead code elimination (tree shaking)** across ALL classes in the DEX, including those bundled inside AARs. Since the F-Droid build:
- Has barcode scanning disabled (`project.ext.barcodeScannerEnabled = false`)
- Has no Firebase messaging code paths in F-Droid app code
- Has no install referrer usage

R8 will see these classes as unreachable dead code and eliminate them from the output DEX. The `-assumenosideeffects` directive tells R8 it's safe to remove them even if R8 cannot statically prove they're unreachable (defensive measure).

### Play variant safety

The `proguard-fdroid-strip.pro` file:
1. Is only written when `CABLESNAP_FDROID=1` (not during Play builds)
2. Is only referenced in the `releaseFdroid` build type declaration
3. The `release` build type uses its own `proguard-rules.pro` only

If the Play APK is built from a tree where `proguard-fdroid-strip.pro` happens to exist (it shouldn't, but defensively), adding the `proguardFiles` line ONLY in the `releaseFdroid` block means the `release` build type never loads it.
