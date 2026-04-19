import {
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  calculateFromProfile,
  convertToMetric,
  migrateProfile,
  type NutritionProfile,
} from "../../lib/nutrition-calc";

describe("nutrition-calc", () => {
  describe("convertToMetric", () => {
    it("passes through metric values", () => {
      const result = convertToMetric(75, "kg", 175, "cm");
      expect(result.weight_kg).toBe(75);
      expect(result.height_cm).toBe(175);
    });

    it("converts lb to kg", () => {
      const result = convertToMetric(165, "lb", 175, "cm");
      expect(result.weight_kg).toBeCloseTo(74.84, 1);
    });

    it("converts inches to cm", () => {
      const result = convertToMetric(75, "kg", 69, "in");
      expect(result.height_cm).toBeCloseTo(175.26, 1);
    });

    it("converts both units simultaneously", () => {
      const result = convertToMetric(165, "lb", 69, "in");
      expect(result.weight_kg).toBeCloseTo(74.84, 1);
      expect(result.height_cm).toBeCloseTo(175.26, 1);
    });
  });

  describe("calculateBMR", () => {
    it("calculates male BMR using Mifflin-St Jeor", () => {
      // 75kg, 175cm, 30yo male: 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
      const bmr = calculateBMR(75, 175, 30, "male");
      expect(bmr).toBeCloseTo(1698.75, 2);
    });

    it("calculates female BMR using Mifflin-St Jeor", () => {
      // 60kg, 165cm, 25yo female: 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
      const bmr = calculateBMR(60, 165, 25, "female");
      expect(bmr).toBeCloseTo(1345.25, 2);
    });

    it("male BMR is higher than female for same stats", () => {
      const male = calculateBMR(70, 170, 30, "male");
      const female = calculateBMR(70, 170, 30, "female");
      expect(male).toBeGreaterThan(female);
      expect(male - female).toBeCloseTo(166, 0); // +5 vs -161 = 166 difference
    });

    it("BMR decreases with age", () => {
      const young = calculateBMR(75, 175, 20, "male");
      const old = calculateBMR(75, 175, 50, "male");
      expect(young).toBeGreaterThan(old);
      expect(young - old).toBeCloseTo(150, 0); // 5 * (50-20)
    });
  });

  describe("calculateTDEE", () => {
    const bmr = 1700;

    it("applies sedentary multiplier (1.2)", () => {
      expect(calculateTDEE(bmr, "sedentary")).toBeCloseTo(2040, 0);
    });

    it("applies lightly active multiplier (1.375)", () => {
      expect(calculateTDEE(bmr, "lightly_active")).toBeCloseTo(2337.5, 0);
    });

    it("applies moderately active multiplier (1.55)", () => {
      expect(calculateTDEE(bmr, "moderately_active")).toBeCloseTo(2635, 0);
    });

    it("applies very active multiplier (1.725)", () => {
      expect(calculateTDEE(bmr, "very_active")).toBeCloseTo(2932.5, 0);
    });

    it("applies extra active multiplier (1.9)", () => {
      expect(calculateTDEE(bmr, "extra_active")).toBeCloseTo(3230, 0);
    });
  });

  describe("calculateMacros", () => {
    it("calculates macros for maintain goal", () => {
      const macros = calculateMacros(2500, 75, "maintain");
      expect(macros.calories).toBe(2500);
      expect(macros.protein).toBe(165); // 75 * 2.2
      expect(macros.fat).toBe(69); // round(2500 * 0.25 / 9)
      // carbs = (2500 - 165*4 - 69*9) / 4 = (2500 - 660 - 621) / 4 = 1219 / 4 = 304.75 -> 305
      expect(macros.carbs).toBe(305);
    });

    it("applies -500 kcal for cut goal", () => {
      const macros = calculateMacros(2500, 75, "cut");
      expect(macros.calories).toBe(2000);
    });

    it("applies +300 kcal for bulk goal", () => {
      const macros = calculateMacros(2500, 75, "bulk");
      expect(macros.calories).toBe(2800);
    });

    it("floors calories at 1200", () => {
      const macros = calculateMacros(1500, 50, "cut");
      // 1500 - 500 = 1000, floored to 1200
      expect(macros.calories).toBe(1200);
    });

    it("floors carbs at 0 when protein + fat exceed calories", () => {
      // Very heavy person with low TDEE
      const macros = calculateMacros(1200, 120, "cut");
      // calories = max(1200, 700) = 1200
      // protein = 120 * 2.2 = 264g = 1056 cal
      // fat = round(1200 * 0.25 / 9) = 33g = 297 cal
      // carbs = (1200 - 1056 - 297) / 4 = -153/4 -> floored to 0
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
