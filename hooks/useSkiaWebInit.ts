import { useState, useEffect } from "react";
import { Platform } from "react-native";

/**
 * Web-only: waits for react-native-skia's CanvasKit WASM to initialise before
 * returning `true`.  On native the hook returns `true` immediately (Skia is
 * always available).  On web it returns `false` until LoadSkiaWeb resolves
 * (or rejects — in which case we still unblock the tree so charts degrade
 * gracefully rather than blocking the whole app).
 *
 * BLD-2078: CartesianChart calls into CanvasKit synchronously at render-time.
 * Without this gate the Progress tab throws
 * "Cannot read properties of undefined (reading 'XYWHRect')" on first render
 * when CanvasKit has not yet loaded.
 */
export function useSkiaWebInit(): boolean {
  const [skiaReady, setSkiaReady] = useState(Platform.OS !== "web");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    import("@shopify/react-native-skia/lib/module/web/LoadSkiaWeb")
      .then((m) => m.LoadSkiaWeb())
      .then(() => { if (!cancelled) setSkiaReady(true); })
      .catch(() => { if (!cancelled) setSkiaReady(true); });
    return () => { cancelled = true; };
  }, []);

  return skiaReady;
}
