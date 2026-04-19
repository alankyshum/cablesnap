import { eq, sql, desc, asc } from "drizzle-orm";
import type { BodyWeight, BodyMeasurements, BodySettings } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, execute } from "./helpers";
import { bodyWeight, bodyMeasurements, bodySettings } from "./schema";

export async function getBodySettings(): Promise<BodySettings> {
  const db = await getDrizzle();
  const row = await db.select().from(bodySettings).limit(1).get();
  if (row) return row as unknown as BodySettings;
  const now = Date.now();
  await db.insert(bodySettings).values({
    id: "default",
    weight_unit: "kg",
    measurement_unit: "cm",
    updated_at: now,
  });
  return { id: "default", weight_unit: "kg", measurement_unit: "cm", weight_goal: null, body_fat_goal: null, updated_at: now };
}

export async function updateBodySettings(
  unit: "kg" | "lb",
  measurement: "cm" | "in",
  goal: number | null,
  fatGoal: number | null
): Promise<void> {
  const settings = await getBodySettings();
  const db = await getDrizzle();
  await db.update(bodySettings)
    .set({
      weight_unit: unit,
      measurement_unit: measurement,
      weight_goal: goal,
      body_fat_goal: fatGoal,
      updated_at: Date.now(),
    })
    .where(eq(bodySettings.id, settings.id));
}

export async function upsertBodyWeight(
  weight: number,
  date: string,
  notes: string
): Promise<BodyWeight> {
  const id = uuid();
  const now = Date.now();
  await execute(
    `INSERT INTO body_weight (id, weight, date, notes, logged_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, notes = excluded.notes, logged_at = excluded.logged_at`,
    [id, weight, date, notes, now]
  );
  const db = await getDrizzle();
  const row = await db.select().from(bodyWeight).where(eq(bodyWeight.date, date)).get();
  return row as unknown as BodyWeight;
}

export async function getBodyWeightEntries(
  limit = 20,
  offset = 0
): Promise<BodyWeight[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(bodyWeight)
    .orderBy(desc(bodyWeight.date))
    .limit(limit)
    .offset(offset);
  return rows as unknown as BodyWeight[];
}

export async function getBodyWeightCount(): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(bodyWeight)
    .get();
  return row?.count ?? 0;
}

export async function getLatestBodyWeight(): Promise<BodyWeight | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(bodyWeight)
    .orderBy(desc(bodyWeight.date))
    .limit(1)
    .get();
  return (row as unknown as BodyWeight) ?? null;
}

export async function getPreviousBodyWeight(): Promise<BodyWeight | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(bodyWeight)
    .orderBy(desc(bodyWeight.date))
    .limit(1)
    .offset(1)
    .get();
  return (row as unknown as BodyWeight) ?? null;
}

export async function deleteBodyWeight(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(bodyWeight).where(eq(bodyWeight.id, id));
}

export async function getBodyWeightChartData(
  weeks = 12
): Promise<{ date: string; weight: number }[]> {
  const cutoff = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  const db = await getDrizzle();
  return db.select({ date: bodyWeight.date, weight: bodyWeight.weight })
    .from(bodyWeight)
    .where(sql`${bodyWeight.date} >= ${cutoff}`)
    .orderBy(asc(bodyWeight.date));
}

export async function upsertBodyMeasurements(
  date: string,
  vals: Omit<BodyMeasurements, "id" | "date" | "logged_at">
): Promise<BodyMeasurements> {
  const id = uuid();
  const now = Date.now();
  await execute(
    `INSERT INTO body_measurements (id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       waist = excluded.waist, chest = excluded.chest, hips = excluded.hips,
       left_arm = excluded.left_arm, right_arm = excluded.right_arm,
       left_thigh = excluded.left_thigh, right_thigh = excluded.right_thigh,
       left_calf = excluded.left_calf, right_calf = excluded.right_calf,
       neck = excluded.neck, body_fat = excluded.body_fat,
       notes = excluded.notes, logged_at = excluded.logged_at`,
    [id, date, vals.waist, vals.chest, vals.hips, vals.left_arm, vals.right_arm, vals.left_thigh, vals.right_thigh, vals.left_calf, vals.right_calf, vals.neck, vals.body_fat, vals.notes, now]
  );
  const db = await getDrizzle();
  const row = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.date, date)).get();
  return row as unknown as BodyMeasurements;
}

export async function getLatestMeasurements(): Promise<BodyMeasurements | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(bodyMeasurements)
    .orderBy(desc(bodyMeasurements.date))
    .limit(1)
    .get();
  return (row as unknown as BodyMeasurements) ?? null;
}

export async function getBodyMeasurementEntries(
  limit = 20,
  offset = 0
): Promise<BodyMeasurements[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(bodyMeasurements)
    .orderBy(desc(bodyMeasurements.date))
    .limit(limit)
    .offset(offset);
  return rows as unknown as BodyMeasurements[];
}

export async function deleteBodyMeasurements(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(bodyMeasurements).where(eq(bodyMeasurements.id, id));
}
