/**
 * Band-resistance domain module — BLD-4293.
 *
 * Pure functions. No side effects, no DB calls.
 */

import type { Equipment } from "./types";

export type Band = {
  id: string;
  label: string;
  load_kg: number | null;
  color_hint: string | null;
  created_at: number;
  deleted_at: number | null;
};

export type BandSnapshot = {
  label: string;
  load_kg: number | null;
  color_hint: string | null;
};

export function resolveSignature(bandIds: readonly string[]): string {
  if (bandIds.length === 0) return "";
  return [...bandIds].sort().join("|");
}

export function resolveNumericLoad(bands: readonly Pick<Band, "load_kg">[]): number | null {
  if (bands.length === 0) return null;
  let sum = 0;
  for (const band of bands) {
    if (band.load_kg === null || band.load_kg === undefined) return null;
    sum += band.load_kg;
  }
  return sum;
}

export function shouldShowBandPicker(equipment: Equipment): boolean {
  return equipment === "band";
}

export function validateLoadKg(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildBandDisplayLabel(
  bands: readonly Pick<Band, "label" | "load_kg">[],
): { kind: "numeric"; kg: number } | { kind: "symbolic"; label: string } | { kind: "empty" } {
  if (bands.length === 0) return { kind: "empty" };
  const load = resolveNumericLoad(bands);
  if (load !== null) {
    return { kind: "numeric", kg: load };
  }
  return { kind: "symbolic", label: bands.map((b) => b.label).join(" + ") };
}

export function buildBandSnapshot(bands: readonly Band[]): BandSnapshot[] {
  return bands.map((b) => ({
    label: b.label,
    load_kg: b.load_kg,
    color_hint: b.color_hint,
  }));
}
