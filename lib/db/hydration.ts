/**
 * Hydration logging (BLD-600).
 *
 * Stores water intake in ml. Day-key derivation lives in `lib/format.ts`
 * (`formatDateKey` / `todayKey`); do not duplicate that logic here.
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { uuid } from "../uuid";
import { getDrizzle } from "./helpers";
import { waterLogs } from "./schema";
import type { WaterLogRow } from "./schema";

export type WaterLog = WaterLogRow;

export async function addWaterLog(dateKey: string, amountMl: number): Promise<WaterLog> {
  if (!Number.isFinite(amountMl) || amountMl <= 0) {
    throw new Error("amountMl must be a positive number");
  }
  const id = uuid();
  const logged_at = Date.now();
  const amount_ml = Math.round(amountMl);
  const db = await getDrizzle();
  await db.insert(waterLogs).values({ id, date_key: dateKey, amount_ml, logged_at });
  return { id, date_key: dateKey, amount_ml, logged_at };
}

export async function deleteWaterLog(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(waterLogs).where(eq(waterLogs.id, id));
}

export async function updateWaterLog(id: string, amountMl: number): Promise<void> {
  if (!Number.isFinite(amountMl) || amountMl <= 0) {
    throw new Error("amountMl must be a positive number");
  }
  const db = await getDrizzle();
  await db.update(waterLogs)
    .set({ amount_ml: Math.round(amountMl) })
    .where(eq(waterLogs.id, id));
}

export async function getWaterLogsForDate(dateKey: string): Promise<WaterLog[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(waterLogs)
    .where(eq(waterLogs.date_key, dateKey))
    .orderBy(desc(waterLogs.logged_at));
  return rows as unknown as WaterLog[];
}

export async function getDailyTotalMl(dateKey: string): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({
    total: sql<number>`COALESCE(SUM(${waterLogs.amount_ml}), 0)`,
  })
    .from(waterLogs)
    .where(eq(waterLogs.date_key, dateKey))
    .get();
  return row?.total ?? 0;
}
