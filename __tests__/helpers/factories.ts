import type {
  Exercise,
  FoodEntry,
  DailyLog,
  MacroTargets,
  WorkoutTemplate,
  TemplateExercise,
  WorkoutSession,
  WorkoutSet,
  BodyWeight,
  BodyMeasurements,
  BodySettings,
  Program,
  ProgramDay,
  ProgramLog,
  LinkedGroup,
  BuiltinFood,
  ErrorEntry,
  Interaction,
} from '../../lib/types'

let counter = 0
function id() {
  return `test-${++counter}`
}

export function resetIds() {
  counter = 0
}

export function createExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: id(),
    name: 'Bench Press',
    category: 'chest',
    primary_muscles: ['chest'],
    secondary_muscles: ['triceps'],
    equipment: 'barbell',
    instructions: 'Lie on bench. Lower bar to chest. Press up.',
    difficulty: 'intermediate',
    is_custom: false,
    deleted_at: null,
    ...overrides,
  }
}

export function createFoodEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: id(),
    name: 'Chicken Breast',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    serving_size: '100g',
    is_favorite: false,
    created_at: Date.now(),
    ...overrides,
  }
}

export function createDailyLog(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: id(),
    food_entry_id: id(),
    date: new Date().toISOString().slice(0, 10),
    meal: 'lunch',
    servings: 1,
    logged_at: Date.now(),
    ...overrides,
  }
}

export function createMacroTargets(overrides: Partial<MacroTargets> = {}): MacroTargets {
  return {
    id: id(),
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 65,
    updated_at: Date.now(),
    ...overrides,
  }
}

export function createWorkoutTemplate(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: id(),
    name: 'Push Day',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  }
}

export function createTemplateExercise(overrides: Partial<TemplateExercise> = {}): TemplateExercise {
  return {
    id: id(),
    template_id: id(),
    exercise_id: id(),
    position: 0,
    target_sets: 3,
    target_reps: '8-12',
    rest_seconds: 90,
    link_id: null,
    link_label: '',
    ...overrides,
  }
}

export function createSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: id(),
    template_id: null,
    name: 'Morning Workout',
    started_at: Date.now(),
    completed_at: null,
    duration_seconds: null,
    notes: '',
    rating: null,
    ...overrides,
  }
}

export function createSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: id(),
    session_id: id(),
    exercise_id: id(),
    set_number: 1,
    weight: 60,
    reps: 10,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: '',
    link_id: null,
    round: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    ...overrides,
  }
}

export function createBodyWeight(overrides: Partial<BodyWeight> = {}): BodyWeight {
  return {
    id: id(),
    weight: 75,
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    logged_at: Date.now(),
    ...overrides,
  }
}

export function createBodyMeasurements(overrides: Partial<BodyMeasurements> = {}): BodyMeasurements {
  return {
    id: id(),
    date: new Date().toISOString().slice(0, 10),
    waist: null,
    chest: null,
    hips: null,
    left_arm: null,
    right_arm: null,
    left_thigh: null,
    right_thigh: null,
    left_calf: null,
    right_calf: null,
    neck: null,
    body_fat: null,
    notes: '',
    logged_at: Date.now(),
    ...overrides,
  }
}

export function createBodySettings(overrides: Partial<BodySettings> = {}): BodySettings {
  return {
    id: id(),
    weight_unit: 'kg',
    measurement_unit: 'cm',
    weight_goal: null,
    body_fat_goal: null,
    updated_at: Date.now(),
    ...overrides,
  }
}

export function createProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: id(),
    name: 'Push Pull Legs',
    description: 'A 3-day split program',
    is_active: false,
    current_day_id: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    deleted_at: null,
    ...overrides,
  }
}

export function createProgramDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: id(),
    program_id: id(),
    template_id: null,
    position: 0,
    label: 'Day 1',
    ...overrides,
  }
}

export function createProgramLog(overrides: Partial<ProgramLog> = {}): ProgramLog {
  return {
    id: id(),
    program_id: id(),
    day_id: id(),
    session_id: id(),
    completed_at: Date.now(),
    ...overrides,
  }
}

export function createLinkedGroup(overrides: Partial<LinkedGroup> = {}): LinkedGroup {
  return {
    link_id: id(),
    label: 'Superset A',
    exercises: [],
    ...overrides,
  }
}

export function createBuiltinFood(overrides: Partial<BuiltinFood> = {}): BuiltinFood {
  return {
    id: id(),
    name: 'Brown Rice',
    category: 'grains',
    calories: 216,
    protein: 5,
    carbs: 45,
    fat: 1.8,
    serving: '1 cup cooked',
    ...overrides,
  }
}

export function createErrorEntry(overrides: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: id(),
    message: 'Test error',
    stack: null,
    component: null,
    fatal: false,
    timestamp: Date.now(),
    app_version: '1.0.0',
    platform: 'ios',
    os_version: '17.0',
    ...overrides,
  }
}

export function createInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: id(),
    action: 'tap',
    screen: 'home',
    detail: null,
    timestamp: Date.now(),
    ...overrides,
  }
}
