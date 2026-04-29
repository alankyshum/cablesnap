import {
  calculateStreaks,
  getMonthDays,
  getFirstDayOfWeek,
  generateCalendarGrid,
  getWeekDayLabels,
  formatMonthYear,
  dateToISO,
} from "../lib/db/calendar";

// --- calculateStreaks ---

describe("calculateStreaks", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 18)); // April 18, 2026
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 0/0 for empty array", () => {
    expect(calculateStreaks([])).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  // Single-date current/longest streak behavior
  it.each([
    ["only today",                     ["2026-04-18"],    1, 1],
    ["only yesterday",                 ["2026-04-17"],    1, 1],
    ["last workout 2 days ago breaks", ["2026-04-16"],    0, 1],
  ] as const)("single date: %s", (_label, dates, current, longest) => {
    const result = calculateStreaks([...dates]);
    expect(result.currentStreak).toBe(current);
    expect(result.longestStreak).toBe(longest);
  });

  // Multi-date streak computation: anchored today/yesterday, gaps, scattered
  it.each([
    [
      "consecutive streak from today",
      ["2026-04-18", "2026-04-17", "2026-04-16", "2026-04-15"],
      4,
      4,
    ],
    [
      "consecutive streak from yesterday",
      ["2026-04-17", "2026-04-16", "2026-04-15"],
      3,
      3,
    ],
    [
      "streak breaks with a gap (current=2, longest=3)",
      ["2026-04-18", "2026-04-17", "2026-04-15", "2026-04-14", "2026-04-13"],
      2,
      3,
    ],
    [
      "longest streak in the past with today=1",
      ["2026-04-18", "2026-04-10", "2026-04-09", "2026-04-08", "2026-04-07", "2026-04-06"],
      1,
      5,
    ],
    [
      "scattered single-day workouts",
      ["2026-04-18", "2026-04-14", "2026-04-10", "2026-04-05"],
      1,
      1,
    ],
  ] as const)("%s", (_label, dates, current, longest) => {
    const result = calculateStreaks([...dates]);
    expect(result.currentStreak).toBe(current);
    expect(result.longestStreak).toBe(longest);
  });
});

// --- getMonthDays ---

describe("getMonthDays", () => {
  it.each([
    ["January 2026 → 31",                  2026, 0,  31],
    ["February 2026 (non-leap) → 28",      2026, 1,  28],
    ["February 2024 (leap year) → 29",     2024, 1,  29],
    ["April 2026 → 30",                    2026, 3,  30],
  ] as const)("%s", (_label, year, month, expected) => {
    expect(getMonthDays(year, month)).toBe(expected);
  });
});

// --- getFirstDayOfWeek ---

describe("getFirstDayOfWeek", () => {
  it.each([
    // April 2026 starts on Wednesday (day 3 from Sunday=0)
    ["April 2026, Sunday-start → 3",                     2026, 3, 0, 3],
    // April 2026 starts on Wednesday; offset from Monday=1: (3-1+7)%7 = 2
    ["April 2026, Monday-start → 2",                     2026, 3, 1, 2],
    // June 2026 starts on Monday — equals weekStart, expect 0
    ["June 2026, Monday-start (matches start day) → 0",  2026, 5, 1, 0],
  ] as const)("%s", (_label, year, month, weekStart, expected) => {
    expect(getFirstDayOfWeek(year, month, weekStart)).toBe(expected);
  });
});

// --- generateCalendarGrid ---

describe("generateCalendarGrid", () => {
  it("generates correct grid for April 2026, Sunday & Monday start", () => {
    // April 2026 starts on Wednesday → 3 leading nulls (Sunday-start)
    const sun = generateCalendarGrid(2026, 3, 0);
    expect(sun.slice(0, 3)).toEqual([null, null, null]);
    expect(sun[3]).toBe(1);
    expect(sun[sun.length - 1]).toBe(30);
    expect(sun.length).toBe(33); // 3 + 30

    // Offset of 2 for Monday-start
    const mon = generateCalendarGrid(2026, 3, 1);
    expect(mon.slice(0, 2)).toEqual([null, null]);
    expect(mon[2]).toBe(1);
    expect(mon.length).toBe(32); // 2 + 30
  });

  it("handles February leap year (2024 → 29 days)", () => {
    const grid = generateCalendarGrid(2024, 1, 0);
    const days = grid.filter((d) => d !== null);
    expect(days.length).toBe(29);
  });
});

// --- getWeekDayLabels ---

describe("getWeekDayLabels", () => {
  it("returns Sunday-first and Monday-first label sets", () => {
    expect(getWeekDayLabels(0)).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
    expect(getWeekDayLabels(1)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
  });

  it("rotates correctly for arbitrary start day (Saturday=6)", () => {
    const labels = getWeekDayLabels(6);
    expect(labels[0]).toBe("Sat");
    expect(labels[6]).toBe("Fri");
  });
});

// --- formatMonthYear ---

describe("formatMonthYear", () => {
  it("formats April 2026 (locale-tolerant year check)", () => {
    expect(formatMonthYear(2026, 3)).toContain("2026");
  });
});

// --- dateToISO ---

describe("dateToISO", () => {
  it.each([
    ["pads single-digit month and day",   2026, 0,  5,  "2026-01-05"],
    ["renders double-digit month and day", 2026, 11, 25, "2026-12-25"],
    ["treats month index as 0-based",      2026, 3,  18, "2026-04-18"],
  ] as const)("%s", (_label, year, month, day, expected) => {
    expect(dateToISO(year, month, day)).toBe(expected);
  });
});
