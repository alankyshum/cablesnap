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
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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
  mount_position: text("mount_position"),
  attachment: text("attachment").default("handle"),
  training_modes: text("training_modes").default('["weight"]'),
  is_voltra: integer("is_voltra").default(0),
});

export const workoutTemplates = sqliteTable("workout_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  is_starter: integer("is_starter").default(0),
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
  training_mode: text("training_mode"),
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
}, (table) => [
  index("idx_workout_sessions_completed").on(table.completed_at),
  index("idx_workout_sessions_started_at").on(table.started_at),
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
  training_mode: text("training_mode"),
  tempo: text("tempo"),
  swapped_from_exercise_id: text("swapped_from_exercise_id"),
  set_type: text("set_type").default("normal"),
  duration_seconds: integer("duration_seconds"),
  exercise_position: integer("exercise_position").default(0),
  bodyweight_modifier_kg: real("bodyweight_modifier_kg"),
}, (table) => [
  index("idx_workout_sets_exercise").on(table.exercise_id),
  index("idx_workout_sets_session").on(table.session_id),
  index("idx_workout_sets_session_exercise").on(table.session_id, table.exercise_id),
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

export const healthConnectSyncLog = sqliteTable("health_connect_sync_log", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().unique(),
  health_connect_record_id: text("health_connect_record_id"),
  status: text("status").notNull(),
  error: text("error"),
  retry_count: integer("retry_count").default(0),
  created_at: integer("created_at").notNull(),
  synced_at: integer("synced_at"),
}, (table) => [
  index("idx_hc_sync_log_status").on(table.status),
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
export type HealthConnectSyncLogRow = typeof healthConnectSyncLog.$inferSelect;
export type StrengthGoalRow = typeof strengthGoals.$inferSelect;
export type WaterLogRow = typeof waterLogs.$inferSelect;
