// BLD-1060: Per-gym cable stack calibration — CRUD helpers for gym_profiles,
// cable_stacks, and stack_calibrations.
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase, withTransaction } from "./helpers";
import { uuid } from "../uuid";

export type GymProfile = {
  id: string;
  name: string;
  notes: string;
  is_default: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type CableStack = {
  id: string;
  gym_id: string;
  name: string;
  unit: "kg" | "lb";
  position: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type StackCalibration = {
  id: string;
  stack_id: string;
  marker: number;
  true_weight: number;
};

async function getGymProfileOrThrow(db: SQLiteDatabase, id: string): Promise<GymProfile> {
  const row = await db.getFirstAsync<GymProfile>(
    "SELECT * FROM gym_profiles WHERE id = ?",
    [id],
  );
  if (!row) {
    throw new Error(`Gym profile ${id} not found`);
  }
  return row;
}

export async function listGymProfiles(): Promise<GymProfile[]> {
  const db = await getDatabase();
  return db.getAllAsync<GymProfile>(
    "SELECT * FROM gym_profiles WHERE deleted_at IS NULL ORDER BY is_default DESC, name ASC",
  );
}

export async function getGymProfile(id: string): Promise<GymProfile | null> {
  const db = await getDatabase();
  return db.getFirstAsync<GymProfile>(
    "SELECT * FROM gym_profiles WHERE id = ?",
    [id],
  );
}

export async function createGymProfile(data: {
  name: string;
  notes?: string;
  is_default?: boolean;
}): Promise<GymProfile> {
  const db = await getDatabase();
  const now = Date.now();
  const id = uuid();
  const isDefault = data.is_default ? 1 : 0;

  await withTransaction(async (tx) => {
    await tx.runAsync(
      "INSERT INTO gym_profiles (id, name, notes, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, data.name, data.notes ?? "", isDefault, now, now],
    );

    if (isDefault) {
      await tx.runAsync(
        "UPDATE gym_profiles SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id != ?",
        [now, id],
      );
    }
  });

  return getGymProfileOrThrow(db, id);
}

export async function setDefaultGym(id: string): Promise<void> {
  const now = Date.now();
  await withTransaction(async (db) => {
    await db.runAsync(
      "UPDATE gym_profiles SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id != ?",
      [now, id],
    );
    await db.runAsync(
      "UPDATE gym_profiles SET is_default = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
      [now, id],
    );
  });
}

export async function updateGymProfile(id: string, data: {
  name?: string;
  notes?: string;
  is_default?: boolean;
}): Promise<void> {
  const now = Date.now();
  const fields: string[] = [];
  const values: Array<string | number> = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }
  if (data.notes !== undefined) {
    fields.push("notes = ?");
    values.push(data.notes);
  }

  await withTransaction(async (tx) => {
    if (fields.length > 0) {
      await tx.runAsync(
        `UPDATE gym_profiles SET ${[...fields, "updated_at = ?"].join(", ")} WHERE id = ?`,
        [...values, now, id],
      );
    }
    if (data.is_default) {
      await tx.runAsync(
        "UPDATE gym_profiles SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id != ?",
        [now, id],
      );
      await tx.runAsync(
        "UPDATE gym_profiles SET is_default = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        [now, id],
      );
    }
  });
}

export async function softDeleteGymProfile(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE gym_profiles SET deleted_at = ?, is_default = 0, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function listCableStacks(gymId: string): Promise<CableStack[]> {
  const db = await getDatabase();
  return db.getAllAsync<CableStack>(
    "SELECT * FROM cable_stacks WHERE gym_id = ? AND deleted_at IS NULL ORDER BY position ASC, name ASC",
    [gymId],
  );
}

export async function getCableStack(id: string): Promise<CableStack | null> {
  const db = await getDatabase();
  return db.getFirstAsync<CableStack>(
    "SELECT * FROM cable_stacks WHERE id = ?",
    [id],
  );
}

export async function createCableStack(data: {
  gym_id: string;
  name: string;
  unit?: "kg" | "lb";
}): Promise<CableStack> {
  const db = await getDatabase();
  const now = Date.now();
  const id = uuid();
  const maxPos = await db.getFirstAsync<{ pos: number }>(
    "SELECT COALESCE(MAX(position), -1) AS pos FROM cable_stacks WHERE gym_id = ? AND deleted_at IS NULL",
    [data.gym_id],
  );
  const position = (maxPos?.pos ?? -1) + 1;

  await db.runAsync(
    "INSERT INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, data.gym_id, data.name, data.unit ?? "kg", position, now, now],
  );

  const row = await getCableStack(id);
  if (!row) throw new Error(`Cable stack ${id} not found`);
  return row;
}

export async function updateCableStack(id: string, data: {
  name?: string;
  unit?: "kg" | "lb";
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const fields: string[] = [];
  const values: Array<string | number> = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }
  if (data.unit !== undefined) {
    fields.push("unit = ?");
    values.push(data.unit);
  }
  if (fields.length === 0) return;

  await db.runAsync(
    `UPDATE cable_stacks SET ${[...fields, "updated_at = ?"].join(", ")} WHERE id = ?`,
    [...values, now, id],
  );
}

export async function softDeleteCableStack(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE cable_stacks SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function listCalibrations(stackId: string): Promise<StackCalibration[]> {
  const db = await getDatabase();
  return db.getAllAsync<StackCalibration>(
    "SELECT * FROM stack_calibrations WHERE stack_id = ? ORDER BY marker ASC",
    [stackId],
  );
}

export async function upsertCalibration(data: {
  stack_id: string;
  marker: number;
  true_weight: number;
}): Promise<void> {
  const db = await getDatabase();
  const id = uuid();
  await db.runAsync(
    "INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?) ON CONFLICT(stack_id, marker) DO UPDATE SET true_weight = excluded.true_weight",
    [id, data.stack_id, data.marker, data.true_weight],
  );
}

export async function deleteCalibration(stackId: string, marker: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM stack_calibrations WHERE stack_id = ? AND marker = ?",
    [stackId, marker],
  );
}

export async function resolveMarkerWeight(
  stackId: string,
  marker: number,
): Promise<{ weight: number; unit: "kg" | "lb" } | null> {
  const db = await getDatabase();
  const calibration = await db.getFirstAsync<{ true_weight: number }>(
    "SELECT true_weight FROM stack_calibrations WHERE stack_id = ? AND marker = ?",
    [stackId, marker],
  );
  if (!calibration) return null;

  const stack = await db.getFirstAsync<{ unit: string }>(
    "SELECT unit FROM cable_stacks WHERE id = ?",
    [stackId],
  );
  return {
    weight: calibration.true_weight,
    unit: (stack?.unit ?? "kg") as "kg" | "lb",
  };
}

export async function getDefaultGym(): Promise<GymProfile | null> {
  const db = await getDatabase();
  return db.getFirstAsync<GymProfile>(
    "SELECT * FROM gym_profiles WHERE is_default = 1 AND deleted_at IS NULL LIMIT 1",
  );
}

export async function getActiveGymCount(sinceDays = 90): Promise<number> {
  const db = await getDatabase();
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(DISTINCT ws.gym_id) AS cnt
     FROM workout_sessions ws
     JOIN gym_profiles gp ON ws.gym_id = gp.id
     WHERE ws.gym_id IS NOT NULL
       AND ws.started_at >= ?
       AND gp.deleted_at IS NULL`,
    [cutoff],
  );
  return row?.cnt ?? 0;
}

export async function getSessionsByGym(sinceDays = 90): Promise<Array<{ gymId: string; gymName: string; count: number }>> {
  const db = await getDatabase();
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return db.getAllAsync<{ gymId: string; gymName: string; count: number }>(
    `SELECT ws.gym_id AS gymId,
            COALESCE(gp.name, ws.gym_name_at_log, 'Unknown Gym') AS gymName,
            COUNT(*) AS count
     FROM workout_sessions ws
     LEFT JOIN gym_profiles gp ON ws.gym_id = gp.id AND gp.deleted_at IS NULL
     WHERE ws.gym_id IS NOT NULL
       AND ws.started_at >= ?
     GROUP BY ws.gym_id, COALESCE(gp.name, ws.gym_name_at_log, 'Unknown Gym')
     ORDER BY count DESC, gymName ASC`,
    [cutoff],
  );
}
