// Strength level classification for compound lifts.
// Levels are based on e1RM as a multiplier of body weight, split by gender.

export type StrengthLevel = "beginner" | "novice" | "intermediate" | "advanced" | "elite";

export type StrengthThresholds = {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
};

export type StrengthResult = {
  level: StrengthLevel;
  nextLevel: StrengthLevel | null;
  nextThresholdKg: number | null;
};

const LEVELS: StrengthLevel[] = ["beginner", "novice", "intermediate", "advanced", "elite"];

// BW multipliers for each exercise × gender
const STANDARDS: Record<string, Record<"male" | "female", StrengthThresholds>> = {
  "bench press": {
    male:   { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
    female: { beginner: 0.25, novice: 0.50, intermediate: 0.75, advanced: 1.00, elite: 1.25 },
  },
  "squat": {
    male:   { beginner: 0.75, novice: 1.00, intermediate: 1.50, advanced: 2.00, elite: 2.50 },
    female: { beginner: 0.50, novice: 0.75, intermediate: 1.25, advanced: 1.75, elite: 2.25 },
  },
  "deadlift": {
    male:   { beginner: 1.00, novice: 1.25, intermediate: 1.75, advanced: 2.25, elite: 3.00 },
    female: { beginner: 0.50, novice: 1.00, intermediate: 1.50, advanced: 2.00, elite: 2.50 },
  },
  "overhead press": {
    male:   { beginner: 0.35, novice: 0.55, intermediate: 0.75, advanced: 1.00, elite: 1.25 },
    female: { beginner: 0.20, novice: 0.35, intermediate: 0.50, advanced: 0.75, elite: 1.00 },
  },
  "barbell row": {
    male:   { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
    female: { beginner: 0.25, novice: 0.50, intermediate: 0.75, advanced: 1.00, elite: 1.25 },
  },
};

// Sorted longest-first so "barbell bench press" matches "bench press" not "press"
const STANDARD_KEYS = Object.keys(STANDARDS).sort((a, b) => b.length - a.length);

/**
 * Match a freeform exercise name to a standards key.
 * Normalizes by lowercasing and checking if the name contains a standard key.
 */
export function matchExercise(name: string): string | null {
  const normalized = name.toLowerCase().trim();
  for (const key of STANDARD_KEYS) {
    if (normalized.includes(key)) return key;
  }
  return null;
}

/**
 * Determine the user's strength level for a given exercise.
 *
 * @param exerciseName - Freeform exercise name (e.g. "Barbell Bench Press")
 * @param gender - "male" or "female"
 * @param bodyWeightKg - User's body weight in kg
 * @param e1rmKg - Estimated 1RM in kg
 * @returns StrengthResult with current level and next target, or null if no standard exists
 */
export function getStrengthLevel(
  exerciseName: string,
  gender: "male" | "female",
  bodyWeightKg: number,
  e1rmKg: number,
): StrengthResult | null {
  if (bodyWeightKg <= 0 || e1rmKg <= 0) return null;

  const key = matchExercise(exerciseName);
  if (!key) return null;

  const thresholds = STANDARDS[key]?.[gender];
  if (!thresholds) return null;

  const ratio = e1rmKg / bodyWeightKg;

  // Walk levels top-down: first threshold the ratio meets or exceeds is the level
  let level: StrengthLevel = "beginner";
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (ratio >= thresholds[LEVELS[i]]) {
      level = LEVELS[i];
      break;
    }
  }

  const levelIdx = LEVELS.indexOf(level);
  const nextLevel = levelIdx < LEVELS.length - 1 ? LEVELS[levelIdx + 1] : null;
  const nextThresholdKg = nextLevel
    ? Math.round(thresholds[nextLevel] * bodyWeightKg * 10) / 10
    : null;

  return { level, nextLevel, nextThresholdKg };
}

/** Check if an exercise has strength standards data. */
export function hasStandards(exerciseName: string): boolean {
  return matchExercise(exerciseName) !== null;
}

/** Get all standard exercise keys. */
export function getStandardExerciseKeys(): string[] {
  return Object.keys(STANDARDS);
}

export { LEVELS };
