import * as SQLite from "expo-sqlite";
import { seedExercises } from "../seed";
import type { Exercise } from "../types";
import {
  STARTER_TEMPLATES,
  STARTER_PROGRAMS,
  STARTER_VERSION,
} from "../starter-templates";
import { CURATED_TEMPLATES, CURATED_PROGRAMS } from "../curated-programs";
import { uuid } from "../uuid";

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
        `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom, attachment, is_voltra, progression_group, progression_order)
     VALUES ($id, $name, $category, $primary_muscles, $secondary_muscles, $equipment, $instructions, $difficulty, $is_custom, $attachment, $is_voltra, $progression_group, $progression_order)`
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
            $attachment: ex.attachment ?? "handle",
            $is_voltra: ex.is_voltra ? 1 : 0,
            $progression_group: ex.progression_group ?? null,
            $progression_order: ex.progression_order ?? null,
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
  // BLD-1000: same backfill for curated-program-referenced exercises.
  await backfillCuratedExercises(database, exercises);

  // BLD-913: backfill progression data for existing seeded exercises that
  // were inserted before progression columns existed. Only updates non-custom
  // exercises where progression_group is still NULL.
  await backfillProgressionData(database, exercises);

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
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom, attachment, is_voltra, progression_group, progression_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id, ex.name, ex.category,
        JSON.stringify(ex.primary_muscles), JSON.stringify(ex.secondary_muscles),
        ex.equipment, ex.instructions, ex.difficulty,
        ex.is_custom ? 1 : 0,
        ex.attachment ?? "handle",
        ex.is_voltra ? 1 : 0,
        ex.progression_group ?? null,
        ex.progression_order ?? null,
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
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, set_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, JSON.stringify(ex.set_types ?? [])]
      );
      // BLD-1000: gate the canonical-repair UPDATE on `is_curated=0`.
      // `template_exercises` has no `is_curated` column (verified at
      // `lib/db/schema.ts:47-61`), so we gate via parent `workout_templates`.
      // Curated rows are insert-once — user edits to target_sets / reps /
      // rest_seconds / set_types persist across cold launches and across
      // future STARTER_VERSION bumps. Starter rows continue to receive the
      // BLD-467 canonical repair so corrupted starter data is fixed on launch.
      // The gate is a no-op today (starter and curated id namespaces are
      // disjoint: `starter-tpl-*` vs. `curated-rr-*`) but documents intent
      // and protects against future id collisions.
      await database.runAsync(
        `UPDATE template_exercises SET template_id = ?, exercise_id = ?, position = ?, target_sets = ?, target_reps = ?, rest_seconds = ?, set_types = ?
         WHERE id = ? AND template_id IN (
           SELECT id FROM workout_templates WHERE COALESCE(is_curated, 0) = 0
         )`,
        [tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, JSON.stringify(ex.set_types ?? []), ex.id]
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

/**
 * BLD-1000: seed curated workout templates (e.g., r/bodyweightfitness RR).
 *
 * Mirrors `upsertTemplates` but with two critical differences:
 *  1. Rows are inserted with `is_curated = 1` and `is_starter = 0`.
 *  2. NO canonical-repair UPDATE is issued. Curated rows are insert-once;
 *     user edits to `target_sets` / `target_reps` / `rest_seconds` /
 *     `set_types` persist across cold launches and `STARTER_VERSION` bumps.
 *     If we ever need to repair a shipped curated row, we ship a one-shot
 *     migration — not a per-launch repair.
 *
 * Defensive orphan-id handling: before inserting each `template_exercises`
 * row, we look up the `exercise_id` in the `exercises` table. If missing, we
 * skip the insert and write one `error_log` entry (`component='seed.curated'`,
 * `fatal=0`). This is new code in BLD-1000 — the starter path remains "blind
 * insert" because every starter exercise is guaranteed by the build-time test.
 * Curated rows have a build-time CI gate too, but the runtime defense protects
 * against drift if future curated content references an exercise that gets
 * removed from the seed list.
 */
async function upsertCuratedTemplates(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const tpl of CURATED_TEMPLATES) {
    await database.runAsync(
      "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter, is_curated) VALUES (?, ?, 0, 0, 0, 1)",
      [tpl.id, tpl.name]
    );
    for (let i = 0; i < tpl.exercises.length; i++) {
      const ex = tpl.exercises[i];
      // BLD-1000 AC9: orphan-exercise-id runtime defense. Skip the insert
      // and write one warning to error_log if the exercise no longer exists.
      const found = await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL",
        [ex.exercise_id]
      );
      if (!found) {
        await database.runAsync(
          `INSERT INTO error_log (id, message, component, fatal, timestamp)
           VALUES (?, ?, 'seed.curated', 0, ?)`,
          [
            uuid(),
            `Curated template ${tpl.id} references missing exercise_id ${ex.exercise_id} (template_exercise ${ex.id}); skipping insert.`,
            Date.now(),
          ]
        );
        continue;
      }
      await database.runAsync(
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, set_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ex.id, tpl.id, ex.exercise_id, i, ex.target_sets, ex.target_reps, ex.rest_seconds, JSON.stringify(ex.set_types ?? [])]
      );
      // NO repair UPDATE. User edits persist.
    }
  }
}

/**
 * BLD-1000: seed curated programs (e.g., RR).
 *
 * Like `upsertCuratedTemplates`, this is insert-once: no repair UPDATE on
 * `programs` itself, no repair on `program_days` rows. Additionally inserts
 * `program_schedule` rows from the curated program's `schedule[]` so the
 * weekday placement is visible on first launch. The PRIMARY KEY on
 * `(program_id, day_of_week)` (`schema.ts:250`) makes schedule inserts
 * idempotent — user edits to schedule rows persist across re-seeds.
 */
async function upsertCuratedPrograms(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const prog of CURATED_PROGRAMS) {
    await database.runAsync(
      "INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter, is_curated) VALUES (?, ?, ?, 0, NULL, 0, 0, 0, 1)",
      [prog.id, prog.name, prog.description]
    );
    for (let i = 0; i < prog.days.length; i++) {
      const day = prog.days[i];
      await database.runAsync(
        "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [day.id, prog.id, day.template_id, i, day.label]
      );
    }
    for (const slot of prog.schedule) {
      await database.runAsync(
        "INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)",
        [prog.id, slot.day_of_week, slot.template_id]
      );
    }
  }
}

/**
 * BLD-1000: backfill exercises referenced by curated templates that may not
 * yet be in the user's `exercises` table (e.g., if curated content references
 * a community exercise added in a later release).
 */
async function backfillCuratedExercises(
  database: SQLite.SQLiteDatabase,
  allExercises: Exercise[]
): Promise<void> {
  const neededIds = new Set<string>();
  for (const tpl of CURATED_TEMPLATES) {
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
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom, attachment, is_voltra, progression_group, progression_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id, ex.name, ex.category,
        JSON.stringify(ex.primary_muscles), JSON.stringify(ex.secondary_muscles),
        ex.equipment, ex.instructions, ex.difficulty,
        ex.is_custom ? 1 : 0,
        ex.attachment ?? "handle",
        ex.is_voltra ? 1 : 0,
        ex.progression_group ?? null,
        ex.progression_order ?? null,
      ]
    );
  }
}

/**
 * BLD-913: Backfill progression_group/progression_order for existing seeded
 * exercises that were inserted before these columns existed. Only updates
 * non-custom exercises where progression_group IS NULL (idempotent).
 */
async function backfillProgressionData(
  database: SQLite.SQLiteDatabase,
  allExercises: Exercise[]
): Promise<void> {
  const withProgression = allExercises.filter(
    (e) => e.progression_group != null && e.progression_order != null
  );
  if (withProgression.length === 0) return;

  await database.withTransactionAsync(async () => {
    for (const ex of withProgression) {
      await database.runAsync(
        `UPDATE exercises SET progression_group = ?, progression_order = ?
         WHERE id = ? AND is_custom = 0 AND progression_group IS NULL`,
        [ex.progression_group!, ex.progression_order!, ex.id]
      );
    }
  });
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

  // BLD-1000: curated templates and programs run in separate transactions
  // for the same isolation reason. They are insert-once (no repair UPDATE)
  // and write to error_log on orphan exercise_id references.
  await database.withTransactionAsync(async () => {
    await upsertCuratedTemplates(database);
  });

  await database.withTransactionAsync(async () => {
    await upsertCuratedPrograms(database);
  });

  if (!row || Number(row.value) < STARTER_VERSION) {
    await database.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('starter_version', ?)",
      [String(STARTER_VERSION)]
    );
  }
}
