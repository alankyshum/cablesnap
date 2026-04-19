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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 0/0 for empty array", () => {
    const result = calculateStreaks([]);
    expect(result).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it("returns current streak of 1 when only today", () => {
    jest.setSystemTime(new Date(2026, 3, 18)); // April 18, 2026
    const result = calculateStreaks(["2026-04-18"]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it("returns current streak of 1 when only yesterday", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const result = calculateStreaks(["2026-04-17"]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it("returns current streak 0 when last workout was 2 days ago", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const result = calculateStreaks(["2026-04-16"]);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(1);
  });

  it("calculates consecutive streak from today", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const dates = [
      "2026-04-18",
      "2026-04-17",
      "2026-04-16",
      "2026-04-15",
    ];
    const result = calculateStreaks(dates);
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
  });

  it("calculates consecutive streak from yesterday", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const dates = [
      "2026-04-17",
      "2026-04-16",
      "2026-04-15",
    ];
    const result = calculateStreaks(dates);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  it("breaks streak with a gap", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const dates = [
      "2026-04-18",
      "2026-04-17",
      // gap on April 16
      "2026-04-15",
      "2026-04-14",
      "2026-04-13",
    ];
    const result = calculateStreaks(dates);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(3);
  });

  it("finds longest streak in the past", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const dates = [
      "2026-04-18",
      // gap
      "2026-04-10",
      "2026-04-09",
      "2026-04-08",
      "2026-04-07",
      "2026-04-06",
    ];
    const result = calculateStreaks(dates);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(5);
  });

  it("handles single-day workouts scattered", () => {
    jest.setSystemTime(new Date(2026, 3, 18));
    const dates = [
      "2026-04-18",
      "2026-04-14",
      "2026-04-10",
      "2026-04-05",
    ];
    const result = calculateStreaks(dates);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });
});

// --- getMonthDays ---

describe("getMonthDays", () => {
  it("returns 31 for January", () => {
    expect(getMonthDays(2026, 0)).toBe(31);
  });

  it("returns 28 for February 2026 (non-leap)", () => {
    expect(getMonthDays(2026, 1)).toBe(28);
  });

  it("returns 29 for February 2024 (leap year)", () => {
    expect(getMonthDays(2024, 1)).toBe(29);
  });

  it("returns 30 for April", () => {
    expect(getMonthDays(2026, 3)).toBe(30);
  });
});

// --- getFirstDayOfWeek ---

describe("getFirstDayOfWeek", () => {
  it("returns correct offset for Sunday start", () => {
    // April 2026 starts on Wednesday (day 3 from Sunday=0)
    expect(getFirstDayOfWeek(2026, 3, 0)).toBe(3);
  });

  it("returns correct offset for Monday start", () => {
    // April 2026 starts on Wednesday; offset from Monday=1: (3-1+7)%7 = 2
    expect(getFirstDayOfWeek(2026, 3, 1)).toBe(2);
  });

  it("returns 0 when month starts on week start day", () => {
    // June 2026 starts on Monday (day 1)
    expect(getFirstDayOfWeek(2026, 5, 1)).toBe(0);
  });
});

// --- generateCalendarGrid ---

describe("generateCalendarGrid", () => {
  it("generates correct grid for April 2026 Sunday start", () => {
    const grid = generateCalendarGrid(2026, 3, 0);
    // April 2026 starts on Wednesday, so 3 nulls then 1-30
    expect(grid.slice(0, 3)).toEqual([null, null, null]);
    expect(grid[3]).toBe(1);
    expect(grid[grid.length - 1]).toBe(30);
    expect(grid.length).toBe(33); // 3 + 30
  });

  it("generates correct grid for April 2026 Monday start", () => {
    const grid = generateCalendarGrid(2026, 3, 1);
    // Offset of 2 (Wednesday from Monday)
    expect(grid.slice(0, 2)).toEqual([null, null]);
    expect(grid[2]).toBe(1);
    expect(grid.length).toBe(32); // 2 + 30
  });

  it("handles February leap year", () => {
    const grid = generateCalendarGrid(2024, 1, 0);
    // Feb 2024 starts on Thursday (offset 4 from Sunday)
    const days = grid.filter((d) => d !== null);
    expect(days.length).toBe(29);
  });
});

// --- getWeekDayLabels ---

describe("getWeekDayLabels", () => {
  it("returns Sunday-first labels for weekStartDay=0", () => {
    const labels = getWeekDayLabels(0);
    expect(labels).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("returns Monday-first labels for weekStartDay=1", () => {
    const labels = getWeekDayLabels(1);
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("returns Saturday-first labels for weekStartDay=6", () => {
    const labels = getWeekDayLabels(6);
    expect(labels[0]).toBe("Sat");
    expect(labels[6]).toBe("Fri");
  });
});

// --- formatMonthYear ---

describe("formatMonthYear", () => {
  it("formats April 2026", () => {
    const result = formatMonthYear(2026, 3);
    // Locale-dependent, but should contain "April" and "2026"
    expect(result).toContain("2026");
  });
});

// --- dateToISO ---

describe("dateToISO", () => {
  it("formats single-digit month and day", () => {
    expect(dateToISO(2026, 0, 5)).toBe("2026-01-05");
  });

  it("formats double-digit month and day", () => {
    expect(dateToISO(2026, 11, 25)).toBe("2026-12-25");
  });

  it("handles month index correctly (0-based)", () => {
    expect(dateToISO(2026, 3, 18)).toBe("2026-04-18");
  });
});
