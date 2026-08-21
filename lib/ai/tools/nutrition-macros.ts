import { tool } from "ai";
import { z } from "zod";
import { getDailyNutritionTotals } from "../../db/nutrition-progress";
import { recoverLocal } from "./result";

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Sends date and daily calorie/protein/carbohydrate/fat totals; food names and entries never leave the device. */
export const nutritionMacrosTool = tool({
  description: "Read recent daily nutrition macro totals from the local food log.",
  inputSchema: z.object({
    days: z.number().int().min(1).max(14).default(7),
  }),
  execute: ({ days }) => recoverLocal(async () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    return getDailyNutritionTotals(dateKey(start), dateKey(end));
  }),
});
