import { query } from "./helpers";

export type StrengthOverviewRow = {
  exercise_id: string;
  name: string;
  est_1rm: number;
};

/**
 * Get the best e1RM for all exercises that have at least one completed weighted set.
 * Used by the progress screen strength levels card.
 */
export async function getStrengthOverview(): Promise<StrengthOverviewRow[]> {
  return query<StrengthOverviewRow>(
    `SELECT
       ws.exercise_id,
       e.name,
       MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS est_1rm
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed = 1
       AND ws.set_type != 'warmup'
       AND ws.weight > 0
       AND ws.reps > 0
       AND ws.reps <= 12
       AND wss.completed_at IS NOT NULL
       AND e.deleted_at IS NULL
     GROUP BY ws.exercise_id
     ORDER BY est_1rm DESC`,
  );
}
