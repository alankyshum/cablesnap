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

    type Field = "primaryOverlap" | "secondaryOverlap" | "equipmentMatch" | "categoryMatch" | "difficultyProx";
    const cases: {
      name: string;
      source: Partial<Exercise>;
      candidate: Partial<Exercise>;
      field: Field;
      expected: number;
    }[] = [
      // Muscle overlap proportional scoring
      {
        name: "primary muscle overlap proportional (1/3 * 50 = 17)",
        source: { primary_muscles: ["chest", "triceps"] },
        candidate: { primary_muscles: ["chest", "shoulders"] },
        field: "primaryOverlap",
        expected: 17,
      },
      {
        name: "secondary muscle overlap proportional (1/3 * 20 = 7)",
        source: { secondary_muscles: ["shoulders", "core"] },
        candidate: { secondary_muscles: ["shoulders", "biceps"] },
        field: "secondaryOverlap",
        expected: 7,
      },
      {
        name: "empty primary muscles -> 0",
        source: { primary_muscles: [] },
        candidate: { primary_muscles: ["chest"] },
        field: "primaryOverlap",
        expected: 0,
      },
      {
        name: "empty secondary muscles -> 0",
        source: { secondary_muscles: [] },
        candidate: { secondary_muscles: [] },
        field: "secondaryOverlap",
        expected: 0,
      },
      // Equipment scoring
      {
        name: "same equipment -> 15",
        source: { equipment: "barbell" },
        candidate: { equipment: "barbell" },
        field: "equipmentMatch",
        expected: 15,
      },
      {
        name: "same equipment group (free weights: barbell/dumbbell) -> 8",
        source: { equipment: "barbell" },
        candidate: { equipment: "dumbbell" },
        field: "equipmentMatch",
        expected: 8,
      },
      {
        name: "same equipment group (machines: machine/cable) -> 8",
        source: { equipment: "machine" },
        candidate: { equipment: "cable" },
        field: "equipmentMatch",
        expected: 8,
      },
      {
        name: "different equipment group (barbell vs bodyweight) -> 0",
        source: { equipment: "barbell" },
        candidate: { equipment: "bodyweight" },
        field: "equipmentMatch",
        expected: 0,
      },
      // Category scoring
      {
        name: "same category -> 10",
        source: { category: "chest" },
        candidate: { category: "chest" },
        field: "categoryMatch",
        expected: 10,
      },
      {
        name: "different category -> 0",
        source: { category: "chest" },
        candidate: { category: "back" },
        field: "categoryMatch",
        expected: 0,
      },
      // Difficulty proximity
      {
        name: "same difficulty -> 5",
        source: { difficulty: "intermediate" },
        candidate: { difficulty: "intermediate" },
        field: "difficultyProx",
        expected: 5,
      },
      {
        name: "±1 difficulty -> 3",
        source: { difficulty: "intermediate" },
        candidate: { difficulty: "beginner" },
        field: "difficultyProx",
        expected: 3,
      },
      {
        name: "±2 difficulty -> 1",
        source: { difficulty: "beginner" },
        candidate: { difficulty: "advanced" },
        field: "difficultyProx",
        expected: 1,
      },
    ];

    it.each(cases)("$name", ({ source, candidate, field, expected }) => {
      const s = makeExercise({ id: "a", ...source });
      const c = makeExercise({ id: "b", ...candidate });
      expect(scoreSubstitutionDetailed(s, c)[field]).toBe(expected);
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
    it("excludes source, deleted, and below-threshold candidates; returns [] when source has no primary muscles", () => {
      // No primary muscles -> empty
      expect(
        findSubstitutions(makeExercise({ primary_muscles: [] }), [makeExercise({ id: "b" })])
      ).toEqual([]);

      // Excludes source by id
      const sourceA = makeExercise({ id: "a" });
      const r1 = findSubstitutions(sourceA, [
        makeExercise({ id: "a" }),
        makeExercise({ id: "b" }),
      ]);
      expect(r1.every((r) => r.exercise.id !== "a")).toBe(true);

      // Excludes deleted_at
      const r2 = findSubstitutions(sourceA, [
        makeExercise({ id: "b", deleted_at: Date.now() }),
        makeExercise({ id: "c" }),
      ]);
      expect(r2.every((r) => r.exercise.id !== "b")).toBe(true);
      expect(r2.length).toBe(1);

      // Below minimum threshold (20)
      const lowSource = makeExercise({
        id: "a",
        primary_muscles: ["chest"],
        secondary_muscles: [],
        category: "chest",
        equipment: "barbell",
      });
      const lowCandidate = makeExercise({
        id: "b",
        primary_muscles: ["calves"],
        secondary_muscles: [],
        category: "legs_glutes",
        equipment: "bodyweight",
        difficulty: "advanced",
      });
      expect(findSubstitutions(lowSource, [lowCandidate]).length).toBe(0);
    });

    it("sorts by score descending and respects limit (custom and default 20)", () => {
      // Sort
      const sortSource = makeExercise({ id: "a", primary_muscles: ["chest", "triceps"] });
      const perfect = makeExercise({ id: "b" });
      const partial = makeExercise({
        id: "c",
        primary_muscles: ["chest"],
        secondary_muscles: [],
        equipment: "dumbbell",
      });
      const sortResults = findSubstitutions(sortSource, [partial, perfect]);
      expect(sortResults[0].exercise.id).toBe("b");
      expect(sortResults[1].exercise.id).toBe("c");

      // Custom limit
      const limitSource = makeExercise({ id: "a" });
      const candidates = Array.from({ length: 30 }, (_, i) => makeExercise({ id: `ex-${i}` }));
      expect(findSubstitutions(limitSource, candidates, 5).length).toBe(5);

      // Default limit 20
      expect(findSubstitutions(limitSource, candidates).length).toBe(20);
    });

    it("scores same-muscle-different-equipment >80% and includes custom exercises", () => {
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
      const r = findSubstitutions(source, [sameMuscleDiffEquip]);
      expect(r.length).toBe(1);
      // 50 + 20 + 8 + 10 + 5 = 93
      expect(r[0].score).toBeGreaterThan(80);

      // custom exercises included
      const custom = makeExercise({ id: "custom-1", is_custom: true });
      expect(findSubstitutions(makeExercise({ id: "a" }), [custom]).length).toBe(1);
    });
  });
});
