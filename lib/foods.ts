import type { BuiltinFood, FoodCategory } from "./types";
import { FOOD_CATEGORIES } from "./types";

const data: BuiltinFood[] = require("../assets/data/foods.json");

export function getBuiltinFoods(): BuiltinFood[] {
  return data;
}

export function searchFoods(query: string, category?: FoodCategory | null): BuiltinFood[] {
  const q = query.toLowerCase().trim();
  return data.filter((f) => {
    if (category && f.category !== category) return false;
    if (q && !f.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function getCategories() {
  return FOOD_CATEGORIES;
}
