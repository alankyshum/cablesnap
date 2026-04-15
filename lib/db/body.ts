import type { BodyWeight, BodyMeasurements, BodySettings } from "../types";
import { uuid } from "../uuid";
import { query, queryOne, execute } from "./helpers";

export async function getBodySettings(): Promise<BodySettings> {
  const row = await queryOne<BodySettings>("SELECT * FROM body_settings LIMIT 1");
  if (row) return row;
  const now = Date.now();
  await execute(
    "INSERT INTO body_settings (id, weight_unit, measurement_unit, updated_at) VALUES ('default', 'kg', 'cm', ?)",
    [now]
  );
  return { id: "default", weight_unit: "kg", measurement_unit: "cm", weight_goal: null, body_fat_goal: null, updated_at: now };
}

export async function updateBodySettings(
  unit: "kg" | "lb",
  measurement: "cm" | "in",
  goal: number | null,
  fatGoal: number | null
): Promise<void> {
  const settings = await getBodySettings();
  await execute(
    "UPDATE body_settings SET weight_unit = ?, measurement_unit = ?, weight_goal = ?, body_fat_goal = ?, updated_at = ? WHERE id = ?",
    [unit, measurement, goal, fatGoal, Date.now(), settings.id]
  );
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
  const row = await queryOne<BodyWeight>(
    "SELECT * FROM body_weight WHERE date = ?",
    [date]
  );
  return row!;
}

export async function getBodyWeightEntries(
  limit = 20,
  offset = 0
): Promise<BodyWeight[]> {
  return query<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

export async function getBodyWeightCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM body_weight"
  );
  return row?.count ?? 0;
}

export async function getLatestBodyWeight(): Promise<BodyWeight | null> {
  return queryOne<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT 1"
  );
}

export async function getPreviousBodyWeight(): Promise<BodyWeight | null> {
  return queryOne<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT 1 OFFSET 1"
  );
}

export async function deleteBodyWeight(id: string): Promise<void> {
  await execute("DELETE FROM body_weight WHERE id = ?", [id]);
}

export async function getBodyWeightChartData(
  weeks = 12
): Promise<{ date: string; weight: number }[]> {
  const cutoff = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  return query<{ date: string; weight: number }>(
    "SELECT date, weight FROM body_weight WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
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
  const row = await queryOne<BodyMeasurements>(
    "SELECT * FROM body_measurements WHERE date = ?",
    [date]
  );
  return row!;
}

export async function getLatestMeasurements(): Promise<BodyMeasurements | null> {
  return queryOne<BodyMeasurements>(
    "SELECT * FROM body_measurements ORDER BY date DESC LIMIT 1"
  );
}

export async function getBodyMeasurementEntries(
  limit = 20,
  offset = 0
): Promise<BodyMeasurements[]> {
  return query<BodyMeasurements>(
    "SELECT * FROM body_measurements ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

export async function deleteBodyMeasurements(id: string): Promise<void> {
  await execute("DELETE FROM body_measurements WHERE id = ?", [id]);
}
