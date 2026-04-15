import type {
  Category,
  Difficulty,
  Equipment,
  MuscleGroup,
} from "./types";

// ---- Result type ----

export type NlpFieldConfidence = "high" | "medium" | "low";

export type NlpResult = {
  name: string;
  category: Category | null;
  equipment: Equipment | null;
  difficulty: Difficulty | null;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  instructions: string;
  confidence: Record<string, NlpFieldConfidence>;
};

// ---- Equipment keywords ----

const EQUIPMENT_KEYWORDS: [string[], Equipment][] = [
  [["barbell", "bb", "bar"], "barbell"],
  [["dumbbell", "dumbell", "db", "dumbbells", "dumbells"], "dumbbell"],
  [["cable", "cables"], "cable"],
  [["machine", "smith", "smith machine", "leg press machine"], "machine"],
  [
    ["bodyweight", "bw", "calisthenics", "body weight", "no equipment"],
    "bodyweight",
  ],
  [["kettlebell", "kb", "kettle bell"], "kettlebell"],
  [["band", "resistance band", "bands", "resistance bands"], "band"],
  [["ez bar", "ez-bar", "ezbar"], "barbell"],
  [["trap bar", "hex bar"], "barbell"],
];

// ---- Difficulty keywords ----

const DIFFICULTY_KEYWORDS: [string[], Difficulty][] = [
  [["beginner", "easy", "light", "simple", "basic"], "beginner"],
  [["intermediate", "moderate", "medium"], "intermediate"],
  [["advanced", "hard", "heavy", "difficult", "expert"], "advanced"],
];

// ---- Noise words stripped from name ----

const NOISE_WORDS = new Set([
  "for",
  "the",
  "with",
  "a",
  "an",
  "my",
  "on",
  "and",
  "to",
  "upper",
  "lower",
  "using",
  "do",
  "exercise",
  "workout",
  "targeting",
  "target",
  "focus",
  "focusing",
]);

// ---- Exercise archetypes ----
// Matched by phrase containment (longest first). Each archetype defines
// the canonical category, primary/secondary muscles, and name tokens to keep.

type Archetype = {
  phrases: string[];
  category: Category;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  nameTokens: string;
};

const ARCHETYPES: Archetype[] = [
  // Chest
  {
    phrases: ["bench press", "bench"],
    category: "chest",
    primary: ["chest"],
    secondary: ["triceps", "shoulders"],
    nameTokens: "Bench Press",
  },
  {
    phrases: ["chest fly", "chest flye", "pec fly", "pec flye", "pec deck"],
    category: "chest",
    primary: ["chest"],
    secondary: ["shoulders"],
    nameTokens: "Chest Fly",
  },
  {
    phrases: ["push up", "push-up", "pushup", "push ups", "pushups"],
    category: "chest",
    primary: ["chest"],
    secondary: ["triceps", "shoulders"],
    nameTokens: "Push-Up",
  },
  {
    phrases: ["dip", "dips", "chest dip"],
    category: "chest",
    primary: ["chest", "triceps"],
    secondary: ["shoulders"],
    nameTokens: "Dip",
  },
  {
    phrases: ["cable crossover", "cable cross"],
    category: "chest",
    primary: ["chest"],
    secondary: ["shoulders"],
    nameTokens: "Cable Crossover",
  },

  // Back
  {
    phrases: ["lat pulldown", "lat pull-down", "lat pull down"],
    category: "back",
    primary: ["lats"],
    secondary: ["biceps"],
    nameTokens: "Lat Pulldown",
  },
  {
    phrases: ["pull-up", "pull up", "pullup", "pull-ups", "pullups"],
    category: "back",
    primary: ["lats", "back"],
    secondary: ["biceps"],
    nameTokens: "Pull-Up",
  },
  {
    phrases: ["chin-up", "chin up", "chinup", "chin-ups", "chinups"],
    category: "back",
    primary: ["lats", "biceps"],
    secondary: ["back"],
    nameTokens: "Chin-Up",
  },
  {
    phrases: ["t-bar row", "t bar row"],
    category: "back",
    primary: ["back", "lats"],
    secondary: ["biceps", "traps"],
    nameTokens: "T-Bar Row",
  },
  {
    phrases: ["bent over row", "bent-over row", "barbell row", "pendlay row"],
    category: "back",
    primary: ["back", "lats"],
    secondary: ["biceps", "traps"],
    nameTokens: "Row",
  },
  {
    phrases: ["row", "rows", "seated row", "cable row"],
    category: "back",
    primary: ["back", "lats"],
    secondary: ["biceps"],
    nameTokens: "Row",
  },
  {
    phrases: ["deadlift", "dead lift"],
    category: "back",
    primary: ["back", "hamstrings", "glutes"],
    secondary: ["core", "forearms"],
    nameTokens: "Deadlift",
  },
  {
    phrases: ["rdl", "romanian deadlift", "romanian dead lift"],
    category: "legs_glutes",
    primary: ["hamstrings", "glutes"],
    secondary: ["back", "core"],
    nameTokens: "Romanian Deadlift",
  },
  {
    phrases: ["shrug", "shrugs"],
    category: "back",
    primary: ["traps"],
    secondary: ["shoulders"],
    nameTokens: "Shrug",
  },
  {
    phrases: ["face pull", "face pulls"],
    category: "shoulders",
    primary: ["shoulders", "traps"],
    secondary: ["back"],
    nameTokens: "Face Pull",
  },
  {
    phrases: ["back extension", "hyperextension", "hyper extension"],
    category: "back",
    primary: ["back"],
    secondary: ["glutes", "hamstrings"],
    nameTokens: "Back Extension",
  },

  // Shoulders
  {
    phrases: [
      "overhead press",
      "ohp",
      "shoulder press",
      "military press",
      "strict press",
    ],
    category: "shoulders",
    primary: ["shoulders"],
    secondary: ["triceps"],
    nameTokens: "Overhead Press",
  },
  {
    phrases: ["arnold press"],
    category: "shoulders",
    primary: ["shoulders"],
    secondary: ["triceps"],
    nameTokens: "Arnold Press",
  },
  {
    phrases: [
      "lateral raise",
      "side raise",
      "lat raise",
      "side lateral raise",
    ],
    category: "shoulders",
    primary: ["shoulders"],
    secondary: [],
    nameTokens: "Lateral Raise",
  },
  {
    phrases: [
      "front raise",
      "front delt raise",
    ],
    category: "shoulders",
    primary: ["shoulders"],
    secondary: [],
    nameTokens: "Front Raise",
  },
  {
    phrases: ["rear delt fly", "rear delt flye", "reverse fly", "reverse flye"],
    category: "shoulders",
    primary: ["shoulders"],
    secondary: ["back"],
    nameTokens: "Rear Delt Fly",
  },
  {
    phrases: ["upright row", "upright rows"],
    category: "shoulders",
    primary: ["shoulders", "traps"],
    secondary: ["biceps"],
    nameTokens: "Upright Row",
  },

  // Arms
  {
    phrases: [
      "bicep curl",
      "biceps curl",
      "arm curl",
      "curl",
      "curls",
      "hammer curl",
      "preacher curl",
      "concentration curl",
    ],
    category: "arms",
    primary: ["biceps"],
    secondary: ["forearms"],
    nameTokens: "Curl",
  },
  {
    phrases: [
      "tricep extension",
      "triceps extension",
      "overhead extension",
      "skull crusher",
      "skullcrusher",
      "skull crushers",
    ],
    category: "arms",
    primary: ["triceps"],
    secondary: [],
    nameTokens: "Tricep Extension",
  },
  {
    phrases: [
      "tricep pushdown",
      "triceps pushdown",
      "pushdown",
      "push down",
      "cable pushdown",
    ],
    category: "arms",
    primary: ["triceps"],
    secondary: [],
    nameTokens: "Tricep Pushdown",
  },
  {
    phrases: ["tricep kickback", "kickback", "kick back"],
    category: "arms",
    primary: ["triceps"],
    secondary: [],
    nameTokens: "Tricep Kickback",
  },
  {
    phrases: ["wrist curl", "wrist curls", "forearm curl"],
    category: "arms",
    primary: ["forearms"],
    secondary: [],
    nameTokens: "Wrist Curl",
  },

  // Legs & Glutes
  {
    phrases: [
      "squat",
      "squats",
      "back squat",
      "front squat",
      "goblet squat",
    ],
    category: "legs_glutes",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core"],
    nameTokens: "Squat",
  },
  {
    phrases: ["leg press"],
    category: "legs_glutes",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    nameTokens: "Leg Press",
  },
  {
    phrases: ["lunge", "lunges", "walking lunge", "split squat", "bulgarian split squat"],
    category: "legs_glutes",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    nameTokens: "Lunge",
  },
  {
    phrases: ["leg extension", "leg extensions", "quad extension"],
    category: "legs_glutes",
    primary: ["quads"],
    secondary: [],
    nameTokens: "Leg Extension",
  },
  {
    phrases: ["leg curl", "leg curls", "lying leg curl", "hamstring curl", "seated leg curl"],
    category: "legs_glutes",
    primary: ["hamstrings"],
    secondary: [],
    nameTokens: "Leg Curl",
  },
  {
    phrases: ["hip thrust", "hip thrusts", "glute bridge", "bridge"],
    category: "legs_glutes",
    primary: ["glutes"],
    secondary: ["hamstrings"],
    nameTokens: "Hip Thrust",
  },
  {
    phrases: ["calf raise", "calf raises", "standing calf raise", "seated calf raise"],
    category: "legs_glutes",
    primary: ["calves"],
    secondary: [],
    nameTokens: "Calf Raise",
  },
  {
    phrases: ["step up", "step-up", "step ups"],
    category: "legs_glutes",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    nameTokens: "Step-Up",
  },
  {
    phrases: ["good morning", "good mornings"],
    category: "legs_glutes",
    primary: ["hamstrings", "back"],
    secondary: ["glutes", "core"],
    nameTokens: "Good Morning",
  },

  // Abs & Core
  {
    phrases: ["crunch", "crunches"],
    category: "abs_core",
    primary: ["core"],
    secondary: [],
    nameTokens: "Crunch",
  },
  {
    phrases: ["sit-up", "sit up", "situp", "sit-ups", "situps"],
    category: "abs_core",
    primary: ["core"],
    secondary: [],
    nameTokens: "Sit-Up",
  },
  {
    phrases: ["plank", "planks"],
    category: "abs_core",
    primary: ["core"],
    secondary: ["shoulders"],
    nameTokens: "Plank",
  },
  {
    phrases: ["leg raise", "leg raises", "hanging leg raise"],
    category: "abs_core",
    primary: ["core"],
    secondary: [],
    nameTokens: "Leg Raise",
  },
  {
    phrases: ["russian twist", "russian twists"],
    category: "abs_core",
    primary: ["core"],
    secondary: [],
    nameTokens: "Russian Twist",
  },
  {
    phrases: ["ab wheel", "ab rollout", "rollout"],
    category: "abs_core",
    primary: ["core"],
    secondary: ["shoulders"],
    nameTokens: "Ab Rollout",
  },
  {
    phrases: ["mountain climber", "mountain climbers"],
    category: "abs_core",
    primary: ["core"],
    secondary: ["shoulders", "quads"],
    nameTokens: "Mountain Climber",
  },

  // Full body
  {
    phrases: ["burpee", "burpees"],
    category: "abs_core",
    primary: ["full_body"],
    secondary: [],
    nameTokens: "Burpee",
  },
  {
    phrases: ["clean and jerk", "clean & jerk"],
    category: "shoulders",
    primary: ["full_body"],
    secondary: [],
    nameTokens: "Clean and Jerk",
  },
  {
    phrases: ["snatch"],
    category: "shoulders",
    primary: ["full_body"],
    secondary: [],
    nameTokens: "Snatch",
  },
  {
    phrases: ["clean", "power clean", "hang clean"],
    category: "legs_glutes",
    primary: ["full_body"],
    secondary: [],
    nameTokens: "Clean",
  },
  {
    phrases: ["thruster", "thrusters"],
    category: "legs_glutes",
    primary: ["quads", "shoulders"],
    secondary: ["glutes", "triceps"],
    nameTokens: "Thruster",
  },
  {
    phrases: ["farmer walk", "farmer carry", "farmers walk", "farmer's walk"],
    category: "back",
    primary: ["forearms", "traps"],
    secondary: ["core"],
    nameTokens: "Farmer Walk",
  },
];

// ---- Muscle keyword fallback ----
// Used when no archetype matched but the user mentioned specific muscles.

const MUSCLE_KEYWORDS: [string[], MuscleGroup][] = [
  [["chest", "pec", "pecs", "pectoral"], "chest"],
  [["back", "upper back", "mid back"], "back"],
  [["shoulder", "shoulders", "delt", "delts", "deltoid"], "shoulders"],
  [["bicep", "biceps"], "biceps"],
  [["tricep", "triceps"], "triceps"],
  [["quad", "quads", "quadricep", "quadriceps", "thigh"], "quads"],
  [["hamstring", "hamstrings", "hams"], "hamstrings"],
  [["glute", "glutes", "gluteal", "butt"], "glutes"],
  [["calf", "calves"], "calves"],
  [["core", "abs", "abdominal", "abdominals"], "core"],
  [["forearm", "forearms", "grip"], "forearms"],
  [["trap", "traps", "trapezius"], "traps"],
  [["lat", "lats", "latissimus"], "lats"],
  [["full body", "full_body", "total body", "whole body"], "full_body"],
];

const MUSCLE_TO_CATEGORY: Partial<Record<MuscleGroup, Category>> = {
  chest: "chest",
  back: "back",
  lats: "back",
  traps: "back",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  quads: "legs_glutes",
  hamstrings: "legs_glutes",
  glutes: "legs_glutes",
  calves: "legs_glutes",
  core: "abs_core",
  full_body: "abs_core",
};

// ---- Modifier keywords ----

type Modifier = {
  phrases: string[];
  namePrefix: string;
};

const MODIFIERS: Modifier[] = [
  { phrases: ["incline"], namePrefix: "Incline" },
  { phrases: ["decline"], namePrefix: "Decline" },
  { phrases: ["seated", "sitting"], namePrefix: "Seated" },
  { phrases: ["standing"], namePrefix: "Standing" },
  { phrases: ["single arm", "single-arm", "one arm", "one-arm"], namePrefix: "Single-Arm" },
  { phrases: ["single leg", "single-leg", "one leg", "one-leg"], namePrefix: "Single-Leg" },
  { phrases: ["close grip", "close-grip", "narrow grip"], namePrefix: "Close-Grip" },
  { phrases: ["wide grip", "wide-grip"], namePrefix: "Wide-Grip" },
  { phrases: ["behind the neck", "behind neck"], namePrefix: "Behind-the-Neck" },
  { phrases: ["reverse grip", "reverse-grip", "supinated"], namePrefix: "Reverse-Grip" },
  { phrases: ["sumo"], namePrefix: "Sumo" },
  { phrases: ["front"], namePrefix: "Front" },
  { phrases: ["goblet"], namePrefix: "Goblet" },
  { phrases: ["preacher"], namePrefix: "Preacher" },
  { phrases: ["hammer"], namePrefix: "Hammer" },
  { phrases: ["cable"], namePrefix: "Cable" },
  { phrases: ["lying", "lying down"], namePrefix: "Lying" },
  { phrases: ["overhead"], namePrefix: "Overhead" },
  { phrases: ["hanging"], namePrefix: "Hanging" },
  { phrases: ["weighted"], namePrefix: "Weighted" },
];

// ---- Helpers ----

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function findPhraseMatch<T>(
  input: string,
  table: [string[], T][],
): { value: T; phrase: string } | null {
  const sorted = table
    .flatMap(([phrases, value]) => phrases.map((p) => ({ phrase: p, value })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const entry of sorted) {
    const pattern = new RegExp(`\\b${entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(input)) {
      return entry;
    }
  }
  return null;
}

// ---- Main parser ----

export function parseExerciseDescription(input: string): NlpResult {
  const normalized = normalize(input);
  const confidence: Record<string, NlpFieldConfidence> = {};

  // 1. Extract equipment
  let equipment: Equipment | null = null;
  const equipMatch = findPhraseMatch(normalized, EQUIPMENT_KEYWORDS);
  if (equipMatch) {
    equipment = equipMatch.value;
    confidence.equipment = "high";
  }

  // 2. Extract difficulty
  let difficulty: Difficulty | null = null;
  const diffMatch = findPhraseMatch(normalized, DIFFICULTY_KEYWORDS);
  if (diffMatch) {
    difficulty = diffMatch.value;
    confidence.difficulty = "high";
  }

  // 3. Match archetype (longest phrase match first)
  let category: Category | null = null;
  let primaryMuscles: MuscleGroup[] = [];
  let secondaryMuscles: MuscleGroup[] = [];
  let archetypeNameTokens: string | null = null;
  let matchedArchetype: Archetype | null = null;

  const allArchetypePhrases = ARCHETYPES.flatMap((a) =>
    a.phrases.map((p) => ({ phrase: p, archetype: a }))
  ).sort((a, b) => b.phrase.length - a.phrase.length);

  for (const { phrase, archetype } of allArchetypePhrases) {
    const pattern = new RegExp(
      `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (pattern.test(normalized)) {
      category = archetype.category;
      primaryMuscles = [...archetype.primary];
      secondaryMuscles = [...archetype.secondary];
      archetypeNameTokens = archetype.nameTokens;
      matchedArchetype = archetype;
      confidence.category = "high";
      confidence.primary_muscles = "high";
      confidence.secondary_muscles = "medium";
      break;
    }
  }

  // 4. Fallback: extract muscles from text if no archetype matched
  if (!matchedArchetype) {
    const foundMuscles: MuscleGroup[] = [];
    for (const [phrases, muscle] of MUSCLE_KEYWORDS) {
      for (const phrase of phrases) {
        const pattern = new RegExp(
          `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        if (pattern.test(normalized)) {
          if (!foundMuscles.includes(muscle)) foundMuscles.push(muscle);
          break;
        }
      }
    }
    if (foundMuscles.length > 0) {
      primaryMuscles = foundMuscles;
      confidence.primary_muscles = "medium";
      if (!category && foundMuscles[0]) {
        category = MUSCLE_TO_CATEGORY[foundMuscles[0]] ?? null;
        if (category) confidence.category = "medium";
      }
    }
  }

  // 5. Extract modifiers
  const matchedModifiers: string[] = [];
  for (const mod of MODIFIERS) {
    for (const phrase of mod.phrases) {
      const pattern = new RegExp(
        `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );
      if (pattern.test(normalized)) {
        // Avoid duplicating modifier if it's already part of archetype name
        if (archetypeNameTokens && archetypeNameTokens.toLowerCase().includes(mod.namePrefix.toLowerCase())) {
          break;
        }
        // Skip "cable" modifier if equipment is already cable
        if (mod.namePrefix === "Cable" && equipment === "cable") break;
        // Skip "front" if archetype already contains it
        if (mod.namePrefix === "Front" && archetypeNameTokens?.toLowerCase().includes("front")) break;
        // Skip "hammer" if archetype already has it
        if (mod.namePrefix === "Hammer" && archetypeNameTokens?.toLowerCase().includes("hammer")) break;
        // Skip "overhead" if archetype already has it
        if (mod.namePrefix === "Overhead" && archetypeNameTokens?.toLowerCase().includes("overhead")) break;
        // Skip "preacher" if archetype already has it
        if (mod.namePrefix === "Preacher" && archetypeNameTokens?.toLowerCase().includes("preacher")) break;
        // Skip "hanging" if archetype already has it
        if (mod.namePrefix === "Hanging" && archetypeNameTokens?.toLowerCase().includes("hanging")) break;

        matchedModifiers.push(mod.namePrefix);
        break;
      }
    }
  }

  // 6. Build name
  let name: string;
  if (archetypeNameTokens) {
    const equipmentLabel =
      equipment && !["bodyweight", "other"].includes(equipment)
        ? titleCase(equipment)
        : "";
    const parts = [
      ...matchedModifiers,
      equipmentLabel,
      archetypeNameTokens,
    ].filter(Boolean);
    name = parts.join(" ");
  } else {
    // No archetype matched -- clean up the raw input as name
    const words = normalized.split(" ").filter((w) => !NOISE_WORDS.has(w));
    // Remove difficulty words from name
    const diffWords = DIFFICULTY_KEYWORDS.flatMap(([phrases]) => phrases);
    const filtered = words.filter((w) => !diffWords.includes(w));
    name = titleCase(filtered.join(" ") || normalized);
  }

  // Deduplicate secondary vs primary
  secondaryMuscles = secondaryMuscles.filter((m) => !primaryMuscles.includes(m));

  return {
    name,
    category,
    equipment,
    difficulty,
    primary_muscles: primaryMuscles,
    secondary_muscles: secondaryMuscles,
    instructions: "",
    confidence,
  };
}
