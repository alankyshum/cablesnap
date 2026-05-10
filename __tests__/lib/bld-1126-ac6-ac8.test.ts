/**
 * BLD-1145: covers AC6 and AC8 from PLAN-BLD-1126.md
 *
 * AC6: When the user adds a set on a cable exercise with calibration,
 *      and the prior set had stack_marker recorded, the new set autofills
 *      using CURRENT resolveMarker(calibrations, marker) — NOT the prior
 *      set's stack_true_weight_at_log snapshot. The snapshot remains immutable.
 *
 * AC8: The session marker UX reads from session.gym_id (snapshotted at creation).
 *      Changing the global default gym mid-session does NOT affect the open
 *      session's gym_id. Existing stack_*_at_log columns are immutable.
 */

import { resolveMarker } from "../../lib/cable-stack";
import type { StackCalibrationRow } from "../../lib/db/schema";

// ── AC6: resolveMarker uses current calibrations, not historical snapshot ──

describe("BLD-1126 AC6 — autofill re-resolves weight from current calibrations", () => {
  it("resolveMarker with updated calibrations returns new weight (not historical snapshot)", () => {
    // Scenario: user previously logged marker 6 at 30 kg (historical snapshot)
    // Calibration is later updated: marker 6 now maps to 35 kg
    const historicalSnapshot = { stack_true_weight_at_log: 30 }; // immutable on the prior set row

    const updatedCalibrations: StackCalibrationRow[] = [
      { id: "c1", stack_id: "stack-1", marker: 6, true_weight: 35 },
    ];

    // Autofill uses resolveMarker with CURRENT calibrations
    const resolved = resolveMarker(updatedCalibrations, 6);
    expect(resolved).not.toBeNull();
    expect(resolved!.weight).toBe(35); // current calibration → 35 kg

    // Historical snapshot on prior set remains 30 kg (unchanged / immutable)
    expect(historicalSnapshot.stack_true_weight_at_log).toBe(30);

    // They differ — new set gets the current weight, prior set snapshot preserved
    expect(resolved!.weight).not.toBe(historicalSnapshot.stack_true_weight_at_log);
  });

  it("resolveMarker returns null when calibration row for marker is removed", () => {
    // Prior calibration had marker 6; user deleted it from settings
    const updatedCalibrations: StackCalibrationRow[] = [
      { id: "c2", stack_id: "stack-1", marker: 8, true_weight: 40 },
      // marker 6 is gone
    ];

    const resolved = resolveMarker(updatedCalibrations, 6);
    expect(resolved).toBeNull(); // no current calibration → skip autofill
  });

  it("resolveMarker uses the calibration row's true_weight verbatim (no rounding)", () => {
    const calibrations: StackCalibrationRow[] = [
      { id: "c3", stack_id: "stack-1", marker: 4, true_weight: 17.5 },
    ];

    const resolved = resolveMarker(calibrations, 4);
    expect(resolved!.weight).toBe(17.5); // fractional weights preserved
  });

  it("prior set stack_*_at_log snapshot is NOT affected by calibration update (immutability contract)", () => {
    // Simulate prior set snapshot (frozen at time of logging)
    const priorSetSnapshot = {
      stack_id: "stack-1",
      stack_marker: 6,
      stack_name_at_log: "Main Cable",
      stack_unit_at_log: "kg",
      stack_true_weight_at_log: 30,
    };

    // Calibration updated — new true_weight for marker 6
    const newCalibrations: StackCalibrationRow[] = [
      { id: "c4", stack_id: "stack-1", marker: 6, true_weight: 35 },
    ];

    const newResolved = resolveMarker(newCalibrations, priorSetSnapshot.stack_marker);

    // New set gets updated weight
    expect(newResolved!.weight).toBe(35);

    // Prior set snapshot is unchanged (the object we froze above)
    expect(priorSetSnapshot.stack_true_weight_at_log).toBe(30);
    expect(priorSetSnapshot.stack_name_at_log).toBe("Main Cable");
    expect(priorSetSnapshot.stack_unit_at_log).toBe("kg");
  });
});

// ── AC8: session.gym_id is snapshotted at creation and remains immutable ──

describe("BLD-1126 AC8 — session.gym_id snapshot immutability (DB contract)", () => {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

  function createTestDb() {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        kind TEXT DEFAULT 'workout',
        name TEXT DEFAULT '',
        started_at INTEGER NOT NULL,
        completed_at INTEGER DEFAULT NULL,
        gym_id TEXT DEFAULT NULL
      );
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    return db;
  }

  it("session.gym_id is frozen at creation — direct row query returns original gym_id", () => {
    const db = createTestDb();

    // Session created with gym_id = "gym-A" (snapshotted at creation)
    db.prepare(`INSERT INTO workout_sessions (id, kind, name, started_at, gym_id) VALUES (?, 'workout', 'W', ?, ?)`).run(
      "sess-1", Date.now(), "gym-A"
    );

    // Simulate global default gym change in settings (does NOT touch workout_sessions)
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('default_gym_id', ?)`).run("gym-B");

    // Query session — gym_id is still "gym-A" (unchanged)
    const session = db.prepare(`SELECT gym_id FROM workout_sessions WHERE id = ?`).get("sess-1") as { gym_id: string };
    expect(session.gym_id).toBe("gym-A");

    // Settings reflect "gym-B" but session is unaffected
    const setting = db.prepare(`SELECT value FROM app_settings WHERE key = 'default_gym_id'`).get() as { value: string };
    expect(setting.value).toBe("gym-B");
    expect(session.gym_id).not.toBe(setting.value); // session snapshot ≠ current default
  });

  it("existing set's stack_*_at_log columns remain immutable when calibration changes mid-session", () => {
    const db = createTestDb();
    db.exec(`
      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        stack_id TEXT DEFAULT NULL,
        stack_marker INTEGER DEFAULT NULL,
        stack_name_at_log TEXT DEFAULT NULL,
        stack_unit_at_log TEXT DEFAULT NULL,
        stack_true_weight_at_log REAL DEFAULT NULL
      );
      CREATE TABLE stack_calibrations (
        id TEXT PRIMARY KEY,
        stack_id TEXT NOT NULL,
        marker INTEGER NOT NULL,
        true_weight REAL NOT NULL
      );
    `);

    db.prepare(`INSERT INTO workout_sessions (id, kind, name, started_at, gym_id) VALUES (?, 'workout', 'W', ?, ?)`).run(
      "sess-2", Date.now(), "gym-A"
    );

    // Set logged with marker 6 at 30 kg (snapshot at log time)
    db.prepare(`INSERT INTO workout_sets (id, session_id, stack_id, stack_marker, stack_name_at_log, stack_unit_at_log, stack_true_weight_at_log) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      "set-1", "sess-2", "stack-1", 6, "Cable Stack", "kg", 30
    );

    // Calibration updated mid-session: marker 6 now maps to 35 kg
    db.prepare(`INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?)`).run(
      "cal-1", "stack-1", 6, 35
    );

    // The existing set's snapshot remains 30 kg (immutable)
    const setRow = db.prepare(`SELECT stack_true_weight_at_log, stack_name_at_log FROM workout_sets WHERE id = ?`).get("set-1") as { stack_true_weight_at_log: number; stack_name_at_log: string };
    expect(setRow.stack_true_weight_at_log).toBe(30);
    expect(setRow.stack_name_at_log).toBe("Cable Stack");

    // The current calibration has the new weight
    const cal = db.prepare(`SELECT true_weight FROM stack_calibrations WHERE stack_id = ? AND marker = ?`).get("stack-1", 6) as { true_weight: number };
    expect(cal.true_weight).toBe(35);

    // They differ — snapshot is NOT automatically updated
    expect(setRow.stack_true_weight_at_log).not.toBe(cal.true_weight);
  });
});
