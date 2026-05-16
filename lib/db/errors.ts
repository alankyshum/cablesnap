// BLD-1257: typed error for unrecoverable database init failures.
//
// Phases match the init pipeline in lib/db/helpers.ts:getDatabase():
//   open    → SQLite.openDatabaseAsync rejected (e.g. the Sentry REACT-NATIVE-7
//             NPE from NativeDatabase on Android 16 / Galaxy Z Fold 6)
//   probe   → openDatabaseAsync resolved but the SELECT 1 sanity check failed
//   pragma  → PRAGMA journal_mode = WAL / PRAGMA foreign_keys = ON failed
//   migrate → migrate() threw (schema migration failure)
//   seed    → seed() threw (initial data seeding failure)
//
// The error is thrown by getDatabase() AND cached on the global singleton so
// that subsequent callers in the same JS session receive the same rejection
// without re-attempting openDatabaseAsync/execAsync. The cache is only
// cleared by an explicit user-initiated retry via resetDatabaseInit().

export type DatabaseUnavailablePhase =
  | "open"
  | "probe"
  | "pragma"
  | "migrate"
  | "seed";

export class DatabaseUnavailableError extends Error {
  readonly phase: DatabaseUnavailablePhase;

  constructor(phase: DatabaseUnavailablePhase, cause: unknown) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? "unknown");
    super(`Database unavailable (phase=${phase}): ${causeMessage}`, {
      cause: cause instanceof Error ? cause : new Error(causeMessage),
    });
    this.name = "DatabaseUnavailableError";
    this.phase = phase;
    Object.setPrototypeOf(this, DatabaseUnavailableError.prototype);
  }
}

export function isDatabaseUnavailableError(
  err: unknown,
): err is DatabaseUnavailableError {
  return err instanceof DatabaseUnavailableError;
}
