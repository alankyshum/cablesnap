import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../../lib/db/migrations";
import { createCoreTables, createExtensionTables } from "../../../lib/db/tables";
import { createScheduleAndIndexes } from "../../../lib/db/table-migrations";

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => { db.exec(sql); },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> =>
      db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> =>
      (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => ({
      changes: Number(db.prepare(sql).run(...((params ?? []) as SqlParam[])).changes),
    }),
  };
}

function hasColumn(db: InstanceType<typeof DatabaseSync>, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((item) => item.name === column);
}

describe("AI Coach model attribution migration", () => {
  it("upgrades a populated pre-model_id database and accepts attributed assistant rows", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    const db = wrapDb(raw);
    await createCoreTables(db as never);
    await createScheduleAndIndexes(db as never);
    await createExtensionTables(db as never);
    raw.exec(`
      INSERT INTO coach_sessions (id, title, model_id, created_at, updated_at)
      VALUES ('session-1', 'Legacy chat', 'stealth/ox-alpha', 1, 1);
      INSERT INTO coach_messages (id, session_id, role, content, created_at)
      VALUES ('legacy-user', 'session-1', 'user', 'Hello', 2);
      ALTER TABLE coach_messages DROP COLUMN model_id;
    `);

    expect(hasColumn(raw, "coach_messages", "model_id")).toBe(false);
    await expect(migrate(db as never)).resolves.toBeUndefined();
    expect(hasColumn(raw, "coach_messages", "model_id")).toBe(true);
    expect(raw.prepare("SELECT model_id FROM coach_messages WHERE id = 'legacy-user'").get())
      .toEqual({ model_id: null });
    expect(() => raw.prepare(`
      INSERT INTO coach_messages (id, session_id, role, content, model_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("assistant-1", "session-1", "assistant", "Recovered", "stealth/ox-alpha", 3))
      .not.toThrow();
  });
});
