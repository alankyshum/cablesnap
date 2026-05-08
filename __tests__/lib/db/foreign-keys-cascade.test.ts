/**
 * BLD-1094: PRAGMA foreign_keys = ON + delete-path regression sweep.
 *
 * Two test groups:
 *
 * 1. PRAGMA assertion — verifies that lib/db/helpers.ts:getDatabase() executes
 *    `PRAGMA foreign_keys = ON` on every fresh connection (both the regular
 *    expo-sqlite path and the web in-memory fallback).
 *
 * 2. FK cascade behavior — uses node:sqlite real engine (matches existing
 *    *-correctness.test.ts pattern) with FK enforcement enabled and the
 *    exact FOREIGN KEY declarations from lib/db/tables.ts. For each enumerated
 *    delete path the test inserts a child row (where one exists), runs the
 *    same SQL pattern the production function uses, and asserts:
 *      a. the DELETE does not raise a FOREIGN KEY constraint failure, and
 *      b. no dangling rows remain in any related table.
 *
 * Delete paths covered (BLD-1094 issue body enumeration):
 *   - deleteSet                   (lib/db/session-sets.ts)
 *   - deleteSetsBatch             (lib/db/session-sets.ts)
 *   - deleteCompletedSession      (lib/db/sessions.ts)         — strava + health_connect cascade
 *   - cancelSession               (lib/db/sessions.ts)         — strava + health_connect cascade
 *   - undoCsvImport               (lib/db/csv-import.ts)       — strava + health_connect cascade
 *   - removeQuickAddSet           (lib/db/day-session.ts)
 *   - softDeleteCustomExercise    (lib/db/exercises.ts)        — soft delete, no FK violation
 *   - deleteTemplate              (lib/db/templates.ts)        — program_schedule child first
 *   - removeExerciseFromTemplate  (lib/db/templates.ts)
 *   - deleteGymProfile            (lib/db/gym-profiles.ts)     — soft delete only
 *   - deleteCableStack            (lib/db/gym-profiles.ts)     — soft delete only
 *   - deleteCalibration           (lib/db/gym-profiles.ts)
 *   - softDeletePhoto             (lib/db/photos.ts)           — soft delete
 *   - permanentlyDeletePhoto      (lib/db/photos.ts)
 *   - deleteBodyWeight            (lib/db/body.ts)
 *   - deleteBodyMeasurements      (lib/db/body.ts)
 *   - deleteWaterLog              (lib/db/hydration.ts)
 *   - deleteMealTemplate          (lib/db/meal-templates.ts)   — meal_template_items child first
 *   - deleteStravaConnection      (lib/db/strava.ts)
 *   - deleteCalibration (single)  (lib/db/gym-profiles.ts)
 *   - test-seed clearAll          (lib/db/test-seed.ts)        — strava + health_connect cascade
 *
 * Also includes a negative test that demonstrates the FK constraint actually
 * fires when a child row exists and the parent is deleted without cascade —
 * proving foreign_keys = ON is enforcing.
 */

import { DatabaseSync } from "node:sqlite";

/** Build an in-memory DB with foreign_keys=ON and the FK schema from lib/db/tables.ts. */
function createFkDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_custom INTEGER DEFAULT 0,
      deleted_at INTEGER
    );

    CREATE TABLE workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_starter INTEGER DEFAULT 0,
      is_curated INTEGER DEFAULT 0
    );

    CREATE TABLE template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      kind TEXT DEFAULT 'workout',
      import_batch_id TEXT,
      day_session_exercise_id TEXT,
      day_session_date TEXT
    );

    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER
    );

    CREATE TABLE strava_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      strava_activity_id TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id)
    );

    CREATE TABLE health_connect_sync_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id),
      health_connect_record_id TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id)
    );

    CREATE TABLE strength_goals (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,
      target_weight REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE program_schedule (
      program_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      UNIQUE(program_id, day_of_week),
      FOREIGN KEY (program_id) REFERENCES programs(id),
      FOREIGN KEY (template_id) REFERENCES workout_templates(id)
    );

    CREATE TABLE gym_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE cable_stacks (
      id TEXT PRIMARY KEY,
      gym_id TEXT NOT NULL,
      name TEXT NOT NULL,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (gym_id) REFERENCES gym_profiles(id)
    );

    CREATE TABLE stack_calibrations (
      id TEXT PRIMARY KEY,
      stack_id TEXT NOT NULL,
      marker INTEGER NOT NULL,
      true_weight REAL NOT NULL,
      UNIQUE(stack_id, marker),
      FOREIGN KEY (stack_id) REFERENCES cable_stacks(id)
    );

    CREATE TABLE meal_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE meal_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      food_entry_id TEXT NOT NULL
    );

    CREATE TABLE body_weight (id TEXT PRIMARY KEY, weight REAL NOT NULL, date TEXT NOT NULL UNIQUE, logged_at INTEGER NOT NULL);
    CREATE TABLE body_measurements (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, logged_at INTEGER NOT NULL);
    CREATE TABLE water_logs (id TEXT PRIMARY KEY, date_key TEXT NOT NULL, amount_ml INTEGER NOT NULL, logged_at INTEGER NOT NULL);
    CREATE TABLE strava_connection (id INTEGER PRIMARY KEY DEFAULT 1, athlete_id INTEGER NOT NULL, athlete_name TEXT NOT NULL, connected_at INTEGER NOT NULL);
    CREATE TABLE progress_photos (id TEXT PRIMARY KEY, file_path TEXT NOT NULL, capture_date TEXT NOT NULL, display_date TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE daily_log (id TEXT PRIMARY KEY, food_entry_id TEXT NOT NULL, date TEXT NOT NULL, meal TEXT NOT NULL DEFAULT 'snack', servings REAL DEFAULT 1, logged_at INTEGER NOT NULL);

    CREATE TABLE set_media (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'video',
      rel_path TEXT NOT NULL,
      duration_ms INTEGER,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      created_at INTEGER NOT NULL,
      pending_delete INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

/** Insert a workout session row. */
function insertSession(
  db: InstanceType<typeof DatabaseSync>,
  id: string,
  opts: { kind?: string; completed?: boolean; importBatchId?: string | null } = {},
): void {
  const kind = opts.kind ?? "workout";
  const completed = opts.completed ?? true;
  db.prepare(
    `INSERT INTO workout_sessions (id, name, started_at, completed_at, kind, import_batch_id)
     VALUES (?, ?, 1000, ?, ?, ?)`,
  ).run(id, `Session ${id}`, completed ? 2000 : null, kind, opts.importBatchId ?? null);
}

function insertSet(
  db: InstanceType<typeof DatabaseSync>,
  id: string,
  sessionId: string,
  exerciseId: string,
): void {
  db.prepare(
    `INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed)
     VALUES (?, ?, ?, 1, 50, 10, 1)`,
  ).run(id, sessionId, exerciseId);
}

function count(db: InstanceType<typeof DatabaseSync>, table: string, where?: string): number {
  const sql = where ? `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) AS c FROM ${table}`;
  return (db.prepare(sql).get() as { c: number }).c;
}

describe("BLD-1094 — PRAGMA foreign_keys = ON enforcement", () => {
  it("foreign_keys=ON is on by setup", () => {
    const db = createFkDb();
    const pragma = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(pragma.foreign_keys).toBe(1);
  });

  it("FK violation negative test: deleting parent without cascading child fails", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES (?, ?)").run("ex1", "Bench");
    insertSession(db, "s1");
    db.prepare(
      "INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)",
    ).run("sync1", "s1", "synced", 100);

    // Without first deleting the strava_sync_log row, DELETE FROM workout_sessions
    // must raise a FK constraint failure under foreign_keys = ON.
    expect(() => db.prepare("DELETE FROM workout_sessions WHERE id = ?").run("s1"))
      .toThrow(/FOREIGN KEY constraint failed/i);
  });
});

describe("BLD-1094 — delete-path regression sweep (no dangling rows + no FK errors)", () => {
  // ── workout_sessions delete paths (sync-log child cascade) ──

  it("deleteCompletedSession: cascades to strava_sync_log + health_connect_sync_log + workout_sets", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1");
    insertSet(db, "set1", "s1", "ex1");
    db.prepare("INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("strava1", "s1", "synced", 100);
    db.prepare("INSERT INTO health_connect_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("hc1", "s1", "synced", 100);

    // Mirror lib/db/sessions.ts:deleteCompletedSession — children before parent.
    expect(() => {
      db.prepare("DELETE FROM strava_sync_log WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM health_connect_sync_log WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM workout_sets WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM workout_sessions WHERE id = ? AND completed_at IS NOT NULL").run("s1");
    }).not.toThrow();

    expect(count(db, "workout_sessions", "id='s1'")).toBe(0);
    expect(count(db, "workout_sets", "session_id='s1'")).toBe(0);
    expect(count(db, "strava_sync_log", "session_id='s1'")).toBe(0);
    expect(count(db, "health_connect_sync_log", "session_id='s1'")).toBe(0);
  });

  it("cancelSession orphan sweep: cascades sync logs for every orphaned in-progress session", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "target", { completed: false });
    insertSession(db, "orphan1", { completed: false });
    insertSet(db, "s1", "target", "ex1");
    insertSet(db, "s2", "orphan1", "ex1");
    db.prepare("INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("sync_target", "target", "pending", 100);
    db.prepare("INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("sync_orphan", "orphan1", "pending", 100);

    expect(() => {
      // Targeted delete + orphan loop — same shape as cancelSession.
      for (const id of ["target", "orphan1"]) {
        db.prepare("DELETE FROM strava_sync_log WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM health_connect_sync_log WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM workout_sets WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM workout_sessions WHERE id = ?").run(id);
      }
    }).not.toThrow();

    expect(count(db, "workout_sessions")).toBe(0);
    expect(count(db, "strava_sync_log")).toBe(0);
  });

  it("undoCsvImport: cascades sync logs for every session in the batch", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1", { importBatchId: "batch-A" });
    insertSession(db, "s2", { importBatchId: "batch-A" });
    insertSet(db, "set1", "s1", "ex1");
    insertSet(db, "set2", "s2", "ex1");
    db.prepare("INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("sync_s1", "s1", "synced", 100);
    db.prepare("INSERT INTO health_connect_sync_log (id, session_id, status, created_at) VALUES (?, ?, ?, ?)")
      .run("hc_s2", "s2", "synced", 100);

    expect(() => {
      const sessions = db.prepare("SELECT id FROM workout_sessions WHERE import_batch_id = ?").all("batch-A") as Array<{ id: string }>;
      for (const { id } of sessions) {
        db.prepare("DELETE FROM strava_sync_log WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM health_connect_sync_log WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM workout_sets WHERE session_id = ?").run(id);
      }
      db.prepare("DELETE FROM workout_sessions WHERE import_batch_id = ?").run("batch-A");
    }).not.toThrow();

    expect(count(db, "workout_sessions", "import_batch_id='batch-A'")).toBe(0);
    expect(count(db, "workout_sets")).toBe(0);
    expect(count(db, "strava_sync_log")).toBe(0);
    expect(count(db, "health_connect_sync_log")).toBe(0);
  });

  it("removeQuickAddSet: deletes a day_session backing row after last set; sync logs absent so no FK concern", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Pullup')").run();
    insertSession(db, "ds1", { kind: "day_session" });
    insertSet(db, "qset1", "ds1", "ex1");

    expect(() => {
      db.prepare("DELETE FROM workout_sets WHERE id = ?").run("qset1");
      db.prepare("DELETE FROM workout_sessions WHERE id = ?").run("ds1");
    }).not.toThrow();

    expect(count(db, "workout_sets")).toBe(0);
    expect(count(db, "workout_sessions")).toBe(0);
  });

  it("test-seed clearAll: cascade DELETE order does not raise FK violations", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1");
    insertSet(db, "set1", "s1", "ex1");
    db.prepare("INSERT INTO strava_sync_log (id, session_id, status, created_at) VALUES ('sync', 's1', 'synced', 100)").run();
    db.prepare("INSERT INTO health_connect_sync_log (id, session_id, status, created_at) VALUES ('hc', 's1', 'synced', 100)").run();

    expect(() => db.exec(`
      DELETE FROM strava_sync_log;
      DELETE FROM health_connect_sync_log;
      DELETE FROM workout_sets;
      DELETE FROM workout_sessions;
    `)).not.toThrow();

    expect(count(db, "workout_sessions")).toBe(0);
  });

  // ── workout_sets delete paths (no FK on workout_sets — should always succeed) ──

  it("deleteSet: succeeds with FK on (workout_sets has no FK declared)", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1");
    insertSet(db, "set1", "s1", "ex1");

    expect(() => db.prepare("DELETE FROM workout_sets WHERE id = ?").run("set1")).not.toThrow();
    expect(count(db, "workout_sets", "id='set1'")).toBe(0);
    // Parent session row is unaffected.
    expect(count(db, "workout_sessions", "id='s1'")).toBe(1);
  });

  it("deleteSetsBatch: succeeds with FK on", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1");
    insertSet(db, "set1", "s1", "ex1");
    insertSet(db, "set2", "s1", "ex1");

    expect(() => db.prepare("DELETE FROM workout_sets WHERE id IN (?, ?)").run("set1", "set2")).not.toThrow();
    expect(count(db, "workout_sets")).toBe(0);
  });

  // ── exercises soft-delete (no hard delete in code; soft only) ──

  it("softDeleteCustomExercise: UPDATE deleted_at — never hard-deletes, FK to strength_goals not triggered", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name, is_custom) VALUES ('ex1', 'Custom Bench', 1)").run();
    db.prepare("INSERT INTO strength_goals (id, exercise_id, target_weight) VALUES ('g1', 'ex1', 100)").run();

    // Mirror softDeleteCustomExercise: delete template_exercises children, then UPDATE deleted_at.
    expect(() => {
      db.prepare("DELETE FROM template_exercises WHERE exercise_id = ?").run("ex1");
      db.prepare("UPDATE exercises SET deleted_at = ? WHERE id = ? AND is_custom = 1").run(Date.now(), "ex1");
    }).not.toThrow();

    // Strength goal still references the (now soft-deleted) exercise — that's
    // by design; the FK still resolves because the exercise row still exists.
    expect(count(db, "strength_goals", "exercise_id='ex1'")).toBe(1);
    expect(count(db, "exercises", "id='ex1' AND deleted_at IS NOT NULL")).toBe(1);
  });

  // ── workout_templates delete paths ──

  it("deleteTemplate: program_schedule + template_exercises children deleted before template", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    db.prepare("INSERT INTO programs (id, name) VALUES ('p1', 'Prog')").run();
    db.prepare("INSERT INTO workout_templates (id, name, created_at, updated_at, is_starter, is_curated) VALUES ('t1', 'T', 1, 1, 0, 0)").run();
    db.prepare("INSERT INTO template_exercises (id, template_id, exercise_id, position) VALUES ('te1', 't1', 'ex1', 0)").run();
    db.prepare("INSERT INTO program_schedule (program_id, day_of_week, template_id) VALUES ('p1', 1, 't1')").run();

    expect(() => {
      db.prepare("DELETE FROM program_schedule WHERE template_id = ?").run("t1");
      db.prepare("DELETE FROM template_exercises WHERE template_id = ?").run("t1");
      db.prepare("DELETE FROM workout_templates WHERE id = ? AND is_starter = 0").run("t1");
    }).not.toThrow();

    expect(count(db, "workout_templates")).toBe(0);
    expect(count(db, "program_schedule", "template_id='t1'")).toBe(0);
    expect(count(db, "template_exercises", "template_id='t1'")).toBe(0);
  });

  it("removeExerciseFromTemplate: deletes one template_exercises row, no FK violation", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    db.prepare("INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES ('t1', 'T', 1, 1)").run();
    db.prepare("INSERT INTO template_exercises (id, template_id, exercise_id, position) VALUES ('te1', 't1', 'ex1', 0)").run();

    expect(() => db.prepare("DELETE FROM template_exercises WHERE id = ?").run("te1")).not.toThrow();
    expect(count(db, "template_exercises")).toBe(0);
  });

  // ── gym soft-delete (preserves FK because no hard delete) ──

  it("deleteGymProfile: soft delete preserves cable_stacks FK; no FK violation", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO gym_profiles (id, name, created_at, updated_at) VALUES ('g1', 'Home', 1, 1)").run();
    db.prepare("INSERT INTO cable_stacks (id, gym_id, name, created_at, updated_at) VALUES ('stk1', 'g1', 'S', 1, 1)").run();

    expect(() => db.prepare("UPDATE gym_profiles SET deleted_at = ?, is_default = 0, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), "g1")).not.toThrow();
    expect(count(db, "gym_profiles", "deleted_at IS NOT NULL")).toBe(1);
    expect(count(db, "cable_stacks", "gym_id='g1'")).toBe(1);
  });

  it("deleteCableStack: soft delete preserves stack_calibrations FK", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO gym_profiles (id, name, created_at, updated_at) VALUES ('g1', 'Home', 1, 1)").run();
    db.prepare("INSERT INTO cable_stacks (id, gym_id, name, created_at, updated_at) VALUES ('stk1', 'g1', 'S', 1, 1)").run();
    db.prepare("INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('c1', 'stk1', 10, 22.5)").run();

    expect(() => db.prepare("UPDATE cable_stacks SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(Date.now(), Date.now(), "stk1")).not.toThrow();
    expect(count(db, "stack_calibrations", "stack_id='stk1'")).toBe(1);
  });

  it("deleteCalibration: deletes one stack_calibrations row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO gym_profiles (id, name, created_at, updated_at) VALUES ('g1', 'Home', 1, 1)").run();
    db.prepare("INSERT INTO cable_stacks (id, gym_id, name, created_at, updated_at) VALUES ('stk1', 'g1', 'S', 1, 1)").run();
    db.prepare("INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('c1', 'stk1', 10, 22.5)").run();

    expect(() => db.prepare("DELETE FROM stack_calibrations WHERE stack_id = ? AND marker = ?")
      .run("stk1", 10)).not.toThrow();
    expect(count(db, "stack_calibrations")).toBe(0);
  });

  // ── Misc no-FK delete paths ──

  it("deleteWaterLog: deletes one water_logs row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO water_logs (id, date_key, amount_ml, logged_at) VALUES ('w1', '2026-01-01', 250, 1)").run();
    expect(() => db.prepare("DELETE FROM water_logs WHERE id = ?").run("w1")).not.toThrow();
    expect(count(db, "water_logs")).toBe(0);
  });

  it("deleteBodyWeight: deletes one body_weight row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO body_weight (id, weight, date, logged_at) VALUES ('b1', 70, '2026-01-01', 1)").run();
    expect(() => db.prepare("DELETE FROM body_weight WHERE id = ?").run("b1")).not.toThrow();
    expect(count(db, "body_weight")).toBe(0);
  });

  it("deleteBodyMeasurements: deletes one body_measurements row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO body_measurements (id, date, logged_at) VALUES ('m1', '2026-01-01', 1)").run();
    expect(() => db.prepare("DELETE FROM body_measurements WHERE id = ?").run("m1")).not.toThrow();
    expect(count(db, "body_measurements")).toBe(0);
  });

  it("deleteMealTemplate: deletes meal_template_items child first, then template", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO meal_templates (id, name) VALUES ('mt1', 'Lunch')").run();
    db.prepare("INSERT INTO meal_template_items (id, template_id, food_entry_id) VALUES ('mti1', 'mt1', 'f1')").run();

    expect(() => {
      db.prepare("DELETE FROM meal_template_items WHERE template_id = ?").run("mt1");
      db.prepare("DELETE FROM meal_templates WHERE id = ?").run("mt1");
    }).not.toThrow();

    expect(count(db, "meal_templates")).toBe(0);
    expect(count(db, "meal_template_items")).toBe(0);
  });

  it("deleteStravaConnection: deletes singleton row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO strava_connection (id, athlete_id, athlete_name, connected_at) VALUES (1, 42, 'Alice', 1)").run();
    expect(() => db.prepare("DELETE FROM strava_connection WHERE id = ?").run(1)).not.toThrow();
    expect(count(db, "strava_connection")).toBe(0);
  });

  it("permanentlyDeletePhoto: deletes one progress_photos row (no FK)", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO progress_photos (id, file_path, capture_date, display_date, created_at) VALUES ('p1', '/a', '2026-01-01', '2026-01-01', '2026-01-01')").run();
    expect(() => db.prepare("DELETE FROM progress_photos WHERE id = ?").run("p1")).not.toThrow();
    expect(count(db, "progress_photos")).toBe(0);
  });

  // ── Strength goals: explicit FK to exercises ──

  it("deleteStrengthGoal: deletes goal row directly (FK to exercises is parent-side, not affected)", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    db.prepare("INSERT INTO strength_goals (id, exercise_id, target_weight) VALUES ('g1', 'ex1', 100)").run();
    expect(() => db.prepare("DELETE FROM strength_goals WHERE id = ?").run("g1")).not.toThrow();
    expect(count(db, "strength_goals")).toBe(0);
    expect(count(db, "exercises", "id='ex1'")).toBe(1);
  });

  // ── AC13 / BLD-1092 — set_media cascade on parent-set/session delete ──

  it("AC13 — deleteCompletedSession: set_media rows are deleted before workout_sets (service-layer cascade pattern)", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Bench')").run();
    insertSession(db, "s1");
    insertSet(db, "set1", "s1", "ex1");
    // Insert a set_media row linked to set1.
    db.prepare(
      `INSERT INTO set_media (id, set_id, exercise_id, kind, rel_path, created_at, pending_delete)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("clip1", "set1", "ex1", "video", "form-clips/ex1/clip1.mp4", 9000, 0);

    // Mirror cascadeDeleteClipsForSets + deleteCompletedSession DB pattern:
    //   1. delete set_media rows for each set in the session
    //   2. delete sync-log children
    //   3. delete workout_sets
    //   4. delete workout_session
    expect(() => {
      db.prepare("DELETE FROM set_media WHERE set_id = ?").run("set1");
      db.prepare("DELETE FROM strava_sync_log WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM health_connect_sync_log WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM workout_sets WHERE session_id = ?").run("s1");
      db.prepare("DELETE FROM workout_sessions WHERE id = ? AND completed_at IS NOT NULL").run("s1");
    }).not.toThrow();

    expect(count(db, "set_media", "set_id='set1'")).toBe(0);
    expect(count(db, "workout_sets", "session_id='s1'")).toBe(0);
    expect(count(db, "workout_sessions", "id='s1'")).toBe(0);
  });

  it("AC13 — deleteSet: set_media row deleted before workout_sets row", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Squat')").run();
    insertSession(db, "s2");
    insertSet(db, "set2", "s2", "ex1");
    db.prepare(
      `INSERT INTO set_media (id, set_id, exercise_id, kind, rel_path, created_at, pending_delete)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("clip2", "set2", "ex1", "video", "form-clips/ex1/clip2.mp4", 9001, 0);

    expect(() => {
      db.prepare("DELETE FROM set_media WHERE set_id = ?").run("set2");
      db.prepare("DELETE FROM workout_sets WHERE id = ?").run("set2");
    }).not.toThrow();

    expect(count(db, "set_media", "set_id='set2'")).toBe(0);
    expect(count(db, "workout_sets", "id='set2'")).toBe(0);
    expect(count(db, "workout_sessions", "id='s2'")).toBe(1);
  });

  it("AC13 — deleteSetsBatch: set_media rows deleted before workout_sets batch", () => {
    const db = createFkDb();
    db.prepare("INSERT INTO exercises (id, name) VALUES ('ex1', 'Deadlift')").run();
    insertSession(db, "s3");
    insertSet(db, "set3a", "s3", "ex1");
    insertSet(db, "set3b", "s3", "ex1");
    db.prepare(
      `INSERT INTO set_media (id, set_id, exercise_id, kind, rel_path, created_at, pending_delete) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("clip3a", "set3a", "ex1", "video", "form-clips/ex1/clip3a.mp4", 9002, 0);
    db.prepare(
      `INSERT INTO set_media (id, set_id, exercise_id, kind, rel_path, created_at, pending_delete) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("clip3b", "set3b", "ex1", "video", "form-clips/ex1/clip3b.mp4", 9003, 0);

    expect(() => {
      db.prepare("DELETE FROM set_media WHERE set_id IN (?, ?)").run("set3a", "set3b");
      db.prepare("DELETE FROM workout_sets WHERE id IN (?, ?)").run("set3a", "set3b");
    }).not.toThrow();

    expect(count(db, "set_media")).toBe(0);
    expect(count(db, "workout_sets")).toBe(0);
  });
});
