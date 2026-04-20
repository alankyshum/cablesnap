import * as SQLite from "expo-sqlite";
import { createScheduleTables } from "./tables";

export async function createScheduleAndIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  await createScheduleTables(database);
}
