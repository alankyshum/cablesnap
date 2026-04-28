import {
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  calculateFromProfile,
  convertToMetric,
  calculateDeviationPercent,
  migrateProfile,
  type NutritionProfile,
} from "../../lib/nutrition-calc";

describe("nutrition-calc", () => {
  describe("convertToMetric", () => {
    it.each([
      { name: "passes through metric values", w: 75, wu: "kg" as const, h: 175, hu: "cm" as const, expectKg: 75, expectCm: 175 },
      { name: "converts lb to kg", w: 165, wu: "lb" as const, h: 175, hu: "cm" as const, expectKg: 74.84, expectCm: 175 },
      { name: "converts inches to cm", w: 75, wu: "kg" as const, h: 69, hu: "in" as const, expectKg: 75, expectCm: 175.26 },
      { name: "converts both units simultaneously", w: 165, wu: "lb" as const, h: 69, hu: "in" as const, expectKg: 74.84, expectCm: 175.26 },
    ])("$name", ({ w, wu, h, hu, expectKg, expectCm }) => {
      const result = convertToMetric(w, wu, h, hu);
      expect(result.weight_kg).toBeCloseTo(expectKg, 1);
      expect(result.height_cm).toBeCloseTo(expectCm, 1);
    });
  });

  describe("calculateBMR", () => {
    it.each([
      // 75kg, 175cm, 30yo male: 10*75 + 6.25*175 - 5*30 + 5 = 1698.75
      { name: "male Mifflin-St Jeor", w: 75, h: 175, age: 30, sex: "male" as const, expected: 1698.75 },
      // 60kg, 165cm, 25yo female: 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
      { name: "female Mifflin-St Jeor", w: 60, h: 165, age: 25, sex: "female" as const, expected: 1345.25 },
    ])("calculates $name", ({ w, h, age, sex, expected }) => {
      expect(calculateBMR(w, h, age, sex)).toBeCloseTo(expected, 2);
    });

    it("monotonic invariants: male > female (same stats), young > old (same sex)", () => {
      const male = calculateBMR(70, 170, 30, "male");
      const female = calculateBMR(70, 170, 30, "female");
      expect(male).toBeGreaterThan(female);
      expect(male - female).toBeCloseTo(166, 0); // +5 vs -161 = 166

      const young = calculateBMR(75, 175, 20, "male");
      const old = calculateBMR(75, 175, 50, "male");
      expect(young).toBeGreaterThan(old);
      expect(young - old).toBeCloseTo(150, 0); // 5 * (50-20)
    });
  });

  describe("calculateTDEE", () => {
    const bmr = 1700;
    it.each([
      { level: "sedentary" as const, multiplier: 1.2, expected: 2040 },
      { level: "lightly_active" as const, multiplier: 1.375, expected: 2337.5 },
      { level: "moderately_active" as const, multiplier: 1.55, expected: 2635 },
      { level: "very_active" as const, multiplier: 1.725, expected: 2932.5 },
      { level: "extra_active" as const, multiplier: 1.9, expected: 3230 },
    ])("applies $level multiplier ($multiplier)", ({ level, expected }) => {
      expect(calculateTDEE(bmr, level)).toBeCloseTo(expected, 0);
    });
  });

  describe("calculateMacros", () => {
    it("calculates macros for maintain goal (full breakdown)", () => {
      const macros = calculateMacros(2500, 75, "maintain");
      expect(macros.calories).toBe(2500);
      expect(macros.protein).toBe(165); // 75 * 2.2
      expect(macros.fat).toBe(69); // round(2500 * 0.25 / 9)
      // carbs = (2500 - 165*4 - 69*9) / 4 = 304.75 -> 305
      expect(macros.carbs).toBe(305);
    });

    it.each([
      { name: "cut: -500 kcal", goal: "cut" as const, tdee: 2500, w: 75, expectedCal: 2000 },
      { name: "bulk: +300 kcal", goal: "bulk" as const, tdee: 2500, w: 75, expectedCal: 2800 },
      { name: "floors calories at 1200", goal: "cut" as const, tdee: 1500, w: 50, expectedCal: 1200 },
    ])("$name", ({ goal, tdee, w, expectedCal }) => {
      expect(calculateMacros(tdee, w, goal).calories).toBe(expectedCal);
    });

    it("floors carbs at 0 when protein + fat exceed calories", () => {
      // Heavy person with low TDEE → carbs would go negative → clamped 0
      const macros = calculateMacros(1200, 120, "cut");
      expect(macros.carbs).toBe(0);
      expect(macros.protein).toBe(264);
    });
  });

  describe("calculateFromProfile", () => {
    const currentYear = new Date().getFullYear();
    const baseProfile: NutritionProfile = {
      birthYear: currentYear - 30,
      weight: 75,
      height: 175,
      sex: "male",
      activityLevel: "moderately_active",
      goal: "maintain",
      weightUnit: "kg",
      heightUnit: "cm",
    };

    it("returns macros with belowFloor flag", () => {
      const result = calculateFromProfile(baseProfile);
      expect(result.calories).toBeGreaterThan(0);
      expect(result.protein).toBeGreaterThan(0);
      expect(result.fat).toBeGreaterThan(0);
      expect(result.carbs).toBeGreaterThanOrEqual(0);
      expect(result.belowFloor).toBe(false);
    });

    it("sets belowFloor when calories would be under 1200", () => {
      const smallCutting: NutritionProfile = {
        ...baseProfile,
        weight: 45,
        height: 155,
        sex: "female",
        activityLevel: "sedentary",
        goal: "cut",
      };
      const result = calculateFromProfile(smallCutting);
      expect(result.calories).toBe(1200);
      expect(result.belowFloor).toBe(true);
    });

    it("handles imperial units correctly", () => {
      const imperial: NutritionProfile = {
        ...baseProfile,
        weight: 165,
        height: 69,
        weightUnit: "lb",
        heightUnit: "in",
      };
      const result = calculateFromProfile(imperial);
      // Should produce similar results to metric equivalent
      const metric = calculateFromProfile(baseProfile);
      // 165lb ≈ 74.8kg, 69in ≈ 175.3cm — close to 75kg/175cm
      expect(Math.abs(result.calories - metric.calories)).toBeLessThan(50);
    });

    it("end-to-end: 30yo 75kg 175cm male, moderately active, maintaining", () => {
      const result = calculateFromProfile(baseProfile);
      // birthYear = currentYear - 30 → age = 30
      // BMR = 10*75 + 6.25*175 - 5*30 + 5 = 1698.75
      // TDEE = 1698.75 * 1.55 = 2633.06
      // calories = round(2633.06) = 2633
      expect(result.calories).toBe(2633);
      expect(result.protein).toBe(165); // 75 * 2.2
    });
    it("uses rmr_override when truthy, ignores otherwise (null/0)", () => {
      const baseline = calculateFromProfile(baseProfile);

      // truthy override changes the calorie target
      const withOverride = calculateFromProfile({ ...baseProfile, rmr_override: 1750 });
      // TDEE = 1750 * 1.55 = 2712.5, calories = round(2712.5) = 2713
      expect(withOverride.calories).toBe(2713);

      // null/0 are treated as "no override" → identical to baseline
      expect(calculateFromProfile({ ...baseProfile, rmr_override: null }).calories).toBe(baseline.calories);
      expect(calculateFromProfile({ ...baseProfile, rmr_override: 0 }).calories).toBe(baseline.calories);
    });

    it("applies calorie floor with low rmr_override", () => {
      const profile: NutritionProfile = {
        ...baseProfile,
        rmr_override: 500,
        activityLevel: "sedentary",
        goal: "cut",
      };
      const result = calculateFromProfile(profile);
      // TDEE = 500 * 1.2 = 600, 600 - 500 = 100 → floor 1200
      expect(result.calories).toBe(1200);
      expect(result.belowFloor).toBe(true);
    });
  });

  describe("calculateDeviationPercent", () => {
    it.each([
      // 2000 vs 1700 → |300/1700| * 100 = 17.65%
      { name: "above estimate", measured: 2000, estimate: 1700, expected: 17.65 },
      // 1400 vs 1700 → also 17.65%
      { name: "below estimate (absolute)", measured: 1400, estimate: 1700, expected: 17.65 },
      { name: "0 estimate → 0", measured: 1750, estimate: 0, expected: 0 },
    ])("$name", ({ measured, estimate, expected }) => {
      expect(calculateDeviationPercent(measured, estimate)).toBeCloseTo(expected, 1);
    });
  });

  describe("migrateProfile", () => {
    it("passes through a valid profile", () => {
      const modern = { birthYear: 1990, weight: 75, height: 175, sex: "male", activityLevel: "moderately_active", goal: "maintain", weightUnit: "kg", heightUnit: "cm" };
      const migrated = migrateProfile(modern);
      expect(migrated.birthYear).toBe(1990);
      expect(migrated.weight).toBe(75);
    });
  });
});
