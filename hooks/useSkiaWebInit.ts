import { useState, useEffect } from "react";
import { Platform } from "react-native";

/**
 * Web-only readiness signal for react-native-skia's CanvasKit WASM.
 *
 * Returns `true` only when charts can safely render:
 *   - On native, `true` immediately (CanvasKit ships with the binary).
 *   - On web, `false` until `global.CanvasKit` is actually populated by
 *     `LoadSkiaWeb()`. It stays `false` if loading fails — it NEVER fails
 *     open. Callers MUST treat `false` as "do not mount a chart" and render a
 *     placeholder instead (see `components/ui/ChartGate`).
 *
 * BLD-2078: `victory-native`'s `CartesianChart` reads `CanvasKit.XYWHRect`
 * synchronously at render time. Mounting it before CanvasKit has loaded throws
 * `TypeError: Cannot read properties of undefined (reading 'XYWHRect')`, which
 * the app ErrorBoundary catches and turns into the "Something went wrong"
 * crash screen — visible in the public store screenshots.
 *
 * Why fail closed (and not the previous fail-open `.catch(() => setReady(true))`):
 * unblocking the tree on a CanvasKit load failure just lets the chart mount and
 * throw anyway. The only safe degraded state is "no chart", so we keep the flag
 * `false` and let the gate render a placeholder.
 *
 * Robustness on slow/static hosts: when the page is served by a plain static
 * server (e.g. `npx serve`, our screenshot pipeline) the WASM streaming-compile
 * is rejected and CanvasKit falls back to a slower ArrayBuffer instantiation.
 * We therefore (a) retry `LoadSkiaWeb()` a few times on transient failure and
 * (b) poll `global.CanvasKit` directly, so we flip to `true` as soon as the
 * global is populated by any path.
 */

const CANVASKIT_POLL_INTERVAL_MS = 100;
const CANVASKIT_POLL_MAX_MS = 30_000;
const LOAD_SKIA_MAX_ATTEMPTS = 5;
const LOAD_SKIA_RETRY_BACKOFF_MS = 250;

function canvasKitReady(): boolean {
  return typeof (globalThis as { CanvasKit?: unknown }).CanvasKit !== "undefined";
}

export function useSkiaWebInit(): boolean {
  // Native is always ready; on web start `true` only if CanvasKit is already
  // populated (e.g. from an earlier mount / navigation), otherwise `false`
  // until the loader/poll below flips it.
  const [ready, setReady] = useState(
    () => Platform.OS !== "web" || canvasKitReady(),
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // If CanvasKit is already populated the lazy initializer above set `ready`
    // to true; the load/poll below is then a cheap no-op (LoadSkiaWeb early
    // returns and the first poll clears itself), so we can run unconditionally
    // on mount without depending on `ready`.
    let cancelled = false;

    const markReadyIfLoaded = (): boolean => {
      if (!cancelled && canvasKitReady()) {
        setReady(true);
        return true;
      }
      return false;
    };

    // Drive LoadSkiaWeb with a bounded retry. A rejected attempt does NOT flip
    // the flag — only a populated `global.CanvasKit` does.
    const driveLoad = async () => {
      for (let attempt = 1; attempt <= LOAD_SKIA_MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          const mod = await import(
            "@shopify/react-native-skia/lib/module/web/LoadSkiaWeb"
          );
          await mod.LoadSkiaWeb();
          if (markReadyIfLoaded()) return;
        } catch {
          // Transient (e.g. "Failed to fetch" on the WASM under a contended
          // static server). Fall through to backoff + retry. Never fail open.
        }
        if (markReadyIfLoaded()) return;
        await new Promise((r) => setTimeout(r, LOAD_SKIA_RETRY_BACKOFF_MS));
      }
    };

    // Safety net: poll the global directly so we flip to ready the moment
    // CanvasKit is populated by any code path, even if our own LoadSkiaWeb
    // attempts all rejected but a concurrent loader succeeded.
    const startedAt = Date.now();
    const pollId = setInterval(() => {
      if (cancelled || markReadyIfLoaded() || Date.now() - startedAt > CANVASKIT_POLL_MAX_MS) {
        clearInterval(pollId);
      }
    }, CANVASKIT_POLL_INTERVAL_MS);

    void driveLoad();

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, []);

  return ready;
}
