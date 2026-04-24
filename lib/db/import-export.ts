import type {
  WorkoutTemplate,
  TemplateExercise,
  WorkoutSession,
  WorkoutSet,
  MacroTargets,
  BodyWeight,
  BodyMeasurements,
  BodySettings,
  Program,
  ProgramDay,
  ProgramLog,
  MealTemplate,
  MealTemplateItem,
} from "../types";
import { getDatabase, withTransaction } from "./helpers";

// --------------- Backup Format Types ---------------

export type BackupTableName =
  | "exercises"
  | "workout_templates"
  | "programs"
  | "food_entries"
  | "macro_targets"
  | "body_weight"
  | "body_measurements"
  | "body_settings"
  | "app_settings"
  | "achievements_earned"
  | "template_exercises"
  | "workout_sessions"
  | "program_days"
  | "workout_sets"
  | "daily_log"
  | "program_log"
  | "program_schedule"
  | "meal_templates"
  | "meal_template_items";

export const BACKUP_TABLE_LABELS: Record<BackupTableName, string> = {
  exercises: "Exercises",
  workout_templates: "Workout Templates",
  programs: "Programs",
  food_entries: "Food Entries",
  macro_targets: "Macro Targets",
  body_weight: "Body Weight",
  body_measurements: "Body Measurements",
  body_settings: "Body Settings",
  app_settings: "App Settings",
  achievements_earned: "Achievements",
  template_exercises: "Template Exercises",
  workout_sessions: "Workout Sessions",
  program_days: "Program Days",
  workout_sets: "Workout Sets",
  daily_log: "Daily Log",
  program_log: "Program Log",
  program_schedule: "Program Schedule",
  meal_templates: "Meal Templates",
  meal_template_items: "Meal Template Items",
};

// FK-dependency order for import — parents before children
export const IMPORT_TABLE_ORDER: BackupTableName[] = [
  "exercises",
  "workout_templates",
  "programs",
  "food_entries",
  "macro_targets",
  "body_weight",
  "body_measurements",
  "body_settings",
  "app_settings",
  "achievements_earned",
  "template_exercises",
  "workout_sessions",
  "program_days",
  "workout_sets",
  "daily_log",
  "program_log",
  "program_schedule",
  "meal_templates",
  "meal_template_items",
];

import type { AppSettingRow, AchievementEarnedRow, ProgramScheduleRow } from "./schema";
export type { AppSettingRow, AchievementEarnedRow, ProgramScheduleRow };

export type BackupV3Data = {
  exercises: unknown[];
  workout_templates: WorkoutTemplate[];
  template_exercises: TemplateExercise[];
  workout_sessions: WorkoutSession[];
  workout_sets: WorkoutSet[];
  food_entries: unknown[];
  daily_log: { id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }[];
  macro_targets: MacroTargets[];
  body_weight: BodyWeight[];
  body_measurements: BodyMeasurements[];
  body_settings: BodySettings[];
  programs: Program[];
  program_days: ProgramDay[];
  program_log: ProgramLog[];
  app_settings: AppSettingRow[];
  program_schedule: ProgramScheduleRow[];
  achievements_earned: AchievementEarnedRow[];
  meal_templates: MealTemplate[];
  meal_template_items: MealTemplateItem[];
};

export type BackupV3 = {
  version: 3 | 4 | 5 | 6;
  app_version: string;
  exported_at: string;
  data: BackupV3Data;
  counts: Record<string, number>;
};

export type ExportProgress = {
  table: string;
  tableIndex: number;
  totalTables: number;
};

export type ImportProgress = {
  table: string;
  tableIndex: number;
  totalTables: number;
};

export type ImportResult = {
  inserted: number;
  skipped: number;
  perTable: Record<string, { inserted: number; skipped: number }>;
};

// Numeric fields that must be non-negative for validation
const NUMERIC_NONNEG_FIELDS: Record<string, string[]> = {
  food_entries: ["calories", "protein", "carbs", "fat"],
  macro_targets: ["calories", "protein", "carbs", "fat"],
  body_weight: ["weight"],
  workout_sets: ["weight", "reps", "set_number", "duration_seconds"],
  template_exercises: ["position", "target_sets", "rest_seconds", "target_duration_seconds"],
  program_days: ["position"],
};

const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// --------------- Validation ---------------

export type ValidationError = {
  type: "corrupt_json" | "missing_version" | "future_version" | "missing_data" | "invalid_table" | "negative_values" | "empty_backup" | "file_too_large";
  message: string;
};

export function validateBackupFileSize(sizeBytes: number): ValidationError | null {
  if (sizeBytes > MAX_BACKUP_FILE_SIZE) {
    return { type: "file_too_large", message: "This backup file is too large to process safely." };
  }
  return null;
}

// eslint-disable-next-line complexity -- pre-existing; split would break backup format contract
export function validateBackupData(data: unknown): ValidationError | null {
  if (typeof data !== "object" || data === null) {
    return { type: "corrupt_json", message: "This file doesn't appear to be a valid CableSnap backup." };
  }

  const obj = data as Record<string, unknown>;

  // Check version
  if (obj.version === undefined || obj.version === null) {
    return { type: "missing_version", message: "This file doesn't appear to be a valid CableSnap backup." };
  }

  const version = Number(obj.version);
  if (version >= 7) {
    return { type: "future_version", message: "This backup was created with a newer version of CableSnap. Please update the app first." };
  }

  // v2 backups have data at top level, v3 under data key
  const tableData = version <= 2 ? obj : (obj.data as Record<string, unknown> | undefined);

  if (version >= 3 && (!tableData || typeof tableData !== "object")) {
    return { type: "missing_data", message: "This file doesn't appear to be a valid CableSnap backup." };
  }

  // Validate arrays and numeric fields (check types before checking emptiness)
  if (tableData && typeof tableData === "object") {
    for (const tableName of IMPORT_TABLE_ORDER) {
      const key = getV2Key(tableName, version);
      const arr = (tableData as Record<string, unknown>)[key];
      if (arr === undefined || arr === null) continue;
      if (!Array.isArray(arr)) {
        return { type: "invalid_table", message: `Invalid data format: "${tableName}" should be an array.` };
      }

      // Validate non-negative numerics
      const numericFields = NUMERIC_NONNEG_FIELDS[tableName];
      if (numericFields) {
        for (const row of arr) {
          if (typeof row !== "object" || row === null) continue;
          const r = row as Record<string, unknown>;
          for (const field of numericFields) {
            const val = r[field];
            if (val !== null && val !== undefined && typeof val === "number" && val < 0) {
              return { type: "negative_values", message: "Backup contains invalid data (negative values)." };
            }
          }
        }
      }
    }
  }

  // Check if backup is empty (no arrays with data)
  if (tableData && typeof tableData === "object") {
    const hasAnyData = IMPORT_TABLE_ORDER.some((tableName) => {
      const key = getV2Key(tableName, version);
      const arr = (tableData as Record<string, unknown>)[key];
      return Array.isArray(arr) && arr.length > 0;
    });
    if (!hasAnyData) {
      return { type: "empty_backup", message: "This backup file contains no data." };
    }
  }

  return null;
}

// v2 backups use different key names for some tables
function getV2Key(tableName: BackupTableName, version: number): string {
  if (version <= 2) {
    const v2KeyMap: Partial<Record<BackupTableName, string>> = {
      workout_templates: "templates",
      template_exercises: "template_exercises",
      workout_sessions: "sessions",
      workout_sets: "sets",
    };
    return v2KeyMap[tableName] ?? tableName;
  }
  return tableName;
}

/** Extract record counts from a parsed backup for the preview screen */
export function getBackupCounts(data: Record<string, unknown>): Record<BackupTableName, number> {
  const version = Number(data.version ?? 0);
  const tableData = version <= 2 ? data : (data.data as Record<string, unknown> | undefined) ?? {};
  const counts: Record<string, number> = {};
  for (const tableName of IMPORT_TABLE_ORDER) {
    const key = getV2Key(tableName, version);
    const arr = (tableData as Record<string, unknown>)[key];
    counts[tableName] = Array.isArray(arr) ? arr.length : 0;
  }
  return counts as Record<BackupTableName, number>;
}

/** Estimate export file size (rough estimate based on row counts) */
export async function estimateExportSize(): Promise<{ bytes: number; label: string }> {
  const database = await getDatabase();
  let totalRows = 0;
  for (const table of IMPORT_TABLE_ORDER) {
    const result = await database.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${table}`);
    totalRows += result?.cnt ?? 0;
  }
  // ~200 bytes per row average for JSON representation
  const bytes = Math.max(totalRows * 200, 256);
  const label = bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return { bytes, label };
}

// --------------- Export ---------------

export async function exportAllData(
  onProgress?: (progress: ExportProgress) => void
): Promise<BackupV3> {
  const database = await getDatabase();
  const tables = IMPORT_TABLE_ORDER;
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    onProgress?.({ table, tableIndex: i, totalTables: tables.length });
    const rows = await database.getAllAsync(`SELECT * FROM ${table}`);
    data[table] = rows;
    counts[table] = rows.length;
  }

  onProgress?.({ table: "done", tableIndex: tables.length, totalTables: tables.length });

  return {
    version: 6,
    app_version: "1.0.0",
    exported_at: new Date().toISOString(),
    data: data as unknown as BackupV3Data,
    counts,
  };
}

// --------------- Import ---------------

export async function importData(
  data: Record<string, unknown>,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const version = Number(data.version ?? 0);
  const tableData = version <= 2 ? data : (data.data as Record<string, unknown> | undefined) ?? {};
  let totalInserted = 0;
  let totalSkipped = 0;
  const perTable: Record<string, { inserted: number; skipped: number }> = {};

  await withTransaction(async (database) => {
    // Ensure foreign keys are enforced
    await database.execAsync("PRAGMA foreign_keys = ON");

    for (let i = 0; i < IMPORT_TABLE_ORDER.length; i++) {
      const tableName = IMPORT_TABLE_ORDER[i];
      const key = getV2Key(tableName, version);
      const rows = (tableData as Record<string, unknown>)[key];

      onProgress?.({ table: tableName, tableIndex: i, totalTables: IMPORT_TABLE_ORDER.length });

      if (!Array.isArray(rows) || rows.length === 0) {
        perTable[tableName] = { inserted: 0, skipped: 0 };
        continue;
      }

      const { inserted, skipped } = await importTable(database, tableName, rows);
      totalInserted += inserted;
      totalSkipped += skipped;
      perTable[tableName] = { inserted, skipped };
    }
  });

  onProgress?.({ table: "done", tableIndex: IMPORT_TABLE_ORDER.length, totalTables: IMPORT_TABLE_ORDER.length });

  return { inserted: totalInserted, skipped: totalSkipped, perTable };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic row insertion
async function importTable(database: any, tableName: BackupTableName, rows: unknown[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      skipped++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const result = await insertRow(database, tableName, r);
    if (result) inserted++;
    else skipped++;
  }

  return { inserted, skipped };
}

// eslint-disable-next-line complexity, @typescript-eslint/no-explicit-any -- pre-existing complexity; generic database interface
async function insertRow(database: any, tableName: BackupTableName, row: Record<string, unknown>): Promise<boolean> {
  switch (tableName) {
    case "exercises": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.name, row.category, row.primary_muscles, row.secondary_muscles, row.equipment, row.instructions, row.difficulty, row.is_custom]
      );
      return r.changes > 0;
    }
    case "workout_templates": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.name, row.created_at, row.updated_at, row.is_starter ?? 0]
      );
      return r.changes > 0;
    }
    case "programs": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, deleted_at, is_starter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.name, row.description ?? "", row.is_active ?? 0, row.current_day_id ?? null, row.created_at, row.updated_at, row.deleted_at ?? null, row.is_starter ?? 0]
      );
      return r.changes > 0;
    }
    case "food_entries": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.name, row.calories, row.protein, row.carbs, row.fat, row.serving_size, row.is_favorite, row.created_at]
      );
      return r.changes > 0;
    }
    case "macro_targets": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [row.id, row.calories, row.protein, row.carbs, row.fat, row.updated_at]
      );
      return r.changes > 0;
    }
    case "body_weight": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO body_weight (id, weight, date, notes, logged_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.weight, row.date, row.notes, row.logged_at]
      );
      return r.changes > 0;
    }
    case "body_measurements": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO body_measurements (id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.date, row.waist, row.chest, row.hips, row.left_arm, row.right_arm, row.left_thigh, row.right_thigh, row.left_calf, row.right_calf, row.neck, row.body_fat, row.notes, row.logged_at]
      );
      return r.changes > 0;
    }
    case "body_settings": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO body_settings (id, weight_unit, measurement_unit, sex, weight_goal, body_fat_goal, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.weight_unit, row.measurement_unit, row.sex ?? "male", row.weight_goal, row.body_fat_goal, row.updated_at]
      );
      return r.changes > 0;
    }
    case "app_settings": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
        [row.key, row.value]
      );
      return r.changes > 0;
    }
    case "achievements_earned": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO achievements_earned (achievement_id, earned_at) VALUES (?, ?)",
        [row.achievement_id, row.earned_at]
      );
      return r.changes > 0;
    }
    case "template_exercises": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label, target_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.template_id, row.exercise_id, row.position, row.target_sets, row.target_reps, row.rest_seconds, row.link_id ?? null, row.link_label ?? "", row.target_duration_seconds ?? null]
      );
      return r.changes > 0;
    }
    case "workout_sessions": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes, program_day_id, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.template_id, row.name, row.started_at, row.completed_at, row.duration_seconds, row.notes, row.program_day_id ?? null, row.rating ?? null]
      );
      return r.changes > 0;
    }
    case "program_days": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.program_id, row.template_id ?? null, row.position, row.label ?? ""]
      );
      return r.changes > 0;
    }
    case "workout_sets": {
      const setType = row.set_type ?? (row.is_warmup ? "warmup" : "normal");
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, training_mode, tempo, set_type, duration_seconds, bodyweight_modifier_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.session_id, row.exercise_id, row.set_number, row.weight, row.reps, row.completed, row.completed_at, row.set_rpe ?? row.rpe ?? null, row.set_notes ?? row.notes ?? "", row.link_id ?? null, row.round ?? null, row.training_mode ?? null, row.tempo ?? null, setType, row.duration_seconds ?? null, row.bodyweight_modifier_kg ?? null]
      );
      return r.changes > 0;
    }
    case "daily_log": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)",
        [row.id, row.food_entry_id, row.date, row.meal, row.servings, row.logged_at]
      );
      return r.changes > 0;
    }
    case "program_log": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO program_log (id, program_id, day_id, session_id, completed_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.program_id, row.day_id, row.session_id, row.completed_at]
      );
      return r.changes > 0;
    }
    case "program_schedule": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)",
        [row.program_id, row.day_of_week, row.template_id]
      );
      return r.changes > 0;
    }
    case "meal_templates": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO meal_templates (id, name, meal, cached_calories, cached_protein, cached_carbs, cached_fat, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.name, row.meal, row.cached_calories ?? 0, row.cached_protein ?? 0, row.cached_carbs ?? 0, row.cached_fat ?? 0, row.last_used_at ?? null, row.created_at, row.updated_at]
      );
      return r.changes > 0;
    }
    case "meal_template_items": {
      const r = await database.runAsync(
        "INSERT OR IGNORE INTO meal_template_items (id, template_id, food_entry_id, servings, sort_order) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.template_id, row.food_entry_id, row.servings ?? 1, row.sort_order ?? 0]
      );
      return r.changes > 0;
    }
    default:
      return false;
  }
}
