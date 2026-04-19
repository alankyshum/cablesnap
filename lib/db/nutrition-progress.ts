import { query, queryOne } from "./helpers";
import type { MacroTargets } from "../types";
import { NUTRITION_ON_TARGET_TOLERANCE } from "./weekly-summary";

// ─── Types ─────────────────────────────────────────────────────────

export type DailyNutritionTotal = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type WeeklyNutritionAverage = {
  weekStart: string;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  daysTracked: number;
};

export type NutritionAdherence = {
  trackedDays: number;
  onTargetDays: number;
  currentStreak: number;
  longestStreak: number;
};

// ─── Helpers ───────────────────────────────────────────────────────

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (current <= end) {
    dates.push(dateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function mondayOfWeek(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return dateKey(copy);
}

// ─── Query Functions ───────────────────────────────────────────────

/**
 * Get daily nutrition totals for a date range.
 * Only returns days with at least one food entry (tracked days).
 */
export async function getDailyNutritionTotals(
  startDate: string,
  endDate: string,
): Promise<DailyNutritionTotal[]> {
  return query<DailyNutritionTotal>(
    `SELECT dl.date,
            SUM(f.calories * dl.servings) AS calories,
            SUM(f.protein * dl.servings) AS protein,
            SUM(f.carbs * dl.servings) AS carbs,
            SUM(f.fat * dl.servings) AS fat
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date BETWEEN ? AND ?
     GROUP BY dl.date
     ORDER BY dl.date ASC`,
    [startDate, endDate],
  );
}

/**
 * Get weekly nutrition averages for a given number of weeks back from today.
 */
export async function getWeeklyNutritionAverages(
  weeks: number,
): Promise<WeeklyNutritionAverage[]> {
  const today = new Date();
  const endDate = dateKey(today);
  const start = new Date(today);
  start.setDate(start.getDate() - weeks * 7);
  const startDate = dateKey(start);

  const dailyTotals = await getDailyNutritionTotals(startDate, endDate);
  if (dailyTotals.length === 0) return [];

  // Group by week (Monday start)
  const weekMap = new Map<string, DailyNutritionTotal[]>();
  for (const dt of dailyTotals) {
    const wk = mondayOfWeek(new Date(dt.date + "T00:00:00"));
    const arr = weekMap.get(wk) ?? [];
    arr.push(dt);
    weekMap.set(wk, arr);
  }

  const result: WeeklyNutritionAverage[] = [];
  const sortedWeeks = [...weekMap.keys()].sort();
  for (const wk of sortedWeeks) {
    const days = weekMap.get(wk)!;
    const n = days.length;
    result.push({
      weekStart: wk,
      avgCalories: Math.round(days.reduce((s, d) => s + d.calories, 0) / n),
      avgProtein: Math.round(days.reduce((s, d) => s + d.protein, 0) / n),
      avgCarbs: Math.round(days.reduce((s, d) => s + d.carbs, 0) / n),
      avgFat: Math.round(days.reduce((s, d) => s + d.fat, 0) / n),
      daysTracked: n,
    });
  }
  return result;
}

/**
 * Calculate adherence stats for a given number of days.
 * Only counts days with ≥1 food entry. Streak is calorie-only (within ±tolerance).
 */
export async function getNutritionAdherence(
  days: number,
  calorieTarget: number,
  tolerancePercent: number = NUTRITION_ON_TARGET_TOLERANCE,
): Promise<NutritionAdherence> {
  const today = new Date();
  const endDate = dateKey(today);
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  const startDate = dateKey(start);

  const dailyTotals = await getDailyNutritionTotals(startDate, endDate);

  if (dailyTotals.length === 0) {
    return { trackedDays: 0, onTargetDays: 0, currentStreak: 0, longestStreak: 0 };
  }

  const trackedDays = dailyTotals.length;
  const onTargetDays = dailyTotals.filter((d) => {
    const diff = Math.abs(d.calories - calorieTarget) / calorieTarget;
    return diff <= tolerancePercent;
  }).length;

  // Compute streaks — iterate sorted dates
  // Build a set of tracked dates for lookup
  const trackedSet = new Set(dailyTotals.map((d) => d.date));
  const calorieByDate = new Map(dailyTotals.map((d) => [d.date, d.calories]));

  // Generate full date range and iterate backwards for current streak, forward for longest
  const allDates = generateDateRange(startDate, endDate);

  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;

  // Iterate forward for longest streak (consecutive tracked days on target)
  for (const date of allDates) {
    if (!trackedSet.has(date)) {
      // Untracked day breaks the streak
      streak = 0;
      continue;
    }
    const cal = calorieByDate.get(date)!;
    const diff = Math.abs(cal - calorieTarget) / calorieTarget;
    if (diff <= tolerancePercent) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  // Current streak: iterate backward from today
  currentStreak = 0;
  for (let i = allDates.length - 1; i >= 0; i--) {
    const date = allDates[i];
    if (!trackedSet.has(date)) {
      break; // untracked day ends current streak
    }
    const cal = calorieByDate.get(date)!;
    const diff = Math.abs(cal - calorieTarget) / calorieTarget;
    if (diff <= tolerancePercent) {
      currentStreak++;
    } else {
      break;
    }
  }

  return { trackedDays, onTargetDays, currentStreak, longestStreak };
}

/**
 * Get macro targets. Returns null if no targets are set.
 */
export async function getNutritionTargets(): Promise<MacroTargets | null> {
  return queryOne<MacroTargets>(
    "SELECT * FROM macro_targets LIMIT 1",
  );
}
