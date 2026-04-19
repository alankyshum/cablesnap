import type { OFFProduct } from "./openfoodfacts";

export type ParsedFood = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingLabel: string;
  isPerServing: boolean;
};

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

const NUTRIENT_KEYS = [
  "energy-kcal_100g",
  "proteins_100g",
  "carbohydrates_100g",
  "fat_100g",
] as const;

const NUTRIENT_MAX: Record<string, number> = {
  "energy-kcal_100g": 2000,
  proteins_100g: 200,
  carbohydrates_100g: 200,
  fat_100g: 200,
};

export function isValidProduct(p: OFFProduct): boolean {
  if (!p.product_name || typeof p.product_name !== "string" || !p.product_name.trim()) {
    return false;
  }
  const n = p.nutriments;
  if (!n) return false;
  return NUTRIENT_KEYS.every((key) =>
    isFiniteInRange(n[key as keyof typeof n], 0, NUTRIENT_MAX[key])
  );
}

export function formatProductName(p: OFFProduct): string {
  const brand = p.brands?.trim();
  const name = p.product_name.trim();
  const combined = brand ? `${brand} — ${name}` : name;
  return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
}

function truncateServing(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

export function parseProduct(p: OFFProduct): ParsedFood {
  const n = p.nutriments;
  const hasServing =
    typeof p.serving_quantity === "number" &&
    p.serving_quantity > 0 &&
    typeof p.serving_size === "string" &&
    p.serving_size.trim().length > 0;

  const servingScale = hasServing ? p.serving_quantity! / 100 : 1;
  const servingLabel = hasServing
    ? truncateServing(p.serving_size!.trim(), 30)
    : "100g";

  return {
    name: formatProductName(p),
    calories: Math.round((n["energy-kcal_100g"] ?? 0) * servingScale),
    protein: Math.round((n.proteins_100g ?? 0) * servingScale * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * servingScale * 10) / 10,
    fat: Math.round((n.fat_100g ?? 0) * servingScale * 10) / 10,
    servingLabel,
    isPerServing: hasServing,
  };
}
