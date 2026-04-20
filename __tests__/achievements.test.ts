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

describe("Achievement Definitions", () => {
  it("should have 18 achievements defined", () => {
    expect(ACHIEVEMENTS.length).toBe(18);
  });

  it("should have unique IDs", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should cover all 5 categories", () => {
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect(categories).toEqual(
      new Set(["consistency", "strength", "volume", "nutrition", "body"]),
    );
  });
});

describe("evaluateAchievements", () => {
  it("returns empty for fresh user with no data", () => {
    const ctx = emptyContext();
    const result = evaluateAchievements(ctx, new Set());
    expect(result).toHaveLength(0);
  });

  it("earns First Steps after 1 workout", () => {
    const ctx = { ...emptyContext(), totalWorkouts: 1, workoutDates: ["2026-01-01"] };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("first_steps");
  });

  it("earns Getting Started after 5 workouts", () => {
    const ctx = {
      ...emptyContext(),
      totalWorkouts: 5,
      workoutDates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("first_steps");
    expect(earned).toContain("getting_started");
  });

  it("skips already-earned achievements", () => {
    const ctx = { ...emptyContext(), totalWorkouts: 5, workoutDates: ["2026-01-01"] };
    const result = evaluateAchievements(ctx, new Set(["first_steps"]));
    const earned = result.map((r) => r.achievement.id);
    expect(earned).not.toContain("first_steps");
    expect(earned).toContain("getting_started");
  });

  it("earns PR Breaker with 1 PR", () => {
    const ctx = { ...emptyContext(), prCount: 1 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("pr_breaker");
  });

  it("earns Ton Club with 1000kg session volume", () => {
    const ctx = { ...emptyContext(), maxSessionVolume: 1000 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("ton_club");
  });

  it("earns Volume King with 100k lifetime volume", () => {
    const ctx = { ...emptyContext(), lifetimeVolume: 100000 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("volume_king");
  });

  it("earns Progress Pic with 1 photo", () => {
    const ctx = { ...emptyContext(), progressPhotoCount: 1 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("progress_pic");
  });

  it("earns Body Journal with 10 weight logs", () => {
    const ctx = { ...emptyContext(), bodyWeightCount: 10 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("body_journal");
  });

  it("earns Transformation with 5 measurement dates", () => {
    const ctx = { ...emptyContext(), bodyMeasurementCount: 5 };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("transformation");
  });

  it("earns Week Warrior with 7-day streak", () => {
    const ctx = {
      ...emptyContext(),
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
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("week_warrior");
  });

  it("does not earn Week Warrior with gap in dates", () => {
    const ctx = {
      ...emptyContext(),
      totalWorkouts: 6,
      workoutDates: [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-05", // gap
        "2026-01-06",
        "2026-01-07",
      ],
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).not.toContain("week_warrior");
  });

  it("earns Macro Tracker with 7 consecutive nutrition days", () => {
    const ctx = {
      ...emptyContext(),
      nutritionDays: [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
      ],
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("macro_tracker");
  });

  it("does not earn Macro Tracker with non-consecutive days", () => {
    const ctx = {
      ...emptyContext(),
      nutritionDays: [
        "2026-01-01",
        "2026-01-02",
        "2026-01-04", // gap
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
      ],
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).not.toContain("macro_tracker");
  });

  it("earns Monthly Grind with 4 consecutive weeks of 3+ sessions", () => {
    // 4 weeks, each with 3 sessions (Mon/Wed/Fri pattern)
    const ctx = {
      ...emptyContext(),
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
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("monthly_grind");
  });

  it("does not earn Monthly Grind with only 3 qualifying weeks", () => {
    const ctx = {
      ...emptyContext(),
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
    };
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).not.toContain("monthly_grind");
  });
});

describe("getAllAchievementProgress", () => {
  it("returns all 18 achievements", () => {
    const ctx = emptyContext();
    const progress = getAllAchievementProgress(ctx, new Map());
    expect(progress).toHaveLength(18);
  });

  it("shows 0% progress for empty context", () => {
    const ctx = emptyContext();
    const progress = getAllAchievementProgress(ctx, new Map());
    for (const p of progress) {
      expect(p.earned).toBe(false);
      expect(p.progress).toBe(0);
    }
  });

  it("shows earned achievement with earnedAt", () => {
    const ctx = emptyContext();
    const earnedMap = new Map([["first_steps", 1700000000000]]);
    const progress = getAllAchievementProgress(ctx, earnedMap);
    const firstSteps = progress.find((p) => p.achievement.id === "first_steps");
    expect(firstSteps?.earned).toBe(true);
    expect(firstSteps?.earnedAt).toBe(1700000000000);
    expect(firstSteps?.progress).toBe(1);
  });

  it("shows partial progress for Getting Started (3/5)", () => {
    const ctx = { ...emptyContext(), totalWorkouts: 3 };
    const progress = getAllAchievementProgress(ctx, new Map());
    const gettingStarted = progress.find((p) => p.achievement.id === "getting_started");
    expect(gettingStarted?.earned).toBe(false);
    expect(gettingStarted?.progress).toBeCloseTo(0.6);
  });

  it("caps progress at 1 even if over target", () => {
    const ctx = { ...emptyContext(), totalWorkouts: 10 };
    const progress = getAllAchievementProgress(ctx, new Map());
    const gettingStarted = progress.find((p) => p.achievement.id === "getting_started");
    // Not earned because it's not in the earnedMap, but progress should cap at 1
    expect(gettingStarted?.progress).toBe(1);
  });
});

describe("Edge cases", () => {
  it("handles duplicate workout dates for streak calculation", () => {
    // Multiple workouts on the same day should count as one day in streak
    const ctx = {
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
    const result = evaluateAchievements(ctx, new Set());
    const earned = result.map((r) => r.achievement.id);
    expect(earned).toContain("week_warrior");
  });

  it("handles zero nutrition/body data gracefully", () => {
    const ctx = emptyContext();
    const progress = getAllAchievementProgress(ctx, new Map());
    const nutri = progress.find((p) => p.achievement.id === "macro_tracker");
    const body = progress.find((p) => p.achievement.id === "body_journal");
    expect(nutri?.progress).toBe(0);
    expect(body?.progress).toBe(0);
  });
});

describe("getUserLevel", () => {
  it("0 achievements → Beginner, next=Regular, progress=0", () => {
    const result = getUserLevel(0);
    expect(result.current.name).toBe("Beginner");
    expect(result.next?.name).toBe("Regular");
    expect(result.progress).toBe(0);
  });

  it("3 achievements → Regular, next=Committed, progress=0", () => {
    const result = getUserLevel(3);
    expect(result.current.name).toBe("Regular");
    expect(result.next?.name).toBe("Committed");
    expect(result.progress).toBe(0);
  });

  it("4 achievements → Regular, next=Committed, progress=1/3", () => {
    const result = getUserLevel(4);
    expect(result.current.name).toBe("Regular");
    expect(result.next?.name).toBe("Committed");
    expect(result.progress).toBeCloseTo(1 / 3);
  });

  it("6 achievements → Committed, next=Athlete, progress=0", () => {
    const result = getUserLevel(6);
    expect(result.current.name).toBe("Committed");
    expect(result.next?.name).toBe("Athlete");
    expect(result.progress).toBe(0);
  });

  it("18 achievements → Legend, next=null, progress=1", () => {
    const result = getUserLevel(18);
    expect(result.current.name).toBe("Legend");
    expect(result.next).toBeNull();
    expect(result.progress).toBe(1);
  });

  it("17 achievements → Elite, next=Legend, progress=3/4", () => {
    const result = getUserLevel(17);
    expect(result.current.name).toBe("Elite");
    expect(result.next?.name).toBe("Legend");
    expect(result.progress).toBeCloseTo(3 / 4);
  });
});
