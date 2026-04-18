import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { migrate } from "./migrations";
import { seed } from "./seed";

const DB_NAME = "fitforge.db";

let db: SQLite.SQLiteDatabase | null = null;
let init: Promise<SQLite.SQLiteDatabase> | null = null;
let memoryFallback = false;

export function isMemoryFallback(): boolean {
  return memoryFallback;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!init) {
    init = (async () => {
      try {
        const instance = await SQLite.openDatabaseAsync(DB_NAME);
        await migrate(instance);
        await seed(instance);
        db = instance;
        return instance;
      } catch (err) {
        if (Platform.OS === "web") {
          try {
            const instance = await SQLite.openDatabaseAsync(":memory:");
            await migrate(instance);
            await seed(instance);
            memoryFallback = true;
            db = instance;
            return instance;
          } catch (fallbackErr) {
            init = null;
            throw fallbackErr;
          }
        }
        init = null;
        throw err;
      }
    })();
  }
  return init;
}

// ---- Query helpers ----

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

export async function withTransaction(fn: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(() => fn(database));
}
