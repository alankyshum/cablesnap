export const KG_TO_LB = 2.20462;
export const LB_TO_KG = 0.453592;
export const CM_TO_IN = 0.393701;
export const IN_TO_CM = 2.54;

export function toDisplay(kg: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? Math.round(kg * KG_TO_LB * 10) / 10 : Math.round(kg * 10) / 10;
}

export function toKg(val: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? val * LB_TO_KG : val;
}
