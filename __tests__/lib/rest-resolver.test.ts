/**
 * Unit tests for lib/rest-resolver.ts (BLD-1100).
 *
 * Covers:
 *  - AC1, AC1b  : history median accuracy and bias-neutrality
 *  - AC2, AC2b  : pinned source bypasses multiplier path (resolver returns pinned)
 *  - AC2c       : linkScope=true → history cannot occur; pinned-only bypass
 *  - AC3        : < 4 samples falls back to template/default
 *  - AC5b       : setUserRestSeconds throws RestBoundsError for out-of-bounds
 *  - AC6b       : linkScope=true never returns history
 *  - AC6c       : two fixture tests — 5 NULL rows → history; 4 NULL rows → fallback
 *  - AC12       : restResolverBreadcrumb shape, PII-clean, category="rest-resolver"
 */

import * as Sentry from "@sentry/react-native";

// ─── Mock the database layer ─────────────────────────────────────────────────

const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });

jest.mock("../../lib/db/helpers", () => ({
  getDatabase: jest.fn(() =>
    Promise.resolve({
      getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
      getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
      runAsync: (...args: unknown[]) => mockRunAsync(...args),
    })
  ),
}));

import {
  resolveRest,
  setUserRestSeconds,
  restResolverBreadcrumb,
  restSanitizeBreadcrumb,
  RestBoundsError,
  HISTORY_MIN_SAMPLES,
  HISTORY_FLOOR_SECONDS,
  HISTORY_CEILING_SECONDS,
  PIN_BOUNDS_SECONDS,
  WORK_ESTIMATE_SECONDS_PER_REP,
} from "../../lib/rest-resolver";

// ─── Helper: build a fake history row ────────────────────────────────────────
function makeHistoryRows(
  actualRests: number[],
): { actual_rest: number }[] {
  return actualRests.map((r) => ({ actual_rest: r }));
}

beforeEach(() => {
  // mockReset clears calls, instances, results AND the once-queue AND the default
  // implementation. clearAllMocks() does NOT clear the once queue, causing leaked
  // mockResolvedValueOnce values from previous tests to bleed through.
  mockGetFirstAsync.mockReset();
  mockGetAllAsync.mockReset();
  mockRunAsync.mockReset();
  // Clear Sentry mock call history so tests can check calls[0] safely.
  (Sentry.addBreadcrumb as jest.Mock).mockClear();
  // Re-establish safe defaults after reset.
  mockGetFirstAsync.mockResolvedValue(null);
  mockGetAllAsync.mockResolvedValue([]);
  mockRunAsync.mockResolvedValue({ changes: 1 });
});

// ─── AC12: restResolverBreadcrumb ─────────────────────────────────────────────

describe("restResolverBreadcrumb", () => {
  it("calls Sentry.addBreadcrumb with category='rest-resolver'", () => {
    restResolverBreadcrumb({ source: "history", seconds: 120, exerciseId: "abc-uuid" });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: "rest-resolver" })
    );
  });

  it("payload contains only numeric + UUID fields (PII-clean, AC12b)", () => {
    restResolverBreadcrumb({ source: "pinned", seconds: 90, exerciseId: "some-uuid-1234" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.data).toEqual(expect.objectContaining({
      source: expect.any(String),
      seconds: expect.any(Number),
      exerciseId: "some-uuid-1234",
    }));
    // exerciseId should be a string (UUID), not an exercise name
    expect(typeof call.data.exerciseId).toBe("string");
  });

  it("emits sampleCount when provided (AC12c)", () => {
    restResolverBreadcrumb({ source: "history", seconds: 120, exerciseId: "u1", sampleCount: 7 });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.data.sampleCount).toBe(7);
  });

  it("does not throw when Sentry throws internally", () => {
    (Sentry.addBreadcrumb as jest.Mock).mockImplementationOnce(() => { throw new Error("Sentry down"); });
    expect(() =>
      restResolverBreadcrumb({ source: "default", seconds: 90, exerciseId: "u2" })
    ).not.toThrow();
  });

  it("respects optional level field — emits 'warning' level when specified (AC12/TL-4)", () => {
    restResolverBreadcrumb({ source: "default", seconds: 0, exerciseId: "u3", level: "warning" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.level).toBe("warning");
  });

  it("defaults to 'info' level when level is not specified", () => {
    restResolverBreadcrumb({ source: "history", seconds: 120, exerciseId: "u4" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.level).toBe("info");
  });
});

// ─── AC12: restSanitizeBreadcrumb ─────────────────────────────────────────────

describe("restSanitizeBreadcrumb (AC12/TL-5)", () => {
  it("emits category='rest-resolver' with level='warning'", () => {
    restSanitizeBreadcrumb({ kind: "import_clamp", inputValue: 700, outputValue: 600, exerciseId: "u5" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.category).toBe("rest-resolver");
    expect(call.level).toBe("warning");
  });

  it("emits import_clamp kind with input/output values", () => {
    restSanitizeBreadcrumb({ kind: "import_clamp", inputValue: 700, outputValue: 600, exerciseId: "e-uuid" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.data.kind).toBe("import_clamp");
    expect(call.data.inputValue).toBe(700);
    expect(call.data.outputValue).toBe(600);
    expect(call.data.exerciseId).toBe("e-uuid");
  });

  it("emits import_drop kind with null outputValue", () => {
    restSanitizeBreadcrumb({ kind: "import_drop", inputValue: -5, outputValue: null, exerciseId: "e-uuid2" });
    const call = (Sentry.addBreadcrumb as jest.Mock).mock.calls[0][0];
    expect(call.data.kind).toBe("import_drop");
    expect(call.data.outputValue).toBeNull();
  });

  it("does not throw when Sentry throws internally", () => {
    (Sentry.addBreadcrumb as jest.Mock).mockImplementationOnce(() => { throw new Error("Sentry down"); });
    expect(() =>
      restSanitizeBreadcrumb({ kind: "import_drop", inputValue: null, outputValue: null, exerciseId: "u6" })
    ).not.toThrow();
  });
});

// ─── Tier 2: pinned ───────────────────────────────────────────────────────────

describe("resolveRest — pinned tier (AC2)", () => {
  it("returns pinned source when user_rest_seconds is set", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: 120 });
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("pinned");
    expect(src.seconds).toBe(120);
  });

  it("pinned source is returned even when history samples exist (AC2 priority order)", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: 180 });
    // History would return many rows but pinned wins before history is queried
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100, 105, 110]));
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("pinned");
    expect(src.seconds).toBe(180);
  });
});

// ─── Tier 3: history ──────────────────────────────────────────────────────────

describe("resolveRest — history tier (AC1, AC1b)", () => {
  beforeEach(() => {
    // No pinned value
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
  });

  it("returns history source when ≥ 4 qualifying samples exist (AC1)", async () => {
    const rests = [120, 125, 130, 135, 140]; // 5 samples
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows(rests));
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("history");
    if (src.kind === "history") {
      expect(src.sampleCount).toBe(5);
      // Median of sorted [120,125,130,135,140] at index 2 = 130
      expect(src.seconds).toBe(130);
      expect(src.windowDays).toBe(30);
    }
  });

  it("AC1 — median is within ±10 s of synthetic fixture expected value", async () => {
    // Synthetic fixture: true rest = 120 s, with ±5 s noise
    const rests = [115, 118, 120, 122, 125];
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows(rests));
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("history");
    if (src.kind === "history") {
      expect(Math.abs(src.seconds - 120)).toBeLessThanOrEqual(10);
    }
  });

  it("AC1b — median bias is within ±5 s of true rest on synthetic fixture", async () => {
    // True rest = 150 s, 2s/rep noise for 8-rep sets = 16 s work_estimate
    // actual_rest_measured = 150 + 16 - 16 = 150 (if duration_seconds provided)
    // Without duration_seconds: delta would be rest + work, work_estimate corrects it
    const trueRest = 150;
    const rests = [145, 148, 150, 152, 155]; // around 150 with noise
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows(rests));
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("history");
    if (src.kind === "history") {
      expect(Math.abs(src.seconds - trueRest)).toBeLessThanOrEqual(5);
    }
  });

  it("AC3 — falls through when < 4 qualifying samples exist", async () => {
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100])); // only 3
    // template query returns null → falls to default
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
    // second getFirstAsync call is template query
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: null })
      .mockResolvedValueOnce({ rest_seconds: null });
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).not.toBe("history");
  });

  it("AC3 — exactly 3 samples = fallback (boundary condition)", async () => {
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([100, 110, 120]));
    mockGetFirstAsync
      .mockResolvedValueOnce({ user_rest_seconds: null }) // pinned
      .mockResolvedValueOnce({ rest_seconds: null }); // template
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).not.toBe("history");
    expect(["template", "default"]).toContain(src.kind);
  });

  it("AC3 — exactly 4 samples = history hit", async () => {
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([100, 110, 120, 130]));
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("history");
    if (src.kind === "history") {
      expect(src.sampleCount).toBe(4);
    }
  });
});

// ─── AC2c: linkScope invariant ────────────────────────────────────────────────

describe("resolveRest — linkScope invariant (AC2c)", () => {
  it("linkScope=true never returns history source", async () => {
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
    // History rows exist but should be skipped
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100, 105, 110]));
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: null })
      .mockResolvedValueOnce({ rest_seconds: null });
    const src = await resolveRest("s1", "e1", "normal", { linkScope: true });
    expect(src.kind).not.toBe("history");
  });

  it("linkScope=true returns pinned when user_rest_seconds is set (AC2c bypass)", async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: 200 });
    const src = await resolveRest("s1", "e1", "normal", { linkScope: true });
    expect(src.kind).toBe("pinned");
    expect(src.seconds).toBe(200);
  });

  it("linkScope=true returns template when pinned is null and template exists", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ user_rest_seconds: null }) // pinned
      .mockResolvedValueOnce({ rest_seconds: 120 }); // template
    const src = await resolveRest("s1", "e1", "normal", { linkScope: true });
    expect(src.kind).toBe("template");
    expect(src.seconds).toBe(120);
  });

  it("linkScope=true returns default when nothing is set", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ user_rest_seconds: null }) // pinned
      .mockResolvedValueOnce({ rest_seconds: null }); // template
    const src = await resolveRest("s1", "e1", "normal", { linkScope: true });
    expect(src.kind).toBe("default");
    expect(src.seconds).toBe(90);
  });
});

// ─── AC6b: link group max ─────────────────────────────────────────────────────

describe("resolveRest linkScope=true (AC6b)", () => {
  it("history is excluded even for exercises with rich straight-set history", async () => {
    // 10 history rows — would produce history without linkScope
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100, 105, 110, 115, 120, 125, 130, 135]));
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: null })
      .mockResolvedValueOnce({ rest_seconds: null });
    const src = await resolveRest("s1", "e1", "normal", { linkScope: true });
    expect(src.kind).not.toBe("history");
    expect(src.kind).toBe("default");
  });
});

// ─── AC6c: link_id IS NULL filter (two fixture tests) ─────────────────────────

describe("resolveRest — link_id IS NULL filter (AC6c)", () => {
  // The resolver delegates filtering to SQL (which is tested via integration).
  // Here we test the JavaScript-level sample-count threshold:

  it("AC6c(a) — 5 consecutive NULL-link rows yield 4 pairs → history hit", async () => {
    // Simulate the SQL returning 4 qualifying pairs from 5 NULL-link sets
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100, 105])); // 4 pairs
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("history");
    if (src.kind === "history") {
      expect(src.sampleCount).toBe(4);
    }
  });

  it("AC6c(b) — 4 NULL-link rows yield only 3 pairs → fallback (NOT history)", async () => {
    // Simulate SQL returning 3 qualifying pairs from 4 NULL-link sets
    mockGetFirstAsync.mockResolvedValue({ user_rest_seconds: null });
    mockGetAllAsync.mockResolvedValueOnce(makeHistoryRows([90, 95, 100])); // 3 pairs
    mockGetFirstAsync.mockResolvedValueOnce({ user_rest_seconds: null })
      .mockResolvedValueOnce({ rest_seconds: null });
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).not.toBe("history");
  });
});

// ─── Tier 4: template ────────────────────────────────────────────────────────

describe("resolveRest — template tier", () => {
  it("returns template source when no pin/history but template exists", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ user_rest_seconds: null }) // pinned check
      .mockResolvedValueOnce({ rest_seconds: 150 }); // template check
    mockGetAllAsync.mockResolvedValueOnce([]); // no history
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("template");
    expect(src.seconds).toBe(150);
  });
});

// ─── Tier 5: default ─────────────────────────────────────────────────────────

describe("resolveRest — default tier", () => {
  it("returns default 90 s when nothing is configured", async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ user_rest_seconds: null })
      .mockResolvedValueOnce({ rest_seconds: null });
    mockGetAllAsync.mockResolvedValueOnce([]);
    const src = await resolveRest("s1", "e1", "normal");
    expect(src.kind).toBe("default");
    expect(src.seconds).toBe(90);
  });
});

// ─── AC5b: setUserRestSeconds bounds ──────────────────────────────────────────

describe("setUserRestSeconds (AC5b)", () => {
  it("persists valid seconds in [15, 600]", async () => {
    await expect(setUserRestSeconds("e1", 120)).resolves.toBeUndefined();
    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE exercises SET user_rest_seconds = ? WHERE id = ?",
      [120, "e1"]
    );
  });

  it("persists null to unpin", async () => {
    await expect(setUserRestSeconds("e1", null)).resolves.toBeUndefined();
    expect(mockRunAsync).toHaveBeenCalledWith(
      "UPDATE exercises SET user_rest_seconds = ? WHERE id = ?",
      [null, "e1"]
    );
  });

  it.each([
    { value: -1, label: "-1" },
    { value: 0, label: "0" },
    { value: 14, label: "14 (below floor)" },
    { value: 601, label: "601 (above ceiling)" },
    { value: 100000, label: "100000" },
    { value: NaN, label: "NaN" },
  ])("throws RestBoundsError for $label", async ({ value }) => {
    await expect(setUserRestSeconds("e1", value)).rejects.toBeInstanceOf(RestBoundsError);
  });

  it("accepts boundary values 15 and 600", async () => {
    await expect(setUserRestSeconds("e1", 15)).resolves.toBeUndefined();
    await expect(setUserRestSeconds("e1", 600)).resolves.toBeUndefined();
  });

  it("throws RestBoundsError for non-integer (float)", async () => {
    await expect(setUserRestSeconds("e1", 90.5)).rejects.toBeInstanceOf(RestBoundsError);
  });
});

// ─── Constants sanity check ───────────────────────────────────────────────────

describe("exported constants", () => {
  it("HISTORY_MIN_SAMPLES = 4", () => expect(HISTORY_MIN_SAMPLES).toBe(4));
  it("HISTORY_FLOOR_SECONDS = 15", () => expect(HISTORY_FLOOR_SECONDS).toBe(15));
  it("HISTORY_CEILING_SECONDS = 600", () => expect(HISTORY_CEILING_SECONDS).toBe(600));
  it("WORK_ESTIMATE_SECONDS_PER_REP = 2", () => expect(WORK_ESTIMATE_SECONDS_PER_REP).toBe(2));
  it("PIN_BOUNDS_SECONDS = [15, 600]", () => {
    expect(PIN_BOUNDS_SECONDS[0]).toBe(15);
    expect(PIN_BOUNDS_SECONDS[1]).toBe(600);
  });
});
