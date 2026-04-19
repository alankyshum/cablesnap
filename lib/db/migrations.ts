import * as SQLite from "expo-sqlite";
import { addColumnIfMissing, createCoreTables, createExtensionTables, hasColumn } from "./tables";
import { createScheduleAndMigrate, migrateExerciseAndFeatureColumns } from "./table-migrations";

async function addColumnMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(database, "exercises", "deleted_at", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "program_day_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "rating", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "rpe", "REAL DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "notes", "TEXT DEFAULT ''");

  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON workout_sets(session_id)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sessions_completed ON workout_sessions(completed_at)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sets_session_exercise ON workout_sets(session_id, exercise_id)"
  );

  await addColumnIfMissing(database, "template_exercises", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "template_exercises", "link_label", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "workout_sets", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "round", "INTEGER DEFAULT NULL");

  await addColumnIfMissing(database, "workout_sets", "training_mode", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "tempo", "TEXT DEFAULT NULL");

  await addColumnIfMissing(database, "workout_sets", "swapped_from_exercise_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "is_warmup", "INTEGER DEFAULT 0");

  if (!(await hasColumn(database, "workout_sets", "set_type"))) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(
        "ALTER TABLE workout_sets ADD COLUMN set_type TEXT DEFAULT 'normal'"
      );
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'warmup' WHERE is_warmup = 1"
      );
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'normal' WHERE is_warmup = 0 OR is_warmup IS NULL"
      );
    });
  }
}

async function addPerformanceIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_daily_log_date ON daily_log(date)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at ON workout_sessions(started_at)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id)"
  );
}

async function addDurationColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(database, "workout_sets", "duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "template_exercises", "target_duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "template_exercises", "training_mode", "TEXT DEFAULT NULL");
}

export async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await createCoreTables(database);
  await addColumnMigrations(database);
  await migrateExerciseAndFeatureColumns(database);
  await createScheduleAndMigrate(database);
  await createExtensionTables(database);
  await addPerformanceIndexes(database);
  await addDurationColumns(database);
}
