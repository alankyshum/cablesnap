import type { Exercise, Equipment } from "./types";
import type { SubstitutionScore } from "./exercise-substitutions";

const MAX_SEARCH_RESULTS = 100;

const EMPTY_MATCH = {
  primaryOverlap: 0,
  secondaryOverlap: 0,
  equipmentMatch: 0,
  categoryMatch: 0,
  difficultyProx: 0,
};

export type ComposedResults = {
  relevance: SubstitutionScore[];
  other: SubstitutionScore[];
};

export function isBlankQuery(query: string): boolean {
  return query.trim().length === 0;
}

/**
 * Compose search results for the substitution sheet.
 *
 * Empty query → returns the muscle-relevance list filtered by equipment (`other` empty).
 * Non-empty query → partitions into:
 *   - `relevance`: muscle-relevance matches whose name contains the query (preserves relevance order)
 *   - `other`: remaining exercises whose name contains the query, sorted alphabetically
 * Equipment filter is applied (AND) in both cases. Source exercise and deleted exercises
 * are always excluded.
 */
export function composeSearchResults(params: {
  query: string;
  scored: SubstitutionScore[];
  allExercises: Exercise[];
  sourceExercise: Exercise | null;
  equipmentFilter: Equipment | null;
}): ComposedResults {
  const { query, scored, allExercises, sourceExercise, equipmentFilter } = params;
  const blank = isBlankQuery(query);
  const q = query.trim().toLowerCase();

  const byEquipment = (ex: Exercise) =>
    !equipmentFilter || ex.equipment === equipmentFilter;

  if (blank) {
    return {
      relevance: scored.filter((s) => byEquipment(s.exercise)),
      other: [],
    };
  }

  const relevanceIds = new Set<string>();
  const relevance: SubstitutionScore[] = [];
  for (const s of scored) {
    if (!s.exercise.name.toLowerCase().includes(q)) continue;
    if (!byEquipment(s.exercise)) continue;
    relevance.push(s);
    relevanceIds.add(s.exercise.id);
  }

  const other: SubstitutionScore[] = [];
  for (const ex of allExercises) {
    if (sourceExercise && ex.id === sourceExercise.id) continue;
    if (ex.deleted_at) continue;
    if (relevanceIds.has(ex.id)) continue;
    if (!ex.name.toLowerCase().includes(q)) continue;
    if (!byEquipment(ex)) continue;
    other.push({ exercise: ex, score: 0, matchDetails: { ...EMPTY_MATCH } });
  }
  other.sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));

  const totalLimit = MAX_SEARCH_RESULTS;
  const clampedRelevance = relevance.slice(0, totalLimit);
  const remaining = Math.max(0, totalLimit - clampedRelevance.length);
  return {
    relevance: clampedRelevance,
    other: other.slice(0, remaining),
  };
}
