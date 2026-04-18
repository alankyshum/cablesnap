import * as SQLite from "expo-sqlite";
import { seedExercises } from "../seed";
import {
  STARTER_TEMPLATES,
  STARTER_PROGRAM,
  STARTER_VERSION,
} from "../starter-templates";

export async function seed(database: SQLite.SQLiteDatabase): Promise<void> {
  const exercises = seedExercises();
  const voltraExercises = exercises.filter(e => e.is_voltra);
  const communityExercises = exercises.filter(e => !e.is_voltra);

  const voltraResult = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0 AND deleted_at IS NULL AND is_voltra = 1"
  );
  const communityResult = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0 AND deleted_at IS NULL AND is_voltra = 0"
  );

  const needVoltra = !voltraResult || voltraResult.count === 0;
  const needCommunity = !communityResult || communityResult.count === 0;
  const toInsert = [
    ...(needVoltra ? voltraExercises : []),
    ...(needCommunity ? communityExercises : []),
  ];

  if (toInsert.length > 0) {
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
  }

  await seedStarters(database);
}

async function seedStarters(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'starter_version'"
  );
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
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds]
      );
    }
  }
  await database.runAsync(
    "INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter) VALUES (?, ?, ?, 0, NULL, 0, 0, 1)",
    [STARTER_PROGRAM.id, STARTER_PROGRAM.name, STARTER_PROGRAM.description]
  );
  await database.runAsync(
      "UPDATE programs SET is_starter = 1, name = ? WHERE id = ? AND (is_starter IS NULL OR is_starter = 0 OR name IS NULL OR name = '')",
    [STARTER_PROGRAM.name, STARTER_PROGRAM.id]
  );
  for (let i = 0; i < STARTER_PROGRAM.days.length; i++) {
    const day = STARTER_PROGRAM.days[i];
    await database.runAsync(
      "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
      [day.id, STARTER_PROGRAM.id, day.template_id, i, day.label]
    );
  }

  if (row && Number(row.value) >= STARTER_VERSION) return;

  await database.withTransactionAsync(async () => {
    for (const tpl of STARTER_TEMPLATES) {
      await database.runAsync(
        "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, 0, 0, 1)",
        [tpl.id, tpl.name]
      );
      for (let i = 0; i < tpl.exercises.length; i++) {
        const ex = tpl.exercises[i];
        await database.runAsync(
          "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds]
        );
      }
    }

    await database.runAsync(
      "INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter) VALUES (?, ?, ?, 0, NULL, 0, 0, 1)",
      [STARTER_PROGRAM.id, STARTER_PROGRAM.name, STARTER_PROGRAM.description]
    );
    for (let i = 0; i < STARTER_PROGRAM.days.length; i++) {
      const day = STARTER_PROGRAM.days[i];
      await database.runAsync(
        "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [day.id, STARTER_PROGRAM.id, day.template_id, i, day.label]
      );
    }

    await database.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('starter_version', ?)",
      [String(STARTER_VERSION)]
    );
  });
}
