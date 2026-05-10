/**
 * BLD-1126 AC14 — unit tests for stack-marker.ts pure helpers.
 *
 * Covers:
 *  - shouldRenderMarkerPill: all six branch combinations
 *  - pickMarker: valid marker, missing calibration, null stack, empty calibrations
 */
import { shouldRenderMarkerPill, pickMarker } from "../../lib/stack-marker";
import type { CableStackRow, StackCalibrationRow } from "../../lib/db/schema";

// Minimal stubs
function makeStack(overrides?: Partial<CableStackRow>): CableStackRow {
  return {
    id: "stack-1",
    gym_id: "gym-1",
    name: "Main Stack",
    unit: "kg",
    position: 0,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    ...overrides,
  } as CableStackRow;
}

const CALIBRATIONS: StackCalibrationRow[] = [
  { id: "cal-1", stack_id: "stack-1", marker: 5, true_weight: 22.5, created_at: 0 } as StackCalibrationRow,
  { id: "cal-2", stack_id: "stack-1", marker: 10, true_weight: 45, created_at: 0 } as StackCalibrationRow,
];

// ── shouldRenderMarkerPill ──────────────────────────────────────────────────

describe("shouldRenderMarkerPill", () => {
  it("returns true when cable + calibrated + pristine (weight null, marker null)", () => {
    expect(shouldRenderMarkerPill({ weight: null, stack_marker: null }, true, true)).toBe(true);
  });

  it("returns true when cable + calibrated + marker logged", () => {
    expect(shouldRenderMarkerPill({ weight: 22.5, stack_marker: 5 }, true, true)).toBe(true);
  });

  it("returns false when cable + calibrated + manual weight (no marker) — Case B stays numeric", () => {
    expect(shouldRenderMarkerPill({ weight: 40, stack_marker: null }, true, true)).toBe(false);
  });

  it("returns false when NOT cable (AC7 regression guard)", () => {
    expect(shouldRenderMarkerPill({ weight: null, stack_marker: null }, false, true)).toBe(false);
  });

  it("returns false when cable but NO calibration data", () => {
    expect(shouldRenderMarkerPill({ weight: null, stack_marker: null }, true, false)).toBe(false);
  });

  it("returns false when both not cable and no calibration", () => {
    expect(shouldRenderMarkerPill({ weight: 30, stack_marker: null }, false, false)).toBe(false);
  });

  // Regression: stack configured (gym has stacks) but all stacks have zero
  // calibration rows. SetWeightCell computes hasCalibration via
  // stacks.some(s => s.calibrations.length > 0), which is false here.
  // shouldRenderMarkerPill must therefore return false, keeping the normal
  // WeightInput (not "Pick marker" with an empty sheet).
  it("returns false when hasCalibration=false (stack present, zero calibration rows — reviewer blocker)", () => {
    expect(shouldRenderMarkerPill({ weight: null, stack_marker: null }, true, false)).toBe(false);
  });
});

// ── pickMarker ─────────────────────────────────────────────────────────────

describe("pickMarker", () => {
  const stack = makeStack();

  it("resolves a valid marker to correct weight and stackUnit", () => {
    const result = pickMarker(stack, CALIBRATIONS, 5);
    expect(result).not.toBeNull();
    expect(result!.weight).toBe(22.5);
    expect(result!.stackUnit).toBe("kg");
    expect(result!.marker).toBe(5);
    expect(result!.stackId).toBe("stack-1");
    expect(result!.stackName).toBe("Main Stack");
  });

  it("resolves a second valid marker", () => {
    const result = pickMarker(stack, CALIBRATIONS, 10);
    expect(result!.weight).toBe(45);
  });

  it("returns null for a marker not in calibrations", () => {
    expect(pickMarker(stack, CALIBRATIONS, 99)).toBeNull();
  });

  it("returns null when calibrations array is empty", () => {
    expect(pickMarker(stack, [], 5)).toBeNull();
  });

  it("returns null when stack is null", () => {
    expect(pickMarker(null, CALIBRATIONS, 5)).toBeNull();
  });

  it("uses unit from the stack row (not inferred)", () => {
    const lbStack = makeStack({ unit: "lb" });
    const result = pickMarker(lbStack, CALIBRATIONS, 5);
    expect(result!.stackUnit).toBe("lb");
  });
});

// ── BLD-1145: BLD-1126 AC9 — multi-stack disambiguation ──────────────────────

describe("pickMarker — AC9 multi-stack disambiguation (BLD-1126)", () => {
  it("Stack A marker 6 → weight 40 and Stack B marker 6 → weight 30: both code paths yield distinct (stack_id, weight)", () => {
    const stackA = makeStack({ id: "stack-A", name: "Left Stack", unit: "kg" });
    const stackB = makeStack({ id: "stack-B", name: "Right Stack", unit: "kg" });
    const calsA: StackCalibrationRow[] = [{ id: "c1", stack_id: "stack-A", marker: 6, true_weight: 40 }];
    const calsB: StackCalibrationRow[] = [{ id: "c2", stack_id: "stack-B", marker: 6, true_weight: 30 }];

    const resultA = pickMarker(stackA, calsA, 6)!;
    const resultB = pickMarker(stackB, calsB, 6)!;

    // Stack A code path
    expect(resultA.stackId).toBe("stack-A");
    expect(resultA.stackName).toBe("Left Stack");
    expect(resultA.weight).toBe(40);
    expect(resultA.marker).toBe(6);

    // Stack B code path
    expect(resultB.stackId).toBe("stack-B");
    expect(resultB.stackName).toBe("Right Stack");
    expect(resultB.weight).toBe(30);
    expect(resultB.marker).toBe(6);

    // Same marker, different stacks → different weights (disambiguation)
    expect(resultA.weight).not.toBe(resultB.weight);
    expect(resultA.stackId).not.toBe(resultB.stackId);
  });

  it("marker present in Stack A only → Stack B returns null for same marker", () => {
    const stackA = makeStack({ id: "stack-A", name: "Left Stack", unit: "kg" });
    const stackB = makeStack({ id: "stack-B", name: "Right Stack", unit: "kg" });
    const calsA: StackCalibrationRow[] = [{ id: "c3", stack_id: "stack-A", marker: 8, true_weight: 60 }];
    const calsB: StackCalibrationRow[] = []; // Stack B has no marker 8

    const resultA = pickMarker(stackA, calsA, 8)!;
    const resultB = pickMarker(stackB, calsB, 8);

    expect(resultA.weight).toBe(60);
    expect(resultB).toBeNull(); // Stack B can't resolve marker 8
  });
});

