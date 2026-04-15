import { parseExerciseDescription, type NlpResult } from "../../lib/exercise-nlp";

// ---- Helpers ----

function expectResult(
  input: string,
  expected: Partial<NlpResult>
) {
  const result = parseExerciseDescription(input);
  if (expected.name !== undefined) expect(result.name).toBe(expected.name);
  if (expected.category !== undefined) expect(result.category).toBe(expected.category);
  if (expected.equipment !== undefined) expect(result.equipment).toBe(expected.equipment);
  if (expected.difficulty !== undefined) expect(result.difficulty).toBe(expected.difficulty);
  if (expected.primary_muscles !== undefined)
    expect(result.primary_muscles).toEqual(expect.arrayContaining(expected.primary_muscles));
  if (expected.secondary_muscles !== undefined)
    expect(result.secondary_muscles).toEqual(expect.arrayContaining(expected.secondary_muscles));
  return result;
}

// ---- Archetype matching ----

describe("parseExerciseDescription", () => {
  describe("chest exercises", () => {
    it("parses 'bench press'", () => {
      expectResult("bench press", {
        category: "chest",
        primary_muscles: ["chest"],
        secondary_muscles: ["triceps", "shoulders"],
      });
    });

    it("parses 'dumbbell bench press'", () => {
      expectResult("dumbbell bench press", {
        name: "Dumbbell Bench Press",
        category: "chest",
        equipment: "dumbbell",
        primary_muscles: ["chest"],
      });
    });

    it("parses 'incline barbell bench press'", () => {
      const r = expectResult("incline barbell bench press", {
        category: "chest",
        equipment: "barbell",
        primary_muscles: ["chest"],
      });
      expect(r.name).toContain("Incline");
      expect(r.name).toContain("Barbell");
      expect(r.name).toContain("Bench Press");
    });

    it("parses 'decline bench'", () => {
      const r = expectResult("decline bench", {
        category: "chest",
        primary_muscles: ["chest"],
      });
      expect(r.name).toContain("Decline");
    });

    it("parses push-ups", () => {
      expectResult("push ups", {
        category: "chest",
        primary_muscles: ["chest"],
        secondary_muscles: ["triceps", "shoulders"],
      });
    });

    it("parses 'cable crossover'", () => {
      expectResult("cable crossover", {
        category: "chest",
        equipment: "cable",
        primary_muscles: ["chest"],
      });
    });

    it("parses 'dip'", () => {
      expectResult("dip", {
        category: "chest",
        primary_muscles: ["chest", "triceps"],
      });
    });
  });

  describe("back exercises", () => {
    it("parses 'lat pulldown'", () => {
      expectResult("lat pulldown", {
        category: "back",
        primary_muscles: ["lats"],
        secondary_muscles: ["biceps"],
      });
    });

    it("parses 'pull-up'", () => {
      expectResult("pull-up", {
        category: "back",
        primary_muscles: ["lats", "back"],
      });
    });

    it("parses 'chin-up'", () => {
      expectResult("chin-up", {
        category: "back",
        primary_muscles: ["lats", "biceps"],
      });
    });

    it("parses 'barbell row'", () => {
      expectResult("barbell row", {
        category: "back",
        equipment: "barbell",
        primary_muscles: ["back", "lats"],
      });
    });

    it("parses 'deadlift'", () => {
      expectResult("deadlift", {
        category: "back",
        primary_muscles: ["back", "hamstrings", "glutes"],
      });
    });

    it("parses 'shrug'", () => {
      expectResult("shrug", {
        category: "back",
        primary_muscles: ["traps"],
      });
    });

    it("parses 't-bar row'", () => {
      expectResult("t-bar row", {
        category: "back",
        primary_muscles: ["back", "lats"],
      });
    });

    it("parses 'back extension'", () => {
      expectResult("back extension", {
        category: "back",
        primary_muscles: ["back"],
      });
    });
  });

  describe("shoulder exercises", () => {
    it("parses 'overhead press'", () => {
      expectResult("overhead press", {
        category: "shoulders",
        primary_muscles: ["shoulders"],
        secondary_muscles: ["triceps"],
      });
    });

    it("parses 'military press'", () => {
      expectResult("military press", {
        category: "shoulders",
        primary_muscles: ["shoulders"],
      });
    });

    it("parses 'lateral raise'", () => {
      expectResult("lateral raise", {
        category: "shoulders",
        primary_muscles: ["shoulders"],
      });
    });

    it("parses 'face pull'", () => {
      expectResult("face pull", {
        category: "shoulders",
        primary_muscles: ["shoulders", "traps"],
      });
    });

    it("parses 'arnold press'", () => {
      expectResult("arnold press", {
        category: "shoulders",
        primary_muscles: ["shoulders"],
      });
    });

    it("parses 'rear delt fly'", () => {
      expectResult("rear delt fly", {
        category: "shoulders",
        primary_muscles: ["shoulders"],
      });
    });

    it("parses 'upright row'", () => {
      expectResult("upright row", {
        category: "shoulders",
        primary_muscles: ["shoulders", "traps"],
      });
    });
  });

  describe("arm exercises", () => {
    it("parses 'bicep curl'", () => {
      expectResult("bicep curl", {
        category: "arms",
        primary_muscles: ["biceps"],
      });
    });

    it("parses 'dumbbell curl'", () => {
      expectResult("dumbbell curl", {
        category: "arms",
        equipment: "dumbbell",
        primary_muscles: ["biceps"],
      });
    });

    it("parses 'tricep pushdown'", () => {
      expectResult("tricep pushdown", {
        category: "arms",
        primary_muscles: ["triceps"],
      });
    });

    it("parses 'skull crusher'", () => {
      expectResult("skull crusher", {
        category: "arms",
        primary_muscles: ["triceps"],
      });
    });

    it("parses 'hammer curl'", () => {
      expectResult("hammer curl", {
        category: "arms",
        primary_muscles: ["biceps"],
      });
    });

    it("parses 'wrist curl'", () => {
      expectResult("wrist curl", {
        category: "arms",
        primary_muscles: ["forearms"],
      });
    });

    it("parses 'tricep kickback'", () => {
      expectResult("tricep kickback", {
        category: "arms",
        primary_muscles: ["triceps"],
      });
    });
  });

  describe("leg exercises", () => {
    it("parses 'squat'", () => {
      expectResult("squat", {
        category: "legs_glutes",
        primary_muscles: ["quads", "glutes"],
        secondary_muscles: ["hamstrings", "core"],
      });
    });

    it("parses 'barbell back squat'", () => {
      expectResult("barbell back squat", {
        category: "legs_glutes",
        equipment: "barbell",
        primary_muscles: ["quads", "glutes"],
      });
    });

    it("parses 'leg press'", () => {
      expectResult("leg press", {
        category: "legs_glutes",
        primary_muscles: ["quads", "glutes"],
      });
    });

    it("parses 'lunge'", () => {
      expectResult("lunge", {
        category: "legs_glutes",
        primary_muscles: ["quads", "glutes"],
      });
    });

    it("parses 'leg extension'", () => {
      expectResult("leg extension", {
        category: "legs_glutes",
        primary_muscles: ["quads"],
      });
    });

    it("parses 'leg curl'", () => {
      expectResult("leg curl", {
        category: "legs_glutes",
        primary_muscles: ["hamstrings"],
      });
    });

    it("parses 'hip thrust'", () => {
      expectResult("hip thrust", {
        category: "legs_glutes",
        primary_muscles: ["glutes"],
      });
    });

    it("parses 'calf raise'", () => {
      expectResult("calf raise", {
        category: "legs_glutes",
        primary_muscles: ["calves"],
      });
    });

    it("parses 'romanian deadlift'", () => {
      expectResult("romanian deadlift", {
        category: "legs_glutes",
        primary_muscles: ["hamstrings", "glutes"],
      });
    });

    it("parses 'rdl'", () => {
      expectResult("rdl", {
        category: "legs_glutes",
        primary_muscles: ["hamstrings", "glutes"],
      });
    });

    it("parses 'good morning'", () => {
      expectResult("good morning", {
        category: "legs_glutes",
        primary_muscles: ["hamstrings", "back"],
      });
    });
  });

  describe("core exercises", () => {
    it("parses 'crunch'", () => {
      expectResult("crunch", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });

    it("parses 'plank'", () => {
      expectResult("plank", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });

    it("parses 'sit-up'", () => {
      expectResult("sit-up", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });

    it("parses 'russian twist'", () => {
      expectResult("russian twist", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });

    it("parses 'leg raise'", () => {
      expectResult("leg raise", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });

    it("parses 'ab rollout'", () => {
      expectResult("ab rollout", {
        category: "abs_core",
        primary_muscles: ["core"],
      });
    });
  });

  // ---- Equipment extraction ----

  describe("equipment extraction", () => {
    it("detects 'barbell'", () => {
      expectResult("barbell squat", { equipment: "barbell" });
    });

    it("detects 'dumbbell'", () => {
      expectResult("dumbbell curl", { equipment: "dumbbell" });
    });

    it("detects 'cable'", () => {
      expectResult("cable row", { equipment: "cable" });
    });

    it("detects 'machine'", () => {
      expectResult("machine leg press", { equipment: "machine" });
    });

    it("detects 'bodyweight' / 'bw'", () => {
      expectResult("bodyweight squat", { equipment: "bodyweight" });
      expectResult("bw dip", { equipment: "bodyweight" });
    });

    it("detects 'kettlebell' / 'kb'", () => {
      expectResult("kettlebell swing", { equipment: "kettlebell" });
      expectResult("kb squat", { equipment: "kettlebell" });
    });

    it("detects 'band'", () => {
      expectResult("band pull apart", { equipment: "band" });
    });

    it("detects 'ez bar'", () => {
      expectResult("ez bar curl", { equipment: "barbell" });
    });

    it("detects abbreviation 'bb'", () => {
      expectResult("bb bench press", { equipment: "barbell" });
    });

    it("detects abbreviation 'db'", () => {
      expectResult("db curl", { equipment: "dumbbell" });
    });

    it("detects 'smith machine'", () => {
      expectResult("smith machine squat", { equipment: "machine" });
    });
  });

  // ---- Difficulty extraction ----

  describe("difficulty extraction", () => {
    it("detects 'beginner' / 'easy' / 'light'", () => {
      expectResult("easy push ups", { difficulty: "beginner" });
      expectResult("light dumbbell curl", { difficulty: "beginner" });
      expectResult("beginner squat", { difficulty: "beginner" });
    });

    it("detects 'intermediate' / 'moderate'", () => {
      expectResult("intermediate deadlift", { difficulty: "intermediate" });
      expectResult("moderate bench press", { difficulty: "intermediate" });
    });

    it("detects 'advanced' / 'heavy'", () => {
      expectResult("heavy barbell squat", { difficulty: "advanced" });
      expectResult("advanced pull-up", { difficulty: "advanced" });
    });

    it("returns null difficulty when not specified", () => {
      expectResult("bench press", { difficulty: null });
    });
  });

  // ---- Modifier handling ----

  describe("modifiers", () => {
    it("adds 'Incline' to name", () => {
      const r = parseExerciseDescription("incline bench press");
      expect(r.name).toContain("Incline");
    });

    it("adds 'Decline' to name", () => {
      const r = parseExerciseDescription("decline bench press");
      expect(r.name).toContain("Decline");
    });

    it("adds 'Seated' to name", () => {
      const r = parseExerciseDescription("seated overhead press");
      expect(r.name).toContain("Seated");
    });

    it("adds 'Standing' to name", () => {
      const r = parseExerciseDescription("standing calf raise");
      expect(r.name).toContain("Standing");
    });

    it("adds 'Single-Arm' to name", () => {
      const r = parseExerciseDescription("single arm dumbbell row");
      expect(r.name).toContain("Single-Arm");
    });

    it("adds 'Close-Grip' to name", () => {
      const r = parseExerciseDescription("close grip bench press");
      expect(r.name).toContain("Close-Grip");
    });

    it("adds 'Wide-Grip' to name", () => {
      const r = parseExerciseDescription("wide grip lat pulldown");
      expect(r.name).toContain("Wide-Grip");
    });

    it("adds 'Sumo' to name", () => {
      const r = parseExerciseDescription("sumo deadlift");
      expect(r.name).toContain("Sumo");
    });

    it("adds 'Weighted' to name", () => {
      const r = parseExerciseDescription("weighted pull-up");
      expect(r.name).toContain("Weighted");
    });

    it("combines multiple modifiers", () => {
      const r = parseExerciseDescription("seated incline dumbbell curl");
      expect(r.name).toContain("Seated");
      expect(r.name).toContain("Incline");
      expect(r.name).toContain("Dumbbell");
    });
  });

  // ---- Name construction ----

  describe("name construction", () => {
    it("constructs clean name with equipment + archetype", () => {
      const r = parseExerciseDescription("dumbbell bench press");
      expect(r.name).toBe("Dumbbell Bench Press");
    });

    it("strips noise words from unknown exercises", () => {
      const r = parseExerciseDescription("exercise for the chest using my bodyweight");
      expect(r.name).not.toContain("for");
      expect(r.name).not.toContain("the");
      expect(r.name).not.toContain("using");
      expect(r.name).not.toContain("my");
    });

    it("does not include bodyweight in name", () => {
      const r = parseExerciseDescription("bodyweight squat");
      expect(r.name).not.toContain("Bodyweight");
    });
  });

  // ---- Muscle fallback ----

  describe("muscle keyword fallback", () => {
    it("picks up muscle names when no archetype matches", () => {
      const r = parseExerciseDescription("glute activation drill");
      expect(r.primary_muscles).toContain("glutes");
    });

    it("infers category from muscle group", () => {
      const r = parseExerciseDescription("hamstring stretch");
      expect(r.category).toBe("legs_glutes");
    });

    it("detects multiple muscle groups", () => {
      const r = parseExerciseDescription("chest and triceps combo");
      expect(r.primary_muscles).toContain("chest");
      expect(r.primary_muscles).toContain("triceps");
    });
  });

  // ---- Complex / realistic inputs ----

  describe("realistic user inputs", () => {
    it("parses 'heavy incline dumbbell bench press for upper chest'", () => {
      const r = expectResult("heavy incline dumbbell bench press for upper chest", {
        category: "chest",
        equipment: "dumbbell",
        difficulty: "advanced",
        primary_muscles: ["chest"],
      });
      expect(r.name).toContain("Incline");
      expect(r.name).toContain("Dumbbell");
      expect(r.name).toContain("Bench Press");
    });

    it("parses 'seated cable lat pulldown'", () => {
      expectResult("seated cable lat pulldown", {
        category: "back",
        equipment: "cable",
        primary_muscles: ["lats"],
      });
    });

    it("parses 'kettlebell goblet squat'", () => {
      expectResult("kettlebell goblet squat", {
        category: "legs_glutes",
        equipment: "kettlebell",
        primary_muscles: ["quads", "glutes"],
      });
    });

    it("parses 'bb bench press' (abbreviation)", () => {
      expectResult("bb bench press", {
        equipment: "barbell",
        category: "chest",
      });
    });

    it("parses 'db curl' (abbreviation)", () => {
      expectResult("db curl", {
        equipment: "dumbbell",
        category: "arms",
        primary_muscles: ["biceps"],
      });
    });

    it("handles empty input gracefully", () => {
      const r = parseExerciseDescription("");
      expect(r.name).toBe("");
      expect(r.category).toBeNull();
      expect(r.equipment).toBeNull();
      expect(r.primary_muscles).toEqual([]);
    });

    it("handles gibberish input gracefully", () => {
      const r = parseExerciseDescription("xyzzy foobar baz");
      expect(r.category).toBeNull();
      expect(r.equipment).toBeNull();
      expect(r.primary_muscles).toEqual([]);
      expect(r.name).toBeTruthy();
    });
  });

  // ---- Confidence tracking ----

  describe("confidence tracking", () => {
    it("marks equipment as high confidence when keyword found", () => {
      const r = parseExerciseDescription("barbell bench press");
      expect(r.confidence.equipment).toBe("high");
    });

    it("marks category as high confidence from archetype", () => {
      const r = parseExerciseDescription("bench press");
      expect(r.confidence.category).toBe("high");
    });

    it("marks category as medium confidence from muscle fallback", () => {
      const r = parseExerciseDescription("glute activation drill");
      expect(r.confidence.category).toBe("medium");
    });

    it("does not include equipment confidence when not detected", () => {
      const r = parseExerciseDescription("bench press");
      expect(r.confidence.equipment).toBeUndefined();
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles mixed case input", () => {
      expectResult("BARBELL BENCH PRESS", {
        category: "chest",
        equipment: "barbell",
      });
    });

    it("handles extra whitespace", () => {
      expectResult("  dumbbell   bench   press  ", {
        category: "chest",
        equipment: "dumbbell",
      });
    });

    it("handles hyphens and underscores", () => {
      expectResult("pull_up", {
        category: "back",
        primary_muscles: ["lats", "back"],
      });
    });

    it("does not duplicate cable modifier when equipment is cable", () => {
      const r = parseExerciseDescription("cable row");
      const cableCount = (r.name.match(/cable/gi) || []).length;
      expect(cableCount).toBeLessThanOrEqual(1);
    });

    it("secondary muscles exclude any primary muscles", () => {
      const r = parseExerciseDescription("bench press");
      for (const m of r.primary_muscles) {
        expect(r.secondary_muscles).not.toContain(m);
      }
    });
  });
});
