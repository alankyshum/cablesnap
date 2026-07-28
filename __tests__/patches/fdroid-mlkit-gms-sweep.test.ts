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

  it("BLD-4491: generated BarcodeScannerResultSerializer builds a MutableList<Int> cornerPoints (not emptyList())", () => {
    // expo-camera's BarCodeScannerResult constructor declares
    //   var cornerPoints: MutableList<Int>
    // The stub previously passed emptyList() (List<Int>), which fails to
    // type-check: "Argument type mismatch: actual type is List<T>, but
    // MutableList<Int> was expected." This broke compileReleaseKotlin and the
    // Scheduled Release workflow (run #30320838321). The stub must use
    // mutableListOf<Int>() so it satisfies the MutableList<Int> parameter.
    process.env.CABLESNAP_FDROID = "1";
    runPatch();
    const out = fs.readFileSync(
      path.join(cam, "analyzers", "BarcodeScannerResultSerializer.kt"),
      "utf8"
    );
    expect(out).toContain("mutableListOf<Int>()");
    expect(out).not.toMatch(/Bundle\(\),\s*emptyList\(\)/);
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
});
