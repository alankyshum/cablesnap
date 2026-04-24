import { composeSearchResults, isBlankQuery } from "../../lib/exercise-substitution-search";
import { findSubstitutions } from "../../lib/exercise-substitutions";
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

describe("exercise-substitution-search", () => {
  describe("isBlankQuery", () => {
    it("treats empty and whitespace-only strings as blank", () => {
      expect(isBlankQuery("")).toBe(true);
      expect(isBlankQuery("   ")).toBe(true);
      expect(isBlankQuery("\t\n")).toBe(true);
    });
    it("treats non-empty strings as non-blank", () => {
      expect(isBlankQuery("a")).toBe(false);
      expect(isBlankQuery(" pull ")).toBe(false);
    });
  });

  describe("composeSearchResults", () => {
    const source = makeExercise({ id: "src", name: "Barbell Bench Press" });

    const benchMuscleMatch = makeExercise({
      id: "bench-db",
      name: "Dumbbell Bench Press",
      primary_muscles: ["chest", "triceps"],
      equipment: "dumbbell",
    });
    const dipMuscleMatch = makeExercise({
      id: "dip",
      name: "Cable Chest Dip",
      primary_muscles: ["chest"],
      equipment: "cable",
    });
    const unrelated = makeExercise({
      id: "squat",
      name: "Zippy Back Squat",
      primary_muscles: ["quads"],
      secondary_muscles: ["glutes"],
      category: "legs",
      equipment: "bodyweight",
      difficulty: "advanced",
    });
    const unrelatedPull = makeExercise({
      id: "pullup",
      name: "Pull-Up",
      primary_muscles: ["lats"],
      secondary_muscles: ["biceps"],
      category: "back",
      equipment: "bodyweight",
    });
    const deletedMatch = makeExercise({
      id: "deleted-pull",
      name: "Pulldown (deleted)",
      primary_muscles: ["lats"],
      equipment: "cable",
      deleted_at: "2026-01-01",
    });

    const allExercises = [
      source,
      benchMuscleMatch,
      dipMuscleMatch,
      unrelated,
      unrelatedPull,
      deletedMatch,
    ];
    const scored = findSubstitutions(source, allExercises);

    it("empty query returns muscle-relevance results with no 'other' section", () => {
      const res = composeSearchResults({
        query: "",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      expect(res.other).toEqual([]);
      expect(res.relevance.map((r) => r.exercise.id)).toEqual(
        scored.map((s) => s.exercise.id)
      );
    });

    it("empty query applies equipment filter to relevance", () => {
      const res = composeSearchResults({
        query: "   ",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: "cable",
      });
      expect(res.other).toEqual([]);
      expect(res.relevance.every((r) => r.exercise.equipment === "cable")).toBe(true);
    });

    it("name query finds muscle-relevance matches by name and places them in `relevance`", () => {
      const res = composeSearchResults({
        query: "bench",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      const relevanceIds = res.relevance.map((r) => r.exercise.id);
      expect(relevanceIds).toContain("bench-db");
      expect(res.other.every((o) => o.exercise.id !== "bench-db")).toBe(true);
    });

    it("non-muscle name matches land in `other`, sorted alphabetically", () => {
      const res = composeSearchResults({
        query: "zippy",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      const relevanceIds = res.relevance.map((r) => r.exercise.id);
      const otherIds = res.other.map((o) => o.exercise.id);
      expect(otherIds).toContain("squat");
      expect(relevanceIds).not.toContain("squat");
      // alphabetic order
      const names = res.other.map((o) => o.exercise.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it("query is case-insensitive and substring-based", () => {
      const res = composeSearchResults({
        query: "PULL",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      const all = [...res.relevance, ...res.other].map((r) => r.exercise.id);
      expect(all).toContain("pullup");
    });

    it("excludes source exercise from both sections", () => {
      const res = composeSearchResults({
        query: "bench",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      const all = [...res.relevance, ...res.other].map((r) => r.exercise.id);
      expect(all).not.toContain("src");
    });

    it("excludes deleted exercises from `other`", () => {
      const res = composeSearchResults({
        query: "pulldown",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      const all = [...res.relevance, ...res.other].map((r) => r.exercise.id);
      expect(all).not.toContain("deleted-pull");
    });

    it("applies equipment filter to both sections when query is set", () => {
      const res = composeSearchResults({
        query: "bench",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: "cable",
      });
      const all = [...res.relevance, ...res.other];
      expect(all.every((r) => r.exercise.equipment === "cable")).toBe(true);
    });

    it("returns empty sections when no names match", () => {
      const res = composeSearchResults({
        query: "zzzunknownzzz",
        scored,
        allExercises,
        sourceExercise: source,
        equipmentFilter: null,
      });
      expect(res.relevance).toEqual([]);
      expect(res.other).toEqual([]);
    });

    it("supports the no-muscle-data source path: still returns name matches in `other`", () => {
      const noMuscleSource = makeExercise({
        id: "nomuscle",
        name: "Mystery Exercise",
        primary_muscles: [],
        secondary_muscles: [],
      });
      // findSubstitutions returns [] when source has no muscles
      const emptyScored = findSubstitutions(noMuscleSource, allExercises);
      expect(emptyScored).toEqual([]);
      const res = composeSearchResults({
        query: "bench",
        scored: emptyScored,
        allExercises,
        sourceExercise: noMuscleSource,
        equipmentFilter: null,
      });
      expect(res.relevance).toEqual([]);
      const otherIds = res.other.map((o) => o.exercise.id);
      expect(otherIds).toContain("bench-db");
    });
  });
});
