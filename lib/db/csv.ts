import { asc, gte, sql, isNotNull, and, inArray } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { bodyWeight, bodyMeasurements, workoutSessions, workoutSets, workoutSetSegments, exercises, dailyLog, foodEntries } from "./schema";
import { ADVANCED_SET_TYPES } from "./sets";

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
  tempo: string | null;
  // BLD-541: signed bodyweight modifier (kg) for the set. null for
  // non-bodyweight sets AND for pure-bodyweight sets with no modifier.
  bodyweight_modifier_kg: number | null;
  pulley_pin: number | null;
  // BLD-1089: session subtype + GTG day-session metadata for CSV export.
  kind: string | null;
  day_session_exercise_id: string | null;
  day_session_date: string | null;
  // BLD-1126 AC13: stack marker and snapshot stack name for cable sets.
  stack_marker: number | null;
  stack_name_at_log: string | null;
  // BLD-1168: advanced set type (rest_pause, cluster, myo_reps, or legacy normal/warmup/dropset/failure).
  set_type: string | null;
  /** Semicolon-separated reps per mini-set, e.g. "8;3;2". Null/empty for non-advanced sets (back-compat). */
  mini_set_reps: string | null;
  /** Semicolon-separated weights (kg) per mini-set. Empty element means inherit parent weight. */
  mini_set_weights: string | null;
  /** Semicolon-separated rest durations (seconds) after each mini-set. */
  mini_set_rests: string | null;
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
      set_id: workoutSets.id,
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
      tempo: workoutSets.tempo,
      bodyweight_modifier_kg: workoutSets.bodyweight_modifier_kg,
      pulley_pin: workoutSets.pulley_pin,
      kind: workoutSessions.kind,
      day_session_exercise_id: workoutSessions.day_session_exercise_id,
      day_session_date: workoutSessions.day_session_date,
      stack_marker: workoutSets.stack_marker,
      stack_name_at_log: workoutSets.stack_name_at_log,
      set_type: workoutSets.set_type,
      mini_set_reps: sql<string | null>`(
        SELECT GROUP_CONCAT(${workoutSetSegments.reps}, ';')
        FROM ${workoutSetSegments}
        WHERE ${workoutSetSegments.set_id} = ${workoutSets.id}
        ORDER BY ${workoutSetSegments.segment_number}
      )`,
      mini_set_weights: sql<string | null>`(
        SELECT GROUP_CONCAT(COALESCE(${workoutSetSegments.weight}, ''), ';')
        FROM ${workoutSetSegments}
        WHERE ${workoutSetSegments.set_id} = ${workoutSets.id}
        ORDER BY ${workoutSetSegments.segment_number}
      )`,
      mini_set_rests: sql<string | null>`(
        SELECT GROUP_CONCAT(COALESCE(${workoutSetSegments.rest_after_seconds}, ''), ';')
        FROM ${workoutSetSegments}
        WHERE ${workoutSetSegments.set_id} = ${workoutSets.id}
        ORDER BY ${workoutSetSegments.segment_number}
      )`,
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

  // BLD-1168: Fetch segments only for advanced set types (back-compat: non-advanced rows get empty columns).
  const advancedSetIds = rows
    .filter((r) => ADVANCED_SET_TYPES.has((r.set_type ?? "normal") as Parameters<typeof ADVANCED_SET_TYPES.has>[0]))
    .map((r) => r.set_id);

  type SegRow = { set_id: string; reps: number; weight: number | null; rest_after_seconds: number | null };
  const segmentsBySetId = new Map<string, SegRow[]>();

  if (advancedSetIds.length > 0) {
    const segs = await db
      .select({
        set_id: workoutSetSegments.set_id,
        reps: workoutSetSegments.reps,
        weight: workoutSetSegments.weight,
        rest_after_seconds: workoutSetSegments.rest_after_seconds,
      })
      .from(workoutSetSegments)
      .where(inArray(workoutSetSegments.set_id, advancedSetIds))
      .orderBy(asc(workoutSetSegments.set_id), asc(workoutSetSegments.segment_number));

    for (const seg of segs) {
      if (!segmentsBySetId.has(seg.set_id)) segmentsBySetId.set(seg.set_id, []);
      segmentsBySetId.get(seg.set_id)!.push({ ...seg, weight: seg.weight ?? null, rest_after_seconds: seg.rest_after_seconds ?? null });
    }
  }

  return rows.map((r) => {
    const segs = segmentsBySetId.get(r.set_id);
    return {
      date: r.date,
      exercise: r.exercise,
      set_number: r.set_number,
      weight: r.weight,
      reps: r.reps,
      duration_seconds: r.duration_seconds,
      notes: r.notes,
      set_rpe: r.set_rpe,
      set_notes: r.set_notes,
      link_id: r.link_id,
      tempo: r.tempo,
      bodyweight_modifier_kg: r.bodyweight_modifier_kg,
      pulley_pin: r.pulley_pin,
      kind: r.kind,
      day_session_exercise_id: r.day_session_exercise_id,
      day_session_date: r.day_session_date,
      stack_marker: r.stack_marker,
      stack_name_at_log: r.stack_name_at_log,
      set_type: r.set_type ?? "normal",
      mini_set_reps: segs ? segs.map((s) => String(s.reps)).join(";") : null,
      mini_set_weights: segs ? segs.map((s) => (s.weight !== null ? String(s.weight) : "")).join(";") : null,
      mini_set_rests: segs ? segs.map((s) => (s.rest_after_seconds !== null ? String(s.rest_after_seconds) : "")).join(";") : null,
    };
  }) as WorkoutCSVRow[];
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

// BLD-1158 AC1.7/AC1.8: Custom exercise CSV export including default_tempo.
// Only exports custom exercises (is_custom = 1). Built-in exercises are
// immutable and excluded — users cannot modify them so there is nothing to
// round-trip.
export type ExerciseCSVRow = {
  id: string;
  name: string;
  category: string | null;
  equipment: string | null;
  difficulty: string | null;
  primary_muscles: string | null;
  secondary_muscles: string | null;
  instructions: string | null;
  default_tempo: string | null;
};

export async function getExercisesCSVData(): Promise<ExerciseCSVRow[]> {
  const db = await getDrizzle();
  return db.select({
    id: exercises.id,
    name: exercises.name,
    category: exercises.category,
    equipment: exercises.equipment,
    difficulty: exercises.difficulty,
    primary_muscles: exercises.primary_muscles,
    secondary_muscles: exercises.secondary_muscles,
    instructions: exercises.instructions,
    default_tempo: exercises.default_tempo,
  })
    .from(exercises)
    .where(isNotNull(exercises.is_custom))
    .orderBy(asc(exercises.name)) as unknown as Promise<ExerciseCSVRow[]>;
}
