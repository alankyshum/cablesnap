import {
  computeLongestStreak,
  withOpacity,
  mondayOf,
  formatTimeRemaining,
  formatPreviousPerformance,
  formatPreviousPerformanceAccessibility,
  computePrefillSets,
  isLikelyIsolation,
} from "../../lib/format";

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

function makeWeekTimestamps(weekOffsets: number[]): number[] {
  const now = new Date();
  const monday = mondayOf(now);
  return weekOffsets.map((offset) => monday + offset * ONE_WEEK + 12 * 60 * 60 * 1000);
}

describe("computeLongestStreak", () => {
  it("handles all streak scenarios correctly", () => {
    // Empty
    expect(computeLongestStreak([])).toBe(0);

    // Single workout
    expect(computeLongestStreak([Date.now()])).toBe(1);

    // 4 consecutive weeks
    expect(computeLongestStreak(makeWeekTimestamps([0, -1, -2, -3]))).toBe(4);

    // Longest streak with gaps: -10,-9,-8 (3), gap, -5,-4 (2), gap, 0 (1)
    expect(computeLongestStreak(makeWeekTimestamps([-10, -9, -8, -5, -4, 0]))).toBe(3);

    // Multiple workouts same week
    const monday = mondayOf(new Date());
    expect(computeLongestStreak([monday + 1000, monday + 86400000, monday + ONE_WEEK + 1000])).toBe(2);

    // Non-contiguous single weeks
    expect(computeLongestStreak(makeWeekTimestamps([-6, -4, -2, 0]))).toBe(1);

    // Long contiguous streak
    expect(computeLongestStreak(makeWeekTimestamps(Array.from({ length: 16 }, (_, i) => -i)))).toBe(16);

    // Longest at end
    expect(computeLongestStreak(makeWeekTimestamps([-8, -4, -3, -2, -1, 0]))).toBe(5);
  });
});

describe("withOpacity", () => {
  it("converts hex colors with various opacities", () => {
    expect(withOpacity("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(withOpacity("#00FF00", 1)).toBe("rgba(0, 255, 0, 1)");
    expect(withOpacity("#0000FF", 0)).toBe("rgba(0, 0, 255, 0)");
    expect(withOpacity("#6750A4", 0.7)).toBe("rgba(103, 80, 164, 0.7)");
  });
});

describe("formatTimeRemaining", () => {
  it("returns correct remaining time text for various scenarios", () => {
    // Normal case: 25 min remaining
    expect(formatTimeRemaining(3000, 1500)).toBe("~25 min left");
    // Ceil: 90 seconds remaining → ~2 min left
    expect(formatTimeRemaining(3000, 2910)).toBe("~2 min left");
    // Exactly 1 minute remaining
    expect(formatTimeRemaining(3000, 2940)).toBe("~1 min left");
    // Elapsed exceeds estimate → null
    expect(formatTimeRemaining(3000, 3100)).toBeNull();
    // Elapsed equals estimate → null
    expect(formatTimeRemaining(3000, 3000)).toBeNull();
    // Null estimate → null
    expect(formatTimeRemaining(null, 500)).toBeNull();
    // Zero estimate → null
    expect(formatTimeRemaining(0, 0)).toBeNull();
    // Negative estimate → null
    expect(formatTimeRemaining(-100, 0)).toBeNull();
    // Large remaining: 45 min left
    expect(formatTimeRemaining(5400, 2700)).toBe("~45 min left");
  });
});

describe("formatPreviousPerformance", () => {
  it("formats weighted, bodyweight, duration, null, and edge cases correctly", () => {
    // Weighted exercise in kg
    expect(formatPreviousPerformance({ setCount: 3, maxWeight: 80, maxReps: 8, isBodyweight: false }, "kg"))
      .toBe("Last: 3 sets \u00B7 80kg \u00D7 8");

    // Weighted with decimal weight
    expect(formatPreviousPerformance({ setCount: 4, maxWeight: 22.5, maxReps: 10, isBodyweight: false }, "kg"))
      .toBe("Last: 4 sets \u00B7 22.5kg \u00D7 10");

    // Weighted in lb
    expect(formatPreviousPerformance({ setCount: 3, maxWeight: 60, maxReps: 8, isBodyweight: false }, "lb"))
      .toBe("Last: 3 sets \u00B7 132.3lb \u00D7 8");

    // Bodyweight exercise
    expect(formatPreviousPerformance({ setCount: 3, maxWeight: 0, maxReps: 12, isBodyweight: true }, "kg"))
      .toBe("Last: 3 sets \u00B7 12 reps");

    // Duration exercise (>= 60s)
    expect(formatPreviousPerformance({ setCount: 3, maxWeight: 0, maxReps: 0, isBodyweight: false, maxDuration: 90 }, "kg"))
      .toBe("Last: 3 sets \u00B7 1:30");

    // Duration exercise (sub-minute)
    expect(formatPreviousPerformance({ setCount: 2, maxWeight: 0, maxReps: 0, isBodyweight: false, maxDuration: 45 }, "kg"))
      .toBe("Last: 2 sets \u00B7 45s");

    // Null input
    expect(formatPreviousPerformance(null, "kg")).toBeNull();

    // Zero sets
    expect(formatPreviousPerformance({ setCount: 0, maxWeight: 80, maxReps: 8, isBodyweight: false }, "kg")).toBeNull();

    // Single set (no plural)
    expect(formatPreviousPerformance({ setCount: 1, maxWeight: 100, maxReps: 5, isBodyweight: false }, "kg"))
      .toBe("Last: 1 set \u00B7 100kg \u00D7 5");

    // Accessibility label — weighted
    expect(formatPreviousPerformanceAccessibility({ setCount: 3, maxWeight: 80, maxReps: 8, isBodyweight: false }, "kg"))
      .toBe("Last session: 3 sets, best 80 kilograms for 8 reps");

    // Accessibility label — bodyweight
    expect(formatPreviousPerformanceAccessibility({ setCount: 3, maxWeight: 0, maxReps: 12, isBodyweight: true }, "kg"))
      .toBe("Last session: 3 sets, best 12 reps");

    // Accessibility label — duration
    expect(formatPreviousPerformanceAccessibility({ setCount: 2, maxWeight: 0, maxReps: 0, isBodyweight: false, maxDuration: 90 }, "kg"))
      .toBe("Last session: 2 sets, best 1 minute 30 seconds");

    // Accessibility — null
    expect(formatPreviousPerformanceAccessibility(null, "kg")).toBeNull();
  });
});

describe("computePrefillSets", () => {
  it("handles all prefill scenarios: normal, completed, filled, warmup, bodyweight, duration, extra sets", () => {
    // Normal: fills empty uncompleted sets positionally
    const result = computePrefillSets(
      [
        { id: "s1", weight: null, reps: null, completed: false, duration_seconds: null },
        { id: "s2", weight: null, reps: null, completed: false, duration_seconds: null },
      ],
      [
        { weight: 80, reps: 8, duration_seconds: null },
        { weight: 80, reps: 7, duration_seconds: null },
      ],
      "reps",
    );
    expect(result).toEqual([
      { setId: "s1", weight: 80, reps: 8, duration_seconds: null },
      { setId: "s2", weight: 80, reps: 7, duration_seconds: null },
    ]);

    // Completed sets are skipped
    const completed = computePrefillSets(
      [{ id: "s1", weight: 80, reps: 8, completed: true, duration_seconds: null }],
      [{ weight: 80, reps: 8, duration_seconds: null }],
      "reps",
    );
    expect(completed).toEqual([]);

    // Sets with values are skipped (not empty)
    const filled = computePrefillSets(
      [{ id: "s1", weight: 90, reps: 10, completed: false, duration_seconds: null }],
      [{ weight: 80, reps: 8, duration_seconds: null }],
      "reps",
    );
    expect(filled).toEqual([]);

    // Warmup sets skipped, working sets still match positionally
    const withWarmup = computePrefillSets(
      [
        { id: "w1", weight: null, reps: null, completed: false, duration_seconds: null, set_type: "warmup" },
        { id: "s1", weight: null, reps: null, completed: false, duration_seconds: null },
        { id: "s2", weight: null, reps: null, completed: false, duration_seconds: null },
      ],
      [
        { weight: 80, reps: 8, duration_seconds: null },
        { weight: 80, reps: 7, duration_seconds: null },
      ],
      "reps",
    );
    expect(withWarmup).toHaveLength(2);
    expect(withWarmup[0].setId).toBe("s1");
    expect(withWarmup[1].setId).toBe("s2");

    // Bodyweight: weight stays null
    const bw = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: null, reps: 12, duration_seconds: null }],
      "reps",
    );
    expect(bw).toEqual([{ setId: "s1", weight: null, reps: 12, duration_seconds: null }]);

    // Duration exercise
    const dur = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: null, reps: null, duration_seconds: 90 }],
      "duration",
    );
    expect(dur).toEqual([{ setId: "s1", weight: null, reps: null, duration_seconds: 90 }]);

    // Duration set already filled
    const durFilled = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: 60 }],
      [{ weight: null, reps: null, duration_seconds: 90 }],
      "duration",
    );
    expect(durFilled).toEqual([]);

    // More current sets than previous: extras stay empty
    const extra = computePrefillSets(
      [
        { id: "s1", weight: null, reps: null, completed: false, duration_seconds: null },
        { id: "s2", weight: null, reps: null, completed: false, duration_seconds: null },
        { id: "s3", weight: null, reps: null, completed: false, duration_seconds: null },
      ],
      [{ weight: 80, reps: 8, duration_seconds: null }],
      "reps",
    );
    expect(extra).toHaveLength(1);
    expect(extra[0].setId).toBe("s1");

    // Mixed: completed + filled + empty across positions
    const mixed = computePrefillSets(
      [
        { id: "s1", weight: 80, reps: 8, completed: true, duration_seconds: null },
        { id: "s2", weight: 90, reps: null, completed: false, duration_seconds: null },
        { id: "s3", weight: null, reps: null, completed: false, duration_seconds: null },
      ],
      [
        { weight: 80, reps: 8, duration_seconds: null },
        { weight: 80, reps: 7, duration_seconds: null },
        { weight: 80, reps: 6, duration_seconds: null },
      ],
      "reps",
    );
    // s1 completed → skip, s2 has weight → skip, s3 empty → fill from prev[2]
    expect(mixed).toEqual([{ setId: "s3", weight: 80, reps: 6, duration_seconds: null }]);

    // Progression: compound kg — +2.5kg
    const progCompound = computePrefillSets(
      [
        { id: "s1", weight: null, reps: null, completed: false, duration_seconds: null },
        { id: "s2", weight: null, reps: null, completed: false, duration_seconds: null },
      ],
      [
        { weight: 80, reps: 8, duration_seconds: null },
        { weight: 80, reps: 8, duration_seconds: null },
      ],
      "reps",
      { suggested: true, weightUnit: "kg", exerciseCategory: "chest" },
    );
    expect(progCompound).toEqual([
      { setId: "s1", weight: 82.5, reps: 8, duration_seconds: null },
      { setId: "s2", weight: 82.5, reps: 8, duration_seconds: null },
    ]);

    // Progression: isolation kg — +1.25kg
    const progIsolation = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: 10, reps: 12, duration_seconds: null }],
      "reps",
      { suggested: true, weightUnit: "kg", exerciseCategory: "arms" },
    );
    expect(progIsolation[0].weight).toBe(11.25);

    // No progression when suggested=false
    const noProgression = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: 80, reps: 8, duration_seconds: null }],
      "reps",
      { suggested: false, weightUnit: "kg", exerciseCategory: "chest" },
    );
    expect(noProgression[0].weight).toBe(80);

    // Progression: lbs increments — compound +5, isolation +2.5
    const progLbsCompound = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: 135, reps: 5, duration_seconds: null }],
      "reps",
      { suggested: true, weightUnit: "lb", exerciseCategory: "chest" },
    );
    expect(progLbsCompound[0].weight).toBe(140);

    const progLbsIso = computePrefillSets(
      [{ id: "s1", weight: null, reps: null, completed: false, duration_seconds: null }],
      [{ weight: 20, reps: 12, duration_seconds: null }],
      "reps",
      { suggested: true, weightUnit: "lb", exerciseCategory: "arms" },
    );
    expect(progLbsIso[0].weight).toBe(22.5);

    // isLikelyIsolation checks
    expect(isLikelyIsolation("arms")).toBe(true);
    expect(isLikelyIsolation("abs_core")).toBe(true);
    expect(isLikelyIsolation("chest")).toBe(false);
    expect(isLikelyIsolation(null)).toBe(false);
  });
});
