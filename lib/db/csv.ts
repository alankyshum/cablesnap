import { query, queryOne } from "./helpers";

export type WorkoutCSVRow = {
  date: string;
  exercise: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string;
  set_rpe: number | null;
  set_notes: string;
  link_id: string | null;
  training_mode: string | null;
  tempo: string | null;
};

export type NutritionCSVRow = {
  date: string;
  meal: string;
  food: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type BodyWeightCSVRow = {
  date: string;
  weight: number;
  notes: string;
};

export type BodyMeasurementsCSVRow = {
  date: string;
  waist: number | null;
  chest: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
  left_calf: number | null;
  right_calf: number | null;
  neck: number | null;
  body_fat: number | null;
  notes: string;
};

export async function getWorkoutCSVData(since: number): Promise<WorkoutCSVRow[]> {
  return query<WorkoutCSVRow>(
    `SELECT
       date(ws.started_at / 1000, 'unixepoch') AS date,
       COALESCE(e.name, 'Deleted Exercise') AS exercise,
       wset.set_number,
       wset.weight,
       wset.reps,
       ws.duration_seconds,
       ws.notes,
       wset.rpe AS set_rpe,
       wset.notes AS set_notes,
       wset.link_id,
       wset.training_mode,
       wset.tempo
     FROM workout_sessions ws
     JOIN workout_sets wset ON wset.session_id = ws.id
     LEFT JOIN exercises e ON e.id = wset.exercise_id
     WHERE ws.completed_at IS NOT NULL
       AND ws.started_at >= ?
     ORDER BY ws.started_at ASC, exercise ASC, wset.set_number ASC`,
    [since]
  );
}

export async function getNutritionCSVData(since: number): Promise<NutritionCSVRow[]> {
  return query<NutritionCSVRow>(
    `SELECT
       dl.date,
       dl.meal,
       f.name AS food,
       dl.servings,
       ROUND(f.calories * dl.servings, 1) AS calories,
       ROUND(f.protein * dl.servings, 1) AS protein,
       ROUND(f.carbs * dl.servings, 1) AS carbs,
       ROUND(f.fat * dl.servings, 1) AS fat
     FROM daily_log dl
     JOIN food_entries f ON f.id = dl.food_entry_id
     WHERE dl.date >= date(? / 1000, 'unixepoch')
     ORDER BY dl.date ASC, dl.meal ASC`,
    [since]
  );
}

export async function getCSVCounts(since: number): Promise<{ sessions: number; entries: number }> {
  const s = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ?`,
    [since]
  );
  const e = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM daily_log
     WHERE date >= date(? / 1000, 'unixepoch')`,
    [since]
  );
  return { sessions: s?.count ?? 0, entries: e?.count ?? 0 };
}

export async function getBodyWeightCSVData(since: number): Promise<BodyWeightCSVRow[]> {
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  return query<BodyWeightCSVRow>(
    "SELECT date, weight, notes FROM body_weight WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
}

export async function getBodyMeasurementsCSVData(since: number): Promise<BodyMeasurementsCSVRow[]> {
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  return query<BodyMeasurementsCSVRow>(
    "SELECT date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes FROM body_measurements WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
}
