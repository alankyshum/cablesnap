import { z } from "zod";

const templateSetTypeSchema = z.enum(["normal", "warmup", "dropset", "failure"]);
const templateSourceSchema = z.enum(["coach"]);

const exerciseImportSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  primary_muscles: z.string(),
  secondary_muscles: z.string(),
  equipment: z.string(),
  instructions: z.string(),
  difficulty: z.string(),
  is_custom: z.number(),
});

const templateImportSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  source: templateSourceSchema.nullable().optional(),
});

const templateExerciseImportSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  exercise_id: z.string(),
  position: z.number(),
  target_sets: z.number(),
  target_reps: z.string(),
  rest_seconds: z.number(),
  link_id: z.string().nullable().optional(),
  link_label: z.string().optional(),
  target_duration_seconds: z.number().nullable().optional(),
  set_types: z.array(templateSetTypeSchema).optional(),
});

const coachTemplateExerciseSchema = z.object({
  exercise_id: z.string(),
  target_sets: z.number().int().min(1),
  target_reps: z.string().min(1),
  rest_seconds: z.number().int().min(0).default(90),
  link_id: z.string().nullable().optional(),
  link_label: z.string().optional(),
  target_duration_seconds: z.number().int().min(0).nullable().optional(),
  set_types: z.array(templateSetTypeSchema).optional(),
});

const coachTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  exercises: z.array(coachTemplateExerciseSchema).min(1),
});

const sessionImportSchema = z.object({
  id: z.string(),
  template_id: z.string().nullable(),
  name: z.string(),
  started_at: z.number(),
  completed_at: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  notes: z.string(),
});

const setImportSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  exercise_id: z.string(),
  set_number: z.number(),
  weight: z.number().nullable(),
  reps: z.number().nullable(),
  completed: z.number(),
  completed_at: z.number().nullable(),
  set_rpe: z.number().nullable().optional(),
  set_notes: z.string().optional(),
  link_id: z.string().nullable().optional(),
  round: z.number().nullable().optional(),
  tempo: z.string().nullable().optional(),
});

const foodEntryImportSchema = z.object({
  id: z.string(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  serving_size: z.string(),
  is_favorite: z.number(),
  created_at: z.number(),
});

const dailyLogImportSchema = z.object({
  id: z.string(),
  food_entry_id: z.string(),
  date: z.string(),
  meal: z.string(),
  servings: z.number(),
  logged_at: z.number(),
});

const macroTargetsImportSchema = z.object({
  id: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  updated_at: z.number(),
});

const bodyWeightImportSchema = z.object({
  id: z.string(),
  weight: z.number(),
  date: z.string(),
  notes: z.string(),
  logged_at: z.number(),
});

const bodyMeasurementsImportSchema = z.object({
  id: z.string(),
  date: z.string(),
  waist: z.number().nullable(),
  chest: z.number().nullable(),
  hips: z.number().nullable(),
  left_arm: z.number().nullable(),
  right_arm: z.number().nullable(),
  left_thigh: z.number().nullable(),
  right_thigh: z.number().nullable(),
  left_calf: z.number().nullable(),
  right_calf: z.number().nullable(),
  neck: z.number().nullable(),
  body_fat: z.number().nullable(),
  notes: z.string(),
  logged_at: z.number(),
});

const bodySettingsImportSchema = z.object({
  id: z.string(),
  weight_unit: z.string(),
  measurement_unit: z.string(),
  weight_goal: z.number().nullable(),
  body_fat_goal: z.number().nullable(),
  updated_at: z.number(),
});

export const importDataSchema = z.object({
  version: z.number(),
  exercises: z.array(exerciseImportSchema).optional(),
  templates: z.array(templateImportSchema).optional(),
  template_exercises: z.array(templateExerciseImportSchema).optional(),
  sessions: z.array(sessionImportSchema).optional(),
  sets: z.array(setImportSchema).optional(),
  food_entries: z.array(foodEntryImportSchema).optional(),
  daily_log: z.array(dailyLogImportSchema).optional(),
  macro_targets: z.array(macroTargetsImportSchema).optional(),
  body_weight: z.array(bodyWeightImportSchema).optional(),
  body_measurements: z.array(bodyMeasurementsImportSchema).optional(),
  body_settings: z.array(bodySettingsImportSchema).optional(),
});

export const coachTemplateImportSchema = z.object({
  version: z.literal(1),
  templates: z.array(coachTemplateSchema).min(1),
});

export type ImportData = z.infer<typeof importDataSchema>;
export type CoachTemplateImportData = z.infer<typeof coachTemplateImportSchema>;

export function validateImportData(data: unknown): { success: true; data: ImportData } | { success: false; error: string } {
  const result = importDataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return {
    success: false,
    error: `Invalid data: ${firstError.path.join(".")} - ${firstError.message}`,
  };
}

export function validateCoachTemplateImportData(data: unknown): { success: true; data: CoachTemplateImportData } | { success: false; error: string } {
  const result = coachTemplateImportSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return {
    success: false,
    error: `Invalid data: ${firstError.path.join(".")} - ${firstError.message}`,
  };
}
