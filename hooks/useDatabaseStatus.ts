import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  getDatabase,
  getDatabaseFailure,
  isDatabaseUnavailableError,
  resetDatabaseInit,
  type DatabaseUnavailableError,
} from "../lib/db";

// BLD-1257: status reported by useDatabaseStatus().
//
// - "pending"     : initial mount; init has not resolved or rejected yet.
// - "ready"       : init resolved; the app can render its normal tree.
// - "unavailable" : init rejected with DatabaseUnavailableError. Caller
//                   should render DatabaseUnavailableScreen instead of the
//                   normal app tree. retry() will clear the cached failure
//                   and re-run init.
// - "error"       : init rejected with a non-DatabaseUnavailableError
//                   (legacy path — surfaced to LayoutBanners for parity).
export type DatabaseStatus =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "unavailable"; error: DatabaseUnavailableError; sentryEventId?: string; retry: () => void }
  | { kind: "error"; error: Error };

export function useDatabaseStatus(): DatabaseStatus {
  const [status, setStatus] = useState<DatabaseStatus>({ kind: "pending" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    resetDatabaseInit();
    setStatus({ kind: "pending" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then(() => {
        if (cancelled) return;
        setStatus({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isDatabaseUnavailableError(err) && Platform.OS !== "web") {
          const failure = getDatabaseFailure();
          setStatus({
            kind: "unavailable",
            error: err,
            sentryEventId: failure?.sentryEventId,
            retry,
          });
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setStatus({ kind: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  return status;
}
