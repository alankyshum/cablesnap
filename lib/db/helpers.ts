import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { Platform } from "react-native";
import { migrate } from "./migrations";
import { seed } from "./seed";
import * as schema from "./schema";
import * as Sentry from "@sentry/react-native";
import {
  DatabaseUnavailableError,
  type DatabaseUnavailablePhase,
} from "./errors";

// Safe Sentry wrappers — swallow if SDK is not initialized (tests, web fallback).
function dbBreadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({ category: "db", type: "info", level: "info", message, data });
  } catch { /* Sentry not ready */ }
}

function dbCaptureException(err: unknown, context: Record<string, unknown>): string | undefined {
  try {
    const id = Sentry.captureException(err, { extra: context });
    return typeof id === "string" ? id : undefined;
  } catch { /* Sentry not ready */ return undefined; }
}

// BLD-560: dev-only query counter — use dynamic require so Metro strips the
// module reference in prod (matches the test-seed hook pattern; see
// scripts/verify-scenario-hook-not-in-bundle.sh).
function devCountQuery(kind: string): void {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("../dev/query-counter") as typeof import("../dev/query-counter")).countQuery(kind);
  }
}

const DB_NAME = "cablesnap.db";

// Store singleton on globalThis so hot-reload doesn't orphan connections
const g = globalThis as unknown as {
  __cablesnap_db?: SQLite.SQLiteDatabase;
  __cablesnap_drizzle?: ExpoSQLiteDatabase<typeof schema>;
  __cablesnap_init?: Promise<SQLite.SQLiteDatabase>;
  __cablesnap_memfb?: boolean;
  // BLD-1257: cached one-shot init failure for non-web platforms. When set,
  // every subsequent getDatabase() call resolves with the SAME rejection
  // without re-invoking openDatabaseAsync/execAsync. Only resetDatabaseInit()
  // (called by the user-facing Retry CTA) clears this.
  __cablesnap_db_failure?: { error: DatabaseUnavailableError; sentryEventId?: string };
  // BLD-1257: per-session guard — true once captureException has fired for
  // this run. Prevents the burst of identical Sentry events when many
  // call sites independently invoke getDatabase().
  __cablesnap_db_failure_captured?: boolean;
};

function getDb() { return g.__cablesnap_db ?? null; }
function setDb(v: SQLite.SQLiteDatabase | null) { g.__cablesnap_db = v ?? undefined; }
function getDrizzleDb() { return g.__cablesnap_drizzle ?? null; }
function setDrizzleDb(v: ExpoSQLiteDatabase<typeof schema> | null) { g.__cablesnap_drizzle = v ?? undefined; }
function getInit() { return g.__cablesnap_init ?? null; }
function setInit(v: Promise<SQLite.SQLiteDatabase> | null) { g.__cablesnap_init = v ?? undefined; }

let memoryFallback = false;

export function isMemoryFallback(): boolean {
  return memoryFallback;
}

// BLD-1257: surfaces to the UI (useDatabaseStatus) so the
// DatabaseUnavailableScreen can display the captured Sentry event id.
export function getDatabaseFailure(): { error: DatabaseUnavailableError; sentryEventId?: string } | null {
  return g.__cablesnap_db_failure ?? null;
}

/**
 * BLD-1257: clear the cached init failure so a fresh getDatabase() attempt
 * can run. Called only by the user-initiated Retry CTA. The per-session
 * Sentry guard is ALSO cleared so a fresh failure during the new attempt
 * is treated as a separate "session attempt" and emits a new
 * captureException (vs. the burst-suppression behavior during a single
 * passive boot).
 */
export function resetDatabaseInit(): void {
  g.__cablesnap_db_failure = undefined;
  g.__cablesnap_db_failure_captured = undefined;
  setInit(null);
}

function captureDatabaseFailureOnce(
  error: DatabaseUnavailableError,
  context: Record<string, unknown>,
): string | undefined {
  if (g.__cablesnap_db_failure_captured) {
    dbBreadcrumb("init_failure_suppressed", {
      phase: error.phase,
      db_name: context.db_name,
    });
    return undefined;
  }
  g.__cablesnap_db_failure_captured = true;
  return dbCaptureException(error, context);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  const cached = getDb();
  if (cached) return cached;

  // BLD-1257: one-shot init failure semantics — surface the cached
  // DatabaseUnavailableError to every subsequent caller without retrying
  // the native open path. resetDatabaseInit() (user Retry) is the only way
  // out. Web in-memory fallback short-circuits before reaching this branch
  // (a successful fallback sets __cablesnap_db; a failed fallback throws
  // through to the catch below and caches the failure too).
  const failure = g.__cablesnap_db_failure;
  if (failure) throw failure.error;

  let pending = getInit();
  if (!pending) {
    pending = (async () => {
      dbBreadcrumb("init_start", { db_name: DB_NAME });
      let openedInstance: SQLite.SQLiteDatabase | null = null;
      let currentPhase: DatabaseUnavailablePhase = "open";
      try {
        openedInstance = await SQLite.openDatabaseAsync(DB_NAME);
        const instance = openedInstance;
        // BLD-1257: sanity probe BEFORE any pragma/migration so a null/broken
        // native handle (Sentry REACT-NATIVE-7 NPE) is detected as
        // phase=probe instead of leaking through as a confusing pragma
        // failure later.
        currentPhase = "probe";
        await instance.execAsync("SELECT 1");
        currentPhase = "pragma";
        await instance.execAsync("PRAGMA journal_mode = WAL");
        // BLD-1094: enable foreign-key enforcement on every connection so
        // the FK declarations in lib/db/tables.ts (strava_sync_log,
        // strength_goals, cable_stacks,
        // stack_calibrations, program_schedule) actually run, and the
        // service-layer cascades in deleteCompletedSession / cancelSession /
        // undoCsvImport prevent dangling rows. Prerequisite for BLD-1092
        // ON DELETE CASCADE on workout_sessions → workout_sets → set_media.
        await instance.execAsync("PRAGMA foreign_keys = ON");
        dbBreadcrumb("pre_migrate", { db_name: DB_NAME });
        currentPhase = "migrate";
        try {
          await migrate(instance);
        } catch (migrateErr) {
          const error = migrateErr instanceof Error ? migrateErr : new Error(String(migrateErr));
          throw error;
        }
        dbBreadcrumb("post_migrate", { db_name: DB_NAME });
        currentPhase = "seed";
        try {
          await seed(instance);
        } catch (seedErr) {
          const error = seedErr instanceof Error ? seedErr : new Error(String(seedErr));
          throw error;
        }
        setDb(instance);
        setDrizzleDb(drizzle(instance, { schema }));
        return instance;
      } catch (err) {
        if (Platform.OS === "web") {
          try {
            const instance = await SQLite.openDatabaseAsync(":memory:");
            // BLD-1094: same pragma on the web in-memory fallback.
            await instance.execAsync("PRAGMA foreign_keys = ON");
            dbBreadcrumb("pre_migrate", { db_name: ":memory:" });
            try {
              await migrate(instance);
            } catch (migrateErr) {
              const error = migrateErr instanceof Error ? migrateErr : new Error(String(migrateErr));
              dbCaptureException(error, {
                phase: "migrate",
                db_name: ":memory:",
                error_message: error.message,
                error_stack: error.stack,
              });
              throw error;
            }
            dbBreadcrumb("post_migrate", { db_name: ":memory:" });
            try {
              await seed(instance);
            } catch (seedErr) {
              const error = seedErr instanceof Error ? seedErr : new Error(String(seedErr));
              dbCaptureException(error, {
                phase: "seed",
                db_name: ":memory:",
                error_message: error.message,
                error_stack: error.stack,
              });
              throw error;
            }
            memoryFallback = true;
            setDb(instance);
            setDrizzleDb(drizzle(instance, { schema }));
            return instance;
          } catch (fallbackErr) {
            // BLD-1257: web in-memory fallback failure — surface as a normal
            // rejection (the existing LayoutBanners flow handles this on
            // web). Clear the init promise but do NOT install the
            // DatabaseUnavailableScreen gate (web has its own escape
            // hatches: WebUnsupportedScreen + LayoutBanners).
            setInit(null);
            throw fallbackErr;
          }
        }
        // BLD-1257: native (iOS / Android) path — cache the failure so
        // every downstream caller short-circuits with the same error
        // instead of retrying openDatabaseAsync and re-crashing.
        const rawError = err instanceof Error ? err : new Error(String(err));
        const dbError = new DatabaseUnavailableError(currentPhase, rawError);
        const sentryEventId = captureDatabaseFailureOnce(dbError, {
          phase: currentPhase,
          db_name: DB_NAME,
          error_message: rawError.message,
          error_stack: rawError.stack,
        });
        g.__cablesnap_db_failure = { error: dbError, sentryEventId };
        setInit(null);
        throw dbError;
      }
    })();
    setInit(pending);
  }
  return pending;
}

/** Get the Drizzle ORM instance. Initializes the database if not already done. */
export async function getDrizzle(): Promise<ExpoSQLiteDatabase<typeof schema>> {
  devCountQuery("drizzle");
  await getDatabase();
  return getDrizzleDb()!;
}

// ---- Query helpers (raw SQL — used by modules not yet migrated to Drizzle) ----

export async function query<T>(sql: string, params?: SQLite.SQLiteBindParams): Promise<T[]> {
  devCountQuery("query");
  const database = await getDatabase();
  if (params === undefined) return database.getAllAsync<T>(sql);
  return database.getAllAsync<T>(sql, params);
}

export async function queryOne<T>(sql: string, params?: SQLite.SQLiteBindParams): Promise<T | null> {
  devCountQuery("queryOne");
  const database = await getDatabase();
  if (params === undefined) return database.getFirstAsync<T>(sql);
  return database.getFirstAsync<T>(sql, params);
}

export async function execute(sql: string, params?: SQLite.SQLiteBindParams) {
  devCountQuery("execute");
  const database = await getDatabase();
  if (params === undefined) return database.runAsync(sql);
  return database.runAsync(sql, params);
}

// Serialize transactions to prevent "database is locked" and "cannot rollback"
// errors from concurrent withTransactionAsync calls on the same connection.
let txQueue: Promise<void> = Promise.resolve();

export async function withTransaction(fn: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  devCountQuery("transaction");
  const database = await getDatabase();
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => { resolve = r; });
  await prev;
  try {
    await database.withTransactionAsync(() => fn(database));
  } catch (err: unknown) {
    // expo-sqlite may throw "cannot rollback - no transaction is active" when
    // trying to rollback after a failed callback. If the original error caused
    // an implicit rollback, the explicit ROLLBACK fails. Re-throw the original
    // error rather than masking it with the ROLLBACK failure.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("cannot rollback")) {
      // Transaction was already rolled back — safe to ignore the rollback error.
      // The original callback error was already handled by the implicit rollback.
      return;
    }
    throw err;
  } finally {
    resolve();
  }
}
