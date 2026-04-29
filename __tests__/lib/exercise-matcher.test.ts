import { matchExercise, matchAllExercises } from "../../lib/exercise-matcher";
import type { Exercise } from "../../lib/types";

// ---- Test fixtures ----

const exercises: Exercise[] = [
  {
    id: "ex-bench",
    name: "Barbell Bench Press",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["triceps", "shoulders"],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    import_batch_id: null,
  } as unknown as Exercise,
  {
    id: "ex-squat",
    name: "Barbell Back Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings"],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    import_batch_id: null,
  } as unknown as Exercise,
  {
    id: "ex-pullup",
    name: "Pull-up",
    category: "back",
    primary_muscles: ["lats", "back"],
    secondary_muscles: ["biceps"],
    equipment: "bodyweight",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    import_batch_id: null,
  } as unknown as Exercise,
  {
    id: "ex-ohp",
    name: "Overhead Press",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["triceps"],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    import_batch_id: null,
  } as unknown as Exercise,
  {
    id: "ex-curl",
    name: "Dumbbell Bicep Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: ["forearms"],
    equipment: "dumbbell",
    instructions: "",
    difficulty: "beginner",
    is_custom: false,
    deleted_at: null,
    import_batch_id: null,
  } as unknown as Exercise,
  {
    id: "ex-deleted",
    name: "Deleted Exercise",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: [],
    equipment: "barbell",
    instructions: "",
    difficulty: "beginner",
    is_custom: false,
    deleted_at: 1234567890,
    import_batch_id: null,
  } as unknown as Exercise,
];

describe("matchExercise", () => {
  it("returns exact match with high confidence and score 1.0", () => {
    const result = matchExercise("Barbell Bench Press", exercises);
    expect(result.bestMatch?.exercise.id).toBe("ex-bench");
    expect(result.bestMatch?.confidence).toBe("high");
    expect(result.bestMatch?.score).toBe(1.0);
    expect(result.bestMatch?.matchReason).toBe("exact");
  });

  it("is case-insensitive for exact match", () => {
    const result = matchExercise("barbell bench press", exercises);
    expect(result.bestMatch?.exercise.id).toBe("ex-bench");
    expect(result.bestMatch?.score).toBe(1.0);
  });

  it("skips deleted exercises", () => {
    const result = matchExercise("Deleted Exercise", exercises);
    // Should not match the deleted exercise
    if (result.bestMatch) {
      expect(result.bestMatch.exercise.id).not.toBe("ex-deleted");
    }
  });

  it("matches similar names via fuzzy scoring", () => {
    // "Bench Press" is close to "Barbell Bench Press"
    const result = matchExercise("Bench Press", exercises);
    expect(result.bestMatch?.exercise.id).toBe("ex-bench");
    expect(result.bestMatch!.score).toBeGreaterThan(0.4);
  });

  it("matches via NLP metadata when names differ significantly", () => {
    // "DB Shoulder Press" → should match Overhead Press via shoulder + press archetype
    const result = matchExercise("Dumbbell Shoulder Press", exercises);
    expect(result.bestMatch).not.toBeNull();
    expect(result.bestMatch!.score).toBeGreaterThan(0.4);
  });

  it("returns no match for completely unrelated exercise", () => {
    const result = matchExercise("Underwater Basket Weaving", exercises);
    expect(result.bestMatch).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it("provides NLP result for creating new exercises", () => {
    const result = matchExercise("Cable Lateral Raise", exercises);
    expect(result.nlpResult).toBeDefined();
    expect(result.nlpResult.equipment).toBe("cable");
  });

  it("candidates are sorted by score descending", () => {
    const result = matchExercise("Barbell Overhead Press", exercises);
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score);
    }
  });
});

describe("matchAllExercises", () => {
  it("deduplicates case-insensitively", () => {
    const results = matchAllExercises(
      ["Bench Press", "bench press", "BENCH PRESS"],
      exercises,
    );
    expect(results.size).toBe(1);
  });

  it("returns results for each unique name", () => {
    const results = matchAllExercises(
      ["Bench Press", "Pull-up", "Unknown Exercise XYZ"],
      exercises,
    );
    expect(results.size).toBe(3);
    expect(results.get("bench press")?.bestMatch).not.toBeNull();
    expect(results.get("pull-up")?.bestMatch?.exercise.id).toBe("ex-pullup");
  });
});
