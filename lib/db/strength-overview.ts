import { query } from "./helpers";

export type StrengthOverviewRow = {
  exercise_id: string;
  name: string;
  est_1rm: number;
  // BLD-1086: variant provenance for caption-only display on Strength Levels card.
  // Non-null only for cable exercises (equipment='cable'). Never changes the level.
  best_variant_attachment: string | null;
  best_variant_mount: string | null;
  best_variant_grip_type: string | null;
};

/**
 * Get the best e1RM for all exercises that have at least one completed weighted set.
 * Used by the progress screen strength levels card.
 *
 * BLD-1086: For cable exercises the row also carries the variant tuple
 * (attachment, mount_position, grip_type) of the single best set, so the
 * Strength Levels card can show caption-only provenance ("best achieved with: Rope").
 * The level itself stays exercise-best — no per-variant recalculation.
 */
export async function getStrengthOverview(): Promise<StrengthOverviewRow[]> {
  return query<StrengthOverviewRow>(
    `SELECT
       ws.exercise_id,
       e.name,
       MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS est_1rm,
       CASE WHEN e.equipment = 'cable'
         THEN (
           SELECT ws2.attachment
           FROM workout_sets ws2
           JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ws.exercise_id
             AND ws2.completed = 1 AND ws2.set_type != 'warmup'
             AND ws2.weight > 0 AND ws2.reps > 0 AND ws2.reps <= 12
             AND wss2.completed_at IS NOT NULL
           ORDER BY ws2.weight * (1.0 + ws2.reps / 30.0) DESC
           LIMIT 1
         )
         ELSE NULL
       END AS best_variant_attachment,
       CASE WHEN e.equipment = 'cable'
         THEN (
           SELECT ws2.mount_position
           FROM workout_sets ws2
           JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ws.exercise_id
             AND ws2.completed = 1 AND ws2.set_type != 'warmup'
             AND ws2.weight > 0 AND ws2.reps > 0 AND ws2.reps <= 12
             AND wss2.completed_at IS NOT NULL
           ORDER BY ws2.weight * (1.0 + ws2.reps / 30.0) DESC
           LIMIT 1
         )
         ELSE NULL
       END AS best_variant_mount,
       CASE WHEN e.equipment = 'cable'
         THEN (
           SELECT ws2.grip_type
           FROM workout_sets ws2
           JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ws.exercise_id
             AND ws2.completed = 1 AND ws2.set_type != 'warmup'
             AND ws2.weight > 0 AND ws2.reps > 0 AND ws2.reps <= 12
             AND wss2.completed_at IS NOT NULL
           ORDER BY ws2.weight * (1.0 + ws2.reps / 30.0) DESC
           LIMIT 1
         )
         ELSE NULL
       END AS best_variant_grip_type
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
