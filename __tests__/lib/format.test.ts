import {
  computeLongestStreak,
  withOpacity,
  mondayOf,
} from "../../lib/format";

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

function makeWeekTimestamps(weekOffsets: number[]): number[] {
  const now = new Date();
  const monday = mondayOf(now);
  return weekOffsets.map((offset) => monday + offset * ONE_WEEK + 12 * 60 * 60 * 1000);
}

describe("computeLongestStreak", () => {
  it("returns 0 for empty array", () => {
    expect(computeLongestStreak([])).toBe(0);
  });

  it("returns 1 for a single workout", () => {
    const ts = [Date.now()];
    expect(computeLongestStreak(ts)).toBe(1);
  });

  it("returns correct streak for consecutive weeks", () => {
    // 4 consecutive weeks: current, -1, -2, -3
    const ts = makeWeekTimestamps([0, -1, -2, -3]);
    expect(computeLongestStreak(ts)).toBe(4);
  });

  it("finds longest streak with gaps", () => {
    // Weeks: -10,-9,-8 (3), gap, -5,-4 (2), gap, 0 (1)
    const ts = makeWeekTimestamps([-10, -9, -8, -5, -4, 0]);
    expect(computeLongestStreak(ts)).toBe(3);
  });

  it("handles multiple workouts in the same week", () => {
    const monday = mondayOf(new Date());
    // Two workouts in the same week, one the next week
    const ts = [monday + 1000, monday + 86400000, monday + ONE_WEEK + 1000];
    expect(computeLongestStreak(ts)).toBe(2);
  });

  it("handles non-contiguous single weeks", () => {
    // Every other week: -6, -4, -2, 0
    const ts = makeWeekTimestamps([-6, -4, -2, 0]);
    expect(computeLongestStreak(ts)).toBe(1);
  });

  it("handles a long contiguous streak", () => {
    const offsets = Array.from({ length: 16 }, (_, i) => -i);
    const ts = makeWeekTimestamps(offsets);
    expect(computeLongestStreak(ts)).toBe(16);
  });

  it("identifies longest streak at the end", () => {
    // Two separate streaks: -8 (1) and -4,-3,-2,-1,0 (5)
    const ts = makeWeekTimestamps([-8, -4, -3, -2, -1, 0]);
    expect(computeLongestStreak(ts)).toBe(5);
  });
});

describe("withOpacity", () => {
  it("converts hex color with opacity", () => {
    expect(withOpacity("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("handles full opacity", () => {
    expect(withOpacity("#00FF00", 1)).toBe("rgba(0, 255, 0, 1)");
  });

  it("handles zero opacity", () => {
    expect(withOpacity("#0000FF", 0)).toBe("rgba(0, 0, 255, 0)");
  });

  it("handles 70% opacity", () => {
    expect(withOpacity("#6750A4", 0.7)).toBe("rgba(103, 80, 164, 0.7)");
  });
});
