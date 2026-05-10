import * as Sentry from "@sentry/react-native";

export function captureStravaError(
  err: unknown,
  flow: string,
  step: string,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureException(err, { tags: { flow, step }, extra });
}

export function stravaBreakcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: "strava", message, data });
}

/**
 * Emit a structured Sentry log for a Strava lifecycle checkpoint.
 *
 * Unlike `stravaBreakcrumb` (which only attaches to exception events),
 * these calls go to the Sentry logs (`ourlogs`) dataset so we have
 * verifiable happy-path signal. Init config sets `enableLogs: true`
 * (see `app/_layout.tsx`).
 *
 * Never pass secrets (tokens, client_secret, raw auth codes, Authorization
 * headers). Scalars only (IDs, status codes, resultType).
 *
 * Uses optional chaining so older @sentry/react-native SDKs that do not
 * export `logger` do not throw at runtime.
 */
export function stravaLog(
  level: "info" | "warn" | "error",
  message: string,
  attrs?: Record<string, unknown>,
): void {
  try {
    const logger = (Sentry as unknown as {
      logger?: {
        info?: (msg: string, attrs?: Record<string, unknown>) => void;
        warn?: (msg: string, attrs?: Record<string, unknown>) => void;
        error?: (msg: string, attrs?: Record<string, unknown>) => void;
      };
    }).logger;
    logger?.[level]?.(message, attrs);
  } catch {
    // Logging must never break the app flow.
  }
}
