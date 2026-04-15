import type { Exercise } from "../types";

// ---- Types ----

export type MatchConfidence = "exact" | "possible" | "none";

export type ExerciseMatch = {
  strongName: string;
  confidence: MatchConfidence;
  matchedExercise: Exercise | null;
  matchReason: string;
};

// ---- Alias Table ----

const ALIAS_TABLE: Record<string, string> = {
  squat: "back squat",
  ohp: "overhead press",
  bench: "barbell bench press",
  deadlift: "conventional deadlift",
  "pull up": "pull-up",
  "pull ups": "pull-up",
  "pullup": "pull-up",
  "pullups": "pull-up",
  "chin up": "chin-up",
  "chin ups": "chin-up",
  "chinup": "chin-up",
  "chinups": "chin-up",
  "lat pulldown": "lat pull-down",
  "lat pull down": "lat pull-down",
  "bb bench press": "barbell bench press",
  "db bench press": "dumbbell bench press",
  "bb row": "barbell row",
  "db row": "dumbbell row",
  "bb curl": "barbell curl",
  "db curl": "dumbbell curl",
  "bb overhead press": "barbell overhead press",
  "db overhead press": "dumbbell overhead press",
  "rdl": "romanian deadlift",
  "sldl": "stiff leg deadlift",
  "ez bar curl": "ez-bar curl",
  "face pull": "face pulls",
  "hip thrust": "barbell hip thrust",
  "leg curl": "lying leg curl",
  "leg extension": "leg extensions",
  "cable fly": "cable flyes",
  "cable crossover": "cable flyes",
  "t bar row": "t-bar row",
  "t-bar row": "t-bar row",
  "incline bench": "incline bench press",
  "decline bench": "decline bench press",
  "military press": "overhead press",
  "arnold press": "arnold dumbbell press",
};

// ---- Normalization ----

/**
 * Normalize an exercise name: lowercase, strip parentheticals, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // strip parentheticals like (Barbell)
    .replace(/[-_]/g, " ") // normalize separators
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Extract equipment tag from parenthetical if present.
 * e.g., "Bench Press (Barbell)" -> { base: "bench press", equipment: "barbell" }
 */
function extractEquipment(name: string): {
  base: string;
  equipment: string | null;
} {
  const match = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/i);
  if (match) {
    return {
      base: match[1].trim().toLowerCase(),
      equipment: match[2].trim().toLowerCase(),
    };
  }
  return { base: name.toLowerCase().trim(), equipment: null };
}

// ---- 4-Pass Matching ----

/**
 * Pass 1: Exact case-insensitive match.
 */
function exactMatch(
  strongName: string,
  exercises: Exercise[]
): Exercise | null {
  const lower = strongName.toLowerCase().trim();
  return exercises.find((e) => e.name.toLowerCase().trim() === lower) ?? null;
}

/**
 * Pass 2: Normalize + strip parentheticals.
 * Try equipment-name pattern swap.
 */
function normalizeMatch(
  strongName: string,
  exercises: Exercise[]
): Exercise | null {
  const normalized = normalizeName(strongName);
  const { base, equipment } = extractEquipment(strongName);

  for (const ex of exercises) {
    const exNorm = normalizeName(ex.name);

    // Direct normalized match
    if (exNorm === normalized) return ex;

    // Equipment pattern swap: "Bench Press (Barbell)" vs "Barbell Bench Press"
    if (equipment) {
      const swapped = `${equipment} ${base}`;
      if (exNorm === swapped) return ex;
    }

    // Reverse: FitForge has "Bench Press (Barbell)" and Strong has "Barbell Bench Press"
    const exExtracted = extractEquipment(ex.name);
    if (exExtracted.equipment) {
      const exSwapped = `${exExtracted.equipment} ${exExtracted.base}`;
      if (normalized === exSwapped) return ex;
      if (normalized === exExtracted.base) return ex;
    }
  }

  return null;
}

/**
 * Pass 3: Substring containment.
 */
function substringMatch(
  strongName: string,
  exercises: Exercise[]
): Exercise | null {
  const normalized = normalizeName(strongName);
  if (normalized.length < 3) return null; // too short for substring matching

  // Prefer shorter FitForge names (more specific matches)
  const sorted = [...exercises].sort(
    (a, b) => a.name.length - b.name.length
  );

  for (const ex of sorted) {
    const exNorm = normalizeName(ex.name);
    if (exNorm.length < 3) continue;

    if (normalized.includes(exNorm) || exNorm.includes(normalized)) {
      return ex;
    }
  }

  return null;
}

/**
 * Pass 4: Alias lookup table.
 */
function aliasMatch(
  strongName: string,
  exercises: Exercise[]
): Exercise | null {
  const normalized = normalizeName(strongName);
  const aliasTarget = ALIAS_TABLE[normalized];
  if (!aliasTarget) return null;

  return (
    exercises.find((e) => normalizeName(e.name) === aliasTarget) ?? null
  );
}

/**
 * Run the 4-pass matching algorithm on a single exercise name.
 */
export function matchExercise(
  strongName: string,
  exercises: Exercise[]
): ExerciseMatch {
  // Pass 1: Exact match
  const exact = exactMatch(strongName, exercises);
  if (exact) {
    return {
      strongName,
      confidence: "exact",
      matchedExercise: exact,
      matchReason: "Exact match",
    };
  }

  // Pass 2: Normalize + strip parentheticals
  const normalized = normalizeMatch(strongName, exercises);
  if (normalized) {
    return {
      strongName,
      confidence: "possible",
      matchedExercise: normalized,
      matchReason: "Normalized match",
    };
  }

  // Pass 3: Substring containment
  const substring = substringMatch(strongName, exercises);
  if (substring) {
    return {
      strongName,
      confidence: "possible",
      matchedExercise: substring,
      matchReason: "Substring match",
    };
  }

  // Pass 4: Alias lookup
  const alias = aliasMatch(strongName, exercises);
  if (alias) {
    return {
      strongName,
      confidence: "possible",
      matchedExercise: alias,
      matchReason: "Alias match",
    };
  }

  return {
    strongName,
    confidence: "none",
    matchedExercise: null,
    matchReason: "No match — will create",
  };
}

/**
 * Match all exercise names from Strong CSV against FitForge library.
 */
export function matchAllExercises(
  strongNames: string[],
  exercises: Exercise[]
): ExerciseMatch[] {
  return strongNames.map((name) => matchExercise(name, exercises));
}

/**
 * Group matches by confidence for display.
 */
export function groupByConfidence(matches: ExerciseMatch[]): {
  exact: ExerciseMatch[];
  possible: ExerciseMatch[];
  none: ExerciseMatch[];
} {
  return {
    exact: matches.filter((m) => m.confidence === "exact"),
    possible: matches.filter((m) => m.confidence === "possible"),
    none: matches.filter((m) => m.confidence === "none"),
  };
}
