/**
 * BLD-1114 — Migration correctness: pulley_pin, max_pulley_pins, composite set_media index.
 *
 * Test cases:
 *   1. Fresh install — both columns and composite index are present after migrate().
 *   2. Upgrade path — columns missing initially; migrate() adds them idempotently.
 *   3. Idempotency — migrate() twice in a row does not throw.
 *   4. Composite index — uq_set_media_set_id covers (set_id, kind) after migration.
 */

import { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => { db.exec(sql); },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> =>
      db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> =>
      (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const r = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(r.changes) };
    },
  };
}

import { migrate } from "../../../lib/db/migrations";

function createDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function columnExists(db: InstanceType<typeof DatabaseSync>, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === col);
}

function indexSql(db: InstanceType<typeof DatabaseSync>, name: string): string | null {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(name) as
    | { sql: string }
    | undefined;
  return row?.sql ?? null;
}

describe("BLD-1114 — migration: pulley_pin + max_pulley_pins + composite index", () => {
  it("fresh install: pulley_pin and max_pulley_pins columns exist", async () => {
    const db = createDb();
    await migrate(wrapDb(db) as never);

    expect(columnExists(db, "workout_sets", "pulley_pin")).toBe(true);
    expect(columnExists(db, "exercises", "max_pulley_pins")).toBe(true);
  });

  it("fresh install: uq_set_media_set_id is composite (set_id, kind)", async () => {
    const db = createDb();
    await migrate(wrapDb(db) as never);

    const sql = indexSql(db, "uq_set_media_set_id");
    expect(sql).not.toBeNull();
    expect(sql).toMatch(/set_id/);
    expect(sql).toMatch(/kind/);
  });

  it("upgrade path: adds pulley_pin to pre-existing workout_sets", async () => {
    const db = createDb();
    // Simulate an older schema without the column
    db.exec(`
      CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
        primary_muscles TEXT NOT NULL DEFAULT '', secondary_muscles TEXT NOT NULL DEFAULT '',
        equipment TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT '', is_custom INTEGER DEFAULT 0,
        deleted_at INTEGER DEFAULT NULL, attachment TEXT DEFAULT 'handle',
        is_voltra INTEGER DEFAULT 0);
      CREATE TABLE workout_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
        started_at INTEGER NOT NULL, completed_at INTEGER, notes TEXT DEFAULT '',
        rating INTEGER, template_id TEXT, gym_id TEXT, gym_name_at_log TEXT,
        kind TEXT NOT NULL DEFAULT 'workout', day_session_exercise_id TEXT,
        day_session_date TEXT);
      CREATE TABLE workout_sets (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL, set_number INTEGER NOT NULL, weight REAL,
        reps INTEGER, notes TEXT, completed INTEGER DEFAULT 0,
        completed_at INTEGER, rpe REAL, set_notes TEXT, link_id TEXT,
        round INTEGER, tempo TEXT, set_type TEXT DEFAULT 'normal',
        exercise_position INTEGER DEFAULT 0, attachment TEXT, mount_position TEXT,
        grip_type TEXT, grip_width TEXT, stack_id TEXT, stack_marker REAL,
        stack_unit_at_log TEXT, stack_name_at_log TEXT, training_mode TEXT,
        duration_seconds REAL, swapped_from_exercise_id TEXT,
        is_warmup INTEGER DEFAULT 0, bodyweight_modifier_kg REAL,
        day_session_exercise_id TEXT, is_day_session INTEGER DEFAULT 0);
      CREATE TABLE set_media (id TEXT PRIMARY KEY, set_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL, rel_path TEXT NOT NULL, size_bytes INTEGER,
        width INTEGER, height INTEGER, pending_delete INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'video');
      CREATE UNIQUE INDEX uq_set_media_set_id ON set_media (set_id);
    `);

    await migrate(wrapDb(db) as never);

    expect(columnExists(db, "workout_sets", "pulley_pin")).toBe(true);
    expect(columnExists(db, "exercises", "max_pulley_pins")).toBe(true);

    const idxSql = indexSql(db, "uq_set_media_set_id");
    expect(idxSql).toMatch(/kind/);
  });

  it("idempotency: migrate() twice does not throw", async () => {
    const db = createDb();
    await migrate(wrapDb(db) as never);
    await expect(migrate(wrapDb(db) as never)).resolves.not.toThrow();
  });

  it("composite index allows one video + one setup_photo per set (no UNIQUE violation)", async () => {
    const db = createDb();
    await migrate(wrapDb(db) as never);

    db.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment,
        instructions, difficulty, is_custom) VALUES ('ex1','Squat','','','','','','',0);
      INSERT INTO workout_sessions (id, name, started_at) VALUES ('sess1', '', 1700000000);
      INSERT INTO workout_sets (id, session_id, exercise_id, set_number) VALUES ('s1','sess1','ex1',1);
      INSERT INTO set_media (id, set_id, exercise_id, rel_path, kind, created_at, pending_delete)
        VALUES ('m1','s1','ex1','set-media/clips/ex1/c1.mp4','video',1700000001,0);
    `);

    // A second row with kind='setup_photo' must NOT trigger the unique constraint
    expect(() => {
      db.exec(`
        INSERT INTO set_media (id, set_id, exercise_id, rel_path, kind, created_at, pending_delete)
          VALUES ('m2','s1','ex1','set-media/setup-p1.jpg','setup_photo',1700000002,0);
      `);
    }).not.toThrow();
  });
});
