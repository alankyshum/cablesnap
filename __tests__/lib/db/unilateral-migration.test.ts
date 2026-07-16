/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../../lib/db/migrations";
import { createCoreTables, createExtensionTables } from "../../../lib/db/tables";
import { createScheduleAndIndexes } from "../../../lib/db/table-migrations";

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => {
      db.exec(sql);
    },
    getAllAsync: async <T = Row>(sql: string, _params?: unknown[]): Promise<T[]> => {
      return db.prepare(sql).all(...((_params ?? []) as SqlParam[])) as T[];
    },
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> => {
      return (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null;
    },
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

function createDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function columnExists(db: InstanceType<typeof DatabaseSync>, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

describe("Unilateral Migration & Structural Guards (BLD-3344)", () => {
  it("idempotently adds track_unilateral to exercises and side to workout_sets with CHECK constraint", async () => {
    const db = createDb();
    
    // 1. Build a full fresh database
    await createCoreTables(wrapDb(db) as any);
    await createScheduleAndIndexes(wrapDb(db) as any);
    await createExtensionTables(wrapDb(db) as any);

    // 2. Drop the newly added unilateral columns to simulate pre-migration upgrade state
    db.exec("ALTER TABLE exercises DROP COLUMN track_unilateral;");
    db.exec("ALTER TABLE workout_sets DROP COLUMN side;");

    // 3. Insert some legacy test rows
    db.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex-1', 'Push Up', 'chest', 'chest', 'triceps', 'bodyweight', 'Push yourself up', 'beginner');
      
      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess-1', 'Test Workout', ${Date.now()});

      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps)
      VALUES ('set-1', 'sess-1', 'ex-1', 1, 0, 10);
    `);

    // 4. Run the migration
    await migrate(wrapDb(db) as any);

    // 5. Verify both new columns exist
    expect(columnExists(db, "exercises", "track_unilateral")).toBe(true);
    expect(columnExists(db, "workout_sets", "side")).toBe(true);

    // Verify default value for legacy rows (track_unilateral default 0, side default NULL)
    const legacyExercise = db.prepare("SELECT track_unilateral FROM exercises WHERE id = 'ex-1'").get() as { track_unilateral: number };
    expect(legacyExercise.track_unilateral).toBe(0);

    const legacySet = db.prepare("SELECT side FROM workout_sets WHERE id = 'set-1'").get() as { side: string | null };
    expect(legacySet.side).toBeNull();

    // Verify no legacy set got a side value
    const legacySetsWithSide = db.prepare("SELECT COUNT(*) as count FROM workout_sets WHERE side IS NOT NULL").get() as { count: number };
    expect(legacySetsWithSide.count).toBe(0);

    // Verify the CHECK constraint on side
    // Insert with valid values ('left', 'right', NULL) must succeed
    expect(() => {
      db.exec("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, side) VALUES ('set-L', 'sess-1', 'ex-1', 2, 'left')");
      db.exec("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, side) VALUES ('set-R', 'sess-1', 'ex-1', 2, 'right')");
      db.exec("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, side) VALUES ('set-B', 'sess-1', 'ex-1', 3, NULL)");
    }).not.toThrow();

    // Insert with invalid value must fail due to CHECK constraint
    expect(() => {
      db.exec("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, side) VALUES ('set-invalid', 'sess-1', 'ex-1', 4, 'both')");
    }).toThrow();
  });
});
