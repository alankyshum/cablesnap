import type { Exercise, Attachment, MountPosition } from "../types";
import { query } from "./helpers";
import { mapRow, type ExerciseRow } from "./exercises";

/**
 * Cable Setup Finder — exercise discovery by equipment configuration (BLD-875).
 *
 * All queries target `equipment = 'cable'` and filter by optional mount_position
 * and/or attachment. Results are sorted by primary_muscles then name for
 * consistent SectionList grouping.
 */

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
): Promise<Exercise[]> {
  const { mountPosition, attachment } = filters;

  const rows = await query<ExerciseRow>(
    `SELECT id, name, category, primary_muscles, secondary_muscles,
            equipment, instructions, difficulty, is_custom, deleted_at,
            mount_position, attachment, training_modes, is_voltra,
            start_image_uri, end_image_uri
     FROM exercises
     WHERE equipment = 'cable'
       AND deleted_at IS NULL
       AND (mount_position = ? OR ? IS NULL)
       AND (attachment = ? OR ? IS NULL)
     ORDER BY primary_muscles, name`,
    [
      mountPosition, mountPosition,
      attachment, attachment,
    ]
  );

  return rows.map(mapRow);
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
