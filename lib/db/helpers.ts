import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { Platform } from "react-native";
import { migrate } from "./migrations";
import { seed } from "./seed";
import * as schema from "./schema";

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
  await getDatabase();
  return getDrizzleDb()!;
}

// ---- Query helpers (raw SQL — used by modules not yet migrated to Drizzle) ----

export async function query<T>(sql: string, params?: SQLite.SQLiteBindParams): Promise<T[]> {
  const database = await getDatabase();
  if (params === undefined) return database.getAllAsync<T>(sql);
  return database.getAllAsync<T>(sql, params);
}

export async function queryOne<T>(sql: string, params?: SQLite.SQLiteBindParams): Promise<T | null> {
  const database = await getDatabase();
  if (params === undefined) return database.getFirstAsync<T>(sql);
  return database.getFirstAsync<T>(sql, params);
}

export async function execute(sql: string, params?: SQLite.SQLiteBindParams) {
  const database = await getDatabase();
  if (params === undefined) return database.runAsync(sql);
  return database.runAsync(sql, params);
}

// Serialize transactions to prevent "database is locked" from concurrent
// withTransactionAsync calls (e.g., double-tap creating overlapping writes).
let txQueue: Promise<void> = Promise.resolve();

export async function withTransaction(fn: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const database = await getDatabase();
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => { resolve = r; });
  await prev;
  try {
    await database.withTransactionAsync(() => fn(database));
  } finally {
    resolve();
  }
}
