import {
  matchExercise,
  matchAllExercises,
  groupByConfidence,
  normalizeName,
} from "../../../lib/import/exercise-matcher";
import type { ExerciseMatch } from "../../../lib/import/exercise-matcher";
import type { Exercise } from "../../../lib/types";

// Helper to create a mock exercise
function mockExercise(
  name: string,
  id?: string,
  overrides?: Partial<Exercise>
): Exercise {
  return {
    id: id ?? `ex-${name.toLowerCase().replace(/\s/g, "-")}`,
    name,
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: [],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    ...overrides,
  };
}

const LIBRARY: Exercise[] = [
  mockExercise("Barbell Bench Press"),
  mockExercise("Dumbbell Bench Press"),
  mockExercise("Incline Bench Press"),
  mockExercise("Decline Bench Press"),
  mockExercise("Back Squat"),
  mockExercise("Front Squat"),
  mockExercise("Overhead Press"),
  mockExercise("Conventional Deadlift"),
  mockExercise("Pull-up"),
  mockExercise("Chin-up"),
  mockExercise("Lat Pull-down"),
  mockExercise("Barbell Row"),
  mockExercise("Dumbbell Row"),
  mockExercise("Barbell Curl"),
  mockExercise("Dumbbell Curl"),
  mockExercise("Romanian Deadlift"),
  mockExercise("Leg Extensions"),
  mockExercise("Face Pulls"),
  mockExercise("Cable Flyes"),
  mockExercise("Arnold Dumbbell Press"),
  mockExercise("EZ-Bar Curl"),
  mockExercise("T-Bar Row"),
];

// ---- normalizeName ----

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Bench Press  ")).toBe("bench press");
  });

  it("strips parentheticals", () => {
    expect(normalizeName("Bench Press (Barbell)")).toBe("bench press");
  });

  it("normalizes dashes and underscores to spaces", () => {
    expect(normalizeName("T-Bar_Row")).toBe("t bar row");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeName("Bench   Press")).toBe("bench press");
  });
});

// ---- Pass 1: Exact Match ----

describe("matchExercise — exact match", () => {
  it("finds exact case-insensitive match", () => {
    const result = matchExercise("Barbell Bench Press", LIBRARY);
    expect(result.confidence).toBe("exact");
    expect(result.matchedExercise?.name).toBe("Barbell Bench Press");
    expect(result.matchReason).toBe("Exact match");
  });

  it("matches regardless of case", () => {
    const result = matchExercise("BARBELL BENCH PRESS", LIBRARY);
    expect(result.confidence).toBe("exact");
  });

  it("matches with extra whitespace trimmed", () => {
    const result = matchExercise("  Back Squat  ", LIBRARY);
    expect(result.confidence).toBe("exact");
    expect(result.matchedExercise?.name).toBe("Back Squat");
  });
});

// ---- Pass 2: Normalize + Strip Parentheticals ----

describe("matchExercise — normalize match", () => {
  it("matches 'Bench Press (Barbell)' to 'Barbell Bench Press'", () => {
    const result = matchExercise("Bench Press (Barbell)", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Barbell Bench Press");
    expect(result.matchReason).toBe("Normalized match");
  });

  it("matches 'Bench Press (Dumbbell)' to 'Dumbbell Bench Press'", () => {
    const result = matchExercise("Bench Press (Dumbbell)", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Dumbbell Bench Press");
  });

  it("matches 'Row (Barbell)' to 'Barbell Row'", () => {
    const result = matchExercise("Row (Barbell)", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Barbell Row");
  });
});

// ---- Pass 3: Substring Match ----

describe("matchExercise — substring match", () => {
  it("matches when Strong name contains FitForge name", () => {
    const result = matchExercise(
      "Seated Overhead Press",
      LIBRARY
    );
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Overhead Press");
    expect(result.matchReason).toBe("Substring match");
  });
});

// ---- Pass 4: Alias Match ----

describe("matchExercise — alias match", () => {
  it("matches 'Squat' to 'Back Squat' via substring (contained in name)", () => {
    const result = matchExercise("Squat", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Back Squat");
    // Substring match fires before alias since "Squat" is contained in "Back Squat"
    expect(result.matchReason).toBe("Substring match");
  });

  it("matches 'OHP' to 'Overhead Press' via alias", () => {
    const result = matchExercise("OHP", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Overhead Press");
  });

  it("matches 'Deadlift' to a deadlift variant via substring", () => {
    const result = matchExercise("Deadlift", LIBRARY);
    expect(result.confidence).toBe("possible");
    // Substring match finds a deadlift variant (shortest name match first)
    expect(result.matchedExercise?.name).toMatch(/Deadlift/);
  });

  it("matches 'Pull Up' to 'Pull-up' via alias", () => {
    const result = matchExercise("Pull Up", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Pull-up");
  });

  it("matches 'RDL' to 'Romanian Deadlift' via alias", () => {
    const result = matchExercise("RDL", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Romanian Deadlift");
  });

  it("matches 'Military Press' to 'Overhead Press' via alias", () => {
    const result = matchExercise("Military Press", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("Overhead Press");
  });

  it("matches 'EZ Bar Curl' to 'EZ-Bar Curl' via alias", () => {
    const result = matchExercise("EZ Bar Curl", LIBRARY);
    expect(result.confidence).toBe("possible");
    expect(result.matchedExercise?.name).toBe("EZ-Bar Curl");
  });
});

// ---- No Match ----

describe("matchExercise — no match", () => {
  it("returns 'none' for completely unknown exercise", () => {
    const result = matchExercise("Underwater Basket Weaving", LIBRARY);
    expect(result.confidence).toBe("none");
    expect(result.matchedExercise).toBeNull();
    expect(result.matchReason).toContain("No match");
  });
});

// ---- matchAllExercises ----

describe("matchAllExercises", () => {
  it("matches multiple exercise names", () => {
    const names = [
      "Barbell Bench Press",
      "Squat",
      "Mystery Exercise",
    ];
    const results = matchAllExercises(names, LIBRARY);
    expect(results).toHaveLength(3);
    expect(results[0].confidence).toBe("exact");
    expect(results[1].confidence).toBe("possible");
    expect(results[2].confidence).toBe("none");
  });
});

// ---- groupByConfidence ----

describe("groupByConfidence", () => {
  it("groups matches by confidence level", () => {
    const matches: ExerciseMatch[] = [
      { strongName: "A", confidence: "exact", matchedExercise: mockExercise("A"), matchReason: "Exact match" },
      { strongName: "B", confidence: "possible", matchedExercise: mockExercise("B"), matchReason: "Alias" },
      { strongName: "C", confidence: "none", matchedExercise: null, matchReason: "No match" },
      { strongName: "D", confidence: "exact", matchedExercise: mockExercise("D"), matchReason: "Exact match" },
    ];

    const grouped = groupByConfidence(matches);
    expect(grouped.exact).toHaveLength(2);
    expect(grouped.possible).toHaveLength(1);
    expect(grouped.none).toHaveLength(1);
  });

  it("handles empty array", () => {
    const grouped = groupByConfidence([]);
    expect(grouped.exact).toHaveLength(0);
    expect(grouped.possible).toHaveLength(0);
    expect(grouped.none).toHaveLength(0);
  });
});
