/**
 * BLD-682 — resolvePrefillCandidate helper unit tests.
 *
 * Covers the priority + warmup-filter + tracking-mode-shape rules
 * that AC1, AC3, AC4, AC12, AC13, AC15, AC16 hinge on. The full
 * end-to-end add-set behavior is covered in
 * useSessionActions-add-set-prefill.test.ts and a new
 * useSessionActions-add-set-prev-workout.test.ts.
 */

import {
  resolvePrefillCandidate,
  derivePristinePrefillCandidate,
} from "../../hooks/resolvePrefillCandidate";

const reps = (overrides: Partial<{ weight: number | null; reps: number | null; duration_seconds: number | null; set_type: string | null }> = {}) => ({
  weight: 100,
  reps: 8,
  duration_seconds: null,
  set_type: "normal" as string | null,
  ...overrides,
});

describe("resolvePrefillCandidate", () => {
  it("AC1/AC2: in-session lastWorking takes priority over previous-workout fallback", () => {
    const out = resolvePrefillCandidate(
      { trackingMode: "reps", sets: [reps({ weight: 80, reps: 5 })] },
      reps({ weight: 999, reps: 999 }),
    );
    expect(out).toEqual({ weight: 80, reps: 5, duration_seconds: null });
  });

  it("AC1: prev-workout fallback used when no in-session sets", () => {
    const out = resolvePrefillCandidate(
      { trackingMode: "reps", sets: [] },
      reps({ weight: 100, reps: 8 }),
    );
    expect(out).toEqual({ weight: 100, reps: 8, duration_seconds: null });
  });

  it("AC3: silent no-op when no in-session AND no prev-workout source", () => {
    expect(resolvePrefillCandidate({ trackingMode: "reps", sets: [] }, null)).toBeNull();
  });

  it("AC4: duration mode shapes weight + duration_seconds (reps=null)", () => {
    const out = resolvePrefillCandidate(
      { trackingMode: "duration", sets: [] },
      reps({ weight: 0, reps: null, duration_seconds: 60 }),
    );
    expect(out).toEqual({ weight: 0, reps: null, duration_seconds: 60 });
  });

  it("AC12: partial prior set leaves the missing field null (NOT 0)", () => {
    const out = resolvePrefillCandidate(
      { trackingMode: "reps", sets: [] },
      reps({ weight: 100, reps: null, duration_seconds: null }),
    );
    expect(out).toEqual({ weight: 100, reps: null, duration_seconds: null });
  });

  it("AC13: warmup prev-workout source returns null (no prefill)", () => {
    expect(
      resolvePrefillCandidate(
        { trackingMode: "reps", sets: [] },
        reps({ set_type: "warmup" }),
      ),
    ).toBeNull();
  });

  it("AC13: in-session warmup is filtered, falls back to prev-workout", () => {
    const out = resolvePrefillCandidate(
      { trackingMode: "reps", sets: [reps({ set_type: "warmup", weight: 45, reps: 5 })] },
      reps({ weight: 100, reps: 8 }),
    );
    expect(out).toEqual({ weight: 100, reps: 8, duration_seconds: null });
  });

  it("rejects when the resolved candidate has no usable values", () => {
    expect(
      resolvePrefillCandidate(
        { trackingMode: "reps", sets: [] },
        reps({ weight: null, reps: null, duration_seconds: null }),
      ),
    ).toBeNull();
  });
});

const pristineRow = (overrides: Partial<{ weight: number | null; reps: number | null; duration_seconds: number | null; completed: boolean; notes: string | null; bodyweight_modifier_kg: number | null; set_number: number }> = {}) => ({
  weight: null,
  reps: null,
  duration_seconds: null,
  completed: false,
  notes: null,
  bodyweight_modifier_kg: null,
  set_number: 1,
  ...overrides,
});

const prevRow = (overrides: Partial<{ weight: number | null; reps: number | null; duration_seconds: number | null; set_type: string | null; set_number: number; completed: boolean }> = {}) => ({
  weight: 100,
  reps: 8,
  duration_seconds: null,
  set_type: "normal" as string | null,
  set_number: 1,
  completed: true,
  ...overrides,
});

describe("derivePristinePrefillCandidate", () => {
  it("AC17: pristine row + matching prev set → shaped candidate", () => {
    expect(derivePristinePrefillCandidate(pristineRow(), [prevRow()], "reps"))
      .toEqual({ weight: 100, reps: 8, duration_seconds: null });
  });

  it("AC17: non-pristine row (weight already entered) → null (display falls back to set.weight)", () => {
    expect(
      derivePristinePrefillCandidate(pristineRow({ weight: 90 }), [prevRow()], "reps"),
    ).toBeNull();
  });

  it("AC17: non-pristine row (notes filled) → null", () => {
    expect(
      derivePristinePrefillCandidate(pristineRow({ notes: "felt heavy" }), [prevRow()], "reps"),
    ).toBeNull();
  });

  it("AC17: non-pristine row (completed) → null", () => {
    expect(
      derivePristinePrefillCandidate(pristineRow({ completed: true }), [prevRow()], "reps"),
    ).toBeNull();
  });

  it("AC17: non-pristine row (bodyweight modifier set) → null", () => {
    expect(
      derivePristinePrefillCandidate(
        pristineRow({ bodyweight_modifier_kg: 5 }),
        [prevRow()],
        "reps",
      ),
    ).toBeNull();
  });

  it("AC13: warmup prev row of same set_number → null (filter at helper, not SQL)", () => {
    expect(
      derivePristinePrefillCandidate(pristineRow(), [prevRow({ set_type: "warmup" })], "reps"),
    ).toBeNull();
  });

  it("AC17: no prev sets → null", () => {
    expect(derivePristinePrefillCandidate(pristineRow(), [], "reps")).toBeNull();
    expect(derivePristinePrefillCandidate(pristineRow(), null, "reps")).toBeNull();
    expect(derivePristinePrefillCandidate(pristineRow(), undefined, "reps")).toBeNull();
  });

  it("AC17: prev set_number mismatch → null (no prefill for un-matched slot)", () => {
    expect(
      derivePristinePrefillCandidate(
        pristineRow({ set_number: 5 }),
        [prevRow({ set_number: 1 })],
        "reps",
      ),
    ).toBeNull();
  });

  it("AC4: duration mode shapes candidate with duration_seconds, reps null", () => {
    expect(
      derivePristinePrefillCandidate(
        pristineRow(),
        [prevRow({ weight: 0, reps: null, duration_seconds: 60 })],
        "duration",
      ),
    ).toEqual({ weight: 0, reps: null, duration_seconds: 60 });
  });

  it("AC17 idempotence: same inputs produce equal outputs (referentially-pure)", () => {
    const row = pristineRow();
    const prev = [prevRow()];
    const a = derivePristinePrefillCandidate(row, prev, "reps");
    const b = derivePristinePrefillCandidate(row, prev, "reps");
    expect(a).toEqual(b);
  });

  it("BLOCKER 2026-04-27 (reviewer/techlead/QD): un-completed prior row of same set_number → null", () => {
    // Regression lock: getPreviousSetsBatch returns ALL prior-session
    // rows including completed=false (lib/db/session-sets.ts:469 — kept
    // intentionally for progression detection at useSessionData.ts:200).
    // Every prefill consumer MUST filter `&& p.completed` to avoid
    // flashing/persisting an un-confirmed value.
    expect(
      derivePristinePrefillCandidate(
        pristineRow(),
        [prevRow({ weight: 100, reps: 8, completed: false })],
        "reps",
      ),
    ).toBeNull();
  });

  it("BLOCKER follow-up: completed=true peer at same set_number → still prefills (un-completed first row is skipped)", () => {
    // Sanity check that the new predicate does not over-filter.
    expect(
      derivePristinePrefillCandidate(
        pristineRow(),
        [
          prevRow({ weight: 100, reps: 8, completed: false }),
          prevRow({ weight: 95, reps: 5, completed: true }),
        ],
        "reps",
      ),
    ).toEqual({ weight: 95, reps: 5, duration_seconds: null });
  });
});
