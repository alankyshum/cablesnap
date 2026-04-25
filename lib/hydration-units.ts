/**
 * Hydration unit conversions (BLD-600).
 *
 * Canonical storage is milliliters (ml). Display can be ml or fluid ounces (fl_oz).
 * Single source of truth for the per-entry cap so UI sheet + tests share it.
 */

export const ML_PER_FL_OZ = 29.5735;

/** Hard cap for a single water-log entry (prevents fat-finger). */
export const MAX_SINGLE_ENTRY_ML = 5000;

export type HydrationUnit = "ml" | "fl_oz";

export function mlToOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

export function ozToMl(oz: number): number {
  return oz * ML_PER_FL_OZ;
}

/**
 * Format a volume stored in ml for display in the requested unit.
 * - ml: integer rounding (no decimal)
 * - fl_oz: one decimal where useful, else integer
 */
export function formatVolume(ml: number, unit: HydrationUnit): string {
  if (unit === "ml") {
    return `${Math.round(ml).toLocaleString()} ml`;
  }
  const oz = mlToOz(ml);
  // Show a decimal when the value is not effectively integer (within 0.05).
  const isInt = Math.abs(oz - Math.round(oz)) < 0.05;
  return `${isInt ? Math.round(oz) : oz.toFixed(1)} fl oz`;
}

/** Format the "<total> / <goal> {unit}" header readout. */
export function formatTotalOverGoal(
  totalMl: number,
  goalMl: number,
  unit: HydrationUnit,
): string {
  if (unit === "ml") {
    return `${Math.round(totalMl).toLocaleString()} / ${Math.round(goalMl).toLocaleString()} ml`;
  }
  const tOz = mlToOz(totalMl);
  const gOz = mlToOz(goalMl);
  const fmt = (v: number) => {
    const isInt = Math.abs(v - Math.round(v)) < 0.05;
    return isInt ? String(Math.round(v)) : v.toFixed(1);
  };
  return `${fmt(tOz)} / ${fmt(gOz)} fl oz`;
}
