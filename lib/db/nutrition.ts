import { eq, desc, asc, sql } from "drizzle-orm";
import type { FoodEntry, DailyLog, MacroTargets, Meal } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, queryOne } from "./helpers";
import { foodEntries, dailyLog, macroTargets } from "./schema";

type FoodRow = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  is_favorite: number;
  created_at: number;
};

function mapFood(row: FoodRow): FoodEntry {
  return {
    ...row,
    is_favorite: row.is_favorite === 1,
  };
}

type DailyLogRow = {
  id: string;
  food_entry_id: string;
  date: string;
  meal: string;
  servings: number;
  logged_at: number;
  food_name: string;
  food_calories: number;
  food_protein: number;
  food_carbs: number;
  food_fat: number;
  food_serving_size: string;
  food_is_favorite: number;
  food_created_at: number;
};

export async function addFoodEntry(
  name: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  serving: string,
  favorite: boolean
): Promise<FoodEntry> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(foodEntries).values({
    id, name, calories, protein, carbs, fat,
    serving_size: serving,
    is_favorite: favorite ? 1 : 0,
    created_at: now,
  });
  return { id, name, calories, protein, carbs, fat, serving_size: serving, is_favorite: favorite, created_at: now };
}

export async function getFoodEntries(): Promise<FoodEntry[]> {
  const db = await getDrizzle();
  const rows = await db.select().from(foodEntries).orderBy(desc(foodEntries.created_at));
  return (rows as unknown as FoodRow[]).map(mapFood);
}

export async function getFavoriteFoods(): Promise<FoodEntry[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(foodEntries)
    .where(eq(foodEntries.is_favorite, 1))
    .orderBy(asc(foodEntries.name));
  return (rows as unknown as FoodRow[]).map(mapFood);
}

export async function toggleFavorite(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(foodEntries)
    .set({ is_favorite: sql`CASE WHEN ${foodEntries.is_favorite} = 1 THEN 0 ELSE 1 END` })
    .where(eq(foodEntries.id, id));
}

export async function addDailyLog(
  foodId: string,
  date: string,
  meal: Meal,
  servings: number
): Promise<DailyLog> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(dailyLog).values({
    id, food_entry_id: foodId, date, meal, servings, logged_at: now,
  });
  return { id, food_entry_id: foodId, date, meal, servings, logged_at: now };
}

export async function getDailyLogs(date: string): Promise<DailyLog[]> {
  const rows = await query<DailyLogRow>(
    `SELECT dl.*, f.name AS food_name, f.calories AS food_calories, f.protein AS food_protein,
            f.carbs AS food_carbs, f.fat AS food_fat, f.serving_size AS food_serving_size,
            f.is_favorite AS food_is_favorite, f.created_at AS food_created_at
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date = ?
     ORDER BY dl.logged_at ASC`,
    [date]
  );
  return rows.map((r) => ({
    id: r.id,
    food_entry_id: r.food_entry_id,
    date: r.date,
    meal: r.meal as Meal,
    servings: r.servings,
    logged_at: r.logged_at,
    food: mapFood({
      id: r.food_entry_id,
      name: r.food_name,
      calories: r.food_calories,
      protein: r.food_protein,
      carbs: r.food_carbs,
      fat: r.food_fat,
      serving_size: r.food_serving_size,
      is_favorite: r.food_is_favorite,
      created_at: r.food_created_at,
    }),
  }));
}

export async function deleteDailyLog(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(dailyLog).where(eq(dailyLog.id, id));
}

export async function getMacroTargets(): Promise<MacroTargets> {
  const db = await getDrizzle();
  const row = await db.select().from(macroTargets).limit(1).get();
  if (row) return row as unknown as MacroTargets;
  const id = uuid();
  const now = Date.now();
  await db.insert(macroTargets).values({
    id, calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: now,
  });
  return { id, calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: now };
}

export async function updateMacroTargets(
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): Promise<void> {
  const targets = await getMacroTargets();
  const db = await getDrizzle();
  await db.update(macroTargets)
    .set({ calories, protein, carbs, fat, updated_at: Date.now() })
    .where(eq(macroTargets.id, targets.id));
}

export async function findDuplicateFoodEntry(
  name: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): Promise<FoodEntry | null> {
  const row = await queryOne<FoodRow>(
    "SELECT * FROM food_entries WHERE LOWER(name) = LOWER(?) AND calories = ? AND protein = ? AND carbs = ? AND fat = ? LIMIT 1",
    [name, calories, protein, carbs, fat]
  );
  return row ? mapFood(row) : null;
}

export async function getDailySummary(
  date: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  const row = await queryOne<{
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  }>(
    `SELECT SUM(f.calories * dl.servings) AS calories,
            SUM(f.protein * dl.servings) AS protein,
            SUM(f.carbs * dl.servings) AS carbs,
            SUM(f.fat * dl.servings) AS fat
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date = ?`,
    [date]
  );
  return {
    calories: row?.calories ?? 0,
    protein: row?.protein ?? 0,
    carbs: row?.carbs ?? 0,
    fat: row?.fat ?? 0,
  };
}
