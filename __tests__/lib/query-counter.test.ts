/**
 * BLD-560: unit tests for lib/dev/query-counter.
 *
 * Mirrors the shape of __tests__/lib/render-counter.test.ts.
 */

import {
  countQuery,
  resetQueryCounts,
  dumpQueryCounts,
} from "../../lib/dev/query-counter";

describe("query-counter (BLD-560)", () => {
  beforeEach(() => {
    resetQueryCounts();
  });

  it("increments per kind and returns rows sorted desc by count", () => {
    countQuery("query");
    countQuery("query");
    countQuery("queryOne");

    const rows = dumpQueryCounts();
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ kind: "query", count: 2 });
    expect(rows[1]).toMatchObject({ kind: "queryOne", count: 1 });
    // qpm is a number >= 0 (can be very large under fake-clock or tiny
    // real-clock windows; we only assert shape here)
    expect(typeof rows[0].qpm).toBe("number");
  });

  it("sorts by count descending across multiple kinds", () => {
    countQuery("execute");
    for (let i = 0; i < 5; i++) countQuery("drizzle");
    countQuery("transaction");
    countQuery("transaction");

    const rows = dumpQueryCounts();
    expect(rows.map((r) => r.kind)).toEqual([
      "drizzle",
      "transaction",
      "execute",
    ]);
    expect(rows[0].count).toBe(5);
  });

  it("resetQueryCounts clears the map", () => {
    countQuery("query");
    resetQueryCounts();
    expect(dumpQueryCounts()).toEqual([]);
  });

  it("accepts free-form domain tags alongside known kinds", () => {
    countQuery("drizzle");
    countQuery("session-hot-path");
    countQuery("session-hot-path");

    const rows = dumpQueryCounts();
    expect(rows.map((r) => r.kind)).toEqual(["session-hot-path", "drizzle"]);
  });
});
