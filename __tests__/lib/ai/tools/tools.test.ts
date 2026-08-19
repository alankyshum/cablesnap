/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseSync } from "node:sqlite";
import { drizzle as proxyDrizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/lib/db/schema";

const mockGetDrizzle = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/lib/db/helpers", () => ({
  getDrizzle: (...args: unknown[]) => mockGetDrizzle(...args),
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { exerciseHistoryTool } from "@/lib/ai/tools/exercise-history";
import { nutritionMacrosTool } from "@/lib/ai/tools/nutrition-macros";
import { recentSessionsTool } from "@/lib/ai/tools/recent-sessions";

function createSeededDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, started_at INTEGER NOT NULL,
      completed_at INTEGER, duration_seconds INTEGER, rating INTEGER,
      kind TEXT NOT NULL DEFAULT 'workout', template_id TEXT, clock_started_at INTEGER,
      notes TEXT, program_day_id TEXT, edited_at INTEGER, import_batch_id TEXT,
      gym_id TEXT, gym_name_at_log TEXT, day_session_exercise_id TEXT, day_session_date TEXT
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL, weight REAL, reps INTEGER, completed INTEGER,
      completed_at INTEGER, rpe REAL, notes TEXT, set_type TEXT DEFAULT 'normal',
      cached_volume_kg REAL DEFAULT 0, cached_e1rm_kg REAL DEFAULT 0,
      bodyweight_modifier_kg REAL
    );
    CREATE TABLE daily_log (
      id TEXT PRIMARY KEY, food_entry_id TEXT NOT NULL, date TEXT NOT NULL,
      meal TEXT NOT NULL, servings REAL, logged_at INTEGER NOT NULL
    );
    CREATE TABLE food_entries (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, calories REAL NOT NULL,
      protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
      serving_size TEXT NOT NULL, is_favorite INTEGER, created_at INTEGER NOT NULL
    );
  `);
  const now = Date.now();
  db.prepare("INSERT INTO workout_sessions (id, name, started_at, completed_at, duration_seconds, rating) VALUES (?, ?, ?, ?, ?, ?)")
    .run("session-1", "Upper body", now - 86400000, now - 82800000, 3600, 5);
  db.prepare("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, rpe, cached_volume_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("set-1", "session-1", "bench", 1, 80, 8, 1, 8, 640);
  db.prepare("INSERT INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("food-1", "Oats", 300, 10, 50, 7, "1 bowl", now);
  db.prepare("INSERT INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("log-1", "food-1", new Date().toISOString().slice(0, 10), "breakfast", 2, now);
  return db;
}

function wireDb(db: DatabaseSync): void {
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...(params as any[])));
  mockGetDrizzle.mockResolvedValue(proxyDrizzle(async (sql: string, params: any[], method: string) => {
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    if (method === "get") return { rows: rows.length ? [Object.values(rows[0])] : [] };
    return { rows: rows.map((row) => Object.values(row)) };
  }, { schema }));
}

async function execute(toolValue: any, input: unknown): Promise<any> {
  return toolValue.execute(input);
}

describe("coach local-data tools", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createSeededDb();
    wireDb(db);
    jest.clearAllMocks();
    wireDb(db);
  });

  afterEach(() => db.close());

  it("returns bounded recent session fields from seeded SQLite", async () => {
    await expect(execute(recentSessionsTool, { limit: 5 })).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({ id: "session-1", name: "Upper body", set_count: 1 })],
    });
  });

  it("returns exercise history from seeded SQLite", async () => {
    await expect(execute(exerciseHistoryTool, { exerciseId: "bench", limit: 5 })).resolves.toEqual({
      ok: true,
      data: {
        history: [expect.objectContaining({ session_id: "session-1", max_weight: 80, max_reps: 8, total_reps: 8 })],
        e1rmTrend: [],
      },
    });
  });

  it("returns daily macro totals from seeded SQLite", async () => {
    await expect(execute(nutritionMacrosTool, { days: 7 })).resolves.toEqual({
      ok: true,
      data: [{ date: new Date().toISOString().slice(0, 10), calories: 600, protein: 20, carbs: 100, fat: 14 }],
    });
  });

  it.each([
    ["recent sessions", recentSessionsTool, {}],
    ["exercise history", exerciseHistoryTool, { exerciseId: "bench" }],
    ["nutrition macros", nutritionMacrosTool, {}],
  ])("returns a typed recoverable result when %s cannot read local data", async (_name, toolValue, input) => {
    mockQuery.mockRejectedValue(new Error("database unavailable"));
    mockGetDrizzle.mockRejectedValue(new Error("database unavailable"));
    await expect(execute(toolValue, input)).resolves.toEqual({
      ok: false,
      error: { kind: "local_data_unavailable", message: "Local fitness data could not be read." },
    });
  });
});
