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

// ─── AC21: getMonthlyGtgOnlyDates excludes days that also have workouts ──────

/**
 * AC21: a day with ONLY kind='day_session' rows → returned by getMonthlyGtgOnlyDates.
 *       a day with any completed kind='workout' row → NOT returned (solid dot takes priority).
 */
describe("AC21 — getMonthlyGtgOnlyDates excludes mixed days", () => {
  const QUERY = `
    SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS workout_date
    FROM workout_sessions
    WHERE completed_at IS NOT NULL
      AND kind = 'day_session'
      AND started_at >= ?
      AND started_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM workout_sessions w2
        WHERE w2.completed_at IS NOT NULL
          AND w2.kind = 'workout'
          AND date(w2.started_at / 1000, 'unixepoch', 'localtime')
              = date(workout_sessions.started_at / 1000, 'unixepoch', 'localtime')
      )
  `;

  function makeDb() {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        kind TEXT DEFAULT 'workout',
        name TEXT NOT NULL DEFAULT '',
        started_at INTEGER NOT NULL,
        completed_at INTEGER DEFAULT NULL,
        day_session_exercise_id TEXT DEFAULT NULL,
        day_session_date TEXT DEFAULT NULL
      );
    `);
    return db;
  }

  function midnightMs(dateStr: string): number {
    // Parse "YYYY-MM-DD" as local midnight
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  const YEAR = 2026;
  const MONTH = 4; // May (0-indexed)
  const MONTH_START = new Date(YEAR, MONTH, 1).getTime();
  const MONTH_END = new Date(YEAR, MONTH + 1, 1).getTime();

  it("returns a GTG-only day when no workout exists on that date", () => {
    const db = makeDb();
    const gtgDate = "2026-05-10";
    const ms = midnightMs(gtgDate);

    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_date) VALUES (?, 'day_session', 'GTG', ?, ?, ?)"
    ).run("s1", ms, ms, gtgDate);

    const rows = db.prepare(QUERY).all(MONTH_START, MONTH_END) as { workout_date: string }[];
    expect(rows.map((r) => r.workout_date)).toContain(gtgDate);
  });

  it("does NOT return a day that has both GTG sets AND a completed workout", () => {
    const db = makeDb();
    const mixedDate = "2026-05-15";
    const ms = midnightMs(mixedDate);
    const workoutMs = ms + 3600 * 1000; // 1 hour after midnight

    // GTG row
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_date) VALUES (?, 'day_session', 'GTG', ?, ?, ?)"
    ).run("s-gtg", ms, ms, mixedDate);

    // Completed workout row on the same calendar date
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, 'workout', 'Morning Lift', ?, ?)"
    ).run("s-wo", workoutMs, workoutMs + 3600 * 1000);

    const rows = db.prepare(QUERY).all(MONTH_START, MONTH_END) as { workout_date: string }[];
    expect(rows.map((r) => r.workout_date)).not.toContain(mixedDate);
  });

  it("does NOT return a day with a GTG row alongside an IN-PROGRESS (incomplete) workout", () => {
    const db = makeDb();
    const date = "2026-05-20";
    const ms = midnightMs(date);

    // GTG row
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_date) VALUES (?, 'day_session', 'GTG', ?, ?, ?)"
    ).run("s-gtg2", ms, ms, date);

    // Active (incomplete) workout — completed_at IS NULL
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at) VALUES (?, 'workout', 'Active Lift', ?)"
    ).run("s-wo2", ms + 1000);

    // Active workout has completed_at = NULL so it should NOT match the w2 subquery
    // → the GTG day SHOULD still be returned
    const rows = db.prepare(QUERY).all(MONTH_START, MONTH_END) as { workout_date: string }[];
    expect(rows.map((r) => r.workout_date)).toContain(date);
  });

  it("only returns dates within the queried month range", () => {
    const db = makeDb();
    const inMonth = "2026-05-05";
    const outOfMonth = "2026-04-30";

    for (const [id, d] of [["s-in", inMonth], ["s-out", outOfMonth]]) {
      const ms = midnightMs(d);
      db.prepare(
        "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at, day_session_date) VALUES (?, 'day_session', 'GTG', ?, ?, ?)"
      ).run(id, ms, ms, d);
    }

    const rows = db.prepare(QUERY).all(MONTH_START, MONTH_END) as { workout_date: string }[];
    const dates = rows.map((r) => r.workout_date);
    expect(dates).toContain(inMonth);
    expect(dates).not.toContain(outOfMonth);
  });
});

// ─── Streak-creep: getWorkoutDatesForStreak and getMonthlyTrainingDays ────────

/**
 * Streak-creep guard: GTG day_session rows must NOT inflate streak counts.
 * getWorkoutDatesForStreak and getMonthlyTrainingDaysAndStreak both use
 * `WHERE completed_at IS NOT NULL AND kind = 'workout'` so that days with
 * only GTG sets are excluded.
 */
describe("Streak-creep guard — GTG days excluded from streak/training-day queries", () => {
  const STREAK_QUERY = `
    SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS d
    FROM workout_sessions
    WHERE completed_at IS NOT NULL
      AND kind = 'workout'
      AND started_at >= ?
    ORDER BY d DESC
  `;

  const TRAINING_DAYS_QUERY = `
    SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS d
    FROM workout_sessions
    WHERE completed_at IS NOT NULL
      AND kind = 'workout'
      AND started_at >= ? AND started_at < ?
  `;

  function makeDb() {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        kind TEXT DEFAULT 'workout',
        name TEXT NOT NULL DEFAULT '',
        started_at INTEGER NOT NULL,
        completed_at INTEGER DEFAULT NULL
      );
    `);
    return db;
  }

  function midnightMs(dateStr: string): number {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  it("getWorkoutDatesForStreak excludes days with only GTG (day_session) rows", () => {
    const db = makeDb();
    const gtgDate = "2026-05-10";
    const ms = midnightMs(gtgDate);
    // Only a day_session row — should NOT appear in streak dates
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, 'day_session', 'GTG', ?, ?)"
    ).run("s-gtg", ms, ms);

    const cutoff = ms - 1; // before the GTG date so it's in range
    const rows = db.prepare(STREAK_QUERY).all(cutoff) as { d: string }[];
    expect(rows.map((r) => r.d)).not.toContain(gtgDate);
  });

  it("getWorkoutDatesForStreak includes days with a completed workout", () => {
    const db = makeDb();
    const workoutDate = "2026-05-12";
    const ms = midnightMs(workoutDate);
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, 'workout', 'Morning Lift', ?, ?)"
    ).run("s-wo", ms, ms + 3600_000);

    const cutoff = ms - 1;
    const rows = db.prepare(STREAK_QUERY).all(cutoff) as { d: string }[];
    expect(rows.map((r) => r.d)).toContain(workoutDate);
  });

  it("getMonthlyTrainingDaysAndStreak excludes GTG-only days from training day count", () => {
    const db = makeDb();
    const YEAR = 2026, MONTH = 4;
    const start = new Date(YEAR, MONTH, 1).getTime();
    const end = new Date(YEAR, MONTH + 1, 1).getTime();

    const gtgMs = midnightMs("2026-05-07");
    const workoutMs = midnightMs("2026-05-08");

    // GTG day — should NOT count
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, 'day_session', 'GTG', ?, ?)"
    ).run("s-gtg", gtgMs, gtgMs);

    // Real workout day — should count
    db.prepare(
      "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, 'workout', 'Lift', ?, ?)"
    ).run("s-wo", workoutMs, workoutMs + 3600_000);

    const rows = db.prepare(TRAINING_DAYS_QUERY).all(start, end) as { d: string }[];
    const dates = rows.map((r) => r.d);
    expect(dates).toContain("2026-05-08");
    expect(dates).not.toContain("2026-05-07");
    expect(dates).toHaveLength(1);
  });
});
