import * as SQLite from "expo-sqlite";
import { createCoreTables, createExtensionTables, addColumnIfMissing } from "./tables";
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
  // Phase 62: exercise reorder support
  await addColumnIfMissing(database, "workout_sets", "exercise_position", "INTEGER DEFAULT 0");

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
