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

export function convertWeight(
  val: number,
  from: "kg" | "lb",
  to: "kg" | "lb",
): number {
  if (from === to) return Math.round(val * 10) / 10;
  const kg = from === "lb" ? val * LB_TO_KG : val;
  const out = to === "lb" ? kg * KG_TO_LB : kg;
  return Math.round(out * 10) / 10;
}

export function convertHeight(
  val: number,
  from: "cm" | "in",
  to: "cm" | "in",
): number {
  if (from === to) return Math.round(val * 10) / 10;
  const cm = from === "in" ? val * IN_TO_CM : val;
  const out = to === "in" ? cm * CM_TO_IN : cm;
  return Math.round(out * 10) / 10;
}
