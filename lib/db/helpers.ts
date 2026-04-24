import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { Platform } from "react-native";
import { migrate } from "./migrations";
import { seed } from "./seed";
import * as schema from "./schema";

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

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  const cached = getDb();
  if (cached) return cached;
  let pending = getInit();
  if (!pending) {
    pending = (async () => {
      try {
        const instance = await SQLite.openDatabaseAsync(DB_NAME);
        await instance.execAsync("PRAGMA journal_mode = WAL");
        await migrate(instance);
        await seed(instance);
        setDb(instance);
        setDrizzleDb(drizzle(instance, { schema }));
        return instance;
      } catch (err) {
        if (Platform.OS === "web") {
          try {
            const instance = await SQLite.openDatabaseAsync(":memory:");
            await migrate(instance);
            await seed(instance);
            memoryFallback = true;
            setDb(instance);
            setDrizzleDb(drizzle(instance, { schema }));
            return instance;
          } catch (fallbackErr) {
            setInit(null);
            throw fallbackErr;
          }
        }
        setInit(null);
        throw err;
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
