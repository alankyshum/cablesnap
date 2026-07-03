/**
 * BLD-2701: Tests for lib/intensity.ts
 *
 * Covers:
 * - Conversion functions (rpeToRir, rirToRpe)
 * - formatIntensity in both modes
 * - intensityUnitLabel
 * - Scale constants
 * - Edge cases (rpe=10 → 0 RIR, half-steps, legacy out-of-range values)
 *
 * Binding CEO condition: "Never persist RIR" — converter tests verify
 * that rirToRpe is the ONLY path from user RIR input to stored RPE.
 */

import {
  RPE_MIN,
  RPE_MAX,
  RPE_STEP,
  rpeToRir,
  rirToRpe,
  formatIntensity,
  intensityUnitLabel,
} from "../../lib/intensity";

describe("lib/intensity — scale constants", () => {
  it("RPE_MIN is 6", () => expect(RPE_MIN).toBe(6));
  it("RPE_MAX is 10", () => expect(RPE_MAX).toBe(10));
  it("RPE_STEP is 0.5", () => expect(RPE_STEP).toBe(0.5));
});

describe("lib/intensity — rpeToRir (display conversion)", () => {
  it("RPE 10 → 0 RIR (hardest)", () => expect(rpeToRir(10)).toBe(0));
  it("RPE 9 → 1 RIR", () => expect(rpeToRir(9)).toBe(1));
  it("RPE 8 → 2 RIR", () => expect(rpeToRir(8)).toBe(2));
  it("RPE 7.5 → 2.5 RIR (half-steps preserved)", () => expect(rpeToRir(7.5)).toBe(2.5));
  it("RPE 6 → 4 RIR (easiest)", () => expect(rpeToRir(6)).toBe(4));
  // Edge case: legacy out-of-range value — conversion still applies
  it("RPE 5 → 5 RIR (legacy out-of-range, no clamping on display)", () => expect(rpeToRir(5)).toBe(5));
});

describe("lib/intensity — rirToRpe (input conversion — MUST store RPE)", () => {
  it("RIR 0 → RPE 10 (hardest)", () => expect(rirToRpe(0)).toBe(10));
  it("RIR 1 → RPE 9", () => expect(rirToRpe(1)).toBe(9));
  it("RIR 2 → RPE 8", () => expect(rirToRpe(2)).toBe(8));
  it("RIR 2.5 → RPE 7.5 (half-steps preserved)", () => expect(rirToRpe(2.5)).toBe(7.5));
  it("RIR 4 → RPE 6 (easiest)", () => expect(rirToRpe(4)).toBe(6));
  // Invariant: rirToRpe(rpeToRir(rpe)) === rpe for all valid values
  it("round-trip: rirToRpe(rpeToRir(8)) === 8", () => expect(rirToRpe(rpeToRir(8))).toBe(8));
  it("round-trip: rirToRpe(rpeToRir(7.5)) === 7.5", () => expect(rirToRpe(rpeToRir(7.5))).toBe(7.5));
});

describe("lib/intensity — formatIntensity", () => {
  // RPE mode
  it("RPE mode: null rpe → empty string", () => expect(formatIntensity(null, "rpe")).toBe(""));
  it("RPE mode: whole number → no trailing .0 in label", () => expect(formatIntensity(8, "rpe")).toBe("RPE 8"));
  it("RPE mode: half-step → decimal preserved", () => expect(formatIntensity(7.5, "rpe")).toBe("RPE 7.5"));
  it("RPE mode: rpe=6 → 'RPE 6'", () => expect(formatIntensity(6, "rpe")).toBe("RPE 6"));
  it("RPE mode: rpe=10 → 'RPE 10'", () => expect(formatIntensity(10, "rpe")).toBe("RPE 10"));

  // RIR mode
  it("RIR mode: null rpe → empty string", () => expect(formatIntensity(null, "rir")).toBe(""));
  it("RIR mode: rpe=8 → '2 RIR'", () => expect(formatIntensity(8, "rir")).toBe("2 RIR"));
  it("RIR mode: rpe=10 → '0 RIR' (never '-0' or blank)", () => expect(formatIntensity(10, "rir")).toBe("0 RIR"));
  it("RIR mode: rpe=7.5 → '2.5 RIR' (half-steps preserved)", () => expect(formatIntensity(7.5, "rir")).toBe("2.5 RIR"));
  it("RIR mode: rpe=6 → '4 RIR' (easiest)", () => expect(formatIntensity(6, "rir")).toBe("4 RIR"));
  it("RIR mode: rpe=9 → '1 RIR'", () => expect(formatIntensity(9, "rir")).toBe("1 RIR"));
  // Legacy out-of-range value — no clamping on display
  it("RIR mode: rpe=5 → '5 RIR' (legacy, no clamping)", () => expect(formatIntensity(5, "rir")).toBe("5 RIR"));

  // Color invariant: same stored rpe renders same badge regardless of mode
  // (color is taken from rpe directly in rpeColor; only label changes)
  it("Same stored rpe=8 renders differently per mode", () => {
    expect(formatIntensity(8, "rpe")).not.toBe(formatIntensity(8, "rir"));
  });
});

describe("lib/intensity — intensityUnitLabel", () => {
  it("rpe mode → 'RPE'", () => expect(intensityUnitLabel("rpe")).toBe("RPE"));
  it("rir mode → 'RIR'", () => expect(intensityUnitLabel("rir")).toBe("RIR"));
});
