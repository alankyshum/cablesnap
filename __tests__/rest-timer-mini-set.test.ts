/**
 * BLD-1173 — AC #259: IntraMiniSetRest mode (rest-pause set in progress)
 *
 * GIVEN a `rest_pause` set in progress
 * WHEN the user completes a mini-set mid-parent
 * THEN the rest timer resolves to ≤30 seconds (intra) and shows "Mini-set N of ?" badge
 * WHEN the parent set is marked complete
 * THEN normal inter-set rest resumes
 */
import {
  resolveIntraMiniSetRest,
  INTRA_MINI_SET_DEFAULTS,
  isAdvancedSetType,
  type AdvancedSetType,
} from "@/lib/rest-resolver";

describe("resolveIntraMiniSetRest — rest_pause mid-parent (AC #259)", () => {
  it("returns intra mode with ≤30s when mini-set completes mid-parent", () => {
    const result = resolveIntraMiniSetRest("rest_pause", false, 1, 3);
    expect(result.mode).toBe("intra");
    if (result.mode === "intra") {
      expect(result.seconds).toBeLessThanOrEqual(30);
      expect(result.seconds).toBe(INTRA_MINI_SET_DEFAULTS.rest_pause);
    }
  });

  it("shows 'Mini-set N of ?' badge with known total", () => {
    const result = resolveIntraMiniSetRest("rest_pause", false, 2, 3);
    expect(result.mode).toBe("intra");
    if (result.mode === "intra") {
      expect(result.badge).toBe("Mini-set 2 of 3");
    }
  });

  it("shows 'Mini-set N of ?' badge with unknown total (0)", () => {
    const result = resolveIntraMiniSetRest("rest_pause", false, 1, 0);
    expect(result.mode).toBe("intra");
    if (result.mode === "intra") {
      expect(result.badge).toBe("Mini-set 1 of ?");
    }
  });

  it("switches to inter mode when parent set is marked complete", () => {
    const result = resolveIntraMiniSetRest("rest_pause", true, 3, 3);
    expect(result.mode).toBe("inter");
  });

  it("switches to inter mode when parentDone=true regardless of completedMiniSets", () => {
    const result = resolveIntraMiniSetRest("rest_pause", true, 0, 0);
    expect(result.mode).toBe("inter");
  });
});

describe("resolveIntraMiniSetRest — cluster mid-parent", () => {
  it("returns intra mode with 30s for cluster", () => {
    const result = resolveIntraMiniSetRest("cluster", false, 2, 5);
    expect(result.mode).toBe("intra");
    if (result.mode === "intra") {
      expect(result.seconds).toBe(30);
      expect(result.setType).toBe("cluster");
    }
  });

  it("switches to inter mode when cluster parent is done", () => {
    const result = resolveIntraMiniSetRest("cluster", true, 5, 5);
    expect(result.mode).toBe("inter");
  });
});

describe("resolveIntraMiniSetRest — myo_reps mid-parent", () => {
  it("returns intra mode with 5s for myo_reps (Fagerli protocol — non-blocking countdown)", () => {
    const result = resolveIntraMiniSetRest("myo_reps", false, 1, 0);
    expect(result.mode).toBe("intra");
    if (result.mode === "intra") {
      expect(result.seconds).toBe(5);
      expect(result.setType).toBe("myo_reps");
    }
  });

  it("myo_reps intra rest is NOT raised to MIN_REST_SECONDS floor (5s < 10s)", () => {
    const result = resolveIntraMiniSetRest("myo_reps", false, 3, 0);
    if (result.mode === "intra") {
      // Floor is advisory only for intra — 5s must be preserved as-is.
      expect(result.seconds).toBe(5);
    }
  });

  it("switches to inter mode when myo_reps parent is done", () => {
    const result = resolveIntraMiniSetRest("myo_reps", true, 4, 0);
    expect(result.mode).toBe("inter");
  });
});

describe("INTRA_MINI_SET_DEFAULTS constants", () => {
  it("rest_pause defaults to 15s", () => {
    expect(INTRA_MINI_SET_DEFAULTS.rest_pause).toBe(15);
  });

  it("cluster defaults to 30s", () => {
    expect(INTRA_MINI_SET_DEFAULTS.cluster).toBe(30);
  });

  it("myo_reps defaults to 5s", () => {
    expect(INTRA_MINI_SET_DEFAULTS.myo_reps).toBe(5);
  });
});

describe("isAdvancedSetType", () => {
  it("returns true for advanced set types", () => {
    const advancedTypes: AdvancedSetType[] = ["rest_pause", "cluster", "myo_reps"];
    for (const t of advancedTypes) {
      expect(isAdvancedSetType(t)).toBe(true);
    }
  });

  it("returns false for standard set types", () => {
    const standardTypes = ["normal", "warmup", "dropset", "failure"];
    for (const t of standardTypes) {
      expect(isAdvancedSetType(t)).toBe(false);
    }
  });

  it("returns false for unknown/garbage strings", () => {
    expect(isAdvancedSetType("")).toBe(false);
    expect(isAdvancedSetType("REST_PAUSE")).toBe(false);
    expect(isAdvancedSetType("unknown")).toBe(false);
  });
});
