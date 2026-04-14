import type { FoodEntry, DailyLog, MacroTargets, Meal } from "../types";
import { query, queryOne, execute } from "./helpers";

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
  const id = crypto.randomUUID();
  const now = Date.now();
  await execute(
    "INSERT INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, name, calories, protein, carbs, fat, serving, favorite ? 1 : 0, now]
  );
  return { id, name, calories, protein, carbs, fat, serving_size: serving, is_favorite: favorite, created_at: now };
}

export async function getFoodEntries(): Promise<FoodEntry[]> {
  const rows = await query<FoodRow>("SELECT * FROM food_entries ORDER BY created_at DESC");
  return rows.map(mapFood);
}

export async function getFavoriteFoods(): Promise<FoodEntry[]> {
  const rows = await query<FoodRow>(
    "SELECT * FROM food_entries WHERE is_favorite = 1 ORDER BY name ASC"
  );
  return rows.map(mapFood);
}

export async function toggleFavorite(id: string): Promise<void> {
  await execute(
    "UPDATE food_entries SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [id]
  );
}

export async function addDailyLog(
  foodId: string,
  date: string,
  meal: Meal,
  servings: number
): Promise<DailyLog> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await execute(
    "INSERT INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, foodId, date, meal, servings, now]
  );
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
  await execute("DELETE FROM daily_log WHERE id = ?", [id]);
}

export async function getMacroTargets(): Promise<MacroTargets> {
  const row = await queryOne<MacroTargets>("SELECT * FROM macro_targets LIMIT 1");
  if (row) return row;
  const id = crypto.randomUUID();
  const now = Date.now();
  await execute(
    "INSERT INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, 2000, 150, 250, 65, ?)",
    [id, now]
  );
  return { id, calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: now };
}

export async function updateMacroTargets(
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): Promise<void> {
  const targets = await getMacroTargets();
  await execute(
    "UPDATE macro_targets SET calories = ?, protein = ?, carbs = ?, fat = ?, updated_at = ? WHERE id = ?",
    [calories, protein, carbs, fat, Date.now(), targets.id]
  );
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
