import { useState } from "react";
import { LayoutAnimation } from "react-native";
import { getFavoriteFoods } from "../lib/db";
import type { FoodEntry } from "../lib/types";

export function useManualFoodForm(
  onSave: (name: string, cal: number, pro: number, carbs: number, fat: number, serving: string, fav: boolean) => Promise<boolean>,
  onFavoritesChanged: (favs: FoodEntry[]) => void,
) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [favorite, setFavorite] = useState(false);

  const reset = () => { setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat(""); setServing("1 serving"); setFavorite(false); };

  const handleSave = async () => {
    if (!name.trim()) return;
    const ok = await onSave(name.trim(), Math.max(0, parseFloat(calories) || 0), Math.max(0, parseFloat(protein) || 0), Math.max(0, parseFloat(carbs) || 0), Math.max(0, parseFloat(fat) || 0), serving.trim() || "1 serving", favorite);
    if (ok) { reset(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded(false); getFavoriteFoods().then(onFavoritesChanged).catch(() => {}); }
  };

  const toggle = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); if (expanded) reset(); setExpanded((v) => !v); };

  return { expanded, name, setName, calories, setCalories, protein, setProtein, carbs, setCarbs, fat, setFat, serving, setServing, favorite, setFavorite, handleSave, toggle };
}
