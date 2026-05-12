/**
 * Streak-creep regression tests — production-path (BLD-1089).
 *
 * These tests call the ACTUAL production functions getWorkoutDatesForStreak()
 * and getMonthlyReport() through a jest mock of lib/db/helpers backed by a
 * real node:sqlite in-memory database.
 *
 * If `kind = 'workout'` is removed from either production query, GTG
 * day_session rows appear in streak/training-day counts and these tests fail.
 */

import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { getWorkoutDatesForStreak } from "../../../lib/db/calendar";
import { getMonthlyReport } from "../../../lib/db/monthly-report";
import * as helpers from "../../../lib/db/helpers";

let nodeDb: DatabaseSync;

function createSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'workout',
      name TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL,
      duration_seconds INTEGER DEFAULT NULL,
      day_session_exercise_id TEXT DEFAULT NULL,
      day_session_date TEXT DEFAULT NULL
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY, session_id TEXT, exercise_id TEXT,
      weight REAL, reps INTEGER, completed INTEGER DEFAULT 0,
      set_type TEXT DEFAULT 'normal',
      cached_volume_kg REAL DEFAULT 0,
      cached_e1rm_kg REAL DEFAULT 0
    );
    CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL, primary_muscles TEXT);
    CREATE TABLE body_weight (id TEXT PRIMARY KEY, weight REAL NOT NULL, date TEXT NOT NULL);
    CREATE TABLE macro_targets (id TEXT PRIMARY KEY, calories REAL);
    CREATE TABLE daily_log (id TEXT PRIMARY KEY, food_entry_id TEXT, date TEXT, servings REAL);
    CREATE TABLE food_entries (id TEXT PRIMARY KEY, calories REAL);
  `);
}

/**
 * Drizzle's sql`DISTINCT expr` fragment omits the column alias ("d") in the
 * generated SQL, so SQLite's ORDER BY d fails with "no such column: d".
 * We patch the SQL in the proxy callback to add the missing alias. This
 * patch does not touch the WHERE clause being tested.
 */
function makeDrizzleProxy(db: DatabaseSync) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return drizzle(async (sqlStr: string, params: any[], method: string) => {
    const fixedSql = sqlStr.replace(
      /^(select DISTINCT )(.+?)( from )/i,
      (_, pre, expr, post) => `${pre}${expr} AS "d"${post}`
    );
    try {
      const stmt = db.prepare(fixedSql);
      if (method === "run") {
        stmt.run(...(params ?? []));
        return { rows: [] };
      }
      const rows = stmt.all(...(params ?? [])) as Record<string, unknown>[];
      return { rows: rows.map((r) => Object.values(r)) };
    } catch {
      return { rows: [] };
    }
  });
}

function midnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

const RECENT_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

function insertSession(
  db: DatabaseSync,
  opts: { id: string; kind: string; dateStr: string; complete: boolean }
) {
  const ms = midnightMs(opts.dateStr);
  db.prepare(
    "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, ?, ?, ?, ?)"
  ).run(opts.id, opts.kind, opts.kind === "day_session" ? "GTG" : "Workout", ms,
    opts.complete ? ms + 3_600_000 : null);
}

beforeEach(() => {
  nodeDb = new DatabaseSync(":memory:");
  createSchema(nodeDb);
  (helpers.getDrizzle as jest.Mock).mockResolvedValue(makeDrizzleProxy(nodeDb));
  (helpers.query as jest.Mock).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (sqlStr: string, params: any[]) =>
      nodeDb.prepare(sqlStr).all(...(params ?? []))
  );
  (helpers.queryOne as jest.Mock).mockResolvedValue(null);
});

afterEach(() => {
  jest.clearAllMocks();
  nodeDb.close();
});

describe("getWorkoutDatesForStreak() — production function, kind='workout' guard", () => {
  it("excludes dates that have only GTG (day_session) rows", async () => {
    insertSession(nodeDb, { id: "s-gtg", kind: "day_session", dateStr: RECENT_DATE, complete: true });
    const dates = await getWorkoutDatesForStreak();
    expect(dates).not.toContain(RECENT_DATE);
  });

  it("includes dates with a completed workout row", async () => {
    insertSession(nodeDb, { id: "s-wo", kind: "workout", dateStr: RECENT_DATE, complete: true });
    const dates = await getWorkoutDatesForStreak();
    expect(dates).toContain(RECENT_DATE);
  });

  it("deduplicates: a date with both GTG and workout rows appears exactly once", async () => {
    insertSession(nodeDb, { id: "s-gtg", kind: "day_session", dateStr: RECENT_DATE, complete: true });
    insertSession(nodeDb, { id: "s-wo",  kind: "workout",     dateStr: RECENT_DATE, complete: true });
    const dates = await getWorkoutDatesForStreak();
    expect(dates.filter((d) => d === RECENT_DATE)).toHaveLength(1);
    expect(dates).toContain(RECENT_DATE);
  });
});

describe("getMonthlyReport() — trainingDays / longestStreak kind='workout' guard", () => {
  const YEAR = 2026;
  const MONTH_IDX = 4; // May

  const MAY_WO  = "2026-05-08";
  const MAY_GTG = "2026-05-09";
  const MAY_WO2 = "2026-05-10";

  it("returns trainingDays=0 and longestStreak=0 for a month with only GTG rows", async () => {
    insertSession(nodeDb, { id: "gtg-only", kind: "day_session", dateStr: MAY_GTG, complete: true });
    const report = await getMonthlyReport(YEAR, MONTH_IDX);
    expect(report.trainingDays).toBe(0);
    expect(report.longestStreak).toBe(0);
  });

  it("counts only workout rows toward trainingDays in a mixed month", async () => {
    insertSession(nodeDb, { id: "gtg-1", kind: "day_session", dateStr: MAY_GTG, complete: true });
    insertSession(nodeDb, { id: "wo-1",  kind: "workout",     dateStr: MAY_WO,  complete: true });
    insertSession(nodeDb, { id: "wo-2",  kind: "workout",     dateStr: MAY_WO2, complete: true });
    const report = await getMonthlyReport(YEAR, MONTH_IDX);
    expect(report.trainingDays).toBe(2);
  });

  it("derives longestStreak from workout dates only — GTG must not bridge a gap", async () => {
    // May 8 and May 10 are non-consecutive; GTG on May 9 must not bridge them.
    insertSession(nodeDb, { id: "wo-a",    kind: "workout",     dateStr: MAY_WO,  complete: true });
    insertSession(nodeDb, { id: "gtg-mid", kind: "day_session", dateStr: MAY_GTG, complete: true });
    insertSession(nodeDb, { id: "wo-b",    kind: "workout",     dateStr: MAY_WO2, complete: true });
    const report = await getMonthlyReport(YEAR, MONTH_IDX);
    expect(report.longestStreak).toBe(1);
  });
});
