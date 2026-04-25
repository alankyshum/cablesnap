import * as SQLite from "expo-sqlite";

// DDL allowlist — these are hardcoded table names used in migrations, not user input.
// Defense-in-depth: validate before interpolation to prevent accidental SQL injection.
const VALID_TABLES = new Set([
  "exercises", "workout_templates", "template_exercises",
  "workout_sessions", "workout_sets", "food_entries", "daily_log",
  "macro_targets", "error_log", "body_weight", "body_measurements",
  "body_settings", "programs", "program_days", "program_log",
  "interaction_log", "progress_photos", "achievements_earned",
  "strava_connection", "strava_sync_log", "health_connect_sync_log",
  "meal_templates", "meal_template_items", "app_settings",
  "program_schedule", "strength_goals", "water_logs",
]);

function assertValidTable(table: string): void {
  if (!VALID_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

// Validate SQL identifiers to prevent injection via column names or definitions.
// Only allows alphanumeric, underscore, and common DDL keywords/types.
// eslint-disable-next-line no-useless-escape
const SAFE_SQL_FRAGMENT = /^[a-zA-Z_][a-zA-Z0-9_ (),'.\[\]"]*$/;
function assertSafeSQL(value: string, label: string): void {
  if (!SAFE_SQL_FRAGMENT.test(value)) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
}

export async function hasColumn(database: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  assertValidTable(table);
  assertSafeSQL(column, "column name");
  const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

export async function addColumnIfMissing(database: SQLite.SQLiteDatabase, table: string, column: string, definition: string): Promise<void> {
  assertValidTable(table);
  assertSafeSQL(column, "column name");
  assertSafeSQL(definition, "column definition");
  if (!(await hasColumn(database, table, column))) {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function createCoreTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      primary_muscles TEXT NOT NULL,
      secondary_muscles TEXT NOT NULL,
      equipment TEXT NOT NULL,
      instructions TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      is_custom INTEGER DEFAULT 0,
      deleted_at INTEGER DEFAULT NULL,
      mount_position TEXT DEFAULT NULL,
      attachment TEXT DEFAULT 'handle',
      training_modes TEXT DEFAULT '["weight"]',
      is_voltra INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_starter INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      target_sets INTEGER DEFAULT 3,
      target_reps TEXT DEFAULT '8-12',
      rest_seconds INTEGER DEFAULT 90,
      link_id TEXT DEFAULT NULL,
      link_label TEXT DEFAULT '',
      target_duration_seconds INTEGER,
      training_mode TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER,
      notes TEXT DEFAULT '',
      program_day_id TEXT DEFAULT NULL,
      rating INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      rpe REAL DEFAULT NULL,
      notes TEXT DEFAULT '',
      link_id TEXT DEFAULT NULL,
      round INTEGER DEFAULT NULL,
      training_mode TEXT DEFAULT NULL,
      tempo TEXT DEFAULT NULL,
      swapped_from_exercise_id TEXT DEFAULT NULL,
      set_type TEXT DEFAULT 'normal',
      duration_seconds INTEGER,
      exercise_position INTEGER DEFAULT 0,
      bodyweight_modifier_kg REAL DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS food_entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      serving_size TEXT DEFAULT '1 serving',
      is_favorite INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_log (
      id TEXT PRIMARY KEY,
      food_entry_id TEXT NOT NULL,
      date TEXT NOT NULL,
      meal TEXT NOT NULL DEFAULT 'snack',
      servings REAL DEFAULT 1,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS macro_targets (
      id TEXT PRIMARY KEY,
      calories REAL DEFAULT 2000,
      protein REAL DEFAULT 150,
      carbs REAL DEFAULT 250,
      fat REAL DEFAULT 65,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      component TEXT,
      fatal INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      app_version TEXT,
      platform TEXT,
      os_version TEXT
    );

    CREATE TABLE IF NOT EXISTS body_weight (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      date TEXT NOT NULL UNIQUE,
      notes TEXT DEFAULT '',
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      waist REAL,
      chest REAL,
      hips REAL,
      left_arm REAL,
      right_arm REAL,
      left_thigh REAL,
      right_thigh REAL,
      left_calf REAL,
      right_calf REAL,
      neck REAL,
      body_fat REAL,
      notes TEXT DEFAULT '',
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      measurement_unit TEXT NOT NULL DEFAULT 'cm',
      sex TEXT NOT NULL DEFAULT 'male',
      weight_goal REAL,
      body_fat_goal REAL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      current_day_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER DEFAULT NULL,
      is_starter INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS program_days (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      template_id TEXT DEFAULT NULL,
      position INTEGER NOT NULL,
      label TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS program_log (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      day_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );
  `);
}

export async function createExtensionTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS interaction_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      screen TEXT NOT NULL,
      detail TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress_photos (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      capture_date TEXT NOT NULL DEFAULT (datetime('now')),
      display_date TEXT NOT NULL,
      pose_category TEXT,
      note TEXT,
      width INTEGER,
      height INTEGER,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_progress_photos_display_date ON progress_photos(display_date);
    CREATE INDEX IF NOT EXISTS idx_progress_photos_deleted ON progress_photos(deleted_at);

    CREATE TABLE IF NOT EXISTS achievements_earned (
      achievement_id TEXT PRIMARY KEY,
      earned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strava_connection (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      athlete_id INTEGER NOT NULL,
      athlete_name TEXT NOT NULL,
      connected_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strava_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      strava_activity_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed', 'permanently_failed')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_strava_sync_log_status ON strava_sync_log(status);

    CREATE TABLE IF NOT EXISTS health_connect_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      health_connect_record_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed', 'permanently_failed')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_hc_sync_log_status ON health_connect_sync_log(status);

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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_strength_goals_one_active
      ON strength_goals(exercise_id) WHERE achieved_at IS NULL;

    CREATE TABLE IF NOT EXISTS meal_templates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, meal TEXT NOT NULL,
      cached_calories REAL NOT NULL DEFAULT 0, cached_protein REAL NOT NULL DEFAULT 0,
      cached_carbs REAL NOT NULL DEFAULT 0, cached_fat REAL NOT NULL DEFAULT 0,
      last_used_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meal_template_items (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL, food_entry_id TEXT NOT NULL,
      servings REAL NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_meal_template_items_template ON meal_template_items(template_id);

    -- BLD-600: hydration tracking. Additive table, no impact on existing schema.
    CREATE TABLE IF NOT EXISTS water_logs (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      logged_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_water_logs_date_key ON water_logs(date_key);
  `);
}

export async function createScheduleTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS program_schedule (
      program_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      UNIQUE(program_id, day_of_week),
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (template_id) REFERENCES workout_templates(id)
    );
  `);
}
