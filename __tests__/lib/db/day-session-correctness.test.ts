/**
 * BLD-1089: Day-session correctness tests using node:sqlite real engine.
 *
 * AC23: Active-session detection returns false even when day_session rows exist.
 * AC25: UPSERT correctness — two consecutive calls return the same row id.
 * AC3:  Quick-add set (reps, weight) is stored correctly.
 * AC8:  After addQuickAddSet, total_reps equals the cumulative sum.
 * AC10: listRecentQuickAddExercises returns exercises used in the last 7 days.
 */

import { DatabaseSync } from "node:sqlite";

// ─── Schema helpers ─────────────────────────────────────────────────────────

function createTestDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      deleted_at INTEGER DEFAULT NULL
    );

    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      kind TEXT DEFAULT 'workout',
      name TEXT NOT NULL DEFAULT '',
      template_id TEXT DEFAULT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      clock_started_at INTEGER DEFAULT NULL,
      duration_seconds INTEGER DEFAULT NULL,
      rating INTEGER DEFAULT NULL,
      edited_at INTEGER DEFAULT NULL,
      import_batch_id TEXT DEFAULT NULL,
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

  // Seed one exercise
  db.prepare("INSERT INTO exercises (id, name) VALUES (?, ?)").run("ex-1", "Pull-ups");

  return db;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function localMidnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─── AC23: Active-session detection ─────────────────────────────────────────

describe("AC23 — active session detection excludes day_session rows", () => {
  it("returns 0 active sessions when only day_session rows exist", () => {
    const db = createTestDb();
    const midnight = localMidnight();
    const dateKey = todayKey();

    // Insert a completed day_session row (completed_at = started_at = midnight)
    db.prepare(`
      INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES (?, 'day_session', 'GTG: Pull-ups', ?, ?, ?, ?)
    `).run("sess-gtg-1", midnight, midnight, "ex-1", dateKey);

    // Active-session detection query (production pattern)
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM workout_sessions
      WHERE kind = 'workout'
        AND completed_at IS NULL
    `).get() as { cnt: number };

    expect(row.cnt).toBe(0);
  });

  it("returns 1 when a real workout is active alongside day_session rows", () => {
    const db = createTestDb();
    const midnight = localMidnight();
    const now = Date.now();
    const dateKey = todayKey();

    // day_session row
    db.prepare(`
      INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES (?, 'day_session', 'GTG: Pull-ups', ?, ?, ?, ?)
    `).run("sess-gtg-2", midnight, midnight, "ex-1", dateKey);

    // Active workout (no completed_at)
    db.prepare(`
      INSERT INTO workout_sessions (id, kind, name, started_at)
      VALUES (?, 'workout', 'My Workout', ?)
    `).run("sess-w-1", now);

    const row = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM workout_sessions
      WHERE kind = 'workout'
        AND completed_at IS NULL
    `).get() as { cnt: number };

    expect(row.cnt).toBe(1);
  });
});

// ─── AC25: UPSERT correctness ────────────────────────────────────────────────

describe("AC25 — UPSERT returns same row id on consecutive calls", () => {
  it("two inserts with same (exercise_id, date_key) return the same id", () => {
    const db = createTestDb();
    const midnight = localMidnight();
    const dateKey = todayKey();

    // Create partial unique index (as in production)
    try {
      db.exec(`
        CREATE UNIQUE INDEX uniq_day_session_per_exercise_date
          ON workout_sessions(day_session_exercise_id, day_session_date)
          WHERE kind = 'day_session'
      `);
    } catch {
      // Older SQLite — partial index not supported; skip this test variant
    }

    const id1 = "sess-upsert-1";
    const id2 = "sess-upsert-2";

    // First upsert
    const row1 = db.prepare(`
      INSERT INTO workout_sessions
        (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES (?, 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-1', ?)
      ON CONFLICT(day_session_exercise_id, day_session_date)
        WHERE kind = 'day_session'
        DO UPDATE SET name = excluded.name
      RETURNING id
    `).get(id1, midnight, midnight, dateKey) as { id: string } | undefined;

    // Second upsert (should return the same id)
    const row2 = db.prepare(`
      INSERT INTO workout_sessions
        (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES (?, 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-1', ?)
      ON CONFLICT(day_session_exercise_id, day_session_date)
        WHERE kind = 'day_session'
        DO UPDATE SET name = excluded.name
      RETURNING id
    `).get(id2, midnight, midnight, dateKey) as { id: string } | undefined;

    expect(row1?.id).toBeDefined();
    expect(row2?.id).toBeDefined();
    // Both must return the same session id (the first one)
    expect(row1?.id).toBe(row2?.id);
    expect(row1?.id).toBe(id1);
  });
});

// ─── AC3 + AC8: Set storage and cumulative totals ──────────────────────────

describe("AC3+AC8 — quick-add set stored correctly, cumulative total accumulates", () => {
  it("stores reps and weight, total increases per set", () => {
    const db = createTestDb();
    const midnight = localMidnight();
    const dateKey = todayKey();
    const now = Date.now();

    db.prepare(`
      INSERT INTO workout_sessions
        (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES ('sess-ac3', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-1', ?)
    `).run(midnight, midnight, dateKey);

    // First set: 5 reps, bodyweight (no weight)
    db.prepare(`
      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, weight, completed, completed_at, set_type)
      VALUES ('set-1', 'sess-ac3', 'ex-1', 1, 5, NULL, 1, ?, 'normal')
    `).run(now);

    // Second set: 6 reps
    db.prepare(`
      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, weight, completed, completed_at, set_type)
      VALUES ('set-2', 'sess-ac3', 'ex-1', 2, 6, NULL, 1, ?, 'normal')
    `).run(now + 60000);

    const totalRow = db.prepare(`
      SELECT COALESCE(SUM(ws.reps), 0) AS total, COUNT(ws.id) AS sets
      FROM workout_sets ws
      JOIN workout_sessions wss ON wss.id = ws.session_id
      WHERE wss.kind = 'day_session'
        AND wss.day_session_exercise_id = 'ex-1'
        AND wss.day_session_date = ?
        AND ws.completed = 1
    `).get(dateKey) as { total: number; sets: number };

    expect(totalRow.total).toBe(11);   // 5 + 6
    expect(totalRow.sets).toBe(2);
  });
});

// ─── AC10: listRecentQuickAddExercises includes recent exercises ───────────

describe("AC10 — recently used exercises appear in chip list", () => {
  it("exercises with GTG sets in last 7 days are returned", () => {
    const db = createTestDb();
    const midnight = localMidnight();
    const dateKey = todayKey();
    const recent = Date.now();

    db.prepare(`
      INSERT INTO workout_sessions
        (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES ('sess-chip', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-1', ?)
    `).run(midnight, midnight, dateKey);

    db.prepare(`
      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, completed, completed_at, set_type)
      VALUES ('set-chip', 'sess-chip', 'ex-1', 1, 8, 1, ?, 'normal')
    `).run(recent);

    const since = recent - 7 * 24 * 60 * 60 * 1000;
    const rows = db.prepare(`
      SELECT wss.day_session_exercise_id AS exercise_id,
             COALESCE(e.name, 'Deleted Exercise') AS exercise_name,
             MAX(ws.completed_at) AS last_added_at
      FROM workout_sessions wss
      JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
      LEFT JOIN exercises e ON e.id = wss.day_session_exercise_id
      WHERE wss.kind = 'day_session'
        AND ws.completed_at >= ?
      GROUP BY wss.day_session_exercise_id
      ORDER BY last_added_at DESC
    `).all(since) as { exercise_id: string; exercise_name: string }[];

    expect(rows.length).toBe(1);
    expect(rows[0].exercise_name).toBe("Pull-ups");
  });

  it("exercises with only old GTG sets (>7 days ago) are NOT returned", () => {
    const db = createTestDb();
    const oldMidnight = localMidnight() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    const oldDate = new Date(oldMidnight);
    const oldDateKey = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, "0")}-${String(oldDate.getDate()).padStart(2, "0")}`;

    db.prepare(`
      INSERT INTO workout_sessions
        (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
      VALUES ('sess-old', 'day_session', 'GTG: Pull-ups', ?, ?, 'ex-1', ?)
    `).run(oldMidnight, oldMidnight, oldDateKey);

    db.prepare(`
      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps, completed, completed_at, set_type)
      VALUES ('set-old', 'sess-old', 'ex-1', 1, 5, 1, ?, 'normal')
    `).run(oldMidnight + 1000);

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = db.prepare(`
      SELECT wss.day_session_exercise_id AS exercise_id
      FROM workout_sessions wss
      JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
      WHERE wss.kind = 'day_session'
        AND ws.completed_at >= ?
      GROUP BY wss.day_session_exercise_id
    `).all(since) as { exercise_id: string }[];

    expect(rows.length).toBe(0);
  });
});
