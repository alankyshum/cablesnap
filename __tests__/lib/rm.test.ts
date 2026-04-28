import { epley, brzycki, lombardi, average, percentageTable, suggest, suggestDuration } from "../../lib/rm";
import type { HistorySet, DurationHistorySet } from "../../lib/rm";

describe("1RM formulas", () => {
  it("epley handles base, multi-rep, zero weight, and high reps", () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 10)).toBeCloseTo(133.33, 1);
    expect(epley(0, 5)).toBe(0);
    expect(epley(100, 30)).toBe(200);
  });

  it("brzycki handles base, multi-rep, high-rep breakdown, and zero weight", () => {
    expect(brzycki(100, 1)).toBe(100);
    expect(brzycki(100, 10)).toBeCloseTo(133.33, 1);
    expect(brzycki(100, 37)).toBe(100);
    expect(brzycki(100, 40)).toBe(100);
    expect(brzycki(0, 5)).toBe(0);
  });

  it("lombardi handles base, power function, and zero weight", () => {
    expect(lombardi(100, 1)).toBe(100);
    expect(lombardi(100, 10)).toBeCloseTo(125.89, 1);
    expect(lombardi(0, 5)).toBe(0);
  });

  it("average combines all three formulas and agrees at 1 rep", () => {
    const e = epley(100, 10);
    const b = brzycki(100, 10);
    const l = lombardi(100, 10);
    expect(average(100, 10)).toBeCloseTo((e + b + l) / 3, 1);
    expect(average(100, 1)).toBe(100);
  });

  it("percentageTable returns expected tiers, percentages, rounding and zero handling", () => {
    const t100 = percentageTable(100);
    expect(t100).toHaveLength(10);
    expect(t100.find((t) => t.pct === 50)!.weight).toBe(50);
    expect(t100.find((t) => t.pct === 80)!.weight).toBe(80);

    const t200 = percentageTable(200);
    expect(t200[0].pct).toBe(100);
    expect(t200[0].weight).toBe(200);
    expect(t200[0].reps).toBe("1");

    const t133 = percentageTable(133);
    expect(t133.find((t) => t.pct === 85)!.weight).toBe(113.1);

    const t0 = percentageTable(0);
    expect(t0.every((t) => t.weight === 0)).toBe(true);
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

  type SuggestCase = {
    name: string;
    sessions: Parameters<typeof makeSets>[0];
    step: number;
    bodyweight: boolean;
    expected:
      | { nullResult: true }
      | {
          nullResult?: false;
          type: "increase" | "maintain" | "rep_increase";
          weight?: number;
          reps?: number;
          reasonContains?: string;
        };
  };

  const cases: SuggestCase[] = [
    {
      name: "returns null with fewer than 2 sessions",
      sessions: [{ id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] }],
      step: 2.5,
      bodyweight: false,
      expected: { nullResult: true },
    },
    {
      name: "suggests weight increase when all sets completed",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "increase", weight: 102.5 },
    },
    {
      name: "suggests maintain when not all sets completed",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 6, completed: 0 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "maintain", weight: 100 },
    },
    {
      name: "suggests maintain when RPE >= 9.5",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8, rpe: 9.5 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "maintain", reasonContains: "RPE" },
    },
    {
      name: "does not suppress when RPE is below 9.5",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8, rpe: 8 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "increase" },
    },
    {
      name: "suggests maintain when weight decreased (deload)",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 90, reps: 8 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "maintain", reasonContains: "deload" },
    },
    {
      name: "suggests maintain when reps dropped",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 6 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { type: "maintain", reasonContains: "Reps dropped" },
    },
    {
      name: "uses custom step size",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 5,
      bodyweight: false,
      expected: { type: "increase", weight: 105 },
    },
    {
      name: "bodyweight: returns null for pure bodyweight (weight=0) since filter requires weight > 0",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }] },
        { id: "s1", started: 1000, sets: [{ weight: 0, reps: 8 }, { weight: 0, reps: 8 }] },
      ],
      step: 0,
      bodyweight: true,
      expected: { nullResult: true },
    },
    {
      name: "bodyweight: suggests rep increase for weighted bodyweight exercises",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 10, reps: 10 }, { weight: 10, reps: 10 }] },
        { id: "s1", started: 1000, sets: [{ weight: 10, reps: 8 }, { weight: 10, reps: 8 }] },
      ],
      step: 0,
      bodyweight: true,
      expected: { type: "rep_increase", reps: 11, weight: 0 },
    },
    {
      name: "bodyweight: suggests maintain for weighted bodyweight when not all sets completed",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 10, reps: 10 }, { weight: 10, reps: 8, completed: 0 }] },
        { id: "s1", started: 1000, sets: [{ weight: 10, reps: 8 }] },
      ],
      step: 0,
      bodyweight: true,
      expected: { type: "maintain" },
    },
    {
      name: "returns null when no attempted sets in last session",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 0, reps: 0 }] },
        { id: "s1", started: 1000, sets: [{ weight: 100, reps: 8 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { nullResult: true },
    },
    {
      name: "returns null when no attempted sets in prior session",
      sessions: [
        { id: "s2", started: 2000, sets: [{ weight: 100, reps: 8 }] },
        { id: "s1", started: 1000, sets: [{ weight: 0, reps: 0 }] },
      ],
      step: 2.5,
      bodyweight: false,
      expected: { nullResult: true },
    },
  ];

  it.each(cases)("$name", ({ sessions, step, bodyweight, expected }) => {
    const sets = makeSets(sessions);
    const result = suggest(sets, step, bodyweight);
    if ("nullResult" in expected && expected.nullResult) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    if ("type" in expected && expected.type) expect(result!.type).toBe(expected.type);
    if ("weight" in expected && expected.weight !== undefined) expect(result!.weight).toBe(expected.weight);
    if ("reps" in expected && expected.reps !== undefined) expect(result!.reps).toBe(expected.reps);
    if ("reasonContains" in expected && expected.reasonContains)
      expect(result!.reason).toContain(expected.reasonContains);
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

  type DCase = {
    name: string;
    sets: DurationHistorySet[];
    expected:
      | { nullResult: true }
      | { type: "increase" | "maintain"; duration: number; reasonContains?: string };
  };

  const cases: DCase[] = [
    { name: "returns null for empty history", sets: [], expected: { nullResult: true } },
    {
      name: "returns null when last session has only null durations",
      sets: [makeDSet({ duration_seconds: null }), makeDSet({ duration_seconds: null })],
      expected: { nullResult: true },
    },
    {
      name: "returns null when last session has only zero durations",
      sets: [makeDSet({ duration_seconds: 0 }), makeDSet({ duration_seconds: 0 })],
      expected: { nullResult: true },
    },
    {
      name: "suggests +5s increase when all sets completed",
      sets: [
        makeDSet({ duration_seconds: 60, completed: 1 }),
        makeDSet({ duration_seconds: 60, completed: 1 }),
      ],
      expected: { type: "increase", duration: 65, reasonContains: "increase" },
    },
    {
      name: "suggests maintain when not all sets completed",
      sets: [
        makeDSet({ duration_seconds: 60, completed: 1 }),
        makeDSet({ duration_seconds: 45, completed: 0 }),
      ],
      expected: { type: "maintain", duration: 60, reasonContains: "maintain" },
    },
    {
      name: "uses max duration from attempted sets for maintain suggestion",
      sets: [
        makeDSet({ duration_seconds: 30, completed: 1 }),
        makeDSet({ duration_seconds: 90, completed: 0 }),
      ],
      expected: { type: "maintain", duration: 90 },
    },
    {
      name: "uses most recent session only (highest started_at)",
      sets: [
        makeDSet({ session_id: "old", duration_seconds: 120, completed: 1, started_at: 1000 }),
        makeDSet({ session_id: "new", duration_seconds: 60, completed: 0, started_at: 2000 }),
      ],
      expected: { type: "maintain", duration: 60 },
    },
    {
      name: "increases from max of newest session when all completed",
      sets: [
        makeDSet({ session_id: "old", duration_seconds: 30, completed: 1, started_at: 1000 }),
        makeDSet({ session_id: "new", duration_seconds: 45, completed: 1, started_at: 2000 }),
        makeDSet({ session_id: "new", duration_seconds: 50, completed: 1, started_at: 2000 }),
      ],
      expected: { type: "increase", duration: 55, reasonContains: "increase" },
    },
    {
      name: "handles single set session",
      sets: [makeDSet({ duration_seconds: 90, completed: 1 })],
      expected: { type: "increase", duration: 95 },
    },
  ];

  it.each(cases)("$name", ({ sets, expected }) => {
    const result = suggestDuration(sets);
    if ("nullResult" in expected && expected.nullResult) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    expect(result!.type).toBe(expected.type);
    expect(result!.duration).toBe(expected.duration);
    if (expected.reasonContains) expect(result!.reason).toContain(expected.reasonContains);
  });
});
