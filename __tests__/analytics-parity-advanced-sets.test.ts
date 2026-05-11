/**
 * BLD-1174 — AC #268: Analytics parity for advanced sets
 *
 * GIVEN a fixture session containing:
 *   - one rest_pause (8+3+2 @ 100kg)
 *   - one cluster (3+3+2 @ 100/100/95kg with segment-level weight overrides)
 *   - one myo_reps (15+5+5+4+3 @ 25kg)
 * WHEN every analytics surface is queried
 * THEN every numeric output matches the hand-computed segment-aware reference within ±0.01
 *
 * This test verifies the math correctness of the cached column values that
 * the analytics surfaces now read, proving the cached_volume_kg / cached_e1rm_kg
 * approach produces segment-aware values (not legacy weight*reps).
 */
import { computeSetCacheValues } from "@/lib/db/sets";

// ─── Fixture definitions ────────────────────────────────────────────────────

/**
 * rest_pause: 8+3+2 @ 100kg
 * All segments inherit parent weight (100kg).
 * volume = (8+3+2)*100 = 1300 kg·reps
 * e1rm = 100*(1+8/30) = 126.67 (heaviest segment)
 */
const REST_PAUSE_PARENT = { weight: 100, reps: 13, set_type: "rest_pause" as const };
const REST_PAUSE_SEGMENTS = [
  { reps: 8, weight: null, rest_after_seconds: null, completed_at: 1000 },
  { reps: 3, weight: null, rest_after_seconds: 15, completed_at: 2000 },
  { reps: 2, weight: null, rest_after_seconds: 15, completed_at: 3000 },
];

/**
 * cluster: 3+3+2 @ 100/100/95kg (segment-level weight overrides on last segment)
 * volume = 3*100 + 3*100 + 2*95 = 300+300+190 = 790 kg·reps
 * e1rm = MAX(100*(1+3/30), 100*(1+3/30), 95*(1+2/30))
 *       = MAX(110, 110, 101.33) = 110
 */
const CLUSTER_PARENT = { weight: 100, reps: 8, set_type: "cluster" as const };
const CLUSTER_SEGMENTS = [
  { reps: 3, weight: 100, rest_after_seconds: null, completed_at: 1000 },
  { reps: 3, weight: 100, rest_after_seconds: 30, completed_at: 2000 },
  { reps: 2, weight: 95, rest_after_seconds: 30, completed_at: 3000 },
];

/**
 * myo_reps: activation 15 + clusters 5+5+4+3 @ 25kg
 * volume = (15+5+5+4+3)*25 = 32*25 = 800 kg·reps
 * e1rm uses ALL segments per cached_e1rm_kg definition (MAX):
 *   25*(1+15/30)=37.5, 25*(1+5/30)=29.17, 25*(1+5/30)=29.17, 25*(1+4/30)=28.33, 25*(1+3/30)=27.5
 *   MAX = 37.5 (activation set)
 */
const MYO_REPS_PARENT = { weight: 25, reps: 32, set_type: "myo_reps" as const };
const MYO_REPS_SEGMENTS = [
  { reps: 15, weight: null, rest_after_seconds: null, completed_at: 1000 },
  { reps: 5,  weight: null, rest_after_seconds: 5, completed_at: 2000 },
  { reps: 5,  weight: null, rest_after_seconds: 5, completed_at: 3000 },
  { reps: 4,  weight: null, rest_after_seconds: 5, completed_at: 4000 },
  { reps: 3,  weight: null, rest_after_seconds: 5, completed_at: 5000 },
];

// ─── Helper: hand-compute expected values ──────────────────────────────────

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("rest_pause (8+3+2 @ 100kg)", () => {
  let result: ReturnType<typeof computeSetCacheValues>;

  beforeEach(() => {
    result = computeSetCacheValues(REST_PAUSE_PARENT, REST_PAUSE_SEGMENTS);
  });

  it("cached_volume_kg = (8+3+2)*100 = 1300", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(1300, 1);
  });

  it("cached_e1rm_kg = Epley of heaviest segment (8 reps @ 100kg) = 126.67", () => {
    const expected = epley(100, 8);
    expect(result.cachedE1rmKg).toBeCloseTo(expected, 2);
  });

  it("totalReps = 8+3+2 = 13", () => {
    expect(result.totalReps).toBe(13);
  });

  it("e1rm is NOT the legacy formula on the sum: 100*(1+13/30)=143.33", () => {
    const legacy = epley(100, 13);
    expect(result.cachedE1rmKg).not.toBeCloseTo(legacy, 0);
  });
});

describe("cluster (3+3+2 @ 100/100/95kg with segment weight overrides)", () => {
  let result: ReturnType<typeof computeSetCacheValues>;

  beforeEach(() => {
    result = computeSetCacheValues(CLUSTER_PARENT, CLUSTER_SEGMENTS);
  });

  it("cached_volume_kg = 3*100 + 3*100 + 2*95 = 790", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(790, 1);
  });

  it("cached_e1rm_kg = MAX(Epley(100,3), Epley(100,3), Epley(95,2)) = 110", () => {
    const expected = Math.max(epley(100, 3), epley(100, 3), epley(95, 2));
    expect(result.cachedE1rmKg).toBeCloseTo(expected, 2);
  });

  it("segment weight override (95kg) is used, not parent weight (100kg) for last segment", () => {
    const e1rmWith95 = epley(95, 2);  // 95*(1+2/30) = 101.33
    const e1rmWith100 = epley(100, 2); // 100*(1+2/30) = 106.67
    // Since MAX is 110 (from first/second segments), either works, but confirm the calc uses 95
    // by checking the volume (which uses 95 for the 2-rep segment)
    const volumeWith100 = (3 + 3 + 2) * 100; // 800 — wrong
    const volumeWith95 = 3*100 + 3*100 + 2*95; // 790 — correct
    expect(result.cachedVolumeKg).toBeCloseTo(volumeWith95, 1);
    expect(result.cachedVolumeKg).not.toBeCloseTo(volumeWith100, 0);
    void e1rmWith95; void e1rmWith100; // used in calculations above
  });

  it("totalReps = 3+3+2 = 8", () => {
    expect(result.totalReps).toBe(8);
  });
});

describe("myo_reps (activation 15 + clusters 5+5+4+3 @ 25kg)", () => {
  let result: ReturnType<typeof computeSetCacheValues>;

  beforeEach(() => {
    result = computeSetCacheValues(MYO_REPS_PARENT, MYO_REPS_SEGMENTS);
  });

  it("cached_volume_kg = (15+5+5+4+3)*25 = 32*25 = 800", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(800, 1);
  });

  it("cached_e1rm_kg = Epley of activation set (15 reps @ 25kg) = 37.5", () => {
    const expected = epley(25, 15); // 25*(1+15/30) = 37.5
    expect(result.cachedE1rmKg).toBeCloseTo(expected, 2);
  });

  it("e1rm is NOT the sum-based formula: 25*(1+32/30)=51.67", () => {
    const legacy = epley(25, 32);
    expect(result.cachedE1rmKg).not.toBeCloseTo(legacy, 0);
  });

  it("totalReps = 15+5+5+4+3 = 32", () => {
    expect(result.totalReps).toBe(32);
  });
});

describe("mixed fixture: fixture session totals", () => {
  it("total volume across all three advanced sets = 1300+790+800 = 2890 kg·reps", () => {
    const rp = computeSetCacheValues(REST_PAUSE_PARENT, REST_PAUSE_SEGMENTS);
    const cl = computeSetCacheValues(CLUSTER_PARENT, CLUSTER_SEGMENTS);
    const mr = computeSetCacheValues(MYO_REPS_PARENT, MYO_REPS_SEGMENTS);

    const totalVolume = rp.cachedVolumeKg + cl.cachedVolumeKg + mr.cachedVolumeKg;
    expect(totalVolume).toBeCloseTo(2890, 1);
  });

  it("best e1rm across all three is rest_pause 126.67kg (not 143.33 legacy inflated)", () => {
    const rp = computeSetCacheValues(REST_PAUSE_PARENT, REST_PAUSE_SEGMENTS);
    const cl = computeSetCacheValues(CLUSTER_PARENT, CLUSTER_SEGMENTS);
    const mr = computeSetCacheValues(MYO_REPS_PARENT, MYO_REPS_SEGMENTS);

    const bestE1rm = Math.max(rp.cachedE1rmKg, cl.cachedE1rmKg, mr.cachedE1rmKg);
    // rest_pause: 126.67, cluster: 110, myo_reps: 37.5
    expect(bestE1rm).toBeCloseTo(epley(100, 8), 2); // 126.67
    expect(bestE1rm).not.toBeCloseTo(epley(100, 13), 0); // not 143.33
  });
});
