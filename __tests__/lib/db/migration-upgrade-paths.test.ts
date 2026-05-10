/**
 * BLD-1059 regression: migration upgrade-path correctness.
 *
 * The production crash "no such column: gym_id" was caused by
 * createExtensionTables() (in lib/db/tables.ts) attempting to create an index
 * on workout_sessions(gym_id, started_at) BEFORE addColumnIfMissing() in
 * migrate() had added gym_id to an upgrading database.
 *
 * This suite runs migrate() against three different starting states using a
 * real in-memory SQLite engine (node:sqlite) wrapped in a thin shim that
 * matches the expo-sqlite async API surface used by migrate(), tables.ts, and
 * table-migrations.ts.
 *
 * Test cases:
 *   1. Pre-BLD-1059 upgrade path — workout_sessions exists WITHOUT gym_id/
 *      gym_name_at_log, workout_sets WITHOUT stack_* / grip_* columns, no
 *      gym_profiles / cable_stacks / stack_calibrations tables.
 *   2. Fresh install — no tables at all.
 *   3. Idempotency — migrate() twice in a row must not throw.
 */

import { DatabaseSync } from "node:sqlite";

// ── Thin shim: wrap node:sqlite DatabaseSync in the async API that
//    migrate() / tables.ts / table-migrations.ts expect from expo-sqlite. ──

type Row = Record<string, unknown>;
// node:sqlite SQLInputValue: null | number | bigint | string | Uint8Array.
// Tests only pass primitives, so casting through this type is safe.
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => {
      db.exec(sql);
    },
    getAllAsync: async <T = Row>(sql: string, _params?: unknown[]): Promise<T[]> => {
      return db.prepare(sql).all(...((_params ?? []) as SqlParam[])) as T[];
    },
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> => {
      return (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null;
    },
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

// ── Dynamically import migrate() so the test module resolves AFTER Jest has
//    set up the node:sqlite shim (no module-level side effects in migrations.ts
//    that would break; expo-sqlite default mock is bypassed here). ──

// We import migrate directly — it imports from expo-sqlite which is auto-mocked
// by __mocks__/expo-sqlite.ts. We bypass that by calling migrate() with our own
// wrapped db, not with the mock. The shim satisfies the same interface.
import { migrate } from "../../../lib/db/migrations";

// ── Helpers ──

function createDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function tableExists(db: InstanceType<typeof DatabaseSync>, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

function columnExists(db: InstanceType<typeof DatabaseSync>, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function indexExists(db: InstanceType<typeof DatabaseSync>, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

function count(db: InstanceType<typeof DatabaseSync>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

/**
 * Build the pre-BLD-1059 schema snapshot:
 *   - workout_sessions WITHOUT gym_id, gym_name_at_log
 *   - workout_sets WITHOUT stack_* columns, grip_* columns
 *   - NO gym_profiles / cable_stacks / stack_calibrations tables
 */
function buildPreBld1059Schema(db: InstanceType<typeof DatabaseSync>): void {
  db.exec(`
    CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      primary_muscles TEXT NOT NULL DEFAULT '',
      secondary_muscles TEXT NOT NULL DEFAULT '',
      equipment TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '',
      is_custom INTEGER DEFAULT 0,
      deleted_at INTEGER DEFAULT NULL,
      attachment TEXT DEFAULT 'handle',
      is_voltra INTEGER DEFAULT 0
    );

    CREATE TABLE workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_starter INTEGER DEFAULT 0,
      source TEXT,
      is_curated INTEGER DEFAULT 0
    );

    CREATE TABLE template_exercises (
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
      set_types TEXT DEFAULT '[]'
    );

    -- workout_sessions: pre-BLD-1059 snapshot — NO gym_id, NO gym_name_at_log
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      clock_started_at INTEGER DEFAULT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER,
      notes TEXT DEFAULT '',
      program_day_id TEXT DEFAULT NULL,
      rating INTEGER DEFAULT NULL,
      edited_at INTEGER DEFAULT NULL,
      import_batch_id TEXT DEFAULT NULL
    );

    -- workout_sets: pre-BLD-1059 snapshot — NO stack_* / grip_* columns
    CREATE TABLE workout_sets (
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
      tempo TEXT DEFAULT NULL,
      swapped_from_exercise_id TEXT DEFAULT NULL,
      set_type TEXT DEFAULT 'normal',
      duration_seconds INTEGER,
      exercise_position INTEGER DEFAULT 0,
      bodyweight_modifier_kg REAL DEFAULT NULL,
      attachment TEXT DEFAULT NULL,
      mount_position TEXT DEFAULT NULL
    );

    CREATE TABLE food_entries (
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

    CREATE TABLE daily_log (
      id TEXT PRIMARY KEY,
      food_entry_id TEXT NOT NULL,
      date TEXT NOT NULL,
      meal TEXT NOT NULL DEFAULT 'snack',
      servings REAL DEFAULT 1,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE macro_targets (
      id TEXT PRIMARY KEY,
      calories REAL DEFAULT 2000,
      protein REAL DEFAULT 150,
      carbs REAL DEFAULT 250,
      fat REAL DEFAULT 65,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE body_weight (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      date TEXT NOT NULL UNIQUE,
      notes TEXT DEFAULT '',
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE body_measurements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE body_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      measurement_unit TEXT NOT NULL DEFAULT 'cm',
      sex TEXT NOT NULL DEFAULT 'male',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      current_day_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER DEFAULT NULL,
      is_starter INTEGER DEFAULT 0,
      is_curated INTEGER DEFAULT 0
    );

    CREATE TABLE program_days (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      template_id TEXT DEFAULT NULL,
      position INTEGER NOT NULL,
      label TEXT DEFAULT ''
    );

    CREATE TABLE program_log (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      day_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );

    CREATE TABLE error_log (
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

    CREATE TABLE interaction_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      screen TEXT NOT NULL,
      detail TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE achievements_earned (
      achievement_id TEXT PRIMARY KEY,
      earned_at INTEGER NOT NULL
    );

    CREATE TABLE strava_connection (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      athlete_id INTEGER NOT NULL,
      athlete_name TEXT NOT NULL,
      connected_at INTEGER NOT NULL
    );

    CREATE TABLE strava_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      strava_activity_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(session_id)
    );

    CREATE TABLE meal_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      meal TEXT NOT NULL DEFAULT 'snack',
      cached_calories REAL NOT NULL DEFAULT 0,
      cached_protein REAL NOT NULL DEFAULT 0,
      cached_carbs REAL NOT NULL DEFAULT 0,
      cached_fat REAL NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE meal_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      food_entry_id TEXT NOT NULL,
      servings REAL NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE water_logs (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE progress_photos (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      capture_date TEXT NOT NULL DEFAULT (datetime('now')),
      display_date TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE program_schedule (
      program_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      UNIQUE(program_id, day_of_week)
    );
  `);
}

/** Insert realistic legacy data into the pre-BLD-1059 snapshot. */
function insertLegacyData(db: InstanceType<typeof DatabaseSync>): void {
  db.prepare("INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("ex1", "Cable Row", "back", "lats", "biceps", "cable", "Pull handle to waist", "beginner");

  db.prepare("INSERT INTO workout_sessions (id, name, started_at, completed_at) VALUES (?, ?, ?, ?)")
    .run("sess1", "Leg Day", 1_700_000_000, 1_700_003_600);
  db.prepare("INSERT INTO workout_sessions (id, name, started_at, completed_at) VALUES (?, ?, ?, ?)")
    .run("sess2", "Pull Day", 1_700_100_000, 1_700_103_600);

  db.prepare("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("set1", "sess1", "ex1", 1, 50, 10, 1);
  db.prepare("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("set2", "sess1", "ex1", 2, 55, 8, 1);
  db.prepare("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("set3", "sess2", "ex1", 1, 60, 6, 1);

  db.prepare("INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("tmpl1", "My Template", 1_700_000_000, 1_700_000_000);
  db.prepare("INSERT INTO template_exercises (id, template_id, exercise_id, position) VALUES (?, ?, ?, ?)")
    .run("te1", "tmpl1", "ex1", 0);
}

// ── Test suite ──

describe("BLD-1059 — migrate() upgrade-path regression", () => {
  /**
   * Test 1: Pre-BLD-1059 upgrade path.
   *
   * This is the exact scenario that caused "no such column: gym_id":
   * workout_sessions already exists but lacks gym_id/gym_name_at_log.
   * If createExtensionTables() were to run the gym_id index BEFORE
   * addColumnIfMissing() in migrate(), this test would throw.
   */
  it("upgrades a pre-BLD-1059 schema without throwing", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    insertLegacyData(raw);
    const db = wrapDb(raw);

    await expect(migrate(db as never)).resolves.toBeUndefined();
  });

  it("adds gym_id and gym_name_at_log to workout_sessions after upgrade", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(columnExists(raw, "workout_sessions", "gym_id")).toBe(true);
    expect(columnExists(raw, "workout_sessions", "gym_name_at_log")).toBe(true);
  });

  it("creates gym_profiles, cable_stacks, stack_calibrations tables after upgrade", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(tableExists(raw, "gym_profiles")).toBe(true);
    expect(tableExists(raw, "cable_stacks")).toBe(true);
    expect(tableExists(raw, "stack_calibrations")).toBe(true);
  });

  it("creates idx_workout_sessions_gym_started_at index after upgrade", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(indexExists(raw, "idx_workout_sessions_gym_started_at")).toBe(true);
  });

  it("preserves all legacy sessions, sets, and templates after upgrade", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    insertLegacyData(raw);
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(count(raw, "workout_sessions")).toBe(2);
    expect(count(raw, "workout_sets")).toBe(3);
    expect(count(raw, "workout_templates")).toBe(1);
    expect(count(raw, "template_exercises")).toBe(1);
    expect(count(raw, "exercises")).toBe(1);
  });

  it("preserves gym_id as NULL on legacy sessions after upgrade (no data corruption)", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    insertLegacyData(raw);
    const db = wrapDb(raw);

    await migrate(db as never);

    const sessions = raw.prepare("SELECT id, gym_id FROM workout_sessions ORDER BY id").all() as Array<{ id: string; gym_id: string | null }>;
    expect(sessions).toHaveLength(2);
    expect(sessions[0].gym_id).toBeNull();
    expect(sessions[1].gym_id).toBeNull();
  });
});

describe("BLD-1059 — migrate() fresh install sanity check", () => {
  /**
   * Test 2: Fresh install — no tables at all.
   * Verifies the happy path still works after the bug fix.
   */
  it("succeeds on a completely empty database", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await expect(migrate(db as never)).resolves.toBeUndefined();
  });

  it("creates all expected core tables on fresh install", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await migrate(db as never);

    const expectedTables = [
      "exercises", "workout_templates", "template_exercises",
      "workout_sessions", "workout_sets", "food_entries", "daily_log",
      "macro_targets", "body_weight", "body_measurements", "body_settings",
      "programs", "program_days", "program_log",
      "gym_profiles", "cable_stacks", "stack_calibrations",
      "strength_goals", "set_media",
    ];
    for (const t of expectedTables) {
      expect(tableExists(raw, t)).toBe(true);
    }
  });

  it("creates gym_id and gym_name_at_log columns on fresh workout_sessions table", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(columnExists(raw, "workout_sessions", "gym_id")).toBe(true);
    expect(columnExists(raw, "workout_sessions", "gym_name_at_log")).toBe(true);
  });

  it("creates idx_workout_sessions_gym_started_at index on fresh install", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(indexExists(raw, "idx_workout_sessions_gym_started_at")).toBe(true);
  });

  it("creates idx_workout_sets_variant_pr index on fresh install", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await migrate(db as never);

    expect(indexExists(raw, "idx_workout_sets_variant_pr")).toBe(true);
  });
});

describe("BLD-1059 — migrate() idempotency", () => {
  /**
   * Test 3: Running migrate() twice must not throw.
   * All CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
   * addColumnIfMissing calls are designed to be no-ops on second run.
   */
  it("does not throw when called twice on an upgraded DB", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    insertLegacyData(raw);
    const db = wrapDb(raw);

    await migrate(db as never);
    await expect(migrate(db as never)).resolves.toBeUndefined();
  });

  it("does not throw when called twice on a fresh DB", async () => {
    const raw = createDb();
    const db = wrapDb(raw);

    await migrate(db as never);
    await expect(migrate(db as never)).resolves.toBeUndefined();
  });

  it("data is stable after double-migration on upgraded DB", async () => {
    const raw = createDb();
    buildPreBld1059Schema(raw);
    insertLegacyData(raw);
    const db = wrapDb(raw);

    await migrate(db as never);
    await migrate(db as never);

    expect(count(raw, "workout_sessions")).toBe(2);
    expect(count(raw, "workout_sets")).toBe(3);
  });
});
