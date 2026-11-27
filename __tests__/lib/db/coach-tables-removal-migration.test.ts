// BLD-5100 AC migration: existing coach tables and preferences are removed idempotently.
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../../lib/db/migrations";

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string) => { db.exec(sql); },
    getAllAsync: async <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params as never[]) as T[],
    getFirstAsync: async <T>(sql: string, params: unknown[] = []) => (db.prepare(sql).get(...params as never[]) as T | undefined) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => {
      const result = db.prepare(sql).run(...params as never[]);
      return { changes: Number(result.changes) };
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec("BEGIN");
      try { await fn(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

function tableExists(db: InstanceType<typeof DatabaseSync>, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

describe("BLD-5100 coach-table migration", () => {
  it("drops the legacy tables and settings from an existing database", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON");
    const db = wrapDb(raw);
    await migrate(db as never);

    raw.exec(`
      CREATE TABLE coach_sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, model_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE coach_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES coach_sessions(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE coach_workout_drafts (id TEXT PRIMARY KEY, coach_session_id TEXT NOT NULL REFERENCES coach_sessions(id), created_at INTEGER NOT NULL);
      CREATE TABLE coach_workout_draft_revisions (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES coach_workout_drafts(id), version INTEGER NOT NULL);
      INSERT INTO coach_sessions VALUES ('session', 'Legacy', 'model', 1, 1);
      INSERT INTO coach_messages VALUES ('message', 'session', 'user', 'private', 1);
      INSERT INTO coach_workout_drafts VALUES ('draft', 'session', 1);
      INSERT INTO coach_workout_draft_revisions VALUES ('revision', 'draft', 1);
      INSERT INTO app_settings (key, value) VALUES ('ai_coach.last_model_id', 'model');
      INSERT INTO app_settings (key, value) VALUES ('unrelated', 'keep');
    `);

    await expect(migrate(db as never)).resolves.toBeUndefined();
    await expect(migrate(db as never)).resolves.toBeUndefined();

    for (const table of ["coach_messages", "coach_workout_draft_revisions", "coach_workout_drafts", "coach_sessions"]) {
      expect(tableExists(raw, table)).toBe(false);
    }
    const settings = raw.prepare("SELECT key FROM app_settings ORDER BY key").all() as Array<{ key: string }>;
    expect(settings).toEqual([{ key: "unrelated" }]);
    raw.close();
  });
});
