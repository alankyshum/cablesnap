import { eq, and, isNull, inArray } from "drizzle-orm";
import type { Exercise } from "../types";
import { safeParse } from "../safe-parse";
import { uuid } from "../uuid";
import { getDrizzle, query, withTransaction } from "./helpers";
import { exercises, templateExercises } from "./schema";
import type { ExerciseRow } from "./schema";

function mapRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Exercise["category"],
    primary_muscles: safeParse(row.primary_muscles, [] as Exercise["primary_muscles"], "exercises.primary_muscles"),
    secondary_muscles: safeParse(row.secondary_muscles, [] as Exercise["secondary_muscles"], "exercises.secondary_muscles"),
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
