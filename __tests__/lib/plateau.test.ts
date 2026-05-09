/**
 * BLD-1122: Unit tests for lib/plateau.ts classifyPlateau + applyBreakThroughFill
 * Covers: progressing, maintaining, stalled (deload step=2.5), stalled (deload step=5),
 *         stalled bodyweight (rep_plus_one only), regressing (form_check only)
 */
import { classifyPlateau, applyBreakThroughFill } from "../../lib/plateau";
import type { PlateauSessionRow, BreakThroughSuggestion } from "../../lib/plateau";

// Helper to build a simple session row
function row(
  id: string,
  started_at: number,
  weight: number | null,
  reps: number | null,
  rpe: number | null = null,
): PlateauSessionRow {
  return {
    session_id: id,
    started_at,
    top_set_weight: weight,
    top_set_reps: reps,
    top_set_rpe: rpe,
    avg_rpe: rpe,
    all_completed: true,
    set_count: 3,
    bodyweight_modifier_kg: null,
  };
}

describe("classifyPlateau — progressing", () => {
  it("returns progressing when latest session improved weight vs prior", () => {
    const sessions: PlateauSessionRow[] = [
      row("s4", 4000, 80, 5),
      row("s3", 3000, 77.5, 5),
      row("s2", 2000, 75, 5),
      row("s1", 1000, 72.5, 5),
    ];
    const result = classifyPlateau(sessions, false, 2.5);
    expect(result.classification).toBe("progressing");
    expect(result.primarySuggestion).toBeNull();
  });

  it("returns progressing when latest session improved reps vs prior", () => {
    const sessions: PlateauSessionRow[] = [
      row("s4", 4000, 80, 6),
      row("s3", 3000, 80, 5),
      row("s2", 2000, 80, 5),
      row("s1", 1000, 80, 5),
    ];
    const result = classifyPlateau(sessions, false, 2.5);
    expect(result.classification).toBe("progressing");
  });
});

describe("classifyPlateau — maintaining", () => {
  it("returns maintaining when 3 sessions but stall not triggered (latest = prior, older was different)", () => {
    // s3 (latest) = s2 (same) but s1 (older) was different → not 3 identical, not stalled
    // s3 is not better than s2 → not progressing
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 80, 5),
      row("s2", 2000, 80, 5),
      row("s1", 1000, 77.5, 5), // different oldest session
    ];
    const result = classifyPlateau(sessions, false, 2.5);
    expect(result.classification).toBe("maintaining");
    expect(result.primarySuggestion).toBeNull();
  });
});

describe("classifyPlateau — stalled (loaded, step=2.5)", () => {
  it("returns stalled with deload suggestion rounding to step 2.5", () => {
    // 60kg × 5 for 3 sessions = stalled
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 60, 5),
      row("s2", 2000, 60, 5),
      row("s1", 1000, 60, 5),
    ];
    const result = classifyPlateau(sessions, false, 2.5);
    expect(result.classification).toBe("stalled");
    expect(result.primarySuggestion).not.toBeNull();
    const s = result.primarySuggestion!;
    expect(s.kind).toBe("deload");
    if (s.kind === "deload") {
      // 60 * 0.9 = 54 → round down to nearest 2.5 = 52.5
      expect(s.weight).toBe(52.5);
    }
  });
});

describe("classifyPlateau — stalled (loaded, step=5)", () => {
  it("returns stalled with deload suggestion rounding to step 5", () => {
    // 100kg × 5 for 3 sessions
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 100, 5),
      row("s2", 2000, 100, 5),
      row("s1", 1000, 100, 5),
    ];
    const result = classifyPlateau(sessions, false, 5);
    expect(result.classification).toBe("stalled");
    const s = result.primarySuggestion!;
    expect(s.kind).toBe("deload");
    if (s.kind === "deload") {
      // 100 * 0.9 = 90 → round down to nearest 5 = 90
      expect(s.weight).toBe(90);
    }
  });

  it("rounds DOWN (not nearest) to step 5", () => {
    // 60kg * 0.9 = 54 → round DOWN to nearest 5 = 50 (not 55)
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 60, 5),
      row("s2", 2000, 60, 5),
      row("s1", 1000, 60, 5),
    ];
    const result = classifyPlateau(sessions, false, 5);
    expect(result.classification).toBe("stalled");
    const s = result.primarySuggestion!;
    if (s.kind === "deload") {
      expect(s.weight).toBe(50);
    }
  });
});

describe("classifyPlateau — stalled bodyweight (rep_plus_one only)", () => {
  it("returns rep_plus_one as primary for bodyweight stall, no secondary", () => {
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, null, 10),
      row("s2", 2000, null, 10),
      row("s1", 1000, null, 10),
    ];
    const result = classifyPlateau(sessions, true, 2.5);
    expect(result.classification).toBe("stalled");
    expect(result.primarySuggestion?.kind).toBe("rep_plus_one");
    expect(result.secondarySuggestion).toBeNull();
  });
});

describe("classifyPlateau — regressing (form_check only)", () => {
  it("returns form_check suggestion for loaded regression, no secondary", () => {
    // e1RM drops > 5% over 3 sessions
    // e1RM = weight * (1 + reps/30)
    // s3: 70*1.167=81.7, s2: 75*1.2=90, s1: 80*1.167=93.3 → older = 93.3, newest = 81.7 → -12% → regressing
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 70, 5),
      row("s2", 2000, 75, 6),
      row("s1", 1000, 80, 5),
    ];
    const result = classifyPlateau(sessions, false, 2.5);
    expect(result.classification).toBe("regressing");
    expect(result.primarySuggestion?.kind).toBe("form_check");
    expect(result.secondarySuggestion).toBeNull();
  });
});

describe("classifyPlateau — lb user (unit-aware deload rounding)", () => {
  it("rounds deload to nearest 5 lb, not 5 kg, for a lb user", () => {
    // 45kg (~99 lb) stalled for 3 sessions; step=5 (lb), unit="lb"
    // deload: 45 * KG_TO_LB * 0.9 = 45 * 2.20462 * 0.9 ≈ 89.3 lb → round DOWN to 85 lb
    // → 85 * LB_TO_KG ≈ 38.56 kg
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 45, 5),
      row("s2", 2000, 45, 5),
      row("s1", 1000, 45, 5),
    ];
    const result = classifyPlateau(sessions, false, 5, "lb");
    expect(result.classification).toBe("stalled");
    const s = result.primarySuggestion!;
    expect(s.kind).toBe("deload");
    if (s.kind === "deload") {
      // Should be ~38.56kg (= 85 lb ÷ 2.20462), NOT 40.5kg (= 90%  of 45, rounded to 5 kg)
      // Verify deload is a round multiple of 5 lb when converted to lb
      const weightLb = s.weight * 2.20462;
      expect(Math.round(weightLb) % 5).toBe(0); // must be a clean 5-lb step
      // And must NOT equal the naive kg-rounded result (40.5 kg → 89.4 lb, not round)
      expect(s.weight).not.toBeCloseTo(40.5, 1);
    }
  });

  it("deload for 100kg user in lb is a clean 5 lb step", () => {
    // 100kg = 220.5 lb; 90% = 198.4 lb → round DOWN to 195 lb = 88.45 kg
    const sessions: PlateauSessionRow[] = [
      row("s3", 3000, 100, 5),
      row("s2", 2000, 100, 5),
      row("s1", 1000, 100, 5),
    ];
    const result = classifyPlateau(sessions, false, 5, "lb");
    const s = result.primarySuggestion!;
    if (s.kind === "deload") {
      const weightLb = Math.round(s.weight * 2.20462);
      expect(weightLb % 5).toBe(0); // clean 5 lb step
    }
  });
});


describe("applyBreakThroughFill", () => {
  const makeSet = (id: string, weight: number | null, reps: number | null, completed = false) => ({
    id,
    weight,
    reps,
    completed,
    previous: null as unknown as string,
    set_number: 1,
    set_type: "normal" as const,
    session_id: "sess",
    exercise_id: "ex",
    notes: null,
    rpe: null,
    duration_seconds: null,
    pulley_pin: null,
    bodyweight_modifier_kg: null,
    tempo: null,
    link_id: null,
    exercise_name: null,
    exercise_deleted: false,
    exercise_position: 0,
    prefillCandidate: undefined,
  });

  it("fills only fully-empty uncompleted sets", () => {
    const suggestion: BreakThroughSuggestion = { kind: "deload", weight: 52.5, reps: 5, reason: "deload" };
    const sets = [
      makeSet("s1", null, null, false),
      makeSet("s2", 60, null, false), // weight filled → not fully empty
      makeSet("s3", null, null, true),  // completed → skip
      makeSet("s4", null, null, false), // fully empty → fill
    ];
    const updates = applyBreakThroughFill(suggestion, sets);
    expect(updates).toHaveLength(2);
    expect(updates.find((u) => u.id === "s1")).toEqual({ id: "s1", weight: 52.5, reps: 5 });
    expect(updates.find((u) => u.id === "s4")).toEqual({ id: "s4", weight: 52.5, reps: 5 });
  });

  it("does not fill sets that already have any value", () => {
    const suggestion: BreakThroughSuggestion = { kind: "rep_plus_one", weight: null, reps: 11, reason: "rep_plus_one" };
    const sets = [
      makeSet("s1", null, 10, false), // reps filled → not fully empty
      makeSet("s2", null, null, false), // fully empty → fill
    ];
    const updates = applyBreakThroughFill(suggestion, sets);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ id: "s2", weight: null, reps: 11 });
  });
});
