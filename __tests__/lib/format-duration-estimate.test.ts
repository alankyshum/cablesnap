import { formatDurationEstimate, formatSpokenDuration } from "../../lib/format";

describe("formatDurationEstimate", () => {
  it("returns ~5m for very short durations (< 5 min)", () => {
    expect(formatDurationEstimate(0)).toBe("~5m");
    expect(formatDurationEstimate(60)).toBe("~5m");
    expect(formatDurationEstimate(120)).toBe("~5m");
  });

  it("rounds to nearest 5 minutes", () => {
    expect(formatDurationEstimate(150)).toBe("~5m"); // 2.5 min → round to 5
    expect(formatDurationEstimate(2700)).toBe("~45m"); // 45 min
    expect(formatDurationEstimate(2820)).toBe("~45m"); // 47 min → round to 45
    expect(formatDurationEstimate(2940)).toBe("~50m"); // 49 min → round to 50
  });

  it("formats exactly 60 minutes as ~1h", () => {
    expect(formatDurationEstimate(3600)).toBe("~1h");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationEstimate(4500)).toBe("~1h 15m"); // 75 min
    expect(formatDurationEstimate(5400)).toBe("~1h 30m"); // 90 min
  });

  it("handles very long sessions (3+ hours)", () => {
    expect(formatDurationEstimate(10800)).toBe("~3h"); // 180 min
    expect(formatDurationEstimate(11700)).toBe("~3h 15m"); // 195 min
  });

  it("rounds boundary values correctly", () => {
    // 7.5 min rounds to 10
    expect(formatDurationEstimate(450)).toBe("~10m");
    // 12.5 min rounds to ~15m (Math.round rounds 0.5 up)
    expect(formatDurationEstimate(750)).toBe("~15m");
    // 32.5 min rounds to 35m (nearest 5)
    expect(formatDurationEstimate(1950)).toBe("~35m");
  });
});

describe("formatSpokenDuration", () => {
  it("returns 'approximately 5 minutes' for very short durations", () => {
    expect(formatSpokenDuration(60)).toBe("approximately 5 minutes");
  });

  it("returns 'approximately 45 minutes'", () => {
    expect(formatSpokenDuration(2700)).toBe("approximately 45 minutes");
  });

  it("returns 'approximately 1 hour' for exactly 60 min", () => {
    expect(formatSpokenDuration(3600)).toBe("approximately 1 hour");
  });

  it("returns 'approximately 1 hour 15 minutes'", () => {
    expect(formatSpokenDuration(4500)).toBe("approximately 1 hour 15 minutes");
  });

  it("returns 'approximately 2 hours' for 120 min", () => {
    expect(formatSpokenDuration(7200)).toBe("approximately 2 hours");
  });

  it("returns 'approximately 3 hours 15 minutes' for very long sessions", () => {
    expect(formatSpokenDuration(11700)).toBe("approximately 3 hours 15 minutes");
  });
});
