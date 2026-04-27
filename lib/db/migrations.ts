import * as SQLite from "expo-sqlite";
import { createCoreTables, createExtensionTables, addColumnIfMissing, hasColumn } from "./tables";
import { createScheduleAndIndexes } from "./table-migrations";

/**
 * BLD-622: Strip the removed "eccentric_overload" value from
 * exercises.training_modes JSON arrays. Pure-string entry point so it can be
 * unit-tested without an SQLite mock.
 *
 * Behaviour:
 * - Valid JSON array → filter out "eccentric_overload"; if the result is
 *   empty, return '["weight"]' as a safe default (every exercise must have at
 *   least one mode).
 * - Malformed JSON or non-array → return '["weight"]' fallback.
 * - Returns null if the input contains no "eccentric_overload" reference (so
 *   callers can skip the row entirely and avoid pointless writes).
 */
export function stripEccentricFromTrainingModesJSON(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.includes("eccentric_overload")) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return '["weight"]';
    const filtered = parsed.filter((m) => m !== "eccentric_overload");
    return filtered.length === 0 ? '["weight"]' : JSON.stringify(filtered);
  } catch {
    return '["weight"]';
  }
}

async function sanitizeExercisesTrainingModes(database: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await database.getAllAsync<{ id: string; training_modes: string | null }>(
    `SELECT id, training_modes FROM exercises WHERE training_modes LIKE '%eccentric_overload%'`
  );
  for (const row of rows) {
    const next = stripEccentricFromTrainingModesJSON(row.training_modes);
    if (next === null) continue;
    await database.runAsync(`UPDATE exercises SET training_modes = ? WHERE id = ?`, [next, row.id]);
  }
}

async function addPerformanceIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON workout_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_completed ON workout_sessions(completed_at);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_session_exercise ON workout_sets(session_id, exercise_id);
    CREATE INDEX IF NOT EXISTS idx_daily_log_date ON daily_log(date);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at ON workout_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id);
  `);
}

export async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await createCoreTables(database);
  await createScheduleAndIndexes(database);
  await createExtensionTables(database);
  await addPerformanceIndexes(database);
  // ── Column migrations for users upgrading from older database versions ──
  // These were removed in 4b0add8 under "0 users" assumption; restored for BLD-461.
  // addColumnIfMissing is idempotent — safe to run on fresh and upgraded databases.

  // exercises table
  await addColumnIfMissing(database, "exercises", "deleted_at", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "mount_position", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "attachment", "TEXT DEFAULT 'handle'");
  await addColumnIfMissing(database, "exercises", "training_modes", `TEXT DEFAULT '["weight"]'`);
  await addColumnIfMissing(database, "exercises", "is_voltra", "INTEGER DEFAULT 0");

  // workout_templates table
  await addColumnIfMissing(database, "workout_templates", "is_starter", "INTEGER DEFAULT 0");

  // programs table
  await addColumnIfMissing(database, "programs", "is_starter", "INTEGER DEFAULT 0");

  // template_exercises table
  await addColumnIfMissing(database, "template_exercises", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "template_exercises", "link_label", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "template_exercises", "target_duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "template_exercises", "training_mode", "TEXT DEFAULT NULL");

  // workout_sessions table
  await addColumnIfMissing(database, "workout_sessions", "program_day_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "rating", "INTEGER DEFAULT NULL");
  // BLD-630: anchor session elapsed clock to first completed set.
  // NULL = legacy/unanchored — readers fall back to started_at.
  await addColumnIfMissing(database, "workout_sessions", "clock_started_at", "INTEGER");
  // BLD-690: timestamp at which the user last edited a completed session via
  // the post-completion edit flow. NULL = never edited.
  await addColumnIfMissing(database, "workout_sessions", "edited_at", "INTEGER DEFAULT NULL");

  // workout_sets table
  await addColumnIfMissing(database, "workout_sets", "rpe", "REAL DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "notes", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "workout_sets", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "round", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "training_mode", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "tempo", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "swapped_from_exercise_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "workout_sets", "exercise_position", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "workout_sets", "bodyweight_modifier_kg", "REAL DEFAULT NULL");

  // workout_sets.set_type migration (replaces deprecated is_warmup column)
  if (!(await hasColumn(database, "workout_sets", "set_type"))) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN set_type TEXT DEFAULT 'normal'"
    );
    if (await hasColumn(database, "workout_sets", "is_warmup")) {
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'warmup' WHERE is_warmup = 1"
      );
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'normal' WHERE is_warmup = 0 OR is_warmup IS NULL"
      );
    }
  }

  // body_settings table
  await addColumnIfMissing(database, "body_settings", "sex", "TEXT NOT NULL DEFAULT 'male'");

  // BLD-622: Eccentric training mode removed entirely. Sanitize legacy values.
  // - workout_sets.training_mode='eccentric_overload' → NULL (treated as standard set)
  // - template_exercises.training_mode='eccentric_overload' → NULL
  await database.execAsync(`
    UPDATE workout_sets SET training_mode = NULL WHERE training_mode = 'eccentric_overload';
    UPDATE template_exercises SET training_mode = NULL WHERE training_mode = 'eccentric_overload';
  `);
  // - exercises.training_modes JSON array: drop "eccentric_overload" entries via
  //   JS-side parse/filter/serialize. SQL chained REPLACE was fragile (couldn't
  //   robustly handle whitespace, escaping, or middle positions in malformed
  //   arrays). The JS path is explicit, contract-locked by unit tests, and falls
  //   back to '["weight"]' if a row's JSON is corrupt.
  await sanitizeExercisesTrainingModes(database);

  // Phase 66: strength goals table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS strength_goals (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,
      target_weight REAL,
      target_reps INTEGER,
      deadline TEXT,
      achieved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );
    CREATE INDEX IF NOT EXISTS idx_strength_goals_exercise ON strength_goals(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_strength_goals_active ON strength_goals(achieved_at);
  `);
  // Partial unique index for one-active-goal-per-exercise constraint
  try {
    await database.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_strength_goals_one_active ON strength_goals(exercise_id) WHERE achieved_at IS NULL`
    );
  } catch {
    // SQLite on some platforms doesn't support partial indexes — constraint enforced at app level
  }
}
