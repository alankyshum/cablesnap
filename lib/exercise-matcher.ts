/**
 * Exercise matching for CSV import — matches raw exercise names from
 * competitor apps to CableSnap's exercise database.
 * BLD-890
 *
 * Pipeline:
 * 1. Exact case-insensitive name match
 * 2. NLP archetype + metadata similarity scoring
 * 3. Fuzzy token overlap (Jaccard similarity)
 * 4. Return ranked candidates with confidence levels
 */
import { parseExerciseDescription, type NlpResult } from "./exercise-nlp";
import type { Exercise } from "./types";

// ---- Types ----

export type MatchConfidence = "high" | "medium" | "low";

export type ExerciseMatch = {
  exercise: Exercise;
  confidence: MatchConfidence;
  score: number; // 0-1
  matchReason: string;
};

export type MatchResult = {
  rawName: string;
  /** NLP-inferred metadata for the raw name (used for "create as new" flow). */
  nlpResult: NlpResult;
  /** Best match, if any candidate scored above the minimum threshold. */
  bestMatch: ExerciseMatch | null;
  /** All candidates above threshold, ranked by score. */
  candidates: ExerciseMatch[];
};

// ---- Constants ----

const HIGH_THRESHOLD = 0.85;
const MEDIUM_THRESHOLD = 0.6;
const MIN_THRESHOLD = 0.4;

// ---- Helpers ----

/** Tokenize a string into lowercase words. */
function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard similarity between two token sets (intersection / union). */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Score how well NLP metadata from a raw name matches an existing exercise. */
function nlpMetadataScore(nlp: NlpResult, exercise: Exercise): number {
  let score = 0;
  let maxScore = 0;

  // Category match (weight: 3)
  maxScore += 3;
  if (nlp.category && nlp.category === exercise.category) {
    score += 3;
  }

  // Equipment match (weight: 2)
  maxScore += 2;
  if (nlp.equipment && nlp.equipment === exercise.equipment) {
    score += 2;
  }

  // Primary muscle overlap (weight: 3)
  maxScore += 3;
  if (nlp.primary_muscles.length > 0) {
    const exMuscles = typeof exercise.primary_muscles === "string"
      ? (exercise.primary_muscles as string).split(",")
      : exercise.primary_muscles;
    const overlap = nlp.primary_muscles.filter((m) =>
      exMuscles.includes(m)
    ).length;
    const maxLen = Math.max(nlp.primary_muscles.length, exMuscles.length, 1);
    score += 3 * (overlap / maxLen);
  }

  return maxScore === 0 ? 0 : score / maxScore;
}

// ---- Main matching function ----

/**
 * Match a raw exercise name against the CableSnap exercise database.
 * Returns ranked candidates with confidence levels.
 */
export function matchExercise(
  rawName: string,
  exercises: Exercise[],
): MatchResult {
  const nlpResult = parseExerciseDescription(rawName);
  const rawLower = rawName.toLowerCase().trim();
  const rawTokens = tokenize(rawName);
  const candidates: ExerciseMatch[] = [];

  for (const exercise of exercises) {
    if (exercise.deleted_at) continue;

    // 1. Exact case-insensitive match
    if (exercise.name.toLowerCase().trim() === rawLower) {
      candidates.push({
        exercise,
        confidence: "high",
        score: 1.0,
        matchReason: "exact",
      });
      continue;
    }

    // 2. Combined NLP metadata + fuzzy name score
    const nameTokens = tokenize(exercise.name);
    const fuzzyScore = jaccardSimilarity(rawTokens, nameTokens);
    const metaScore = nlpMetadataScore(nlpResult, exercise);

    // Weighted combination: 40% name similarity, 60% metadata similarity
    const combinedScore = fuzzyScore * 0.4 + metaScore * 0.6;

    if (combinedScore >= MIN_THRESHOLD) {
      let confidence: MatchConfidence;
      if (combinedScore >= HIGH_THRESHOLD) confidence = "high";
      else if (combinedScore >= MEDIUM_THRESHOLD) confidence = "medium";
      else confidence = "low";

      candidates.push({
        exercise,
        confidence,
        score: Math.round(combinedScore * 1000) / 1000,
        matchReason: fuzzyScore > metaScore ? "fuzzy" : "nlp",
      });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return {
    rawName,
    nlpResult,
    bestMatch: candidates[0] ?? null,
    candidates,
  };
}

/**
 * Match all unique exercise names from a CSV import against the database.
 * Returns a map of rawName → MatchResult.
 */
export function matchAllExercises(
  rawNames: string[],
  exercises: Exercise[],
): Map<string, MatchResult> {
  const results = new Map<string, MatchResult>();
  // Case-insensitive dedup
  const seen = new Set<string>();
  for (const name of rawNames) {
    const lower = name.toLowerCase().trim();
    if (seen.has(lower)) continue;
    seen.add(lower);
    results.set(lower, matchExercise(name, exercises));
  }
  return results;
}
