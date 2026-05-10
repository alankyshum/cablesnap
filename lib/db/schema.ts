/**
 * Drizzle ORM schema definitions for all CableSnap tables.
 *
 * This file is the single source of truth for TypeScript types derived from
 * the database schema. Table definitions here must match the runtime schema
 * created by migrations.ts exactly.
 *
 * Usage:
 *   import { exercises, workoutSets } from "./schema";
 *   type ExerciseRow = typeof exercises.$inferSelect;
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Core Tables ────────────────────────────────────────────────────────────

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  primary_muscles: text("primary_muscles").notNull(),
  secondary_muscles: text("secondary_muscles").notNull(),
  equipment: text("equipment").notNull(),
  instructions: text("instructions").notNull(),
  difficulty: text("difficulty").notNull(),
  is_custom: integer("is_custom").default(0),
  deleted_at: integer("deleted_at"),
  // Voltra-specific columns (added via ALTER TABLE)
  attachment: text("attachment").default("handle"),
  is_voltra: integer("is_voltra").default(0),
  // BLD-561: optional user-supplied illustration URIs for custom exercises.
  start_image_uri: text("start_image_uri"),
  end_image_uri: text("end_image_uri"),
  // BLD-913: bodyweight exercise progression paths.
  progression_group: text("progression_group"),
  progression_order: integer("progression_order"),
  // BLD-1028: pinned per-exercise notes — persists across sessions.
  notes: text("notes"),
  notes_updated_at: integer("notes_updated_at"),
  notes_backfill_dismissed_at: integer("notes_backfill_dismissed_at"),
  // BLD-1100: pinned per-exercise rest default. Logically constrained to [15, 600]
  // but SQLite cannot enforce CHECK on existing schema without a table rebuild.
  // Validation lives in setUserRestSeconds (throws RestBoundsError) and the
  // import-export path (clamps/drops on ingest).
  user_rest_seconds: integer("user_rest_seconds"),
  // BLD-1114: per-exercise pulley pin override. NULL = use global default (12).
  max_pulley_pins: integer("max_pulley_pins"),
});

export const workoutTemplates = sqliteTable("workout_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  is_starter: integer("is_starter").default(0),
  source: text("source"),
  // BLD-1000: curated programs library. is_curated=1 marks rows shipped by
  // CableSnap (e.g., r/bodyweightfitness Recommended Routine). Distinct from
  // is_starter — curated rows go through a separate seed path that does NOT
  // issue the BLD-467 canonical-repair UPDATE; user edits persist across
  // STARTER_VERSION bumps. See lib/db/seed.ts:upsertCuratedTemplates.
  is_curated: integer("is_curated").default(0),
});

export const templateExercises = sqliteTable("template_exercises", {
  id: text("id").primaryKey(),
  template_id: text("template_id").notNull(),
  exercise_id: text("exercise_id").notNull(),
  position: integer("position").notNull(),
  target_sets: integer("target_sets").default(3),
  target_reps: text("target_reps").default("8-12"),
  rest_seconds: integer("rest_seconds").default(90),
  link_id: text("link_id"),
  link_label: text("link_label").default(""),
  target_duration_seconds: integer("target_duration_seconds"),
  set_types: text("set_types").default("[]"),
}, (table) => [
  index("idx_template_exercises_template").on(table.template_id),
]);

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  template_id: text("template_id"),
  name: text("name").notNull(),
  started_at: integer("started_at").notNull(),
  clock_started_at: integer("clock_started_at"),
  completed_at: integer("completed_at"),
  duration_seconds: integer("duration_seconds"),
  notes: text("notes").default(""),
  program_day_id: text("program_day_id"),
  rating: integer("rating"),
  edited_at: integer("edited_at"),
  import_batch_id: text("import_batch_id"),
  // BLD-1060: per-gym cable stack calibration
  gym_id: text("gym_id"),
  gym_name_at_log: text("gym_name_at_log"),
  // BLD-1089: Grease-the-Groove Day Mode — session subtype discriminator.
  // 'workout' (default) = normal session; 'day_session' = GTG backing row.
  // day_session rows have completed_at = started_at = device-local midnight
  // so every existing WHERE completed_at IS NOT NULL analytics filter passes.
  kind: text("kind").default("workout").notNull(),
  // day_session_exercise_id + day_session_date together form the partial unique
  // key enforced by uniq_day_session_per_exercise_date WHERE kind='day_session'.
  // Both are NULL for kind='workout' rows.
  day_session_exercise_id: text("day_session_exercise_id"),
  day_session_date: text("day_session_date"),
}, (table) => [
  index("idx_workout_sessions_completed").on(table.completed_at),
  index("idx_workout_sessions_started_at").on(table.started_at),
  index("idx_workout_sessions_gym_started_at").on(table.gym_id, table.started_at),
]);

export const workoutSets = sqliteTable("workout_sets", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull(),
  exercise_id: text("exercise_id").notNull(),
  set_number: integer("set_number").notNull(),
  weight: real("weight"),
  reps: integer("reps"),
  completed: integer("completed").default(0),
  completed_at: integer("completed_at"),
  rpe: real("rpe"),
  notes: text("notes").default(""),
  link_id: text("link_id"),
  round: integer("round"),
  tempo: text("tempo"),
  swapped_from_exercise_id: text("swapped_from_exercise_id"),
  set_type: text("set_type").default("normal"),
  duration_seconds: integer("duration_seconds"),
  exercise_position: integer("exercise_position").default(0),
  bodyweight_modifier_kg: real("bodyweight_modifier_kg"),
  // BLD-771: per-set cable variant logging (attachment + pulley/mount position).
  // Both nullable. NULL = user did not specify or pre-migration row.
  // NEVER auto-stamped from `exercises.attachment` default — see lib/cable-variant.ts.
  attachment: text("attachment"),
  mount_position: text("mount_position"),
  // BLD-768: per-set bodyweight grip variant logging (grip type + grip width).
  // Both nullable. NULL = user did not specify or pre-migration row.
  // Gating + autofill in `lib/bodyweight-grip-variant.ts`.
  grip_type: text("grip_type"),
  grip_width: text("grip_width"),
  // BLD-1060: per-gym cable stack calibration
  stack_id: text("stack_id"),
  stack_marker: integer("stack_marker"),
  stack_unit_at_log: text("stack_unit_at_log"),
  stack_name_at_log: text("stack_name_at_log"),
  // BLD-1114: per-set cable pulley pin. NULL = unset.
  pulley_pin: integer("pulley_pin"),
}, (table) => [
  index("idx_workout_sets_exercise").on(table.exercise_id),
  index("idx_workout_sets_session").on(table.session_id),
  index("idx_workout_sets_session_exercise").on(table.session_id, table.exercise_id),
]);

// ─── Form Check Videos (BLD-1092) ─────────────────────────────────────────
// One video clip per completed working set (uniqueness enforced by uq_set_media_set_id).
// rel_path is relative to documentDirectory so iOS sandbox UUID churn after
// restore-from-backup does not orphan rows.
// Backup exclusion is handled at the OS level by the with-form-clips-backup
// plugin (BLD-1095) on both iOS (NSURLIsExcludedFromBackupKey) and Android
// (data_extraction_rules.xml).

export const setMedia = sqliteTable("set_media", {
  id: text("id").primaryKey(),                            // ULID
  set_id: text("set_id").notNull(),                       // FK → workout_sets.id (cascade enforced in service layer; PRAGMA foreign_keys=ON from BLD-1094)
  exercise_id: text("exercise_id").notNull(),             // denormalized for fast Form Library queries
  kind: text("kind").notNull(),                           // "video" | "setup_photo"; no default — every INSERT must specify
  rel_path: text("rel_path").notNull(),                   // relative to documentDirectory
  duration_ms: integer("duration_ms"),
  size_bytes: integer("size_bytes"),
  width: integer("width"),
  height: integer("height"),
  pending_delete: integer("pending_delete").notNull().default(0), // tombstone for two-phase delete
  created_at: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("uq_set_media_set_id").on(t.set_id, t.kind),                                        // one row per kind per set
  index("idx_set_media_exercise_created").on(t.exercise_id, t.created_at),
  index("idx_set_media_pending_delete_partial").on(t.pending_delete).where(sql`${t.pending_delete} = 1`),
]);

// ─── Nutrition Tables ───────────────────────────────────────────────────────

export const foodEntries = sqliteTable("food_entries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  calories: real("calories").notNull().default(0),
  protein: real("protein").notNull().default(0),
  carbs: real("carbs").notNull().default(0),
  fat: real("fat").notNull().default(0),
  serving_size: text("serving_size").notNull().default("1 serving"),
  is_favorite: integer("is_favorite").notNull().default(0),
  created_at: integer("created_at").notNull(),
});

export const dailyLog = sqliteTable("daily_log", {
  id: text("id").primaryKey(),
  food_entry_id: text("food_entry_id").notNull(),
  date: text("date").notNull(),
  meal: text("meal").notNull().default("snack"),
  servings: real("servings").default(1),
  logged_at: integer("logged_at").notNull(),
}, (table) => [
  index("idx_daily_log_date").on(table.date),
]);

export const macroTargets = sqliteTable("macro_targets", {
  id: text("id").primaryKey(),
  calories: real("calories").default(2000),
  protein: real("protein").default(150),
  carbs: real("carbs").default(250),
  fat: real("fat").default(65),
  updated_at: integer("updated_at").notNull(),
});

export const mealTemplates = sqliteTable("meal_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  meal: text("meal").notNull(),
  cached_calories: real("cached_calories").notNull().default(0),
  cached_protein: real("cached_protein").notNull().default(0),
  cached_carbs: real("cached_carbs").notNull().default(0),
  cached_fat: real("cached_fat").notNull().default(0),
  last_used_at: integer("last_used_at"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export const mealTemplateItems = sqliteTable("meal_template_items", {
  id: text("id").primaryKey(),
  template_id: text("template_id").notNull(),
  food_entry_id: text("food_entry_id").notNull(),
  servings: real("servings").notNull().default(1),
  sort_order: integer("sort_order").notNull().default(0),
}, (table) => [
  index("idx_meal_template_items_template").on(table.template_id),
]);

// ─── Body Tracking Tables ───────────────────────────────────────────────────

export const bodyWeight = sqliteTable("body_weight", {
  id: text("id").primaryKey(),
  weight: real("weight").notNull(),
  date: text("date").notNull().unique(),
  notes: text("notes").default(""),
  logged_at: integer("logged_at").notNull(),
});

export const bodyMeasurements = sqliteTable("body_measurements", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(),
  waist: real("waist"),
  chest: real("chest"),
  hips: real("hips"),
  left_arm: real("left_arm"),
  right_arm: real("right_arm"),
  left_thigh: real("left_thigh"),
  right_thigh: real("right_thigh"),
  left_calf: real("left_calf"),
  right_calf: real("right_calf"),
  neck: real("neck"),
  body_fat: real("body_fat"),
  notes: text("notes").default(""),
  logged_at: integer("logged_at").notNull(),
});

export const bodySettings = sqliteTable("body_settings", {
  id: text("id").primaryKey().default("default"),
  weight_unit: text("weight_unit").notNull().default("kg"),
  measurement_unit: text("measurement_unit").notNull().default("cm"),
  sex: text("sex").notNull().default("male"),
  weight_goal: real("weight_goal"),
  body_fat_goal: real("body_fat_goal"),
  updated_at: integer("updated_at").notNull(),
});

// ─── Program Tables ─────────────────────────────────────────────────────────

export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  is_active: integer("is_active").default(0),
  current_day_id: text("current_day_id"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  deleted_at: integer("deleted_at"),
  is_starter: integer("is_starter").default(0),
  // BLD-1000: curated programs library. See workoutTemplates.is_curated above.
  is_curated: integer("is_curated").default(0),
});

export const programDays = sqliteTable("program_days", {
  id: text("id").primaryKey(),
  program_id: text("program_id").notNull(),
  template_id: text("template_id"),
  position: integer("position").notNull(),
  label: text("label").default(""),
});

export const programLog = sqliteTable("program_log", {
  id: text("id").primaryKey(),
  program_id: text("program_id").notNull(),
  day_id: text("day_id").notNull(),
  session_id: text("session_id").notNull(),
  completed_at: integer("completed_at").notNull(),
});

// ─── Settings & Config Tables ───────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// ─── Schedule Tables ────────────────────────────────────────────────────────

export const programSchedule = sqliteTable("program_schedule", {
  program_id: text("program_id").notNull(),
  day_of_week: integer("day_of_week").notNull(),
  template_id: text("template_id").notNull(),
});

// ─── Logging & Analytics Tables ─────────────────────────────────────────────

export const errorLog = sqliteTable("error_log", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  stack: text("stack"),
  component: text("component"),
  fatal: integer("fatal").notNull().default(0),
  timestamp: integer("timestamp").notNull(),
  app_version: text("app_version"),
  platform: text("platform"),
  os_version: text("os_version"),
});

export const interactionLog = sqliteTable("interaction_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  screen: text("screen").notNull(),
  detail: text("detail"),
  timestamp: integer("timestamp").notNull(),
});

// ─── Progress Photos ────────────────────────────────────────────────────────

export const progressPhotos = sqliteTable("progress_photos", {
  id: text("id").primaryKey(),
  file_path: text("file_path").notNull(),
  thumbnail_path: text("thumbnail_path"),
  capture_date: text("capture_date").notNull(),
  display_date: text("display_date").notNull(),
  pose_category: text("pose_category"),
  note: text("note"),
  width: integer("width"),
  height: integer("height"),
  deleted_at: text("deleted_at"),
  created_at: text("created_at").notNull(),
}, (table) => [
  index("idx_progress_photos_display_date").on(table.display_date),
  index("idx_progress_photos_deleted").on(table.deleted_at),
]);

// ─── Achievements ───────────────────────────────────────────────────────────

export const achievementsEarned = sqliteTable("achievements_earned", {
  achievement_id: text("achievement_id").primaryKey(),
  earned_at: integer("earned_at").notNull(),
});

// ─── Integration Tables ─────────────────────────────────────────────────────

export const stravaConnection = sqliteTable("strava_connection", {
  id: integer("id").primaryKey().default(1),
  athlete_id: integer("athlete_id").notNull(),
  athlete_name: text("athlete_name").notNull(),
  connected_at: integer("connected_at").notNull(),
});

export const stravaSyncLog = sqliteTable("strava_sync_log", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().unique(),
  strava_activity_id: text("strava_activity_id"),
  status: text("status").notNull(),
  error: text("error"),
  retry_count: integer("retry_count").default(0),
  created_at: integer("created_at").notNull(),
  synced_at: integer("synced_at"),
}, (table) => [
  index("idx_strava_sync_log_status").on(table.status),
]);

// ─── Strength Goals ─────────────────────────────────────────────────────────

export const strengthGoals = sqliteTable("strength_goals", {
  id: text("id").primaryKey(),
  exercise_id: text("exercise_id").notNull(),
  target_weight: real("target_weight"),
  target_reps: integer("target_reps"),
  deadline: text("deadline"),
  achieved_at: text("achieved_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
}, (table) => [
  index("idx_strength_goals_exercise").on(table.exercise_id),
  index("idx_strength_goals_active").on(table.achieved_at),
]);

// ─── Hydration (BLD-600) ────────────────────────────────────────────────────

export const waterLogs = sqliteTable("water_logs", {
  id: text("id").primaryKey(),
  date_key: text("date_key").notNull(),
  amount_ml: integer("amount_ml").notNull(),
  logged_at: integer("logged_at").notNull(),
}, (table) => [
  index("idx_water_logs_date_key").on(table.date_key),
]);

// ─── Gym Profiles (BLD-1059) ─────────────────────────────────────────────────

export const gymProfiles = sqliteTable("gym_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes").default(""),
  is_default: integer("is_default").default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  deleted_at: integer("deleted_at"),
});

export const cableStacks = sqliteTable("cable_stacks", {
  id: text("id").primaryKey(),
  gym_id: text("gym_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("kg"),
  position: integer("position").notNull().default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  deleted_at: integer("deleted_at"),
}, (table) => [
  index("idx_cable_stacks_gym").on(table.gym_id),
]);

export const stackCalibrations = sqliteTable("stack_calibrations", {
  id: text("id").primaryKey(),
  stack_id: text("stack_id").notNull(),
  marker: integer("marker").notNull(),
  true_weight: real("true_weight").notNull(),
}, (table) => [
  index("idx_stack_calibrations_stack").on(table.stack_id),
]);

// ─── Inferred Select Types ─────────────────────────────────────────────────
// Use these instead of manually-defined Row types.

export type ExerciseRow = typeof exercises.$inferSelect;
export type WorkoutTemplateRow = typeof workoutTemplates.$inferSelect;
export type TemplateExerciseBaseRow = typeof templateExercises.$inferSelect;
export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type WorkoutSetRow = typeof workoutSets.$inferSelect;
export type FoodEntryRow = typeof foodEntries.$inferSelect;
export type DailyLogBaseRow = typeof dailyLog.$inferSelect;
export type MacroTargetsRow = typeof macroTargets.$inferSelect;
export type MealTemplateRow = typeof mealTemplates.$inferSelect;
export type MealTemplateItemBaseRow = typeof mealTemplateItems.$inferSelect;
export type BodyWeightRow = typeof bodyWeight.$inferSelect;
export type BodyMeasurementsRow = typeof bodyMeasurements.$inferSelect;
export type BodySettingsRow = typeof bodySettings.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type ProgramDayRow = typeof programDays.$inferSelect;
export type ProgramLogRow = typeof programLog.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type ProgramScheduleRow = typeof programSchedule.$inferSelect;
export type ErrorLogRow = typeof errorLog.$inferSelect;
export type InteractionLogRow = typeof interactionLog.$inferSelect;
export type ProgressPhotoRow = typeof progressPhotos.$inferSelect;
export type AchievementEarnedRow = typeof achievementsEarned.$inferSelect;
export type StravaConnectionRow = typeof stravaConnection.$inferSelect;
export type StravaSyncLogRow = typeof stravaSyncLog.$inferSelect;
export type StrengthGoalRow = typeof strengthGoals.$inferSelect;
export type WaterLogRow = typeof waterLogs.$inferSelect;
export type GymProfileRow = typeof gymProfiles.$inferSelect;
export type CableStackRow = typeof cableStacks.$inferSelect;
export type StackCalibrationRow = typeof stackCalibrations.$inferSelect;
export type SetMediaRow = typeof setMedia.$inferSelect;
