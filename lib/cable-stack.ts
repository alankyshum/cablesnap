/**
 * Pure domain helpers for cable stack calibration.
 * BLD-1059: Per-Gym Cable Stack Calibration.
 *
 * All functions are side-effect-free (no DB calls); DB reads are done by
 * callers who pass calibration rows as arguments.
 */
import type { StackCalibrationRow } from "./db/schema";

export type ResolveMarkerResult = { weight: number; unit: string };

/**
 * Resolves a stack marker number to its true weight using the provided
 * calibration rows. Returns null if no calibration row exists for the marker.
 */
export function resolveMarker(
  calibrations: StackCalibrationRow[],
  marker: number
): ResolveMarkerResult | null {
  const row = calibrations.find((c) => c.marker === marker);
  if (!row) return null;
  return { weight: row.true_weight, unit: "" };
}

// ── Bulk Paste Parser ─────────────────────────────────────────────────────────

export type ParsedCalibrationRow = { marker: number; trueWeight: number };
export type SkipReason =
  | "non_numeric_marker"
  | "non_numeric_weight"
  | "marker_must_be_positive"
  | "weight_must_be_positive"
  | "duplicate_marker";

export type SkippedRow = { raw: string; reason: SkipReason };

export type BulkParseResult = {
  accepted: ParsedCalibrationRow[];
  skipped: SkippedRow[];
};

/**
 * Parses a bulk-paste string of "marker=weight" rows (newline or comma
 * separated).
 */
export function parseCalibrationBulkPaste(input: string): BulkParseResult {
  const skipped: SkippedRow[] = [];
  const acceptedMap = new Map<number, { row: ParsedCalibrationRow; rawIndex: number }>();
  const rawLines: string[] = [];

  if (!input.trim()) {
    return { accepted: [], skipped: [] };
  }

  const lines = input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const raw of lines) {
    rawLines.push(raw);
    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) {
      skipped.push({ raw, reason: "non_numeric_marker" });
      continue;
    }
    const markerStr = raw.slice(0, eqIdx).trim();
    const weightStr = raw.slice(eqIdx + 1).trim();

    const markerNum = Number(markerStr);
    if (!markerStr || Number.isNaN(markerNum) || !Number.isFinite(markerNum) || !Number.isInteger(markerNum)) {
      skipped.push({ raw, reason: "non_numeric_marker" });
      continue;
    }
    if (markerNum <= 0) {
      skipped.push({ raw, reason: "marker_must_be_positive" });
      continue;
    }

    const weightNum = Number(weightStr);
    if (!weightStr || Number.isNaN(weightNum) || !Number.isFinite(weightNum)) {
      skipped.push({ raw, reason: "non_numeric_weight" });
      continue;
    }
    if (weightNum <= 0) {
      skipped.push({ raw, reason: "weight_must_be_positive" });
      continue;
    }

    const marker = Math.round(markerNum);
    const existing = acceptedMap.get(marker);
    if (existing) {
      skipped.push({ raw: rawLines[existing.rawIndex] ?? raw, reason: "duplicate_marker" });
    }
    acceptedMap.set(marker, {
      row: { marker, trueWeight: weightNum },
      rawIndex: rawLines.length - 1,
    });
  }

  const accepted: ParsedCalibrationRow[] = Array.from(acceptedMap.values())
    .sort((a, b) => a.row.marker - b.row.marker)
    .map((value) => value.row);

  return { accepted, skipped };
}

// ── Generative Stack Definitions (BLD-3816) ───────────────────────────────────

export type GenerateCalibrationParams = {
  startWeight: number;
  increment: number;
  count: number;
};

export type GeneratedCalibration = {
  marker: number;
  trueWeight: number;
};

export type GenerateCalibrationError =
  | "count_must_be_positive"
  | "increment_must_be_nonzero"
  | "start_weight_must_be_positive";

export type GenerateCalibrationResult =
  | { ok: true; calibrations: GeneratedCalibration[] }
  | { ok: false; error: GenerateCalibrationError };

/**
 * Pure generator for cable stack calibrations.
 * Returns markers 1..count with trueWeight = startWeight + (marker-1)*increment.
 * Markers are integer-indexed. startWeight and increment may be REAL (e.g. 2.5kg).
 * No side-effects — callers are responsible for DB writes.
 */
export function generateCalibrations(
  params: GenerateCalibrationParams
): GenerateCalibrationResult {
  const { startWeight, increment, count } = params;

  if (!Number.isFinite(startWeight) || startWeight <= 0) {
    return { ok: false, error: "start_weight_must_be_positive" };
  }
  if (!Number.isFinite(increment) || increment === 0) {
    return { ok: false, error: "increment_must_be_nonzero" };
  }
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, error: "count_must_be_positive" };
  }

  const calibrations: GeneratedCalibration[] = [];
  for (let i = 1; i <= count; i++) {
    calibrations.push({
      marker: i,
      trueWeight: startWeight + (i - 1) * increment,
    });
  }
  return { ok: true, calibrations };
}

// ── Bulk Paste Parser ─────────────────────────────────────────────────────────

/**
 * Builds a human-readable toast message for a bulk-paste result.
 */
export function buildBulkPasteToast(result: BulkParseResult): string {
  const n = result.accepted.length;
  const m = result.skipped.length;
  if (n === 0 && m === 0) return "";
  if (n === 0) return `No valid rows. ${m} skipped.`;
  if (m === 0) return `Added ${n} marker${n === 1 ? "" : "s"}.`;
  return `Added ${n} marker${n === 1 ? "" : "s"}. ${m} row${m === 1 ? "" : "s"} skipped.`;
}
