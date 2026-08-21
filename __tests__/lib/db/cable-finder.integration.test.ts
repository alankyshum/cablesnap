/** Regression test for Cable Finder against the migrated, real SQLite schema. */

import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../../lib/db/migrations";
import { getCableExercises } from "../../../lib/db/cable-finder";

type SqlParam = null | number | bigint | string | Uint8Array;

let mockRawDb: DatabaseSync;

function wrapDb(db: DatabaseSync) {
  return {
    execAsync: async (sql: string): Promise<void> => { db.exec(sql); },
    getAllAsync: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
      db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> =>
      (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

jest.mock("../../../lib/db/helpers", () => ({
  query: jest.fn((sql: string, params?: unknown[]) =>
    mockRawDb.prepare(sql).all(...((params ?? []) as SqlParam[]))),
}));

describe("Cable Finder migrated-schema integration", () => {
  beforeEach(async () => {
    mockRawDb = new DatabaseSync(":memory:");
    await migrate(wrapDb(mockRawDb) as Parameters<typeof migrate>[0]);
    mockRawDb.exec(`
      INSERT INTO exercises
        (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex-1', 'Cable Curl', 'arms', '["biceps"]', '["forearms"]', 'cable', 'Curl', 'beginner');
      INSERT INTO workout_sessions (id, name, started_at) VALUES ('session-1', 'Test', 100);
      INSERT INTO workout_sets
        (id, session_id, exercise_id, set_number, completed_at, mount_position)
      VALUES ('set-old', 'session-1', 'ex-1', 1, 100, 'low');
      INSERT INTO workout_sets
        (id, session_id, exercise_id, set_number, completed_at, mount_position)
      VALUES ('set-new', 'session-1', 'ex-1', 2, 200, 'high');
    `);
  });

  afterEach(() => mockRawDb.close());

  test("reads the latest per-set mount and does not reference removed columns", async () => {
    expect(() => mockRawDb.prepare(`
      SELECT id, mount_position, training_modes
      FROM exercises
    `).all()).toThrow(/no such column/);

    const result = await getCableExercises({ mountPosition: "high", attachment: null });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ex-1");
    expect(result[0].mount_position).toBe("high");
  });
});
