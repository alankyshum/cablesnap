/**
 * BLD-1168 AC #266 — Property test: parent.reps == Σ segments.reps AND
 * parent.cached_volume_kg == Σ (seg.reps × (seg.weight ?? parent.weight))
 * after any sequence of insert/update/delete mutations.
 *
 * Also covers the advanced-set-zero-segment invariant (AC #266 plan:76,117,266):
 * when an advanced set type (rest_pause/cluster/myo_reps) has all segments deleted,
 * reps=0, cached_volume_kg=0, cached_e1rm_kg=0 (not the legacy parent fallback).
 *
 * Uses the pure computeSetCacheValues() helper so no DB mocking is required.
 * 1000 random sequences are executed.
 *
 * Reproducible failures: set SEED=<number> env var to replay a failed trial.
 * The seed is logged before each run so failures can be replayed deterministically.
 */
import { computeSetCacheValues, ADVANCED_SET_TYPES } from "../lib/db/sets";

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : Date.now();
const rand = mulberry32(SEED);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return rand() * (max - min) + min;
}

function maybe<T>(value: T, prob = 0.2): T | null {
  return rand() < prob ? null : value;
}

type Seg = { reps: number; weight: number | null };

/** Apply one random mutation to a segment list and return the new list. */
function applyMutation(
  segments: Seg[],
): Seg[] {
  const ops = ["insert", "update", "delete"] as const;
  const op = ops[randInt(0, 2)];

  if (op === "insert" || segments.length === 0) {
    return [
      ...segments,
      { reps: randInt(1, 20), weight: maybe(randFloat(10, 200), 0.3) },
    ];
  }
  if (op === "delete") {
    const idx = randInt(0, segments.length - 1);
    return segments.filter((_, i) => i !== idx);
  }
  // update
  const idx = randInt(0, segments.length - 1);
  const updated = [...segments];
  updated[idx] = {
    reps: randInt(1, 20),
    weight: maybe(randFloat(10, 200), 0.3),
  };
  return updated;
}

// ─── Property assertion ──────────────────────────────────────────────────────

function expectedReps(parent: { reps: number | null; isAdvancedSet?: boolean }, segments: Seg[]): number {
  if (segments.length === 0) return parent.isAdvancedSet ? 0 : (parent.reps ?? 0);
  return segments.reduce((sum, s) => sum + s.reps, 0);
}

function expectedVolume(parent: { weight: number | null; reps: number | null; isAdvancedSet?: boolean }, segments: Seg[]): number {
  if (segments.length === 0) {
    if (parent.isAdvancedSet) return 0;
    return (parent.weight ?? 0) * (parent.reps ?? 0);
  }
  return segments.reduce((sum, s) => sum + s.reps * (s.weight ?? parent.weight ?? 0), 0);
}

function expectedE1rm(parent: { weight: number | null; reps: number | null; isAdvancedSet?: boolean }, segments: Seg[]): number {
  if (segments.length === 0) {
    if (parent.isAdvancedSet) return 0;
    const r = parent.reps ?? 0;
    const w = parent.weight ?? 0;
    return r > 0 ? w * (1 + r / 30) : 0;
  }
  let maxE1rm = 0;
  for (const seg of segments) {
    const sw = seg.weight ?? parent.weight ?? 0;
    const e = seg.reps > 0 ? sw * (1 + seg.reps / 30) : 0;
    if (e > maxE1rm) maxE1rm = e;
  }
  return maxE1rm;
}

function assertInvariant(
  parent: { weight: number | null; reps: number | null; isAdvancedSet?: boolean },
  segments: Seg[],
): void {
  const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, segments);
  expect(totalReps).toBe(expectedReps(parent, segments));
  expect(cachedVolumeKg).toBeCloseTo(expectedVolume(parent, segments), 6);
  expect(cachedE1rmKg).toBeCloseTo(expectedE1rm(parent, segments), 6);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BLD-1168 AC#266 — parent-segment cache invariants", () => {
  it("no-segment (legacy) row: volume = weight*reps, e1RM = Epley formula", () => {
    const parent = { weight: 100, reps: 8 };
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, []);
    expect(cachedVolumeKg).toBeCloseTo(800, 6);
    expect(cachedE1rmKg).toBeCloseTo(100 * (1 + 8 / 30), 6);
    expect(totalReps).toBe(8);
  });

  it("rest-pause 8+3+2 @ 100kg: volume=1300, e1RM from heaviest segment", () => {
    const parent = { weight: 100, reps: null };
    const segments: Seg[] = [
      { reps: 8, weight: null },
      { reps: 3, weight: null },
      { reps: 2, weight: null },
    ];
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, segments);
    expect(cachedVolumeKg).toBeCloseTo(1300, 6);  // (8+3+2) * 100
    expect(totalReps).toBe(13);
    // e1RM from segment 1 (8 reps): 100 * (1 + 8/30) = 126.667
    expect(cachedE1rmKg).toBeCloseTo(100 * (1 + 8 / 30), 4);
  });

  it("cluster 3+3+2 @ 100/100/95kg: volume=800, e1RM from 100kg×3 segment", () => {
    const parent = { weight: 100, reps: null };
    const segments: Seg[] = [
      { reps: 3, weight: 100 },
      { reps: 3, weight: 100 },
      { reps: 2, weight: 95 },
    ];
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, segments);
    expect(cachedVolumeKg).toBeCloseTo(3 * 100 + 3 * 100 + 2 * 95, 6);  // 790
    expect(totalReps).toBe(8);
    // MAX e1RM: 100*(1+3/30)=110 vs 100*(1+3/30)=110 vs 95*(1+2/30)≈101.3 → 110
    const expected = Math.max(
      100 * (1 + 3 / 30),
      100 * (1 + 3 / 30),
      95 * (1 + 2 / 30),
    );
    expect(cachedE1rmKg).toBeCloseTo(expected, 4);
  });

  it("myo-reps 15+5+5+4+3 @ 25kg: volume=800, e1RM from activation (15 reps)", () => {
    const parent = { weight: 25, reps: null };
    const segments: Seg[] = [
      { reps: 15, weight: null },
      { reps: 5, weight: null },
      { reps: 5, weight: null },
      { reps: 4, weight: null },
      { reps: 3, weight: null },
    ];
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, segments);
    expect(cachedVolumeKg).toBeCloseTo((15 + 5 + 5 + 4 + 3) * 25, 6);  // 800
    expect(totalReps).toBe(32);
    // MAX e1RM from activation: 25 * (1 + 15/30) = 37.5
    expect(cachedE1rmKg).toBeCloseTo(25 * (1 + 15 / 30), 4);
  });

  it("segment with NULL weight inherits parent weight", () => {
    const parent = { weight: 80, reps: null };
    const segments: Seg[] = [
      { reps: 5, weight: null },   // inherits 80kg
      { reps: 5, weight: 60 },     // explicit override
    ];
    const { cachedVolumeKg } = computeSetCacheValues(parent, segments);
    expect(cachedVolumeKg).toBeCloseTo(5 * 80 + 5 * 60, 6);  // 700
  });

  it("advanced set (rest_pause) with zero segments yields zeros", () => {
    const parent = { weight: 100, reps: 13, isAdvancedSet: true };
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, []);
    expect(totalReps).toBe(0);
    expect(cachedVolumeKg).toBe(0);
    expect(cachedE1rmKg).toBe(0);
  });

  it("advanced set: 8+3+2 segments → delete all → zeros (deterministic delete-down sequence)", () => {
    const parent = { weight: 100, reps: null, isAdvancedSet: true };
    let segments: Seg[] = [
      { reps: 8, weight: null },
      { reps: 3, weight: null },
      { reps: 2, weight: null },
    ];

    // Verify non-zero state with all segments present
    const withSegments = computeSetCacheValues(parent, segments);
    expect(withSegments.totalReps).toBe(13);
    expect(withSegments.cachedVolumeKg).toBeCloseTo(1300, 4);

    // Delete segments one by one — final delete must yield zeros
    segments = segments.slice(1);
    assertInvariant(parent, segments); // 2 segments: 3+2

    segments = segments.slice(1);
    assertInvariant(parent, segments); // 1 segment: 2

    segments = [];
    assertInvariant(parent, segments); // 0 segments → zeros
  });

  it.each(["rest_pause", "cluster", "myo_reps"] as const)(
    "ADVANCED_SET_TYPES includes %s",
    (type) => {
      expect(ADVANCED_SET_TYPES.has(type)).toBe(true);
    }
  );

  it.each(["normal", "warmup", "dropset", "failure"] as const)(
    "ADVANCED_SET_TYPES excludes legacy type %s",
    (type) => {
      expect(ADVANCED_SET_TYPES.has(type)).toBe(false);
    }
  );

  it("legacy set (normal) with zero segments uses parent reps (not zeroed)", () => {
    const parent = { weight: 100, reps: 8, isAdvancedSet: false };
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, []);
    expect(totalReps).toBe(8);
    expect(cachedVolumeKg).toBeCloseTo(800, 4);
    expect(cachedE1rmKg).toBeCloseTo(100 * (1 + 8 / 30), 4);
  });

  it("parent with null weight and null reps yields zeros", () => {
    const parent = { weight: null, reps: null };
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(parent, []);
    expect(cachedVolumeKg).toBe(0);
    expect(cachedE1rmKg).toBe(0);
    expect(totalReps).toBe(0);
  });

  it("property: invariants hold across 1000 random mutation sequences (legacy and advanced sets)", () => {
    // Log seed so a failed trial can be replayed: SEED=<value> npx jest parent-segment
    console.log(`[property test] SEED=${SEED}`);
    const allSetTypes = ["normal", "warmup", "dropset", "failure", "rest_pause", "cluster", "myo_reps"] as const;
    for (let trial = 0; trial < 1000; trial++) {
      const parentWeight = rand() < 0.1 ? null : randFloat(10, 300);
      const parentReps = rand() < 0.1 ? null : randInt(1, 20);
      const setType = allSetTypes[randInt(0, allSetTypes.length - 1)];
      const isAdvancedSet = ADVANCED_SET_TYPES.has(setType);
      const parent = { weight: parentWeight, reps: parentReps, isAdvancedSet };

      // Start with 0-4 initial segments
      let segments: Seg[] = [];
      const initialCount = randInt(0, 4);
      for (let i = 0; i < initialCount; i++) {
        segments = applyMutation(segments);
      }

      // Apply 3-8 additional mutations
      const mutationCount = randInt(3, 8);
      for (let m = 0; m < mutationCount; m++) {
        segments = applyMutation(segments);
        assertInvariant(parent, segments);
      }
    }
  });
});
