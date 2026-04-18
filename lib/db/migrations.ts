import * as SQLite from "expo-sqlite";

let migSeq = 0;
function migrationUUID(): string {
  migSeq++;
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `mig-${ts}-${rnd}-${migSeq}`;
}

async function createCoreTables(database: SQLite.SQLiteDatabase): Promise<void> {
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
      is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      target_sets INTEGER DEFAULT 3,
      target_reps TEXT DEFAULT '8-12',
      rest_seconds INTEGER DEFAULT 90
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER
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
      deleted_at INTEGER DEFAULT NULL
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

async function addColumnMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(exercises)"
  );
  if (!cols.some((c) => c.name === "deleted_at")) {
    await database.execAsync(
      "ALTER TABLE exercises ADD COLUMN deleted_at INTEGER DEFAULT NULL"
    );
  }

  const sessionCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(workout_sessions)"
  );
  if (!sessionCols.some((c) => c.name === "program_day_id")) {
    await database.execAsync(
      "ALTER TABLE workout_sessions ADD COLUMN program_day_id TEXT DEFAULT NULL"
    );
  }
  if (!sessionCols.some((c) => c.name === "rating")) {
    await database.execAsync(
      "ALTER TABLE workout_sessions ADD COLUMN rating INTEGER DEFAULT NULL"
    );
  }

  const setCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(workout_sets)"
  );
  if (!setCols.some((c) => c.name === "rpe")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN rpe REAL DEFAULT NULL"
    );
  }
  if (!setCols.some((c) => c.name === "notes")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN notes TEXT DEFAULT ''"
    );
  }

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

  const teCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(template_exercises)"
  );
  if (!teCols.some((c) => c.name === "link_id")) {
    await database.execAsync(
      "ALTER TABLE template_exercises ADD COLUMN link_id TEXT DEFAULT NULL"
    );
  }
  if (!teCols.some((c) => c.name === "link_label")) {
    await database.execAsync(
      "ALTER TABLE template_exercises ADD COLUMN link_label TEXT DEFAULT ''"
    );
  }

  if (!setCols.some((c) => c.name === "link_id")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN link_id TEXT DEFAULT NULL"
    );
  }
  if (!setCols.some((c) => c.name === "round")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN round INTEGER DEFAULT NULL"
    );
  }

  const setNames = new Set(setCols.map((c) => c.name));
  if (!setNames.has("training_mode") || !setNames.has("tempo")) {
    await database.withTransactionAsync(async () => {
      if (!setNames.has("training_mode")) {
        await database.execAsync(
          "ALTER TABLE workout_sets ADD COLUMN training_mode TEXT DEFAULT NULL"
        );
      }
      if (!setNames.has("tempo")) {
        await database.execAsync(
          "ALTER TABLE workout_sets ADD COLUMN tempo TEXT DEFAULT NULL"
        );
      }
    });
  }

  if (!setNames.has("swapped_from_exercise_id")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN swapped_from_exercise_id TEXT DEFAULT NULL"
    );
  }
  if (!setNames.has("is_warmup")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN is_warmup INTEGER DEFAULT 0"
    );
  }
  if (!setNames.has("set_type")) {
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

async function migrateExerciseAndFeatureColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  const exCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(exercises)"
  );
  const names = new Set(exCols.map((c) => c.name));
  if (!names.has("mount_position")) {
    await database.execAsync(
      "ALTER TABLE exercises ADD COLUMN mount_position TEXT DEFAULT NULL"
    );
  }
  if (!names.has("attachment")) {
    await database.execAsync(
      "ALTER TABLE exercises ADD COLUMN attachment TEXT DEFAULT 'handle'"
    );
  }
  if (!names.has("training_modes")) {
    await database.execAsync(
      `ALTER TABLE exercises ADD COLUMN training_modes TEXT DEFAULT '["weight"]'`
    );
  }
  if (!names.has("is_voltra")) {
    await database.execAsync(
      "ALTER TABLE exercises ADD COLUMN is_voltra INTEGER DEFAULT 0"
    );
  }

  const hasVoltra = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM exercises WHERE is_voltra = 1 AND deleted_at IS NULL"
  );
  if (!hasVoltra || hasVoltra.count === 0) {
    await database.withTransactionAsync(async () => {
      const now = Date.now();
      await database.runAsync(
        "UPDATE exercises SET deleted_at = ? WHERE is_custom = 0 AND deleted_at IS NULL",
        [now]
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'arms' WHERE is_custom = 1 AND category IN ('biceps', 'triceps')"
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'legs_glutes' WHERE is_custom = 1 AND category IN ('legs', 'cardio')"
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'abs_core' WHERE is_custom = 1 AND category IN ('core', 'full_body')"
      );
    });
  }

  const tplCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(workout_templates)"
  );
  if (!tplCols.some((c) => c.name === "is_starter")) {
    await database.execAsync(
      "ALTER TABLE workout_templates ADD COLUMN is_starter INTEGER DEFAULT 0"
    );
  }

  const progCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(programs)"
  );
  if (!progCols.some((c) => c.name === "is_starter")) {
    await database.execAsync(
      "ALTER TABLE programs ADD COLUMN is_starter INTEGER DEFAULT 0"
    );
  }
}

async function createScheduleAndMigrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)"
  );

  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS weekly_schedule (
      id TEXT PRIMARY KEY,
      day_of_week INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (template_id) REFERENCES workout_templates(id),
      UNIQUE(day_of_week)
    )`
  );

  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS program_schedule (
      program_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      UNIQUE(program_id, day_of_week),
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (template_id) REFERENCES workout_templates(id)
    )`
  );

  // Migrate weekly_schedule → program_schedule on active program
  const hasMigrated = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'schedule_migrated'"
  );
  if (!hasMigrated) {
    const oldSched = await database.getAllAsync<{ day_of_week: number; template_id: string }>(
      "SELECT day_of_week, template_id FROM weekly_schedule"
    );
    if (oldSched.length > 0) {
      let targetProgramId: string | null = null;
      const activeProg = await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM programs WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1"
      );
      if (activeProg) {
        targetProgramId = activeProg.id;
      } else {
        const pid = migrationUUID();
        const now = Date.now();
        await database.runAsync(
          "INSERT INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)",
          [pid, "My Weekly Routine", "", now, now]
        );
        const uniqueTemplates = [...new Set(oldSched.map((s) => s.template_id))];
        for (let i = 0; i < uniqueTemplates.length; i++) {
          const dayId = migrationUUID();
          await database.runAsync(
            "INSERT INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, '')",
            [dayId, pid, uniqueTemplates[i], i]
          );
          if (i === 0) {
            await database.runAsync(
              "UPDATE programs SET current_day_id = ? WHERE id = ?",
              [dayId, pid]
            );
          }
        }
        targetProgramId = pid;
      }
      for (const s of oldSched) {
        await database.runAsync(
          "INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)",
          [targetProgramId, s.day_of_week, s.template_id]
        );
      }
    }
    await database.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schedule_migrated', '1')"
    );
  }
}

async function createExtensionTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS interaction_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      screen TEXT NOT NULL,
      detail TEXT,
      timestamp INTEGER NOT NULL
    )`
  );

  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS progress_photos (
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
    )`
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_progress_photos_display_date ON progress_photos(display_date)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_progress_photos_deleted ON progress_photos(deleted_at)"
  );

  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS achievements_earned (
      achievement_id TEXT PRIMARY KEY,
      earned_at INTEGER NOT NULL
    )`
  );

  // Strava integration tables (Phase 48)
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS strava_connection (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      athlete_id INTEGER NOT NULL,
      athlete_name TEXT NOT NULL,
      connected_at INTEGER NOT NULL
    )`
  );

  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS strava_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      strava_activity_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed', 'permanently_failed')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(session_id)
    )`
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_strava_sync_log_status ON strava_sync_log(status)"
  );

  // Health Connect integration tables (Phase 49)
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS health_connect_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      health_connect_record_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed', 'permanently_failed')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(session_id)
    )`
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_hc_sync_log_status ON health_connect_sync_log(status)"
  );
}

export async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await createCoreTables(database);
  await addColumnMigrations(database);
  await migrateExerciseAndFeatureColumns(database);
  await createScheduleAndMigrate(database);
  await createExtensionTables(database);
}
