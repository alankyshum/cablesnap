# PLAN-BLD-4383 — Disable expo-camera MLKit barcode scanner in F-Droid build

Parent: BLD-4382 (Scheduled Release APK purity failure)
Owner: techlead → claudecoder (implementation)
Priority: critical (blocks Scheduled Release)

## Context

Workflow `.github/workflows/scheduled-release.yml` step `Build APK` fails the
`releaseFdroid` DEX purity grep because expo-camera 55.0.15 unconditionally
links `play-services-code-scanner`, `mlkit:barcode-scanning`, and
`camera-mlkit-vision` as `implementation` unless
`expo.camera.barcode-scanner-enabled=false` is set (see the module's
`android/build.gradle` — lines quoted in the ticket).

CI currently appends this property inline (scheduled-release.yml:380) as a
belt-and-suspenders step, but it is not in the config plugin, so a **local**
F-Droid build (`CABLESNAP_FDROID=1 expo prebuild && ./gradlew
:app:assembleReleaseFdroid`) does not inherit the flag. The ticket requires
the plugin route so local and CI paths match.

`plugins/with-wearos-module.js` already contains extensive F-Droid
patch logic (source rewrites, `configurations { exclude }`, node_modules
mutations). We add the property there. This is orthogonal to those patches
and — per the expo-camera build.gradle — is the officially supported way to
demote the barcode deps from `implementation` to `compileOnly` so their
classes never enter the APK.

## Root cause (confirmed by ticket, verified in tree)

`node_modules/expo-camera/android/build.gradle`:

```gradle
def barcodeScannerEnabled = findProperty('expo.camera.barcode-scanner-enabled')
def isBarcodeScannerEnabled = (barcodeScannerEnabled ?: "true").toString() != "false"
def barcodeDependencyConfiguration = isBarcodeScannerEnabled ? "implementation" : "compileOnly"
add(barcodeDependencyConfiguration, "com.google.android.gms:play-services-code-scanner:16.1.0")
add(barcodeDependencyConfiguration, "com.google.mlkit:barcode-scanning:17.3.0")
add(barcodeDependencyConfiguration, "androidx.camera:camera-mlkit-vision:${camerax_version}")
```

`compileOnly` deps are NOT packaged. Setting the Gradle property to `false`
is the upstream-sanctioned kill switch.

## Change (single surface, ≤30 LOC in plugin)

### File: `plugins/with-wearos-module.js`

1. Add `withGradleProperties` to the existing import block from
   `expo/config-plugins`.
2. Add a new module-level helper `withFdroidGradleProperties(config)` that,
   **only when `process.env.CABLESNAP_FDROID === "1"`**, appends the property
   `expo.camera.barcode-scanner-enabled=false` to `android/gradle.properties`.
   Guarded by a sentinel marker (`# cablesnap:fdroid:camera-barcode-off`) so
   the plugin is idempotent, matching the sentinel discipline in the rest of
   the file.
3. Wire it into the plugin chain (before the `withDangerousMod` copy step is
   fine — the important ordering is that it runs during `expo prebuild`, i.e.
   before Gradle configure).

The property is a NO-OP on the Play `release` build type because it is only
read by expo-camera's `build.gradle`, which resolves at Gradle configure
time; setting it disables the ML Kit graph across every variant — but since
CableSnap already ships `expo-foss-barcode-scanner` and never uses
expo-camera's built-in scanner (`components/BarcodeScanner.tsx` selects the
FOSS view unconditionally on Android — verify), the Play build is
functionally unaffected.

### CI (`.github/workflows/scheduled-release.yml`)

Leave the inline `printf ... >> android/gradle.properties` step in place as
defence-in-depth. It becomes a no-op after the plugin lands (the property
line is already present via prebuild). Do NOT remove; belt-and-suspenders is
cheap and de-risks a stale prebuild cache. Add a one-line comment noting the
plugin now sets this.

### Play safety verification

Read `components/BarcodeScanner.tsx` and confirm the Android path uses
`FossBarcodeScannerView` (from `modules/expo-foss-barcode-scanner`), not
expo-camera's `CameraView` scanner API. Note in PR body. If (unexpectedly)
Play uses expo-camera's scanner, escalate — do NOT ship.

## Acceptance criteria (from ticket)

- [ ] `android/gradle.properties` contains `expo.camera.barcode-scanner-enabled=false` after
      `CABLESNAP_FDROID=1 npx expo prebuild --clean --platform android`.
- [ ] Same command without `CABLESNAP_FDROID=1` does NOT add the line (Play unaffected).
- [ ] `Build APK` job's F-Droid DEX purity grep passes on the merged commit.
- [ ] Play `:app:assembleRelease` unchanged in CI.
- [ ] `components/BarcodeScanner.tsx` still selects FOSS view on F-Droid.
- [ ] No new lint warnings.

## Out of scope

- Removing the existing exclude/patch logic in `with-wearos-module.js`
  (parallel guards; leaving them reduces risk).
- Any change to `expo-foss-barcode-scanner`.

## Delivery

- Branch: `run/techlead-BLD-4383` (already checked out).
- Atomic conventional commits (single commit fine: `fix(fdroid): disable
  expo-camera barcode scanner via gradle property (BLD-4383)`).
- Open PR against `main`. Body references BLD-4383 and BLD-4382.
- Move issue to `in_review`; wake @quality-director for purity gate
  verification.
