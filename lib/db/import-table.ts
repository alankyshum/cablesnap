import type { BackupTableName } from "./import-export";
import { normalizeSetType } from "./sets";
import {
  HISTORY_CEILING_SECONDS,
  HISTORY_FLOOR_SECONDS,
  restSanitizeBreadcrumb,
  type RestSanitizeBreadcrumbPayload,
} from "../rest-resolver";

type ImportTableResult = {
  inserted: number;
  skipped: number;
  skipped_existing: number;
};

export async function importTable(
  database: any, // eslint-disable-line @typescript-eslint/no-explicit-any -- generic database interface
  tableName: BackupTableName,
  rows: unknown[],
  exerciseColumns?: string[],
  onRow?: (index: number, count: number) => void
): Promise<ImportTableResult> {
  let inserted = 0;
  let skipped = 0;
  let skipped_existing = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (typeof row !== "object" || row === null) {
      skipped++;
      onRow?.(index + 1, rows.length);
      continue;
    }
    const result = await insertRow(database, tableName, row as Record<string, unknown>, exerciseColumns);
    if (result) inserted++;
    else {
      skipped++;
      skipped_existing++;
    }
    if (index === rows.length - 1 || (index + 1) % 25 === 0) {
      onRow?.(index + 1, rows.length);
      // Let React paint progress between native bridge batches.
      if ((index + 1) % 25 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return { inserted, skipped, skipped_existing };
}

function sanitizeExerciseRow(row: Record<string, unknown>): Record<string, unknown> {
  if (!("user_rest_seconds" in row)) return row;
  const sanitizedRow = { ...row };
  const raw = sanitizedRow.user_rest_seconds;
  const n = typeof raw === "number" ? raw : (typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN);
  const exerciseId = String(row.id ?? "");
  const safeInput = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  const inputType = raw === null ? "null" : (typeof raw as RestSanitizeBreadcrumbPayload["inputType"]);

  if (!Number.isInteger(n) || n <= 0) {
    sanitizedRow.user_rest_seconds = null;
    restSanitizeBreadcrumb({ kind: "import_drop", inputValue: safeInput, inputType, outputValue: null, exerciseId });
  } else if (n < HISTORY_FLOOR_SECONDS) {
    sanitizedRow.user_rest_seconds = HISTORY_FLOOR_SECONDS;
    restSanitizeBreadcrumb({ kind: "import_clamp", inputValue: safeInput, inputType, outputValue: HISTORY_FLOOR_SECONDS, exerciseId });
  } else if (n > HISTORY_CEILING_SECONDS) {
    sanitizedRow.user_rest_seconds = HISTORY_CEILING_SECONDS;
    restSanitizeBreadcrumb({ kind: "import_clamp", inputValue: safeInput, inputType, outputValue: HISTORY_CEILING_SECONDS, exerciseId });
  } else {
    sanitizedRow.user_rest_seconds = n;
  }
  return sanitizedRow;
}

// eslint-disable-next-line complexity, @typescript-eslint/no-explicit-any -- table-specific backup compatibility mappings
async function insertRow(database: any, tableName: BackupTableName, row: Record<string, unknown>, exerciseColumns?: string[]): Promise<boolean> {
  switch (tableName) {
    case "exercises": {
      const cols = (exerciseColumns ?? []).filter((col) => col in row);
      if (cols.length === 0) return false;
      const sanitizedRow = sanitizeExerciseRow(row);
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((col) => sanitizedRow[col] ?? null);
      const conflict = row.is_custom && row.id
        ? ` ON CONFLICT(id) DO UPDATE SET ${cols.filter((col) => col !== "id").map((col) => `${col} = excluded.${col}`).join(", ")}`
        : "";
      const r = await database.runAsync(`INSERT OR IGNORE INTO exercises (${cols.join(", ")}) VALUES (${placeholders})${conflict}`, values);
      return r.changes > 0;
    }
    case "workout_templates": {
      const userOwned = !row.is_starter && !row.is_curated;
      const r = await database.runAsync(
        `INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at, is_starter, is_curated, source) VALUES (?, ?, ?, ?, ?, ?, ?)${userOwned ? " ON CONFLICT(id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at, updated_at = excluded.updated_at, is_starter = excluded.is_starter, is_curated = excluded.is_curated, source = excluded.source" : ""}`,
        [row.id, row.name, row.created_at, row.updated_at, row.is_starter ?? 0, row.is_curated ?? 0, row.source ?? null]
      );
      return r.changes > 0;
    }
    case "programs": {
      const userOwned = !row.is_starter && !row.is_curated;
      const r = await database.runAsync(
        `INSERT OR IGNORE INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, deleted_at, is_starter, is_curated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)${userOwned ? " ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, is_active = excluded.is_active, current_day_id = excluded.current_day_id, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, is_starter = excluded.is_starter, is_curated = excluded.is_curated" : ""}`,
        [row.id, row.name, row.description ?? "", row.is_active ?? 0, row.current_day_id ?? null, row.created_at, row.updated_at, row.deleted_at ?? null, row.is_starter ?? 0, row.is_curated ?? 0]
      );
      return r.changes > 0;
    }
    case "food_entries": return run(database, "INSERT OR IGNORE INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.name, row.calories, row.protein, row.carbs, row.fat, row.serving_size, row.is_favorite, row.created_at]);
    case "macro_targets": return run(database, "INSERT OR IGNORE INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [row.id, row.calories, row.protein, row.carbs, row.fat, row.updated_at]);
    case "body_weight": return run(database, "INSERT OR IGNORE INTO body_weight (id, weight, date, notes, logged_at) VALUES (?, ?, ?, ?, ?)", [row.id, row.weight, row.date, row.notes, row.logged_at]);
    case "body_measurements": return run(database, "INSERT OR IGNORE INTO body_measurements (id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.date, row.waist, row.chest, row.hips, row.left_arm, row.right_arm, row.left_thigh, row.right_thigh, row.left_calf, row.right_calf, row.neck, row.body_fat, row.notes, row.logged_at]);
    case "body_settings": return run(database, "INSERT OR IGNORE INTO body_settings (id, weight_unit, measurement_unit, sex, weight_goal, body_fat_goal, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [row.id, row.weight_unit, row.measurement_unit, row.sex ?? "male", row.weight_goal, row.body_fat_goal, row.updated_at]);
    case "app_settings": {
      const key = String(row.key ?? "");
      const protectedKeys = new Set(["starter_version", "anon_user_id"]);
      if (protectedKeys.has(key) || key.startsWith("migration_") || key.startsWith("migrated_")) {
        const existing = await database.getFirstAsync("SELECT key FROM app_settings WHERE key = ?", [key]) as { key?: unknown } | null;
        if (existing && existing.key !== undefined) return false;
      }
      return run(database, "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [row.key, row.value]);
    }
    case "achievements_earned": return run(database, "INSERT OR IGNORE INTO achievements_earned (achievement_id, earned_at) VALUES (?, ?)", [row.achievement_id, row.earned_at]);
    case "template_exercises": return run(database, "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label, target_duration_seconds, set_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.template_id, row.exercise_id, row.position, row.target_sets, row.target_reps, row.rest_seconds, row.link_id ?? null, row.link_label ?? "", row.target_duration_seconds ?? null, row.set_types ?? "[]"]);
    case "gym_profiles": return run(database, "INSERT OR IGNORE INTO gym_profiles (id, name, notes, is_default, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [row.id, row.name, row.notes ?? null, row.is_default ?? 0, row.created_at, row.updated_at, row.deleted_at ?? null]);
    case "cable_stacks": return run(database, "INSERT OR IGNORE INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at, deleted_at, gen_start_weight, gen_increment, gen_marker_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.gym_id, row.name, row.unit ?? "kg", row.position ?? 0, row.created_at, row.updated_at, row.deleted_at ?? null, row.gen_start_weight ?? null, row.gen_increment ?? null, row.gen_marker_count ?? null]);
    case "stack_calibrations": return run(database, "INSERT OR IGNORE INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?)", [row.id, row.stack_id, row.marker, row.true_weight]);
    case "workout_sessions": return run(database, "INSERT OR IGNORE INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes, program_day_id, rating, import_batch_id, gym_id, gym_name_at_log, kind, day_session_exercise_id, day_session_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.template_id, row.name, row.started_at, row.completed_at, row.duration_seconds, row.notes, row.program_day_id ?? null, row.rating ?? null, row.import_batch_id ?? null, row.gym_id ?? null, row.gym_name_at_log ?? null, row.kind ?? "workout", row.day_session_exercise_id ?? null, row.day_session_date ?? null]);
    case "program_days": return run(database, "INSERT OR IGNORE INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)", [row.id, row.program_id, row.template_id ?? null, row.position, row.label ?? ""]);
    case "workout_sets": {
      const setType = normalizeSetType(row.set_type ?? (row.is_warmup ? "warmup" : "normal"));
      return run(database, "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, tempo, set_type, duration_seconds, bodyweight_modifier_kg, attachment, mount_position, grip_type, grip_width, stack_id, stack_marker, stack_unit_at_log, stack_name_at_log, pulley_pin, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.session_id, row.exercise_id, row.set_number, row.weight, row.reps, row.completed, row.completed_at, row.set_rpe ?? row.rpe ?? null, row.set_notes ?? row.notes ?? "", row.link_id ?? null, row.round ?? null, row.tempo ?? null, setType, row.duration_seconds ?? null, row.bodyweight_modifier_kg ?? null, row.attachment ?? null, row.mount_position ?? null, row.grip_type ?? null, row.grip_width ?? null, row.stack_id ?? null, row.stack_marker ?? null, row.stack_unit_at_log ?? null, row.stack_name_at_log ?? null, row.pulley_pin ?? null, row.side ?? null]);
    }
    case "daily_log": return run(database, "INSERT OR IGNORE INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)", [row.id, row.food_entry_id, row.date, row.meal, row.servings, row.logged_at]);
    case "program_log": return run(database, "INSERT OR IGNORE INTO program_log (id, program_id, day_id, session_id, completed_at) VALUES (?, ?, ?, ?, ?)", [row.id, row.program_id, row.day_id, row.session_id, row.completed_at]);
    case "program_schedule": return run(database, "INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)", [row.program_id, row.day_of_week, row.template_id]);
    case "meal_templates": return run(database, "INSERT OR IGNORE INTO meal_templates (id, name, meal, cached_calories, cached_protein, cached_carbs, cached_fat, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, row.name, row.meal, row.cached_calories ?? 0, row.cached_protein ?? 0, row.cached_carbs ?? 0, row.cached_fat ?? 0, row.last_used_at ?? null, row.created_at, row.updated_at]);
    case "meal_template_items": return run(database, "INSERT OR IGNORE INTO meal_template_items (id, template_id, food_entry_id, servings, sort_order) VALUES (?, ?, ?, ?, ?)", [row.id, row.template_id, row.food_entry_id, row.servings ?? 1, row.sort_order ?? 0]);
    case "coach_sessions":
    case "coach_messages": {
      const columns = (await database.getAllAsync(`PRAGMA table_info(${tableName})`) as { name: string }[])
        .map((column) => column.name).filter((column) => column in row);
      if (!columns.length) return false;
      const values = columns.map((column) => row[column] ?? null);
      return run(database, `INSERT OR IGNORE INTO ${tableName} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values);
    }
    default: return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic database interface
async function run(database: any, sql: string, values: unknown[]): Promise<boolean> {
  const result = await database.runAsync(sql, values);
  return result.changes > 0;
}
