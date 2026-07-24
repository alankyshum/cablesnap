import { csvEscape } from "./csv";
import type {
  WorkoutCSVRow,
  NutritionCSVRow,
  BodyWeightCSVRow,
  BodyMeasurementsCSVRow,
  ExerciseCSVRow,
} from "./db";

export function workoutCSV(rows: WorkoutCSVRow[]): string {
  const header =
    "date,exercise,set_number,weight,reps,side,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg,pulley_pin,kind,day_session_exercise_id,day_session_date,stack_marker,stack_name_at_log,set_type,mini_set_reps,mini_set_weights,mini_set_rests,band_ids";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.date),
        csvEscape(r.exercise),
        csvEscape(r.set_number),
        csvEscape(r.weight),
        csvEscape(r.reps),
        csvEscape(r.side ?? ""),
        csvEscape(r.duration_seconds),
        csvEscape(r.notes),
        csvEscape(r.set_rpe),
        csvEscape(r.set_notes),
        csvEscape(r.link_id),
        csvEscape(r.bodyweight_modifier_kg),
        csvEscape(r.pulley_pin),
        csvEscape(r.kind),
        csvEscape(r.day_session_exercise_id),
        csvEscape(r.day_session_date),
        csvEscape(r.stack_marker),
        csvEscape(r.stack_name_at_log),
        // BLD-1168: advanced set columns. Trailing for backward-compat; older importers ignore unknown trailing columns.
        csvEscape(r.set_type ?? "normal"),
        csvEscape(r.mini_set_reps ?? ""),
        csvEscape(r.mini_set_weights ?? ""),
        csvEscape(r.mini_set_rests ?? ""),
        // BLD-4293: band ids as comma-separated list (empty for non-band sets).
        csvEscape(r.band_ids ?? ""),
      ].join(",")
    );
  }
  return [header, ...lines].join("\n");
}

export function nutritionCSV(rows: NutritionCSVRow[]): string {
  const header = "date,meal,food,servings,calories,protein,carbs,fat";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.date),
        csvEscape(r.meal),
        csvEscape(r.food),
        csvEscape(r.servings),
        csvEscape(r.calories),
        csvEscape(r.protein),
        csvEscape(r.carbs),
        csvEscape(r.fat),
      ].join(",")
    );
  }
  return [header, ...lines].join("\n");
}

export function bodyWeightCSV(rows: BodyWeightCSVRow[]): string {
  const header = "date,weight_kg,notes";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [csvEscape(r.date), csvEscape(r.weight), csvEscape(r.notes)].join(",")
    );
  }
  return [header, ...lines].join("\n");
}

export function bodyMeasurementsCSV(rows: BodyMeasurementsCSVRow[]): string {
  const header =
    "date,waist_cm,chest_cm,hips_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,left_calf_cm,right_calf_cm,neck_cm,body_fat_pct,notes";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.date),
        csvEscape(r.waist),
        csvEscape(r.chest),
        csvEscape(r.hips),
        csvEscape(r.left_arm),
        csvEscape(r.right_arm),
        csvEscape(r.left_thigh),
        csvEscape(r.right_thigh),
        csvEscape(r.left_calf),
        csvEscape(r.right_calf),
        csvEscape(r.neck),
        csvEscape(r.body_fat),
        csvEscape(r.notes),
      ].join(",")
    );
  }
  return [header, ...lines].join("\n");
}

/**
 * BLD-1158 AC1.7/AC1.8: Custom exercise CSV serializer.
 *
 * The `default_tempo` column is placed LAST (backward-compat: older importers
 * ignore unknown trailing columns). Null/undefined → empty string.
 */
export function exercisesCSV(rows: ExerciseCSVRow[]): string {
  // AC1.7: default_tempo is the FINAL column for backward compatibility.
  const header =
    "id,name,category,equipment,difficulty,primary_muscles,secondary_muscles,instructions,default_tempo";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.name),
        csvEscape(r.category),
        csvEscape(r.equipment),
        csvEscape(r.difficulty),
        csvEscape(r.primary_muscles),
        csvEscape(r.secondary_muscles),
        csvEscape(r.instructions),
        // Null/undefined → empty string (preserves column count for round-trip).
        csvEscape(r.default_tempo ?? null),
      ].join(",")
    );
  }
  return [header, ...lines].join("\n");
}
