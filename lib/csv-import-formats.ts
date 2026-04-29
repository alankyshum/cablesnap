/**
 * CSV import format definitions for Strong, Hevy, and FitNotes.
 * Each format defines required headers, row parsing, and unit handling.
 * BLD-890
 */

// ---- Types ----

export type CsvFormat = "strong" | "hevy" | "fitnotes";

export type WeightUnit = "kg" | "lbs";

/** Normalized row from any CSV format, before exercise matching. */
export type ParsedCsvRow = {
  date: string; // raw date string from CSV
  workoutName: string;
  exerciseName: string;
  setNumber: number;
  weight: number | null; // in source unit (not yet converted)
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  notes: string;
};

export type FormatDefinition = {
  name: CsvFormat;
  label: string;
  /** Headers that must ALL be present (case-insensitive, order-independent). */
  requiredHeaders: string[];
  /** Parse a single CSV row object into a normalized ParsedCsvRow. */
  parseRow: (row: Record<string, string>) => ParsedCsvRow | null;
  /**
   * Detect weight unit from CSV headers/data.
   * Returns null if ambiguous (prompt user).
   */
  detectWeightUnit: (headers: string[]) => WeightUnit | null;
};

// ---- Helpers ----

function parseFloat_(val: string | undefined): number | null {
  if (val === undefined || val === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseInt_(val: string | undefined): number | null {
  if (val === undefined || val === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

/** Parse "1h 30m 0s" or "1:30:00" or "90" (seconds) duration formats. */
function parseDuration(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const trimmed = val.trim();

  // "Xh Ym Zs" format (Strong)
  const hmsMatch = trimmed.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const h = parseInt(hmsMatch[1] || "0", 10);
    const m = parseInt(hmsMatch[2] || "0", 10);
    const s = parseInt(hmsMatch[3] || "0", 10);
    return h * 3600 + m * 60 + s;
  }

  // "H:MM:SS" or "MM:SS" format
  const colonMatch = trimmed.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (colonMatch) {
    if (colonMatch[3]) {
      return parseInt(colonMatch[1], 10) * 3600 + parseInt(colonMatch[2], 10) * 60 + parseInt(colonMatch[3], 10);
    }
    return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  }

  // Plain number = seconds
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : Math.round(n);
}

// ---- Format: Strong ----

const STRONG_REQUIRED = ["Date", "Exercise Name", "Set Order", "Weight", "Reps"];

const strong: FormatDefinition = {
  name: "strong",
  label: "Strong",
  requiredHeaders: STRONG_REQUIRED,
  parseRow(row) {
    const exerciseName = row["Exercise Name"]?.trim();
    if (!exerciseName) return null;
    return {
      date: row["Date"] ?? "",
      workoutName: row["Workout Name"]?.trim() ?? "Imported Workout",
      exerciseName,
      setNumber: parseInt_(row["Set Order"]) ?? 1,
      weight: parseFloat_(row["Weight"]),
      reps: parseInt_(row["Reps"]),
      rpe: parseFloat_(row["RPE"]),
      durationSeconds: parseDuration(row["Duration"]),
      notes: row["Notes"]?.trim() ?? "",
    };
  },
  detectWeightUnit() {
    // Strong CSV does not include unit info — user must confirm
    return null;
  },
};

// ---- Format: Hevy ----

const HEVY_REQUIRED = ["exercise_title", "set_index", "weight_kg"];

const hevy: FormatDefinition = {
  name: "hevy",
  label: "Hevy",
  requiredHeaders: HEVY_REQUIRED,
  parseRow(row) {
    const exerciseName = row["exercise_title"]?.trim();
    if (!exerciseName) return null;
    return {
      date: row["start_time"] ?? row["date"] ?? "",
      workoutName: row["title"]?.trim() ?? "Imported Workout",
      exerciseName,
      setNumber: parseInt_(row["set_index"]) ?? 1,
      weight: parseFloat_(row["weight_kg"]),
      reps: parseInt_(row["reps"]),
      rpe: parseFloat_(row["rpe"]),
      durationSeconds: parseInt_(row["duration_seconds"]),
      notes: row["description_workout"]?.trim() ?? row["notes"]?.trim() ?? "",
    };
  },
  detectWeightUnit() {
    // Hevy always exports in kg (column name confirms)
    return "kg";
  },
};

// ---- Format: FitNotes ----

const FITNOTES_REQUIRED = ["Exercise", "Reps"];

const fitnotes: FormatDefinition = {
  name: "fitnotes",
  label: "FitNotes",
  requiredHeaders: FITNOTES_REQUIRED,
  parseRow(row) {
    const exerciseName = row["Exercise"]?.trim();
    if (!exerciseName) return null;
    // FitNotes uses "Weight (kgs)" or "Weight (lbs)" column names
    const weightKg = parseFloat_(row["Weight (kgs)"]);
    const weightLbs = parseFloat_(row["Weight (lbs)"]);
    const weight = weightKg ?? weightLbs ?? parseFloat_(row["Weight"]);
    return {
      date: row["Date"] ?? "",
      workoutName: "FitNotes Workout",
      exerciseName,
      setNumber: parseInt_(row["Set Order"]) ?? 1,
      weight,
      reps: parseInt_(row["Reps"]),
      rpe: null, // FitNotes doesn't export RPE
      durationSeconds: parseDuration(row["Duration"]),
      notes: row["Comment"]?.trim() ?? "",
    };
  },
  detectWeightUnit(headers) {
    const lower = headers.map((h) => h.toLowerCase());
    if (lower.some((h) => h.includes("(kgs)") || h.includes("(kg)"))) return "kg";
    if (lower.some((h) => h.includes("(lbs)") || h.includes("(lb)"))) return "lbs";
    return null; // Ambiguous — prompt user
  },
};

// ---- Registry ----

export const CSV_FORMATS: FormatDefinition[] = [strong, hevy, fitnotes];

/**
 * Detect which CSV format matches the given headers.
 * Uses subset matching (all required headers must be present, order-independent).
 */
export function detectFormat(headers: string[]): FormatDefinition | null {
  const normalizedHeaders = headers.map((h) => h.trim());
  for (const format of CSV_FORMATS) {
    const allPresent = format.requiredHeaders.every((req) =>
      normalizedHeaders.some((h) => h.toLowerCase() === req.toLowerCase())
    );
    if (allPresent) return format;
  }
  return null;
}
