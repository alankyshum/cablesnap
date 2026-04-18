import { useCallback, useState } from "react";
import {
  addFoodEntry,
  addDailyLog,
  deleteDailyLog,
  findDuplicateFoodEntry,
  toggleFavorite,
} from "../lib/db";
import type { FoodEntry, Meal, BuiltinFood } from "../lib/types";
import type { ParsedFood } from "../lib/openfoodfacts";

type FoodLoggerOpts = {
  dateKey: string;
  meal: Meal;
  onFoodLogged: () => void;
  onSnack: (message: string, undoFn?: () => Promise<void>) => void;
  onAfterLog?: () => void;
};

export function useFoodLogger({ dateKey, meal, onFoodLogged, onSnack, onAfterLog }: FoodLoggerOpts) {
  const [saving, setSaving] = useState(false);

  const logLocalFood = useCallback(async (food: BuiltinFood, servingMult: number, favorite: boolean) => {
    setSaving(true);
    try {
      const entry = await addFoodEntry(
        food.name, food.calories, food.protein, food.carbs, food.fat,
        food.serving, favorite,
      );
      const log = await addDailyLog(entry.id, dateKey, meal, servingMult);
      onAfterLog?.();
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack, onAfterLog]);

  const logOnlineFood = useCallback(async (food: ParsedFood, servingMult: number, favorite: boolean) => {
    setSaving(true);
    try {
      const existing = await findDuplicateFoodEntry(
        food.name, food.calories, food.protein, food.carbs, food.fat,
      );
      const entry = existing ?? await addFoodEntry(
        food.name, food.calories, food.protein, food.carbs, food.fat,
        food.servingLabel, favorite,
      );
      if (existing && favorite && !existing.is_favorite) {
        await toggleFavorite(existing.id);
      }
      const log = await addDailyLog(entry.id, dateKey, meal, servingMult);
      onAfterLog?.();
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack, onAfterLog]);

  const logFavorite = useCallback(async (food: FoodEntry) => {
    setSaving(true);
    try {
      const log = await addDailyLog(food.id, dateKey, meal, 1);
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack]);

  const logManualFood = useCallback(async (
    name: string, calories: number, protein: number, carbs: number, fat: number,
    serving: string, favorite: boolean,
  ) => {
    setSaving(true);
    try {
      const entry = await addFoodEntry(name, calories, protein, carbs, fat, serving, favorite);
      const log = await addDailyLog(entry.id, dateKey, meal, 1);
      onFoodLogged();
      onSnack(`${name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
      return true;
    } catch {
      onSnack("Failed to save entry. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack]);

  return { saving, logLocalFood, logOnlineFood, logFavorite, logManualFood };
}
