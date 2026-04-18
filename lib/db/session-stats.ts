import type { WorkoutSession, MuscleGroup } from "../types";
import { query, queryOne } from "./helpers";

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
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
  const rows = await query<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ?
     ORDER BY started_at DESC`,
    [twoYearsAgo]
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
     WHERE ws.completed = 1 AND ws.is_warmup = 0 AND wss.completed_at IS NOT NULL AND wss.started_at >= ?
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
       AND ws.is_warmup = 0
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
       AND ws.is_warmup = 0
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
         AND ws.is_warmup = 0
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
         AND ws.is_warmup = 0
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
       AND ws.is_warmup = 0
       AND wss.completed_at IS NOT NULL
       AND ws.weight > (SELECT MAX(ws2.weight)
          FROM workout_sets ws2
          JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
          WHERE ws2.exercise_id = ws.exercise_id
            AND ws2.session_id != ws.session_id
            AND ws2.completed = 1
            AND ws2.weight IS NOT NULL
            AND ws2.weight > 0
            AND ws2.is_warmup = 0
            AND wss2.completed_at IS NOT NULL
            AND wss2.started_at < wss.started_at
         )
     GROUP BY ws.session_id, ws.exercise_id
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
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
         AND ws.is_warmup = 0
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
         AND ws.is_warmup = 0
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
       FROM workout_sets WHERE session_id = ? AND completed = 1 AND is_warmup = 0`,
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
       AND ws.is_warmup = 0
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
         AND ws.is_warmup = 0
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

// ---- Heatmap Queries ----

export async function getSessionCountsByDay(
  startTs: number,
  endTs: number
): Promise<{ date: string; count: number }[]> {
  return query<{ date: string; count: number }>(
    `SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS date,
            COUNT(*) AS count
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ? AND started_at < ?
     GROUP BY date
     ORDER BY date ASC`,
    [startTs, endTs]
  );
}

export async function getTotalSessionCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workout_sessions WHERE completed_at IS NOT NULL"
  );
  return row?.count ?? 0;
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
       AND ws.is_warmup = 0
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
       AND ws.is_warmup = 0
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
