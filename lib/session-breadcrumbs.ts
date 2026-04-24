/**
 * Session lifecycle + timer + AppState + keep-awake breadcrumbs (BLD-577).
 *
 * We don't have a reliable battery-drain repro for the Z Fold6 report in
 * GitHub issue #336, so the next best thing is to make the problem
 * DIAGNOSABLE when it recurs: every Sentry event captured during a
 * session will carry a trail of exactly what the foreground session was
 * doing (which timers were live, when AppState flipped, whether a
 * keep-awake was held). Scalars only — no PII, no set weights/reps.
 *
 * Wrapped in try/catch because the CableSnap app must never crash
 * because Sentry isn't initialized (e.g. test harness, dev build without
 * DSN).
 */
import * as Sentry from "@sentry/react-native";

export type SessionEvent =
  | "session.open"
  | "session.close"
  | "session.keepawake.acquire"
  | "session.keepawake.release"
  | "session.appstate.active"
  | "session.appstate.background"
  | "session.appstate.inactive"
  | "timer.set.start"
  | "timer.set.stop"
  | "timer.set.dismiss"
  | "timer.rest.start"
  | "timer.rest.dismiss"
  | "timer.session.start"
  | "timer.session.stop";

export function sessionBreadcrumb(
  event: SessionEvent,
  data?: Record<string, string | number | boolean | null | undefined>,
): void {
  try {
    Sentry.addBreadcrumb({
      category: "session",
      type: "info",
      level: "info",
      message: event,
      data,
    });
  } catch {
    // Sentry not initialized — breadcrumbs are observability glue, never
    // critical path. Swallow.
  }
}
