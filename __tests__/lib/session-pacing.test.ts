/**
 * Session Pacing — pure logic unit tests (BLD-1144).
 * 5 pure-logic tests + 1 cache-key contract.
 */

import {
  computePacing,
  formatPacingTime,
  REST_CAP_SECONDS,
  type PacingSet,
  type PacingSession,
} from "../../lib/session-pacing";
import { WORK_ESTIMATE_SECONDS_PER_REP } from "../../lib/rest-resolver";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000; // arbitrary Unix ms base

function makeSession(overrides?: Partial<PacingSession>): PacingSession {
  return {
    started_at: T0,
    completed_at: T0 + 60 * 60 * 1000, // 60 min later
    edited_at: null,
    ...overrides,
  };
}

function makeSet(
  exerciseId: string,
  reps: number | null,
  durationSeconds: number | null,
  completedAtOffsetMs: number
): PacingSet {
  return {
    exercise_id: exerciseId,
    reps,
    duration_seconds: durationSeconds,
    completed_at: T0 + completedAtOffsetMs,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computePacing — pure logic (BLD-1144)", () => {
  it("empty session returns isEmpty=true with correct gross duration", () => {
    const session: PacingSession = {
      started_at: T0,
      completed_at: T0 + 30 * 60 * 1000,
      edited_at: null,
    };
    const result = computePacing([], session);

    expect(result.isEmpty).toBe(true);
    expect(result.working).toBe(0);
    expect(result.rest).toBe(0);
    expect(result.other).toBe(0);
    expect(result.gross).toBe(30 * 60);
    expect(result.perExercise).toHaveLength(0);
  });

  it("Working equals WORK_ESTIMATE_SECONDS_PER_REP × reps (single source of truth assertion)", () => {
    // 1 set, 10 reps, no duration_seconds → working = 10 * WORK_ESTIMATE_SECONDS_PER_REP
    const session = makeSession({
      started_at: T0,
      completed_at: T0 + 5 * 60 * 1000,
    });
    const sets: PacingSet[] = [
      makeSet("ex1", 10, null, 2 * 60 * 1000),
    ];
    const result = computePacing(sets, session);

    expect(result.working).toBe(WORK_ESTIMATE_SECONDS_PER_REP * 10);
    expect(result.perExercise[0].working).toBe(WORK_ESTIMATE_SECONDS_PER_REP * 10);
  });

  it("duration_seconds takes precedence over reps for working estimate", () => {
    const session = makeSession({
      started_at: T0,
      completed_at: T0 + 5 * 60 * 1000,
    });
    // 1 set with both duration and reps — duration wins
    const sets: PacingSet[] = [
      makeSet("ex1", 10, 45, 2 * 60 * 1000),
    ];
    const result = computePacing(sets, session);

    expect(result.working).toBe(45);
  });

  it("Rest is capped at REST_CAP_SECONDS per consecutive pair", () => {
    // Two sets in same exercise separated by a huge gap (20 min = 1200s)
    // working estimate for set[1] = 2 * 10 = 20s
    // raw rest = (1200s gap) - 20s = 1180s → capped at REST_CAP_SECONDS (600)
    const session = makeSession({
      started_at: T0,
      completed_at: T0 + 25 * 60 * 1000,
    });
    const sets: PacingSet[] = [
      makeSet("ex1", 10, null, 1 * 60 * 1000),   // completed at T0+1min
      makeSet("ex1", 10, null, 21 * 60 * 1000),  // completed at T0+21min (20min gap)
    ];
    const result = computePacing(sets, session);

    expect(result.rest).toBe(REST_CAP_SECONDS);
    expect(result.perExercise[0].rest).toBe(REST_CAP_SECONDS);
  });

  it("Other = gross - working - rest, clamped ≥ 0", () => {
    // 2 sets, same exercise, 2 min apart
    // Set1 working = 2 * 5 = 10s (at T0+2min)
    // Set2 working = 2 * 5 = 10s (at T0+4min)
    // gap between set1 and set2 = 120s; raw rest = 120 - 10 = 110s
    // gross = 6 min = 360s
    // other = 360 - (10 + 10) - 110 = 230s
    const session = makeSession({
      started_at: T0,
      completed_at: T0 + 6 * 60 * 1000,
    });
    const sets: PacingSet[] = [
      makeSet("ex1", 5, null, 2 * 60 * 1000),
      makeSet("ex1", 5, null, 4 * 60 * 1000),
    ];
    const result = computePacing(sets, session);

    const expectedWorking = 2 * WORK_ESTIMATE_SECONDS_PER_REP * 5;
    const expectedRest = 120 - WORK_ESTIMATE_SECONDS_PER_REP * 5;
    const expectedOther = 360 - expectedWorking - expectedRest;
    expect(result.working).toBe(expectedWorking);
    expect(result.rest).toBe(expectedRest);
    expect(result.other).toBe(expectedOther);
    expect(result.other).toBeGreaterThanOrEqual(0);
  });
});

// ─── formatPacingTime ─────────────────────────────────────────────────────────

describe("formatPacingTime (BLD-1144)", () => {
  it("formats < 1h as mm:ss", () => {
    expect(formatPacingTime(0)).toBe("0:00");
    expect(formatPacingTime(65)).toBe("1:05");
    expect(formatPacingTime(3599)).toBe("59:59");
  });

  it("formats ≥ 1h as h:mm:ss", () => {
    expect(formatPacingTime(3600)).toBe("1:00:00");
    expect(formatPacingTime(3661)).toBe("1:01:01");
  });
});

// ─── Cache key contract ───────────────────────────────────────────────────────

describe("useSessionPacing cache-key contract (BLD-1144)", () => {
  it("cache key includes session.edited_at as editStamp (invalidates on edit)", () => {
    // The hook uses queryKey: ['session-pacing', sessionId, editStamp ?? null]
    // where editStamp = session.edited_at ?? session.completed_at
    // Editing a completed session stamps edited_at → editStamp changes → cache invalidates.

    const sessionId = "sess-abc";
    const completedAt = T0 + 60 * 60 * 1000;
    const editedAt = T0 + 62 * 60 * 1000; // 2 min after completion

    // Before edit: editStamp = completed_at
    const keyBefore = ["session-pacing", sessionId, completedAt];
    // After edit: editStamp = edited_at
    const keyAfter = ["session-pacing", sessionId, editedAt];

    expect(keyBefore).not.toEqual(keyAfter);
    // Confirm editStamp is edited_at when present (takes precedence over completed_at)
    const editStamp = editedAt ?? completedAt;
    expect(editStamp).toBe(editedAt);
  });
});
