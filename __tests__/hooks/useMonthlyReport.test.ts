/**
 * Tests for pure helper functions exported from hooks/useMonthlyReport.ts.
 *
 * formatMonthLabel is the function previously affected by the Hermes Intl bug:
 * it called Date.prototype.toLocaleDateString() which returns "" on Hermes
 * because no ICU data is bundled. The fix replaces it with a hardcoded
 * MONTH_NAMES array (same pattern as getWeekDayLabels in lib/db/calendar.ts).
 */

import { formatMonthLabel, formatVolume, volumeChangePercent, sessionCountDelta } from "../../hooks/useMonthlyReport";

// --- formatMonthLabel ---

describe("formatMonthLabel", () => {
  it("formats July 2026 correctly (monthIndex=6)", () => {
    expect(formatMonthLabel(2026, 6)).toBe("July 2026");
  });

  it("formats January (monthIndex=0)", () => {
    expect(formatMonthLabel(2026, 0)).toBe("January 2026");
  });

  it("formats December (monthIndex=11)", () => {
    expect(formatMonthLabel(2025, 11)).toBe("December 2025");
  });

  it("returns a non-empty label containing the year for all 12 month indices", () => {
    for (let m = 0; m < 12; m++) {
      const label = formatMonthLabel(2026, m);
      expect(label.length).toBeGreaterThan(0);
      expect(label).toContain("2026");
    }
  });

  it("does not rely on toLocaleDateString (output is deterministic across locales)", () => {
    // These exact strings must match regardless of system locale or Intl availability.
    const expected = [
      "January 2024",   "February 2024",  "March 2024",
      "April 2024",     "May 2024",       "June 2024",
      "July 2024",      "August 2024",    "September 2024",
      "October 2024",   "November 2024",  "December 2024",
    ];
    for (let m = 0; m < 12; m++) {
      expect(formatMonthLabel(2024, m)).toBe(expected[m]);
    }
  });
});

// --- formatVolume ---

describe("formatVolume", () => {
  it("rounds and returns plain string for values below 1M", () => {
    expect(formatVolume(12345.6)).toBe("12,346");
  });

  it("returns k-suffix for values >= 1M", () => {
    expect(formatVolume(1_500_000)).toBe("1,500k");
  });
});

// --- volumeChangePercent ---

describe("volumeChangePercent", () => {
  it("returns null when previous is null", () => {
    expect(volumeChangePercent(100, null)).toBeNull();
  });

  it("returns null when previous is 0 (avoid divide by zero)", () => {
    expect(volumeChangePercent(100, 0)).toBeNull();
  });

  it("returns null when change rounds to 0%", () => {
    expect(volumeChangePercent(1000, 999)).toBeNull();
  });

  it("returns positive percent string with + prefix", () => {
    expect(volumeChangePercent(110, 100)).toBe("+10%");
  });

  it("returns negative percent string", () => {
    expect(volumeChangePercent(90, 100)).toBe("-10%");
  });
});

// --- sessionCountDelta ---

describe("sessionCountDelta", () => {
  it("returns null when previous is null", () => {
    expect(sessionCountDelta(5, null)).toBeNull();
  });

  it("returns null when delta is 0", () => {
    expect(sessionCountDelta(5, 5)).toBeNull();
  });

  it("returns positive delta with + prefix", () => {
    expect(sessionCountDelta(8, 5)).toBe("+3");
  });

  it("returns negative delta", () => {
    expect(sessionCountDelta(3, 5)).toBe("-2");
  });
});
