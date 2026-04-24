/**
 * Web-platform capability detection.
 *
 * CableSnap uses `expo-sqlite` on web, which in turn uses a Web Worker
 * with synchronous message passing backed by `SharedArrayBuffer` +
 * `Atomics`.  `drizzle-orm/expo-sqlite` calls only the sync worker API
 * (`prepareSync` / `executeSync` / `getAllSync`), so on the web build
 * every query requires `SharedArrayBuffer` at runtime.
 *
 * `SharedArrayBuffer` is only exposed to pages served with
 * cross-origin isolation enabled — i.e., COOP: `same-origin` AND
 * COEP: `require-corp` — delivered via **HTTP response headers**.
 * `<meta http-equiv="Cross-Origin-Opener-Policy">` does NOT enable
 * isolation per the HTML spec (only COEP can be set via meta).  On
 * hosts without real HTTP headers, `SharedArrayBuffer` is `undefined`
 * and drizzle's first query throws
 * `ReferenceError: SharedArrayBuffer is not defined`.
 *
 * See BLD-565 and Sentry issue
 *   https://cablesnap.sentry.io/issues/7437437393/
 * for the original report.
 */

export type WebSharedMemorySupport = {
  supported: boolean;
  /** Stable string we surface to the user + log to Sentry. */
  reason?: "missing_shared_array_buffer" | "not_cross_origin_isolated";
};

export function detectWebSharedMemorySupport(): WebSharedMemorySupport {
  if (typeof globalThis === "undefined") {
    return { supported: false, reason: "missing_shared_array_buffer" };
  }
  if (typeof (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === "undefined") {
    return { supported: false, reason: "missing_shared_array_buffer" };
  }
  // `crossOriginIsolated` is only defined in browser-like globals.  When
  // it IS defined and false, SAB may still be a visible identifier on
  // some browsers but constructing it throws — treat as unsupported.
  const coi = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  if (typeof coi === "boolean" && coi === false) {
    return { supported: false, reason: "not_cross_origin_isolated" };
  }
  return { supported: true };
}

export const WEB_UNSUPPORTED_MESSAGE =
  "This web build requires a cross-origin-isolated host (COOP/COEP HTTP headers). " +
  "Please use the iOS or Android app, or serve the web bundle with the correct headers.";
