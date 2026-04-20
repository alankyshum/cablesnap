import {
  getStrengthLevel,
  matchExercise,
  hasStandards,
  getStandardExerciseKeys,
  LEVELS,
} from "../../lib/strength-standards";

describe("strength-standards", () => {
  describe("matchExercise + hasStandards", () => {
    it("matches standard names case-insensitively and with prefixes", () => {
      expect(matchExercise("Bench Press")).toBe("bench press");
      expect(matchExercise("SQUAT")).toBe("squat");
      expect(matchExercise("deadlift")).toBe("deadlift");
      expect(matchExercise("Overhead Press")).toBe("overhead press");
      expect(matchExercise("Barbell Row")).toBe("barbell row");
      expect(matchExercise("Barbell Bench Press")).toBe("bench press");
      expect(matchExercise("Back Squat")).toBe("squat");
      expect(matchExercise("Conventional Deadlift")).toBe("deadlift");
      expect(matchExercise("Standing Overhead Press")).toBe("overhead press");
      expect(matchExercise("  bench press  ")).toBe("bench press");
    });

    it("returns null for non-standard exercises and hasStandards agrees", () => {
      expect(matchExercise("Cable Fly")).toBeNull();
      expect(matchExercise("Bicep Curl")).toBeNull();
      expect(matchExercise("")).toBeNull();
      expect(hasStandards("Cable Fly")).toBe(false);
      expect(hasStandards("Bench Press")).toBe(true);
      expect(hasStandards("Barbell Squat")).toBe(true);
    });
  });

  describe("getStandardExerciseKeys + LEVELS", () => {
    it("returns all 5 keys and levels in correct order", () => {
      const keys = getStandardExerciseKeys();
      expect(keys).toHaveLength(5);
      expect(keys).toContain("bench press");
      expect(keys).toContain("squat");
      expect(keys).toContain("deadlift");
      expect(keys).toContain("overhead press");
      expect(keys).toContain("barbell row");
      expect(LEVELS).toEqual(["beginner", "novice", "intermediate", "advanced", "elite"]);
    });
  });

  describe("getStrengthLevel", () => {
    it("returns Intermediate for male 80kg BW / 80kg bench (ratio 1.0)", () => {
      const result = getStrengthLevel("Bench Press", "male", 80, 80);
      expect(result).not.toBeNull();
      expect(result!.level).toBe("intermediate");
      expect(result!.nextLevel).toBe("advanced");
      expect(result!.nextThresholdKg).toBe(100);
    });

    it("returns Intermediate for female 60kg BW / 45kg bench (ratio 0.75)", () => {
      const result = getStrengthLevel("Bench Press", "female", 60, 45);
      expect(result).not.toBeNull();
      expect(result!.level).toBe("intermediate");
      expect(result!.nextLevel).toBe("advanced");
      expect(result!.nextThresholdKg).toBe(60);
    });

    it("returns Elite with no next level for top-tier lifts", () => {
      const result = getStrengthLevel("Squat", "male", 80, 200);
      expect(result).not.toBeNull();
      expect(result!.level).toBe("elite");
      expect(result!.nextLevel).toBeNull();
      expect(result!.nextThresholdKg).toBeNull();
    });

    it("returns Beginner when ratio is below beginner threshold", () => {
      const result = getStrengthLevel("Bench Press", "male", 80, 30);
      expect(result).not.toBeNull();
      expect(result!.level).toBe("beginner");
      expect(result!.nextLevel).toBe("novice");
    });

    it("treats threshold as inclusive (at threshold = achieved)", () => {
      const r1 = getStrengthLevel("Bench Press", "male", 80, 80);
      expect(r1!.level).toBe("intermediate");
      const r2 = getStrengthLevel("Bench Press", "male", 80, 60);
      expect(r2!.level).toBe("novice");
    });

    it("returns null for invalid inputs and non-standard exercises", () => {
      expect(getStrengthLevel("Cable Fly", "male", 80, 50)).toBeNull();
      expect(getStrengthLevel("Bench Press", "male", 0, 80)).toBeNull();
      expect(getStrengthLevel("Bench Press", "male", 80, 0)).toBeNull();
      expect(getStrengthLevel("Bench Press", "male", -5, 80)).toBeNull();
      expect(getStrengthLevel("Bench Press", "male", 80, -10)).toBeNull();
    });

    it("works for all supported exercises (male and female)", () => {
      const exercises = ["Bench Press", "Squat", "Deadlift", "Overhead Press", "Barbell Row"];
      for (const ex of exercises) {
        const m = getStrengthLevel(ex, "male", 80, 80);
        expect(m).not.toBeNull();
        expect(LEVELS).toContain(m!.level);
        const f = getStrengthLevel(ex, "female", 60, 45);
        expect(f).not.toBeNull();
        expect(LEVELS).toContain(f!.level);
      }
    });
  });
});
