/**
 * BLD-4399: Regression test for the F-Droid MLKit/GMS neutralization sweep
 * in plugins/with-wearos-module.js#patchFdroidLibrarySources.
 *
 * Background:
 *   The F-Droid variant of CableSnap excludes MLKit/GMS Maven artifacts, but
 *   expo-camera's CameraViewModule.kt and utils/CameraUtils.kt import and
 *   call GmsBarcodeScanning / GmsBarcodeScannerOptions and reflect on
 *   "com.google.mlkit.vision.barcode.BarcodeScanning". Even with the Maven
 *   dep gone, kotlinc emits proprietary class descriptors into the DEX,
 *   tripping the F-Droid purity gate:
 *     unzip -p classes*.dex | strings | grep 'com/google/(firebase|mlkit|android/gms)'
 *
 *   The prebuild patch neutralizes those source references (only when
 *   CABLESNAP_FDROID=1). This test locks the sweep behavior so future
 *   expo-camera bumps that add new call sites don't silently regress.
 *
 * Refs: BLD-4399 (parent BLD-4396).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Reset module registry between tests so CABLESNAP_FDROID env changes take
// effect on re-require.
describe("BLD-4399 patchFdroidLibrarySources — expo-camera MLKit/GMS sweep", () => {
  let tmp: string;
  let cam: string;
  const forbidden = /com\.google\.(mlkit|android\.gms)|GmsBarcodeScann/;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bld4399-"));
    cam = path.join(tmp, "node_modules", "expo-camera", "android", "src", "main", "java", "expo", "modules", "camera");
    fs.mkdirSync(path.join(cam, "utils"), { recursive: true });
    fs.mkdirSync(path.join(cam, "analyzers"), { recursive: true });
    // Sibling modules verify() also walks — create empty src trees so it
    // does not throw on missing directories.
    fs.mkdirSync(path.join(tmp, "node_modules", "expo-application", "android", "src"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "node_modules", "expo-notifications", "android", "src"), { recursive: true });
    // A CameraExceptions.kt is referenced by the stub replacement; provide it.
    fs.writeFileSync(path.join(cam, "CameraExceptions.kt"), `package expo.modules.camera
object CameraExceptions { class MLKitUnavailableException : RuntimeException() }
`);
    // Placeholder file with no forbidden references — must be left untouched.
    fs.writeFileSync(path.join(cam, "analyzers", "Placeholder.kt"), "package expo.modules.camera.analyzers\n");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.CABLESNAP_FDROID;
    jest.resetModules();
  });

  const runPatch = () => {
    // Load fresh copy so env-gated behavior is honored.
    jest.resetModules();
    const mod = require("../../plugins/with-wearos-module.js");
    mod.patchFdroidLibrarySources(tmp);
  };

  it("strips MLKit imports and neutralizes GmsBarcodeScanning* calls in CameraViewModule.kt", () => {
    fs.writeFileSync(path.join(cam, "CameraViewModule.kt"), `package expo.modules.camera

import expo.modules.kotlin.Promise
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import expo.modules.camera.records.BarcodeSettings

class CameraViewModule {
  fun definition() {
    AsyncFunction("launchScanner") { settings: BarcodeSettings, promise: Promise ->
      val opts = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(256).build()
      val scanner = GmsBarcodeScanning.getClient(context, opts)
      scanner.startScan()
        .addOnSuccessListener { promise.resolve(it.rawValue) }
        .addOnFailureListener { promise.reject("err", it.message, it) }
    }
  }
}
`);
    process.env.CABLESNAP_FDROID = "1";
    runPatch();
    const out = fs.readFileSync(path.join(cam, "CameraViewModule.kt"), "utf8");
    expect(out).not.toMatch(forbidden);
    expect(out).toMatch(/promise\.reject\(CameraExceptions\.MLKitUnavailableException\(\)\)/);
  });

  it("neutralizes Class.forName MLKit reflection and rewrites isMLKitBarcodeScannerAvailable in CameraUtils.kt", () => {
    fs.writeFileSync(path.join(cam, "utils", "CameraUtils.kt"), `package expo.modules.camera.utils

object CameraUtils {
  fun isMLKitBarcodeScannerAvailable(): Boolean {
    return try {
      Class.forName("com.google.mlkit.vision.barcode.BarcodeScanning")
      true
    } catch (e: ClassNotFoundException) { false }
  }
}
`);
    process.env.CABLESNAP_FDROID = "1";
    runPatch();
    const out = fs.readFileSync(path.join(cam, "utils", "CameraUtils.kt"), "utf8");
    expect(out).not.toMatch(forbidden);
    // The whole function is replaced — no dangling `catch` clause left behind.
    expect(out).toMatch(/fun isMLKitBarcodeScannerAvailable\(\): Boolean = false/);
    expect(out).not.toMatch(/catch\s*\(/);
  });

  it("sweeps a hypothetical NEW expo-camera source file with GMS refs (future-proof)", () => {
    // Simulates an expo-camera bump that introduces a new file we didn't
    // hardcode. The generic sweep must still neutralize it.
    fs.writeFileSync(path.join(cam, "NewScannerHelper.kt"), `package expo.modules.camera

import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.android.gms.tasks.Task

class NewScannerHelper {
  fun scan(): Any = GmsBarcodeScanning.getClient(context).startScan()
}
`);
    process.env.CABLESNAP_FDROID = "1";
    runPatch();
    const out = fs.readFileSync(path.join(cam, "NewScannerHelper.kt"), "utf8");
    expect(out).not.toMatch(forbidden);
  });

  it("is a no-op when CABLESNAP_FDROID is not set (Play build unchanged)", () => {
    const original = `package expo.modules.camera
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
class CameraViewModule
`;
    fs.writeFileSync(path.join(cam, "CameraViewModule.kt"), original);
    delete process.env.CABLESNAP_FDROID;
    runPatch();
    expect(fs.readFileSync(path.join(cam, "CameraViewModule.kt"), "utf8")).toBe(original);
  });

  // BLD-4490 regression guard: the real expo-camera@55.0.15 launchScanner body
  // contains nested if/try/catch/lambda blocks. The previous non-greedy
  // `[\s\S]*?^\s{0,6}\}` regex stopped at the first inner `}` (end of the
  // `isMLKitBarcodeScannerAvailable()` guard), producing a corrupted file with
  // dangling `if`/`try`/`catch` declarations at the class level → kotlinc
  // "Expecting member declaration" at ~line 193. Balanced-brace walking is
  // required. This fixture mirrors the shape of the real file.
  it("BLD-4490: correctly replaces the whole launchScanner block even with nested if/try/lambda braces", () => {
    fs.writeFileSync(path.join(cam, "CameraViewModule.kt"), `package expo.modules.camera

import expo.modules.kotlin.Promise
import expo.modules.kotlin.Exceptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import expo.modules.camera.records.BarcodeSettings

class CameraViewModule {
  fun definition() {
    AsyncFunction("launchScanner") { settings: BarcodeSettings, promise: Promise ->
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
            promise.resolve(barcode)
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
    }

    AsyncFunction("dismissScanner") {
      // no-op
    }
  }
}
`);
    process.env.CABLESNAP_FDROID = "1";
    runPatch();
    const out = fs.readFileSync(path.join(cam, "CameraViewModule.kt"), "utf8");

    // No residual MLKit/GMS symbols anywhere in the file.
    expect(out).not.toMatch(forbidden);
    // The whole launchScanner block collapsed to the stub. The following
    // AsyncFunction("dismissScanner") DSL block must remain intact.
    expect(out).toMatch(/AsyncFunction\("launchScanner"\)\s*\{\s*_:\s*BarcodeSettings,\s*promise:\s*Promise\s*->\s*promise\.reject\(CameraExceptions\.MLKitUnavailableException\(\)\)\s*\}/);
    expect(out).toMatch(/AsyncFunction\("dismissScanner"\)/);
    // No dangling class-level declarations left over from the corrupted
    // replacement: no bare `if`, `try`, or `catch` at member scope.
    expect(out).not.toMatch(/^\s*try\s*\{/m);
    expect(out).not.toMatch(/^\s*catch\s*\(/m);
    // The `dismissScanner` block still sits inside the class definition — no
    // stray braces closed the class early.
    const dismissIdx = out.indexOf('AsyncFunction("dismissScanner")');
    const classEndIdx = out.lastIndexOf("}");
    expect(dismissIdx).toBeGreaterThan(-1);
    expect(dismissIdx).toBeLessThan(classEndIdx);
    // Kotlin brace balance sanity check on the entire file.
    const opens = (out.match(/\{/g) || []).length;
    const closes = (out.match(/\}/g) || []).length;
    expect(opens).toBe(closes);
  });
});
