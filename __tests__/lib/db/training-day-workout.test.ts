/**
 * Tests for lib/db/training-day-workout.ts — wasWorkoutDay / getWorkoutDaysInRange.
 *
 * Uses the same production-path testing pattern as streak-creep-production.test.ts:
 * node:sqlite in-memory database + mocked lib/db/helpers.query.
 *
 * Coverage targets:
 *   AC6 — GTG (kind='day_session') rows do NOT count as training days.
 *          A date with only GTG rows must be classified as a rest day.
 *          A date with both GTG and workout rows is a training day (workout wins).
 */

import { DatabaseSync } from "node:sqlite";

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { wasWorkoutDay, getWorkoutDaysInRange } from "../../../lib/db/training-day-workout";
import * as helpers from "../../../lib/db/helpers";

// ─── Schema + helpers ─────────────────────────────────────────────────────────

function createSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'workout',
      name TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL
    )
  `);
}

function midnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function insertSession(
  db: DatabaseSync,
  opts: { id: string; kind: string; dateStr: string; complete: boolean }
) {
  const ms = midnightMs(opts.dateStr);
  db.prepare(
    "INSERT INTO workout_sessions (id, kind, name, started_at, completed_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    opts.id,
    opts.kind,
    opts.kind === "day_session" ? "GTG" : "Workout",
    ms,
    opts.complete ? ms + 3_600_000 : null
  );
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let nodeDb: DatabaseSync;

beforeEach(() => {
  nodeDb = new DatabaseSync(":memory:");
  createSchema(nodeDb);

  // Wire the query mock to use the in-memory SQLite node:sqlite DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (helpers.query as jest.Mock).mockImplementation(async (sqlStr: string, params: any[]) =>
    nodeDb.prepare(sqlStr).all(...(params ?? []))
  );
});

afterEach(() => {
  jest.clearAllMocks();
  nodeDb.close();
});

// ─── wasWorkoutDay ────────────────────────────────────────────────────────────

describe("wasWorkoutDay()", () => {
  const DATE = "2026-07-01";

  it("returns false when no sessions exist for the date", async () => {
    expect(await wasWorkoutDay(DATE)).toBe(false);
  });

  it("returns false when only an incomplete workout exists (completed_at IS NULL)", async () => {
    insertSession(nodeDb, { id: "wo-incomplete", kind: "workout", dateStr: DATE, complete: false });
    expect(await wasWorkoutDay(DATE)).toBe(false);
  });

  it("returns true when a completed workout (kind='workout') exists", async () => {
    insertSession(nodeDb, { id: "wo-complete", kind: "workout", dateStr: DATE, complete: true });
    expect(await wasWorkoutDay(DATE)).toBe(true);
  });

  it("AC6: returns false when ONLY a GTG (kind='day_session') row exists — GTG must not count", async () => {
    insertSession(nodeDb, { id: "gtg-only", kind: "day_session", dateStr: DATE, complete: true });
    expect(await wasWorkoutDay(DATE)).toBe(false);
  });

  it("AC6: returns true when both GTG and workout rows exist on same date (workout wins)", async () => {
    insertSession(nodeDb, { id: "gtg", kind: "day_session", dateStr: DATE, complete: true });
    insertSession(nodeDb, { id: "wo",  kind: "workout",     dateStr: DATE, complete: true });
    expect(await wasWorkoutDay(DATE)).toBe(true);
  });

  it("returns false when workout exists on a different date", async () => {
    insertSession(nodeDb, { id: "wo-other", kind: "workout", dateStr: "2026-06-30", complete: true });
    expect(await wasWorkoutDay(DATE)).toBe(false);
  });

  it("handles multiple completed workouts on same date (still returns true)", async () => {
    insertSession(nodeDb, { id: "wo-1", kind: "workout", dateStr: DATE, complete: true });
    insertSession(nodeDb, { id: "wo-2", kind: "workout", dateStr: DATE, complete: true });
    expect(await wasWorkoutDay(DATE)).toBe(true);
  });
});

// ─── getWorkoutDaysInRange ────────────────────────────────────────────────────

describe("getWorkoutDaysInRange()", () => {
  it("returns empty set when no sessions exist in range", async () => {
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.size).toBe(0);
  });

  it("returns dates with completed workouts within range", async () => {
    insertSession(nodeDb, { id: "wo-1", kind: "workout", dateStr: "2026-07-02", complete: true });
    insertSession(nodeDb, { id: "wo-2", kind: "workout", dateStr: "2026-07-04", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-02")).toBe(true);
    expect(result.has("2026-07-04")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("AC6: excludes dates with only GTG (day_session) rows from the set", async () => {
    insertSession(nodeDb, { id: "gtg-1", kind: "day_session", dateStr: "2026-07-03", complete: true });
    insertSession(nodeDb, { id: "wo-1",  kind: "workout",     dateStr: "2026-07-04", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-03")).toBe(false); // GTG only → not included
    expect(result.has("2026-07-04")).toBe(true);  // workout → included
  });

  it("AC6: includes date that has both GTG and workout rows (workout wins)", async () => {
    insertSession(nodeDb, { id: "gtg", kind: "day_session", dateStr: "2026-07-03", complete: true });
    insertSession(nodeDb, { id: "wo",  kind: "workout",     dateStr: "2026-07-03", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-03")).toBe(true);
  });

  it("bounds are inclusive — includes start and end dates", async () => {
    insertSession(nodeDb, { id: "start", kind: "workout", dateStr: "2026-07-01", complete: true });
    insertSession(nodeDb, { id: "end",   kind: "workout", dateStr: "2026-07-07", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-01")).toBe(true);
    expect(result.has("2026-07-07")).toBe(true);
  });

  it("excludes dates outside the range", async () => {
    insertSession(nodeDb, { id: "before", kind: "workout", dateStr: "2026-06-30", complete: true });
    insertSession(nodeDb, { id: "after",  kind: "workout", dateStr: "2026-07-08", complete: true });
    insertSession(nodeDb, { id: "inside", kind: "workout", dateStr: "2026-07-04", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-06-30")).toBe(false);
    expect(result.has("2026-07-08")).toBe(false);
    expect(result.has("2026-07-04")).toBe(true);
  });

  it("excludes incomplete workouts (completed_at IS NULL)", async () => {
    insertSession(nodeDb, { id: "wo-incomplete", kind: "workout", dateStr: "2026-07-03", complete: false });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-03")).toBe(false);
  });

  it("deduplicates — multiple workouts on same date produce one entry in the set", async () => {
    insertSession(nodeDb, { id: "wo-a", kind: "workout", dateStr: "2026-07-03", complete: true });
    insertSession(nodeDb, { id: "wo-b", kind: "workout", dateStr: "2026-07-03", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-01", "2026-07-07");
    expect(result.has("2026-07-03")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("handles single-day range (startDateKey === endDateKey)", async () => {
    insertSession(nodeDb, { id: "wo", kind: "workout", dateStr: "2026-07-04", complete: true });
    const result = await getWorkoutDaysInRange("2026-07-04", "2026-07-04");
    expect(result.has("2026-07-04")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("returns empty set for single-day range with no workout", async () => {
    const result = await getWorkoutDaysInRange("2026-07-04", "2026-07-04");
    expect(result.size).toBe(0);
  });
});
