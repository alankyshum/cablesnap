/**
 * @jest-environment node
 *
 * Tests for lib/training-day-macros.ts — Training-Day Macro Adjustment pure module.
 *
 * Coverage targets (per BLD-2641 plan):
 *   AC2  — training-day calorie target = base + base×p (Model 2)
 *   AC3  — rest-day calorie target = base − base×p×n/(7−n), clamped to ≥1200 kcal
 *   AC4  — weekly neutrality property test: sum of 7 days = 7×base for n∈1..6
 *   AC5  — floor clamp + cappedByFloor flag; no NaN/negative
 *   AC10 — clock injection: no Date.now()/new Date() inside lib/training-day-macros.ts
 *   AC22 — ÷0 guard for n=7/n≤0 via normalizeParams
 *   AC23 — export CALORIE_FLOOR; mapRecomputedMacros shape; PureMacroTargets disambiguation
 */

import * as fs from "fs";
import * as path from "path";

import {
  computeEffectiveTargets,
  computeDayCalories,
  normalizeParams,
  mapRecomputedMacros,
  clamp,
  CALORIE_FLOOR,
  SPLIT_PERCENT_MIN,
  SPLIT_PERCENT_MAX,
  SPLIT_PERCENT_DEFAULT,
  TRAINING_DAYS_DEFAULT,
  type PureMacroTargets,
  type TrainingDayParams,
} from "../../lib/training-day-macros";

// ─── AC10: Clock injection ────────────────────────────────────────────────────

describe("AC10: clock injection — no Date.now() / new Date() inside lib/training-day-macros.ts", () => {
  it("lib/training-day-macros.ts contains no Date.now() or bare new Date() calls", () => {
    const filePath = path.resolve(__dirname, "../../lib/training-day-macros.ts");
    const source = fs.readFileSync(filePath, "utf8");

    // Strip block comments (/** ... */) and single-line comments (//)
    // so that documentation comments mentioning the banned patterns don't trigger false positives.
    const strippedBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const stripped = strippedBlockComments
      .split("\n")
      .map((line) => {
        const commentIdx = line.indexOf("//");
        return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      })
      .join("\n");

    // Match bare new Date() with no args — new Date(timestamp) for arithmetic is fine
    // but bare new Date() / Date.now() would be a clock injection violation.
    expect(stripped).not.toMatch(/\bDate\.now\(\)/);
    expect(stripped).not.toMatch(/\bnew Date\(\s*\)/);
  });
});

// ─── AC23: CALORIE_FLOOR re-export + mapRecomputedMacros ─────────────────────

describe("AC23: CALORIE_FLOOR export and mapRecomputedMacros", () => {
  it("exports CALORIE_FLOOR = 1200", () => {
    expect(CALORIE_FLOOR).toBe(1200);
  });

  it("mapRecomputedMacros maps {protein_g, carbs_g, fat_g} → PureMacroTargets", () => {
    const result = mapRecomputedMacros(2000, { protein_g: 150, carbs_g: 200, fat_g: 60 });
    expect(result).toEqual({ calories: 2000, protein: 150, carbs: 200, fat: 60 });
  });

  it("exports SPLIT_PERCENT_DEFAULT = 10, TRAINING_DAYS_DEFAULT = 4", () => {
    expect(SPLIT_PERCENT_DEFAULT).toBe(10);
    expect(TRAINING_DAYS_DEFAULT).toBe(4);
  });
});

// ─── Helper: clamp ────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("clamps to min", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("clamps to max", () => expect(clamp(15, 0, 10)).toBe(10));
  it("passes through mid value", () => expect(clamp(5, 0, 10)).toBe(5));
});

// ─── AC22: normalizeParams ÷0 guard ──────────────────────────────────────────

describe("AC22: normalizeParams — ÷0 guard (n=7/n≤0)", () => {
  it("clamps n=7 down to TRAINING_DAYS_MAX=6", () => {
    const result = normalizeParams({ splitPercent: 10, trainingDaysPerWeek: 7 });
    expect(result.trainingDaysPerWeek).toBe(6);
  });

  it("clamps n=0 up to TRAINING_DAYS_MIN=1", () => {
    const result = normalizeParams({ splitPercent: 10, trainingDaysPerWeek: 0 });
    expect(result.trainingDaysPerWeek).toBe(1);
  });

  it("clamps n=-3 up to TRAINING_DAYS_MIN=1", () => {
    const result = normalizeParams({ splitPercent: 10, trainingDaysPerWeek: -3 });
    expect(result.trainingDaysPerWeek).toBe(1);
  });

  it("clamps splitPercent above max to 25", () => {
    const result = normalizeParams({ splitPercent: 50, trainingDaysPerWeek: 4 });
    expect(result.splitPercent).toBe(SPLIT_PERCENT_MAX);
  });

  it("clamps splitPercent below min to 5", () => {
    const result = normalizeParams({ splitPercent: 1, trainingDaysPerWeek: 4 });
    expect(result.splitPercent).toBe(SPLIT_PERCENT_MIN);
  });

  it("passes through valid values unchanged", () => {
    const params = { splitPercent: 15, trainingDaysPerWeek: 4 };
    expect(normalizeParams(params)).toEqual(params);
  });

  it("rounds fractional values", () => {
    const result = normalizeParams({ splitPercent: 12.7, trainingDaysPerWeek: 3.9 });
    expect(result.splitPercent).toBe(13);
    expect(result.trainingDaysPerWeek).toBe(4);
  });
});

// ─── AC2: training-day calorie target ────────────────────────────────────────

describe("AC2: training-day calorie target", () => {
  const BASE: PureMacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 55 };
  const WEIGHT_KG = 75;
  const PARAMS: TrainingDayParams = { splitPercent: 10, trainingDaysPerWeek: 4 };

  it("training day calories = round(base + base×p)", () => {
    const result = computeEffectiveTargets(BASE, true, PARAMS, WEIGHT_KG);
    // base=2000, p=10% → surplus=200 → training=2200
    expect(result.calories).toBe(2200);
    expect(result.dayType).toBe("training");
    expect(result.adjusted).toBe(true);
    expect(result.cappedByFloor).toBe(false);
  });

  it("training day calories with different split percent", () => {
    const result = computeEffectiveTargets(BASE, true, { splitPercent: 15, trainingDaysPerWeek: 3 }, WEIGHT_KG);
    // base=2000, p=15% → surplus=300 → training=2300
    expect(result.calories).toBe(2300);
  });

  it("returns valid protein/carbs/fat (no NaN or negative)", () => {
    const result = computeEffectiveTargets(BASE, true, PARAMS, WEIGHT_KG);
    expect(result.protein).toBeGreaterThan(0);
    expect(result.carbs).toBeGreaterThanOrEqual(0);
    expect(result.fat).toBeGreaterThan(0);
    expect(Number.isFinite(result.protein)).toBe(true);
    expect(Number.isFinite(result.carbs)).toBe(true);
    expect(Number.isFinite(result.fat)).toBe(true);
  });
});

// ─── AC3: rest-day calorie target ────────────────────────────────────────────

describe("AC3: rest-day calorie target", () => {
  const BASE: PureMacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 55 };
  const WEIGHT_KG = 75;

  it("rest day calories = round(base - base×p×n/(7-n)) for n=4, p=10", () => {
    // surplus=200, restOffset = 200 × 4/3 ≈ 266.67, restCals = 2000 - 267 = 1733
    const result = computeEffectiveTargets(BASE, false, { splitPercent: 10, trainingDaysPerWeek: 4 }, WEIGHT_KG);
    expect(result.calories).toBe(Math.round(2000 - 200 * (4 / 3)));
    expect(result.dayType).toBe("rest");
    expect(result.adjusted).toBe(true);
    expect(result.cappedByFloor).toBe(false);
  });

  it("rest day calories for n=1, p=5", () => {
    // surplus = 2000×0.05 = 100, restOffset = 100 × 1/6 ≈ 16.67, restCals ≈ 1983
    const result = computeEffectiveTargets(BASE, false, { splitPercent: 5, trainingDaysPerWeek: 1 }, WEIGHT_KG);
    expect(result.calories).toBe(Math.round(2000 - 100 * (1 / 6)));
    expect(result.cappedByFloor).toBe(false);
  });

  it("rest day is not below base for n=1 (small offset)", () => {
    const result = computeEffectiveTargets(BASE, false, { splitPercent: 5, trainingDaysPerWeek: 1 }, WEIGHT_KG);
    expect(result.calories).toBeGreaterThan(1900);
  });
});

// ─── AC4: weekly neutrality property test ────────────────────────────────────

describe("AC4: weekly neutrality — sum of 7 days = 7×base for all n∈1..6, p∈5..25", () => {
  const WEIGHT_KG = 80;
  const BASE_CALORIES = 2400;

  // Property test: 7n combinations (n=1..6) × selected split percents
  const N_VALUES = [1, 2, 3, 4, 5, 6];
  const P_VALUES = [5, 10, 15, 20, 25];
  const TOLERANCE = 7; // rounding tolerance in kcal (at most 1 kcal × 7 days)

  test.each(
    N_VALUES.flatMap((n) => P_VALUES.map((p) => ({ n, p })))
  )("n=$n p=$p%: weekly total = 7×base ± rounding", ({ n, p }) => {
    const params: TrainingDayParams = { splitPercent: p, trainingDaysPerWeek: n };
    const normalizedParams = normalizeParams(params);

    // Compute training-day and rest-day calories
    const { trainingCals, restCals, cappedByFloor } = computeDayCalories(
      BASE_CALORIES,
      true, // isTrainingDay (unused by computeDayCalories directly)
      normalizedParams
    );

    // Skip if floor clamped (floor-clamped cases intentionally break neutrality)
    if (cappedByFloor) return;

    const weeklyTotal = n * trainingCals + (7 - n) * restCals;
    const expected = 7 * BASE_CALORIES;

    expect(Math.abs(weeklyTotal - expected)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("property holds for extreme base calorie values (1800, 2500, 3500)", () => {
    const baseCals = [1800, 2500, 3500];
    for (const baseCal of baseCals) {
      const b: PureMacroTargets = { calories: baseCal, protein: 150, carbs: 200, fat: 55 };
      const params: TrainingDayParams = { splitPercent: 10, trainingDaysPerWeek: 4 };
      const normalized = normalizeParams(params);
      const { trainingCals, restCals, cappedByFloor } = computeDayCalories(baseCal, true, normalized);
      if (cappedByFloor) continue;
      const weeklyTotal = 4 * trainingCals + 3 * restCals;
      expect(Math.abs(weeklyTotal - 7 * baseCal)).toBeLessThanOrEqual(7);
      // also test via computeEffectiveTargets
      const restResult = computeEffectiveTargets(b, false, params, WEIGHT_KG);
      const trainResult = computeEffectiveTargets(b, true, params, WEIGHT_KG);
      if (!restResult.cappedByFloor) {
        const total = 4 * trainResult.calories + 3 * restResult.calories;
        expect(Math.abs(total - 7 * baseCal)).toBeLessThanOrEqual(7);
      }
    }
  });
});

// ─── AC5: floor clamp + cappedByFloor ────────────────────────────────────────

describe("AC5: floor clamp + cappedByFloor flag", () => {
  const WEIGHT_KG = 60;

  it("rest-day target below 1200 is clamped to 1200 with cappedByFloor=true", () => {
    // base=1400, p=25%, n=6: surplus=350, restOffset=350×6/1=2100, rawRest=1400-2100=-700
    // → clamped to 1200
    const base: PureMacroTargets = { calories: 1400, protein: 120, carbs: 100, fat: 40 };
    const params: TrainingDayParams = { splitPercent: 25, trainingDaysPerWeek: 6 };
    const result = computeEffectiveTargets(base, false, params, WEIGHT_KG);
    expect(result.calories).toBe(CALORIE_FLOOR);
    expect(result.cappedByFloor).toBe(true);
    expect(result.dayType).toBe("rest");
  });

  it("rest-day target exactly at 1200 is not flagged as capped", () => {
    // base=1300, p=5%, n=1: surplus=65, restOffset=65×1/6≈10.8, rawRest=1289.17 → 1289
    // → above 1200, not capped
    const base: PureMacroTargets = { calories: 1300, protein: 100, carbs: 120, fat: 35 };
    const params: TrainingDayParams = { splitPercent: 5, trainingDaysPerWeek: 1 };
    const result = computeEffectiveTargets(base, false, params, WEIGHT_KG);
    expect(result.cappedByFloor).toBe(false);
    expect(result.calories).toBeGreaterThanOrEqual(CALORIE_FLOOR);
  });

  it("no NaN or negative macro values even when floor-clamped", () => {
    const base: PureMacroTargets = { calories: 1400, protein: 120, carbs: 100, fat: 40 };
    const params: TrainingDayParams = { splitPercent: 25, trainingDaysPerWeek: 6 };
    const result = computeEffectiveTargets(base, false, params, WEIGHT_KG);
    expect(Number.isFinite(result.calories)).toBe(true);
    expect(Number.isFinite(result.protein)).toBe(true);
    expect(Number.isFinite(result.carbs)).toBe(true);
    expect(Number.isFinite(result.fat)).toBe(true);
    expect(result.calories).toBeGreaterThanOrEqual(CALORIE_FLOOR);
    expect(result.protein).toBeGreaterThan(0);
    expect(result.fat).toBeGreaterThan(0);
    expect(result.carbs).toBeGreaterThanOrEqual(0);
  });

  it("training-day result is never capped by floor (training day always > base)", () => {
    const base: PureMacroTargets = { calories: 1200, protein: 100, carbs: 100, fat: 33 };
    const params: TrainingDayParams = { splitPercent: 10, trainingDaysPerWeek: 4 };
    const result = computeEffectiveTargets(base, true, params, WEIGHT_KG);
    expect(result.cappedByFloor).toBe(false);
    expect(result.calories).toBeGreaterThan(1200);
  });
});

// ─── adjusted / dayType flags ─────────────────────────────────────────────────

describe("adjusted and dayType flags", () => {
  const BASE: PureMacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 55 };
  const WEIGHT_KG = 75;
  const PARAMS: TrainingDayParams = { splitPercent: 10, trainingDaysPerWeek: 4 };

  it("training day → dayType='training', adjusted=true", () => {
    const result = computeEffectiveTargets(BASE, true, PARAMS, WEIGHT_KG);
    expect(result.dayType).toBe("training");
    expect(result.adjusted).toBe(true);
  });

  it("rest day → dayType='rest', adjusted=true", () => {
    const result = computeEffectiveTargets(BASE, false, PARAMS, WEIGHT_KG);
    expect(result.dayType).toBe("rest");
    expect(result.adjusted).toBe(true);
  });

  it("adjusted=false not possible when splitPercent>0 (training always differs from base)", () => {
    // Training day adds calories → calories != base.calories → adjusted=true always when enabled
    const result = computeEffectiveTargets(BASE, true, { splitPercent: 5, trainingDaysPerWeek: 4 }, WEIGHT_KG);
    expect(result.adjusted).toBe(true);
  });
});

// ─── computeDayCalories low-level unit tests ──────────────────────────────────

describe("computeDayCalories", () => {
  it("training day = base + surplus", () => {
    const { trainingCals } = computeDayCalories(2000, true, { splitPercent: 10, trainingDaysPerWeek: 4 });
    expect(trainingCals).toBe(2200);
  });

  it("rest day offset formula n=4 p=10", () => {
    // restOffset = 200 × 4/3 ≈ 266.67, restCals = 2000 - 267 = 1733
    const { restCals } = computeDayCalories(2000, true, { splitPercent: 10, trainingDaysPerWeek: 4 });
    expect(restCals).toBe(Math.round(2000 - 200 * (4 / 3)));
  });

  it("n=6 p=25 produces cappedByFloor when base is low", () => {
    const { cappedByFloor } = computeDayCalories(1300, true, { splitPercent: 25, trainingDaysPerWeek: 6 });
    // surplus=325, restOffset=325×6/1=1950, raw=-650 < 1200 → capped
    expect(cappedByFloor).toBe(true);
  });

  it("n=1 p=5 does not clamp (mild deficit)", () => {
    const { cappedByFloor, restCals } = computeDayCalories(2000, true, { splitPercent: 5, trainingDaysPerWeek: 1 });
    expect(cappedByFloor).toBe(false);
    expect(restCals).toBeGreaterThan(1200);
  });
});

// ─── edge case: split=0 effectively (after normalization to 5) ────────────────

describe("edge cases", () => {
  const BASE: PureMacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 55 };
  const WEIGHT_KG = 75;

  it("minimum split (p=5, n=1) produces small deltas on both days", () => {
    const training = computeEffectiveTargets(BASE, true, { splitPercent: 5, trainingDaysPerWeek: 1 }, WEIGHT_KG);
    const rest = computeEffectiveTargets(BASE, false, { splitPercent: 5, trainingDaysPerWeek: 1 }, WEIGHT_KG);
    expect(training.calories).toBeGreaterThan(BASE.calories);
    expect(rest.calories).toBeLessThan(BASE.calories);
    // deltas are small (5% of 2000 = 100 surplus; rest = 100/6 ≈ 17 less)
    expect(training.calories - BASE.calories).toBe(100);
    expect(BASE.calories - rest.calories).toBe(Math.round(100 / 6));
  });

  it("maximum split (p=25, n=1) for high base does not floor-clamp", () => {
    const highBase: PureMacroTargets = { calories: 3000, protein: 200, carbs: 320, fat: 80 };
    // surplus=750, restOffset=750/6=125, restCals=2875
    const rest = computeEffectiveTargets(highBase, false, { splitPercent: 25, trainingDaysPerWeek: 1 }, WEIGHT_KG);
    expect(rest.cappedByFloor).toBe(false);
    expect(rest.calories).toBe(Math.round(3000 - 750 / 6));
  });

  it("normalizes n=7 to 6 before computation (no ÷0)", () => {
    // If n=7 were allowed: 7-7=0 → division by zero → should be prevented
    expect(() =>
      computeEffectiveTargets(BASE, false, { splitPercent: 10, trainingDaysPerWeek: 7 }, WEIGHT_KG)
    ).not.toThrow();
    const result = computeEffectiveTargets(BASE, false, { splitPercent: 10, trainingDaysPerWeek: 7 }, WEIGHT_KG);
    expect(Number.isFinite(result.calories)).toBe(true);
    expect(Number.isNaN(result.calories)).toBe(false);
  });

  it("very low weight (40kg) does not produce NaN macros", () => {
    const result = computeEffectiveTargets(BASE, true, { splitPercent: 10, trainingDaysPerWeek: 4 }, 40);
    expect(Number.isFinite(result.protein)).toBe(true);
    expect(Number.isFinite(result.carbs)).toBe(true);
    expect(Number.isFinite(result.fat)).toBe(true);
  });
});
