/**
 * Resolve where emscripten/CanvasKit should fetch the staged Skia WASM on web.
 *
 * Extracted as a standalone, platform-agnostic, side-effect-free module so it
 * can be unit-tested without importing `useSkiaWebInit.web.ts` (which lazily
 * `import()`s `@shopify/react-native-skia` → `canvaskit-wasm`, a web-only dep
 * that must never enter a native/jest module graph). See BLD-2125.
 *
 * Background: `CanvasKitInit` (invoked by `LoadSkiaWeb`) resolves
 * `canvaskit.wasm` relative to the location of its OWN JS chunk by default —
 * under Expo's web output that is `/_expo/static/js/web/canvaskit.wasm`, which
 * does not exist. On a SPA static host (`npx serve -s dist`, our screenshot/e2e
 * pipeline and the deployed site) that 404 is rewritten to `index.html`, so
 * CanvasKit receives `<!DOCTYPE …>` instead of a WASM binary and aborts with
 * `WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f`.
 * That abort is rethrown OUTSIDE the awaited `LoadSkiaWeb()` promise chain, so
 * it surfaces as an uncaught `pageerror`, which mounts the Expo LogBox
 * `#error-overlay` on EVERY web route (the loader runs in the root
 * `app/_layout.tsx`) and intercepts all pointer events.
 *
 * `scripts/skia-setup.js` stages the binary at `public/canvaskit.wasm`, which
 * Expo copies to the bundle ROOT (`/canvaskit.wasm`). Returning an origin-rooted
 * absolute URL for any `.wasm` file points CanvasKit at that staged copy
 * regardless of where its JS chunk lives, so the fetch returns
 * `application/wasm` and CanvasKit initialises cleanly.
 */
export function canvaskitLocateFile(file: string): string {
  if (!file.endsWith(".wasm")) {
    // Non-WASM assets (CanvasKit ships none under our setup, but be defensive)
    // fall through to emscripten's default relative resolution.
    return file;
  }
  const origin =
    typeof globalThis !== "undefined" &&
    (globalThis as { location?: { origin?: string } }).location?.origin
      ? (globalThis as unknown as { location: { origin: string } }).location.origin
      : "";
  return `${origin}/${file}`;
}
