import * as SQLite from "expo-sqlite";
import { seedExercises } from "../seed";
import type { Exercise } from "../types";
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

  // Backfill exercises referenced by starter templates that upgrading users
  // may be missing (e.g., community exercises added after initial install).
  await backfillStarterExercises(database, exercises);

  await seedStarters(database);
}

async function backfillStarterExercises(
  database: SQLite.SQLiteDatabase,
  allExercises: Exercise[]
): Promise<void> {
  const neededIds = new Set<string>();
  for (const tpl of STARTER_TEMPLATES) {
    for (const ex of tpl.exercises) {
      neededIds.add(ex.exercise_id);
    }
  }

  const exerciseMap = new Map<string, Exercise>();
  for (const ex of allExercises) {
    if (neededIds.has(ex.id)) exerciseMap.set(ex.id, ex);
  }

  for (const id of neededIds) {
    const ex = exerciseMap.get(id);
    if (!ex) continue;
    await database.runAsync(
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom, mount_position, attachment, training_modes, is_voltra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id, ex.name, ex.category,
        JSON.stringify(ex.primary_muscles), JSON.stringify(ex.secondary_muscles),
        ex.equipment, ex.instructions, ex.difficulty,
        ex.is_custom ? 1 : 0,
        ex.mount_position ?? null, ex.attachment ?? "handle",
        JSON.stringify(ex.training_modes ?? ["weight"]),
        ex.is_voltra ? 1 : 0,
      ]
    );
  }
}

async function upsertTemplates(database: SQLite.SQLiteDatabase): Promise<void> {
  const canonicalIds = STARTER_TEMPLATES.flatMap((tpl) => tpl.exercises.map((e) => e.id));
  const starterTplIds = STARTER_TEMPLATES.map((t) => t.id);

  // Remove stale template exercises that no longer exist in the canonical list
  if (canonicalIds.length > 0) {
    const placeholders = starterTplIds.map(() => "?").join(", ");
    const keepPlaceholders = canonicalIds.map(() => "?").join(", ");
    await database.runAsync(
      `DELETE FROM template_exercises WHERE template_id IN (${placeholders}) AND id NOT IN (${keepPlaceholders})`,
      [...starterTplIds, ...canonicalIds]
    );
  }

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
      // INSERT if missing, then UPDATE to repair canonical columns.
      // INSERT OR IGNORE alone cannot fix corrupted rows (BLD-467).
      await database.runAsync(
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, training_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, ex.training_mode ?? null]
      );
      await database.runAsync(
        "UPDATE template_exercises SET template_id = ?, exercise_id = ?, position = ?, target_sets = ?, target_reps = ?, rest_seconds = ?, training_mode = ? WHERE id = ?",
        [tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, ex.training_mode ?? null, ex.id]
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

  if (row) {
    await database.runAsync(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('onboarding_complete', '1')"
    );
  }

  // Repair templates and programs in separate transactions so that a failure
  // in one doesn't roll back the other (BLD-467).
  await database.withTransactionAsync(async () => {
    await upsertTemplates(database);
  });

  await database.withTransactionAsync(async () => {
    await upsertPrograms(database);
  });

  if (!row || Number(row.value) < STARTER_VERSION) {
    await database.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('starter_version', ?)",
      [String(STARTER_VERSION)]
    );
  }
}
