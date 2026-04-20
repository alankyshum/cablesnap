import { query } from "./helpers";

// ---- E1RM Batch Trend (for Training Insights) ----

export type E1RMTrendRow = {
  exercise_id: string;
  name: string;
  current_e1rm: number;
  previous_e1rm: number;
};

// ---- Weekly E1RM Trends (for Overreaching Detection) ----

export type WeeklyE1RMRow = {
  exercise_id: string;
  name: string;
  week_start: number;
  max_e1rm: number;
};

/**
 * Weekly max e1RM per exercise over last 6 weeks.
 * Unlike getE1RMTrends() which uses 30-day windows and returns top-5 positives,
 * this returns ALL exercises with weekly granularity for overreaching detection.
 * Only includes weighted sets with reps ≤ 12 (compound-lift proxy).
 */
export async function getWeeklyE1RMTrends(now: number = Date.now()): Promise<WeeklyE1RMRow[]> {
  const sixWeeksAgo = now - 6 * 7 * 24 * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  return query<WeeklyE1RMRow>(
    `SELECT
       ws.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS name,
       CAST((wss.started_at / ?) * ? AS INTEGER) AS week_start,
       MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS max_e1rm
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed = 1
       AND ws.set_type != 'warmup'
       AND ws.weight > 0
       AND ws.reps > 0
       AND ws.reps <= 12
       AND wss.completed_at IS NOT NULL
       AND wss.started_at >= ?
     GROUP BY ws.exercise_id, week_start
     ORDER BY ws.exercise_id, week_start`,
    [weekMs, weekMs, sixWeeksAgo]
  );
}

// ---- Session RPE Data (for Overreaching Detection) ----

export type SessionRPERow = {
  session_id: string;
  started_at: number;
  avg_rpe: number;
};

/**
 * Average RPE per completed session over last 6 weeks.
 * Only includes sessions that have at least 1 set with RPE recorded.
 */
export async function getRecentSessionRPEs(now: number = Date.now()): Promise<SessionRPERow[]> {
  const sixWeeksAgo = now - 6 * 7 * 24 * 60 * 60 * 1000;

  return query<SessionRPERow>(
    `SELECT
       wss.id AS session_id,
       wss.started_at,
       AVG(ws.rpe) AS avg_rpe
     FROM workout_sessions wss
     JOIN workout_sets ws ON ws.session_id = wss.id
     WHERE wss.completed_at IS NOT NULL
       AND wss.started_at >= ?
       AND ws.completed = 1
       AND ws.rpe IS NOT NULL
       AND ws.rpe > 0
     GROUP BY wss.id
     ORDER BY wss.started_at`,
    [sixWeeksAgo]
  );
}

// ---- Session Rating Data (for Overreaching Detection) ----

export type SessionRatingRow = {
  session_id: string;
  started_at: number;
  rating: number;
};

/**
 * Session ratings over last 6 weeks.
 * Only includes completed sessions with a non-null rating.
 */
export async function getRecentSessionRatings(now: number = Date.now()): Promise<SessionRatingRow[]> {
  const sixWeeksAgo = now - 6 * 7 * 24 * 60 * 60 * 1000;

  return query<SessionRatingRow>(
    `SELECT
       wss.id AS session_id,
       wss.started_at,
       wss.rating
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
       AND wss.started_at >= ?
       AND wss.rating IS NOT NULL
       AND wss.rating > 0
     ORDER BY wss.started_at`,
    [sixWeeksAgo]
  );
}

/**
 * Top-5 most-trained exercises with positive e1RM trend.
 * Compares max estimated 1RM from the last 30 days vs the previous 30 days.
 * Only includes exercises with 3+ completed sessions in the recent window.
 */
export async function getE1RMTrends(): Promise<E1RMTrendRow[]> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  return query<E1RMTrendRow>(
    `SELECT
       cur.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS name,
       cur.e1rm AS current_e1rm,
       prev.e1rm AS previous_e1rm
     FROM (
       SELECT ws.exercise_id,
              MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm,
              COUNT(DISTINCT wss.id) AS session_count
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight > 0
         AND ws.reps > 0
         AND ws.reps <= 12
         AND wss.completed_at IS NOT NULL
         AND wss.started_at >= ?
       GROUP BY ws.exercise_id
       HAVING session_count >= 3
     ) cur
     JOIN (
       SELECT ws.exercise_id,
              MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight > 0
         AND ws.reps > 0
         AND ws.reps <= 12
         AND wss.completed_at IS NOT NULL
         AND wss.started_at >= ? AND wss.started_at < ?
       GROUP BY ws.exercise_id
     ) prev ON cur.exercise_id = prev.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.e1rm > prev.e1rm
     ORDER BY (cur.e1rm - prev.e1rm) DESC
     LIMIT 5`,
    [thirtyDaysAgo, sixtyDaysAgo, thirtyDaysAgo]
  );
}
