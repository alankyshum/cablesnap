import type { MuscleGroup } from "./types";

/**
 * Aggregate primary/secondary muscles from a set of exercises.
 * If a muscle appears as primary in ANY exercise, it's primary overall.
 * Otherwise if it's secondary in any, it stays secondary.
 */
export function aggregateMuscles(
  exercises: { primary_muscles: MuscleGroup[]; secondary_muscles: MuscleGroup[] }[],
): { primary: MuscleGroup[]; secondary: MuscleGroup[] } {
  const primarySet = new Set<MuscleGroup>();
  const secondarySet = new Set<MuscleGroup>();

  for (const ex of exercises) {
    for (const m of ex.primary_muscles) primarySet.add(m);
    for (const m of ex.secondary_muscles) secondarySet.add(m);
  }

  // Primary wins over secondary
  for (const m of primarySet) secondarySet.delete(m);

  return { primary: [...primarySet], secondary: [...secondarySet] };
}
