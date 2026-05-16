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
// - "disabled"    : BLD-1262. Caller asked the hook to stand down (e.g. on
//                   web hosts without SharedArrayBuffer, where useAppInit
//                   already short-circuits DB init per BLD-565). The hook
//                   MUST NOT call getDatabase() in this state — invoking
//                   it would risk a `ReferenceError: SharedArrayBuffer is
//                   not defined` from drizzle/expo-sqlite.
export type DatabaseStatus =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "unavailable"; error: DatabaseUnavailableError; sentryEventId?: string; retry: () => void }
  | { kind: "error"; error: Error }
  | { kind: "disabled" };

export type UseDatabaseStatusOptions = {
  /**
   * BLD-1262: when true, the hook is a no-op — it does NOT invoke
   * `getDatabase()` and stays in `{ kind: "disabled" }` indefinitely.
   * Used by `app/_layout.tsx` to gate DB init behind the
   * `webUnsupported` (no-SharedArrayBuffer) render branch so we don't
   * regress BLD-565.
   */
  disabled?: boolean;
};

export function useDatabaseStatus(options: UseDatabaseStatusOptions = {}): DatabaseStatus {
  const { disabled = false } = options;
  const [status, setStatus] = useState<DatabaseStatus>(() =>
    disabled ? { kind: "disabled" } : { kind: "pending" }
  );
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    resetDatabaseInit();
    setStatus({ kind: "pending" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    // BLD-1262: short-circuit BEFORE getDatabase() so we never reach
    // drizzle/expo-sqlite on web hosts that lack SharedArrayBuffer.
    // `disabled` is treated as session-stable by callers (useAppInit
    // computes `webUnsupported` via useMemo on first render), so the
    // initial state is already `{ kind: "disabled" }` and we simply
    // skip the init effect — no setState needed inside the effect body.
    if (disabled) {
      return;
    }
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
  }, [attempt, retry, disabled]);

  return status;
}
