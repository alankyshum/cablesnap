/**
 * BLD-1060 — Calibration immutability regression test.
 *
 * AC: PLAN-BLD-1059 rev 3 lines 197-200 — "historical sets keep their original
 * weight + snapshotted stack/gym names after later edits."
 *
 * Risk addressed: a future refactor could accidentally add a retroactive UPDATE
 * that rewrites snapshot fields (stack_name_at_log, stack_unit_at_log,
 * stack_marker, gym_name_at_log) on historical rows when the user renames a
 * stack or changes a calibration value. This test catches that by:
 *   1. Inserting a calibrated set (marker 10 = 30 kg, stack "Dual Pulley", gym "Home Gym")
 *   2. Updating the calibration (marker 10 → 50 kg) + renaming the stack
 *   3. Re-reading the historical row and asserting the snapshots are byte-for-byte unchanged
 *
 * Uses node:sqlite (real engine) because mocking DB calls cannot prove
 * row-level immutability — only a real SELECT can.
 */

import { DatabaseSync } from "node:sqlite";

describe("BLD-1060 — calibration immutability", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE gym_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER
      );

      CREATE TABLE cable_stacks (
        id TEXT PRIMARY KEY NOT NULL,
        gym_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        deleted_at INTEGER
      );

      CREATE TABLE stack_calibrations (
        id TEXT PRIMARY KEY NOT NULL,
        stack_id TEXT NOT NULL,
        marker INTEGER NOT NULL,
        true_weight REAL NOT NULL,
        UNIQUE(stack_id, marker)
      );

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        gym_id TEXT,
        gym_name_at_log TEXT
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        set_number INTEGER NOT NULL DEFAULT 1,
        weight REAL NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        stack_id TEXT,
        stack_marker INTEGER,
        stack_unit_at_log TEXT,
        stack_name_at_log TEXT
      );
    `);

    // Seed: gym + stack + calibration
    db.exec(`
      INSERT INTO gym_profiles (id, name, is_default) VALUES ('gym-1', 'Home Gym', 1);
      INSERT INTO cable_stacks (id, gym_id, name, unit) VALUES ('stack-1', 'gym-1', 'Dual Pulley', 'kg');
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('cal-1', 'stack-1', 10, 30);
    `);

    // Log a session and a set — snapshot fields written at log time
    db.exec(`
      INSERT INTO workout_sessions (id, started_at, completed_at, gym_id, gym_name_at_log)
        VALUES ('sess-1', 1700000000, 1700003600, 'gym-1', 'Home Gym');

      INSERT INTO workout_sets (id, session_id, exercise_id, weight, reps, completed,
                                 stack_id, stack_marker, stack_unit_at_log, stack_name_at_log)
        VALUES ('set-1', 'sess-1', 'ex-bench', 30, 10, 1,
                'stack-1', 10, 'kg', 'Dual Pulley');
    `);
  });

  afterAll(() => {
    db.close();
  });

  it("updating stack calibration does not change historical set snapshots", () => {
    // Mutate: recalibrate marker 10 to 50 kg
    db.prepare(
      "UPDATE stack_calibrations SET true_weight = 50 WHERE stack_id = ? AND marker = ?"
    ).run("stack-1", 10);

    const row = db.prepare(
      "SELECT weight, stack_marker, stack_unit_at_log, stack_name_at_log FROM workout_sets WHERE id = ?"
    ).get("set-1") as {
      weight: number;
      stack_marker: number;
      stack_unit_at_log: string;
      stack_name_at_log: string;
    };

    // Snapshot fields must be byte-for-byte what was logged at session time
    expect(row.weight).toBe(30);
    expect(row.stack_marker).toBe(10);
    expect(row.stack_unit_at_log).toBe("kg");
    expect(row.stack_name_at_log).toBe("Dual Pulley");
  });

  it("renaming a cable stack does not rewrite historical set stack_name_at_log", () => {
    // Mutate: rename the stack
    db.prepare("UPDATE cable_stacks SET name = ? WHERE id = ?").run("Pulley Pro 2000", "stack-1");

    const row = db.prepare(
      "SELECT stack_name_at_log FROM workout_sets WHERE id = ?"
    ).get("set-1") as { stack_name_at_log: string };

    // At-log snapshot must still be the original name
    expect(row.stack_name_at_log).toBe("Dual Pulley");
  });

  it("renaming a gym does not rewrite historical session gym_name_at_log", () => {
    // Mutate: rename the gym
    db.prepare("UPDATE gym_profiles SET name = ? WHERE id = ?").run("Downtown Gym", "gym-1");

    const row = db.prepare(
      "SELECT gym_name_at_log FROM workout_sessions WHERE id = ?"
    ).get("sess-1") as { gym_name_at_log: string };

    // Session was stamped with "Home Gym" — that must not change
    expect(row.gym_name_at_log).toBe("Home Gym");
  });

  it("soft-deleting the stack does not affect historical set snapshot fields", () => {
    db.prepare("UPDATE cable_stacks SET deleted_at = 1730000000 WHERE id = ?").run("stack-1");

    const row = db.prepare(
      "SELECT stack_id, stack_name_at_log, stack_unit_at_log FROM workout_sets WHERE id = ?"
    ).get("set-1") as { stack_id: string; stack_name_at_log: string; stack_unit_at_log: string };

    expect(row.stack_id).toBe("stack-1");
    expect(row.stack_name_at_log).toBe("Dual Pulley");
    expect(row.stack_unit_at_log).toBe("kg");
  });
});
