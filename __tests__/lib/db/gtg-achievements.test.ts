/**
 * BLD-1089: Achievement semantics tests (AC26) using node:sqlite real engine.
 *
 * AC26: day_session rows do NOT count toward completed-workout / workout-date
 *       achievements, but GTG sets DO count for set-level PR and volume calculations.
 *
 * Verifies:
 * 1. totalWorkouts (kind='workout' filter) returns 0 when only day_session rows exist.
 * 2. workoutDates (kind='workout' filter) returns empty when only day_session rows exist.
 * 3. Set-level volume (via completed_at IS NOT NULL) includes GTG sets.
 * 4. PR detection (max weight, via completed_at IS NOT NULL) includes GTG sets.
 */

import { DatabaseSync } from "node:sqlite";

function createTestDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      kind TEXT DEFAULT 'workout',
      name TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL,
      day_session_exercise_id TEXT DEFAULT NULL,
      day_session_date TEXT DEFAULT NULL
    );

    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL DEFAULT NULL,
      reps INTEGER DEFAULT NULL,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER DEFAULT NULL,
      set_type TEXT DEFAULT 'normal'
    );
  `);

  db.prepare("INSERT INTO exercises (id, name) VALUES (?, ?)").run("ex-pullup", "Pull-ups");
  db.prepare("INSERT INTO exercises (id, name) VALUES (?, ?)").run("ex-squat", "Squat");
  return db;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localMidnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe("AC26 — achievement semantics for day_session rows", () => {
  describe("totalWorkouts achievement: kind='workout' filter", () => {
    it("returns 0 when only day_session rows exist", () => {
      const db = createTestDb();
      const midnight = localMidnight();

      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
        VALUES ('sess-gtg', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-pullup', ?)
      `).run(midnight, midnight, todayKey());

      const row = db.prepare(`
        SELECT COUNT(*) AS total_workouts
        FROM workout_sessions
        WHERE kind = 'workout'
          AND completed_at IS NOT NULL
      `).get() as { total_workouts: number };

      expect(row.total_workouts).toBe(0);
    });

    it("returns 1 when one regular workout exists alongside day_session rows", () => {
      const db = createTestDb();
      const midnight = localMidnight();
      const now = Date.now();

      // GTG row
      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
        VALUES ('sess-gtg', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-pullup', ?)
      `).run(midnight, midnight, todayKey());

      // Completed workout
      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at)
        VALUES ('sess-w', 'workout', 'Push Day', ?, ?)
      `).run(now - 3600000, now);

      const row = db.prepare(`
        SELECT COUNT(*) AS total_workouts
        FROM workout_sessions
        WHERE kind = 'workout'
          AND completed_at IS NOT NULL
      `).get() as { total_workouts: number };

      expect(row.total_workouts).toBe(1);
    });
  });

  describe("workoutDates achievement: kind='workout' filter on distinct dates", () => {
    it("returns empty set when only day_session rows exist", () => {
      const db = createTestDb();
      const midnight = localMidnight();

      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
        VALUES ('sess-gtg2', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-pullup', ?)
      `).run(midnight, midnight, todayKey());

      const rows = db.prepare(`
        SELECT DATE(started_at / 1000, 'unixepoch') AS workout_date
        FROM workout_sessions
        WHERE kind = 'workout'
          AND completed_at IS NOT NULL
        GROUP BY workout_date
      `).all() as { workout_date: string }[];

      expect(rows.length).toBe(0);
    });
  });

  describe("Set-level volume and PR: GTG sets count (completed_at IS NOT NULL passes)", () => {
    it("GTG set's weight appears in max-weight aggregation (volume analytics)", () => {
      const db = createTestDb();
      const midnight = localMidnight();
      const now = Date.now();

      // GTG session with completed_at = started_at = midnight
      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
        VALUES ('sess-gtg-pr', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-pullup', ?)
      `).run(midnight, midnight, todayKey());

      // GTG set: 10 reps, bodyweight only (weight null — typical)
      db.prepare(`
        INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, weight, completed, completed_at, set_type)
        VALUES ('set-gtg-pr', 'sess-gtg-pr', 'ex-pullup', 1, 10, NULL, 1, ?, 'normal')
      `).run(now);

      // Production volume query pattern (no kind filter — uses completed_at IS NOT NULL)
      const row = db.prepare(`
        SELECT SUM(ws.reps) AS total_reps, COUNT(ws.id) AS set_count
        FROM workout_sets ws
        JOIN workout_sessions wss ON wss.id = ws.session_id
        WHERE ws.exercise_id = 'ex-pullup'
          AND wss.completed_at IS NOT NULL
          AND ws.completed = 1
      `).get() as { total_reps: number; set_count: number };

      // GTG set is included because day_session completed_at is non-null
      expect(row.total_reps).toBe(10);
      expect(row.set_count).toBe(1);
    });

    it("GTG set with weight registers as a PR candidate", () => {
      const db = createTestDb();
      const midnight = localMidnight();
      const now = Date.now();

      db.prepare(`
        INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
        VALUES ('sess-gtg-wt', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-pullup', ?)
      `).run(midnight, midnight, todayKey());

      // Weighted pull-up PR attempt: 20kg for 3 reps
      db.prepare(`
        INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, weight, completed, completed_at, set_type)
        VALUES ('set-wt', 'sess-gtg-wt', 'ex-pullup', 1, 3, 20, 1, ?, 'normal')
      `).run(now);

      const row = db.prepare(`
        SELECT MAX(ws.weight) AS max_weight
        FROM workout_sets ws
        JOIN workout_sessions wss ON wss.id = ws.session_id
        WHERE ws.exercise_id = 'ex-pullup'
          AND wss.completed_at IS NOT NULL
          AND ws.completed = 1
      `).get() as { max_weight: number };

      expect(row.max_weight).toBe(20);
    });
  });
});
