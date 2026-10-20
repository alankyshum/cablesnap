// GH-964: unfinished exercise attempts must not replace the last completed attempt.

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { workoutSets, workoutSessions } from "../../../lib/db/schema";

type SqlValue = null | number | bigint | string | Uint8Array;

let rawDb: DatabaseSync;
let mockDrizzleDb: ReturnType<typeof drizzle>;

function executeRows(statement: StatementSync, params: unknown[]): unknown[][] {
  statement.setReturnArrays(true);
  return statement.all(...(params as SqlValue[])) as unknown as unknown[][];
}

function wrapDb(db: DatabaseSync) {
  return {
    prepareSync(sql: string) {
      const statement = db.prepare(sql);
      return {
        executeSync(params: unknown[] = []) {
          const result = statement.run(...(params as SqlValue[]));
          return {
            changes: Number(result.changes),
            lastInsertRowId: Number(result.lastInsertRowid),
            getAllSync: () => [] as unknown[],
            getFirstSync: () => null,
          };
        },
        executeForRawResultSync(params: unknown[] = []) {
          const rows = executeRows(statement, params);
          return { getAllSync: () => rows };
        },
      };
    },
  };
}

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(async () => mockDrizzleDb),
}));

jest.mock("../../../lib/media/form-clips", () => ({
  cascadeDeleteClipsForSets: jest.fn(async () => {}),
  cascadeDeleteClipsForSession: jest.fn(async () => {}),
}));

import { getPreviousSets, getPreviousSetsBatch } from "../../../lib/db/session-sets";

function seedRegressionFixture(): void {
  rawDb.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      kind TEXT DEFAULT 'workout'
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      set_type TEXT DEFAULT 'normal',
      duration_seconds INTEGER,
      rpe REAL,
      pulley_pin INTEGER,
      side TEXT
    );

    INSERT INTO workout_sessions VALUES
      ('completed-earlier', 'Earlier', 100, 300, 'workout'),
      ('unfinished-later', 'Later', 200, 400, 'workout'),
      ('abandoned', 'Abandoned', 250, NULL, 'workout'),
      ('day-session', 'Daily practice', 450, 450, 'day_session'),
      ('normal-before-day', 'Normal before day', 350, 350, 'workout'),
      ('current', 'Current', 300, 500, 'workout');

    INSERT INTO workout_sets VALUES
      ('earlier-1', 'completed-earlier', 'exercise-1', 1, 80, 8, 1, 'normal', NULL, NULL, NULL, NULL),
      ('earlier-2', 'completed-earlier', 'exercise-1', 2, 0, 0, 0, 'normal', NULL, NULL, NULL, NULL),
      ('later-1', 'unfinished-later', 'exercise-1', 1, 0, 0, 0, 'normal', NULL, NULL, NULL, NULL),
      ('abandoned-1', 'abandoned', 'exercise-1', 1, 95, 5, 1, 'normal', NULL, NULL, NULL, NULL),
      ('day-1', 'day-session', 'exercise-2', 1, 60, 12, 1, 'normal', NULL, NULL, NULL, NULL),
      ('normal-day-1', 'normal-before-day', 'exercise-2', 1, 55, 10, 1, 'normal', NULL, NULL, NULL, NULL),
      ('current-1', 'current', 'exercise-1', 1, 100, 5, 1, 'normal', NULL, NULL, NULL, NULL);
  `);
}

describe("previous completed exercise attempt", () => {
  beforeEach(() => {
    rawDb = new DatabaseSync(":memory:");
    mockDrizzleDb = drizzle(wrapDb(rawDb) as never, {
      schema: { workoutSets, workoutSessions },
    });
    seedRegressionFixture();
  });

  afterEach(() => rawDb.close());

  it("GH-964: getPreviousSets skips later incomplete, current, and abandoned sessions", async () => {
    await expect(getPreviousSets("exercise-1", "current")).resolves.toEqual([
      { set_number: 1, weight: 80, reps: 8 },
    ]);
  });

  it("GH-964: batch chooses the completed attempt but preserves its rows for progression", async () => {
    const result = await getPreviousSetsBatch(["exercise-1"], "current");

    expect(result["exercise-1"]).toEqual([
      expect.objectContaining({ set_number: 1, weight: 80, reps: 8, completed: true }),
      expect.objectContaining({ set_number: 2, weight: 0, reps: 0, completed: false }),
    ]);
  });

  it("GH-964: keeps completed day-session attempts eligible", async () => {
    const result = await getPreviousSetsBatch(["exercise-2"], "current");

    expect(result["exercise-2"]).toEqual([
      expect.objectContaining({ set_number: 1, weight: 60, reps: 12, completed: true }),
    ]);
  });
});
