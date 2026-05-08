import * as SQLite from "expo-sqlite";
import { createCoreTables, createExtensionTables, addColumnIfMissing, hasColumn, dropColumnIfExists } from "./tables";
import { createScheduleAndIndexes } from "./table-migrations";

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
  await addColumnIfMissing(database, "exercises", "attachment", "TEXT DEFAULT 'handle'");
  await addColumnIfMissing(database, "exercises", "is_voltra", "INTEGER DEFAULT 0");
  // BLD-561: visual exercise illustrations — user-supplied URIs for custom exercises.
  await addColumnIfMissing(database, "exercises", "start_image_uri", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "end_image_uri", "TEXT DEFAULT NULL");
  // BLD-913: bodyweight exercise progression paths — links exercises into ordered chains.
  await addColumnIfMissing(database, "exercises", "progression_group", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "progression_order", "INTEGER DEFAULT NULL");
  // BLD-1028: pinned per-exercise notes — persists across sessions.
  await addColumnIfMissing(database, "exercises", "notes", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "notes_updated_at", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "notes_backfill_dismissed_at", "INTEGER DEFAULT NULL");

  // workout_templates table
  await addColumnIfMissing(database, "workout_templates", "is_starter", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "workout_templates", "source", "TEXT DEFAULT NULL");
  // BLD-1000: curated programs library — additive migration. See schema.ts.
  await addColumnIfMissing(database, "workout_templates", "is_curated", "INTEGER DEFAULT 0");

  // programs table
  await addColumnIfMissing(database, "programs", "is_starter", "INTEGER DEFAULT 0");
  // BLD-1000: curated programs library.
  await addColumnIfMissing(database, "programs", "is_curated", "INTEGER DEFAULT 0");

  // template_exercises table
  await addColumnIfMissing(database, "template_exercises", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "template_exercises", "link_label", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "template_exercises", "target_duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "template_exercises", "set_types", "TEXT DEFAULT '[]'");

  // workout_sessions table
  await addColumnIfMissing(database, "workout_sessions", "program_day_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "rating", "INTEGER DEFAULT NULL");
  // BLD-630: anchor session elapsed clock to first completed set.
  // NULL = legacy/unanchored — readers fall back to started_at.
  await addColumnIfMissing(database, "workout_sessions", "clock_started_at", "INTEGER");
  // BLD-690: timestamp at which the user last edited a completed session via
  // the post-completion edit flow. NULL = never edited.
  await addColumnIfMissing(database, "workout_sessions", "edited_at", "INTEGER DEFAULT NULL");
  // BLD-890: CSV import batch ID — groups imported sessions for undo/bulk-delete.
  // NULL for sessions created organically (not imported).
  await addColumnIfMissing(database, "workout_sessions", "import_batch_id", "TEXT DEFAULT NULL");
  // BLD-1059: per-gym cable stack calibration
  await addColumnIfMissing(database, "workout_sessions", "gym_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "gym_name_at_log", "TEXT DEFAULT NULL");

  // workout_sets table
  await addColumnIfMissing(database, "workout_sets", "rpe", "REAL DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "notes", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "workout_sets", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "round", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "tempo", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "swapped_from_exercise_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "workout_sets", "exercise_position", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "workout_sets", "bodyweight_modifier_kg", "REAL DEFAULT NULL");
  // BLD-771: per-set cable variant logging.
  // NULL = user did not specify or pre-migration row. NEVER auto-stamped from
  // `exercises.attachment` default — see `lib/cable-variant.ts` for autofill chain.
  // ALTER ADD COLUMN with default NULL is metadata-only on SQLite (O(1) regardless
  // of row count). Idempotent via `addColumnIfMissing`.
  await addColumnIfMissing(database, "workout_sets", "attachment", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "mount_position", "TEXT DEFAULT NULL");
  // BLD-768: per-set bodyweight grip variant logging (grip_type + grip_width).
  // NULL = user did not specify or pre-migration row. NEVER auto-stamped from
  // any exercise-level default — see `lib/bodyweight-grip-variant.ts` for the
  // autofill chain. Same idempotency guarantees as the cable variant columns
  // above (BLD-771): ALTER ADD COLUMN with default NULL is metadata-only on
  // SQLite and `addColumnIfMissing` no-ops on second run.
  await addColumnIfMissing(database, "workout_sets", "grip_type", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "grip_width", "TEXT DEFAULT NULL");
  // BLD-1059: per-gym cable stack calibration
  await addColumnIfMissing(database, "workout_sets", "stack_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_marker", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_unit_at_log", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_name_at_log", "TEXT DEFAULT NULL");

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

  // BLD-1059: per-gym cable stack calibration — new tables
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS gym_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS cable_stacks (
      id TEXT PRIMARY KEY,
      gym_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS stack_calibrations (
      id TEXT PRIMARY KEY,
      stack_id TEXT NOT NULL,
      marker INTEGER NOT NULL,
      true_weight REAL NOT NULL,
      UNIQUE(stack_id, marker)
    );
    CREATE INDEX IF NOT EXISTS idx_cable_stacks_gym ON cable_stacks(gym_id);
    CREATE INDEX IF NOT EXISTS idx_stack_calibrations_stack ON stack_calibrations(stack_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_gym_started_at ON workout_sessions(gym_id, started_at);
  `);
  try {
    await database.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_profiles_one_default ON gym_profiles(is_default) WHERE is_default = 1`
    );
  } catch {
    // Partial indexes not supported on all platforms — constraint enforced at app level
  }

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

  // ── Destructive cleanup of legacy F12/F13 columns (BLD-773) ──
  // F12 (Training Mode) and F13 (Mount Position) were removed from app
  // reads/writes earlier in this PR, but the physical SQLite columns still
  // exist on already-upgraded user databases. Fresh installs are unaffected
  // because `createCoreTables` no longer declares them. Drop them here so
  // upgraded DBs converge with the canonical schema in `lib/db/schema.ts`.
  //
  // BLD-783 rebase note: the original BLD-773 drop set included
  // `workout_sets.mount_position`, but BLD-771 (per-set cable variant
  // logging) — landed on main while this PR was in review — reclaims that
  // exact column name with new semantics (cable pulley position, autofilled
  // from history). Dropping it here would destroy live BLD-771 data on
  // every boot. The legacy F13 mount_position lived on `exercises` (a
  // per-exercise default), which we still drop. Surviving values on
  // workout_sets.mount_position from F13-era rows are safe to leave in
  // place — BLD-771 readers gate through `isMountPosition()` and treat
  // unknown strings as null.
  //
  // `dropColumnIfExists` is idempotent (no-op when the column is absent),
  // so this block is safe on every boot regardless of starting schema state.
  // SQLite ≥ 3.35 supports native `ALTER TABLE ... DROP COLUMN`; Expo SQLite
  // 55 ships >= 3.45 so no table rebuild is needed.
  await dropColumnIfExists(database, "workout_sets", "training_mode");
  await dropColumnIfExists(database, "template_exercises", "training_mode");
  await dropColumnIfExists(database, "exercises", "mount_position");
  await dropColumnIfExists(database, "exercises", "training_modes");

  // BLD-1044: backfill — renumber any (session_id, exercise_id) groups left
  // non-contiguous by historical deleteSet() calls. Idempotent: groups that
  // are already 1..N stay at 1..N (ROW_NUMBER returns the same values and the
  // WHERE rn != set_number guard skips the UPDATE write).
  await database.execAsync(`
    WITH renumbered AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY session_id, exercise_id ORDER BY set_number ASC, id ASC) AS rn
      FROM workout_sets
    )
    UPDATE workout_sets
    SET set_number = (SELECT rn FROM renumbered WHERE renumbered.id = workout_sets.id)
    WHERE id IN (SELECT id FROM renumbered WHERE rn != workout_sets.set_number)
  `);

  // BLD-1086 Phase 0b: Composite index for per-variant PR aggregation.
  // Covers (exercise_id, attachment, mount_position, grip_type, completed_at)
  // so the GROUP BY query in bestPerVariant uses the index rather than scanning
  // the full table. `stack_unit_at_log` is intentionally omitted — cardinality
  // is ~1-2 per user; the index covers the high-cost variant fan-out first.
  // CREATE INDEX IF NOT EXISTS is idempotent (safe on every boot).
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_workout_sets_variant_pr
      ON workout_sets (exercise_id, attachment, mount_position, grip_type, completed_at)
  `);

  // BLD-1089: Grease-the-Groove Day Mode — additive migration on workout_sessions.
  // Three columns + one partial unique index. All idempotent.
  // SQLite 3.35+ supports ALTER TABLE ... DROP COLUMN for documented rollback.
  await addColumnIfMissing(database, "workout_sessions", "kind",
    "TEXT NOT NULL DEFAULT 'workout'");
  await addColumnIfMissing(database, "workout_sessions", "day_session_exercise_id",
    "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "day_session_date",
    "TEXT DEFAULT NULL");
  try {
    await database.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_session_per_exercise_date
        ON workout_sessions (day_session_exercise_id, day_session_date)
        WHERE kind = 'day_session'
    `);
  } catch {
    // Partial indexes not supported on all platforms — uniqueness enforced by UPSERT
  }
}

