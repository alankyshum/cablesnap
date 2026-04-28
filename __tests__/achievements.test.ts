import {
  evaluateAchievements,
  getAllAchievementProgress,
  ACHIEVEMENTS,
  getUserLevel,
} from "../lib/achievements";
import type { AchievementContext } from "../lib/achievements";

function emptyContext(): AchievementContext {
  return {
    totalWorkouts: 0,
    workoutDates: [],
    prCount: 0,
    maxSessionVolume: 0,
    lifetimeVolume: 0,
    nutritionDays: [],
    bodyWeightCount: 0,
    progressPhotoCount: 0,
    bodyMeasurementCount: 0,
  };
}

function earnedIds(ctx: AchievementContext, alreadyEarned: Set<string> = new Set()): string[] {
  return evaluateAchievements(ctx, alreadyEarned).map((r) => r.achievement.id);
}

describe("Achievement Definitions", () => {
  it("has 18 unique achievements covering all 5 categories", () => {
    expect(ACHIEVEMENTS.length).toBe(18);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect(categories).toEqual(
      new Set(["consistency", "strength", "volume", "nutrition", "body"]),
    );
  });
});

describe("evaluateAchievements", () => {
  it("returns empty for fresh user with no data", () => {
    expect(earnedIds(emptyContext())).toHaveLength(0);
  });

  it("skips already-earned achievements", () => {
    const ctx = { ...emptyContext(), totalWorkouts: 5, workoutDates: ["2026-01-01"] };
    const earned = earnedIds(ctx, new Set(["first_steps"]));
    expect(earned).not.toContain("first_steps");
    expect(earned).toContain("getting_started");
  });

  // Single-threshold milestones: each context entry triggers exactly one achievement id.
  test.each([
    [
      "First Steps after 1 workout",
      { totalWorkouts: 1, workoutDates: ["2026-01-01"] },
      "first_steps",
    ],
    [
      "PR Breaker with 1 PR",
      { prCount: 1 },
      "pr_breaker",
    ],
    [
      "Ton Club with 1000kg session volume",
      { maxSessionVolume: 1000 },
      "ton_club",
    ],
    [
      "Volume King with 100k lifetime volume",
      { lifetimeVolume: 100000 },
      "volume_king",
    ],
    [
      "Progress Pic with 1 photo",
      { progressPhotoCount: 1 },
      "progress_pic",
    ],
    [
      "Body Journal with 10 weight logs",
      { bodyWeightCount: 10 },
      "body_journal",
    ],
    [
      "Transformation with 5 measurement dates",
      { bodyMeasurementCount: 5 },
      "transformation",
    ],
  ] as const)("earns %s", (_label, partial, expectedId) => {
    const earned = earnedIds({ ...emptyContext(), ...(partial as Partial<AchievementContext>) });
    expect(earned).toContain(expectedId);
  });

  it("earns Getting Started after 5 workouts (and First Steps too)", () => {
    const ctx = {
      ...emptyContext(),
      totalWorkouts: 5,
      workoutDates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
    };
    const earned = earnedIds(ctx);
    expect(earned).toContain("first_steps");
    expect(earned).toContain("getting_started");
  });

  // Date-sequence achievements: paired pass/fail cases for each id.
  test.each([
    {
      id: "week_warrior",
      passLabel: "7-day streak",
      passCtx: {
        totalWorkouts: 7,
        workoutDates: [
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-04",
          "2026-01-05",
          "2026-01-06",
          "2026-01-07",
        ],
      },
      failLabel: "gap in dates",
      failCtx: {
        totalWorkouts: 6,
        workoutDates: [
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-05", // gap
          "2026-01-06",
          "2026-01-07",
        ],
      },
    },
    {
      id: "macro_tracker",
      passLabel: "7 consecutive nutrition days",
      passCtx: {
        nutritionDays: [
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-04",
          "2026-01-05",
          "2026-01-06",
          "2026-01-07",
        ],
      },
      failLabel: "non-consecutive nutrition days",
      failCtx: {
        nutritionDays: [
          "2026-01-01",
          "2026-01-02",
          "2026-01-04", // gap
          "2026-01-05",
          "2026-01-06",
          "2026-01-07",
          "2026-01-08",
        ],
      },
    },
    {
      id: "monthly_grind",
      passLabel: "4 consecutive weeks of 3+ sessions",
      passCtx: {
        totalWorkouts: 12,
        workoutDates: [
          // Week 1 (Mon 2026-01-05, Wed 2026-01-07, Fri 2026-01-09)
          "2026-01-05",
          "2026-01-07",
          "2026-01-09",
          // Week 2
          "2026-01-12",
          "2026-01-14",
          "2026-01-16",
          // Week 3
          "2026-01-19",
          "2026-01-21",
          "2026-01-23",
          // Week 4
          "2026-01-26",
          "2026-01-28",
          "2026-01-30",
        ],
      },
      failLabel: "only 3 qualifying weeks",
      failCtx: {
        totalWorkouts: 9,
        workoutDates: [
          "2026-01-05",
          "2026-01-07",
          "2026-01-09",
          "2026-01-12",
          "2026-01-14",
          "2026-01-16",
          "2026-01-19",
          "2026-01-21",
          "2026-01-23",
        ],
      },
    },
  ])("$id: earns on $passLabel, not on $failLabel", ({ id, passCtx, failCtx }) => {
    expect(earnedIds({ ...emptyContext(), ...passCtx })).toContain(id);
    expect(earnedIds({ ...emptyContext(), ...failCtx })).not.toContain(id);
  });
});

describe("getAllAchievementProgress", () => {
  it("returns all 18 achievements with 0% progress for empty context", () => {
    const ctx = emptyContext();
    const progress = getAllAchievementProgress(ctx, new Map());
    expect(progress).toHaveLength(18);
    for (const p of progress) {
      expect(p.earned).toBe(false);
      expect(p.progress).toBe(0);
    }
  });

  it("shows earned achievement with earnedAt timestamp", () => {
    const ctx = emptyContext();
    const earnedMap = new Map([["first_steps", 1700000000000]]);
    const progress = getAllAchievementProgress(ctx, earnedMap);
    const firstSteps = progress.find((p) => p.achievement.id === "first_steps");
    expect(firstSteps?.earned).toBe(true);
    expect(firstSteps?.earnedAt).toBe(1700000000000);
    expect(firstSteps?.progress).toBe(1);
  });

  it("computes partial progress and caps at 1 when over target", () => {
    // 3/5 → 0.6 partial
    const partial = getAllAchievementProgress(
      { ...emptyContext(), totalWorkouts: 3 },
      new Map(),
    );
    const partialGS = partial.find((p) => p.achievement.id === "getting_started");
    expect(partialGS?.earned).toBe(false);
    expect(partialGS?.progress).toBeCloseTo(0.6);

    // 10/5 → caps at 1 (still not earned because not in earnedMap)
    const over = getAllAchievementProgress(
      { ...emptyContext(), totalWorkouts: 10 },
      new Map(),
    );
    const overGS = over.find((p) => p.achievement.id === "getting_started");
    expect(overGS?.progress).toBe(1);
  });
});

describe("Edge cases", () => {
  it("handles duplicate workout dates and zero nutrition/body data gracefully", () => {
    // Duplicate dates should still produce a valid 7-day streak.
    const dupCtx = {
      ...emptyContext(),
      totalWorkouts: 10,
      workoutDates: [
        "2026-01-01",
        "2026-01-01", // duplicate
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
      ],
    };
    expect(earnedIds(dupCtx)).toContain("week_warrior");

    // Zero nutrition/body data → 0 progress, no crash.
    const progress = getAllAchievementProgress(emptyContext(), new Map());
    expect(progress.find((p) => p.achievement.id === "macro_tracker")?.progress).toBe(0);
    expect(progress.find((p) => p.achievement.id === "body_journal")?.progress).toBe(0);
  });
});

describe("getUserLevel", () => {
  test.each([
    { count: 0, current: "Beginner", next: "Regular", progress: 0 },
    { count: 3, current: "Regular", next: "Committed", progress: 0 },
    { count: 4, current: "Regular", next: "Committed", progress: 1 / 3 },
    { count: 6, current: "Committed", next: "Athlete", progress: 0 },
    { count: 17, current: "Elite", next: "Legend", progress: 3 / 4 },
    { count: 18, current: "Legend", next: null, progress: 1 },
  ])(
    "$count achievements → $current (next=$next, progress≈$progress)",
    ({ count, current, next, progress }) => {
      const result = getUserLevel(count);
      expect(result.current.name).toBe(current);
      if (next === null) {
        expect(result.next).toBeNull();
      } else {
        expect(result.next?.name).toBe(next);
      }
      expect(result.progress).toBeCloseTo(progress);
    },
  );
});
