import { epley, brzycki, lombardi, average, percentageTable, suggest, suggestDuration } from "../../lib/rm";
import type { HistorySet, DurationHistorySet } from "../../lib/rm";

describe("1RM formulas", () => {
  describe("epley", () => {
    it("returns weight at 1 rep", () => {
      expect(epley(100, 1)).toBe(100);
    });

    it("calculates correctly for multiple reps", () => {
      expect(epley(100, 10)).toBeCloseTo(133.33, 1);
    });

    it("handles zero weight", () => {
      expect(epley(0, 5)).toBe(0);
    });

    it("handles high reps", () => {
      expect(epley(100, 30)).toBe(200);
    });
  });

  describe("brzycki", () => {
    it("returns weight at 1 rep", () => {
      expect(brzycki(100, 1)).toBe(100);
    });

    it("calculates correctly for 10 reps", () => {
      expect(brzycki(100, 10)).toBeCloseTo(133.33, 1);
    });

    it("returns weight when reps >= 37 (formula breaks)", () => {
      expect(brzycki(100, 37)).toBe(100);
      expect(brzycki(100, 40)).toBe(100);
    });

    it("handles zero weight", () => {
      expect(brzycki(0, 5)).toBe(0);
    });
  });

  describe("lombardi", () => {
    it("returns weight at 1 rep", () => {
      expect(lombardi(100, 1)).toBe(100);
    });

    it("calculates using power function", () => {
      expect(lombardi(100, 10)).toBeCloseTo(125.89, 1);
    });

    it("handles zero weight", () => {
      expect(lombardi(0, 5)).toBe(0);
    });
  });

  describe("average", () => {
    it("averages all three formulas", () => {
      const e = epley(100, 10);
      const b = brzycki(100, 10);
      const l = lombardi(100, 10);
      expect(average(100, 10)).toBeCloseTo((e + b + l) / 3, 1);
    });

    it("all formulas agree at 1 rep", () => {
      expect(average(100, 1)).toBe(100);
    });
  });

  describe("percentageTable", () => {
    it("returns 10 tiers", () => {
      const table = percentageTable(100);
      expect(table).toHaveLength(10);
    });

    it("first tier is 100%", () => {
      const table = percentageTable(200);
      expect(table[0].pct).toBe(100);
      expect(table[0].weight).toBe(200);
      expect(table[0].reps).toBe("1");
    });

    it("weights are correctly computed percentages", () => {
      const table = percentageTable(100);
      expect(table.find((t) => t.pct === 50)!.weight).toBe(50);
      expect(table.find((t) => t.pct === 80)!.weight).toBe(80);
    });

    it("rounds weights to 1 decimal", () => {
      const table = percentageTable(133);
      const at85 = table.find((t) => t.pct === 85)!;
      expect(at85.weight).toBe(113.1);
    });

    it("handles zero ORM", () => {
      const table = percentageTable(0);
      expect(table.every((t) => t.weight === 0)).toBe(true);
    });
  });
});

describe("suggest (progressive overload)", () => {
  function makeSets(
    sessions: { id: string; started: number; sets: { weight: number; reps: number; rpe?: number | null; completed?: number }[] }[]
  ): HistorySet[] {
    return sessions.flatMap((s) =>
      s.sets.map((set) => ({
        session_id: s.id,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe ?? null,
        completed: set.completed ?? 1,
        started_at: s.started,
      }))
    );
  }

  it("returns null with fewer than 2 sessions", () => {
    const sets = makeSets([
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    expect(suggest(sets, 2.5, false)).toBeNull();
  });

  it("suggests weight increase when all sets completed", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("increase");
    expect(result!.weight).toBe(102.5);
  });

  it("suggests maintain when not all sets completed", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 6, completed: 0 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("maintain");
    expect(result!.weight).toBe(100);
  });

  it("suggests maintain when RPE >= 9.5", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8, rpe: 9.5 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("maintain");
    expect(result!.reason).toContain("RPE");
  });

  it("does not suppress when RPE is below 9.5", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8, rpe: 8 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("increase");
  });

  it("suggests maintain when weight decreased (deload)", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 90, reps: 8 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("maintain");
    expect(result!.reason).toContain("deload");
  });

  it("suggests maintain when reps dropped", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 6 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("maintain");
    expect(result!.reason).toContain("Reps dropped");
  });

  it("uses custom step size", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 5, false);
    expect(result!.weight).toBe(105);
  });

  describe("bodyweight mode", () => {
    it("returns null for pure bodyweight (weight=0) since filter requires weight > 0", () => {
      const sets = makeSets([
        { id: "s2", started: 2000, sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }] },
        { id: "s1", started: 1000, sets: [{ weight: 0, reps: 8 }, { weight: 0, reps: 8 }] },
      ]);
      const result = suggest(sets, 0, true);
      expect(result).toBeNull();
    });

    it("suggests rep increase for weighted bodyweight exercises", () => {
      const sets = makeSets([
        { id: "s2", started: 2000, sets: [{ weight: 10, reps: 10 }, { weight: 10, reps: 10 }] },
        { id: "s1", started: 1000, sets: [{ weight: 10, reps: 8 }, { weight: 10, reps: 8 }] },
      ]);
      const result = suggest(sets, 0, true);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("rep_increase");
      expect(result!.reps).toBe(11);
      expect(result!.weight).toBe(0);
    });

    it("suggests maintain for weighted bodyweight when not all sets completed", () => {
      const sets = makeSets([
        { id: "s2", started: 2000, sets: [{ weight: 10, reps: 10 }, { weight: 10, reps: 8, completed: 0 }] },
        { id: "s1", started: 1000, sets: [{ weight: 10, reps: 8 }] },
      ]);
      const result = suggest(sets, 0, true);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("maintain");
    });
  });

  it("returns null when no attempted sets in last session", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 0, reps: 0 }] },
      { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).toBeNull();
  });

  it("returns null when no attempted sets in prior session", () => {
    const sets = makeSets([
      { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }] },
      { id: "s1", started: 1000, sets: [{ weight: 0, reps: 0 }] },
    ]);
    const result = suggest(sets, 2.5, false);
    expect(result).toBeNull();
  });
});

// ---- suggestDuration ----

describe("suggestDuration", () => {
  function makeDSet(
    overrides: Partial<DurationHistorySet> = {},
  ): DurationHistorySet {
    return {
      session_id: "s1",
      duration_seconds: 60,
      completed: 1,
      started_at: 1000,
      ...overrides,
    };
  }

  it("returns null for empty history", () => {
    expect(suggestDuration([])).toBeNull();
  });

  it("returns null when last session has only null durations", () => {
    const sets = [
      makeDSet({ duration_seconds: null }),
      makeDSet({ duration_seconds: null }),
    ];
    expect(suggestDuration(sets)).toBeNull();
  });

  it("returns null when last session has only zero durations", () => {
    const sets = [
      makeDSet({ duration_seconds: 0 }),
      makeDSet({ duration_seconds: 0 }),
    ];
    expect(suggestDuration(sets)).toBeNull();
  });

  it("suggests +5s increase when all sets completed", () => {
    const sets = [
      makeDSet({ duration_seconds: 60, completed: 1 }),
      makeDSet({ duration_seconds: 60, completed: 1 }),
    ];
    const result = suggestDuration(sets);
    expect(result).toEqual({
      type: "increase",
      duration: 65,
      reason: expect.stringContaining("increase"),
    });
  });

  it("suggests maintain when not all sets completed", () => {
    const sets = [
      makeDSet({ duration_seconds: 60, completed: 1 }),
      makeDSet({ duration_seconds: 45, completed: 0 }),
    ];
    const result = suggestDuration(sets);
    expect(result).toEqual({
      type: "maintain",
      duration: 60,
      reason: expect.stringContaining("maintain"),
    });
  });

  it("uses max duration from attempted sets for maintain suggestion", () => {
    const sets = [
      makeDSet({ duration_seconds: 30, completed: 1 }),
      makeDSet({ duration_seconds: 90, completed: 0 }),
    ];
    const result = suggestDuration(sets);
    expect(result?.type).toBe("maintain");
    expect(result?.duration).toBe(90);
  });

  it("uses most recent session only (highest started_at)", () => {
    const sets = [
      // Older session: all completed at 120s
      makeDSet({ session_id: "old", duration_seconds: 120, completed: 1, started_at: 1000 }),
      // Newer session: not completed at 60s
      makeDSet({ session_id: "new", duration_seconds: 60, completed: 0, started_at: 2000 }),
    ];
    const result = suggestDuration(sets);
    expect(result?.type).toBe("maintain");
    expect(result?.duration).toBe(60);
  });

  it("increases from max of newest session when all completed", () => {
    const sets = [
      makeDSet({ session_id: "old", duration_seconds: 30, completed: 1, started_at: 1000 }),
      makeDSet({ session_id: "new", duration_seconds: 45, completed: 1, started_at: 2000 }),
      makeDSet({ session_id: "new", duration_seconds: 50, completed: 1, started_at: 2000 }),
    ];
    const result = suggestDuration(sets);
    expect(result).toEqual({
      type: "increase",
      duration: 55,
      reason: expect.stringContaining("increase"),
    });
  });

  it("handles single set session", () => {
    const sets = [makeDSet({ duration_seconds: 90, completed: 1 })];
    const result = suggestDuration(sets);
    expect(result?.type).toBe("increase");
    expect(result?.duration).toBe(95);
  });
});
