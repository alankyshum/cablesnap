/**
 * BLD-1173 — AC #272: rest-resolver intra-vs-inter mode switching
 *
 * GIVEN a parent advanced set is in progress with one or more completed segments
 * WHEN the user completes another mini-set
 * THEN lib/rest-resolver returns intra-mini-set mode (5/15/30s defaults per set_type)
 *   AND a "Mini-set N of ?" badge is rendered
 * WHEN the user marks the parent set complete
 * THEN the resolver switches to inter-set mode
 *   AND MIN_REST_SECONDS=10 floor is enforced (inter-set only)
 */
import {
  resolveIntraMiniSetRest,
  INTRA_MINI_SET_DEFAULTS,
  isAdvancedSetType,
} from "@/lib/rest-resolver";

describe("intra-vs-inter mode switching — all advanced types", () => {
  const advancedTypes = ["rest_pause", "cluster", "myo_reps"] as const;

  for (const setType of advancedTypes) {
    describe(`${setType}`, () => {
      it("returns intra mode with correct default seconds when mid-parent", () => {
        const result = resolveIntraMiniSetRest(setType, false, 1, 3);
        expect(result.mode).toBe("intra");
        if (result.mode === "intra") {
          expect(result.seconds).toBe(INTRA_MINI_SET_DEFAULTS[setType]);
          expect(result.setType).toBe(setType);
        }
      });

      it("renders 'Mini-set N of M' badge when mid-parent with known total", () => {
        const result = resolveIntraMiniSetRest(setType, false, 2, 4);
        expect(result.mode).toBe("intra");
        if (result.mode === "intra") {
          expect(result.badge).toMatch(/^Mini-set \d+ of \d+$/);
          expect(result.badge).toBe("Mini-set 2 of 4");
        }
      });

      it("renders 'Mini-set N of ?' badge when total is unknown", () => {
        const result = resolveIntraMiniSetRest(setType, false, 3, 0);
        expect(result.mode).toBe("intra");
        if (result.mode === "intra") {
          expect(result.badge).toBe("Mini-set 3 of ?");
        }
      });

      it("switches to inter mode when parent is marked complete", () => {
        const result = resolveIntraMiniSetRest(setType, true, 3, 3);
        expect(result.mode).toBe("inter");
      });
    });
  }
});

describe("MIN_REST_SECONDS=10 floor — inter-set only", () => {
  it("inter mode result is NOT a seconds value — callers use resolveRest for inter and enforce floor", () => {
    const interResult = resolveIntraMiniSetRest("rest_pause", true, 2, 2);
    // { mode: "inter" } — no seconds field; caller uses resolveRest() where 10s floor applies.
    expect(interResult.mode).toBe("inter");
    expect("seconds" in interResult).toBe(false);
  });

  it("myo_reps intra mode returns 5s — below MIN_REST_SECONDS=10 — floor is NOT enforced intra", () => {
    const intraResult = resolveIntraMiniSetRest("myo_reps", false, 1, 0);
    expect(intraResult.mode).toBe("intra");
    if (intraResult.mode === "intra") {
      // Must be 5s — Fagerli protocol; floor is advisory (non-blocking) in intra mode.
      expect(intraResult.seconds).toBe(5);
      expect(intraResult.seconds).toBeLessThan(10); // confirms floor not applied
    }
  });

  it("rest_pause intra is 15s — above MIN_REST_SECONDS=10 regardless", () => {
    const intraResult = resolveIntraMiniSetRest("rest_pause", false, 1, 0);
    if (intraResult.mode === "intra") {
      expect(intraResult.seconds).toBe(15);
    }
  });

  it("cluster intra is 30s — well above MIN_REST_SECONDS=10", () => {
    const intraResult = resolveIntraMiniSetRest("cluster", false, 2, 0);
    if (intraResult.mode === "intra") {
      expect(intraResult.seconds).toBe(30);
    }
  });
});

describe("badge format specification", () => {
  it("badge shows completedMiniSets (1-based) as N", () => {
    const r = resolveIntraMiniSetRest("rest_pause", false, 3, 5);
    if (r.mode === "intra") expect(r.badge).toBe("Mini-set 3 of 5");
  });

  it("badge shows '?' when total is zero", () => {
    const r = resolveIntraMiniSetRest("cluster", false, 1, 0);
    if (r.mode === "intra") expect(r.badge).toBe("Mini-set 1 of ?");
  });

  it("badge text format is always 'Mini-set N of M'", () => {
    for (const setType of ["rest_pause", "cluster", "myo_reps"] as const) {
      const r = resolveIntraMiniSetRest(setType, false, 2, 3);
      if (r.mode === "intra") {
        expect(r.badge).toMatch(/^Mini-set \d+ of (\d+|\?)$/);
      }
    }
  });
});

describe("isAdvancedSetType — integration with SetType cycle", () => {
  it("all advanced types are identified correctly", () => {
    expect(isAdvancedSetType("rest_pause")).toBe(true);
    expect(isAdvancedSetType("cluster")).toBe(true);
    expect(isAdvancedSetType("myo_reps")).toBe(true);
  });

  it("standard types are not advanced", () => {
    expect(isAdvancedSetType("normal")).toBe(false);
    expect(isAdvancedSetType("warmup")).toBe(false);
    expect(isAdvancedSetType("dropset")).toBe(false);
    expect(isAdvancedSetType("failure")).toBe(false);
  });
});
