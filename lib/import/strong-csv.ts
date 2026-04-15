import { uuid } from "../uuid";

// ---- Types ----

export type ParsedStrongRow = {
  date: string;
  workoutName: string;
  exerciseName: string;
  setOrder: number;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  seconds: number | null;
  notes: string;
  workoutNotes: string;
  rpe: number | null;
};

export type StrongSession = {
  key: string;
  date: string;
  workoutName: string;
  workoutNotes: string;
  sets: ParsedStrongRow[];
};

export type ImportResult = {
  sessionsImported: number;
  exercisesCreated: number;
  setsImported: number;
  skippedTimed: number;
  skippedDistance: number;
  parseErrors: number;
  dateRange: { earliest: string; latest: string } | null;
  duplicateSessions: string[];
};

export type ParseError = {
  row: number;
  reason: string;
};

export type ParseResult = {
  rows: ParsedStrongRow[];
  sessions: StrongSession[];
  exerciseNames: string[];
  errors: ParseError[];
};

// Expected Strong CSV column headers (case-insensitive)
const EXPECTED_HEADERS = [
  "date",
  "workout name",
  "exercise name",
  "set order",
  "weight",
  "reps",
  "distance",
  "seconds",
  "notes",
  "workout notes",
];

/**
 * Parse a single CSV line, handling quoted fields with embedded commas/newlines.
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Strip UTF-8 BOM from the beginning of content.
 */
function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

/**
 * Validate that the CSV header row matches expected Strong CSV format.
 */
export function validateHeaders(headerLine: string): {
  valid: boolean;
  headerMap: Record<string, number>;
  hasRPE: boolean;
  error?: string;
} {
  const fields = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());

  const headerMap: Record<string, number> = {};
  for (let i = 0; i < fields.length; i++) {
    headerMap[fields[i]] = i;
  }

  const missing = EXPECTED_HEADERS.filter((h) => !(h in headerMap));
  if (missing.length > 0) {
    return {
      valid: false,
      headerMap,
      hasRPE: false,
      error: `This doesn't look like a Strong export. Missing columns: ${missing.join(", ")}`,
    };
  }

  return {
    valid: true,
    headerMap,
    hasRPE: "rpe" in headerMap,
  };
}

/**
 * Parse a date string from Strong CSV format (YYYY-MM-DD HH:MM:SS).
 * Returns epoch milliseconds or null if invalid.
 */
export function parseStrongDate(dateStr: string): number | null {
  if (!dateStr || dateStr.trim() === "") return null;

  // Use replace(' ', 'T') for reliable ISO 8601 parsing per tech lead review
  const isoStr = dateStr.trim().replace(" ", "T");
  const ts = new Date(isoStr).getTime();

  if (isNaN(ts)) return null;

  // Reject dates outside reasonable range (1970–2100)
  const year = new Date(ts).getFullYear();
  if (year < 1970 || year > 2100) return null;

  return ts;
}

/**
 * Parse the full CSV content into structured rows and sessions.
 */
export function parseStrongCSV(content: string): ParseResult {
  const cleaned = stripBOM(content);
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], sessions: [], exerciseNames: [], errors: [{ row: 0, reason: "Empty file" }] };
  }

  const headerValidation = validateHeaders(lines[0]);
  if (!headerValidation.valid) {
    return {
      rows: [],
      sessions: [],
      exerciseNames: [],
      errors: [{ row: 1, reason: headerValidation.error! }],
    };
  }

  const { headerMap, hasRPE } = headerValidation;
  const rows: ParsedStrongRow[] = [];
  const errors: ParseError[] = [];
  const exerciseNameSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const rowNum = i + 1;

    try {
      const dateStr = fields[headerMap["date"]]?.trim() ?? "";
      const workoutName = fields[headerMap["workout name"]]?.trim() ?? "";
      const exerciseName = fields[headerMap["exercise name"]]?.trim() ?? "";
      const setOrderStr = fields[headerMap["set order"]]?.trim() ?? "";
      const weightStr = fields[headerMap["weight"]]?.trim() ?? "";
      const repsStr = fields[headerMap["reps"]]?.trim() ?? "";
      const distanceStr = fields[headerMap["distance"]]?.trim() ?? "";
      const secondsStr = fields[headerMap["seconds"]]?.trim() ?? "";
      const notes = fields[headerMap["notes"]]?.trim() ?? "";
      const workoutNotes = fields[headerMap["workout notes"]]?.trim() ?? "";
      const rpeStr = hasRPE ? (fields[headerMap["rpe"]]?.trim() ?? "") : "";

      // Validate date
      if (parseStrongDate(dateStr) === null) {
        errors.push({ row: rowNum, reason: `Invalid date: "${dateStr}"` });
        continue;
      }

      if (!exerciseName) {
        errors.push({ row: rowNum, reason: "Missing exercise name" });
        continue;
      }

      const setOrder = parseInt(setOrderStr, 10);
      if (isNaN(setOrder) || setOrder < 0) {
        errors.push({ row: rowNum, reason: `Invalid set order: "${setOrderStr}"` });
        continue;
      }

      const weight = weightStr === "" ? null : parseFloat(weightStr);
      if (weight !== null && (isNaN(weight) || weight < 0)) {
        errors.push({ row: rowNum, reason: `Invalid weight: "${weightStr}"` });
        continue;
      }

      const reps = repsStr === "" ? null : parseInt(repsStr, 10);
      if (reps !== null && (isNaN(reps) || reps < 0)) {
        errors.push({ row: rowNum, reason: `Invalid reps: "${repsStr}"` });
        continue;
      }

      const distance = distanceStr === "" ? null : parseFloat(distanceStr);
      const seconds = secondsStr === "" ? null : parseFloat(secondsStr);

      let rpe: number | null = null;
      if (rpeStr !== "") {
        rpe = parseFloat(rpeStr);
        if (isNaN(rpe) || rpe < 1 || rpe > 10) {
          rpe = null;
        }
      }

      exerciseNameSet.add(exerciseName);

      rows.push({
        date: dateStr,
        workoutName,
        exerciseName,
        setOrder,
        weight: weight === 0 ? null : weight,
        reps,
        distance,
        seconds,
        notes,
        workoutNotes,
        rpe,
      });
    } catch {
      errors.push({ row: rowNum, reason: "Failed to parse row" });
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ row: 0, reason: "No workout data found in this file" });
  }

  // Group rows into sessions by Date + Workout Name
  const sessionMap = new Map<string, StrongSession>();
  for (const row of rows) {
    const key = `${row.date}||${row.workoutName}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        key,
        date: row.date,
        workoutName: row.workoutName,
        workoutNotes: row.workoutNotes,
        sets: [],
      });
    }
    sessionMap.get(key)!.sets.push(row);
  }

  const sessions = Array.from(sessionMap.values()).sort(
    (a, b) => (parseStrongDate(a.date) ?? 0) - (parseStrongDate(b.date) ?? 0)
  );

  return {
    rows,
    sessions,
    exerciseNames: Array.from(exerciseNameSet).sort(),
    errors,
  };
}

/**
 * Convert weight between units at parse time.
 * @param weight - weight value from CSV
 * @param sourceUnit - unit of the CSV data ("kg" or "lb")
 * @param targetUnit - FitForge stored unit ("kg" or "lb")
 */
export function convertWeight(
  weight: number | null,
  sourceUnit: "kg" | "lb",
  targetUnit: "kg" | "lb"
): number | null {
  if (weight === null) return null;
  if (sourceUnit === targetUnit) return weight;
  if (sourceUnit === "lb" && targetUnit === "kg") {
    return Math.round(weight * 0.453592 * 100) / 100;
  }
  // kg → lb
  return Math.round(weight * 2.20462 * 100) / 100;
}

/**
 * Determine which sets should be skipped (timed/distance).
 * Returns true if the set should be skipped.
 */
export function shouldSkipSet(row: ParsedStrongRow): "timed" | "distance" | null {
  if (row.distance !== null && row.distance > 0) return "distance";
  if (row.seconds !== null && row.seconds > 0 && (row.reps === null || row.reps === 0)) return "timed";
  return null;
}

/**
 * Get N sample rows from the parsed data for preview.
 */
export function getSampleRows(
  rows: ParsedStrongRow[],
  count: number = 3
): ParsedStrongRow[] {
  return rows.slice(0, count);
}

/**
 * Get N sample sessions for preview in Step 3.
 */
export function getSampleSessions(
  sessions: StrongSession[],
  count: number = 3
): { name: string; date: string; setCount: number }[] {
  return sessions.slice(0, count).map((s) => ({
    name: s.workoutName,
    date: s.date,
    setCount: s.sets.length,
  }));
}

/**
 * Build the data structures for importing into FitForge DB.
 */
export function buildImportData(
  sessions: StrongSession[],
  exerciseMap: Map<string, string>, // exerciseName → exerciseId
  sourceUnit: "kg" | "lb",
  targetUnit: "kg" | "lb"
): {
  dbSessions: {
    id: string;
    template_id: null;
    name: string;
    started_at: number;
    completed_at: number;
    duration_seconds: null;
    notes: string;
  }[];
  dbSets: {
    id: string;
    session_id: string;
    exercise_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    completed: number;
    completed_at: number;
    rpe: number | null;
    notes: string;
    link_id: null;
    round: null;
    training_mode: null;
    tempo: null;
  }[];
  skippedTimed: number;
  skippedDistance: number;
} {
  const dbSessions: {
    id: string;
    template_id: null;
    name: string;
    started_at: number;
    completed_at: number;
    duration_seconds: null;
    notes: string;
  }[] = [];
  const dbSets: {
    id: string;
    session_id: string;
    exercise_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    completed: number;
    completed_at: number;
    rpe: number | null;
    notes: string;
    link_id: null;
    round: null;
    training_mode: null;
    tempo: null;
  }[] = [];

  let skippedTimed = 0;
  let skippedDistance = 0;

  for (const session of sessions) {
    const sessionId = uuid();
    const ts = parseStrongDate(session.date)!;

    dbSessions.push({
      id: sessionId,
      template_id: null,
      name: session.workoutName,
      started_at: ts,
      completed_at: ts,
      duration_seconds: null,
      notes: session.workoutNotes,
    });

    for (const row of session.sets) {
      const skipReason = shouldSkipSet(row);
      if (skipReason === "timed") {
        skippedTimed++;
        continue;
      }
      if (skipReason === "distance") {
        skippedDistance++;
        continue;
      }

      const exerciseId = exerciseMap.get(row.exerciseName);
      if (!exerciseId) continue;

      dbSets.push({
        id: uuid(),
        session_id: sessionId,
        exercise_id: exerciseId,
        set_number: row.setOrder,
        weight: convertWeight(row.weight, sourceUnit, targetUnit),
        reps: row.reps,
        completed: 1,
        completed_at: ts,
        rpe: row.rpe,
        notes: row.notes,
        link_id: null,
        round: null,
        training_mode: null,
        tempo: null,
      });
    }
  }

  return { dbSessions, dbSets, skippedTimed, skippedDistance };
}
