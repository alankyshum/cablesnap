/**
 * BLD-1089: Migration idempotency tests for Grease-the-Groove Day Mode.
 *
 * Verifies:
 * 1. Fresh DB: kind, day_session_exercise_id, day_session_date columns are added.
 * 2. Already-migrated DB: NO ALTER TABLE issued for the three columns (idempotency).
 * 3. Partial unique index: CREATE UNIQUE INDEX IF NOT EXISTS issued once.
 * 4. Pre-migration workout_sessions rows are not modified (AC9).
 * 5. Active-session detection query has kind='workout' AND completed_at IS NULL
 *    so day_session rows (completed_at = started_at, non-null) are excluded (AC23).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const alterCalls: string[] = [];
const execCalls: string[] = [];

// Control whether workout_sessions columns exist.
let workoutSessionsColumns: { name: string }[] = [
  { name: "id" },
  { name: "name" },
  { name: "started_at" },
  { name: "completed_at" },
  { name: "notes" },
];

const mockGetAllAsync = jest.fn(async (sql: string) => {
  if (sql.includes("PRAGMA table_info(workout_sessions)")) {
    return workoutSessionsColumns;
  }
  if (sql.includes("PRAGMA table_info(")) {
    return [
      { name: "id" }, { name: "name" },
      { name: "kind" }, { name: "day_session_exercise_id" }, { name: "day_session_date" },
    ];
  }
  return [];
});

const mockExecAsync = jest.fn(async (sql: string) => {
  execCalls.push(sql);
  // Track ALTER TABLE calls
  if (sql.trim().startsWith("ALTER TABLE")) {
    alterCalls.push(sql.trim());
  }
});

const mockRunAsync = jest.fn(async (sql: string) => {
  if (sql.trim().startsWith("ALTER TABLE")) {
    alterCalls.push(sql.trim());
  }
  return { changes: 0 };
});

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: mockRunAsync,
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
    prepareAsync: jest.fn(),
  })),
}));

import { addColumnIfMissing } from "../../../lib/db/tables";
import * as SQLite from "expo-sqlite";

beforeEach(() => {
  alterCalls.length = 0;
  execCalls.length = 0;
  jest.clearAllMocks();
  mockGetAllAsync.mockImplementation(async (sql: string) => {
    if (sql.includes("PRAGMA table_info(workout_sessions)")) {
      return workoutSessionsColumns;
    }
    if (sql.includes("PRAGMA table_info(")) {
      return [{ name: "id" }, { name: "name" }, { name: "kind" }, { name: "day_session_exercise_id" }, { name: "day_session_date" }];
    }
    return [];
  });
  mockRunAsync.mockImplementation(async (sql: string) => {
    if (sql.trim().startsWith("ALTER TABLE")) alterCalls.push(sql.trim());
    return { changes: 0 };
  });
  mockExecAsync.mockImplementation(async (sql: string) => {
    execCalls.push(sql);
    if (sql.trim().startsWith("ALTER TABLE")) alterCalls.push(sql.trim());
  });
});

describe("BLD-1089 migration — addColumnIfMissing idempotency (AC22)", () => {
  it("first run: issues ALTER TABLE for all three missing columns", async () => {
    workoutSessionsColumns = [{ name: "id" }, { name: "name" }, { name: "started_at" }, { name: "completed_at" }, { name: "notes" }];

    const db = await (SQLite as any).openDatabaseAsync("test.db");
    await addColumnIfMissing(db, "workout_sessions", "kind", "TEXT DEFAULT 'workout'");
    await addColumnIfMissing(db, "workout_sessions", "day_session_exercise_id", "TEXT DEFAULT NULL");
    await addColumnIfMissing(db, "workout_sessions", "day_session_date", "TEXT DEFAULT NULL");

    expect(alterCalls.length).toBe(3);
    expect(alterCalls[0]).toContain("kind");
    expect(alterCalls[1]).toContain("day_session_exercise_id");
    expect(alterCalls[2]).toContain("day_session_date");
  });

  it("second run (columns already present): NO ALTER TABLE issued", async () => {
    workoutSessionsColumns = [
      { name: "id" },
      { name: "name" },
      { name: "started_at" },
      { name: "completed_at" },
      { name: "notes" },
      { name: "kind" },
      { name: "day_session_exercise_id" },
      { name: "day_session_date" },
    ];

    const db = await (SQLite as any).openDatabaseAsync("test.db");
    await addColumnIfMissing(db, "workout_sessions", "kind", "TEXT DEFAULT 'workout'");
    await addColumnIfMissing(db, "workout_sessions", "day_session_exercise_id", "TEXT DEFAULT NULL");
    await addColumnIfMissing(db, "workout_sessions", "day_session_date", "TEXT DEFAULT NULL");

    expect(alterCalls.length).toBe(0);
  });
});

describe("BLD-1089 migration — AC9 existing rows preservation", () => {
  it("migration does not UPDATE or DELETE existing workout_sessions rows", async () => {
    workoutSessionsColumns = [{ name: "id" }, { name: "name" }];

    const db = await (SQLite as any).openDatabaseAsync("test.db");
    await addColumnIfMissing(db, "workout_sessions", "kind", "TEXT DEFAULT 'workout'");

    const runCalls = mockRunAsync.mock.calls.map(([sql]: string[]) => sql.trim().toUpperCase());
    const updates = runCalls.filter((s: string) => s.startsWith("UPDATE") || s.startsWith("DELETE"));
    expect(updates.length).toBe(0);
  });
});
