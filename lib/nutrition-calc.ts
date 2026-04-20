/**
 * Pure nutrition calculation functions using Mifflin-St Jeor equation.
 * No side effects — fully unit-testable.
 */

export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extra_active";

export type Goal = "cut" | "maintain" | "bulk";

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionProfile {
  birthYear: number;
  weight: number;
  height: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: Goal;
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "in";
  rmr_override?: number | null;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  bulk: 300,
};

const CALORIE_FLOOR = 1200;
const PROTEIN_PER_KG = 2.2;
const FAT_PERCENT = 0.25;

export function convertToMetric(
  weight: number,
  weightUnit: "kg" | "lb",
  height: number,
  heightUnit: "cm" | "in"
): { weight_kg: number; height_cm: number } {
  const weight_kg = weightUnit === "lb" ? weight * 0.453592 : weight;
  const height_cm = heightUnit === "in" ? height * 2.54 : height;
  return { weight_kg, height_cm };
}

export function calculateBMR(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: Sex
): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

export function calculateMacros(
  tdee: number,
  weight_kg: number,
  goal: Goal
): MacroTargets {
  const rawCalories = tdee + GOAL_ADJUSTMENTS[goal];
  const calories = Math.max(CALORIE_FLOOR, Math.round(rawCalories));

  const protein = Math.round(weight_kg * PROTEIN_PER_KG);
  const fat = Math.round((calories * FAT_PERCENT) / 9);

  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbCals = calories - proteinCals - fatCals;
  const carbs = Math.max(0, Math.round(carbCals / 4));

  return { calories, protein, carbs, fat };
}

/**
 * Calculate absolute percentage deviation between a user-provided RMR and the formula estimate.
 */
export function calculateDeviationPercent(inputRMR: number, estimatedBMR: number): number {
  if (estimatedBMR === 0) return 0;
  return Math.abs(((inputRMR - estimatedBMR) / estimatedBMR) * 100);
}

/**
 * Parse a raw profile object into a typed NutritionProfile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handles raw JSON input
export function migrateProfile(raw: any): NutritionProfile {
  return raw as NutritionProfile;
}

export function calculateFromProfile(profile: NutritionProfile): MacroTargets & { belowFloor: boolean } {
  const { weight_kg, height_cm } = convertToMetric(
    profile.weight,
    profile.weightUnit,
    profile.height,
    profile.heightUnit
  );

  const age = new Date().getFullYear() - profile.birthYear;
  const useOverride = profile.rmr_override != null && profile.rmr_override > 0;
  const bmr = useOverride ? profile.rmr_override! : calculateBMR(weight_kg, height_cm, age, profile.sex);
  const tdee = calculateTDEE(bmr, profile.activityLevel);
  const rawCalories = tdee + GOAL_ADJUSTMENTS[profile.goal];
  const belowFloor = rawCalories < CALORIE_FLOOR;
  const macros = calculateMacros(tdee, weight_kg, profile.goal);

  return { ...macros, belowFloor };
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  lightly_active: "Lightly Active",
  moderately_active: "Moderately Active",
  very_active: "Very Active",
  extra_active: "Extra Active",
};

export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: "Little or no exercise, desk job",
  lightly_active: "Light exercise 1–3 days/week",
  moderately_active: "Moderate exercise 3–5 days/week",
  very_active: "Hard exercise 6–7 days/week",
  extra_active: "Very hard exercise, physical job",
};

export const GOAL_LABELS: Record<Goal, string> = {
  cut: "Cut",
  maintain: "Maintain",
  bulk: "Bulk",
};
