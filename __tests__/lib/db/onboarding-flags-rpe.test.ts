/**
 * BLD-1111: RPE capture nudge one-shot flag wrappers.
 *
 * Verifies:
 * - hasSeenRpeCaptureNudge returns false initially, true after markRpeCaptureNudgeSeen.
 * - Round-trip persistence: marking seen persists across separate calls.
 * - markRpeCaptureNudgeSeen is idempotent (calling twice does not throw).
 */

// ─── Mock lib/db/helpers before any production imports ──────────────────────
jest.mock("../../../lib/db/helpers", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  getDrizzle: jest.fn(),
  getDatabase: jest.fn(),
}));

import { DatabaseSync } from "node:sqlite";
import { drizzle as proxyDrizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../lib/db/schema";
import { hasSeenRpeCaptureNudge, markRpeCaptureNudgeSeen } from "../../../lib/db/achievements";

const helpers = require("../../../lib/db/helpers") as {
  getDrizzle: jest.Mock;
};

function useDrizzleDb(db: InstanceType<typeof DatabaseSync>) {
  const proxyDb = proxyDrizzle(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (sql: string, params: any[], method: string) => {
      const stmt = db.prepare(sql);
      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }
      if (method === "get") {
        const row = stmt.get(...params) as Record<string, unknown> | undefined;
        // Must return `undefined` (not `[]`) when no row found.
        // drizzle sqlite-proxy mapGetResult checks `!rows` to detect "no row";
        // `![]` is false (empty array is truthy), which causes a false `{value:undefined}`
        // object to be returned instead of `undefined`.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { rows: (row ? Object.values(row) : null) as unknown as any[] };
      }
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema }
  );
  helpers.getDrizzle.mockResolvedValue(proxyDb);
}

function createTestDb(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return db;
}

describe("RPE capture nudge one-shot flags", () => {
  let db: InstanceType<typeof DatabaseSync>;

  beforeEach(() => {
    db = createTestDb();
    useDrizzleDb(db);
  });

  it("hasSeenRpeCaptureNudge returns false when key is absent", async () => {
    expect(await hasSeenRpeCaptureNudge()).toBe(false);
  });

  it("hasSeenRpeCaptureNudge returns true after markRpeCaptureNudgeSeen", async () => {
    await markRpeCaptureNudgeSeen();
    expect(await hasSeenRpeCaptureNudge()).toBe(true);
  });

  it("markRpeCaptureNudgeSeen is idempotent (calling twice does not throw)", async () => {
    await expect(markRpeCaptureNudgeSeen()).resolves.toBeUndefined();
    await expect(markRpeCaptureNudgeSeen()).resolves.toBeUndefined();
    expect(await hasSeenRpeCaptureNudge()).toBe(true);
  });
});
