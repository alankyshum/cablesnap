import { query } from "./helpers";

// ---- E1RM Batch Trend (for Training Insights) ----

export type E1RMTrendRow = {
  exercise_id: string;
  name: string;
  current_e1rm: number;
  previous_e1rm: number;
};

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
         AND ws.is_warmup = 0
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
         AND ws.is_warmup = 0
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
