/**
 * BLD-1183 — computeSetCacheValues: e1RM cap at reps <= 12.
 *
 * The migration backfill (lib/db/migrations.ts:261-264) caps cached_e1rm_kg = 0
 * for legacy sets where reps > 12, restoring the pre-BLD-1168 analytics gate.
 * The live write path must match this cap so new and legacy sets have identical
 * cache semantics for identical inputs.
 */

import { computeSetCacheValues } from "../../../lib/db/sets";

describe("computeSetCacheValues — e1RM reps<=12 cap (BLD-1183)", () => {
  it("returns cachedE1rmKg = 0 when reps > 12 (high-rep normal set)", () => {
    const result = computeSetCacheValues(
      { weight: 100, reps: 15, isAdvancedSet: false },
      [],
    );
    expect(result.cachedVolumeKg).toBe(1500); // volume is always weight * reps
    expect(result.cachedE1rmKg).toBe(0);       // reps > 12 → capped to 0
    expect(result.totalReps).toBe(15);
  });

  it("returns non-zero cachedE1rmKg when reps === 12 (boundary: at cap)", () => {
    const result = computeSetCacheValues(
      { weight: 100, reps: 12, isAdvancedSet: false },
      [],
    );
    expect(result.cachedVolumeKg).toBe(1200);
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 12 / 30), 4); // 140
    expect(result.totalReps).toBe(12);
  });

  it("returns non-zero cachedE1rmKg when reps < 12 (normal working set)", () => {
    const result = computeSetCacheValues(
      { weight: 80, reps: 5, isAdvancedSet: false },
      [],
    );
    expect(result.cachedVolumeKg).toBe(400);
    expect(result.cachedE1rmKg).toBeCloseTo(80 * (1 + 5 / 30), 4);
    expect(result.totalReps).toBe(5);
  });

  it("returns cachedE1rmKg = 0 when reps === 0 (guard-rail)", () => {
    const result = computeSetCacheValues(
      { weight: 100, reps: 0, isAdvancedSet: false },
      [],
    );
    expect(result.cachedE1rmKg).toBe(0);
  });

  it("advanced set per-segment e1RM: segment reps <= 12 are not capped", () => {
    // Segment reps are always small by design — ensure advanced path is unaffected
    const result = computeSetCacheValues(
      { weight: 80, reps: null, isAdvancedSet: true },
      [
        { weight: 80, reps: 8 },
        { weight: 80, reps: 3 },
      ],
    );
    // e1RM = max of per-segment Epley values
    const e1rm8 = 80 * (1 + 8 / 30);
    const e1rm3 = 80 * (1 + 3 / 30);
    expect(result.cachedE1rmKg).toBeCloseTo(Math.max(e1rm8, e1rm3), 4);
    expect(result.totalReps).toBe(11);
  });
});
