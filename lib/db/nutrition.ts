import { eq, and, desc, asc, sql } from "drizzle-orm";
import type { FoodEntry, DailyLog, MacroTargets, Meal } from "../types";
import { uuid } from "../uuid";
import { getDrizzle } from "./helpers";
import { foodEntries, dailyLog, macroTargets } from "./schema";
import type { FoodEntryRow } from "./schema";

type FoodRow = FoodEntryRow;

function mapFood(row: FoodRow): FoodEntry {
  return {
    ...row,
    is_favorite: row.is_favorite === 1,
  };
}

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
  const db = await getDrizzle();
  const rows = await db.select({
    id: dailyLog.id,
    food_entry_id: dailyLog.food_entry_id,
    date: dailyLog.date,
    meal: dailyLog.meal,
    servings: dailyLog.servings,
    logged_at: dailyLog.logged_at,
    food_name: foodEntries.name,
    food_calories: foodEntries.calories,
    food_protein: foodEntries.protein,
    food_carbs: foodEntries.carbs,
    food_fat: foodEntries.fat,
    food_serving_size: foodEntries.serving_size,
    food_is_favorite: foodEntries.is_favorite,
    food_created_at: foodEntries.created_at,
  })
    .from(dailyLog)
    .innerJoin(foodEntries, eq(dailyLog.food_entry_id, foodEntries.id))
    .where(eq(dailyLog.date, date))
    .orderBy(asc(dailyLog.logged_at));

  return rows.map((r) => ({
    id: r.id,
    food_entry_id: r.food_entry_id,
    date: r.date,
    meal: r.meal as Meal,
    servings: r.servings ?? 1,
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
  const db = await getDrizzle();
  const row = await db.select()
    .from(foodEntries)
    .where(and(
      sql`LOWER(${foodEntries.name}) = LOWER(${name})`,
      eq(foodEntries.calories, calories),
      eq(foodEntries.protein, protein),
      eq(foodEntries.carbs, carbs),
      eq(foodEntries.fat, fat),
    ))
    .limit(1)
    .get();
  return row ? mapFood(row as unknown as FoodRow) : null;
}

export async function getDailySummary(
  date: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  const db = await getDrizzle();
  const row = await db.select({
    calories: sql<number>`SUM(${foodEntries.calories} * ${dailyLog.servings})`,
    protein: sql<number>`SUM(${foodEntries.protein} * ${dailyLog.servings})`,
    carbs: sql<number>`SUM(${foodEntries.carbs} * ${dailyLog.servings})`,
    fat: sql<number>`SUM(${foodEntries.fat} * ${dailyLog.servings})`,
  })
    .from(dailyLog)
    .innerJoin(foodEntries, eq(dailyLog.food_entry_id, foodEntries.id))
    .where(eq(dailyLog.date, date))
    .get();
  return {
    calories: row?.calories ?? 0,
    protein: row?.protein ?? 0,
    carbs: row?.carbs ?? 0,
    fat: row?.fat ?? 0,
  };
}
