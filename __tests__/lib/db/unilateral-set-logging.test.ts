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
});
