import type { Exercise, Attachment, MountPosition } from "../types";
import { query } from "./helpers";
import { mapRow, type ExerciseRow } from "./exercises";

/**
 * Cable Setup Finder — exercise discovery by equipment configuration (BLD-875).
 *
 * All queries target `equipment = 'cable'` and filter by optional mount_position
 * and/or attachment. Results are sorted by primary_muscles then name for
 * consistent SectionList grouping.
 *
 * Note: `mount_position` was moved from the Exercise type to per-set data
 * (BLD-771). CableExercise surfaces the most recent non-null per-set value for
 * this finder screen.
 */

/** Exercise with mount_position surfaced from the most recent logged set. */
export type CableExercise = Exercise & {
  mount_position?: MountPosition | null;
};

export type CableFinderFilters = {
  mountPosition: MountPosition | null;
  attachment: Attachment | null;
};

/**
 * Fetch cable exercises matching the given filters.
 * Both filters are optional — null means "any".
 */
export async function getCableExercises(
  filters: CableFinderFilters
): Promise<CableExercise[]> {
  const { mountPosition, attachment } = filters;

  const rows = await query<ExerciseRow & { mount_position: string | null }>(
    `WITH latest_mount AS (
       SELECT exercise_id, mount_position,
              ROW_NUMBER() OVER (
                PARTITION BY exercise_id
                ORDER BY completed_at DESC, set_number DESC, id DESC
              ) AS rn
       FROM workout_sets
       WHERE mount_position IS NOT NULL
     )
     SELECT e.id, e.name, e.category, e.primary_muscles, e.secondary_muscles,
            e.equipment, e.instructions, e.difficulty, e.is_custom, e.deleted_at,
            lm.mount_position, e.attachment, e.is_voltra,
            e.start_image_uri, e.end_image_uri, e.progression_group, e.progression_order
     FROM exercises e
     LEFT JOIN latest_mount lm ON lm.exercise_id = e.id AND lm.rn = 1
     WHERE e.equipment = 'cable'
       AND e.deleted_at IS NULL
       AND (lm.mount_position = ? OR ? IS NULL)
       AND (e.attachment = ? OR ? IS NULL)
     ORDER BY e.primary_muscles, e.name`,
    [
      mountPosition, mountPosition,
      attachment, attachment,
    ]
  );

  return rows.map((row) => ({
    ...mapRow(row as unknown as ExerciseRow),
    mount_position: (row.mount_position as MountPosition) ?? undefined,
  }));
}

/**
 * Fetch the distinct attachment values that exist for cable exercises.
 * Used to render only the chips that have at least one matching exercise.
 */
export async function getAvailableAttachments(): Promise<Attachment[]> {
  const rows = await query<{ attachment: string }>(
    `SELECT DISTINCT attachment
     FROM exercises
     WHERE equipment = 'cable'
       AND attachment IS NOT NULL
       AND deleted_at IS NULL
     ORDER BY attachment`
  );

  return rows.map((r) => r.attachment as Attachment);
}
