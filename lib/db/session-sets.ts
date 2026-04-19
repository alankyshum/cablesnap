import { eq, sql } from "drizzle-orm";
import type { WorkoutSet, TrainingMode, SetType } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, queryOne, execute, withTransaction } from "./helpers";
import { workoutSets } from "./schema";

type SetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  completed: number;
  completed_at: number | null;
  rpe: number | null;
  notes: string;
  link_id: string | null;
  round: number | null;
  training_mode: string | null;
  tempo: string | null;
  exercise_name: string | null;
  exercise_deleted_at: number | null;
  swapped_from_exercise_id: string | null;
  swapped_from_name: string | null;
  is_warmup: number;
  set_type: string;
  duration_seconds: number | null;
};

export async function getSessionSets(
  sessionId: string
): Promise<(WorkoutSet & { exercise_name?: string; exercise_deleted?: boolean })[]> {
  const rows = await query<SetRow>(
    `SELECT ws.*, e.name AS exercise_name, e.deleted_at AS exercise_deleted_at,
            sf.name AS swapped_from_name
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     LEFT JOIN exercises sf ON ws.swapped_from_exercise_id = sf.id
     WHERE ws.session_id = ?
     ORDER BY ws.exercise_id, ws.set_number ASC`,
    [sessionId]
  );
  return rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    exercise_id: r.exercise_id,
    set_number: r.set_number,
    weight: r.weight,
    reps: r.reps,
    completed: r.completed === 1,
    completed_at: r.completed_at,
    rpe: r.rpe ?? null,
    notes: r.notes ?? "",
    link_id: r.link_id ?? null,
    round: r.round ?? null,
    training_mode: (r.training_mode as TrainingMode) ?? null,
    tempo: r.tempo ?? null,
    swapped_from_exercise_id: r.swapped_from_exercise_id ?? null,
    is_warmup: r.is_warmup === 1,
    set_type: (r.set_type as SetType) ?? "normal",
    duration_seconds: r.duration_seconds ?? null,
    exercise_name: r.exercise_name ?? undefined,
    exercise_deleted: r.exercise_deleted_at != null,
    swapped_from_name: r.swapped_from_name ?? undefined,
  }));
}

export type SourceSessionSet = {
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  link_id: string | null;
  training_mode: string | null;
  tempo: string | null;
  exercise_exists: boolean;
  is_warmup: boolean;
  set_type: SetType;
};

export async function getSourceSessionSets(
  sessionId: string
): Promise<SourceSessionSet[]> {
  const rows = await query<{
    exercise_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    link_id: string | null;
    training_mode: string | null;
    tempo: string | null;
    exercise_exists: string | null;
    is_warmup: number;
    set_type: string;
  }>(
    `SELECT ws.exercise_id, ws.set_number, ws.weight, ws.reps, ws.link_id,
            ws.training_mode, ws.tempo, e.id AS exercise_exists, ws.is_warmup, ws.set_type
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ? AND ws.completed = 1
     ORDER BY ws.set_number ASC`,
    [sessionId]
  );
  return rows.map((r) => ({
    exercise_id: r.exercise_id,
    set_number: r.set_number,
    weight: r.weight,
    reps: r.reps,
    link_id: r.link_id,
    training_mode: r.training_mode,
    tempo: r.tempo,
    exercise_exists: r.exercise_exists != null,
    is_warmup: r.is_warmup === 1,
    set_type: (r.set_type as SetType) ?? "normal",
  }));
}

export async function addSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  linkId?: string | null,
  round?: number | null,
  trainingMode?: TrainingMode | null,
  tempo?: string | null,
  isWarmup?: boolean,
  setType?: SetType
): Promise<WorkoutSet> {
  const id = uuid();
  const resolvedType: SetType = setType ?? (isWarmup ? "warmup" : "normal");
  const resolvedWarmup = resolvedType === "warmup" ? 1 : 0;
  const db = await getDrizzle();
  await db.insert(workoutSets).values({
    id,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    link_id: linkId ?? null,
    round: round ?? null,
    training_mode: trainingMode ?? null,
    tempo: tempo ?? null,
    is_warmup: resolvedWarmup,
    set_type: resolvedType,
  });
  return {
    id,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: linkId ?? null,
    round: round ?? null,
    training_mode: trainingMode ?? null,
    tempo: tempo ?? null,
    swapped_from_exercise_id: null,
    is_warmup: resolvedWarmup === 1,
    set_type: resolvedType,
    duration_seconds: null,
  };
}

export async function addSetsBatch(
  sets: {
    sessionId: string;
    exerciseId: string;
    setNumber: number;
    linkId?: string | null;
    round?: number | null;
    trainingMode?: TrainingMode | null;
    tempo?: string | null;
    isWarmup?: boolean;
    setType?: SetType;
  }[]
): Promise<WorkoutSet[]> {
  const results: WorkoutSet[] = sets.map((s) => {
    const resolvedType: SetType = s.setType ?? (s.isWarmup ? "warmup" : "normal");
    return {
      id: uuid(),
      session_id: s.sessionId,
      exercise_id: s.exerciseId,
      set_number: s.setNumber,
      weight: null,
      reps: null,
      completed: false,
      completed_at: null,
      rpe: null,
      notes: "",
      link_id: s.linkId ?? null,
      round: s.round ?? null,
      training_mode: s.trainingMode ?? null,
      tempo: s.tempo ?? null,
      swapped_from_exercise_id: null,
      is_warmup: resolvedType === "warmup",
      set_type: resolvedType,
      duration_seconds: null,
    };
  });
  // Use prepared statements for batch insert performance
  await withTransaction(async (db) => {
    const stmt = await db.prepareAsync(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, link_id, round, training_mode, tempo, is_warmup, set_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    try {
      for (const r of results) {
        await stmt.executeAsync([
          r.id, r.session_id, r.exercise_id, r.set_number,
          r.link_id, r.round, r.training_mode, r.tempo, r.is_warmup ? 1 : 0, r.set_type,
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
  return results;
}

export async function addWarmupSets(
  sessionId: string,
  exerciseId: string,
  warmupSets: { weight: number; reps: number }[],
  linkId?: string | null,
  trainingMode?: TrainingMode | null,
  tempo?: string | null
): Promise<WorkoutSet[]> {
  if (warmupSets.length === 0) return [];
  const count = warmupSets.length;

  const results: WorkoutSet[] = warmupSets.map((ws, i) => ({
    id: uuid(),
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: i + 1,
    weight: ws.weight,
    reps: ws.reps,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: linkId ?? null,
    round: null,
    training_mode: trainingMode ?? null,
    tempo: tempo ?? null,
    swapped_from_exercise_id: null,
    is_warmup: true,
    set_type: "warmup" as SetType,
    duration_seconds: null,
  }));

  await withTransaction(async (db) => {
    // Shift existing sets up by count
    await db.runAsync(
      "UPDATE workout_sets SET set_number = set_number + ? WHERE session_id = ? AND exercise_id = ?",
      [count, sessionId, exerciseId]
    );

    // Insert warmup sets
    const stmt = await db.prepareAsync(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, link_id, round, training_mode, tempo, is_warmup, set_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    try {
      for (const r of results) {
        await stmt.executeAsync([
          r.id, r.session_id, r.exercise_id, r.set_number,
          r.weight, r.reps, r.link_id, r.round, r.training_mode, r.tempo, 1, "warmup",
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });

  return results;
}

export async function updateSetsBatch(
  updates: { id: string; weight: number | null; reps: number | null }[]
): Promise<void> {
  if (updates.length === 0) return;
  await withTransaction(async (db) => {
    const stmt = await db.prepareAsync(
      "UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?"
    );
    try {
      for (const u of updates) {
        await stmt.executeAsync([u.weight, u.reps, u.id]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function updateSet(
  id: string,
  weight: number | null,
  reps: number | null,
  durationSeconds?: number | null
): Promise<void> {
  if (durationSeconds !== undefined) {
    await execute(
      "UPDATE workout_sets SET weight = ?, reps = ?, duration_seconds = ? WHERE id = ?",
      [weight, reps, durationSeconds, id]
    );
  } else {
    await execute(
      "UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?",
      [weight, reps, id]
    );
  }
}

export async function updateSetDuration(
  id: string,
  durationSeconds: number | null
): Promise<void> {
  await execute(
    "UPDATE workout_sets SET duration_seconds = ? WHERE id = ?",
    [durationSeconds, id]
  );
}

export async function completeSet(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ completed: 1, completed_at: Date.now() })
    .where(eq(workoutSets.id, id));
}

export async function uncompleteSet(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ completed: 0, completed_at: null })
    .where(eq(workoutSets.id, id));
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(workoutSets).where(eq(workoutSets.id, id));
}

export async function deleteSetsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await execute(`DELETE FROM workout_sets WHERE id IN (${placeholders})`, ids);
}

export async function updateSetRPE(id: string, rpe: number | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ rpe })
    .where(eq(workoutSets.id, id));
}

export async function updateSetNotes(id: string, notes: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ notes })
    .where(eq(workoutSets.id, id));
}

export async function updateSetTrainingMode(id: string, mode: TrainingMode | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ training_mode: mode })
    .where(eq(workoutSets.id, id));
}

export async function updateSetTempo(id: string, tempo: string | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ tempo })
    .where(eq(workoutSets.id, id));
}

export async function updateSetWarmup(id: string, isWarmup: boolean): Promise<void> {
  const setType = isWarmup ? "warmup" : "normal";
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ is_warmup: isWarmup ? 1 : 0, set_type: setType })
    .where(eq(workoutSets.id, id));
}

export async function updateSetType(id: string, type: SetType): Promise<void> {
  const isWarmup = type === "warmup" ? 1 : 0;
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ set_type: type, is_warmup: isWarmup })
    .where(eq(workoutSets.id, id));
}

export async function getPreviousSets(
  exerciseId: string,
  currentSessionId: string
): Promise<{ set_number: number; weight: number | null; reps: number | null }[]> {
  return query<{
    set_number: number;
    weight: number | null;
    reps: number | null;
  }>(
    `SELECT ws.set_number, ws.weight, ws.reps
     FROM workout_sets ws
     WHERE ws.exercise_id = ? AND ws.completed = 1
       AND ws.session_id = (
         SELECT wss.id FROM workout_sessions wss
         JOIN workout_sets ws2 ON ws2.session_id = wss.id
         WHERE ws2.exercise_id = ? AND wss.completed_at IS NOT NULL AND wss.id != ?
         ORDER BY wss.completed_at DESC LIMIT 1
       )
     ORDER BY ws.set_number ASC`,
    [exerciseId, exerciseId, currentSessionId]
  );
}

export async function getPreviousSetsBatch(
  exerciseIds: string[],
  currentSessionId: string
): Promise<Record<string, { set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null }[]>> {
  if (exerciseIds.length === 0) return {};
  const result: Record<string, { set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null }[]> = {};
  const eidPlaceholders = exerciseIds.map(() => "?").join(",");
  // Step 1: Find all completed sessions per exercise, ordered by most recent
  const sessionRows = await query<{ exercise_id: string; session_id: string }>(
    `SELECT ws2.exercise_id, wss.id AS session_id
     FROM workout_sessions wss
     JOIN workout_sets ws2 ON ws2.session_id = wss.id
     WHERE ws2.exercise_id IN (${eidPlaceholders})
       AND wss.completed_at IS NOT NULL
       AND wss.id != ?
     GROUP BY ws2.exercise_id, wss.id
     ORDER BY ws2.exercise_id, wss.completed_at DESC`,
    [...exerciseIds, currentSessionId]
  );
  if (sessionRows.length === 0) return result;
  // Keep only the first (most recent) session per exercise
  const sessionMap: Record<string, string> = {};
  for (const row of sessionRows) {
    if (!sessionMap[row.exercise_id]) {
      sessionMap[row.exercise_id] = row.session_id;
    }
  }
  const sessionIds = [...new Set(Object.values(sessionMap))];
  // Step 2: Fetch all completed sets from those sessions for the requested exercises
  const sidPlaceholders = sessionIds.map(() => "?").join(",");
  const rows = await query<{ exercise_id: string; session_id: string; set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null }>(
    `SELECT ws.exercise_id, ws.session_id, ws.set_number, ws.weight, ws.reps, ws.duration_seconds
     FROM workout_sets ws
     WHERE ws.session_id IN (${sidPlaceholders})
       AND ws.exercise_id IN (${eidPlaceholders})
       AND ws.completed = 1
     ORDER BY ws.exercise_id, ws.set_number ASC`,
    [...sessionIds, ...exerciseIds]
  );
  // Filter rows to only include sets from the correct session per exercise
  for (const row of rows) {
    const correctSession = sessionMap[row.exercise_id];
    if (!correctSession || row.session_id !== correctSession) continue;
    if (!result[row.exercise_id]) result[row.exercise_id] = [];
    result[row.exercise_id].push({ set_number: row.set_number, weight: row.weight, reps: row.reps, duration_seconds: row.duration_seconds });
  }
  return result;
}

export async function getSessionSetCount(
  sessionId: string
): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(workoutSets)
    .where(sql`${workoutSets.session_id} = ${sessionId} AND ${workoutSets.completed} = 1 AND ${workoutSets.is_warmup} = 0`)
    .get();
  return row?.count ?? 0;
}

export async function getSessionSetCounts(
  sessionIds: string[]
): Promise<Record<string, number>> {
  if (sessionIds.length === 0) return {};
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = await query<{ session_id: string; count: number }>(
    `SELECT session_id, COUNT(*) as count FROM workout_sets WHERE session_id IN (${placeholders}) AND completed = 1 AND is_warmup = 0 GROUP BY session_id`,
    sessionIds
  );
  const result: Record<string, number> = {};
  for (const r of rows) result[r.session_id] = r.count;
  return result;
}

export async function getSessionAvgRPE(
  sessionId: string
): Promise<number | null> {
  const row = await queryOne<{ val: number | null }>(
    "SELECT AVG(rpe) AS val FROM workout_sets WHERE session_id = ? AND completed = 1 AND rpe IS NOT NULL AND is_warmup = 0",
    [sessionId]
  );
  return row?.val ?? null;
}

export async function getSessionAvgRPEs(
  sessionIds: string[]
): Promise<Record<string, number | null>> {
  if (sessionIds.length === 0) return {};
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = await query<{ session_id: string; val: number | null }>(
    `SELECT session_id, AVG(rpe) AS val FROM workout_sets WHERE session_id IN (${placeholders}) AND completed = 1 AND rpe IS NOT NULL AND is_warmup = 0 GROUP BY session_id`,
    sessionIds
  );
  const result: Record<string, number | null> = {};
  for (const r of rows) result[r.session_id] = r.val;
  return result;
}

export async function getRestSecondsForExercise(
  sessionId: string,
  exerciseId: string
): Promise<number> {
  const row = await queryOne<{ rest_seconds: number }>(
    `SELECT te.rest_seconds
     FROM workout_sessions wss
     JOIN template_exercises te ON te.template_id = wss.template_id AND te.exercise_id = ?
     WHERE wss.id = ?`,
    [exerciseId, sessionId]
  );
  return row?.rest_seconds ?? 90;
}

export async function getRestSecondsForLink(
  sessionId: string,
  linkId: string
): Promise<number> {
  const row = await queryOne<{ rest: number }>(
    `SELECT MAX(te.rest_seconds) AS rest
     FROM workout_sessions wss
     JOIN template_exercises te ON te.template_id = wss.template_id
     WHERE wss.id = ? AND te.link_id = ?`,
    [sessionId, linkId]
  );
  return row?.rest ?? 90;
}
