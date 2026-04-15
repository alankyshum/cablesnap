import type { WorkoutSession, WorkoutSet, TrainingMode, MuscleGroup } from "../types";
import { uuid } from "../uuid";
import { query, queryOne, execute } from "./helpers";

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
};

// ---- Sessions ----

export async function startSession(
  templateId: string | null,
  name: string,
  programDayId?: string
): Promise<WorkoutSession> {
  const id = uuid();
  const now = Date.now();
  await execute(
    "INSERT INTO workout_sessions (id, template_id, name, started_at, notes, program_day_id) VALUES (?, ?, ?, ?, '', ?)",
    [id, templateId, name, now, programDayId ?? null]
  );
  return {
    id,
    template_id: templateId,
    name,
    started_at: now,
    completed_at: null,
    duration_seconds: null,
    notes: "",
  };
}

export async function completeSession(
  id: string,
  notes?: string
): Promise<void> {
  const now = Date.now();
  const session = await queryOne<{ started_at: number }>(
    "SELECT started_at FROM workout_sessions WHERE id = ?",
    [id]
  );
  const duration = session ? Math.floor((now - session.started_at) / 1000) : 0;
  await execute(
    "UPDATE workout_sessions SET completed_at = ?, duration_seconds = ?, notes = ? WHERE id = ?",
    [now, duration, notes ?? "", id]
  );
}

export async function cancelSession(id: string): Promise<void> {
  await execute("DELETE FROM workout_sets WHERE session_id = ?", [id]);
  await execute("DELETE FROM workout_sessions WHERE id = ?", [id]);
}

export async function getRecentSessions(
  limit = 20
): Promise<WorkoutSession[]> {
  return query<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    [limit]
  );
}

export async function getSessionById(
  id: string
): Promise<WorkoutSession | null> {
  return queryOne<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE id = ?",
    [id]
  );
}

export async function getSessionSets(
  sessionId: string
): Promise<(WorkoutSet & { exercise_name?: string; exercise_deleted?: boolean })[]> {
  const rows = await query<SetRow>(
    `SELECT ws.*, e.name AS exercise_name, e.deleted_at AS exercise_deleted_at
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
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
    exercise_name: r.exercise_name ?? undefined,
    exercise_deleted: r.exercise_deleted_at != null,
  }));
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  return queryOne<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1"
  );
}

// ---- Sets ----

export async function addSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  linkId?: string | null,
  round?: number | null,
  trainingMode?: TrainingMode | null,
  tempo?: string | null
): Promise<WorkoutSet> {
  const id = uuid();
  await execute(
    "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, link_id, round, training_mode, tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, sessionId, exerciseId, setNumber, linkId ?? null, round ?? null, trainingMode ?? null, tempo ?? null]
  );
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
  };
}

export async function updateSet(
  id: string,
  weight: number | null,
  reps: number | null
): Promise<void> {
  await execute(
    "UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?",
    [weight, reps, id]
  );
}

export async function completeSet(id: string): Promise<void> {
  await execute(
    "UPDATE workout_sets SET completed = 1, completed_at = ? WHERE id = ?",
    [Date.now(), id]
  );
}

export async function uncompleteSet(id: string): Promise<void> {
  await execute(
    "UPDATE workout_sets SET completed = 0, completed_at = NULL WHERE id = ?",
    [id]
  );
}

export async function deleteSet(id: string): Promise<void> {
  await execute("DELETE FROM workout_sets WHERE id = ?", [id]);
}

export async function updateSetRPE(id: string, rpe: number | null): Promise<void> {
  await execute(
    "UPDATE workout_sets SET rpe = ? WHERE id = ?",
    [rpe, id]
  );
}

export async function updateSetNotes(id: string, notes: string): Promise<void> {
  await execute(
    "UPDATE workout_sets SET notes = ? WHERE id = ?",
    [notes, id]
  );
}

export async function updateSetTrainingMode(id: string, mode: TrainingMode | null): Promise<void> {
  await execute(
    "UPDATE workout_sets SET training_mode = ? WHERE id = ?",
    [mode, id]
  );
}

export async function updateSetTempo(id: string, tempo: string | null): Promise<void> {
  await execute(
    "UPDATE workout_sets SET tempo = ? WHERE id = ?",
    [tempo, id]
  );
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

export async function getSessionSetCount(
  sessionId: string
): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM workout_sets WHERE session_id = ? AND completed = 1",
    [sessionId]
  );
  return row?.count ?? 0;
}

export async function getSessionAvgRPE(
  sessionId: string
): Promise<number | null> {
  const row = await queryOne<{ val: number | null }>(
    "SELECT AVG(rpe) AS val FROM workout_sets WHERE session_id = ? AND completed = 1 AND rpe IS NOT NULL",
    [sessionId]
  );
  return row?.val ?? null;
}

// ---- Rest Timer Helpers ----

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

// ---- History & Calendar ----

export async function getSessionsByMonth(
  year: number,
  month: number
): Promise<(WorkoutSession & { set_count: number })[]> {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
       AND wss.started_at >= ? AND wss.started_at < ?
     ORDER BY wss.started_at DESC`,
    [start, end]
  );
}

export async function searchSessions(
  q: string,
  limit = 50
): Promise<(WorkoutSession & { set_count: number })[]> {
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL AND wss.name LIKE ?
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [`%${q}%`, limit]
  );
}

export async function getAllCompletedSessionWeeks(): Promise<number[]> {
  const rows = await query<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY started_at DESC`
  );
  return rows.map((r) => r.started_at);
}

// ---- Progress Queries ----

export async function getWeeklySessionCounts(
  weeks = 8
): Promise<{ week: string; count: number }[]> {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const rows = await query<{ week_start: number; count: number }>(
    `SELECT (started_at / 604800000) * 604800000 AS week_start, COUNT(*) AS count
     FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ?
     GROUP BY week_start
     ORDER BY week_start ASC`,
    [cutoff]
  );
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      count: r.count,
    };
  });
}

export async function getWeeklyVolume(
  weeks = 8
): Promise<{ week: string; volume: number }[]> {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const rows = await query<{ week_start: number; volume: number }>(
    `SELECT (wss.started_at / 604800000) * 604800000 AS week_start,
            COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL AND wss.started_at >= ?
     GROUP BY week_start
     ORDER BY week_start ASC`,
    [cutoff]
  );
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      volume: r.volume,
    };
  });
}

export async function getPersonalRecords(): Promise<
  { exercise_id: string; name: string; max_weight: number }[]
> {
  return query<{ exercise_id: string; name: string; max_weight: number }>(
    `SELECT ws.exercise_id, COALESCE(e.name, 'Deleted Exercise') AS name, MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND ws.weight IS NOT NULL AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id
     ORDER BY name ASC`
  );
}

export async function getCompletedSessionsWithSetCount(
  limit = 10
): Promise<(WorkoutSession & { set_count: number })[]> {
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// ---- Workout Insights (PR Detection) ----

export async function getMaxWeightByExercise(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const placeholders = exerciseIds.map(() => "?").join(", ");
  const rows = await query<{ exercise_id: string; max_weight: number }>(
    `SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id IN (${placeholders})
       AND ws.session_id != ?
       AND ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id`,
    [...exerciseIds, excludeSessionId]
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.exercise_id] = r.max_weight;
  }
  return result;
}

export async function getSessionPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; weight: number; previous_max: number }[]> {
  return query<{ exercise_id: string; name: string; weight: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_weight AS weight,
            hist.max_weight AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_weight > hist.max_weight
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getRecentPRs(
  limit: number = 5
): Promise<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }[]> {
  return query<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }>(
    `SELECT ws.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS weight,
            ws.session_id,
            wss.started_at AS date
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
       AND ws.weight > (SELECT MAX(ws2.weight)
          FROM workout_sets ws2
          JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
          WHERE ws2.exercise_id = ws.exercise_id
            AND ws2.session_id != ws.session_id
            AND ws2.completed = 1
            AND ws2.weight IS NOT NULL
            AND ws2.weight > 0
            AND wss2.completed_at IS NOT NULL
            AND wss2.started_at < wss.started_at
         )
     GROUP BY ws.session_id, ws.exercise_id
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// ---- Exercise History & Performance ----

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
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.weight > 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const reps = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.reps) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const vol = await queryOne<{ val: number | null }>(
    `SELECT MAX(sv) AS val FROM (
       SELECT SUM(ws.weight * ws.reps) AS sv
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
     )`,
    [exerciseId]
  );

  const rm = await queryOne<{ val: number | null }>(
    `SELECT MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.weight > 0 AND ws.reps > 0 AND ws.reps <= 12 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const count = await queryOne<{ val: number }>(
    `SELECT COUNT(DISTINCT wss.id) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const weighted = await queryOne<{ val: number }>(
    `SELECT EXISTS(SELECT 1 FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND weight > 0) AS val`,
    [exerciseId]
  );

  return {
    max_weight: weight?.val ?? null,
    max_reps: reps?.val ?? null,
    max_volume: vol?.val ?? null,
    est_1rm: rm?.val ? Math.round(rm.val * 10) / 10 : null,
    total_sessions: count?.val ?? 0,
    is_bodyweight: !(weighted?.val),
  };
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

export async function getBestSet(
  exerciseId: string,
): Promise<{ weight: number; reps: number } | null> {
  return queryOne<{ weight: number; reps: number }>(
    `SELECT ws.weight, ws.reps
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND ws.weight > 0
       AND ws.reps > 0
       AND ws.reps <= 12
       AND wss.completed_at IS NOT NULL
     ORDER BY ws.weight * (1.0 + ws.reps / 30.0) DESC
     LIMIT 1`,
    [exerciseId],
  );
}

// ---- Muscle Volume Analysis ----

export async function getMuscleVolumeForWeek(
  weekStart: number
): Promise<{ muscle: MuscleGroup; sets: number; exercises: number }[]> {
  const end = weekStart + 7 * 24 * 60 * 60 * 1000;

  const rows = await query<{
    exercise_id: string;
    primary_muscles: string | null;
    sets: number;
  }>(
    `SELECT ws.exercise_id,
            e.primary_muscles,
            COUNT(*) AS sets
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE wss.completed_at IS NOT NULL
       AND wss.completed_at >= ?
       AND wss.completed_at < ?
       AND ws.completed = 1
     GROUP BY ws.exercise_id`,
    [weekStart, end]
  );

  const map = new Map<MuscleGroup, { sets: number; exercises: Set<string> }>();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    let muscles: MuscleGroup[];
    try {
      muscles = JSON.parse(row.primary_muscles);
    } catch {
      continue;
    }
    if (!Array.isArray(muscles) || muscles.length === 0) continue;

    for (const m of muscles) {
      const entry = map.get(m) ?? { sets: 0, exercises: new Set<string>() };
      entry.sets += row.sets;
      entry.exercises.add(row.exercise_id);
      map.set(m, entry);
    }
  }

  return Array.from(map.entries())
    .map(([muscle, data]) => ({
      muscle,
      sets: data.sets,
      exercises: data.exercises.size,
    }))
    .sort((a, b) => b.sets - a.sets);
}

export async function getMuscleVolumeTrend(
  muscle: MuscleGroup,
  weeks: number
): Promise<{ week: string; sets: number }[]> {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diff);

  const oldest = new Date(monday);
  oldest.setDate(oldest.getDate() - (weeks - 1) * 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 7);

  const rows = await query<{
    primary_muscles: string | null;
    completed_at: number;
    sets: number;
  }>(
    `SELECT e.primary_muscles, wss.completed_at, COUNT(*) AS sets
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE wss.completed_at IS NOT NULL
       AND wss.completed_at >= ?
       AND wss.completed_at < ?
       AND ws.completed = 1
     GROUP BY ws.exercise_id, wss.id`,
    [oldest.getTime(), end.getTime()]
  );

  const buckets = new Array<number>(weeks).fill(0);
  const oldestMs = oldest.getTime();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    try {
      const muscles: MuscleGroup[] = JSON.parse(row.primary_muscles);
      if (!muscles.includes(muscle)) continue;
    } catch {
      continue;
    }
    const idx = Math.floor((row.completed_at - oldestMs) / (7 * 24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < weeks) buckets[idx] += row.sets;
  }

  return buckets.map((sets, i) => ({ week: `W${i + 1}`, sets }));
}

// ---- Post-Workout Summary ----

export async function getSessionRepPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; reps: number; previous_max: number }[]> {
  return query<{ exercise_id: string; name: string; reps: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_reps AS reps,
            hist.max_reps AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_reps > hist.max_reps
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getSessionComparison(
  sessionId: string
): Promise<{
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null> {
  const session = await queryOne<{ template_id: string | null; started_at: number }>(
    "SELECT template_id, started_at FROM workout_sessions WHERE id = ?",
    [sessionId]
  );
  if (!session?.template_id) return null;

  const prev = await queryOne<{ id: string; duration_seconds: number | null }>(
    `SELECT id, duration_seconds FROM workout_sessions
     WHERE template_id = ? AND id != ? AND completed_at IS NOT NULL
     ORDER BY started_at DESC LIMIT 1`,
    [session.template_id, sessionId]
  );
  if (!prev) return null;

  const agg = async (sid: string) => {
    const row = await queryOne<{ vol: number; cnt: number }>(
      `SELECT COALESCE(SUM(CASE WHEN weight IS NOT NULL AND reps IS NOT NULL THEN weight * reps ELSE 0 END), 0) AS vol,
              COUNT(*) AS cnt
       FROM workout_sets WHERE session_id = ? AND completed = 1`,
      [sid]
    );
    return { volume: row?.vol ?? 0, sets: row?.cnt ?? 0 };
  };

  const curAgg = await agg(sessionId);
  const prevAgg = await agg(prev.id);

  const curSession = await queryOne<{ duration_seconds: number | null }>(
    "SELECT duration_seconds FROM workout_sessions WHERE id = ?",
    [sessionId]
  );

  return {
    current: { ...curAgg, duration: curSession?.duration_seconds ?? 0 },
    previous: { ...prevAgg, duration: prev.duration_seconds ?? 0 },
  };
}

export async function getSessionWeightIncreases(
  sessionId: string
): Promise<{ exercise_id: string; name: string; current: number; previous: number }[]> {
  const current = await query<{
    exercise_id: string;
    name: string;
    max_weight: number;
  }>(
    `SELECT ws.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ?
       AND ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
     GROUP BY ws.exercise_id`,
    [sessionId]
  );

  if (current.length === 0) return [];

  const session = await queryOne<{ started_at: number }>(
    "SELECT started_at FROM workout_sessions WHERE id = ?",
    [sessionId]
  );
  if (!session) return [];

  const result: { exercise_id: string; name: string; current: number; previous: number }[] = [];

  for (const ex of current) {
    const prev = await queryOne<{ max_weight: number }>(
      `SELECT MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND wss.id != ?
         AND wss.completed_at IS NOT NULL
         AND ws.completed = 1
         AND ws.weight > 0
         AND wss.started_at = (
           SELECT MAX(wss2.started_at)
           FROM workout_sessions wss2
           JOIN workout_sets ws2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ?
             AND wss2.id != ?
             AND wss2.completed_at IS NOT NULL
             AND ws2.completed = 1
         )`,
      [ex.exercise_id, sessionId, ex.exercise_id, sessionId]
    );

    if (prev?.max_weight && ex.max_weight > prev.max_weight) {
      result.push({
        exercise_id: ex.exercise_id,
        name: ex.name,
        current: ex.max_weight,
        previous: prev.max_weight,
      });
    }
  }

  return result;
}
