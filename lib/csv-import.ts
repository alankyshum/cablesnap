/**
 * CSV import pipeline — parse competitor and CableSnap workout CSV files into normalized sessions.
 * BLD-890
 */
import Papa from "papaparse";
import { detectFormat, type CsvFormat, type FormatDefinition, type ParsedCsvRow, type WeightUnit } from "./csv-import-formats";

// ---- Types ----

export type ImportedSet = {
  exerciseRawName: string;
  matchedExerciseId: string | null;
  matchConfidence: "high" | "medium" | "low" | null;
  weight: number | null; // in kg after conversion
  reps: number | null;
  setNumber: number;
  rpe: number | null;
  durationSeconds: number | null;
  notes: string;
  /** Set type from source CSV (CableSnap format). Coerced to valid SetType at DB insertion. */
  set_type?: string | null;
  /** BLD-1176: mini-set segment data (CableSnap advanced-set round-trip). Clamped to 8 segments at import. */
  mini_set_reps?: string | null;
  mini_set_weights?: string | null;
  mini_set_rests?: string | null;
};

export type ImportedSession = {
  date: number; // ms timestamp
  name: string;
  durationSeconds: number | null;
  sets: ImportedSet[];
  /** BLD-1089: optional session subtype for CableSnap CSV re-imports. */
  kind?: string | null;
  day_session_exercise_id?: string | null;
  day_session_date?: string | null;
};

export type CsvParseResult = {
  format: CsvFormat;
  formatLabel: string;
  sessions: ImportedSession[];
  detectedUnit: WeightUnit | null;
  skippedRows: number;
  totalRows: number;
  uniqueExercises: string[];
};

export type CsvParseError = {
  type: "empty_file" | "no_data" | "unrecognized_format" | "parse_error";
  message: string;
};

/** Maximum mini-set segments per set (BLD-1168 §Performance). */
const MAX_SEGMENTS = 8;

/** Clamp mini-set column strings to at most MAX_SEGMENTS segments. */
function clampMiniSetColumn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(";");
  if (parts.length <= MAX_SEGMENTS) return raw;
  return parts.slice(0, MAX_SEGMENTS).join(";");
}

// ---- Constants ----

const LBS_TO_KG = 0.45359237;

// ---- Date parsing ----

/**
 * Parse various date formats found in competitor CSVs.
 * Supports: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY (auto-detect),
 * ISO 8601 with time, Strong's "2024-01-15 08:30:00" format.
 */
function parseDate(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const trimmed = raw.trim();

  // Try ISO/standard parse first
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.getTime();

  // Try DD/MM/YYYY (European format) — if month > 12, it's definitely DD/MM
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    // If first number > 12, it must be DD/MM/YYYY
    if (a > 12) {
      const d2 = new Date(year, b - 1, a);
      if (!isNaN(d2.getTime())) return d2.getTime();
    }
    // Default: MM/DD/YYYY (US format)
    const d3 = new Date(year, a - 1, b);
    if (!isNaN(d3.getTime())) return d3.getTime();
  }

  return null;
}

// ---- Main parse function ----

/**
 * Parse a CSV string from a competitor app export.
 * Returns structured sessions or an error.
 */
export function parseCsvExport(
  csvContent: string,
): CsvParseResult | CsvParseError {
  if (!csvContent || csvContent.trim() === "") {
    return { type: "empty_file", message: "This file contains no data." };
  }

  // Parse CSV with papaparse
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (!parsed.data || parsed.data.length === 0) {
    return { type: "no_data", message: "No workout data found. Make sure you exported your workout history, not just settings." };
  }

  const headers = parsed.meta.fields ?? [];
  const format = detectFormat(headers);
  if (!format) {
    return {
      type: "unrecognized_format",
      message: `Unrecognized CSV format. Expected headers from Strong, Hevy, or FitNotes.`,
    };
  }

  return parseWithFormat(parsed.data, format, headers);
}

function buildSession({
  date,
  name,
  rows: sessionRows,
}: {
  date: number;
  name: string;
  rows: ParsedCsvRow[];
}): ImportedSession {
  const durations = sessionRows.map((r) => r.durationSeconds).filter((d): d is number => d !== null);
  const durationSeconds = durations.length > 0 ? Math.max(...durations) : null;
  const sets: ImportedSet[] = sessionRows.map((row) => ({
    exerciseRawName: row.exerciseName,
    matchedExerciseId: null,
    matchConfidence: null,
    weight: row.weight !== null ? Math.max(0, row.weight) : null,
    reps: row.reps !== null ? Math.max(0, row.reps) : null,
    setNumber: row.setNumber,
    rpe: row.rpe,
    durationSeconds: row.durationSeconds,
    notes: row.notes,
    set_type: row.set_type ?? null,
      mini_set_reps: clampMiniSetColumn(row.mini_set_reps),
      mini_set_weights: clampMiniSetColumn(row.mini_set_weights),
      mini_set_rests: clampMiniSetColumn(row.mini_set_rests),
  }));
  const firstRow = sessionRows[0];
  return {
    date,
    name,
    durationSeconds,
    sets,
    kind: firstRow?.kind ?? "workout",
    day_session_exercise_id: firstRow?.daySessionExerciseId ?? null,
    day_session_date: firstRow?.daySessionDate ?? null,
  };
}

function parseWithFormat(
  rows: Record<string, string>[],
  format: FormatDefinition,
  headers: string[],
): CsvParseResult {
  const detectedUnit = format.detectWeightUnit(headers);
  let skippedRows = 0;
  const parsedRows: ParsedCsvRow[] = [];

  for (const row of rows) {
    const parsed = format.parseRow(row);
    if (parsed) {
      parsedRows.push(parsed);
    } else {
      skippedRows++;
    }
  }

  // Group rows into sessions by date + workout name + optional GTG metadata.
  const sessionMap = new Map<string, { date: number; name: string; rows: ParsedCsvRow[] }>();

  for (const row of parsedRows) {
    const dateMs = parseDate(row.date);
    if (dateMs === null) {
      skippedRows++;
      continue;
    }
    const dayKey = new Date(dateMs).toISOString().split("T")[0];
    const key = [
      dayKey,
      row.workoutName,
      row.kind ?? "workout",
      row.daySessionExerciseId ?? "",
      row.daySessionDate ?? "",
    ].join("|");
    const existing = sessionMap.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      sessionMap.set(key, { date: dateMs, name: row.workoutName, rows: [row] });
    }
  }

  // Convert grouped rows to ImportedSessions
  const sessions: ImportedSession[] = Array.from(sessionMap.values()).map(buildSession);

  // Sort sessions by date
  sessions.sort((a, b) => a.date - b.date);

  // Collect unique exercise names (case-insensitive dedup)
  const exerciseSet = new Set<string>();
  const uniqueExercises: string[] = [];
  for (const row of parsedRows) {
    const lower = row.exerciseName.toLowerCase();
    if (!exerciseSet.has(lower)) {
      exerciseSet.add(lower);
      uniqueExercises.push(row.exerciseName);
    }
  }

  return {
    format: format.name,
    formatLabel: format.label,
    sessions,
    detectedUnit,
    skippedRows,
    totalRows: rows.length,
    uniqueExercises,
  };
}

/**
 * Convert weights in imported sessions based on user-confirmed unit.
 * If unit is "lbs", converts all weights to kg. If "kg", no-op.
 */
export function convertWeights(
  sessions: ImportedSession[],
  sourceUnit: WeightUnit,
): ImportedSession[] {
  if (sourceUnit === "kg") return sessions;
  return sessions.map((session) => ({
    ...session,
    sets: session.sets.map((set) => ({
      ...set,
      weight: set.weight !== null ? Math.round(set.weight * LBS_TO_KG * 100) / 100 : null,
    })),
  }));
}
