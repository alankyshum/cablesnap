import type { Exercise } from "../types";
import { uuid } from "../uuid";
import { query, queryOne, execute, getDatabase } from "./helpers";

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
  const rows = await query<ExerciseRow>(
    "SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY name ASC"
  );
  return rows.map(mapRow);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const row = await queryOne<ExerciseRow>(
    "SELECT * FROM exercises WHERE id = ?",
    [id]
  );
  if (!row) return null;
  return mapRow(row);
}

export async function getExercisesByIds(
  exerciseIds: string[]
): Promise<Record<string, Exercise>> {
  if (exerciseIds.length === 0) return {};
  const placeholders = exerciseIds.map(() => "?").join(",");
  const rows = await query<ExerciseRow>(
    `SELECT * FROM exercises WHERE id IN (${placeholders})`,
    exerciseIds
  );
  const result: Record<string, Exercise> = {};
  for (const row of rows) result[row.id] = mapRow(row);
  return result;
}

export async function createCustomExercise(
  exercise: Omit<Exercise, "id" | "is_custom">
): Promise<Exercise> {
  const id = uuid();
  await execute(
    `INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      exercise.name,
      exercise.category,
      JSON.stringify(exercise.primary_muscles),
      JSON.stringify(exercise.secondary_muscles),
      exercise.equipment,
      exercise.instructions,
      exercise.difficulty,
    ]
  );
  return { ...exercise, id, is_custom: true };
}

export async function updateCustomExercise(
  id: string,
  exercise: Partial<Omit<Exercise, "id" | "is_custom">>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (exercise.name !== undefined) { fields.push("name = ?"); values.push(exercise.name); }
  if (exercise.category !== undefined) { fields.push("category = ?"); values.push(exercise.category); }
  if (exercise.primary_muscles !== undefined) { fields.push("primary_muscles = ?"); values.push(JSON.stringify(exercise.primary_muscles)); }
  if (exercise.secondary_muscles !== undefined) { fields.push("secondary_muscles = ?"); values.push(JSON.stringify(exercise.secondary_muscles)); }
  if (exercise.equipment !== undefined) { fields.push("equipment = ?"); values.push(exercise.equipment); }
  if (exercise.instructions !== undefined) { fields.push("instructions = ?"); values.push(exercise.instructions); }
  if (exercise.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(exercise.difficulty); }
  if (fields.length === 0) return;
  values.push(id);
  await execute(
    `UPDATE exercises SET ${fields.join(", ")} WHERE id = ? AND is_custom = 1`,
    values
  );
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
