import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../../lib/db/migrations";

function wrapped(db: DatabaseSync) {
  return {
    execAsync: async (sql: string) => { db.exec(sql); },
    getAllAsync: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => db.prepare(sql).all(...(params ?? []) as never[]) as T[],
    getFirstAsync: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (db.prepare(sql).get(...(params ?? []) as never[]) as T | undefined) ?? null,
    runAsync: async (sql: string, params?: unknown[]) => ({ changes: Number(db.prepare(sql).run(...(params ?? []) as never[]).changes) }),
  };
}

describe("coach workout draft migration", () => {
  it("creates both tables, indexes, and remains idempotent", async () => {
    const db = new DatabaseSync(":memory:");
    await migrate(wrapped(db) as never);
    await migrate(wrapped(db) as never);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'coach_workout_%'").all() as { name: string }[];
    expect(tables.map((row) => row.name).sort()).toEqual([
      "coach_workout_draft_revisions",
      "coach_workout_drafts",
    ]);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_coach_workout_%'").all() as { name: string }[];
    expect(indexes.length).toBeGreaterThanOrEqual(2);
    const draftsSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'coach_workout_drafts'").get() as { sql: string };
    const revisionsSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'coach_workout_draft_revisions'").get() as { sql: string };
    expect(draftsSql.sql).toMatch(/ON DELETE CASCADE/i);
    expect(revisionsSql.sql).toMatch(/ON DELETE CASCADE/i);
  });

  it("cascades draft revisions and drafts when a coach session is deleted with foreign keys enabled", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    await migrate(wrapped(db) as never);
    db.exec("INSERT INTO coach_sessions (id, title, model_id, created_at, updated_at) VALUES ('s', 'S', 'm', 1, 1)");
    db.exec("INSERT INTO coach_workout_drafts (id, coach_session_id, source_kind, created_at, updated_at) VALUES ('d', 's', 'text', 1, 1)");
    db.exec("INSERT INTO coach_workout_draft_revisions (id, draft_id, version, canonical_draft, change_reason, created_at) VALUES ('r', 'd', 1, '{}', 'created', 1)");
    db.exec("DELETE FROM coach_sessions WHERE id = 's'");
    expect(db.prepare("SELECT COUNT(*) AS count FROM coach_workout_drafts").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM coach_workout_draft_revisions").get()).toEqual({ count: 0 });
  });
});
