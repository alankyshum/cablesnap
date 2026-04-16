import {
  scoreSubstitution,
  scoreSubstitutionDetailed,
  findSubstitutions,
} from "../../lib/exercise-substitutions";
import type { Exercise } from "../../lib/types";

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    name: "Bench Press",
    category: "chest",
    primary_muscles: ["chest", "triceps"],
    secondary_muscles: ["shoulders"],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    ...overrides,
  };
}

describe("exercise-substitutions", () => {
  describe("scoreSubstitutionDetailed", () => {
    it("returns perfect score for identical exercises (except id)", () => {
      const source = makeExercise({ id: "a" });
      const candidate = makeExercise({ id: "b" });
      const details = scoreSubstitutionDetailed(source, candidate);
      expect(details.primaryOverlap).toBe(50);
      expect(details.secondaryOverlap).toBe(20);
      expect(details.equipmentMatch).toBe(15);
      expect(details.categoryMatch).toBe(10);
      expect(details.difficultyProx).toBe(5);
    });

    it("scores primary muscle overlap proportionally", () => {
      const source = makeExercise({ primary_muscles: ["chest", "triceps"] });
      const candidate = makeExercise({
        id: "b",
        primary_muscles: ["chest", "shoulders"],
      });
      const details = scoreSubstitutionDetailed(source, candidate);
      // intersection: [chest] = 1, union: [chest, triceps, shoulders] = 3
      // 1/3 * 50 = ~17
      expect(details.primaryOverlap).toBe(17);
    });

    it("scores secondary muscle overlap proportionally", () => {
      const source = makeExercise({
        secondary_muscles: ["shoulders", "core"],
      });
      const candidate = makeExercise({
        id: "b",
        secondary_muscles: ["shoulders", "biceps"],
      });
      const details = scoreSubstitutionDetailed(source, candidate);
      // intersection: [shoulders] = 1, union: [shoulders, core, biceps] = 3
      // 1/3 * 20 = ~7
      expect(details.secondaryOverlap).toBe(7);
    });

    it("gives 15 pts for same equipment", () => {
      const source = makeExercise({ equipment: "barbell" });
      const candidate = makeExercise({ id: "b", equipment: "barbell" });
      expect(scoreSubstitutionDetailed(source, candidate).equipmentMatch).toBe(15);
    });

    it("gives 8 pts for same equipment group (free weights)", () => {
      const source = makeExercise({ equipment: "barbell" });
      const candidate = makeExercise({ id: "b", equipment: "dumbbell" });
      expect(scoreSubstitutionDetailed(source, candidate).equipmentMatch).toBe(8);
    });

    it("gives 8 pts for same equipment group (machines)", () => {
      const source = makeExercise({ equipment: "machine" });
      const candidate = makeExercise({ id: "b", equipment: "cable" });
      expect(scoreSubstitutionDetailed(source, candidate).equipmentMatch).toBe(8);
    });

    it("gives 0 pts for different equipment group", () => {
      const source = makeExercise({ equipment: "barbell" });
      const candidate = makeExercise({ id: "b", equipment: "bodyweight" });
      expect(scoreSubstitutionDetailed(source, candidate).equipmentMatch).toBe(0);
    });

    it("gives 10 pts for same category", () => {
      const source = makeExercise({ category: "chest" });
      const candidate = makeExercise({ id: "b", category: "chest" });
      expect(scoreSubstitutionDetailed(source, candidate).categoryMatch).toBe(10);
    });

    it("gives 0 pts for different category", () => {
      const source = makeExercise({ category: "chest" });
      const candidate = makeExercise({ id: "b", category: "back" });
      expect(scoreSubstitutionDetailed(source, candidate).categoryMatch).toBe(0);
    });

    it("gives 5 pts for same difficulty", () => {
      const source = makeExercise({ difficulty: "intermediate" });
      const candidate = makeExercise({ id: "b", difficulty: "intermediate" });
      expect(scoreSubstitutionDetailed(source, candidate).difficultyProx).toBe(5);
    });

    it("gives 3 pts for ±1 difficulty", () => {
      const source = makeExercise({ difficulty: "intermediate" });
      const candidate = makeExercise({ id: "b", difficulty: "beginner" });
      expect(scoreSubstitutionDetailed(source, candidate).difficultyProx).toBe(3);
    });

    it("gives 1 pt for ±2 difficulty", () => {
      const source = makeExercise({ difficulty: "beginner" });
      const candidate = makeExercise({ id: "b", difficulty: "advanced" });
      expect(scoreSubstitutionDetailed(source, candidate).difficultyProx).toBe(1);
    });

    it("handles empty primary muscles", () => {
      const source = makeExercise({ primary_muscles: [] });
      const candidate = makeExercise({ id: "b", primary_muscles: ["chest"] });
      expect(scoreSubstitutionDetailed(source, candidate).primaryOverlap).toBe(0);
    });

    it("handles empty secondary muscles", () => {
      const source = makeExercise({ secondary_muscles: [] });
      const candidate = makeExercise({ id: "b", secondary_muscles: [] });
      expect(scoreSubstitutionDetailed(source, candidate).secondaryOverlap).toBe(0);
    });
  });

  describe("scoreSubstitution", () => {
    it("returns sum of all detail scores", () => {
      const source = makeExercise({ id: "a" });
      const candidate = makeExercise({ id: "b" });
      expect(scoreSubstitution(source, candidate)).toBe(100);
    });
  });

  describe("findSubstitutions", () => {
    it("returns empty array when source has no primary muscles", () => {
      const source = makeExercise({ primary_muscles: [] });
      const candidates = [makeExercise({ id: "b" })];
      expect(findSubstitutions(source, candidates)).toEqual([]);
    });

    it("excludes source exercise from results", () => {
      const source = makeExercise({ id: "a" });
      const candidates = [
        makeExercise({ id: "a" }),
        makeExercise({ id: "b" }),
      ];
      const results = findSubstitutions(source, candidates);
      expect(results.every((r) => r.exercise.id !== "a")).toBe(true);
    });

    it("excludes deleted exercises from results", () => {
      const source = makeExercise({ id: "a" });
      const candidates = [
        makeExercise({ id: "b", deleted_at: Date.now() }),
        makeExercise({ id: "c" }),
      ];
      const results = findSubstitutions(source, candidates);
      expect(results.every((r) => r.exercise.id !== "b")).toBe(true);
      expect(results.length).toBe(1);
    });

    it("filters out exercises below minimum threshold (20)", () => {
      const source = makeExercise({
        id: "a",
        primary_muscles: ["chest"],
        secondary_muscles: [],
        category: "chest",
        equipment: "barbell",
      });
      const lowScoreCandidate = makeExercise({
        id: "b",
        primary_muscles: ["calves"],
        secondary_muscles: [],
        category: "legs_glutes",
        equipment: "bodyweight",
        difficulty: "advanced",
      });
      const results = findSubstitutions(source, [lowScoreCandidate]);
      // calves vs chest = 0 overlap, different category, different equipment, different difficulty
      expect(results.length).toBe(0);
    });

    it("sorts by score descending", () => {
      const source = makeExercise({ id: "a", primary_muscles: ["chest", "triceps"] });
      const perfect = makeExercise({ id: "b" }); // same muscles
      const partial = makeExercise({
        id: "c",
        primary_muscles: ["chest"],
        secondary_muscles: [],
        equipment: "dumbbell",
      });
      const results = findSubstitutions(source, [partial, perfect]);
      expect(results[0].exercise.id).toBe("b");
      expect(results[1].exercise.id).toBe("c");
    });

    it("limits results to specified limit", () => {
      const source = makeExercise({ id: "a" });
      const candidates = Array.from({ length: 30 }, (_, i) =>
        makeExercise({ id: `ex-${i}` })
      );
      const results = findSubstitutions(source, candidates, 5);
      expect(results.length).toBe(5);
    });

    it("defaults to max 20 results", () => {
      const source = makeExercise({ id: "a" });
      const candidates = Array.from({ length: 30 }, (_, i) =>
        makeExercise({ id: `ex-${i}` })
      );
      const results = findSubstitutions(source, candidates);
      expect(results.length).toBe(20);
    });

    it("exercises with same primary muscles score >80%", () => {
      const source = makeExercise({
        id: "a",
        primary_muscles: ["chest", "triceps"],
        secondary_muscles: ["shoulders"],
        equipment: "barbell",
        category: "chest",
        difficulty: "intermediate",
      });
      const sameMuscleDiffEquip = makeExercise({
        id: "b",
        primary_muscles: ["chest", "triceps"],
        secondary_muscles: ["shoulders"],
        equipment: "dumbbell",
        category: "chest",
        difficulty: "intermediate",
      });
      const results = findSubstitutions(source, [sameMuscleDiffEquip]);
      expect(results.length).toBe(1);
      // 50 (primary) + 20 (secondary) + 8 (same group) + 10 (category) + 5 (difficulty) = 93
      expect(results[0].score).toBeGreaterThan(80);
    });

    it("includes custom exercises", () => {
      const source = makeExercise({ id: "a" });
      const custom = makeExercise({ id: "custom-1", is_custom: true });
      const results = findSubstitutions(source, [custom]);
      expect(results.length).toBe(1);
    });
  });
});
