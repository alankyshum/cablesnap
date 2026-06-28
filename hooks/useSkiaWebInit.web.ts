import { useState, useEffect } from "react";
import { Platform } from "react-native";

/**
 * Web implementation of the CanvasKit readiness signal. The native (default)
 * variant lives in `useSkiaWebInit.ts` and returns `true` immediately without
 * importing any `canvaskit-wasm` code — see that file for why the web loader
 * must NOT be imported from a module that also resolves on native.
 *
 * Returns `true` only when charts can safely render on web:
 *   - `false` until `global.CanvasKit` is actually populated by `LoadSkiaWeb()`.
 *     It stays `false` if loading fails — it NEVER fails open. Callers MUST
 *     treat `false` as "do not mount a chart" and render a placeholder instead
 *     (see `components/ui/ChartGate`).
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
 *
 * BLD-2125 root cause: CanvasKit builds the WASM URL as `prefix + "canvaskit.wasm"`
 * where `prefix` defaults to `""` on web. On pages served at a sub-path (e.g.
 * the `/__test__/stack-marker` harness), the relative URL resolves to
 * `/__test__/canvaskit.wasm` — a path that does not exist. Metro's SPA handler
 * returns the fallback HTML for that path. WebAssembly.instantiateStreaming then
 * tries to compile the HTML bytes, hits the magic-number mismatch, and calls
 * CanvasKit's internal `abort()`. abort() both rejects an internal module-level
 * Promise (creating an unhandled rejection) AND throws a WebAssembly.RuntimeError.
 * The throw is caught by our try/catch, but the internal Promise rejection escapes
 * to the global `unhandledrejection` handler, which Expo's dev-mode LogBox
 * captures and displays as a full-screen error overlay — blocking all pointer
 * events in e2e scenario tests (BLD-2125: form-clip-compare, session-pacing,
 * stack-marker).
 *
 * Fix: pass `locateFile: (f) => '/' + f` to LoadSkiaWeb(). This overrides the
 * relative path resolution and forces CanvasKit to always fetch `/canvaskit.wasm`
 * at the absolute root URL, which works correctly from any page sub-path.
 * The WASM availability probe is a belt-and-suspenders guard: it checks the first
 * 4 bytes of the WASM (the magic signature 0x00 0x61 0x73 0x6D) before calling
 * LoadSkiaWeb, so the fatal unhandled rejection never occurs even when the WASM is
 * genuinely unavailable (e.g. in dev without `public/canvaskit.wasm` present).
 */

const CANVASKIT_POLL_INTERVAL_MS = 100;
const CANVASKIT_POLL_MAX_MS = 30_000;
const LOAD_SKIA_MAX_ATTEMPTS = 5;
const LOAD_SKIA_RETRY_BACKOFF_MS = 250;
const CANVASKIT_WASM_PATH = "/canvaskit.wasm";

function canvasKitReady(): boolean {
  return typeof (globalThis as { CanvasKit?: unknown }).CanvasKit !== "undefined";
}

/**
 * BLD-2125: Probe /canvaskit.wasm availability by fetching the first 4 bytes
 * and checking for the WebAssembly magic bytes (0x00 0x61 0x73 0x6D = "\0asm").
 *
 * A HEAD-then-Content-Type check is unreliable: Metro's dev server can return a
 * non-HTML content-type for HEAD requests but serve the SPA fallback HTML body
 * on GET (the streaming WASM compile then fails with "Aborted(CompileError:
 * WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44
 * 4f @+0)"). Checking the first 4 bytes via a Range request is the only
 * reliable way to distinguish WASM from HTML without downloading the 8 MB file.
 *
 * We fetch with `Range: bytes=0-3` so only 4 bytes are transferred, verify the
 * WASM magic signature, and return true only when the response is a real WASM
 * binary. If the server does not honour Range requests the response falls back
 * to a 200 with the full body — we still check the first 4 bytes.
 *
 * Exported for unit testing.
 */
export async function canvasKitWasmAvailable(): Promise<boolean> {
  try {
    const res = await fetch(CANVASKIT_WASM_PATH, {
      // Range: bytes=0-3 — retrieve only the 4-byte WASM magic header.
      // Servers that don't support Range respond with 200 + full body; we
      // still check the first 4 bytes, which is sufficient.
      headers: { Range: "bytes=0-3" },
    });
    if (!res.ok && res.status !== 206) return false;
    // Read the first 4 bytes of the response body.
    const reader = res.body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    reader.releaseLock();
    if (!value || value.length < 4) return false;
    // WebAssembly magic bytes: 0x00 0x61 0x73 0x6D ("\0asm")
    return value[0] === 0x00 && value[1] === 0x61 && value[2] === 0x73 && value[3] === 0x6d;
  } catch {
    return false;
  }
}

export function useSkiaWebInit(): boolean {
  // Start `true` only if CanvasKit is already populated (e.g. from an earlier
  // mount / navigation), otherwise `false` until the loader/poll below flips
  // it. `Platform.OS !== "web"` is defensive — this module is only resolved by
  // Metro for the web bundle, but if it ever ran on native CanvasKit ships in
  // the binary and is ready immediately.
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
          // BLD-2125: probe WASM availability before calling LoadSkiaWeb().
          // If /canvaskit.wasm isn't served as a binary (e.g. Metro dev server
          // returns the SPA HTML fallback), calling LoadSkiaWeb() triggers an
          // internal WebAssembly.RuntimeError abort that escapes our try/catch
          // as an unhandled Promise rejection, surfacing as an Expo LogBox
          // error overlay that blocks all pointer events in e2e tests.
          // Skip LoadSkiaWeb() when the WASM isn't available; the retry loop
          // and polling will succeed once a static server that has the WASM
          // is used.
          const wasmAvailable = await canvasKitWasmAvailable();
          if (!wasmAvailable) {
            // WASM not ready on this host/server — wait and retry.
            await new Promise((r) => setTimeout(r, LOAD_SKIA_RETRY_BACKOFF_MS));
            continue;
          }

          const mod = await import(
            "@shopify/react-native-skia/lib/module/web/LoadSkiaWeb"
          );
          // BLD-2125: pass locateFile to force the absolute /canvaskit.wasm
          // path instead of a URL relative to the current page. Without this,
          // pages served at sub-paths (e.g. /__test__/stack-marker) resolve
          // the relative "canvaskit.wasm" to "/__test__/canvaskit.wasm" which
          // doesn't exist → SPA fallback HTML → WebAssembly magic-byte mismatch
          // → internal abort() unhandled Promise rejection → Expo LogBox overlay.
          await mod.LoadSkiaWeb({ locateFile: (file: string) => "/" + file });
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
