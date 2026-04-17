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
 * Migrate a legacy profile that used `age` to the new `birthYear` format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handles legacy profile shape
export function migrateProfile(raw: any): NutritionProfile {
  const { age: legacyAge, ...rest } = raw;
  if (rest.birthYear !== undefined && rest.birthYear !== null) {
    return rest as NutritionProfile;
  }
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - (Number(legacyAge) || 0);
  return { ...rest, birthYear } as NutritionProfile;
}

export function calculateFromProfile(profile: NutritionProfile): MacroTargets & { belowFloor: boolean } {
  const { weight_kg, height_cm } = convertToMetric(
    profile.weight,
    profile.weightUnit,
    profile.height,
    profile.heightUnit
  );

  const age = new Date().getFullYear() - profile.birthYear;
  const bmr = calculateBMR(weight_kg, height_cm, age, profile.sex);
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

export const GOAL_LABELS: Record<Goal, string> = {
  cut: "Cut",
  maintain: "Maintain",
  bulk: "Bulk",
};
