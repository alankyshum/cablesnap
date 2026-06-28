/**
 * BLD-2125 regression-lock for `canvaskitLocateFile`.
 *
 * Root cause recap: `LoadSkiaWeb()` was called with NO `locateFile`, so
 * emscripten/CanvasKit resolved `canvaskit.wasm` relative to its own JS chunk
 * (`/_expo/static/js/web/canvaskit.wasm`) — a path that 404s under a SPA static
 * host and is rewritten to `index.html`. CanvasKit then tried to compile HTML
 * as WASM and aborted with an UNCAUGHT `pageerror`, which mounted the Expo
 * LogBox `#error-overlay` on every web route and blocked all pointer events
 * (form-clip-compare / session-pacing / stack-marker scenario failures).
 *
 * The fix points CanvasKit at the root-staged `/canvaskit.wasm` (placed there by
 * `scripts/skia-setup.js` → `public/canvaskit.wasm` → bundle root). These tests
 * lock that mapping so a future refactor cannot silently reintroduce the
 * relative-resolution bug.
 */
import { canvaskitLocateFile } from "../../hooks/canvaskitLocateFile";

describe("canvaskitLocateFile (BLD-2125)", () => {
  const originalLocation = (globalThis as { location?: unknown }).location;

  function setOrigin(origin: string | undefined): void {
    if (origin === undefined) {
      // Simulate a non-browser global (e.g. SSR/prerender) with no location.
      delete (globalThis as { location?: unknown }).location;
      return;
    }
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin },
    });
  }

  afterEach(() => {
    if (originalLocation === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("maps the CanvasKit WASM to the origin-rooted staged path", () => {
    setOrigin("http://localhost:8081");
    expect(canvaskitLocateFile("canvaskit.wasm")).toBe(
      "http://localhost:8081/canvaskit.wasm",
    );
  });

  it("roots ANY .wasm file at origin (not just canvaskit.wasm)", () => {
    setOrigin("https://example.com");
    expect(canvaskitLocateFile("some-other.wasm")).toBe(
      "https://example.com/some-other.wasm",
    );
  });

  it("never returns the JS-chunk-relative path that 404s on a SPA host", () => {
    setOrigin("https://example.com");
    const resolved = canvaskitLocateFile("canvaskit.wasm");
    // The pre-fix bug fetched a path under the JS bundle dir.
    expect(resolved).not.toContain("_expo/static/js");
    // Must be an absolute, origin-anchored URL so it resolves to the bundle root.
    expect(resolved.startsWith("https://example.com/")).toBe(true);
  });

  it("falls back to a leading-slash absolute path when origin is unavailable", () => {
    setOrigin(undefined);
    // With no origin we still emit an absolute (root-anchored) URL — never a
    // bare relative filename that would resolve next to the JS chunk.
    expect(canvaskitLocateFile("canvaskit.wasm")).toBe("/canvaskit.wasm");
  });

  it("passes non-WASM asset names through unchanged", () => {
    setOrigin("http://localhost:8081");
    expect(canvaskitLocateFile("canvaskit.js")).toBe("canvaskit.js");
    expect(canvaskitLocateFile("anything-else")).toBe("anything-else");
  });
});
