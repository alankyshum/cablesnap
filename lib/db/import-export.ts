import type {
  WorkoutTemplate,
  TemplateExercise,
  WorkoutSession,
  WorkoutSet,
  MacroTargets,
  BodyWeight,
  BodyMeasurements,
  BodySettings,
} from "../types";
import { getDatabase } from "./helpers";

export async function exportAllData(): Promise<{
  version: number;
  exported_at: string;
  exercises: unknown[];
  templates: WorkoutTemplate[];
  template_exercises: TemplateExercise[];
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  food_entries: unknown[];
  daily_log: { id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }[];
  macro_targets: MacroTargets[];
  body_weight: BodyWeight[];
  body_measurements: BodyMeasurements[];
  body_settings: BodySettings[];
}> {
  const database = await getDatabase();
  const exercises = await database.getAllAsync("SELECT * FROM exercises");
  const templates = await database.getAllAsync<WorkoutTemplate>("SELECT * FROM workout_templates");
  const tplExercises = await database.getAllAsync<TemplateExercise>("SELECT * FROM template_exercises");
  const sessions = await database.getAllAsync<WorkoutSession>("SELECT * FROM workout_sessions");
  const sets = await database.getAllAsync<WorkoutSet>("SELECT * FROM workout_sets");
  const foods = await database.getAllAsync("SELECT * FROM food_entries");
  const logs = await database.getAllAsync<{ id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }>("SELECT * FROM daily_log");
  const targets = await database.getAllAsync<MacroTargets>("SELECT * FROM macro_targets");
  const weights = await database.getAllAsync<BodyWeight>("SELECT * FROM body_weight");
  const measurements = await database.getAllAsync<BodyMeasurements>("SELECT * FROM body_measurements");
  const bodySettings = await database.getAllAsync<BodySettings>("SELECT * FROM body_settings");
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    exercises,
    templates,
    template_exercises: tplExercises,
    sessions,
    sets,
    food_entries: foods,
    daily_log: logs,
    macro_targets: targets,
    body_weight: weights,
    body_measurements: measurements,
    body_settings: bodySettings,
  };
}

export async function importData(data: {
  version: number;
  exercises?: { id: string; name: string; category: string; primary_muscles: string; secondary_muscles: string; equipment: string; instructions: string; difficulty: string; is_custom: number }[];
  templates?: { id: string; name: string; created_at: number; updated_at: number }[];
  template_exercises?: { id: string; template_id: string; exercise_id: string; position: number; target_sets: number; target_reps: string; rest_seconds: number; link_id?: string | null; link_label?: string }[];
  sessions?: { id: string; template_id: string | null; name: string; started_at: number; completed_at: number | null; duration_seconds: number | null; notes: string }[];
  sets?: { id: string; session_id: string; exercise_id: string; set_number: number; weight: number | null; reps: number | null; completed: number; completed_at: number | null; set_rpe?: number | null; set_notes?: string; link_id?: string | null; round?: number | null; training_mode?: string | null; tempo?: string | null }[];
  food_entries?: { id: string; name: string; calories: number; protein: number; carbs: number; fat: number; serving_size: string; is_favorite: number; created_at: number }[];
  daily_log?: { id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }[];
  macro_targets?: { id: string; calories: number; protein: number; carbs: number; fat: number; updated_at: number }[];
  body_weight?: { id: string; weight: number; date: string; notes: string; logged_at: number }[];
  body_measurements?: { id: string; date: string; waist: number | null; chest: number | null; hips: number | null; left_arm: number | null; right_arm: number | null; left_thigh: number | null; right_thigh: number | null; left_calf: number | null; right_calf: number | null; neck: number | null; body_fat: number | null; notes: string; logged_at: number }[];
  body_settings?: { id: string; weight_unit: string; measurement_unit: string; weight_goal: number | null; body_fat_goal: number | null; updated_at: number }[];
}): Promise<{ inserted: number }> {
  const database = await getDatabase();
  let inserted = 0;

  await database.withTransactionAsync(async () => {
    if (data.exercises) {
      for (const e of data.exercises) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [e.id, e.name, e.category, e.primary_muscles, e.secondary_muscles, e.equipment, e.instructions, e.difficulty, e.is_custom]
        );
        inserted += r.changes;
      }
    }

    if (data.templates) {
      for (const t of data.templates) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [t.id, t.name, t.created_at, t.updated_at]
        );
        inserted += r.changes;
      }
    }

    if (data.template_exercises) {
      for (const te of data.template_exercises) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [te.id, te.template_id, te.exercise_id, te.position, te.target_sets, te.target_reps, te.rest_seconds, te.link_id ?? null, te.link_label ?? ""]
        );
        inserted += r.changes;
      }
    }

    if (data.sessions) {
      for (const s of data.sessions) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [s.id, s.template_id, s.name, s.started_at, s.completed_at, s.duration_seconds, s.notes]
        );
        inserted += r.changes;
      }
    }

    if (data.sets) {
      for (const s of data.sets) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, training_mode, tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [s.id, s.session_id, s.exercise_id, s.set_number, s.weight, s.reps, s.completed, s.completed_at, s.set_rpe ?? null, s.set_notes ?? "", s.link_id ?? null, s.round ?? null, s.training_mode ?? null, s.tempo ?? null]
        );
        inserted += r.changes;
      }
    }

    if (data.food_entries) {
      for (const f of data.food_entries) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [f.id, f.name, f.calories, f.protein, f.carbs, f.fat, f.serving_size, f.is_favorite, f.created_at]
        );
        inserted += r.changes;
      }
    }

    if (data.daily_log) {
      for (const l of data.daily_log) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)",
          [l.id, l.food_entry_id, l.date, l.meal, l.servings, l.logged_at]
        );
        inserted += r.changes;
      }
    }

    if (data.macro_targets) {
      for (const t of data.macro_targets) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [t.id, t.calories, t.protein, t.carbs, t.fat, t.updated_at]
        );
        inserted += r.changes;
      }
    }

    if (data.body_weight) {
      for (const w of data.body_weight) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO body_weight (id, weight, date, notes, logged_at) VALUES (?, ?, ?, ?, ?)",
          [w.id, w.weight, w.date, w.notes, w.logged_at]
        );
        inserted += r.changes;
      }
    }

    if (data.body_measurements) {
      for (const m of data.body_measurements) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO body_measurements (id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [m.id, m.date, m.waist, m.chest, m.hips, m.left_arm, m.right_arm, m.left_thigh, m.right_thigh, m.left_calf, m.right_calf, m.neck, m.body_fat, m.notes, m.logged_at]
        );
        inserted += r.changes;
      }
    }

    if (data.body_settings) {
      for (const s of data.body_settings) {
        const r = await database.runAsync(
          "INSERT OR IGNORE INTO body_settings (id, weight_unit, measurement_unit, weight_goal, body_fat_goal, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [s.id, s.weight_unit, s.measurement_unit, s.weight_goal, s.body_fat_goal, s.updated_at]
        );
        inserted += r.changes;
      }
    }
  });

  return { inserted };
}
