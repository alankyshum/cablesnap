/**
 * Training-Day Macro Adjustment — pure computation module.
 *
 * DESIGN INVARIANTS (enforced by tests in __tests__/lib/training-day-macros.test.ts):
 *   1. No Date.now() / new Date() calls — all inputs injected by caller.
 *   2. computeEffectiveTargets never returns a calorie value below CALORIE_FLOOR.
 *   3. Weekly sum of 7 days' targets equals 7×base (Model 2) within rounding, unless floor clamping.
 *   4. No DB / React Native imports — fully unit-testable in Node.
 *   5. GTG (kind='day_session') exclusion is the caller's responsibility (wasWorkoutDay filter).
 *
 * PROHIBITION: No "earn/earned/bonus/reward/treat/deserve/penalty/punish/unlock/spend/
 *   burn it off/work it off/guilt/cheat" copy in this module or its callers.
 * No directional color tokens (no red/green/surplus/deficit coloring) on values from this module.
 * Psychologist verdict C1 — AC16.
 *
 * @see PLAN-BLD-2634.md — Model 2 (frequency-balanced) is the shipped model.
 */

import {
  CALORIE_FLOOR,
  recomputeMacrosFromCalories,
} from "./nutrition-calc";

export { CALORIE_FLOOR } from "./nutrition-calc";

// ─── Type disambiguation ──────────────────────────────────────────────────────

/**
 * Pure (in-memory) macro targets — no DB identity fields.
 * This is the shape returned by recomputeMacrosFromCalories + nutrition-calc helpers.
 * Distinct from lib/types.ts MacroTargets (DB row with id + updated_at).
 */
export interface PureMacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Map the `{protein_g, carbs_g, fat_g}` shape returned by
 * recomputeMacrosFromCalories to `{protein, carbs, fat}` + calories.
 * AC23 — disambiguate the pure-vs-DB MacroTargets type.
 */
export function mapRecomputedMacros(
  calories: number,
  raw: { protein_g: number; carbs_g: number; fat_g: number }
): PureMacroTargets {
  return {
    calories,
    protein: raw.protein_g,
    carbs: raw.carbs_g,
    fat: raw.fat_g,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DayType = "training" | "rest";

export interface TrainingDayParams {
  /** Split percentage (5–25). Default 10. */
  splitPercent: number;
  /** Expected training days per week (1–6). Default 4. */
  trainingDaysPerWeek: number;
}

export interface EffectiveTargets extends PureMacroTargets {
  /** Whether the day was classified as a training day. */
  dayType: DayType;
  /** Whether the effective targets differ from base (feature is active). */
  adjusted: boolean;
  /**
   * Whether the rest-day target was clamped to CALORIE_FLOOR.
   * When true, the weekly average may exceed the base target.
   */
  cappedByFloor: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Split percentage bounds — AC3 floor guard. */
export const SPLIT_PERCENT_MIN = 5;
export const SPLIT_PERCENT_MAX = 25;
export const SPLIT_PERCENT_DEFAULT = 10;

/** Training-days-per-week bounds — AC22 ÷0 guard. */
export const TRAINING_DAYS_MIN = 1;
export const TRAINING_DAYS_MAX = 6;
export const TRAINING_DAYS_DEFAULT = 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp a number to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate and clamp TrainingDayParams to safe ranges.
 * AC22: n must be clamped to 1..6 (n=7 → ÷0; n≤0 → inert).
 */
export function normalizeParams(params: TrainingDayParams): TrainingDayParams {
  return {
    splitPercent: clamp(
      Math.round(params.splitPercent),
      SPLIT_PERCENT_MIN,
      SPLIT_PERCENT_MAX
    ),
    trainingDaysPerWeek: clamp(
      Math.round(params.trainingDaysPerWeek),
      TRAINING_DAYS_MIN,
      TRAINING_DAYS_MAX
    ),
  };
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute the per-day effective calorie surplus (S) for a training day.
 *
 * Model 2 (frequency-balanced, AC2–AC4):
 *   S = base × (splitPercent / 100)
 *   Training-day calories = base + S
 *   Rest-day calories     = base − S × n/(7−n)   (clamped to CALORIE_FLOOR)
 *
 * Weekly total:
 *   n×(base+S) + (7−n)×(base − S×n/(7−n))
 *   = 7×base + n×S − n×S = 7×base  ✓
 *
 * AC22: n must be in 1..6 (normalizeParams ensures this). n=7 is not
 * reachable via normalizeParams (clamped to 6).
 *
 * @param baseCalories  Base daily calorie target (from macro_targets).
 * @param isTrainingDay Whether the target date is a training day.
 * @param params        User training-day adjustment parameters (already normalized).
 * @returns             {trainingCals, restCals, cappedByFloor}
 */
export function computeDayCalories(
  baseCalories: number,
  isTrainingDay: boolean,
  params: TrainingDayParams
): { trainingCals: number; restCals: number; cappedByFloor: boolean } {
  const { splitPercent, trainingDaysPerWeek: n } = params;

  // S = base × p
  const surplus = baseCalories * (splitPercent / 100);

  const rawTrainingCals = baseCalories + surplus;
  // rest-day offset = S × n/(7−n)
  const restDayOffset = surplus * (n / (7 - n));
  const rawRestCals = baseCalories - restDayOffset;

  // Apply calorie floor to rest day (AC5)
  const clampedRestCals = Math.max(CALORIE_FLOOR, Math.round(rawRestCals));
  const cappedByFloor = clampedRestCals > Math.round(rawRestCals);

  return {
    trainingCals: Math.round(rawTrainingCals),
    restCals: clampedRestCals,
    cappedByFloor,
  };
}

/**
 * Compute effective daily macro targets given a base target and day type.
 *
 * This is the primary entry point for the Training-Day Adjustment feature.
 * It is PURE — no DB calls, no Date.now(), no side effects.
 *
 * @param base          Base macro targets (from macro_targets singleton in DB).
 *                      Uses PureMacroTargets shape (calories, protein, carbs, fat).
 * @param isTrainingDay Whether the target date has a completed workout
 *                      (kind='workout', completed_at IS NOT NULL). GTG sessions
 *                      (kind='day_session') must be excluded by the caller.
 * @param params        User-configured split parameters (raw; will be normalized).
 * @param weightKg      User body weight in kg — used to recompute macros via
 *                      recomputeMacrosFromCalories (protein stays bodyweight-driven).
 * @returns             EffectiveTargets with dayType, adjusted, cappedByFloor flags.
 */
export function computeEffectiveTargets(
  base: PureMacroTargets,
  isTrainingDay: boolean,
  params: TrainingDayParams,
  weightKg: number
): EffectiveTargets {
  const normalized = normalizeParams(params);
  const { trainingCals, restCals, cappedByFloor } = computeDayCalories(
    base.calories,
    isTrainingDay,
    normalized
  );

  const effectiveCals = isTrainingDay ? trainingCals : restCals;
  const effectiveCapped = isTrainingDay ? false : cappedByFloor;

  // Derive protein/carbs/fat from the effective calorie count
  const raw = recomputeMacrosFromCalories(effectiveCals, weightKg);
  const macros = mapRecomputedMacros(effectiveCals, raw);

  const adjusted = effectiveCals !== base.calories;

  return {
    ...macros,
    dayType: isTrainingDay ? "training" : "rest",
    adjusted,
    cappedByFloor: effectiveCapped,
  };
}
