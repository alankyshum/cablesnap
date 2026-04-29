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

export type BackupCategoryName =
  | "workout_templates"
  | "workout_history"
  | "exercises"
  | "nutrition"
  | "body_metrics"
  | "programs"
  | "plate_calculator_settings"
  | "rest_timer_settings"
  | "app_preferences"
  | "achievements";

export const BACKUP_CATEGORY_ORDER: BackupCategoryName[] = [
  "workout_templates",
  "workout_history",
  "exercises",
  "nutrition",
  "body_metrics",
  "programs",
  "plate_calculator_settings",
  "rest_timer_settings",
  "app_preferences",
  "achievements",
];

export const BACKUP_CATEGORY_LABELS: Record<BackupCategoryName, string> = {
  workout_templates: "Workout templates",
  workout_history: "Workout session history",
  exercises: "Exercises",
  nutrition: "Nutrition",
  body_metrics: "Body metrics",
  programs: "Programs",
  plate_calculator_settings: "Plate calculator settings",
  rest_timer_settings: "Rest timer settings",
  app_preferences: "App preferences",
  achievements: "Achievements",
};

export const BACKUP_CATEGORY_TABLES: Record<BackupCategoryName, BackupTableName[]> = {
  workout_templates: ["workout_templates", "template_exercises"],
  workout_history: ["workout_sessions", "workout_sets"],
  exercises: ["exercises"],
  nutrition: ["food_entries", "daily_log", "macro_targets", "meal_templates", "meal_template_items"],
  body_metrics: ["body_weight", "body_measurements", "body_settings"],
  programs: ["programs", "program_days", "program_log", "program_schedule"],
  plate_calculator_settings: ["app_settings"],
  rest_timer_settings: ["app_settings"],
  app_preferences: ["app_settings"],
  achievements: ["achievements_earned"],
};

type BackupCategorySection = Partial<Record<BackupTableName, unknown[]>>;
export type BackupV7Data = Partial<Record<BackupCategoryName, BackupCategorySection>>;

export type BackupV3 = {
  version: 3 | 4 | 5 | 6;
  app_version: string;
  exported_at: string;
  data: BackupV3Data;
  counts: Record<string, number>;
};

export type BackupV7 = {
  version: 7;
  app_version: string;
  exported_at: string;
  data: BackupV7Data;
  counts: Record<string, number>;
};

export type BackupFile = BackupV3 | BackupV7;

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

type ExportOptions = {
  selectedCategories?: BackupCategoryName[];
};

type ImportOptions = {
  selectedCategories?: BackupCategoryName[];
};

function getDefaultSelectedCategories(): BackupCategoryName[] {
  return [...BACKUP_CATEGORY_ORDER];
}

function getSelectedCategorySet(selectedCategories?: BackupCategoryName[]): Set<BackupCategoryName> {
  if (!selectedCategories || selectedCategories.length === 0) {
    return new Set(getDefaultSelectedCategories());
  }
  return new Set(selectedCategories.filter((category): category is BackupCategoryName => BACKUP_CATEGORY_ORDER.includes(category)));
}

function getSelectedTableOrder(selectedCategories?: BackupCategoryName[]): BackupTableName[] {
  const selected = getSelectedCategorySet(selectedCategories);
  return IMPORT_TABLE_ORDER.filter((table) =>
    BACKUP_CATEGORY_ORDER.some((category) => selected.has(category) && BACKUP_CATEGORY_TABLES[category].includes(table))
  );
}

function getAppSettingsCategory(key: unknown): BackupCategoryName {
  const normalized = typeof key === "string" ? key : "";
  if (normalized.startsWith("plate_calculator_")) return "plate_calculator_settings";
  if (normalized.startsWith("rest_") || normalized === "rest_notification_enabled") return "rest_timer_settings";
  return "app_preferences";
}

function filterAppSettingsRowsForCategory(rows: unknown[], category: BackupCategoryName): unknown[] {
  return rows.filter((row) => {
    if (typeof row !== "object" || row === null) return false;
    return getAppSettingsCategory((row as Record<string, unknown>).key) === category;
  });
}

function filterAppSettingsRowsForSelectedCategories(rows: unknown[], selectedCategories?: BackupCategoryName[]): unknown[] {
  const selected = getSelectedCategorySet(selectedCategories);
  return rows.filter((row) => {
    if (typeof row !== "object" || row === null) return false;
    return selected.has(getAppSettingsCategory((row as Record<string, unknown>).key));
  });
}

function getTableData(data: Record<string, unknown>, version: number): Partial<Record<BackupTableName, unknown[]>> {
  if (version >= 7) {
    const categoryData = (data.data as Record<string, unknown> | undefined) ?? {};
    const merged: Partial<Record<BackupTableName, unknown[]>> = {};

    for (const category of BACKUP_CATEGORY_ORDER) {
      const rawSection = categoryData[category];
      if (typeof rawSection !== "object" || rawSection === null) continue;
      const section = rawSection as Record<string, unknown>;

      for (const tableName of BACKUP_CATEGORY_TABLES[category]) {
        const rows = section[tableName];
        if (!Array.isArray(rows)) continue;
        merged[tableName] = [...(merged[tableName] ?? []), ...rows];
      }
    }

    return merged;
  }

  const tableData = version <= 2 ? data : (data.data as Record<string, unknown> | undefined) ?? {};
  const merged: Partial<Record<BackupTableName, unknown[]>> = {};
  for (const tableName of IMPORT_TABLE_ORDER) {
    const key = getV2Key(tableName, version);
    const rows = (tableData as Record<string, unknown>)[key];
    if (Array.isArray(rows)) merged[tableName] = rows;
  }
  return merged;
}

function buildCategoryData(tableData: Partial<Record<BackupTableName, unknown[]>>, selectedCategories?: BackupCategoryName[]): BackupV7Data {
  const selected = getSelectedCategorySet(selectedCategories);
  const data: BackupV7Data = {};

  for (const category of BACKUP_CATEGORY_ORDER) {
    if (!selected.has(category)) continue;

    const section: BackupCategorySection = {};
    for (const tableName of BACKUP_CATEGORY_TABLES[category]) {
      const rows = tableData[tableName] ?? [];
      section[tableName] = tableName === "app_settings"
        ? filterAppSettingsRowsForCategory(rows, category)
        : rows;
    }
    data[category] = section;
  }

  return data;
}

export function getBackupCategoryCounts(data: Record<string, unknown>): Record<BackupCategoryName, number> {
  const version = Number(data.version ?? 0);
  const tableData = getTableData(data, version);
  const counts = Object.fromEntries(BACKUP_CATEGORY_ORDER.map((category) => [category, 0])) as Record<BackupCategoryName, number>;

  for (const category of BACKUP_CATEGORY_ORDER) {
    counts[category] = BACKUP_CATEGORY_TABLES[category].reduce((sum, tableName) => {
      const rows = tableData[tableName] ?? [];
      if (tableName === "app_settings") {
        return sum + filterAppSettingsRowsForCategory(rows, category).length;
      }
      return sum + rows.length;
    }, 0);
  }

  return counts;
}

export function getPresentBackupCategories(data: Record<string, unknown>): BackupCategoryName[] {
  const version = Number(data.version ?? 0);
  if (version >= 7) {
    const categoryData = (data.data as Record<string, unknown> | undefined) ?? {};
    return BACKUP_CATEGORY_ORDER.filter((category) => category in categoryData);
  }

  const counts = getBackupCategoryCounts(data);
  return BACKUP_CATEGORY_ORDER.filter((category) => counts[category] > 0);
}

function parseExportArgs(
  optionsOrProgress?: ExportOptions | ((progress: ExportProgress) => void),
  maybeProgress?: (progress: ExportProgress) => void,
): { options: ExportOptions; onProgress?: (progress: ExportProgress) => void } {
  if (typeof optionsOrProgress === "function") {
    return { options: {}, onProgress: optionsOrProgress };
  }
  return { options: optionsOrProgress ?? {}, onProgress: maybeProgress };
}

function parseImportArgs(
  progressOrOptions?: ImportOptions | ((progress: ImportProgress) => void),
  maybeOptions?: ImportOptions,
): { options: ImportOptions; onProgress?: (progress: ImportProgress) => void } {
  if (typeof progressOrOptions === "function") {
    return { options: maybeOptions ?? {}, onProgress: progressOrOptions };
  }
  return { options: progressOrOptions ?? {} };
}

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
  if (version >= 8) {
    return { type: "future_version", message: "This backup was created with a newer version of CableSnap. Please update the app first." };
  }

  const rawData = version <= 2 ? obj : (obj.data as Record<string, unknown> | undefined);

  if (version >= 3 && (!rawData || typeof rawData !== "object")) {
    return { type: "missing_data", message: "This file doesn't appear to be a valid CableSnap backup." };
  }

  const tableData = getTableData(obj, version);

  for (const tableName of IMPORT_TABLE_ORDER) {
    const arr = tableData[tableName];
    if (arr === undefined || arr === null) continue;
    if (!Array.isArray(arr)) {
      return { type: "invalid_table", message: `Invalid data format: "${tableName}" should be an array.` };
    }

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

  const hasAnyData = IMPORT_TABLE_ORDER.some((tableName) => (tableData[tableName]?.length ?? 0) > 0);
  if (!hasAnyData) {
    return { type: "empty_backup", message: "This backup file contains no data." };
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
  const tableData = getTableData(data, version);
  const counts: Record<string, number> = {};
  for (const tableName of IMPORT_TABLE_ORDER) {
    counts[tableName] = tableData[tableName]?.length ?? 0;
  }
  return counts as Record<BackupTableName, number>;
}

/** Estimate export file size (rough estimate based on row counts) */
export async function estimateExportSize(options?: ExportOptions): Promise<{ bytes: number; label: string }> {
  const database = await getDatabase();
  let totalRows = 0;
  for (const table of getSelectedTableOrder(options?.selectedCategories)) {
    const result = await database.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${table}`);
    totalRows += result?.cnt ?? 0;
  }
  const bytes = Math.max(totalRows * 200, 256);
  const label = bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return { bytes, label };
}

// --------------- Export ---------------

export async function exportAllData(
  optionsOrProgress?: ExportOptions | ((progress: ExportProgress) => void),
  maybeProgress?: (progress: ExportProgress) => void
): Promise<BackupFile> {
  const { options, onProgress } = parseExportArgs(optionsOrProgress, maybeProgress);
  const database = await getDatabase();
  const tables = getSelectedTableOrder(options.selectedCategories);
  const tableData: Partial<Record<BackupTableName, unknown[]>> = {};
  const counts: Record<string, number> = Object.fromEntries(IMPORT_TABLE_ORDER.map((table) => [table, 0]));

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    onProgress?.({ table, tableIndex: i, totalTables: tables.length });
    const rows = await database.getAllAsync(`SELECT * FROM ${table}`);
    const filteredRows = table === "app_settings"
      ? filterAppSettingsRowsForSelectedCategories(rows, options.selectedCategories)
      : rows;
    tableData[table] = filteredRows;
    counts[table] = filteredRows.length;
  }

  onProgress?.({ table: "done", tableIndex: tables.length, totalTables: tables.length });

  return {
    version: 7,
    app_version: "1.0.0",
    exported_at: new Date().toISOString(),
    data: buildCategoryData(tableData, options.selectedCategories),
    counts,
  };
}

// --------------- Import ---------------

export async function importData(
  data: Record<string, unknown>,
  progressOrOptions?: ImportOptions | ((progress: ImportProgress) => void),
  maybeOptions?: ImportOptions,
): Promise<ImportResult> {
  const { options, onProgress } = parseImportArgs(progressOrOptions, maybeOptions);
  const version = Number(data.version ?? 0);
  const tableData = getTableData(data, version);
  const tables = getSelectedTableOrder(options.selectedCategories);
  let totalInserted = 0;
  let totalSkipped = 0;
  const perTable: Record<string, { inserted: number; skipped: number }> = {};

  await withTransaction(async (database) => {
    await database.execAsync("PRAGMA foreign_keys = ON");

    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i];
      const allRows = tableData[tableName] ?? [];
      const rows = tableName === "app_settings"
        ? filterAppSettingsRowsForSelectedCategories(allRows, options.selectedCategories)
        : allRows;

      onProgress?.({ table: tableName, tableIndex: i, totalTables: tables.length });

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

  for (const tableName of IMPORT_TABLE_ORDER) {
    perTable[tableName] ??= { inserted: 0, skipped: 0 };
  }

  onProgress?.({ table: "done", tableIndex: tables.length, totalTables: tables.length });

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
        "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter, source) VALUES (?, ?, ?, ?, ?, ?)",
        [row.id, row.name, row.created_at, row.updated_at, row.is_starter ?? 0, row.source ?? null]
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
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label, target_duration_seconds, set_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.template_id, row.exercise_id, row.position, row.target_sets, row.target_reps, row.rest_seconds, row.link_id ?? null, row.link_label ?? "", row.target_duration_seconds ?? null, row.set_types ?? "[]"]
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
        "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, tempo, set_type, duration_seconds, bodyweight_modifier_kg, attachment, mount_position, grip_type, grip_width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row.id, row.session_id, row.exercise_id, row.set_number, row.weight, row.reps, row.completed, row.completed_at, row.set_rpe ?? row.rpe ?? null, row.set_notes ?? row.notes ?? "", row.link_id ?? null, row.round ?? null, row.tempo ?? null, setType, row.duration_seconds ?? null, row.bodyweight_modifier_kg ?? null, row.attachment ?? null, row.mount_position ?? null, row.grip_type ?? null, row.grip_width ?? null]

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
