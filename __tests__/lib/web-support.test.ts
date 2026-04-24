/**
 * @jest-environment node
 */
import { detectWebSharedMemorySupport, WEB_UNSUPPORTED_MESSAGE } from "../../lib/web-support";

describe("detectWebSharedMemorySupport", () => {
  const originalSAB = (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
  const originalCOI = Object.getOwnPropertyDescriptor(globalThis, "crossOriginIsolated");

  afterEach(() => {
    if (originalSAB === undefined) {
      delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
    } else {
      (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer = originalSAB;
    }
    if (originalCOI) {
      Object.defineProperty(globalThis, "crossOriginIsolated", originalCOI);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).crossOriginIsolated;
    }
  });

  it("reports missing_shared_array_buffer when SharedArrayBuffer is undefined", () => {
    delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
    expect(detectWebSharedMemorySupport()).toEqual({
      supported: false,
      reason: "missing_shared_array_buffer",
    });
  });

  it("reports not_cross_origin_isolated when SAB exists but crossOriginIsolated=false", () => {
    (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer = ArrayBuffer;
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: false,
      configurable: true,
      writable: true,
    });
    expect(detectWebSharedMemorySupport()).toEqual({
      supported: false,
      reason: "not_cross_origin_isolated",
    });
  });

  it("reports supported when SAB exists and crossOriginIsolated=true", () => {
    (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer = ArrayBuffer;
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true,
      writable: true,
    });
    expect(detectWebSharedMemorySupport()).toEqual({ supported: true });
  });

  it("reports supported when SAB exists and crossOriginIsolated is not defined (native runtimes)", () => {
    (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer = ArrayBuffer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).crossOriginIsolated;
    expect(detectWebSharedMemorySupport()).toEqual({ supported: true });
  });

  it("exports a user-facing message that references headers", () => {
    expect(WEB_UNSUPPORTED_MESSAGE).toMatch(/COOP\/COEP/);
    expect(WEB_UNSUPPORTED_MESSAGE).toMatch(/iOS or Android/);
  });
});
