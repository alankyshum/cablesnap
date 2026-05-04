// BLD-1060: Per-gym cable stack calibration — pure domain helpers.
// No DB access — callers pass data; these functions are pure and unit-testable.

export type CalibrationRow = { marker: number; true_weight: number };

export type BulkPasteSkipReason =
  | "non_numeric_weight"
  | "non_numeric_marker"
  | "marker_must_be_positive"
  | "weight_must_be_positive"
  | "duplicate_marker";

export type BulkPasteResult = {
  accepted: CalibrationRow[];
  skipped: Array<{ input: string; reason: BulkPasteSkipReason }>;
};

export function parseCalibrationBulkPaste(input: string): BulkPasteResult {
  if (!input || input.trim() === "") {
    return { accepted: [], skipped: [] };
  }

  const lines = input
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const acceptedMap = new Map<number, { row: CalibrationRow; inputStr: string }>();
  const skipped: BulkPasteResult["skipped"] = [];

  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) {
      skipped.push({ input: line, reason: "non_numeric_marker" });
      continue;
    }

    const markerStr = line.slice(0, eqIdx).trim();
    const weightStr = line.slice(eqIdx + 1).trim();

    const markerNum = Number(markerStr);
    if (!markerStr || Number.isNaN(markerNum) || !Number.isInteger(markerNum)) {
      skipped.push({ input: line, reason: "non_numeric_marker" });
      continue;
    }
    if (markerNum <= 0) {
      skipped.push({ input: line, reason: "marker_must_be_positive" });
      continue;
    }

    const weightNum = Number(weightStr);
    if (!weightStr || Number.isNaN(weightNum)) {
      skipped.push({ input: line, reason: "non_numeric_weight" });
      continue;
    }
    if (weightNum <= 0) {
      skipped.push({ input: line, reason: "weight_must_be_positive" });
      continue;
    }

    if (acceptedMap.has(markerNum)) {
      const prev = acceptedMap.get(markerNum)!;
      skipped.push({ input: prev.inputStr, reason: "duplicate_marker" });
    }

    acceptedMap.set(markerNum, {
      row: { marker: markerNum, true_weight: weightNum },
      inputStr: line,
    });
  }

  return {
    accepted: Array.from(acceptedMap.values()).map((value) => value.row),
    skipped,
  };
}

export function buildBulkPasteToast(result: BulkPasteResult): string {
  const acceptedCount = result.accepted.length;
  const skippedCount = result.skipped.length;

  if (acceptedCount === 0 && skippedCount === 0) return "";
  if (acceptedCount === 0) return `No valid rows. ${skippedCount} skipped.`;
  if (skippedCount === 0) return `Added ${acceptedCount} marker${acceptedCount === 1 ? "" : "s"}.`;
  return `Added ${acceptedCount} marker${acceptedCount === 1 ? "" : "s"}. ${skippedCount} row${skippedCount === 1 ? "" : "s"} skipped.`;
}

export function formatMarkerBadge(marker: number, weight: number, unit: string): string {
  return `📍 #${marker} · ${weight} ${unit}`;
}
