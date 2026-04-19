import { asc, gte, sql, isNotNull, and } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { bodyWeight, bodyMeasurements, workoutSessions, workoutSets, exercises, dailyLog, foodEntries } from "./schema";

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
  const db = await getDrizzle();
  const rows = await db
    .select({
      date: sql<string>`date(${workoutSessions.started_at} / 1000, 'unixepoch')`,
      exercise: sql<string>`COALESCE(${exercises.name}, 'Deleted Exercise')`,
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      duration_seconds: workoutSessions.duration_seconds,
      notes: workoutSessions.notes,
      set_rpe: workoutSets.rpe,
      set_notes: workoutSets.notes,
      link_id: workoutSets.link_id,
      training_mode: workoutSets.training_mode,
      tempo: workoutSets.tempo,
    })
    .from(workoutSessions)
    .innerJoin(workoutSets, sql`${workoutSets.session_id} = ${workoutSessions.id}`)
    .leftJoin(exercises, sql`${exercises.id} = ${workoutSets.exercise_id}`)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, since)
      )
    )
    .orderBy(
      asc(workoutSessions.started_at),
      sql`exercise ASC`,
      asc(workoutSets.set_number)
    );

  return rows as unknown as WorkoutCSVRow[];
}

export async function getNutritionCSVData(since: number): Promise<NutritionCSVRow[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      date: dailyLog.date,
      meal: dailyLog.meal,
      food: foodEntries.name,
      servings: dailyLog.servings,
      calories: sql<number>`ROUND(${foodEntries.calories} * ${dailyLog.servings}, 1)`,
      protein: sql<number>`ROUND(${foodEntries.protein} * ${dailyLog.servings}, 1)`,
      carbs: sql<number>`ROUND(${foodEntries.carbs} * ${dailyLog.servings}, 1)`,
      fat: sql<number>`ROUND(${foodEntries.fat} * ${dailyLog.servings}, 1)`,
    })
    .from(dailyLog)
    .innerJoin(foodEntries, sql`${foodEntries.id} = ${dailyLog.food_entry_id}`)
    .where(gte(dailyLog.date, sql`date(${since} / 1000, 'unixepoch')`))
    .orderBy(asc(dailyLog.date), asc(dailyLog.meal));

  return rows as unknown as NutritionCSVRow[];
}

export async function getCSVCounts(since: number): Promise<{ sessions: number; entries: number }> {
  const db = await getDrizzle();
  const [s, e] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(workoutSessions)
      .where(and(isNotNull(workoutSessions.completed_at), gte(workoutSessions.started_at, since)))
      .then((r) => r[0]),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(dailyLog)
      .where(gte(dailyLog.date, sql`date(${since} / 1000, 'unixepoch')`))
      .then((r) => r[0]),
  ]);
  return { sessions: s?.count ?? 0, entries: e?.count ?? 0 };
}

export async function getBodyWeightCSVData(since: number): Promise<BodyWeightCSVRow[]> {
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  const db = await getDrizzle();
  return db.select({ date: bodyWeight.date, weight: bodyWeight.weight, notes: bodyWeight.notes })
    .from(bodyWeight)
    .where(gte(bodyWeight.date, cutoff))
    .orderBy(asc(bodyWeight.date)) as unknown as Promise<BodyWeightCSVRow[]>;
}

export async function getBodyMeasurementsCSVData(since: number): Promise<BodyMeasurementsCSVRow[]> {
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  const db = await getDrizzle();
  return db.select({
    date: bodyMeasurements.date,
    waist: bodyMeasurements.waist,
    chest: bodyMeasurements.chest,
    hips: bodyMeasurements.hips,
    left_arm: bodyMeasurements.left_arm,
    right_arm: bodyMeasurements.right_arm,
    left_thigh: bodyMeasurements.left_thigh,
    right_thigh: bodyMeasurements.right_thigh,
    left_calf: bodyMeasurements.left_calf,
    right_calf: bodyMeasurements.right_calf,
    neck: bodyMeasurements.neck,
    body_fat: bodyMeasurements.body_fat,
    notes: bodyMeasurements.notes,
  })
    .from(bodyMeasurements)
    .where(gte(bodyMeasurements.date, cutoff))
    .orderBy(asc(bodyMeasurements.date)) as unknown as Promise<BodyMeasurementsCSVRow[]>;
}
