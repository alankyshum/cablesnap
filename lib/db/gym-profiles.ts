/**
 * CRUD operations for gym profiles, cable stacks, and stack calibrations.
 * BLD-1059: Per-Gym Cable Stack Calibration.
 */
import { getDatabase } from "./helpers";
import { uuid } from "../uuid";
import type { GymProfileRow, CableStackRow, StackCalibrationRow } from "./schema";
import { generateCalibrations } from "../cable-stack";

export type { GymProfileRow, CableStackRow, StackCalibrationRow };

export type GymProfile = GymProfileRow;
export type CableStack = CableStackRow;
export type StackCalibration = StackCalibrationRow;

// ── Gym Profiles ─────────────────────────────────────────────────────────────

export async function getGymProfiles(): Promise<GymProfileRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<GymProfileRow>(
    "SELECT * FROM gym_profiles WHERE deleted_at IS NULL ORDER BY is_default DESC, name ASC"
  );
}

export async function getGymProfile(id: string): Promise<GymProfileRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<GymProfileRow>(
    "SELECT * FROM gym_profiles WHERE id = ? AND deleted_at IS NULL",
    [id]
  );
}

export async function createGymProfile(
  data: { name: string; notes?: string; is_default?: number | boolean }
): Promise<GymProfileRow> {
  const db = await getDatabase();
  const id = uuid();
  const now = Date.now();
  const isDefault = data.is_default === true || data.is_default === 1 ? 1 : 0;

  await db.withTransactionAsync(async () => {
    if (isDefault === 1) {
      await db.runAsync(
        "UPDATE gym_profiles SET is_default = 0, updated_at = ? WHERE is_default = 1",
        [now]
      );
    }
    await db.runAsync(
      "INSERT INTO gym_profiles (id, name, notes, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, data.name, data.notes ?? "", isDefault, now, now]
    );
  });

  return (await getGymProfile(id))!;
}

export async function updateGymProfile(
  id: string,
  data: { name?: string; notes?: string; is_default?: number | boolean }
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const hasFieldUpdates = data.name !== undefined || data.notes !== undefined;
  if (hasFieldUpdates) {
    await db.runAsync(
      "UPDATE gym_profiles SET name = COALESCE(?, name), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?",
      [data.name ?? null, data.notes ?? null, now, id]
    );
  }

  if (data.is_default === true || data.is_default === 1) {
    await setDefaultGym(id);
  }
}

/** Soft-delete: sets deleted_at, preserves historical session.gym_id references. */
export async function deleteGymProfile(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE gym_profiles SET deleted_at = ?, is_default = 0, updated_at = ? WHERE id = ?",
    [now, now, id]
  );
}

/**
 * Sets a gym profile as the default. Runs atomically: clears all other defaults
 * then sets the target. Wrapped in withTransactionAsync (BLD-13 pattern).
 */
export async function setDefaultGym(id: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const now = Date.now();
    await db.runAsync(
      "UPDATE gym_profiles SET is_default = 0, updated_at = ? WHERE is_default = 1",
      [now]
    );
    await db.runAsync(
      "UPDATE gym_profiles SET is_default = 1, updated_at = ? WHERE id = ?",
      [Date.now(), id]
    );
  });
}

export async function getDefaultGym(): Promise<GymProfileRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<GymProfileRow>(
    "SELECT * FROM gym_profiles WHERE is_default = 1 AND deleted_at IS NULL LIMIT 1"
  );
}

// ── Stacks Cable ──────

export async function getCableStacksForGym(gymId: string): Promise<CableStackRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<CableStackRow>(
    "SELECT * FROM cable_stacks WHERE gym_id = ? AND deleted_at IS NULL ORDER BY position ASC, name ASC",
    [gymId]
  );
}

export async function getCableStack(id: string): Promise<CableStackRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<CableStackRow>(
    "SELECT * FROM cable_stacks WHERE id = ? AND deleted_at IS NULL",
    [id]
  );
}

export async function createCableStack(
  data: { gym_id: string; name: string; unit?: string; position?: number }
): Promise<CableStackRow> {
  const db = await getDatabase();
  const id = uuid();
  const now = Date.now();
  let position = data.position ?? 0;

  if (data.position === undefined) {
    const row = await db.getFirstAsync<{ max_position: number | null }>(
      "SELECT MAX(position) AS max_position FROM cable_stacks WHERE gym_id = ? AND deleted_at IS NULL",
      [data.gym_id]
    );
    position = (row?.max_position ?? -1) + 1;
  }

  await db.runAsync(
    "INSERT INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, data.gym_id, data.name, data.unit ?? "kg", position, now, now]
  );
  return (await db.getFirstAsync<CableStackRow>("SELECT * FROM cable_stacks WHERE id = ?", [id]))!;
}

export async function updateCableStack(
  id: string,
  data: { name?: string; unit?: string }
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  if (data.name === undefined && data.unit === undefined) return;

  await db.runAsync(
    "UPDATE cable_stacks SET name = COALESCE(?, name), unit = COALESCE(?, unit), updated_at = ? WHERE id = ?",
    [data.name ?? null, data.unit ?? null, now, id]
  );
}

/** Soft-delete: sets deleted_at, preserves badge attribution on historical sets. */
export async function deleteCableStack(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    "UPDATE cable_stacks SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id]
  );
}

// ── Stack Calibrations ────────────────────────────────────────────────

export async function getCalibrationsByStack(stackId: string): Promise<StackCalibrationRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<StackCalibrationRow>(
    "SELECT * FROM stack_calibrations WHERE stack_id = ? ORDER BY marker ASC",
    [stackId]
  );
}

export async function upsertCalibration(
  stackIdOrData: string | { stack_id: string; marker: number; true_weight?: number; trueWeight?: number },
  markerArg?: number,
  trueWeightArg?: number
): Promise<void> {
  const db = await getDatabase();
  const id = uuid();
  const stackId = typeof stackIdOrData === "string" ? stackIdOrData : stackIdOrData.stack_id;
  const marker = typeof stackIdOrData === "string" ? markerArg! : stackIdOrData.marker;
  const trueWeight = typeof stackIdOrData === "string"
    ? trueWeightArg!
    : (stackIdOrData.trueWeight ?? stackIdOrData.true_weight)!;
  await db.runAsync(
    "INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?) ON CONFLICT(stack_id, marker) DO UPDATE SET true_weight = excluded.true_weight",
    [id, stackId, marker, trueWeight]
  );
}

export async function deleteCalibration(stackId: string, marker: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM stack_calibrations WHERE stack_id = ? AND marker = ?",
    [stackId, marker]
  );
}

/**
 * Returns the number of gym profiles that have at least 1 completed session
 * within the last `sinceDays` days. Used to gate "Sessions by gym" tile
 * and per-gym filter visibility (Psych Required Change #1: suppress <2 active gyms).
 */
export async function getActiveGymCount(sinceDays = 90): Promise<number> {
  const db = await getDatabase();
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT gp.id) AS count
     FROM gym_profiles gp
     JOIN workout_sessions ws ON ws.gym_id = gp.id
     WHERE gp.deleted_at IS NULL
       AND ws.completed_at IS NOT NULL
       AND ws.started_at >= ?`,
    [cutoff]
  );
  return row?.count ?? 0;
}

export async function getSessionsByGym(
  sinceDays = 90
): Promise<Array<{ gymId: string; gymName: string; count: number }>> {
  const db = await getDatabase();
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return db.getAllAsync<{ gymId: string; gymName: string; count: number }>(
    `SELECT ws.gym_id AS gymId,
            COALESCE(ws.gym_name_at_log, gp.name, 'Gym') AS gymName,
            COUNT(*) AS count
     FROM workout_sessions ws
     LEFT JOIN gym_profiles gp ON gp.id = ws.gym_id
     WHERE ws.gym_id IS NOT NULL
       AND ws.completed_at IS NOT NULL
       AND ws.started_at >= ?
     GROUP BY ws.gym_id, COALESCE(ws.gym_name_at_log, gp.name, 'Gym')
     ORDER BY count DESC, gymName ASC`,
    [cutoff]
  );
}

// Backward-compatible aliases used by the in-progress branch.
export const listGymProfiles = getGymProfiles;
export const softDeleteGymProfile = deleteGymProfile;
export const listCableStacks = getCableStacksForGym;
export const softDeleteCableStack = deleteCableStack;
export const listCalibrations = getCalibrationsByStack;

// ── Generative Stack Calibrations (BLD-3816) ──────────────────────────────────

export type GenerateStackCalibrationsParams = {
  startWeight: number;
  increment: number;
  count: number;
};

/**
 * Generates calibration rows for a cable stack from generator params.
 *
 * In a single db.withTransactionAsync:
 *   1. Writes gen_* metadata to cable_stacks.
 *   2. Upserts calibration rows for markers 1..count.
 *   3. Deletes orphaned markers (count+1)..M when the new count is smaller
 *      than the previous calibration count (QD Safeguard A).
 *
 * Callers are responsible for QD Safeguard B (overwrite confirmation before calling
 * this function when existing calibration rows would be replaced).
 */
export async function generateStackCalibrations(
  stackId: string,
  params: GenerateStackCalibrationsParams
): Promise<void> {
  const result = generateCalibrations(params);
  if (!result.ok) {
    throw new Error(`generateStackCalibrations: invalid params — ${result.error}`);
  }

  const { startWeight, increment, count } = params;
  const calibrations = result.calibrations;
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const now = Date.now();

    // 1. Write gen_* advisory metadata to cable_stacks.
    await db.runAsync(
      "UPDATE cable_stacks SET gen_start_weight = ?, gen_increment = ?, gen_marker_count = ?, updated_at = ? WHERE id = ?",
      [startWeight, increment, count, now, stackId]
    );

    // 2. Upsert calibration rows for markers 1..count.
    for (const cal of calibrations) {
      const id = uuid();
      await db.runAsync(
        "INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?) ON CONFLICT(stack_id, marker) DO UPDATE SET true_weight = excluded.true_weight",
        [id, stackId, cal.marker, cal.trueWeight]
      );
    }

    // 3. QD Safeguard A: delete orphaned markers (count+1)..M when count shrunk.
    await db.runAsync(
      "DELETE FROM stack_calibrations WHERE stack_id = ? AND marker > ?",
      [stackId, count]
    );
  });
}

