import type { Exercise, Equipment, MuscleGroup, Category } from '../../../lib/types';

/**
 * Exercise filter logic — extracted to match the useMemo in exercises.tsx.
 * This allows testing the filter logic without rendering the full screen.
 */
function filterExercises(
  exercises: Exercise[],
  opts: {
    query?: string;
    categories?: Set<Category>;
    customOnly?: boolean;
    equipment?: Set<Equipment>;
    muscles?: Set<MuscleGroup>;
  }
): Exercise[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = opts.query ? normalize(opts.query) : '';
  return exercises.filter((ex) => {
    if (q && !normalize(ex.name).includes(q)) return false;
    if (opts.customOnly && !ex.is_custom) return false;
    if (opts.categories && opts.categories.size > 0 && !opts.categories.has(ex.category))
      return false;
    if (opts.equipment && opts.equipment.size > 0 && !opts.equipment.has(ex.equipment))
      return false;
    if (
      opts.muscles &&
      opts.muscles.size > 0 &&
      !ex.primary_muscles.some((m: MuscleGroup) => opts.muscles!.has(m))
    )
      return false;
    return true;
  });
}

// --- Fixture data ---

const makeExercise = (overrides: Partial<Exercise> & { id: string; name: string }): Exercise => ({
  category: 'back' as Category,
  primary_muscles: ['back'] as MuscleGroup[],
  secondary_muscles: [],
  equipment: 'cable' as Equipment,
  instructions: '',
  difficulty: 'intermediate',
  is_custom: false,
  ...overrides,
});

const EXERCISES: Exercise[] = [
  makeExercise({ id: '1', name: 'Cable Row', equipment: 'cable', category: 'back', primary_muscles: ['back', 'biceps'] }),
  makeExercise({ id: '2', name: 'Barbell Bench Press', equipment: 'barbell', category: 'chest', primary_muscles: ['chest', 'triceps'] }),
  makeExercise({ id: '3', name: 'Dumbbell Curl', equipment: 'dumbbell', category: 'arms', primary_muscles: ['biceps'] }),
  makeExercise({ id: '4', name: 'Bodyweight Push-up', equipment: 'bodyweight', category: 'chest', primary_muscles: ['chest', 'triceps'] }),
  makeExercise({ id: '5', name: 'Machine Leg Press', equipment: 'machine', category: 'legs_glutes', primary_muscles: ['quads', 'glutes'] }),
  makeExercise({ id: '6', name: 'Kettlebell Swing', equipment: 'kettlebell', category: 'legs_glutes', primary_muscles: ['glutes', 'hamstrings'] }),
  makeExercise({ id: '7', name: 'Band Pull Apart', equipment: 'band', category: 'back', primary_muscles: ['back', 'shoulders'] }),
  makeExercise({ id: '8', name: 'Custom Stretch', equipment: 'other', category: 'abs_core', primary_muscles: ['core'], is_custom: true }),
];

describe('Exercise filter logic', () => {
  it('returns all exercises when no filters active', () => {
    const result = filterExercises(EXERCISES, {});
    expect(result).toHaveLength(8);
  });

  it('filters by single equipment type', () => {
    const result = filterExercises(EXERCISES, { equipment: new Set(['cable'] as Equipment[]) });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Cable Row');
  });

  it('filters by multiple equipment types (OR within dimension)', () => {
    const result = filterExercises(EXERCISES, {
      equipment: new Set(['dumbbell', 'barbell'] as Equipment[]),
    });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.name).sort()).toEqual(['Barbell Bench Press', 'Dumbbell Curl']);
  });

  it('filters by single muscle group', () => {
    const result = filterExercises(EXERCISES, { muscles: new Set(['biceps'] as MuscleGroup[]) });
    expect(result).toHaveLength(2); // Cable Row (back, biceps) + Dumbbell Curl (biceps)
    expect(result.map((e) => e.name).sort()).toEqual(['Cable Row', 'Dumbbell Curl']);
  });

  it('shows exercise if ANY primary muscle matches (OR within muscle dimension)', () => {
    const result = filterExercises(EXERCISES, {
      muscles: new Set(['glutes', 'shoulders'] as MuscleGroup[]),
    });
    // Machine Leg Press (quads, glutes), Kettlebell Swing (glutes, hamstrings), Band Pull Apart (back, shoulders)
    expect(result).toHaveLength(3);
  });

  it('applies AND logic across dimensions (category + equipment)', () => {
    const result = filterExercises(EXERCISES, {
      categories: new Set(['chest'] as Category[]),
      equipment: new Set(['barbell'] as Equipment[]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Barbell Bench Press');
  });

  it('applies AND logic across all three dimensions (category + equipment + muscle)', () => {
    const result = filterExercises(EXERCISES, {
      categories: new Set(['back'] as Category[]),
      equipment: new Set(['cable'] as Equipment[]),
      muscles: new Set(['biceps'] as MuscleGroup[]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Cable Row');
  });

  it('returns empty when no exercises match combined filters', () => {
    const result = filterExercises(EXERCISES, {
      categories: new Set(['arms'] as Category[]),
      equipment: new Set(['cable'] as Equipment[]),
    });
    expect(result).toHaveLength(0);
  });

  it('returns all exercises when all filters cleared', () => {
    const result = filterExercises(EXERCISES, {
      categories: new Set(),
      equipment: new Set(),
      muscles: new Set(),
    });
    expect(result).toHaveLength(8);
  });

  it('combines with text search', () => {
    const result = filterExercises(EXERCISES, {
      query: 'press',
      equipment: new Set(['barbell'] as Equipment[]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Barbell Bench Press');
  });

  it('shows custom exercise with equipment "other" when Other selected', () => {
    const result = filterExercises(EXERCISES, {
      equipment: new Set(['other'] as Equipment[]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Custom Stretch');
    expect(result[0].is_custom).toBe(true);
  });

  it('exercise with multiple primary muscles shown if ANY matches', () => {
    // Cable Row has primary_muscles: ['back', 'biceps']
    const result = filterExercises(EXERCISES, {
      muscles: new Set(['biceps'] as MuscleGroup[]),
    });
    expect(result.some((e) => e.name === 'Cable Row')).toBe(true);
  });
});
