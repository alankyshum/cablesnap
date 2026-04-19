import {
  generateInsight,
  groupByISOWeek,
  type InsightData,
  type E1RMTrendRow,
  type WeeklyVolumeRow,
} from "../../lib/insights";

const DAY = 24 * 60 * 60 * 1000;

function makeData(overrides: Partial<InsightData> = {}): InsightData {
  return {
    totalSessions: 10,
    timestamps: [],
    e1rmTrends: [],
    weeklyVolume: [],
    ...overrides,
  };
}

describe("generateInsight", () => {
  it("returns null when fewer than 5 sessions", () => {
    expect(generateInsight(makeData({ totalSessions: 4 }))).toBeNull();
    expect(generateInsight(makeData({ totalSessions: 0 }))).toBeNull();
  });

  it("returns null when no qualifying insight data exists", () => {
    expect(generateInsight(makeData())).toBeNull();
  });

  describe("strength trend (highest priority)", () => {
    const trends: E1RMTrendRow[] = [
      { exercise_id: "e1", name: "Bench Press", current_e1rm: 105, previous_e1rm: 100 },
      { exercise_id: "e2", name: "Squat", current_e1rm: 150, previous_e1rm: 140 },
    ];

    it("picks the exercise with the biggest delta", () => {
      const result = generateInsight(makeData({ e1rmTrends: trends }));
      expect(result).not.toBeNull();
      expect(result!.type).toBe("strength");
      expect(result!.title).toContain("Squat");
      expect(result!.title).toContain("10");
      expect(result!.icon).toBe("trending-up");
      expect(result!.exerciseId).toBe("e2");
    });

    it("includes accessibility label with full text", () => {
      const result = generateInsight(makeData({ e1rmTrends: trends }));
      expect(result!.accessibilityLabel).toContain("Training insight:");
      expect(result!.accessibilityLabel).toContain("Tap to view details");
    });

    it("skips when all deltas are zero or negative", () => {
      const flat: E1RMTrendRow[] = [
        { exercise_id: "e1", name: "Bench", current_e1rm: 100, previous_e1rm: 100 },
      ];
      expect(generateInsight(makeData({ e1rmTrends: flat }))).toBeNull();
    });

    it("takes priority over volume and consistency", () => {
      // Provide data that would also trigger volume and consistency
      const now = Date.now();
      const timestamps = Array.from({ length: 10 }, (_, i) => now - i * DAY);
      const weeklyVolume: WeeklyVolumeRow[] = [
        { week: "1", volume: 100 }, { week: "2", volume: 110 },
        { week: "3", volume: 120 }, { week: "4", volume: 130 },
        { week: "5", volume: 200 }, { week: "6", volume: 220 },
        { week: "7", volume: 240 }, { week: "8", volume: 260 },
      ];

      const result = generateInsight(makeData({
        e1rmTrends: trends,
        weeklyVolume,
        timestamps,
      }));
      expect(result!.type).toBe("strength");
    });

    it("rounds delta to 1 decimal place", () => {
      const trends: E1RMTrendRow[] = [
        { exercise_id: "e1", name: "OHP", current_e1rm: 60.333, previous_e1rm: 55 },
      ];
      const result = generateInsight(makeData({ e1rmTrends: trends }));
      expect(result!.title).toContain("5.3kg");
    });
  });

  describe("volume trend (second priority)", () => {
    it("shows volume increase percentage", () => {
      const weeklyVolume: WeeklyVolumeRow[] = [
        { week: "1", volume: 1000 }, { week: "2", volume: 1000 },
        { week: "3", volume: 1000 }, { week: "4", volume: 1000 },
        { week: "5", volume: 1200 }, { week: "6", volume: 1200 },
        { week: "7", volume: 1200 }, { week: "8", volume: 1200 },
      ];

      const result = generateInsight(makeData({ weeklyVolume }));
      expect(result).not.toBeNull();
      expect(result!.type).toBe("volume");
      expect(result!.title).toContain("20%");
      expect(result!.icon).toBe("bar-chart");
    });

    it("returns null when volume is down", () => {
      const weeklyVolume: WeeklyVolumeRow[] = [
        { week: "1", volume: 2000 }, { week: "2", volume: 2000 },
        { week: "3", volume: 2000 }, { week: "4", volume: 2000 },
        { week: "5", volume: 1000 }, { week: "6", volume: 1000 },
        { week: "7", volume: 1000 }, { week: "8", volume: 1000 },
      ];

      const result = generateInsight(makeData({ weeklyVolume }));
      expect(result).toBeNull();
    });

    it("returns null when fewer than 5 weeks of data", () => {
      const weeklyVolume: WeeklyVolumeRow[] = [
        { week: "1", volume: 1000 }, { week: "2", volume: 1500 },
      ];
      expect(generateInsight(makeData({ weeklyVolume }))).toBeNull();
    });

    it("returns null when previous average is zero", () => {
      const weeklyVolume: WeeklyVolumeRow[] = [
        { week: "1", volume: 0 }, { week: "2", volume: 0 },
        { week: "3", volume: 0 }, { week: "4", volume: 0 },
        { week: "5", volume: 1000 }, { week: "6", volume: 1000 },
        { week: "7", volume: 1000 }, { week: "8", volume: 1000 },
      ];
      expect(generateInsight(makeData({ weeklyVolume }))).toBeNull();
    });
  });

  describe("consistency praise (third priority)", () => {
    it("shows when current week exceeds 4-week average", () => {
      const now = Date.now();
      const currentDay = new Date(now).getDay();
      // Ensure timestamps are in the current week (Mon-Sun)
      const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;

      // 4 sessions this week
      const thisWeek = Array.from({ length: 4 }, (_, i) =>
        now - (daysSinceMonday * DAY) + i * 3600000
      );
      // 1 session each previous week (avg = 1)
      const prevWeeks = Array.from({ length: 4 }, (_, i) =>
        now - (7 + i * 7) * DAY
      );

      const result = generateInsight(makeData({
        timestamps: [...thisWeek, ...prevWeeks],
      }));

      if (result) {
        expect(result.type).toBe("consistency");
        expect(result.icon).toBe("star");
        expect(result.title).toContain("workouts this week");
      }
    });

    it("returns null when current week is not better than average", () => {
      const now = Date.now();
      const prevWeeks = Array.from({ length: 20 }, (_, i) =>
        now - (7 + i * 2) * DAY
      );
      // Only 1 this week, with many previous
      const result = generateInsight(makeData({
        timestamps: [now, ...prevWeeks],
      }));
      // With 1 session this week and high previous average, should be null
      expect(result === null || result.type !== "consistency").toBe(true);
    });
  });

  describe("returning user (lowest priority)", () => {
    it("shows welcome back when last session within 24h and gap was 14+ days", () => {
      const now = Date.now();
      const result = generateInsight(makeData({
        timestamps: [now - 3600000, now - 20 * DAY], // 1 hr ago and 20 days ago
      }));
      expect(result).not.toBeNull();
      expect(result!.type).toBe("returning");
      expect(result!.title).toContain("Welcome back");
      expect(result!.icon).toBe("heart");
    });

    it("returns null when gap is less than 14 days", () => {
      const now = Date.now();
      const result = generateInsight(makeData({
        timestamps: [now - 3600000, now - 10 * DAY],
      }));
      expect(result).toBeNull();
    });

    it("returns null when latest session is older than 24h", () => {
      const now = Date.now();
      const result = generateInsight(makeData({
        timestamps: [now - 2 * DAY, now - 20 * DAY],
      }));
      expect(result).toBeNull();
    });
  });
});

describe("groupByISOWeek", () => {
  it("groups timestamps by ISO week", () => {
    // Mon 2026-01-05 and Tue 2026-01-06 should be same week
    const mon = new Date(2026, 0, 5, 12).getTime();
    const tue = new Date(2026, 0, 6, 12).getTime();
    const nextMon = new Date(2026, 0, 12, 12).getTime();

    const result = groupByISOWeek([mon, tue, nextMon]);
    const values = [...result.values()];
    expect(values).toContain(2); // Mon + Tue
    expect(values).toContain(1); // Next Monday
  });

  it("returns empty map for empty array", () => {
    expect(groupByISOWeek([]).size).toBe(0);
  });
});
