/**
 * BLD-1174 — AC #261: Legacy analytics parity (no regression on pre-migration data)
 *
 * GIVEN an existing user opens a pre-migration session with no advanced sets
 * WHEN they view Strength Overview, Session Detail, and Plateau dashboards
 * THEN every number matches what they saw on v0.26.x exactly (no analytic regression)
 *
 * Legacy rows have no segments. The backfill migration sets:
 *   cached_volume_kg = weight * reps
 *   cached_e1rm_kg   = weight * (1 + reps / 30)
 *
 * This test verifies that computeSetCacheValues with empty segments produces
 * the same values as the legacy formulas for normal sets.
 */
import { computeSetCacheValues } from "@/lib/db/sets";

// Legacy set type definitions (pre-BLD-1168)
const LEGACY_SET_TYPES = ["normal", "warmup", "dropset", "failure"] as const;

describe("legacy parity — computeSetCacheValues with no segments", () => {
  const fixtures = [
    { weight: 100, reps: 5,  label: "5x100 (compound)" },
    { weight: 60,  reps: 10, label: "10x60 (moderate)" },
    { weight: 20,  reps: 12, label: "12x20 (light)" },
    { weight: 80,  reps: 3,  label: "3x80 (low-rep strength)" },
    { weight: 0,   reps: 15, label: "bodyweight (weight=0)" },
  ];

  for (const fixture of fixtures) {
    for (const setType of LEGACY_SET_TYPES) {
      describe(`${setType} set: ${fixture.label}`, () => {
        const parent = { weight: fixture.weight, reps: fixture.reps, set_type: setType };
        const result = computeSetCacheValues(parent, []);

        it("cached_volume_kg = weight * reps (legacy formula)", () => {
          const expected = fixture.weight * fixture.reps;
          expect(result.cachedVolumeKg).toBeCloseTo(expected, 2);
        });

        it("cached_e1rm_kg = weight * (1 + reps/30) (legacy Epley formula)", () => {
          const expected = fixture.weight * (1 + fixture.reps / 30);
          expect(result.cachedE1rmKg).toBeCloseTo(expected, 2);
        });

        it("totalReps = parent.reps (no segments)", () => {
          expect(result.totalReps).toBe(fixture.reps);
        });
      });
    }
  }
});

describe("legacy parity — warmup sets excluded from volume (handled at query level)", () => {
  it("warmup set: computeSetCacheValues still returns weight*reps for consistency", () => {
    // Warmup sets are excluded at the query level (set_type != 'warmup'),
    // but the cached value should still be computed correctly.
    const parent = { weight: 50, reps: 8, set_type: "warmup" as const };
    const result = computeSetCacheValues(parent, []);
    expect(result.cachedVolumeKg).toBeCloseTo(400, 2);
    expect(result.cachedE1rmKg).toBeCloseTo(50 * (1 + 8 / 30), 2);
  });
});

describe("legacy parity — null/zero weight sets (bodyweight exercises)", () => {
  it("weight=null returns 0 volume and 0 e1rm", () => {
    const parent = { weight: null as unknown as number, reps: 15, set_type: "normal" as const };
    const result = computeSetCacheValues(parent, []);
    expect(result.cachedVolumeKg).toBe(0);
    expect(result.cachedE1rmKg).toBe(0);
  });

  it("reps=0 returns 0 volume and 0 e1rm", () => {
    const parent = { weight: 100, reps: 0, set_type: "normal" as const };
    const result = computeSetCacheValues(parent, []);
    expect(result.cachedVolumeKg).toBe(0);
    expect(result.cachedE1rmKg).toBe(0);
  });
});

describe("legacy parity — no inflation from cached_e1rm_kg vs old formula", () => {
  it("5x100 e1rm is same as legacy: 100*(1+5/30)=116.67", () => {
    const result = computeSetCacheValues({ weight: 100, reps: 5, set_type: "normal" }, []);
    expect(result.cachedE1rmKg).toBeCloseTo(116.67, 1);
  });

  it("10x60 e1rm is same as legacy: 60*(1+10/30)=80", () => {
    const result = computeSetCacheValues({ weight: 60, reps: 10, set_type: "normal" }, []);
    expect(result.cachedE1rmKg).toBeCloseTo(80, 2);
  });

  it("3x80 volume is same as legacy: 80*3=240", () => {
    const result = computeSetCacheValues({ weight: 80, reps: 3, set_type: "normal" }, []);
    expect(result.cachedVolumeKg).toBeCloseTo(240, 2);
  });
});
