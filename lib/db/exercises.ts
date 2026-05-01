import { eq, and, isNull, inArray } from "drizzle-orm";
import type { Exercise } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, withTransaction } from "./helpers";
import { exercises, templateExercises } from "./schema";
import type { ExerciseRow } from "./schema";

function mapRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Exercise["category"],
    primary_muscles: JSON.parse(row.primary_muscles) as Exercise["primary_muscles"],
    secondary_muscles: JSON.parse(row.secondary_muscles) as Exercise["secondary_muscles"],
    equipment: row.equipment as Exercise["equipment"],
    instructions: row.instructions,
    difficulty: row.difficulty as Exercise["difficulty"],
    is_custom: row.is_custom === 1,
    deleted_at: row.deleted_at ?? undefined,
    attachment: (row.attachment as Exercise["attachment"]) ?? undefined,
    is_voltra: row.is_voltra === 1 ? true : undefined,
    // BLD-561: optional user-supplied illustration URIs (custom exercises only).
    start_image_uri: row.start_image_uri ?? undefined,
    end_image_uri: row.end_image_uri ?? undefined,
    // BLD-913: progression chain data.
    progression_group: row.progression_group ?? undefined,
    progression_order: row.progression_order ?? undefined,
  };
}

export { mapRow, type ExerciseRow };

// ---- E2E deterministic fixture (BLD-526) ----
//
// The static `expo export -p web` bundle used for Playwright visual regression
// boots wa-sqlite asynchronously; on slow CI runners the initial exercises
// query is still loading when the screenshot fires, so baselines captured the
// empty-list state (parent BLD-517). To make the list screen deterministic,
// allow Playwright to inject a pre-shaped fixture array onto `window` via
// `addInitScript`. The check is double-hardened: the flag is only honored
// when `navigator.webdriver === true`, so a console-injected flag in a real
// user's browser can never swap their data.
function readE2EFixture(): Exercise[] | null {
  if (typeof window === "undefined") return null;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { webdriver?: boolean })
      : null;
  if (!nav?.webdriver) return null;
  const flag = (window as unknown as { __E2E_EXERCISE_FIXTURE__?: unknown })
    .__E2E_EXERCISE_FIXTURE__;
  if (!Array.isArray(flag)) return null;
  return flag as Exercise[];
}

export async function getAllExercises(): Promise<Exercise[]> {
  const fixture = readE2EFixture();
  if (fixture) {
    // Honor prod ordering (by name, asc) so snapshots mirror real render.
    return [...fixture].sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDrizzle();
  const rows = await db.select()
    .from(exercises)
    .where(isNull(exercises.deleted_at))
    .orderBy(exercises.name);
  return (rows as unknown as ExerciseRow[]).map(mapRow);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const fixture = readE2EFixture();
  if (fixture) {
    return fixture.find((e) => e.id === id) ?? null;
  }
  const db = await getDrizzle();
  const row = await db.select()
    .from(exercises)
    .where(eq(exercises.id, id))
    .get();
  if (!row) return null;
  return mapRow(row as unknown as ExerciseRow);
}

export async function getExercisesByIds(
  exerciseIds: string[]
): Promise<Record<string, Exercise>> {
  if (exerciseIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db.select().from(exercises).where(inArray(exercises.id, exerciseIds));
  const result: Record<string, Exercise> = {};
  for (const row of rows as unknown as ExerciseRow[]) result[row.id] = mapRow(row);
  return result;
}

export async function createCustomExercise(
  exercise: Omit<Exercise, "id" | "is_custom">
): Promise<Exercise> {
  const id = uuid();
  const db = await getDrizzle();
  await db.insert(exercises).values({
    id,
    name: exercise.name,
    category: exercise.category,
    primary_muscles: JSON.stringify(exercise.primary_muscles),
    secondary_muscles: JSON.stringify(exercise.secondary_muscles),
    equipment: exercise.equipment,
    instructions: exercise.instructions,
    difficulty: exercise.difficulty,
    is_custom: 1,
  });
  return { ...exercise, id, is_custom: true };
}

export async function updateCustomExercise(
  id: string,
  exercise: Partial<Omit<Exercise, "id" | "is_custom">>
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (exercise.name !== undefined) updates.name = exercise.name;
  if (exercise.category !== undefined) updates.category = exercise.category;
  if (exercise.primary_muscles !== undefined) updates.primary_muscles = JSON.stringify(exercise.primary_muscles);
  if (exercise.secondary_muscles !== undefined) updates.secondary_muscles = JSON.stringify(exercise.secondary_muscles);
  if (exercise.equipment !== undefined) updates.equipment = exercise.equipment;
  if (exercise.instructions !== undefined) updates.instructions = exercise.instructions;
  if (exercise.difficulty !== undefined) updates.difficulty = exercise.difficulty;
  if (Object.keys(updates).length === 0) return;

  const db = await getDrizzle();
  await db.update(exercises)
    .set(updates)
    .where(and(eq(exercises.id, id), eq(exercises.is_custom, 1)));
}

export async function softDeleteCustomExercise(id: string): Promise<void> {
  await withTransaction(async () => {
    const db = await getDrizzle();
    await db.delete(templateExercises).where(eq(templateExercises.exercise_id, id));
    await db.update(exercises)
      .set({ deleted_at: Date.now() })
      .where(and(eq(exercises.id, id), eq(exercises.is_custom, 1)));
  });
}

export async function getTemplatesUsingExercise(
  exerciseId: string
): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT DISTINCT wt.id, wt.name
     FROM template_exercises te
     JOIN workout_templates wt ON wt.id = te.template_id
     WHERE te.exercise_id = ?`,
    [exerciseId]
  );
}

// ── BLD-913: Progression chain queries ────────────────────────────────────

export type ProgressionChainExercise = {
  id: string;
  name: string;
  progression_order: number;
  has_been_logged: boolean;
};

/**
 * Returns all exercises in the same progression chain as the given exercise,
 * ordered by progression_order. Each exercise includes a flag indicating
 * whether the user has logged at least one set for it.
 * Returns empty array if the exercise is not in a progression group or
 * the group has only one exercise.
 */
export async function getProgressionChain(
  exerciseId: string
): Promise<ProgressionChainExercise[]> {
  // First get the progression_group for this exercise
  const exercise = await query<{ progression_group: string | null }>(
    `SELECT progression_group FROM exercises WHERE id = ? AND deleted_at IS NULL`,
    [exerciseId]
  );
  const group = exercise[0]?.progression_group;
  if (!group) return [];

  const chain = await query<{
    id: string;
    name: string;
    progression_order: number;
    has_been_logged: number;
  }>(
    `SELECT e.id, e.name, e.progression_order,
            CASE WHEN EXISTS (
              SELECT 1 FROM workout_sets ws
              JOIN workout_sessions s ON s.id = ws.session_id
              WHERE ws.exercise_id = e.id
                AND s.completed_at IS NOT NULL
            ) THEN 1 ELSE 0 END AS has_been_logged
     FROM exercises e
     WHERE e.progression_group = ?
       AND e.deleted_at IS NULL
       AND e.progression_order IS NOT NULL
     ORDER BY e.progression_order ASC`,
    [group]
  );

  // Don't show chain if only one exercise (meaningless)
  if (chain.length <= 1) return [];

  return chain.map((r) => ({
    id: r.id,
    name: r.name,
    progression_order: r.progression_order,
    has_been_logged: r.has_been_logged === 1,
  }));
}

export type ProgressionSuggestion = {
  shouldSuggest: boolean;
  nextExercise: { id: string; name: string } | null;
  isTerminal: boolean;
};

/**
 * Determines whether a progression suggestion should be shown for an exercise.
 * Criteria (all must be true):
 * 1. User has >= 3 sessions with this exercise in last 30 days
 * 2. Most recent session: all normal completed sets had >= 12 reps
 * 3. Next exercise exists in chain
 * 4. User has NOT logged next exercise in last 30 days
 */
export async function getProgressionSuggestion(
  exerciseId: string,
  chain: ProgressionChainExercise[]
): Promise<ProgressionSuggestion> {
  const currentIdx = chain.findIndex((e) => e.id === exerciseId);
  if (currentIdx === -1) return { shouldSuggest: false, nextExercise: null, isTerminal: false };

  const isTerminal = currentIdx === chain.length - 1;
  if (isTerminal) return { shouldSuggest: false, nextExercise: null, isTerminal: true };

  const nextExercise = chain[currentIdx + 1];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Check 1: >= 3 sessions in last 30 days
  const sessionCount = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT ws.session_id) as count
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at >= ?`,
    [exerciseId, thirtyDaysAgo]
  );
  if ((sessionCount[0]?.count ?? 0) < 3) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Check 2: most recent session — all normal completed sets had >= 12 reps
  const latestSession = await query<{ session_id: string }>(
    `SELECT ws.session_id
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at IS NOT NULL
     ORDER BY s.completed_at DESC
     LIMIT 1`,
    [exerciseId]
  );
  if (latestSession.length === 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  const failingSet = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM workout_sets
     WHERE session_id = ?
       AND exercise_id = ?
       AND set_type = 'normal'
       AND completed = 1
       AND (reps IS NULL OR reps < 12)`,
    [latestSession[0].session_id, exerciseId]
  );
  if ((failingSet[0]?.count ?? 1) > 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Also check there was at least one normal completed set (don't suggest on empty sessions)
  const normalSetCount = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM workout_sets
     WHERE session_id = ?
       AND exercise_id = ?
       AND set_type = 'normal'
       AND completed = 1`,
    [latestSession[0].session_id, exerciseId]
  );
  if ((normalSetCount[0]?.count ?? 0) === 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Check 4: user has NOT logged next exercise in last 30 days
  const nextLogged = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at >= ?`,
    [nextExercise.id, thirtyDaysAgo]
  );
  if ((nextLogged[0]?.count ?? 0) > 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  return { shouldSuggest: true, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
}
