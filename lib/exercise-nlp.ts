import type {
  Category,
  Difficulty,
  Equipment,
  MuscleGroup,
} from "./types";
import {
  ARCHETYPES,
  DIFFICULTY_KEYWORDS,
  EQUIPMENT_KEYWORDS,
  MODIFIERS,
  MUSCLE_KEYWORDS,
  MUSCLE_TO_CATEGORY,
  NOISE_WORDS,
} from "./exercise-nlp-data";
import type { Archetype } from "./exercise-nlp-data";

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
