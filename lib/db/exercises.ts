import { eq, and, isNull } from "drizzle-orm";
import type { Exercise } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, getDatabase } from "./helpers";
import { exercises } from "./schema";

type ExerciseRow = {
  id: string;
  name: string;
  category: string;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: string;
  instructions: string;
  difficulty: string;
  is_custom: number;
  deleted_at: number | null;
  mount_position: string | null;
  attachment: string | null;
  training_modes: string | null;
  is_voltra: number | null;
};

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
    mount_position: (row.mount_position as Exercise["mount_position"]) ?? undefined,
    attachment: (row.attachment as Exercise["attachment"]) ?? undefined,
    training_modes: row.training_modes ? JSON.parse(row.training_modes) : undefined,
    is_voltra: row.is_voltra === 1 ? true : undefined,
  };
}

export { mapRow, type ExerciseRow };

export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(exercises)
    .where(isNull(exercises.deleted_at))
    .orderBy(exercises.name);
  return (rows as unknown as ExerciseRow[]).map(mapRow);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(exercises)
    .where(eq(exercises.id, id))
    .get();
  if (!row) return null;
  return mapRow(row as unknown as ExerciseRow);
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
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "DELETE FROM template_exercises WHERE exercise_id = ?",
      [id]
    );
    await database.runAsync(
      "UPDATE exercises SET deleted_at = ? WHERE id = ? AND is_custom = 1",
      [Date.now(), id]
    );
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
