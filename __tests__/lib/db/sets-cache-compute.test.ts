// Unit tests for computeSetCacheValues — BLD-1183: reps<=12 e1RM cap alignment with backfill
import { computeSetCacheValues } from "../../../lib/db/sets";

describe("computeSetCacheValues — legacy single-set branch (no segments)", () => {
  it("caps cachedE1rmKg to 0 when reps > 12 (aligns with backfill cap)", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 15, isAdvancedSet: false }, []);
    expect(result.cachedVolumeKg).toBe(1500);
    expect(result.cachedE1rmKg).toBe(0);
    expect(result.totalReps).toBe(15);
  });

  it("computes e1RM normally when reps === 12 (boundary: still valid)", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 12, isAdvancedSet: false }, []);
    expect(result.cachedVolumeKg).toBe(1200);
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 12 / 30));
    expect(result.totalReps).toBe(12);
  });

  it("computes e1RM normally when reps === 1", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 1, isAdvancedSet: false }, []);
    expect(result.cachedVolumeKg).toBe(100);
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 1 / 30));
    expect(result.totalReps).toBe(1);
  });

  it("returns zero e1RM when reps === 0", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 0, isAdvancedSet: false }, []);
    expect(result.cachedVolumeKg).toBe(0);
    expect(result.cachedE1rmKg).toBe(0);
    expect(result.totalReps).toBe(0);
  });

  it("caps cachedE1rmKg to 0 when reps === 13 (first rep above cap)", () => {
    const result = computeSetCacheValues({ weight: 80, reps: 13, isAdvancedSet: false }, []);
    expect(result.cachedVolumeKg).toBe(1040);
    expect(result.cachedE1rmKg).toBe(0);
    expect(result.totalReps).toBe(13);
  });

  it("returns zeros for advanced set with no segments (unchanged)", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 15, isAdvancedSet: true }, []);
    expect(result.cachedVolumeKg).toBe(0);
    expect(result.cachedE1rmKg).toBe(0);
    expect(result.totalReps).toBe(0);
  });
});

describe("computeSetCacheValues — segment loop (advanced sets) — e1RM cap not applied", () => {
  it("segment loop e1RM is not capped (segment reps are typically small)", () => {
    // Advanced set segments — the cap does not apply here; segments have small reps by design
    const result = computeSetCacheValues(
      { weight: 100, reps: null, isAdvancedSet: true },
      [
        { reps: 8, weight: 100 },
        { reps: 6, weight: 100 },
      ],
    );
    expect(result.cachedVolumeKg).toBe(1400);
    // MAX e1RM across segments: 100 * (1 + 8/30) ≈ 126.67
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 8 / 30));
    expect(result.totalReps).toBe(14);
  });
});
