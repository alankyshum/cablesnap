import type { Exercise, Equipment, Difficulty } from "./types";

export type MatchDetails = {
  primaryOverlap: number;
  secondaryOverlap: number;
  equipmentMatch: number;
  categoryMatch: number;
  difficultyProx: number;
};

export type SubstitutionScore = {
  exercise: Exercise;
  score: number;
  matchDetails: MatchDetails;
};

const EQUIPMENT_GROUPS: Record<string, Equipment[]> = {
  free_weights: ["barbell", "dumbbell", "kettlebell"],
  machines: ["machine", "cable"],
  bodyweight: ["bodyweight"],
  accessories: ["band", "other"],
};

function getEquipmentGroup(eq: Equipment): string {
  for (const [group, members] of Object.entries(EQUIPMENT_GROUPS)) {
    if (members.includes(eq)) return group;
  }
  return "other";
}

function setIntersection<T>(a: T[], b: T[]): T[] {
  return a.filter((v) => b.includes(v));
}

function setUnion<T>(a: T[], b: T[]): T[] {
  return [...new Set([...a, ...b])];
}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

export function scoreSubstitution(source: Exercise, candidate: Exercise): number {
  const details = scoreSubstitutionDetailed(source, candidate);
  return details.primaryOverlap + details.secondaryOverlap +
    details.equipmentMatch + details.categoryMatch + details.difficultyProx;
}

export function scoreSubstitutionDetailed(source: Exercise, candidate: Exercise): MatchDetails {
  // Primary muscle overlap: 50 pts max
  const pUnion = setUnion(source.primary_muscles, candidate.primary_muscles);
  const pIntersect = setIntersection(source.primary_muscles, candidate.primary_muscles);
  const primaryOverlap = pUnion.length > 0
    ? Math.round((pIntersect.length / pUnion.length) * 50)
    : 0;

  // Secondary muscle overlap: 20 pts max
  const sUnion = setUnion(source.secondary_muscles, candidate.secondary_muscles);
  const sIntersect = setIntersection(source.secondary_muscles, candidate.secondary_muscles);
  const secondaryOverlap = sUnion.length > 0
    ? Math.round((sIntersect.length / sUnion.length) * 20)
    : 0;

  // Equipment match: 15 pts max
  let equipmentMatch = 0;
  if (source.equipment === candidate.equipment) {
    equipmentMatch = 15;
  } else if (getEquipmentGroup(source.equipment) === getEquipmentGroup(candidate.equipment)) {
    equipmentMatch = 8;
  }

  // Category match: 10 pts max
  const categoryMatch = source.category === candidate.category ? 10 : 0;

  // Difficulty proximity: 5 pts max
  const diff = Math.abs(DIFFICULTY_RANK[source.difficulty] - DIFFICULTY_RANK[candidate.difficulty]);
  const difficultyProx = diff === 0 ? 5 : diff === 1 ? 3 : diff === 2 ? 1 : 0;

  return { primaryOverlap, secondaryOverlap, equipmentMatch, categoryMatch, difficultyProx };
}

const MIN_SCORE = 20;
const MAX_RESULTS = 20;

export function findSubstitutions(
  source: Exercise,
  allExercises: Exercise[],
  limit: number = MAX_RESULTS
): SubstitutionScore[] {
  if (!source.primary_muscles || source.primary_muscles.length === 0) {
    return [];
  }

  const scored: SubstitutionScore[] = [];

  for (const candidate of allExercises) {
    // Exclude source exercise and deleted exercises
    if (candidate.id === source.id) continue;
    if (candidate.deleted_at) continue;

    const matchDetails = scoreSubstitutionDetailed(source, candidate);
    const score = matchDetails.primaryOverlap + matchDetails.secondaryOverlap +
      matchDetails.equipmentMatch + matchDetails.categoryMatch + matchDetails.difficultyProx;

    if (score >= MIN_SCORE) {
      scored.push({ exercise: candidate, score, matchDetails });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
