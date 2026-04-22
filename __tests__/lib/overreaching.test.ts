import {
  computeOverreachingScore,
  computeE1RMSignal,
  computeRPESignal,
  computeRatingSignal,
  isDismissed,
  parseDismissalState,
  serializeDismissalState,
  type WeeklyE1RMRow,
  type SessionRPERow,
  type SessionRatingRow,
  type DismissalState,
} from "../../lib/overreaching";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1700000000000; // Fixed reference time

// ---- Helper Factories ----

function makeE1RMRows(opts: {
  exercises?: string[];
  recentAvg?: number;
  priorAvg?: number;
  weeks?: number;
}): WeeklyE1RMRow[] {
  const exercises = opts.exercises ?? ["ex1"];
  const recentAvg = opts.recentAvg ?? 100;
  const priorAvg = opts.priorAvg ?? 100;
  const weeks = opts.weeks ?? 4;
  const rows: WeeklyE1RMRow[] = [];

  for (const exId of exercises) {
    for (let w = 0; w < weeks; w++) {
      const weekStart = NOW - (weeks - w) * WEEK;
      const isRecent = weekStart >= NOW - 2 * WEEK;
      rows.push({
        exercise_id: exId,
        name: `Exercise ${exId}`,
        week_start: weekStart,
        max_e1rm: isRecent ? recentAvg : priorAvg,
      });
    }
  }
  return rows;
}

function makeRPERows(opts: {
  recentAvg?: number;
  priorAvg?: number;
  sessionsPerWindow?: number;
}): SessionRPERow[] {
  const recentAvg = opts.recentAvg ?? 7;
  const priorAvg = opts.priorAvg ?? 7;
  const count = opts.sessionsPerWindow ?? 3;
  const rows: SessionRPERow[] = [];

  for (let i = 0; i < count; i++) {
    rows.push({
      session_id: `prior-${i}`,
      started_at: NOW - 3 * WEEK + i * DAY,
      avg_rpe: priorAvg,
    });
    rows.push({
      session_id: `recent-${i}`,
      started_at: NOW - WEEK + i * DAY,
      avg_rpe: recentAvg,
    });
  }
  return rows;
}

function makeRatingRows(opts: {
  firstHalfAvg?: number;
  secondHalfAvg?: number;
  count?: number;
}): SessionRatingRow[] {
  const firstAvg = opts.firstHalfAvg ?? 4;
  const secondAvg = opts.secondHalfAvg ?? 4;
  const total = opts.count ?? 6;
  const mid = Math.floor(total / 2);
  const rows: SessionRatingRow[] = [];

  for (let i = 0; i < total; i++) {
    rows.push({
      session_id: `rating-${i}`,
      started_at: NOW - 5 * WEEK + i * (4 * DAY),
      rating: i < mid ? firstAvg : secondAvg,
    });
  }
  return rows;
}

// ---- E1RM Signal Tests ----

describe("computeE1RMSignal", () => {
  it("does not fire with empty data", () => {
    expect(computeE1RMSignal([], NOW).fired).toBe(false);
  });

  it("does not fire with insufficient weeks (<3)", () => {
    const rows = makeE1RMRows({ weeks: 2, priorAvg: 100, recentAvg: 80 });
    expect(computeE1RMSignal(rows, NOW).fired).toBe(false);
  });

  it("e1RM signal fires only when decline meets the 5% threshold", () => {
    const cases: [string, number, number, boolean][] = [
      ["stable performance", 100, 100, false],
      ["improving performance", 100, 110, false],
      ["small decline (3%)", 100, 97, false],
      ["threshold decline (5%)", 100, 95, true],
      ["large decline (15%)", 100, 85, true],
    ];
    for (const [desc, prior, recent, expected] of cases) {
      const rows = makeE1RMRows({ priorAvg: prior, recentAvg: recent, weeks: 4 });
      const actual = computeE1RMSignal(rows, NOW).fired;
      if (actual !== expected) {
        throw new Error(`${desc}: expected fired=${expected}, got ${actual} (prior=${prior}, recent=${recent})`);
      }
    }
  });

  it("reports exercise name in detail when declining", () => {
    const rows = makeE1RMRows({ exercises: ["bench"], priorAvg: 100, recentAvg: 90, weeks: 4 });
    const signal = computeE1RMSignal(rows, NOW);
    expect(signal.detail).toContain("Exercise bench");
    expect(signal.detail).toContain("10%");
  });
});

// ---- RPE Signal Tests ----

describe("computeRPESignal", () => {
  it("does not fire when e1RM signal is not fired", () => {
    const rows = makeRPERows({ priorAvg: 6, recentAvg: 8 });
    expect(computeRPESignal(rows, false, NOW).fired).toBe(false);
  });

  it("does not fire with insufficient sessions", () => {
    const rows = makeRPERows({ priorAvg: 6, recentAvg: 8, sessionsPerWindow: 1 });
    expect(computeRPESignal(rows, true, NOW).fired).toBe(false);
  });

  it("RPE signal fires only when increase meets the 0.5 threshold", () => {
    const cases: [string, number, number, boolean][] = [
      ["stable RPE", 7, 7, false],
      ["small increase (0.3)", 7, 7.3, false],
      ["threshold increase (0.5)", 7, 7.5, true],
      ["large increase (1.5)", 7, 8.5, true],
    ];
    for (const [desc, prior, recent, expected] of cases) {
      const rows = makeRPERows({ priorAvg: prior, recentAvg: recent });
      const actual = computeRPESignal(rows, true, NOW).fired;
      if (actual !== expected) {
        throw new Error(`${desc}: expected fired=${expected}, got ${actual} (prior=${prior}, recent=${recent})`);
      }
    }
  });
});

// ---- Rating Signal Tests ----

describe("computeRatingSignal", () => {
  it("does not fire with insufficient sessions (<4)", () => {
    const rows = makeRatingRows({ count: 3, firstHalfAvg: 5, secondHalfAvg: 2 });
    expect(computeRatingSignal(rows, NOW).fired).toBe(false);
  });

  it("rating signal fires only when decline meets the 0.5 threshold", () => {
    const cases: [string, number, number, boolean][] = [
      ["stable ratings", 4, 4, false],
      ["improving ratings", 3, 4, false],
      ["small decline (0.3)", 4, 3.7, false],
      ["threshold decline (0.5)", 4, 3.5, true],
      ["large decline (2.0)", 5, 3, true],
    ];
    for (const [desc, first, second, expected] of cases) {
      const rows = makeRatingRows({ firstHalfAvg: first, secondHalfAvg: second, count: 6 });
      const actual = computeRatingSignal(rows, NOW).fired;
      if (actual !== expected) {
        throw new Error(`${desc}: expected fired=${expected}, got ${actual} (first=${first}, second=${second})`);
      }
    }
  });

  it("ignores sessions outside 6-week window", () => {
    const old: SessionRatingRow[] = Array.from({ length: 6 }, (_, i) => ({
      session_id: `old-${i}`,
      started_at: NOW - 10 * WEEK + i * DAY,
      rating: i < 3 ? 5 : 2,
    }));
    expect(computeRatingSignal(old, NOW).fired).toBe(false);
  });
});

// ---- Composite Score Tests ----

describe("computeOverreachingScore", () => {
  it("returns no nudge with all-empty data", () => {
    const result = computeOverreachingScore([], [], [], NOW);
    expect(result.shouldNudge).toBe(false);
    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(3);
  });

  it("nudges when e1RM declines ≥5% (score=3)", () => {
    const e1rm = makeE1RMRows({ priorAvg: 100, recentAvg: 90, weeks: 4 });
    const result = computeOverreachingScore(e1rm, [], [], NOW);
    expect(result.score).toBe(3);
    expect(result.shouldNudge).toBe(true);
  });

  it("scores 8 when e1RM + RPE + rating all fire", () => {
    const e1rm = makeE1RMRows({ priorAvg: 100, recentAvg: 90, weeks: 4 });
    const rpe = makeRPERows({ priorAvg: 6, recentAvg: 8 });
    const ratings = makeRatingRows({ firstHalfAvg: 5, secondHalfAvg: 3, count: 6 });
    const result = computeOverreachingScore(e1rm, rpe, ratings, NOW);
    expect(result.score).toBe(8);
    expect(result.shouldNudge).toBe(true);
    expect(result.signals.filter((s) => s.fired)).toHaveLength(3);
  });

  it("does not nudge when only ratings decline (score=2 < threshold)", () => {
    const ratings = makeRatingRows({ firstHalfAvg: 5, secondHalfAvg: 3, count: 6 });
    const result = computeOverreachingScore([], [], ratings, NOW);
    expect(result.score).toBe(2);
    expect(result.shouldNudge).toBe(false);
  });
});

// ---- Dismissal Tests ----

describe("isDismissed", () => {
  it("returns false with null state", () => {
    expect(isDismissed(null, NOW)).toBe(false);
  });

  it("7-day dismissal window boundary behaviour", () => {
    const cases: [string, number, boolean][] = [
      ["within 7 days", NOW - 3 * DAY, true],
      ["exactly at 7 days", NOW - 7 * DAY, false],
      ["after 7 days", NOW - 8 * DAY, false],
    ];
    for (const [desc, dismissedAt, expected] of cases) {
      const state: DismissalState = { dismissedAt, scoreAtDismissal: 5 };
      const actual = isDismissed(state, NOW);
      if (actual !== expected) {
        throw new Error(`${desc}: expected ${expected}, got ${actual}`);
      }
    }
  });
});

describe("parseDismissalState", () => {
  it("returns null for null/empty/invalid input", () => {
    expect(parseDismissalState(null)).toBeNull();
    expect(parseDismissalState("")).toBeNull();
    expect(parseDismissalState("not json")).toBeNull();
    expect(parseDismissalState("{}")).toBeNull();
    expect(parseDismissalState('{"dismissedAt":"string"}')).toBeNull();
  });

  it("parses valid state", () => {
    const raw = JSON.stringify({ dismissedAt: NOW, scoreAtDismissal: 5 });
    expect(parseDismissalState(raw)).toEqual({ dismissedAt: NOW, scoreAtDismissal: 5 });
  });
});

describe("serializeDismissalState", () => {
  it("round-trips correctly", () => {
    const state: DismissalState = { dismissedAt: NOW, scoreAtDismissal: 5 };
    expect(parseDismissalState(serializeDismissalState(state))).toEqual(state);
  });
});
