import { csvEscape } from "./csv";
import type {
  WorkoutCSVRow,
  NutritionCSVRow,
  BodyWeightCSVRow,
  BodyMeasurementsCSVRow,
} from "./db";

export function workoutCSV(rows: WorkoutCSVRow[]): string {
  const header =
    "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg";
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.date),
        csvEscape(r.exercise),
        csvEscape(r.set_number),
        csvEscape(r.weight),
        csvEscape(r.reps),
        csvEscape(r.duration_seconds),
        csvEscape(r.notes),
        csvEscape(r.set_rpe),
        csvEscape(r.set_notes),
        csvEscape(r.link_id),
        csvEscape(r.bodyweight_modifier_kg),
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
