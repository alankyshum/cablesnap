import type { Exercise } from '../../lib/types'
import type { DailyLog, FoodEntry, MacroTargets } from '../../lib/types'

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
