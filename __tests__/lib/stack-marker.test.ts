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

