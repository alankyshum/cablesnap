import { query, queryOne } from "./helpers";

export type ExerciseSession = {
  session_id: string;
  session_name: string;
  started_at: number;
  max_weight: number;
  max_reps: number;
  total_reps: number;
  set_count: number;
  volume: number;
  avg_rpe: number | null;
};

export type ExerciseRecords = {
  max_weight: number | null;
  max_reps: number | null;
  max_volume: number | null;
  est_1rm: number | null;
  total_sessions: number;
  is_bodyweight: boolean;
  max_duration: number | null;
};

export async function getExerciseHistory(
  exerciseId: string,
  limit: number = 10,
  offset: number = 0
): Promise<ExerciseSession[]> {
  return query<ExerciseSession>(
    `SELECT wss.id AS session_id,
            wss.name AS session_name,
            wss.started_at,
            MAX(ws.weight) AS max_weight,
            MAX(ws.reps) AS max_reps,
            SUM(ws.reps) AS total_reps,
            COUNT(ws.id) AS set_count,
            SUM(ws.weight * ws.reps) AS volume,
            AVG(CASE WHEN ws.rpe IS NOT NULL THEN ws.rpe END) AS avg_rpe
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND ws.is_warmup = 0
       AND wss.completed_at IS NOT NULL
     GROUP BY wss.id
     ORDER BY wss.started_at DESC
     LIMIT ? OFFSET ?`,
    [exerciseId, limit, offset]
  );
}

export async function getExerciseRecords(exerciseId: string): Promise<ExerciseRecords> {
  const weight = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.weight) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND ws.weight > 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const reps = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.reps) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const vol = await queryOne<{ val: number | null }>(
    `SELECT MAX(sv) AS val FROM (
       SELECT SUM(ws.weight * ws.reps) AS sv
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
     )`,
    [exerciseId]
  );

  const rm = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND ws.weight > 0 AND ws.reps > 0 AND ws.reps <= 12 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const count = await queryOne<{ val: number }>(
    `SELECT COUNT(DISTINCT wss.id) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const weighted = await queryOne<{ val: number }>(
    `SELECT EXISTS(SELECT 1 FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND weight > 0) AS val`,
    [exerciseId]
  );

  const dur = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.duration_seconds) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.is_warmup = 0 AND ws.duration_seconds > 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  return {
    max_weight: weight?.val ?? null,
    max_reps: reps?.val ?? null,
    max_volume: vol?.val ?? null,
    est_1rm: rm?.val ? Math.round(rm.val * 10) / 10 : null,
    total_sessions: count?.val ?? 0,
    is_bodyweight: !(weighted?.val),
    max_duration: dur?.val ?? null,
  };
}

export async function getExercise1RMChartData(
  exerciseId: string,
  limit: number = 20
): Promise<{ date: number; value: number }[]> {
  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.weight * (1 + ws.reps / 30.0)) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND ws.is_warmup = 0
         AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );
}

export async function getExerciseChartData(
  exerciseId: string,
  limit: number = 20
): Promise<{ date: number; value: number }[]> {
  const rows = await query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.weight) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.is_warmup = 0
         AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );

  if (rows.length > 0) return rows;

  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.reps) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND wss.completed_at IS NOT NULL
         AND ws.is_warmup = 0
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );
}

export async function getExerciseDurationChartData(
  exerciseId: string,
  limit: number = 20
): Promise<{ date: number; value: number }[]> {
  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.duration_seconds) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.duration_seconds IS NOT NULL
         AND ws.duration_seconds > 0
         AND ws.is_warmup = 0
         AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );
}

export async function getRecentExerciseSets(
  exerciseId: string,
  count: number,
): Promise<{
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
}[]> {
  return query<{
    session_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    completed: number;
    started_at: number;
  }>(
    `SELECT ws.session_id, ws.set_number, ws.weight, ws.reps, ws.rpe,
            ws.completed, wss.started_at
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND wss.completed_at IS NOT NULL
       AND wss.id IN (
         SELECT DISTINCT wss2.id
         FROM workout_sessions wss2
         JOIN workout_sets ws2 ON ws2.session_id = wss2.id
         WHERE ws2.exercise_id = ?
           AND wss2.completed_at IS NOT NULL
         ORDER BY wss2.started_at DESC
         LIMIT ?
       )
     ORDER BY wss.started_at ASC, ws.set_number ASC`,
    [exerciseId, exerciseId, count],
  );
}

type RecentSetRow = {
  exercise_id: string;
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
};

export async function getRecentExerciseSetsBatch(
  exerciseIds: string[],
  limit: number,
): Promise<Record<string, {
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
}[]>> {
  if (exerciseIds.length === 0) return {};
  const result: Record<string, RecentSetRow[]> = {};
  // For each exercise, find the N most recent completed sessions, then fetch sets
  // We use a single query with a window-based approach
  const eidPlaceholders = exerciseIds.map(() => "?").join(",");
  // Step 1: Find the latest `limit` sessions per exercise
  const sessionRows = await query<{ exercise_id: string; session_id: string }>(
    `SELECT ws2.exercise_id, wss.id AS session_id
     FROM workout_sessions wss
     JOIN workout_sets ws2 ON ws2.session_id = wss.id
     WHERE ws2.exercise_id IN (${eidPlaceholders})
       AND wss.completed_at IS NOT NULL
     GROUP BY ws2.exercise_id, wss.id
     ORDER BY ws2.exercise_id, wss.started_at DESC`,
    exerciseIds
  );
  // Keep only the top `limit` sessions per exercise
  const sessionsByExercise: Record<string, string[]> = {};
  for (const row of sessionRows) {
    if (!sessionsByExercise[row.exercise_id]) sessionsByExercise[row.exercise_id] = [];
    if (sessionsByExercise[row.exercise_id].length < limit) {
      sessionsByExercise[row.exercise_id].push(row.session_id);
    }
  }
  const allSessionIds = [...new Set(Object.values(sessionsByExercise).flat())];
  if (allSessionIds.length === 0) return result;
  // Step 2: Fetch all sets from those sessions for the requested exercises
  const sidPlaceholders = allSessionIds.map(() => "?").join(",");
  const rows = await query<RecentSetRow>(
    `SELECT ws.exercise_id, ws.session_id, ws.set_number, ws.weight, ws.reps, ws.rpe,
            ws.completed, wss.started_at
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.session_id IN (${sidPlaceholders})
       AND ws.exercise_id IN (${eidPlaceholders})
     ORDER BY wss.started_at ASC, ws.set_number ASC`,
    [...allSessionIds, ...exerciseIds]
  );
  // Filter rows to only include sets from the correct sessions per exercise
  for (const row of rows) {
    const validSessions = sessionsByExercise[row.exercise_id];
    if (!validSessions || !validSessions.includes(row.session_id)) continue;
    if (!result[row.exercise_id]) result[row.exercise_id] = [];
    result[row.exercise_id].push(row);
  }
  return result;
}

export async function getBestSet(
  exerciseId: string,
): Promise<{ weight: number; reps: number } | null> {
  return queryOne<{ weight: number; reps: number }>(
    `SELECT ws.weight, ws.reps
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND ws.is_warmup = 0
       AND ws.weight > 0
       AND ws.reps > 0
       AND ws.reps <= 12
       AND wss.completed_at IS NOT NULL
     ORDER BY ws.weight * (1.0 + ws.reps / 30.0) DESC
     LIMIT 1`,
    [exerciseId],
  );
}
