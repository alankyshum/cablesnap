/**
 * BLD-2125 regression-lock: useSkiaWebInit.web.ts must NOT call LoadSkiaWeb()
 * when /canvaskit.wasm is unavailable or is the SPA HTML fallback.
 *
 * Calling LoadSkiaWeb() with an invalid WASM file triggers an internal
 * WebAssembly.RuntimeError abort that propagates as an unhandled Promise
 * rejection, surfacing as an Expo LogBox error overlay that blocks all pointer
 * events in e2e scenario tests (form-clip-compare, session-pacing, stack-marker).
 *
 * Root cause: Metro dev server returns the SPA fallback HTML for /canvaskit.wasm,
 * but the Content-Type header may not be `text/html` (HEAD vs GET discrepancy).
 * A byte-level magic-number check is the only reliable probe.
 *
 * This suite tests:
 *   1. canvasKitWasmAvailable() — the probe function (unit tests, directly).
 *   2. useSkiaWebInit integration — confirms ready stays false when probe is false.
 */

// Mock fetch before any module loads.
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Platform to simulate web environment.
jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

import { renderHook, act } from "@testing-library/react-native";

// Import the exported probe function and hook directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { canvasKitWasmAvailable, useSkiaWebInit } = require("../../hooks/useSkiaWebInit.web");

// ────────────────────────────────────────────────────────────────────────────
// WASM magic bytes helper (0x00 0x61 0x73 0x6D = "\0asm")
// ────────────────────────────────────────────────────────────────────────────

const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
const HTML_START = new Uint8Array([0x3c, 0x21, 0x44, 0x4f]); // "<!DO"

/** Build a mock ReadableStream that yields the given bytes. */
function mockBodyReader(bytes: Uint8Array) {
  let done = false;
  return {
    getReader: () => ({
      read: () => {
        if (done) return Promise.resolve({ value: undefined, done: true });
        done = true;
        return Promise.resolve({ value: bytes, done: false });
      },
      releaseLock: jest.fn(),
    }),
  };
}

/** Build a minimal fetch Response mock. */
function mockResponse(
  status: number,
  body: Uint8Array,
  ok = true,
): object {
  return {
    ok,
    status,
    body: mockBodyReader(body),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. canvasKitWasmAvailable() unit tests
// ────────────────────────────────────────────────────────────────────────────

describe("canvasKitWasmAvailable — BLD-2125 WASM magic-byte probe", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns true when the first 4 bytes are the WASM magic number (0x00 0x61 0x73 0x6D)", async () => {
    mockFetch.mockResolvedValue(mockResponse(206, WASM_MAGIC));
    expect(await canvasKitWasmAvailable()).toBe(true);
  });

  it("returns false when the first 4 bytes are HTML (0x3c 0x21 0x44 0x4f = '<!DO')", async () => {
    // This is the Metro dev server SPA fallback scenario (BLD-2125 root cause).
    mockFetch.mockResolvedValue(mockResponse(200, HTML_START));
    expect(await canvasKitWasmAvailable()).toBe(false);
  });

  it("returns false when the response is not OK and not 206", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      body: mockBodyReader(new Uint8Array()),
    });
    expect(await canvasKitWasmAvailable()).toBe(false);
  });

  it("returns false when the response has no body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    });
    expect(await canvasKitWasmAvailable()).toBe(false);
  });

  it("returns false when the fetch throws a network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await canvasKitWasmAvailable()).toBe(false);
  });

  it("returns false when the response body is fewer than 4 bytes", async () => {
    mockFetch.mockResolvedValue(mockResponse(206, new Uint8Array([0x00, 0x61])));
    expect(await canvasKitWasmAvailable()).toBe(false);
  });

  it("accepts a 200 response (Range not honoured) with the WASM magic bytes", async () => {
    // Some servers respond with 200 + full body instead of 206 + range.
    mockFetch.mockResolvedValue(mockResponse(200, WASM_MAGIC));
    expect(await canvasKitWasmAvailable()).toBe(true);
  });

  it("sends a Range: bytes=0-3 request to avoid downloading the 8 MB file", async () => {
    mockFetch.mockResolvedValue(mockResponse(206, WASM_MAGIC));
    await canvasKitWasmAvailable();
    expect(mockFetch).toHaveBeenCalledWith(
      "/canvaskit.wasm",
      expect.objectContaining({ headers: { Range: "bytes=0-3" } }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. useSkiaWebInit hook integration — safety gate tests (BLD-2125)
// ────────────────────────────────────────────────────────────────────────────

describe("useSkiaWebInit — BLD-2125 safety gate", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete (globalThis as Record<string, unknown>).CanvasKit;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).CanvasKit;
  });

  it("stays ready=false and probes /canvaskit.wasm when the body starts with HTML bytes", async () => {
    // BLD-2125 root cause: Metro returns HTML body for /canvaskit.wasm.
    mockFetch.mockResolvedValue(mockResponse(200, HTML_START));

    const { result } = renderHook(() => useSkiaWebInit());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/canvaskit.wasm",
      expect.objectContaining({ headers: { Range: "bytes=0-3" } }),
    );
    expect(result.current).toBe(false);
  });

  it("stays ready=false when the WASM probe returns 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: mockBodyReader(new Uint8Array()) });

    const { result } = renderHook(() => useSkiaWebInit());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current).toBe(false);
  });

  it("stays ready=false when the WASM probe fetch throws", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useSkiaWebInit());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current).toBe(false);
  });

  it("starts ready=true if CanvasKit is already populated before mount", () => {
    (globalThis as Record<string, unknown>).CanvasKit = { XYWHRect: jest.fn() };

    const { result } = renderHook(() => useSkiaWebInit());

    expect(result.current).toBe(true);
  });

  it("becomes ready=true via polling when CanvasKit is set externally", async () => {
    // Probe says WASM available.
    mockFetch.mockResolvedValue(mockResponse(206, WASM_MAGIC));

    const { result } = renderHook(() => useSkiaWebInit());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
      (globalThis as Record<string, unknown>).CanvasKit = { XYWHRect: jest.fn() };
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current).toBe(true);
  });
});
