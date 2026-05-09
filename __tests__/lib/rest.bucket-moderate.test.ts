/**
 * BLD-1110 — moderate RPE bucket boundary tests.
 *
 * Bucket map:
 *   null          → midOrNull  (×1.0)
 *   rpe ≤ 6       → low        (×0.8)
 *   6 < rpe < 8.5 → moderate   (×1.1)   ← new bucket
 *   8.5 ≤ rpe < 9.5 → high     (×1.15)
 *   rpe ≥ 9.5     → veryHigh   (×1.3)
 */
import { rpeBucket, resolveRestSeconds, type RpeBucket } from "../../lib/rest";
import type { RestInputs } from "../../lib/rest";

const base = (rpe: number | null): RestInputs => ({
  baseRestSeconds: 90,
  setType: "normal",
  rpe,
  category: "standard",
});

describe("rpeBucket — moderate bucket boundaries (BLD-1110)", () => {
  it("null → midOrNull", () => {
    expect(rpeBucket(null)).toBe<RpeBucket>("midOrNull");
  });

  it("0 → low", () => {
    expect(rpeBucket(0)).toBe<RpeBucket>("low");
  });

  it("6.0 → low (boundary: ≤ 6)", () => {
    expect(rpeBucket(6)).toBe<RpeBucket>("low");
  });

  it("6.5 → moderate (just above 6 boundary)", () => {
    expect(rpeBucket(6.5)).toBe<RpeBucket>("moderate");
  });

  it("7.0 → moderate (chip Easy value)", () => {
    expect(rpeBucket(7)).toBe<RpeBucket>("moderate");
  });

  it("7.5 → moderate (chip Moderate value)", () => {
    expect(rpeBucket(7.5)).toBe<RpeBucket>("moderate");
  });

  it("8.0 → moderate", () => {
    expect(rpeBucket(8)).toBe<RpeBucket>("moderate");
  });

  it("8.5 → high (boundary: ≥ 8.5)", () => {
    expect(rpeBucket(8.5)).toBe<RpeBucket>("high");
  });

  it("9.0 → high", () => {
    expect(rpeBucket(9)).toBe<RpeBucket>("high");
  });

  it("9.5 → veryHigh (boundary)", () => {
    expect(rpeBucket(9.5)).toBe<RpeBucket>("veryHigh");
  });

  it("10.0 → veryHigh", () => {
    expect(rpeBucket(10)).toBe<RpeBucket>("veryHigh");
  });
});

describe("resolveRestSeconds — moderate bucket math", () => {
  it("RPE 7, standard, base 90 → 100s (90 × 1.0setType × 1.1moderate × 1.0standard)", () => {
    // round5(90 × 1.0 × 1.1 × 1.0) = round5(99) = 100
    const r = resolveRestSeconds(base(7));
    expect(r.totalSeconds).toBe(100);
  });

  it("RPE 7.5, standard, base 90 → 100s", () => {
    const r = resolveRestSeconds(base(7.5));
    expect(r.totalSeconds).toBe(100);
  });

  it("RPE 7, cable, base 90 → 80s (moderate wins; no double-count with category)", () => {
    // round5(90 × 1.0 × 1.1 × 0.8) = round5(79.2) = 80
    const r = resolveRestSeconds({ ...base(7), category: "cable" });
    expect(r.totalSeconds).toBe(80);
    expect(r.reasonShort).toBe("Moderate · RPE 7");
  });

  it("RPE 7, bodyweight, base 90 → 85s", () => {
    // round5(90 × 1.0 × 1.1 × 0.85) = round5(84.15) = 85
    const r = resolveRestSeconds({ ...base(7), category: "bodyweight" });
    expect(r.totalSeconds).toBe(85);
  });

  it("moderate reason label shows 'Moderate · RPE X' for integer RPE", () => {
    const r = resolveRestSeconds(base(7));
    expect(r.reasonShort).toBe("Moderate · RPE 7");
  });

  it("moderate reason label shows 'Moderate · RPE X' for decimal RPE", () => {
    const r = resolveRestSeconds(base(7.5));
    expect(r.reasonShort).toBe("Moderate · RPE 7.5");
  });

  it("RPE 6 (low) has different label than RPE 6.5 (moderate)", () => {
    const low = resolveRestSeconds(base(6));
    const mod = resolveRestSeconds(base(6.5));
    expect(low.reasonShort).not.toContain("Moderate");
    expect(mod.reasonShort).toContain("Moderate");
  });

  it("RPE 8.5 (high) has different label than RPE 8.0 (moderate)", () => {
    const high = resolveRestSeconds(base(8.5));
    const mod = resolveRestSeconds(base(8.0));
    expect(high.reasonShort).not.toContain("Moderate");
    expect(mod.reasonShort).toContain("Moderate");
  });
});
