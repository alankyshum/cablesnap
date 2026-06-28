import { Platform } from "react-native";

/**
 * Native (default) implementation — see `useSkiaWebInit.web.ts` for web.
 *
 * On native, CanvasKit ships inside the app binary, so Skia is always ready
 * and charts can mount immediately. This default module deliberately does NOT
 * `import("@shopify/react-native-skia/.../LoadSkiaWeb")`: that web entrypoint
 * statically imports `canvaskit-wasm/bin/full/canvaskit`, whose JS `require`s
 * Node's `fs`. Metro traverses dynamic `import()` targets into EVERY platform
 * bundle regardless of runtime `Platform.OS` guards, so importing the web
 * loader here (even behind an `if (Platform.OS === "web")`) drags
 * `canvaskit-wasm` into the Android/iOS bundle graph and fails the release
 * bundle with `Unable to resolve module fs from .../canvaskit.js` (BLD-2078).
 *
 * Metro's platform-extension resolution picks `useSkiaWebInit.web.ts` for the
 * web bundle and this file for native, so the web-only `canvaskit-wasm`
 * dependency never enters a native bundle. This mirrors the existing
 * `hooks/useColorScheme.ts` / `useColorScheme.web.ts` split.
 */
export function useSkiaWebInit(): boolean {
  // Defensive: this module is the native resolution, but guard anyway so a
  // mis-resolution can never report "not ready" on web.
  return Platform.OS !== "web";
}
