/**
 * Unit tests for lib/weight-step.ts (BLD-2674).
 *
 * Covers all AC from the plan:
 *  - step up/down
 *  - min/max clamp {min:0, max:500}
 *  - float rounding (no drift)
 *  - off-grid input (no grid-snap)
 *  - null/0 start
 */
import { stepWeight } from "../../lib/weight-step";

describe("stepWeight", () => {
  const opts = { min: 0, max: 500 };

  // ── Basic step up / down ───────────────────────────────────────────────────
  it("steps up by step (kg, value 20, step 2.5 → 22.5)", () => {
    expect(stepWeight(20, 2.5, 1, opts)).toBe(22.5);
  });

  it("steps down by step (lb, value 45, step 5 → 40)", () => {
    expect(stepWeight(45, 5, -1, opts)).toBe(40);
  });

  it("steps up from 0 with step 2.5 → 2.5", () => {
    expect(stepWeight(0, 2.5, 1, opts)).toBe(2.5);
  });

  it("steps down from 5 with step 2.5 → 2.5", () => {
    expect(stepWeight(5, 2.5, -1, opts)).toBe(2.5);
  });

  // ── Min clamp ──────────────────────────────────────────────────────────────
  it("clamps at min — value at 0, step down → 0", () => {
    expect(stepWeight(0, 2.5, -1, opts)).toBe(0);
  });

  it("clamps at min — value at 2.5, step 5 down → 0 (would go negative)", () => {
    // 2.5 - 5 = -2.5, clamp to 0
    expect(stepWeight(2.5, 5, -1, opts)).toBe(0);
  });

  // ── Max clamp ──────────────────────────────────────────────────────────────
  it("clamps at max — value at 500, step up → 500", () => {
    expect(stepWeight(500, 2.5, 1, opts)).toBe(500);
  });

  it("clamps at max — value at 498, step 5 up → 500 (would exceed)", () => {
    // 498 + 5 = 503, clamp to 500
    expect(stepWeight(498, 5, 1, opts)).toBe(500);
  });

  // ── Float rounding (no drift) ─────────────────────────────────────────────
  it("no float drift — 2.5 × 4 taps from 0 = 10.0 exactly", () => {
    let v: number | null = 0;
    for (let i = 0; i < 4; i++) {
      v = stepWeight(v, 2.5, 1, opts);
    }
    expect(v).toBe(10);
    expect(String(v)).toBe("10");
  });

  it("no float drift — 0.1 + 0.2 style: step 0.1 three times from 0 = 0.3", () => {
    let v: number | null = 0;
    for (let i = 0; i < 3; i++) {
      v = stepWeight(v, 0.1, 1, opts);
    }
    expect(v).toBe(0.3);
  });

  it("rounds to 1 decimal", () => {
    // 1.05 step 0.05 would be 1.1 — just check 1-decimal contract
    expect(stepWeight(10, 2.5, 1, opts)).toBe(12.5);
    expect(stepWeight(12.5, 2.5, -1, opts)).toBe(10);
  });

  // ── Off-grid input — no grid-snapping ─────────────────────────────────────
  it("off-grid: 47.5 + step 5 = 52.5 (no snap to 50)", () => {
    expect(stepWeight(47.5, 5, 1, opts)).toBe(52.5);
  });

  it("off-grid: 47.5 - step 5 = 42.5", () => {
    expect(stepWeight(47.5, 5, -1, opts)).toBe(42.5);
  });

  // ── Null / 0 start ────────────────────────────────────────────────────────
  it("null value + step up → step (first tap from empty = step)", () => {
    // null treated as 0; 0 + 2.5 = 2.5
    expect(stepWeight(null, 2.5, 1, opts)).toBe(2.5);
  });

  it("null value + step down → 0 (clamped at min)", () => {
    // null treated as 0; 0 - 2.5 < min → clamp to 0
    expect(stepWeight(null, 2.5, -1, opts)).toBe(0);
  });

  it("undefined value + step up → step", () => {
    expect(stepWeight(undefined, 5, 1, opts)).toBe(5);
  });

  // ── Default opts (no min/max) ─────────────────────────────────────────────
  it("uses defaults (min=0) when opts omitted", () => {
    // 0 - step → clamp to 0
    expect(stepWeight(0, 5, -1)).toBe(0);
  });

  // ── Large step / exact values ─────────────────────────────────────────────
  it("step 5 from 0 yields 5", () => {
    expect(stepWeight(0, 5, 1, opts)).toBe(5);
  });

  it("step 5 from 495 yields 500 (max)", () => {
    expect(stepWeight(495, 5, 1, opts)).toBe(500);
  });

  it("step 2.5 from 497.5 yields 500 (max)", () => {
    expect(stepWeight(497.5, 2.5, 1, opts)).toBe(500);
  });

  // ── NumericStepper refactor characterization (BLD-2674) ──────────────────
  // The stepWeight extraction changes NumericStepper behavior at off-grid values
  // within one step above min. Old inline guard silently skipped onValueChange
  // when next < min; new guard clamps to min and fires. These tests document the
  // actual contract — not claimed "no-op parity".

  it("characterization: increment 10 by step 2.5 → 12.5 (unchanged from old)", () => {
    expect(stepWeight(10, 2.5, 1, { min: 0 })).toBe(12.5);
  });

  it("characterization: decrement 10 by step 5 → 5 (unchanged from old)", () => {
    expect(stepWeight(10, 5, -1, { min: 0 })).toBe(5);
  });

  it("characterization: value at min — decrement clamps to min (unchanged from old)", () => {
    expect(stepWeight(0, 2.5, -1, { min: 0 })).toBe(0);
  });

  it("characterization: value at max 9999 — increment clamps to max (unchanged from old)", () => {
    expect(stepWeight(9999, 1, 1, { min: 0, max: 9999 })).toBe(9999);
  });

  // ── Divergent: off-grid value within one step above min ───────────────────
  // NEW: clamps to min and returns min (callers can check next !== value to fire).
  // OLD (NumericStepper inline): next < min guard → no call. New is intentionally better.

  it("divergent: value=1, step=2.5, min=0 → clamps to 0", () => {
    // Old: Math.round((1-2.5)*10)/10 = -1.5 → guarded, no-call
    // New: stepWeight(1, 2.5, -1, {min:0}) = max(0,-1.5) = 0 → caller fires
    expect(stepWeight(1, 2.5, -1, { min: 0 })).toBe(0);
  });

  it("divergent: value=2.5, step=5, min=0 → clamps to 0", () => {
    expect(stepWeight(2.5, 5, -1, { min: 0 })).toBe(0);
  });

  it("divergent: value=2, step=5, min=1 → clamps to 1", () => {
    expect(stepWeight(2, 5, -1, { min: 1 })).toBe(1);
  });

  // ── Micro-loading exactness (BLD-3517 QD requirements) ───────────────────
  describe("micro-loading exactness", () => {
    it("preserves quarter-step precision: 100 + 1.25 + 1.25 = 102.5 (not 102.6)", () => {
      let v = 100;
      v = stepWeight(v, 1.25, 1, opts);
      expect(v).toBe(101.25);
      v = stepWeight(v, 1.25, 1, opts);
      expect(v).toBe(102.5);
    });

    it("ensures decrement mirrors increment without drift: 100 + 1.25 - 1.25 = 100", () => {
      let v = 100;
      v = stepWeight(v, 1.25, 1, opts);
      v = stepWeight(v, 1.25, -1, opts);
      expect(v).toBe(100);
    });

    it("exact repeated additions: 5 x +1.25 from 100 = 106.25", () => {
      let v = 100;
      for (let i = 0; i < 5; i++) {
        v = stepWeight(v, 1.25, 1, opts);
      }
      expect(v).toBe(106.25);
    });

    it("repeated 2.5 lb taps are exact", () => {
      let v = 100;
      for (let i = 0; i < 10; i++) {
        v = stepWeight(v, 2.5, 1, opts);
      }
      expect(v).toBe(125);
    });
  });
});
