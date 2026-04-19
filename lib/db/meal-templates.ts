import type { Meal, MealTemplate, MealTemplateItem } from "../types";
import { uuid } from "../uuid";
import { query, queryOne, getDatabase, getDrizzle } from "./helpers";
import { mealTemplates, foodEntries } from "./schema";
import { desc, eq } from "drizzle-orm";
import type { MealTemplateRow as SchemaMealTemplateRow } from "./schema";

type MealTemplateRow = SchemaMealTemplateRow;

type MealTemplateItemRow = {
  id: string;
  template_id: string;
  food_entry_id: string;
  servings: number;
  sort_order: number;
  food_name: string | null;
  food_calories: number | null;
  food_protein: number | null;
  food_carbs: number | null;
  food_fat: number | null;
  food_serving_size: string | null;
  food_is_favorite: number | null;
  food_created_at: number | null;
};

function mapTemplate(row: MealTemplateRow): MealTemplate {
  return { ...row, meal: row.meal as Meal };
}

function mapItem(row: MealTemplateItemRow): MealTemplateItem {
  const item: MealTemplateItem = {
    id: row.id,
    template_id: row.template_id,
    food_entry_id: row.food_entry_id,
    servings: row.servings,
    sort_order: row.sort_order,
  };
  if (row.food_name != null) {
    item.food = {
      id: row.food_entry_id,
      name: row.food_name,
      calories: row.food_calories ?? 0,
      protein: row.food_protein ?? 0,
      carbs: row.food_carbs ?? 0,
      fat: row.food_fat ?? 0,
      serving_size: row.food_serving_size ?? "1 serving",
      is_favorite: row.food_is_favorite === 1,
      created_at: row.food_created_at ?? 0,
    };
  }
  return item;
}

export type CreateMealTemplateInput = {
  name: string;
  meal: Meal;
  items: Array<{ food_entry_id: string; servings: number }>;
};

export async function createMealTemplate(
  input: CreateMealTemplateInput
): Promise<MealTemplate> {
  const database = await getDatabase();
  const templateId = uuid();
  const now = Date.now();

  // Compute cached macros from food_entries
  const macros = await computeMacros(input.items);

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO meal_templates (id, name, meal, cached_calories, cached_protein, cached_carbs, cached_fat, last_used_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [templateId, input.name, input.meal, macros.calories, macros.protein, macros.carbs, macros.fat, now, now]
    );
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      await database.runAsync(
        `INSERT INTO meal_template_items (id, template_id, food_entry_id, servings, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), templateId, item.food_entry_id, item.servings, i]
      );
    }
  });

  return {
    id: templateId,
    name: input.name,
    meal: input.meal,
    cached_calories: macros.calories,
    cached_protein: macros.protein,
    cached_carbs: macros.carbs,
    cached_fat: macros.fat,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getMealTemplates(): Promise<MealTemplate[]> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(mealTemplates)
    .orderBy(desc(mealTemplates.last_used_at), desc(mealTemplates.created_at));
  return (rows as unknown as MealTemplateRow[]).map(mapTemplate);
}

export async function getMealTemplateById(id: string): Promise<MealTemplate | null> {
  const row = await queryOne<MealTemplateRow>(
    "SELECT * FROM meal_templates WHERE id = ?",
    [id]
  );
  if (!row) return null;

  const itemRows = await query<MealTemplateItemRow>(
    `SELECT mti.*, f.name AS food_name, f.calories AS food_calories,
            f.protein AS food_protein, f.carbs AS food_carbs, f.fat AS food_fat,
            f.serving_size AS food_serving_size, f.is_favorite AS food_is_favorite,
            f.created_at AS food_created_at
     FROM meal_template_items mti
     LEFT JOIN food_entries f ON mti.food_entry_id = f.id
     WHERE mti.template_id = ?
     ORDER BY mti.sort_order ASC`,
    [id]
  );

  const template = mapTemplate(row);
  template.items = itemRows.map(mapItem);
  return template;
}

export type UpdateMealTemplateInput = {
  name: string;
  meal: Meal;
  items: Array<{ food_entry_id: string; servings: number }>;
};

export async function updateMealTemplate(
  id: string,
  input: UpdateMealTemplateInput
): Promise<void> {
  const database = await getDatabase();
  const now = Date.now();
  const macros = await computeMacros(input.items);

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `UPDATE meal_templates SET name = ?, meal = ?,
       cached_calories = ?, cached_protein = ?, cached_carbs = ?, cached_fat = ?,
       updated_at = ? WHERE id = ?`,
      [input.name, input.meal, macros.calories, macros.protein, macros.carbs, macros.fat, now, id]
    );
    // Delete old items and re-insert
    await database.runAsync(
      "DELETE FROM meal_template_items WHERE template_id = ?",
      [id]
    );
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      await database.runAsync(
        `INSERT INTO meal_template_items (id, template_id, food_entry_id, servings, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), id, item.food_entry_id, item.servings, i]
      );
    }
  });
}

export async function deleteMealTemplate(id: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "DELETE FROM meal_template_items WHERE template_id = ?",
      [id]
    );
    await database.runAsync(
      "DELETE FROM meal_templates WHERE id = ?",
      [id]
    );
  });
}

export type LogFromTemplateResult = {
  logIds: string[];
  meal: Meal;
};

export async function logFromTemplate(
  templateId: string,
  date: string
): Promise<LogFromTemplateResult> {
  const database = await getDatabase();

  // LEFT JOIN to skip missing food_entries
  const items = await database.getAllAsync<{
    food_entry_id: string;
    servings: number;
    food_id: string | null;
  }>(
    `SELECT mti.food_entry_id, mti.servings, f.id AS food_id
     FROM meal_template_items mti
     LEFT JOIN food_entries f ON mti.food_entry_id = f.id
     WHERE mti.template_id = ?
     ORDER BY mti.sort_order ASC`,
    [templateId]
  );

  const template = await queryOne<{ meal: string }>(
    "SELECT meal FROM meal_templates WHERE id = ?",
    [templateId]
  );
  if (!template) throw new Error("Template not found");

  const meal = template.meal as Meal;
  const logIds: string[] = [];
  const now = Date.now();

  await database.withTransactionAsync(async () => {
    for (const item of items) {
      // Skip missing food entries (LEFT JOIN null check)
      if (item.food_id == null) continue;

      const logId = uuid();
      await database.runAsync(
        `INSERT INTO daily_log (id, food_entry_id, date, meal, servings, logged_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [logId, item.food_entry_id, date, meal, item.servings, now]
      );
      logIds.push(logId);
    }

    // Update last_used_at
    await database.runAsync(
      "UPDATE meal_templates SET last_used_at = ? WHERE id = ?",
      [now, templateId]
    );
  });

  return { logIds, meal };
}

export async function undoLogFromTemplate(logIds: string[]): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const id of logIds) {
      await database.runAsync("DELETE FROM daily_log WHERE id = ?", [id]);
    }
  });
}

async function computeMacros(
  items: Array<{ food_entry_id: string; servings: number }>
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  const db = await getDrizzle();
  for (const item of items) {
    const food = await db.select({
      calories: foodEntries.calories,
      protein: foodEntries.protein,
      carbs: foodEntries.carbs,
      fat: foodEntries.fat,
    })
      .from(foodEntries)
      .where(eq(foodEntries.id, item.food_entry_id))
      .get();
    if (food) {
      calories += food.calories * item.servings;
      protein += food.protein * item.servings;
      carbs += food.carbs * item.servings;
      fat += food.fat * item.servings;
    }
  }

  return { calories, protein, carbs, fat };
}
