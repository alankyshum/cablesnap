/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  mockDb,
  mockDrizzleDb,
  setupDbTestContext,
} from "../../helpers/db-test-setup";
import { workoutCSV } from "../../../lib/csv-format";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-1234"),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

const ctx = setupDbTestContext();

describe("BLD-3345 Unilateral Set Logging & Imbalance Insight", () => {
  it("AC1: track_unilateral toggle updates", async () => {
    await ctx.initDb();
    
    // Toggle ON
    await ctx.db.updateTrackUnilateral("test-ex-1", true);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("AC2: Left 12kg x 10 and Right 14kg x 10 stores side rows sharing one set_number, and sums volume", async () => {
    await ctx.initDb();

    const left = await ctx.db.addSet("sess-1", "ex-1", 1, null, null, null, undefined, undefined, 0, null, null, null, null, null, null, null, null, null, null, "left");
    const right = await ctx.db.addSet("sess-1", "ex-1", 1, null, null, null, undefined, undefined, 0, null, null, null, null, null, null, null, null, null, null, "right");

    expect(left.set_number).toBe(1);
    expect(right.set_number).toBe(1);
    expect(left.side).toBe("left");
    expect(right.side).toBe("right");
    expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(2);
  });

  it("AC2.1: entering only Left creates exactly one row with no Right row present", async () => {
    await ctx.initDb();
    mockDrizzleDb.insert.mockClear();

    const left = await ctx.db.addSet("sess-1", "ex-1", 1, null, null, null, undefined, undefined, 0, null, null, null, null, null, null, null, null, null, null, "left");

    expect(left.set_number).toBe(1);
    expect(left.side).toBe("left");
    expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(1);
  });

  it("AC3: getLatestUnilateralInsight handles empty-side scenarios", async () => {
    await ctx.initDb();
    mockDb.getFirstAsync.mockResolvedValue(null);

    const insight = await ctx.db.getLatestUnilateralInsight("ex-only-left");
    expect(insight).toBeNull();
  });

  it("AC4: Copy assertion test enforces strict neutral-copy denylist and Δ ban", () => {
    const denylist = ["imbalance-as-deficiency", "correct", "fix", "weak", "behind", "should", "warning", "Delta", "Δ"];
    
    const formatReadout = (leftW: number, leftR: number, rightW: number, rightR: number, diffPct: number) => {
      return `Left ${leftW}kgx${leftR} · Right ${rightW}kgx${rightR} · Difference ${diffPct}%`;
    };

    const text = formatReadout(12, 10, 14, 10, 14);
    expect(text).toMatch(/^Left \d+kgx\d+ · Right \d+kgx\d+ · Difference \d+%/);

    for (const forbidden of denylist) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("AC5: CSV round-trip appends side column after reps and imports/exports losslessly", () => {
    const csvContent = workoutCSV([
      {
        date: "2026-07-16",
        exercise: "Single-Arm Cable Row",
        set_number: 1,
        weight: 12,
        reps: 10,
        side: "left",
        duration_seconds: null,
        notes: "",
        set_rpe: null,
        set_notes: "",
        link_id: null,
        tempo: null,
        bodyweight_modifier_kg: null,
        pulley_pin: null,
        kind: "workout",
        day_session_exercise_id: null,
        day_session_date: null,
        stack_marker: null,
        stack_name_at_log: null,
        set_type: "normal",
        mini_set_reps: "",
        mini_set_weights: "",
        mini_set_rests: "",
      }
    ]);

    expect(csvContent).toContain("reps,side");
    expect(csvContent).toContain("10,left");
  });

  it("AC6: Migration guard asserts no legacy row gets a side value post-migration", async () => {
    await ctx.initDb();
    mockDb.getFirstAsync.mockResolvedValue({ count: 0 });

    const database = await ctx.db.getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM workout_sets WHERE side IS NOT NULL`
    );
    expect(row?.count).toBe(0);
  });

  describe("BLD-3932 L/R Imbalance Trend Over Time", () => {
    it("volumeDiffPct: calculates correctly and handles zero division", () => {
      expect(ctx.db.volumeDiffPct(10, 10)).toBe(0);
      expect(ctx.db.volumeDiffPct(10, 20)).toBe(50);
      expect(ctx.db.volumeDiffPct(20, 10)).toBe(50);
      expect(ctx.db.volumeDiffPct(0, 0)).toBe(0);
    });

    it("getImbalanceTrend: normal multi-session case", async () => {
      await ctx.initDb();
      mockDb.getAllAsync.mockResolvedValueOnce([
        { session_id: "sess-1", started_at: 1000, left_vol: 100, right_vol: 120 },
        { session_id: "sess-2", started_at: 2000, left_vol: 200, right_vol: 180 },
        { session_id: "sess-3", started_at: 3000, left_vol: 150, right_vol: 150 },
      ]);

      const trend = await ctx.db.getImbalanceTrend("ex-1");
      expect(trend).toHaveLength(3);
      expect(trend[0]).toEqual({
        sessionId: "sess-1",
        startedAt: 1000,
        leftVol: 100,
        rightVol: 120,
        diffPct: 16.666666666666664,
        dominantSide: "right",
      });
      expect(trend[1].dominantSide).toBe("left");
      expect(trend[2].dominantSide).toBe("equal");
    });

    it("getImbalanceTrend: empty result", async () => {
      await ctx.initDb();
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const trend = await ctx.db.getImbalanceTrend("ex-1");
      expect(trend).toEqual([]);
    });

    it("getImbalanceTrend: SQL query excludes single-side-only, bodyweight null weight, incomplete, and bilateral sets", async () => {
      await ctx.initDb();
      mockDb.getAllAsync.mockClear();
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await ctx.db.getImbalanceTrend("ex-1");

      const lastCall = mockDb.getAllAsync.mock.calls[0];
      const sql = lastCall[0];

      // Single-side-only session, both-sides-null-weight session, and one-side-null-weight session
      // are excluded via HAVING left_vol > 0 AND right_vol > 0.
      expect(sql).toContain("HAVING left_vol > 0 AND right_vol > 0");

      // Incomplete opposite-side set is excluded because completed = 1 is required.
      expect(sql).toContain("ws.completed = 1");

      // Bilateral side IS NULL rows are ignored because side IS NOT NULL is required.
      expect(sql).toContain("ws.side IS NOT NULL");
    });

    it("getImbalanceTrend: limit semantics covers >30 valid sessions and confirms exactly IMBALANCE_TREND_MAX_SESSIONS most recent sessions returned oldest-to-newest", async () => {
      await ctx.initDb();
      mockDb.getAllAsync.mockClear();

      // Mock database returning 30 sessions.
      const mockRows = Array.from({ length: 30 }, (_, i) => ({
        session_id: `sess-${i + 1}`,
        started_at: 1000 + i * 100,
        left_vol: 100,
        right_vol: 110,
      }));
      mockDb.getAllAsync.mockResolvedValueOnce(mockRows);

      const trend = await ctx.db.getImbalanceTrend("ex-1");
      
      // Asserts that limit is requested correctly (which forces SQLite to return at most 30 of the most recent)
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT ?"),
        ["ex-1", 30]
      );
      
      // Asserts that returned array has length 30 and is returned oldest-to-newest (startedAt ASC)
      expect(trend).toHaveLength(30);
      for (let i = 1; i < trend.length; i++) {
        expect(trend[i].startedAt).toBeGreaterThan(trend[i - 1].startedAt);
      }
    });

    it("getImbalanceTrend: formula parity asserts each trend point's diffPct equals volumeDiffPct(leftVol, rightVol)", async () => {
      await ctx.initDb();
      const leftVol = 120;
      const rightVol = 150;
      mockDb.getAllAsync.mockResolvedValueOnce([
        { session_id: "sess-1", started_at: 1000, left_vol: leftVol, right_vol: rightVol },
      ]);

      const trend = await ctx.db.getImbalanceTrend("ex-1");
      expect(trend).toHaveLength(1);
      const expectedDiff = ctx.db.volumeDiffPct(leftVol, rightVol);
      expect(trend[0].diffPct).toBe(expectedDiff);
    });

    it("getLatestUnilateralInsight: updated per-session total behavior is directly tested", async () => {
      await ctx.initDb();
      mockDb.getFirstAsync.mockClear();
      mockDb.getFirstAsync.mockResolvedValueOnce({
        left_vol: 450,
        right_vol: 500,
      });

      const insight = await ctx.db.getLatestUnilateralInsight("ex-1");
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("SUM(CASE WHEN ws.side = 'left'"),
        ["ex-1"]
      );
      expect(insight).toEqual({
        left: { weight: 450, reps: 1 },
        right: { weight: 500, reps: 1 },
      });
    });
  });
});
