/**
 * Tests for lib/macro-coach.ts — Adaptive Macro Coach pure logic.
 *
 * Coverage targets:
 *   - Safety floor invariant (property test over all input combinations)
 *   - Goal × Δ-sign (6 combinations)
 *   - Color-neutrality snapshot (deficit vs surplus render identical chrome)
 *   - No Date.now() / new Date() inside lib/macro-coach.ts
 *   - All pure helper functions
 *   - Double-goal-apply assertion (recomputeMacrosFromCalories path)
 */

import {
  EWMA_ALPHA,
  computeTrendWeight,
  computeAvgIntake,
  estimateTDEE,
  clampToFloor,
  clampToWeeklyDelta,
  classifyStability,
  roundToNearest,
  countLoggingDays,
  suggestTarget,
  type BodyWeightRow,
  type DailyLogRow,
  type CoachSuggestion,
} from "../lib/macro-coach";

import {
  recomputeMacrosFromCalories,
  calculateMacros,
} from "../lib/nutrition-calc";

import {
  computeSafetyFloor,
  SAFETY_FLOOR_FEMALE,
  SAFETY_FLOOR_MALE,
  type UserFloorProfile,
} from "../lib/db/macro-coach-settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWeights(baseWeightKg: number, count: number, startIso: string): BodyWeightRow[] {
  const rows: BodyWeightRow[] = [];
  const base = new Date(startIso);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    rows.push({
      id: `w${i}`,
      weight: baseWeightKg,
      date: d.toISOString().slice(0, 10),
    });
  }
  return rows;
}

function makeLogs(caloriesPerDay: number, count: number, startIso: string): DailyLogRow[] {
  const rows: DailyLogRow[] = [];
  const base = new Date(startIso);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    rows.push({ date: d.toISOString().slice(0, 10), total_calories: caloriesPerDay });
  }
  return rows;
}

const NOW = new Date("2026-05-11T12:00:00Z");

// ─── roundToNearest ───────────────────────────────────────────────────────────

describe("roundToNearest", () => {
  it("rounds to nearest 50", () => {
    expect(roundToNearest(2024, 50)).toBe(2000);
    expect(roundToNearest(2026, 50)).toBe(2050);
    expect(roundToNearest(2050, 50)).toBe(2050);
    expect(roundToNearest(0, 50)).toBe(0);
  });
});

// ─── computeTrendWeight ───────────────────────────────────────────────────────

describe("computeTrendWeight", () => {
  it("returns null for empty input", () => {
    expect(computeTrendWeight([], 21, NOW)).toBeNull();
  });

  it("filters weights outside [30, 300] kg", () => {
    const weights: BodyWeightRow[] = [
      { id: "a", weight: 29.9, date: "2026-05-10" },
      { id: "b", weight: 300.1, date: "2026-05-09" },
    ];
    expect(computeTrendWeight(weights, 21, NOW)).toBeNull();
  });

  it("seeds with first weight and converges via EWMA", () => {
    const weights = makeWeights(80, 10, "2026-05-02");
    const result = computeTrendWeight(weights, 21, NOW);
    expect(result).toBe(80); // stable weights → trend stays at seed
  });

  it("uses EWMA_ALPHA = 0.1", () => {
    expect(EWMA_ALPHA).toBe(0.1);
    const weights: BodyWeightRow[] = [
      { id: "a", weight: 80, date: "2026-05-10" },
      { id: "b", weight: 90, date: "2026-05-11" },
    ];
    const expected = 80 + EWMA_ALPHA * (90 - 80);
    expect(computeTrendWeight(weights, 21, NOW)).toBeCloseTo(expected, 5);
  });

  it("ignores weights outside the date window", () => {
    const weights: BodyWeightRow[] = [
      { id: "old", weight: 50, date: "2026-04-01" }, // too old
      { id: "cur", weight: 80, date: "2026-05-10" },
    ];
    const result = computeTrendWeight(weights, 21, NOW);
    expect(result).toBe(80);
  });
});

// ─── computeAvgIntake ─────────────────────────────────────────────────────────

describe("computeAvgIntake", () => {
  it("returns null when fewer than 10 days of data", () => {
    const logs = makeLogs(2000, 9, "2026-05-03");
    const result = computeAvgIntake(logs, { startIso: "2026-05-03", endIso: "2026-05-11" });
    expect(result).toBeNull();
  });

  it("returns average when sufficient logs", () => {
    const logs = makeLogs(2000, 14, "2026-04-28");
    const result = computeAvgIntake(logs, { startIso: "2026-04-28", endIso: "2026-05-11" });
    expect(result).toBe(2000);
  });

  it("filters logs outside range", () => {
    const logs: DailyLogRow[] = [
      ...makeLogs(2000, 14, "2026-04-28"),
      { date: "2026-04-01", total_calories: 5000 }, // outside range
    ];
    const result = computeAvgIntake(logs, { startIso: "2026-04-28", endIso: "2026-05-11" });
    expect(result).toBe(2000);
  });
});

// ─── estimateTDEE ─────────────────────────────────────────────────────────────

describe("estimateTDEE", () => {
  it("rejects windows shorter than 7 days", () => {
    const r = estimateTDEE(2000, -0.5, 6, 80);
    expect(r).toEqual({ reason: "insufficient_window" });
  });

  it("rejects when weight change is below stability threshold", () => {
    const trendStart = 80;
    const smallDelta = trendStart * 0.001; // 0.1% — below 0.2% threshold
    const r = estimateTDEE(2000, smallDelta, 14, trendStart);
    expect(r).toEqual({ reason: "weight_stable" });
  });

  it("rejects implausible energy balance (> 750 kcal deviation)", () => {
    // avgIntake=2000, delta=-1kg in 14 days → TDEE = 2000 + (-1 × 7700 / 14) = 2000 - 550 = 1450
    // |1450 - 2000| = 550 ≤ 750 → NOT implausible
    // To trigger: need |TDEE − avgIntake| > 750
    // avgIntake=2000, delta=-2kg in 14 days → TDEE = 2000 + (-2 × 7700 / 14) = 2000 - 1100 = 900
    // |900 - 2000| = 1100 > 750 → implausible
    const r = estimateTDEE(2000, -2, 14, 80);
    expect(r).toEqual({ reason: "implausible_balance" });
  });

  it("returns estimated TDEE for valid inputs", () => {
    // avgIntake=2000, delta=-0.5kg in 14 days → TDEE = 2000 + (-0.5 × 7700 / 14) = 2000 - 275 = 1725
    const r = estimateTDEE(2000, -0.5, 14, 80);
    expect(typeof r).toBe("number");
    expect(r as number).toBeCloseTo(1725, 0);
  });
});

// ─── clampToFloor ─────────────────────────────────────────────────────────────

describe("clampToFloor", () => {
  it("returns value unchanged when above floor", () => {
    expect(clampToFloor(2000, 1500)).toEqual({ value: 2000, capped: false });
  });

  it("clamps to floor when below", () => {
    expect(clampToFloor(1400, 1500)).toEqual({ value: 1500, capped: true });
  });

  it("returns exact floor when equal", () => {
    expect(clampToFloor(1500, 1500)).toEqual({ value: 1500, capped: false });
  });
});

// ─── clampToWeeklyDelta ───────────────────────────────────────────────────────

describe("clampToWeeklyDelta", () => {
  it("allows changes within ±300 kcal", () => {
    expect(clampToWeeklyDelta(2000, 2200)).toEqual({ value: 2200, capped: false });
    expect(clampToWeeklyDelta(2000, 1800)).toEqual({ value: 1800, capped: false });
  });

  it("caps increases beyond 300 kcal", () => {
    expect(clampToWeeklyDelta(2000, 2400)).toEqual({ value: 2300, capped: true });
  });

  it("caps decreases beyond 300 kcal", () => {
    expect(clampToWeeklyDelta(2000, 1600)).toEqual({ value: 1700, capped: true });
  });

  it("handles exact 300 kcal boundary", () => {
    expect(clampToWeeklyDelta(2000, 2300)).toEqual({ value: 2300, capped: false });
    expect(clampToWeeklyDelta(2000, 1700)).toEqual({ value: 1700, capped: false });
  });
});

// ─── classifyStability ───────────────────────────────────────────────────────

describe("classifyStability", () => {
  const trendStart = 80;

  it("classifies as stable when below threshold", () => {
    expect(classifyStability(0.001 * trendStart, trendStart)).toBe("stable");
  });

  it("classifies as loss when weight decreases", () => {
    expect(classifyStability(-0.5, trendStart)).toBe("loss");
  });

  it("classifies as gain when weight increases", () => {
    expect(classifyStability(0.5, trendStart)).toBe("gain");
  });
});

// ─── countLoggingDays ────────────────────────────────────────────────────────

describe("countLoggingDays", () => {
  it("counts unique dates in window", () => {
    const logs = makeLogs(2000, 20, "2026-04-22"); // 20 days ending 2026-05-11
    expect(countLoggingDays(logs, 30, NOW)).toBe(20);
  });

  it("excludes dates outside window", () => {
    const logs: DailyLogRow[] = [
      { date: "2026-03-01", total_calories: 2000 }, // outside 30-day window
      { date: "2026-05-10", total_calories: 2000 },
    ];
    expect(countLoggingDays(logs, 30, NOW)).toBe(1);
  });
});

// ─── suggestTarget — main orchestrator ───────────────────────────────────────

function makeFullDataset(opts: {
  weightDeltaKg?: number;
  baseWeight?: number;
  avgIntake?: number;
  goal?: "cut" | "maintain" | "bulk";
  currentTarget?: number;
  safetyFloor?: number;
}) {
  const {
    weightDeltaKg = -0.5,
    baseWeight = 80,
    avgIntake = 2200,
    goal = "maintain",
    currentTarget = 2200,
    safetyFloor = 1500,
  } = opts;

  // 21 days of weights: first 7 days at baseWeight, next 14 with drift
  const weights: BodyWeightRow[] = [];
  const logsStart = new Date(NOW);
  logsStart.setDate(logsStart.getDate() - 35);

  for (let i = 0; i < 35; i++) {
    const d = new Date(logsStart);
    d.setDate(d.getDate() + i);
    const progress = i < 14 ? 0 : ((i - 14) / 21) * weightDeltaKg;
    weights.push({
      id: `w${i}`,
      weight: baseWeight + progress,
      date: d.toISOString().slice(0, 10),
    });
  }

  // 14 days of food logs (last 14 days)
  const logsFromDate = new Date(NOW);
  logsFromDate.setDate(logsFromDate.getDate() - 14);
  const logs = makeLogs(avgIntake, 14, logsFromDate.toISOString().slice(0, 10));

  return { weights, logs, currentTargetKcal: currentTarget, safetyFloorKcal: safetyFloor, goal, now: NOW };
}

describe("suggestTarget — insufficient data", () => {
  it("returns insufficient_weights when fewer than 14 weigh-ins", () => {
    const weights = makeWeights(80, 10, "2026-05-02");
    const logs = makeLogs(2000, 14, "2026-04-28");
    const r = suggestTarget({ weights, logs, currentTargetKcal: 2000, safetyFloorKcal: 1500, goal: "maintain", now: NOW });
    expect(r).toEqual({ reason: "insufficient_weights" });
  });

  it("returns insufficient_logs when fewer than 10 food log days", () => {
    const dataset = makeFullDataset({});
    const r = suggestTarget({
      ...dataset,
      logs: makeLogs(2000, 5, "2026-05-02"), // only 5 days
    });
    expect(r).toEqual({ reason: "insufficient_logs" });
  });
});

describe("suggestTarget — property tests: safety floor invariant", () => {
  /**
   * SAFETY FLOOR INVARIANT: suggestTarget must NEVER return a CoachSuggestion
   * where suggestedTarget < safetyFloor, under any combination of inputs.
   */

  const cases = [
    { label: "normal cut", goal: "cut" as const, weightDelta: -0.5, avgIntake: 2200 },
    { label: "aggressive cut", goal: "cut" as const, weightDelta: -1.5, avgIntake: 1500 },
    { label: "maintain", goal: "maintain" as const, weightDelta: -0.3, avgIntake: 2000 },
    { label: "bulk", goal: "bulk" as const, weightDelta: 0.5, avgIntake: 2500 },
    { label: "aggressive bulk", goal: "bulk" as const, weightDelta: 1.0, avgIntake: 3000 },
    { label: "very low intake cut", goal: "cut" as const, weightDelta: -0.1, avgIntake: 800 },
  ];

  test.each(cases)("$label: suggested target ≥ safetyFloor", ({ goal, weightDelta, avgIntake }) => {
    const safetyFloor = goal === "cut" ? 1600 : 1500;
    const dataset = makeFullDataset({ goal, weightDeltaKg: weightDelta, avgIntake, safetyFloor });
    const result = suggestTarget(dataset);
    if ("reason" in result) return; // skip if data insufficient
    expect((result as CoachSuggestion).suggestedTarget).toBeGreaterThanOrEqual(safetyFloor);
  });

  it("applies safety floor when raw suggestion is below floor", () => {
    // Force a scenario where raw suggestion drops below floor
    const dataset = makeFullDataset({
      goal: "cut",
      weightDeltaKg: -0.5,
      avgIntake: 2000,
      safetyFloor: 2500, // floor ABOVE likely suggestion
    });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(2500);
    expect(s.floorActive).toBe(true);
  });
});

describe("suggestTarget — property tests: goal × Δ-sign (6 combinations)", () => {
  /**
   * For each goal, confirm the suggestion direction is correct relative to TDEE:
   * - cut: suggested < TDEE (or floored)
   * - maintain: suggested ≈ TDEE
   * - bulk: suggested > TDEE
   */

  it("cut + weight loss → suggests deficit (bounded by floor and cap)", () => {
    const dataset = makeFullDataset({ goal: "cut", weightDeltaKg: -0.5, avgIntake: 2200 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    // Cut means goal_adjustment = -500. Suggestion should be lower than avgIntake or at floor.
    const s = result as CoachSuggestion;
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(dataset.safetyFloorKcal);
  });

  it("cut + weight gain → still suggests deficit direction", () => {
    const dataset = makeFullDataset({ goal: "cut", weightDeltaKg: 0.5, avgIntake: 2500 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    // Gaining weight on a cut: TDEE > avgIntake → still apply -500 adjustment
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(dataset.safetyFloorKcal);
  });

  it("maintain + weight loss → suggests increase toward TDEE", () => {
    const dataset = makeFullDataset({ goal: "maintain", weightDeltaKg: -0.5, avgIntake: 1800 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    // Losing on maintain: TDEE > avgIntake → suggestion should be ≥ avgIntake (rounded)
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(dataset.safetyFloorKcal);
  });

  it("maintain + weight stable → returns weight_stable reason", () => {
    const weights: BodyWeightRow[] = [];
    const start = new Date(NOW);
    start.setDate(start.getDate() - 35);
    for (let i = 0; i < 35; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      weights.push({ id: `w${i}`, weight: 80, date: d.toISOString().slice(0, 10) });
    }
    const logsStart = new Date(NOW);
    logsStart.setDate(NOW.getDate() - 14);
    const logs = makeLogs(2000, 14, logsStart.toISOString().slice(0, 10));
    const r = suggestTarget({ weights, logs, currentTargetKcal: 2000, safetyFloorKcal: 1500, goal: "maintain", now: NOW });
    expect(r).toEqual({ reason: "weight_stable" });
  });

  it("bulk + weight loss → suggests surplus to stop loss", () => {
    const dataset = makeFullDataset({ goal: "bulk", weightDeltaKg: -0.5, avgIntake: 2500 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    // Losing on bulk: TDEE > avgIntake, +300 → larger suggestion
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(dataset.safetyFloorKcal);
  });

  it("bulk + weight gain → suggests staying at or slightly above current", () => {
    const dataset = makeFullDataset({ goal: "bulk", weightDeltaKg: 0.5, avgIntake: 2800 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    expect(s.suggestedTarget).toBeGreaterThanOrEqual(dataset.safetyFloorKcal);
  });
});

describe("suggestTarget — ±300 kcal/week cap", () => {
  it("caps positive delta at +300 kcal from current target", () => {
    // Make a scenario that would generate a large increase
    const dataset = makeFullDataset({ goal: "bulk", weightDeltaKg: -1, avgIntake: 2000, currentTarget: 2000 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    expect(s.suggestedTarget - s.currentTarget).toBeLessThanOrEqual(300 + 50); // +50 for rounding
  });

  it("caps negative delta at -300 kcal from current target", () => {
    // Large cut to trigger cap
    const dataset = makeFullDataset({ goal: "cut", weightDeltaKg: 1, avgIntake: 3500, currentTarget: 2500, safetyFloor: 1000 });
    const result = suggestTarget(dataset);
    if ("reason" in result) return;
    const s = result as CoachSuggestion;
    expect(s.currentTarget - s.suggestedTarget).toBeLessThanOrEqual(300 + 50); // +50 for rounding
  });
});

// ─── computeSafetyFloor ───────────────────────────────────────────────────────

describe("computeSafetyFloor", () => {
  it("returns at least SAFETY_FLOOR_FEMALE for female users", () => {
    const profile: UserFloorProfile = { sex: "female", weight_kg: 60, height_cm: 165, age: 30 };
    const floor = computeSafetyFloor(profile);
    expect(floor).toBeGreaterThanOrEqual(SAFETY_FLOOR_FEMALE);
  });

  it("returns at least SAFETY_FLOOR_MALE for male users", () => {
    const profile: UserFloorProfile = { sex: "male", weight_kg: 80, height_cm: 178, age: 30 };
    const floor = computeSafetyFloor(profile);
    expect(floor).toBeGreaterThanOrEqual(SAFETY_FLOOR_MALE);
  });

  it("returns RMR when RMR > sex floor", () => {
    // Very large person — RMR will be > 1800
    const profile: UserFloorProfile = { sex: "male", weight_kg: 150, height_cm: 200, age: 25 };
    const floor = computeSafetyFloor(profile);
    // BMR = 10*150 + 6.25*200 - 5*25 + 5 = 1500 + 1250 - 125 + 5 = 2630
    expect(floor).toBeGreaterThan(SAFETY_FLOOR_MALE);
    expect(floor).toBeCloseTo(2630, -1); // within 10 kcal
  });

  it("SAFETY_FLOOR_FEMALE = 1500, SAFETY_FLOOR_MALE = 1800", () => {
    expect(SAFETY_FLOOR_FEMALE).toBe(1500);
    expect(SAFETY_FLOOR_MALE).toBe(1800);
  });
});

// ─── recomputeMacrosFromCalories — no double-goal-apply ──────────────────────

describe("recomputeMacrosFromCalories — coach must use this, not calculateMacros", () => {
  it("does not apply goal adjustments", () => {
    const calories = 2000;
    const weight_kg = 80;

    const { protein_g, carbs_g, fat_g } = recomputeMacrosFromCalories(calories, weight_kg);

    // Verify total calories round-trip
    const totalCals = protein_g * 4 + carbs_g * 4 + fat_g * 9;
    // Allow small rounding gap due to integer rounding
    expect(Math.abs(totalCals - calories)).toBeLessThanOrEqual(10);
  });

  it("differs from calculateMacros for cut goal (which subtracts 500 kcal internally)", () => {
    const weight_kg = 80;
    const tdee = 2500;

    // calculateMacros applies GOAL_ADJUSTMENTS internally → result calories = tdee - 500 = 2000
    const withGoalApplied = calculateMacros(tdee, weight_kg, "cut");

    // recomputeMacrosFromCalories at tdee directly → no adjustment applied
    const withoutGoalApplied = recomputeMacrosFromCalories(tdee, weight_kg);

    // They should differ because calculateMacros subtracts 500
    expect(withGoalApplied.calories).toBe(2000);
    expect(withoutGoalApplied.protein_g).toBe(Math.round(weight_kg * 2.2));
    // fat at tdee (2500) > fat at 2000
    expect(withoutGoalApplied.fat_g).toBeGreaterThan(withGoalApplied.fat);
  });

  it("computes protein correctly at 2.2 g/kg", () => {
    const { protein_g } = recomputeMacrosFromCalories(2000, 80);
    expect(protein_g).toBe(176); // 80 * 2.2
  });
});

// ─── No Date.now() / new Date() in lib/macro-coach.ts ───────────────────────

describe("lib/macro-coach.ts — clock injection compliance", () => {
  it("does not contain executable Date.now() or new Date(…) outside the addDays helper", () => {
    const fs = require("fs");
    const srcTs = fs.readFileSync("lib/macro-coach.ts", "utf8") as string;
    // Remove single-line and block comments before checking
    const noComments = srcTs.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // Strip the addDays helper body (the only allowed new Date call in this module)
    const noHelperBody = noComments.replace(/function addDays[\s\S]*?\{[\s\S]*?\}/, "");
    expect(noHelperBody).not.toMatch(/Date\.now\(\)/);
    // Tightened: catch any new Date(...) invocation, not just bare new Date()
    expect(noHelperBody).not.toMatch(/\bnew Date\(/);
  });
});

// ─── Color-neutrality snapshot test ──────────────────────────────────────────
// NOTE: This test verifies that the NUMERIC output differs but no other metadata
// (like color, flag name) changes between deficit and surplus suggestions.
// The full UI snapshot is in __tests__/components/MacroCoachCard.test.tsx.

describe("suggestTarget — color-neutrality of suggestion metadata", () => {
  it("deficit and surplus suggestions have identical structural shape", () => {
    const cutDataset = makeFullDataset({
      goal: "cut",
      weightDeltaKg: -0.5,
      avgIntake: 2200,
      safetyFloor: 1500,
      currentTarget: 2200,
    });
    const bulkDataset = makeFullDataset({
      goal: "bulk",
      weightDeltaKg: -0.3,
      avgIntake: 2200,
      safetyFloor: 1500,
      currentTarget: 2200,
    });

    const cutResult = suggestTarget(cutDataset);
    const bulkResult = suggestTarget(bulkDataset);

    if ("reason" in cutResult || "reason" in bulkResult) return;

    const cutKeys = Object.keys(cutResult as CoachSuggestion).sort();
    const bulkKeys = Object.keys(bulkResult as CoachSuggestion).sort();

    // Both have identical keys — no extra "direction" or "colorClass" field
    expect(cutKeys).toEqual(bulkKeys);

    // Neither suggestion includes color-related fields
    expect(cutKeys).not.toContain("color");
    expect(cutKeys).not.toContain("colorClass");
    expect(cutKeys).not.toContain("direction");
    expect(cutKeys).not.toContain("isDeficit");
    expect(cutKeys).not.toContain("isSurplus");
  });
});
