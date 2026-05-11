/**
 * BLD-1172: Unit tests for lib/sets-accessors.ts named reps accessors.
 *
 * AC #270: GIVEN a rest_pause set with parent.reps=13 (segments 8,3,2 @ 100kg)
 *          WHEN getWorkingRepsForOverloadDecision is called
 *          THEN it returns 8 (the first segment reps), NOT 13.
 *
 * AC #271: GIVEN a myo_reps set with activation 15 reps + clusters 5,5,4,3
 *          WHEN getEffortRepsForPlateau is called
 *          THEN it returns 15 (activation segment), NOT 32 (sum) or 5 (heaviest cluster).
 */

import {
  getWorkingRepsForOverloadDecision,
  getEffortRepsForPlateau,
  getHeaviestSegmentReps,
  getTotalRepsForVolume,
} from "../lib/sets-accessors";
import type { WorkoutSet, SetSegment } from "../lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSet(overrides: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: "s1",
    session_id: "sess1",
    exercise_id: "ex1",
    set_number: 1,
    weight: 100,
    reps: null,
    completed: true,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: null,
    round: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "normal",
    duration_seconds: null,
    exercise_position: 0,
    ...overrides,
  };
}

function makeSegment(segmentNumber: number, reps: number, weight?: number): SetSegment {
  return {
    id: `seg${segmentNumber}`,
    set_id: "s1",
    segment_number: segmentNumber,
    reps,
    weight: weight ?? null,
    rest_after_seconds: null,
    completed_at: null,
    created_at: Date.now(),
  };
}

// ─── getWorkingRepsForOverloadDecision ──────────────────────────────────────

describe("getWorkingRepsForOverloadDecision", () => {
  it("AC #270 — rest_pause 8+3+2 @ 100kg returns 8 (first segment), not 13 (sum)", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 13, weight: 100 });
    const segments = [
      makeSegment(1, 8),
      makeSegment(2, 3),
      makeSegment(3, 2),
    ];
    expect(getWorkingRepsForOverloadDecision(set, segments)).toBe(8);
  });

  it("cluster — first segment (4) returned as working reps", () => {
    const set = makeSet({ set_type: "cluster", reps: 12, weight: 80 });
    const segments = [
      makeSegment(1, 4),
      makeSegment(2, 4),
      makeSegment(3, 4),
    ];
    expect(getWorkingRepsForOverloadDecision(set, segments)).toBe(4);
  });

  it("myo_reps — activation segment (15) returned", () => {
    const set = makeSet({ set_type: "myo_reps", reps: 32, weight: 25 });
    const segments = [
      makeSegment(1, 15), // activation
      makeSegment(2, 5),
      makeSegment(3, 5),
      makeSegment(4, 4),
      makeSegment(5, 3),
    ];
    expect(getWorkingRepsForOverloadDecision(set, segments)).toBe(15);
  });

  it("normal set — returns set.reps directly", () => {
    const set = makeSet({ set_type: "normal", reps: 10 });
    expect(getWorkingRepsForOverloadDecision(set, [])).toBe(10);
  });

  it("warmup set — returns set.reps directly", () => {
    const set = makeSet({ set_type: "warmup", reps: 15 });
    expect(getWorkingRepsForOverloadDecision(set, [])).toBe(15);
  });

  it("advanced set with zero segments — falls back to set.reps", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 0 });
    expect(getWorkingRepsForOverloadDecision(set, [])).toBe(0);
  });

  it("segments out of order — still picks the segment with lowest segment_number", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 11, weight: 100 });
    const segments = [
      makeSegment(3, 2),
      makeSegment(1, 8),
      makeSegment(2, 1),
    ];
    expect(getWorkingRepsForOverloadDecision(set, segments)).toBe(8);
  });
});

// ─── getEffortRepsForPlateau ─────────────────────────────────────────────────

describe("getEffortRepsForPlateau", () => {
  it("AC #271 — myo_reps activation=15 returns 15, not 32 (sum) or 5 (cluster reps)", () => {
    const set = makeSet({ set_type: "myo_reps", reps: 32, weight: 25 });
    const segments = [
      makeSegment(1, 15), // activation
      makeSegment(2, 5),
      makeSegment(3, 5),
      makeSegment(4, 4),
      makeSegment(5, 3),
    ];
    expect(getEffortRepsForPlateau(set, segments)).toBe(15);
  });

  it("rest_pause — returns first segment reps for plateau check", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 13, weight: 100 });
    const segments = [
      makeSegment(1, 8),
      makeSegment(2, 3),
      makeSegment(3, 2),
    ];
    expect(getEffortRepsForPlateau(set, segments)).toBe(8);
  });

  it("cluster — returns first segment reps", () => {
    const set = makeSet({ set_type: "cluster", reps: 15, weight: 90 });
    const segments = [makeSegment(1, 5), makeSegment(2, 5), makeSegment(3, 5)];
    expect(getEffortRepsForPlateau(set, segments)).toBe(5);
  });

  it("normal set — returns set.reps directly", () => {
    const set = makeSet({ set_type: "normal", reps: 8 });
    expect(getEffortRepsForPlateau(set, [])).toBe(8);
  });

  it("failure set — returns set.reps directly", () => {
    const set = makeSet({ set_type: "failure", reps: 12 });
    expect(getEffortRepsForPlateau(set, [])).toBe(12);
  });
});

// ─── getHeaviestSegmentReps ──────────────────────────────────────────────────

describe("getHeaviestSegmentReps", () => {
  it("rest_pause — returns the max segment reps", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 13, weight: 100 });
    const segments = [makeSegment(1, 8), makeSegment(2, 3), makeSegment(3, 2)];
    expect(getHeaviestSegmentReps(set, segments)).toBe(8);
  });

  it("myo_reps with activation=15, clusters=5 — returns 15", () => {
    const set = makeSet({ set_type: "myo_reps", reps: 32, weight: 25 });
    const segments = [
      makeSegment(1, 15),
      makeSegment(2, 5),
      makeSegment(3, 5),
    ];
    expect(getHeaviestSegmentReps(set, segments)).toBe(15);
  });

  it("cluster equal reps — returns that rep count", () => {
    const set = makeSet({ set_type: "cluster", reps: 15, weight: 90 });
    const segments = [makeSegment(1, 5), makeSegment(2, 5), makeSegment(3, 5)];
    expect(getHeaviestSegmentReps(set, segments)).toBe(5);
  });

  it("normal set — returns set.reps", () => {
    const set = makeSet({ set_type: "normal", reps: 10 });
    expect(getHeaviestSegmentReps(set, [])).toBe(10);
  });
});

// ─── getTotalRepsForVolume ───────────────────────────────────────────────────

describe("getTotalRepsForVolume", () => {
  it("rest_pause 8+3+2 — returns 13 (sum)", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 13, weight: 100 });
    const segments = [makeSegment(1, 8), makeSegment(2, 3), makeSegment(3, 2)];
    expect(getTotalRepsForVolume(set, segments)).toBe(13);
  });

  it("myo_reps 15+5+5+4+3 — returns 32 (sum)", () => {
    const set = makeSet({ set_type: "myo_reps", reps: 32, weight: 25 });
    const segments = [
      makeSegment(1, 15),
      makeSegment(2, 5),
      makeSegment(3, 5),
      makeSegment(4, 4),
      makeSegment(5, 3),
    ];
    expect(getTotalRepsForVolume(set, segments)).toBe(32);
  });

  it("normal set — returns set.reps", () => {
    const set = makeSet({ set_type: "normal", reps: 10 });
    expect(getTotalRepsForVolume(set, [])).toBe(10);
  });

  it("advanced set with no segments — returns 0 (set.reps=0)", () => {
    const set = makeSet({ set_type: "rest_pause", reps: 0 });
    expect(getTotalRepsForVolume(set, [])).toBe(0);
  });
});
