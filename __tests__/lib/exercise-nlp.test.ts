import { parseExerciseDescription, type NlpResult } from "../../lib/exercise-nlp";

// ---- Helpers ----

function assertResult(input: string, expected: Partial<NlpResult>, label: string) {
  const result = parseExerciseDescription(input);
  try {
    if (expected.name !== undefined) expect(result.name).toBe(expected.name);
    if (expected.category !== undefined) expect(result.category).toBe(expected.category);
    if (expected.equipment !== undefined) expect(result.equipment).toBe(expected.equipment);
    if (expected.difficulty !== undefined) expect(result.difficulty).toBe(expected.difficulty);
    if (expected.primary_muscles !== undefined)
      expect(result.primary_muscles).toEqual(expect.arrayContaining(expected.primary_muscles));
    if (expected.secondary_muscles !== undefined)
      expect(result.secondary_muscles).toEqual(expect.arrayContaining(expected.secondary_muscles));
  } catch (err) {
    throw new Error(
      `[${label}] parseExerciseDescription(${JSON.stringify(input)}) failed: ${(err as Error).message}`
    );
  }
  return result;
}

type ArchetypeCase = [input: string, expected: Partial<NlpResult>];

describe("parseExerciseDescription", () => {
  it("parses chest archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["bench press", { category: "chest", primary_muscles: ["chest"], secondary_muscles: ["triceps", "shoulders"] }],
      ["dumbbell bench press", { name: "Dumbbell Bench Press", category: "chest", equipment: "dumbbell", primary_muscles: ["chest"] }],
      ["decline bench", { category: "chest", primary_muscles: ["chest"] }],
      ["push ups", { category: "chest", primary_muscles: ["chest"], secondary_muscles: ["triceps", "shoulders"] }],
      ["cable crossover", { category: "chest", equipment: "cable", primary_muscles: ["chest"] }],
      ["dip", { category: "chest", primary_muscles: ["chest", "triceps"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `chest: ${input}`);

    // Incline barbell bench press — needs name-component assertions
    const r = assertResult("incline barbell bench press", {
      category: "chest",
      equipment: "barbell",
      primary_muscles: ["chest"],
    }, "chest: incline barbell bench press");
    expect(r.name).toContain("Incline");
    expect(r.name).toContain("Barbell");
    expect(r.name).toContain("Bench Press");
  });

  it("parses back archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["lat pulldown", { category: "back", primary_muscles: ["lats"], secondary_muscles: ["biceps"] }],
      ["pull-up", { category: "back", primary_muscles: ["lats", "back"] }],
      ["chin-up", { category: "back", primary_muscles: ["lats", "biceps"] }],
      ["barbell row", { category: "back", equipment: "barbell", primary_muscles: ["back", "lats"] }],
      ["deadlift", { category: "back", primary_muscles: ["back", "hamstrings", "glutes"] }],
      ["shrug", { category: "back", primary_muscles: ["traps"] }],
      ["t-bar row", { category: "back", primary_muscles: ["back", "lats"] }],
      ["back extension", { category: "back", primary_muscles: ["back"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `back: ${input}`);
  });

  it("parses shoulder archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["overhead press", { category: "shoulders", primary_muscles: ["shoulders"], secondary_muscles: ["triceps"] }],
      ["military press", { category: "shoulders", primary_muscles: ["shoulders"] }],
      ["lateral raise", { category: "shoulders", primary_muscles: ["shoulders"] }],
      ["face pull", { category: "shoulders", primary_muscles: ["shoulders", "traps"] }],
      ["arnold press", { category: "shoulders", primary_muscles: ["shoulders"] }],
      ["rear delt fly", { category: "shoulders", primary_muscles: ["shoulders"] }],
      ["upright row", { category: "shoulders", primary_muscles: ["shoulders", "traps"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `shoulders: ${input}`);
  });

  it("parses arm archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["bicep curl", { category: "arms", primary_muscles: ["biceps"] }],
      ["dumbbell curl", { category: "arms", equipment: "dumbbell", primary_muscles: ["biceps"] }],
      ["tricep pushdown", { category: "arms", primary_muscles: ["triceps"] }],
      ["skull crusher", { category: "arms", primary_muscles: ["triceps"] }],
      ["hammer curl", { category: "arms", primary_muscles: ["biceps"] }],
      ["wrist curl", { category: "arms", primary_muscles: ["forearms"] }],
      ["tricep kickback", { category: "arms", primary_muscles: ["triceps"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `arms: ${input}`);
  });

  it("parses leg archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["squat", { category: "legs_glutes", primary_muscles: ["quads", "glutes"], secondary_muscles: ["hamstrings", "core"] }],
      ["barbell back squat", { category: "legs_glutes", equipment: "barbell", primary_muscles: ["quads", "glutes"] }],
      ["leg press", { category: "legs_glutes", primary_muscles: ["quads", "glutes"] }],
      ["lunge", { category: "legs_glutes", primary_muscles: ["quads", "glutes"] }],
      ["leg extension", { category: "legs_glutes", primary_muscles: ["quads"] }],
      ["leg curl", { category: "legs_glutes", primary_muscles: ["hamstrings"] }],
      ["hip thrust", { category: "legs_glutes", primary_muscles: ["glutes"] }],
      ["calf raise", { category: "legs_glutes", primary_muscles: ["calves"] }],
      ["romanian deadlift", { category: "legs_glutes", primary_muscles: ["hamstrings", "glutes"] }],
      ["rdl", { category: "legs_glutes", primary_muscles: ["hamstrings", "glutes"] }],
      ["good morning", { category: "legs_glutes", primary_muscles: ["hamstrings", "back"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `legs: ${input}`);
  });

  it("parses core archetypes", () => {
    const cases: ArchetypeCase[] = [
      ["crunch", { category: "abs_core", primary_muscles: ["core"] }],
      ["plank", { category: "abs_core", primary_muscles: ["core"] }],
      ["sit-up", { category: "abs_core", primary_muscles: ["core"] }],
      ["russian twist", { category: "abs_core", primary_muscles: ["core"] }],
      ["leg raise", { category: "abs_core", primary_muscles: ["core"] }],
      ["ab rollout", { category: "abs_core", primary_muscles: ["core"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `core: ${input}`);
  });

  it("extracts equipment from keywords and abbreviations", () => {
    const cases: ArchetypeCase[] = [
      ["barbell squat", { equipment: "barbell" }],
      ["dumbbell curl", { equipment: "dumbbell" }],
      ["cable row", { equipment: "cable" }],
      ["machine leg press", { equipment: "machine" }],
      ["bodyweight squat", { equipment: "bodyweight" }],
      ["bw dip", { equipment: "bodyweight" }],
      ["kettlebell swing", { equipment: "kettlebell" }],
      ["kb squat", { equipment: "kettlebell" }],
      ["band pull apart", { equipment: "band" }],
      ["ez bar curl", { equipment: "barbell" }],
      ["bb bench press", { equipment: "barbell" }],
      ["db curl", { equipment: "dumbbell" }],
      ["smith machine squat", { equipment: "machine" }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `equipment: ${input}`);
  });

  it("extracts difficulty from keywords", () => {
    const cases: ArchetypeCase[] = [
      ["easy push ups", { difficulty: "beginner" }],
      ["light dumbbell curl", { difficulty: "beginner" }],
      ["beginner squat", { difficulty: "beginner" }],
      ["intermediate deadlift", { difficulty: "intermediate" }],
      ["moderate bench press", { difficulty: "intermediate" }],
      ["heavy barbell squat", { difficulty: "advanced" }],
      ["advanced pull-up", { difficulty: "advanced" }],
      ["bench press", { difficulty: null }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `difficulty: ${input}`);
  });

  it("adds recognized modifiers into the constructed name", () => {
    const cases: [string, string[]][] = [
      ["incline bench press", ["Incline"]],
      ["decline bench press", ["Decline"]],
      ["seated overhead press", ["Seated"]],
      ["standing calf raise", ["Standing"]],
      ["single arm dumbbell row", ["Single-Arm"]],
      ["close grip bench press", ["Close-Grip"]],
      ["wide grip lat pulldown", ["Wide-Grip"]],
      ["sumo deadlift", ["Sumo"]],
      ["weighted pull-up", ["Weighted"]],
      ["seated incline dumbbell curl", ["Seated", "Incline", "Dumbbell"]],
    ];
    for (const [input, tokens] of cases) {
      const r = parseExerciseDescription(input);
      for (const token of tokens) {
        if (!r.name.includes(token)) {
          throw new Error(`modifier "${token}" missing from name "${r.name}" for input "${input}"`);
        }
      }
    }
  });

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

  it("parses realistic user inputs", () => {
    const r = assertResult(
      "heavy incline dumbbell bench press for upper chest",
      { category: "chest", equipment: "dumbbell", difficulty: "advanced", primary_muscles: ["chest"] },
      "realistic: heavy incline dumbbell bench press"
    );
    expect(r.name).toContain("Incline");
    expect(r.name).toContain("Dumbbell");
    expect(r.name).toContain("Bench Press");

    const cases: ArchetypeCase[] = [
      ["seated cable lat pulldown", { category: "back", equipment: "cable", primary_muscles: ["lats"] }],
      ["kettlebell goblet squat", { category: "legs_glutes", equipment: "kettlebell", primary_muscles: ["quads", "glutes"] }],
      ["bb bench press", { equipment: "barbell", category: "chest" }],
      ["db curl", { equipment: "dumbbell", category: "arms", primary_muscles: ["biceps"] }],
    ];
    for (const [input, expected] of cases) assertResult(input, expected, `realistic: ${input}`);

    const empty = parseExerciseDescription("");
    expect(empty.name).toBe("");
    expect(empty.category).toBeNull();
    expect(empty.equipment).toBeNull();
    expect(empty.primary_muscles).toEqual([]);

    const gibberish = parseExerciseDescription("xyzzy foobar baz");
    expect(gibberish.category).toBeNull();
    expect(gibberish.equipment).toBeNull();
    expect(gibberish.primary_muscles).toEqual([]);
    expect(gibberish.name).toBeTruthy();
  });

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

  describe("edge cases", () => {
    it("handles mixed case input", () => {
      assertResult("BARBELL BENCH PRESS", { category: "chest", equipment: "barbell" }, "edge: mixed case");
    });

    it("handles extra whitespace", () => {
      assertResult("  dumbbell   bench   press  ", { category: "chest", equipment: "dumbbell" }, "edge: whitespace");
    });

    it("handles hyphens and underscores", () => {
      assertResult("pull_up", { category: "back", primary_muscles: ["lats", "back"] }, "edge: underscore");
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
