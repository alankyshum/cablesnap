import * as SQLite from "expo-sqlite";
import { seedExercises } from "../seed";
import {
  STARTER_TEMPLATES,
  STARTER_PROGRAMS,
  STARTER_VERSION,
} from "../starter-templates";

async function countSeeded(database: SQLite.SQLiteDatabase, isVoltra: boolean): Promise<number> {
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0 AND deleted_at IS NULL AND is_voltra = ${isVoltra ? 1 : 0}`
  );
  return result?.count ?? 0;
}

export async function seed(database: SQLite.SQLiteDatabase): Promise<void> {
  const exercises = seedExercises();
  const toInsert = [
    ...(await countSeeded(database, true) === 0 ? exercises.filter(e => e.is_voltra) : []),
    ...(await countSeeded(database, false) === 0 ? exercises.filter(e => !e.is_voltra) : []),
  ];

  if (toInsert.length > 0) {
    await database.withTransactionAsync(async () => {
      const stmt = await database.prepareAsync(
        `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom, mount_position, attachment, training_modes, is_voltra)
     VALUES ($id, $name, $category, $primary_muscles, $secondary_muscles, $equipment, $instructions, $difficulty, $is_custom, $mount_position, $attachment, $training_modes, $is_voltra)`
      );
      try {
        for (const ex of toInsert) {
          await stmt.executeAsync({
            $id: ex.id,
            $name: ex.name,
            $category: ex.category,
            $primary_muscles: JSON.stringify(ex.primary_muscles),
            $secondary_muscles: JSON.stringify(ex.secondary_muscles),
            $equipment: ex.equipment,
            $instructions: ex.instructions,
            $difficulty: ex.difficulty,
            $is_custom: ex.is_custom ? 1 : 0,
            $mount_position: ex.mount_position ?? null,
            $attachment: ex.attachment ?? "handle",
            $training_modes: JSON.stringify(ex.training_modes ?? ["weight"]),
            $is_voltra: ex.is_voltra ? 1 : 0,
          });
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  }

  await seedStarters(database);
}

async function upsertTemplates(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const tpl of STARTER_TEMPLATES) {
    await database.runAsync(
      "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, 0, 0, 1)",
      [tpl.id, tpl.name]
    );
    await database.runAsync(
      "UPDATE workout_templates SET is_starter = 1, name = ? WHERE id = ? AND (is_starter IS NULL OR is_starter = 0 OR name IS NULL OR name = '')",
      [tpl.name, tpl.id]
    );
    for (let i = 0; i < tpl.exercises.length; i++) {
      const ex = tpl.exercises[i];
      await database.runAsync(
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, training_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, ex.training_mode ?? null]
      );
    }
  }
}

async function upsertPrograms(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const prog of STARTER_PROGRAMS) {
    await database.runAsync(
      "INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter) VALUES (?, ?, ?, 0, NULL, 0, 0, 1)",
      [prog.id, prog.name, prog.description]
    );
    await database.runAsync(
        "UPDATE programs SET is_starter = 1, name = ? WHERE id = ? AND (is_starter IS NULL OR is_starter = 0 OR name IS NULL OR name = '')",
      [prog.name, prog.id]
    );
    for (let i = 0; i < prog.days.length; i++) {
      const day = prog.days[i];
      await database.runAsync(
        "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [day.id, prog.id, day.template_id, i, day.label]
      );
    }
  }
}

async function seedStarters(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'starter_version'"
  );

  await database.withTransactionAsync(async () => {
    if (row) {
      await database.runAsync(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('onboarding_complete', '1')"
      );
    }

    // Always repair ALL canonical starter data — handles cases where import,
    // migration, deletion, or prior incomplete seeding left starters corrupted.
    // Each repair uses INSERT OR IGNORE (idempotent) to re-create deleted rows,
    // then UPDATE to fix corrupted columns on existing rows.
    // This covers: workout_templates, template_exercises, programs, program_days.
    // See BLD-174, BLD-187, BLD-255 for the history of this recurring regression.
    await upsertTemplates(database);
    await upsertPrograms(database);

    if (!row || Number(row.value) < STARTER_VERSION) {
      await database.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('starter_version', ?)",
        [String(STARTER_VERSION)]
      );
    }
  });
}
