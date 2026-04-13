import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import type {
  Exercise,
  WorkoutTemplate,
  TemplateExercise,
  WorkoutSession,
  WorkoutSet,
  FoodEntry,
  DailyLog,
  MacroTargets,
  Meal,
  BodyWeight,
  BodyMeasurements,
  BodySettings,
  Program,
  ProgramDay,
  ProgramLog,
  MuscleGroup,
} from "./types";
import { seedExercises } from "./seed";

const DB_NAME = "fitforge.db";

let db: SQLite.SQLiteDatabase | null = null;
let init: Promise<SQLite.SQLiteDatabase> | null = null;
let memoryFallback = false;

export function isMemoryFallback(): boolean {
  return memoryFallback;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!init) {
    init = (async () => {
      try {
        const instance = await SQLite.openDatabaseAsync(DB_NAME);
        await migrate(instance);
        await seed(instance);
        db = instance;
        return instance;
      } catch (err) {
        if (Platform.OS === "web") {
          try {
            const instance = await SQLite.openDatabaseAsync(":memory:");
            await migrate(instance);
            await seed(instance);
            memoryFallback = true;
            db = instance;
            return instance;
          } catch (fallbackErr) {
            init = null;
            throw fallbackErr;
          }
        }
        init = null;
        throw err;
      }
    })();
  }
  return init;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      primary_muscles TEXT NOT NULL,
      secondary_muscles TEXT NOT NULL,
      equipment TEXT NOT NULL,
      instructions TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      target_sets INTEGER DEFAULT 3,
      target_reps TEXT DEFAULT '8-12',
      rest_seconds INTEGER DEFAULT 90
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS food_entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      serving_size TEXT DEFAULT '1 serving',
      is_favorite INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_log (
      id TEXT PRIMARY KEY,
      food_entry_id TEXT NOT NULL,
      date TEXT NOT NULL,
      meal TEXT NOT NULL DEFAULT 'snack',
      servings REAL DEFAULT 1,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS macro_targets (
      id TEXT PRIMARY KEY,
      calories REAL DEFAULT 2000,
      protein REAL DEFAULT 150,
      carbs REAL DEFAULT 250,
      fat REAL DEFAULT 65,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      component TEXT,
      fatal INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      app_version TEXT,
      platform TEXT,
      os_version TEXT
    );

    CREATE TABLE IF NOT EXISTS body_weight (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      date TEXT NOT NULL UNIQUE,
      notes TEXT DEFAULT '',
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      waist REAL,
      chest REAL,
      hips REAL,
      left_arm REAL,
      right_arm REAL,
      left_thigh REAL,
      right_thigh REAL,
      left_calf REAL,
      right_calf REAL,
      neck REAL,
      body_fat REAL,
      notes TEXT DEFAULT '',
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      measurement_unit TEXT NOT NULL DEFAULT 'cm',
      weight_goal REAL,
      body_fat_goal REAL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      current_day_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS program_days (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      template_id TEXT DEFAULT NULL,
      position INTEGER NOT NULL,
      label TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS program_log (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      day_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );
  `);

  // Migration: add deleted_at column for soft-delete
  const cols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(exercises)"
  );
  if (!cols.some((c) => c.name === "deleted_at")) {
    await database.execAsync(
      "ALTER TABLE exercises ADD COLUMN deleted_at INTEGER DEFAULT NULL"
    );
  }

  // Migration: add program_day_id to workout_sessions
  const sessionCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(workout_sessions)"
  );
  if (!sessionCols.some((c) => c.name === "program_day_id")) {
    await database.execAsync(
      "ALTER TABLE workout_sessions ADD COLUMN program_day_id TEXT DEFAULT NULL"
    );
  }

  // Migration: add rpe and notes columns to workout_sets
  const setCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(workout_sets)"
  );
  if (!setCols.some((c) => c.name === "rpe")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN rpe REAL DEFAULT NULL"
    );
  }
  if (!setCols.some((c) => c.name === "notes")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN notes TEXT DEFAULT ''"
    );
  }

  // Migration: index for exercise history query performance
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id)"
  );

  // Migration: add link_id and link_label to template_exercises
  const teCols = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(template_exercises)"
  );
  if (!teCols.some((c) => c.name === "link_id")) {
    await database.execAsync(
      "ALTER TABLE template_exercises ADD COLUMN link_id TEXT DEFAULT NULL"
    );
  }
  if (!teCols.some((c) => c.name === "link_label")) {
    await database.execAsync(
      "ALTER TABLE template_exercises ADD COLUMN link_label TEXT DEFAULT ''"
    );
  }

  // Migration: add link_id and round to workout_sets
  if (!setCols.some((c) => c.name === "link_id")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN link_id TEXT DEFAULT NULL"
    );
  }
  if (!setCols.some((c) => c.name === "round")) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN round INTEGER DEFAULT NULL"
    );
  }
}

async function seed(database: SQLite.SQLiteDatabase): Promise<void> {
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0"
  );
  if (result && result.count > 0) return;

  const exercises = seedExercises();
  const stmt = await database.prepareAsync(
    `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
     VALUES ($id, $name, $category, $primary_muscles, $secondary_muscles, $equipment, $instructions, $difficulty, $is_custom)`
  );
  try {
    for (const ex of exercises) {
      await stmt.executeAsync({
        $id: ex.id,
        $name: ex.name,
        $category: ex.category,
        $primary_muscles: JSON.stringify(ex.primary_muscles),
        $secondary_muscles: JSON.stringify(ex.secondary_muscles),
        $equipment: ex.equipment,
        $instructions: ex.instructions,
        $difficulty: ex.difficulty,
        $is_custom: ex.is_custom ? 1 : 0,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

type ExerciseRow = {
  id: string;
  name: string;
  category: string;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: string;
  instructions: string;
  difficulty: string;
  is_custom: number;
};

function mapRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Exercise["category"],
    primary_muscles: JSON.parse(row.primary_muscles) as Exercise["primary_muscles"],
    secondary_muscles: JSON.parse(row.secondary_muscles) as Exercise["secondary_muscles"],
    equipment: row.equipment as Exercise["equipment"],
    instructions: row.instructions,
    difficulty: row.difficulty as Exercise["difficulty"],
    is_custom: row.is_custom === 1,
  };
}

export async function getAllExercises(): Promise<Exercise[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ExerciseRow>(
    "SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY name ASC"
  );
  return rows.map(mapRow);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ExerciseRow>(
    "SELECT * FROM exercises WHERE id = ?",
    [id]
  );
  if (!row) return null;
  return mapRow(row);
}

export async function createCustomExercise(
  exercise: Omit<Exercise, "id" | "is_custom">
): Promise<Exercise> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  await database.runAsync(
    `INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      exercise.name,
      exercise.category,
      JSON.stringify(exercise.primary_muscles),
      JSON.stringify(exercise.secondary_muscles),
      exercise.equipment,
      exercise.instructions,
      exercise.difficulty,
    ]
  );
  return { ...exercise, id, is_custom: true };
}

export async function updateCustomExercise(
  id: string,
  exercise: Partial<Omit<Exercise, "id" | "is_custom">>
): Promise<void> {
  const database = await getDatabase();
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (exercise.name !== undefined) { fields.push("name = ?"); values.push(exercise.name); }
  if (exercise.category !== undefined) { fields.push("category = ?"); values.push(exercise.category); }
  if (exercise.primary_muscles !== undefined) { fields.push("primary_muscles = ?"); values.push(JSON.stringify(exercise.primary_muscles)); }
  if (exercise.secondary_muscles !== undefined) { fields.push("secondary_muscles = ?"); values.push(JSON.stringify(exercise.secondary_muscles)); }
  if (exercise.equipment !== undefined) { fields.push("equipment = ?"); values.push(exercise.equipment); }
  if (exercise.instructions !== undefined) { fields.push("instructions = ?"); values.push(exercise.instructions); }
  if (exercise.difficulty !== undefined) { fields.push("difficulty = ?"); values.push(exercise.difficulty); }
  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(
    `UPDATE exercises SET ${fields.join(", ")} WHERE id = ? AND is_custom = 1`,
    values
  );
}

export async function softDeleteCustomExercise(id: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "DELETE FROM template_exercises WHERE exercise_id = ?",
      [id]
    );
    await database.runAsync(
      "UPDATE exercises SET deleted_at = ? WHERE id = ? AND is_custom = 1",
      [Date.now(), id]
    );
  });
}

export async function getTemplatesUsingExercise(
  exerciseId: string
): Promise<{ id: string; name: string }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{ id: string; name: string }>(
    `SELECT DISTINCT wt.id, wt.name
     FROM template_exercises te
     JOIN workout_templates wt ON wt.id = te.template_id
     WHERE te.exercise_id = ?`,
    [exerciseId]
  );
}

// --------------- Templates ---------------

export async function createTemplate(name: string): Promise<WorkoutTemplate> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, name, now, now]
  );
  return { id, name, created_at: now, updated_at: now };
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<WorkoutTemplate>(
    "SELECT * FROM workout_templates ORDER BY updated_at DESC"
  );
  return rows;
}

type TemplateExerciseRow = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
  link_id: string | null;
  link_label: string;
  exercise_name: string | null;
  exercise_category: string | null;
  exercise_primary_muscles: string | null;
  exercise_secondary_muscles: string | null;
  exercise_equipment: string | null;
  exercise_instructions: string | null;
  exercise_difficulty: string | null;
  exercise_is_custom: number | null;
};

export async function getTemplateById(
  id: string
): Promise<WorkoutTemplate | null> {
  const database = await getDatabase();
  const tpl = await database.getFirstAsync<WorkoutTemplate>(
    "SELECT * FROM workout_templates WHERE id = ?",
    [id]
  );
  if (!tpl) return null;
  const rows = await database.getAllAsync<TemplateExerciseRow>(
    `SELECT te.*, e.name AS exercise_name, e.category AS exercise_category,
       e.primary_muscles AS exercise_primary_muscles, e.secondary_muscles AS exercise_secondary_muscles,
       e.equipment AS exercise_equipment, e.instructions AS exercise_instructions,
       e.difficulty AS exercise_difficulty, e.is_custom AS exercise_is_custom
     FROM template_exercises te
     LEFT JOIN exercises e ON te.exercise_id = e.id
     WHERE te.template_id = ?
     ORDER BY te.position ASC`,
    [id]
  );
  tpl.exercises = rows.map((r) => ({
    id: r.id,
    template_id: r.template_id,
    exercise_id: r.exercise_id,
    position: r.position,
    target_sets: r.target_sets,
    target_reps: r.target_reps,
    rest_seconds: r.rest_seconds,
    link_id: r.link_id ?? null,
    link_label: r.link_label ?? "",
    exercise: r.exercise_name
      ? mapRow({
          id: r.exercise_id,
          name: r.exercise_name,
          category: r.exercise_category!,
          primary_muscles: r.exercise_primary_muscles!,
          secondary_muscles: r.exercise_secondary_muscles!,
          equipment: r.exercise_equipment!,
          instructions: r.exercise_instructions!,
          difficulty: r.exercise_difficulty!,
          is_custom: r.exercise_is_custom!,
        })
      : undefined,
  }));
  return tpl;
}

export async function deleteTemplate(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM template_exercises WHERE template_id = ?", [id]);
  await database.runAsync("UPDATE program_days SET template_id = NULL WHERE template_id = ?", [id]);
  await database.runAsync("DELETE FROM workout_templates WHERE id = ?", [id]);
}

export async function addExerciseToTemplate(
  templateId: string,
  exerciseId: string,
  position: number,
  targetSets = 3,
  targetReps = "8-12",
  restSeconds = 90
): Promise<TemplateExercise> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  await database.runAsync(
    `INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, exerciseId, position, targetSets, targetReps, restSeconds]
  );
  await database.runAsync(
    "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
    [Date.now(), templateId]
  );
  return {
    id,
    template_id: templateId,
    exercise_id: exerciseId,
    position,
    target_sets: targetSets,
    target_reps: targetReps,
    rest_seconds: restSeconds,
    link_id: null,
    link_label: "",
  };
}

export async function removeExerciseFromTemplate(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ template_id: string; link_id: string | null }>(
    "SELECT template_id, link_id FROM template_exercises WHERE id = ?",
    [id]
  );
  await database.runAsync("DELETE FROM template_exercises WHERE id = ?", [id]);
  if (row) {
    // If the removed exercise was in a link group, check if group needs dissolving
    if (row.link_id) {
      const remaining = await database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM template_exercises WHERE link_id = ?",
        [row.link_id]
      );
      if (remaining && remaining.count < 2) {
        await database.runAsync(
          "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
          [row.link_id]
        );
      }
    }
    await database.runAsync(
      "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
      [Date.now(), row.template_id]
    );
  }
}

export async function reorderTemplateExercises(
  templateId: string,
  orderedIds: string[]
): Promise<void> {
  const database = await getDatabase();
  for (let i = 0; i < orderedIds.length; i++) {
    await database.runAsync(
      "UPDATE template_exercises SET position = ? WHERE id = ? AND template_id = ?",
      [i, orderedIds[i], templateId]
    );
  }
  await database.runAsync(
    "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
    [Date.now(), templateId]
  );
}

export async function updateTemplateExercise(
  id: string,
  targetSets: number,
  targetReps: string,
  restSeconds: number
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE template_exercises SET target_sets = ?, target_reps = ?, rest_seconds = ? WHERE id = ?",
    [targetSets, targetReps, restSeconds, id]
  );
}

// --------------- Sessions ---------------

export async function startSession(
  templateId: string | null,
  name: string,
  programDayId?: string
): Promise<WorkoutSession> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO workout_sessions (id, template_id, name, started_at, notes, program_day_id) VALUES (?, ?, ?, ?, '', ?)",
    [id, templateId, name, now, programDayId ?? null]
  );
  return {
    id,
    template_id: templateId,
    name,
    started_at: now,
    completed_at: null,
    duration_seconds: null,
    notes: "",
  };
}

export async function completeSession(
  id: string,
  notes?: string
): Promise<void> {
  const database = await getDatabase();
  const now = Date.now();
  const session = await database.getFirstAsync<{ started_at: number }>(
    "SELECT started_at FROM workout_sessions WHERE id = ?",
    [id]
  );
  const duration = session ? Math.floor((now - session.started_at) / 1000) : 0;
  await database.runAsync(
    "UPDATE workout_sessions SET completed_at = ?, duration_seconds = ?, notes = ? WHERE id = ?",
    [now, duration, notes ?? "", id]
  );
}

export async function cancelSession(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_sets WHERE session_id = ?", [id]);
  await database.runAsync("DELETE FROM workout_sessions WHERE id = ?", [id]);
}

export async function getRecentSessions(
  limit = 20
): Promise<WorkoutSession[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    [limit]
  );
}

export async function getSessionById(
  id: string
): Promise<WorkoutSession | null> {
  const database = await getDatabase();
  return database.getFirstAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE id = ?",
    [id]
  );
}

type SetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  completed: number;
  completed_at: number | null;
  rpe: number | null;
  notes: string;
  link_id: string | null;
  round: number | null;
  exercise_name: string | null;
};

export async function getSessionSets(
  sessionId: string
): Promise<(WorkoutSet & { exercise_name?: string })[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SetRow>(
    `SELECT ws.*, e.name AS exercise_name
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ?
     ORDER BY ws.exercise_id, ws.set_number ASC`,
    [sessionId]
  );
  return rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    exercise_id: r.exercise_id,
    set_number: r.set_number,
    weight: r.weight,
    reps: r.reps,
    completed: r.completed === 1,
    completed_at: r.completed_at,
    rpe: r.rpe ?? null,
    notes: r.notes ?? "",
    link_id: r.link_id ?? null,
    round: r.round ?? null,
    exercise_name: r.exercise_name ?? undefined,
  }));
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const database = await getDatabase();
  return database.getFirstAsync<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1"
  );
}

// --------------- Sets ---------------

export async function addSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  linkId?: string | null,
  round?: number | null
): Promise<WorkoutSet> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  await database.runAsync(
    "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, link_id, round) VALUES (?, ?, ?, ?, ?, ?)",
    [id, sessionId, exerciseId, setNumber, linkId ?? null, round ?? null]
  );
  return {
    id,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: linkId ?? null,
    round: round ?? null,
  };
}

export async function updateSet(
  id: string,
  weight: number | null,
  reps: number | null
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?",
    [weight, reps, id]
  );
}

export async function completeSet(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_sets SET completed = 1, completed_at = ? WHERE id = ?",
    [Date.now(), id]
  );
}

export async function uncompleteSet(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_sets SET completed = 0, completed_at = NULL WHERE id = ?",
    [id]
  );
}

export async function deleteSet(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM workout_sets WHERE id = ?", [id]);
}

export async function updateSetRPE(id: string, rpe: number | null): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_sets SET rpe = ? WHERE id = ?",
    [rpe, id]
  );
}

export async function updateSetNotes(id: string, notes: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE workout_sets SET notes = ? WHERE id = ?",
    [notes, id]
  );
}

export async function getPreviousSets(
  exerciseId: string,
  currentSessionId: string
): Promise<{ set_number: number; weight: number | null; reps: number | null }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{
    set_number: number;
    weight: number | null;
    reps: number | null;
  }>(
    `SELECT ws.set_number, ws.weight, ws.reps
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.session_id != ?
       AND wss.completed_at IS NOT NULL
     ORDER BY ws.completed_at DESC`,
    [exerciseId, currentSessionId]
  );
}

export async function getTemplateExerciseCount(
  templateId: string
): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM template_exercises WHERE template_id = ?",
    [templateId]
  );
  return row?.count ?? 0;
}

export async function getSessionSetCount(
  sessionId: string
): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM workout_sets WHERE session_id = ? AND completed = 1",
    [sessionId]
  );
  return row?.count ?? 0;
}

export async function getSessionAvgRPE(
  sessionId: string
): Promise<number | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ val: number | null }>(
    "SELECT AVG(rpe) AS val FROM workout_sets WHERE session_id = ? AND completed = 1 AND rpe IS NOT NULL",
    [sessionId]
  );
  return row?.val ?? null;
}

// --------------- History & Calendar ---------------

export async function getSessionsByMonth(
  year: number,
  month: number
): Promise<(WorkoutSession & { set_count: number })[]> {
  const database = await getDatabase();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return database.getAllAsync<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
       AND wss.started_at >= ? AND wss.started_at < ?
     ORDER BY wss.started_at DESC`,
    [start, end]
  );
}

export async function searchSessions(
  query: string,
  limit = 50
): Promise<(WorkoutSession & { set_count: number })[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL AND wss.name LIKE ?
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [`%${query}%`, limit]
  );
}

export async function getAllCompletedSessionWeeks(): Promise<number[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY started_at DESC`
  );
  return rows.map((r) => r.started_at);
}

// --------------- Progress Queries ---------------

export async function getWeeklySessionCounts(
  weeks = 8
): Promise<{ week: string; count: number }[]> {
  const database = await getDatabase();
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const rows = await database.getAllAsync<{ week_start: number; count: number }>(
    `SELECT (started_at / 604800000) * 604800000 AS week_start, COUNT(*) AS count
     FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ?
     GROUP BY week_start
     ORDER BY week_start ASC`,
    [cutoff]
  );
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      count: r.count,
    };
  });
}

export async function getWeeklyVolume(
  weeks = 8
): Promise<{ week: string; volume: number }[]> {
  const database = await getDatabase();
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const rows = await database.getAllAsync<{ week_start: number; volume: number }>(
    `SELECT (wss.started_at / 604800000) * 604800000 AS week_start,
            COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL AND wss.started_at >= ?
     GROUP BY week_start
     ORDER BY week_start ASC`,
    [cutoff]
  );
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      volume: r.volume,
    };
  });
}

export async function getPersonalRecords(): Promise<
  { exercise_id: string; name: string; max_weight: number }[]
> {
  const database = await getDatabase();
  return database.getAllAsync<{ exercise_id: string; name: string; max_weight: number }>(
    `SELECT ws.exercise_id, COALESCE(e.name, 'Deleted Exercise') AS name, MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND ws.weight IS NOT NULL AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id
     ORDER BY name ASC`
  );
}

export async function getCompletedSessionsWithSetCount(
  limit = 10
): Promise<(WorkoutSession & { set_count: number })[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// --------------- Import / Export ---------------

export async function exportAllData(): Promise<{
  version: number;
  exported_at: string;
  exercises: ExerciseRow[];
  templates: WorkoutTemplate[];
  template_exercises: TemplateExercise[];
  sessions: WorkoutSession[];
  sets: WorkoutSet[];
  food_entries: FoodRow[];
  daily_log: { id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }[];
  macro_targets: MacroTargets[];
  body_weight: BodyWeight[];
  body_measurements: BodyMeasurements[];
  body_settings: BodySettings[];
}> {
  const database = await getDatabase();
  const exercises = await database.getAllAsync<ExerciseRow>("SELECT * FROM exercises");
  const templates = await database.getAllAsync<WorkoutTemplate>("SELECT * FROM workout_templates");
  const tplExercises = await database.getAllAsync<TemplateExercise>("SELECT * FROM template_exercises");
  const sessions = await database.getAllAsync<WorkoutSession>("SELECT * FROM workout_sessions");
  const sets = await database.getAllAsync<WorkoutSet>("SELECT * FROM workout_sets");
  const foods = await database.getAllAsync<FoodRow>("SELECT * FROM food_entries");
  const logs = await database.getAllAsync<{ id: string; food_entry_id: string; date: string; meal: string; servings: number; logged_at: number }>("SELECT * FROM daily_log");
  const targets = await database.getAllAsync<MacroTargets>("SELECT * FROM macro_targets");
  const weights = await database.getAllAsync<BodyWeight>("SELECT * FROM body_weight");
  const measurements = await database.getAllAsync<BodyMeasurements>("SELECT * FROM body_measurements");
  const bodySettings = await database.getAllAsync<BodySettings>("SELECT * FROM body_settings");
  return {
    version: 1,
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
  sets?: { id: string; session_id: string; exercise_id: string; set_number: number; weight: number | null; reps: number | null; completed: number; completed_at: number | null; set_rpe?: number | null; set_notes?: string; link_id?: string | null; round?: number | null }[];
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
          "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [s.id, s.session_id, s.exercise_id, s.set_number, s.weight, s.reps, s.completed, s.completed_at, s.set_rpe ?? null, s.set_notes ?? "", s.link_id ?? null, s.round ?? null]
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

// --------------- Rest Timer Helper ---------------

export async function getRestSecondsForExercise(
  sessionId: string,
  exerciseId: string
): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ rest_seconds: number }>(
    `SELECT te.rest_seconds
     FROM workout_sessions wss
     JOIN template_exercises te ON te.template_id = wss.template_id AND te.exercise_id = ?
     WHERE wss.id = ?`,
    [exerciseId, sessionId]
  );
  return row?.rest_seconds ?? 90;
}

// --------------- Superset / Circuit Linking ---------------

export async function createExerciseLink(
  templateId: string,
  exerciseIds: string[]
): Promise<string> {
  const database = await getDatabase();
  const linkId = crypto.randomUUID();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = ? WHERE id = ? AND template_id = ?",
        [linkId, eid, templateId]
      );
    }
  });
  await database.runAsync(
    "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
    [Date.now(), templateId]
  );
  return linkId;
}

export async function unlinkExerciseGroup(linkId: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
      [linkId]
    );
  });
}

export async function addToExerciseLink(
  linkId: string,
  exerciseIds: string[]
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = ? WHERE id = ?",
        [linkId, eid]
      );
    }
  });
}

export async function unlinkSingleExercise(
  teId: string,
  linkId: string
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE id = ?",
      [teId]
    );
    // If only 1 exercise remains in the group, dissolve it
    const remaining = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM template_exercises WHERE link_id = ?",
      [linkId]
    );
    if (remaining && remaining.count < 2) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
        [linkId]
      );
    }
  });
}

export async function updateLinkLabel(
  linkId: string,
  label: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE template_exercises SET link_label = ? WHERE link_id = ?",
    [label, linkId]
  );
}

// Queries live template for rest seconds — if template links change mid-session,
// the query may return NULL and falls back to 90s default.
export async function getRestSecondsForLink(
  sessionId: string,
  linkId: string
): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ rest: number }>(
    `SELECT MAX(te.rest_seconds) AS rest
     FROM workout_sessions wss
     JOIN template_exercises te ON te.template_id = wss.template_id
     WHERE wss.id = ? AND te.link_id = ?`,
    [sessionId, linkId]
  );
  return row?.rest ?? 90;
}

// --------------- Nutrition ---------------

type FoodRow = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  is_favorite: number;
  created_at: number;
};

function mapFood(row: FoodRow): FoodEntry {
  return {
    ...row,
    is_favorite: row.is_favorite === 1,
  };
}

export async function addFoodEntry(
  name: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  serving: string,
  favorite: boolean
): Promise<FoodEntry> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, name, calories, protein, carbs, fat, serving, favorite ? 1 : 0, now]
  );
  return { id, name, calories, protein, carbs, fat, serving_size: serving, is_favorite: favorite, created_at: now };
}

export async function getFoodEntries(): Promise<FoodEntry[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<FoodRow>("SELECT * FROM food_entries ORDER BY created_at DESC");
  return rows.map(mapFood);
}

export async function getFavoriteFoods(): Promise<FoodEntry[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<FoodRow>(
    "SELECT * FROM food_entries WHERE is_favorite = 1 ORDER BY name ASC"
  );
  return rows.map(mapFood);
}

export async function toggleFavorite(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE food_entries SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [id]
  );
}

export async function addDailyLog(
  foodId: string,
  date: string,
  meal: Meal,
  servings: number
): Promise<DailyLog> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO daily_log (id, food_entry_id, date, meal, servings, logged_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, foodId, date, meal, servings, now]
  );
  return { id, food_entry_id: foodId, date, meal, servings, logged_at: now };
}

type DailyLogRow = {
  id: string;
  food_entry_id: string;
  date: string;
  meal: string;
  servings: number;
  logged_at: number;
  food_name: string;
  food_calories: number;
  food_protein: number;
  food_carbs: number;
  food_fat: number;
  food_serving_size: string;
  food_is_favorite: number;
  food_created_at: number;
};

export async function getDailyLogs(date: string): Promise<DailyLog[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<DailyLogRow>(
    `SELECT dl.*, f.name AS food_name, f.calories AS food_calories, f.protein AS food_protein,
            f.carbs AS food_carbs, f.fat AS food_fat, f.serving_size AS food_serving_size,
            f.is_favorite AS food_is_favorite, f.created_at AS food_created_at
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date = ?
     ORDER BY dl.logged_at ASC`,
    [date]
  );
  return rows.map((r) => ({
    id: r.id,
    food_entry_id: r.food_entry_id,
    date: r.date,
    meal: r.meal as Meal,
    servings: r.servings,
    logged_at: r.logged_at,
    food: mapFood({
      id: r.food_entry_id,
      name: r.food_name,
      calories: r.food_calories,
      protein: r.food_protein,
      carbs: r.food_carbs,
      fat: r.food_fat,
      serving_size: r.food_serving_size,
      is_favorite: r.food_is_favorite,
      created_at: r.food_created_at,
    }),
  }));
}

export async function deleteDailyLog(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM daily_log WHERE id = ?", [id]);
}

export async function getMacroTargets(): Promise<MacroTargets> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<MacroTargets>("SELECT * FROM macro_targets LIMIT 1");
  if (row) return row;
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, 2000, 150, 250, 65, ?)",
    [id, now]
  );
  return { id, calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: now };
}

export async function updateMacroTargets(
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): Promise<void> {
  const database = await getDatabase();
  const targets = await getMacroTargets();
  await database.runAsync(
    "UPDATE macro_targets SET calories = ?, protein = ?, carbs = ?, fat = ?, updated_at = ? WHERE id = ?",
    [calories, protein, carbs, fat, Date.now(), targets.id]
  );
}

export async function getDailySummary(
  date: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  }>(
    `SELECT SUM(f.calories * dl.servings) AS calories,
            SUM(f.protein * dl.servings) AS protein,
            SUM(f.carbs * dl.servings) AS carbs,
            SUM(f.fat * dl.servings) AS fat
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date = ?`,
    [date]
  );
  return {
    calories: row?.calories ?? 0,
    protein: row?.protein ?? 0,
    carbs: row?.carbs ?? 0,
    fat: row?.fat ?? 0,
  };
}

// --------------- CSV Export ---------------

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

export async function getWorkoutCSVData(since: number): Promise<WorkoutCSVRow[]> {
  const database = await getDatabase();
  return database.getAllAsync<WorkoutCSVRow>(
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
       wset.link_id
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
  const database = await getDatabase();
  return database.getAllAsync<NutritionCSVRow>(
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
  const database = await getDatabase();
  const s = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ?`,
    [since]
  );
  const e = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM daily_log
     WHERE date >= date(? / 1000, 'unixepoch')`,
    [since]
  );
  return { sessions: s?.count ?? 0, entries: e?.count ?? 0 };
}

// --------------- Body Tracking ---------------

export async function getBodySettings(): Promise<BodySettings> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<BodySettings>("SELECT * FROM body_settings LIMIT 1");
  if (row) return row;
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO body_settings (id, weight_unit, measurement_unit, updated_at) VALUES ('default', 'kg', 'cm', ?)",
    [now]
  );
  return { id: "default", weight_unit: "kg", measurement_unit: "cm", weight_goal: null, body_fat_goal: null, updated_at: now };
}

export async function updateBodySettings(
  unit: "kg" | "lb",
  measurement: "cm" | "in",
  goal: number | null,
  fatGoal: number | null
): Promise<void> {
  const database = await getDatabase();
  const settings = await getBodySettings();
  await database.runAsync(
    "UPDATE body_settings SET weight_unit = ?, measurement_unit = ?, weight_goal = ?, body_fat_goal = ?, updated_at = ? WHERE id = ?",
    [unit, measurement, goal, fatGoal, Date.now(), settings.id]
  );
}

export async function upsertBodyWeight(
  weight: number,
  date: string,
  notes: string
): Promise<BodyWeight> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    `INSERT INTO body_weight (id, weight, date, notes, logged_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, notes = excluded.notes, logged_at = excluded.logged_at`,
    [id, weight, date, notes, now]
  );
  const row = await database.getFirstAsync<BodyWeight>(
    "SELECT * FROM body_weight WHERE date = ?",
    [date]
  );
  return row!;
}

export async function getBodyWeightEntries(
  limit = 20,
  offset = 0
): Promise<BodyWeight[]> {
  const database = await getDatabase();
  return database.getAllAsync<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

export async function getBodyWeightCount(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM body_weight"
  );
  return row?.count ?? 0;
}

export async function getLatestBodyWeight(): Promise<BodyWeight | null> {
  const database = await getDatabase();
  return database.getFirstAsync<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT 1"
  );
}

export async function getPreviousBodyWeight(): Promise<BodyWeight | null> {
  const database = await getDatabase();
  return database.getFirstAsync<BodyWeight>(
    "SELECT * FROM body_weight ORDER BY date DESC LIMIT 1 OFFSET 1"
  );
}

export async function deleteBodyWeight(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM body_weight WHERE id = ?", [id]);
}

export async function getBodyWeightChartData(
  weeks = 12
): Promise<{ date: string; weight: number }[]> {
  const database = await getDatabase();
  const cutoff = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  return database.getAllAsync<{ date: string; weight: number }>(
    "SELECT date, weight FROM body_weight WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
}

export async function upsertBodyMeasurements(
  date: string,
  vals: Omit<BodyMeasurements, "id" | "date" | "logged_at">
): Promise<BodyMeasurements> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    `INSERT INTO body_measurements (id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       waist = excluded.waist, chest = excluded.chest, hips = excluded.hips,
       left_arm = excluded.left_arm, right_arm = excluded.right_arm,
       left_thigh = excluded.left_thigh, right_thigh = excluded.right_thigh,
       left_calf = excluded.left_calf, right_calf = excluded.right_calf,
       neck = excluded.neck, body_fat = excluded.body_fat,
       notes = excluded.notes, logged_at = excluded.logged_at`,
    [id, date, vals.waist, vals.chest, vals.hips, vals.left_arm, vals.right_arm, vals.left_thigh, vals.right_thigh, vals.left_calf, vals.right_calf, vals.neck, vals.body_fat, vals.notes, now]
  );
  const row = await database.getFirstAsync<BodyMeasurements>(
    "SELECT * FROM body_measurements WHERE date = ?",
    [date]
  );
  return row!;
}

export async function getLatestMeasurements(): Promise<BodyMeasurements | null> {
  const database = await getDatabase();
  return database.getFirstAsync<BodyMeasurements>(
    "SELECT * FROM body_measurements ORDER BY date DESC LIMIT 1"
  );
}

export async function getBodyMeasurementEntries(
  limit = 20,
  offset = 0
): Promise<BodyMeasurements[]> {
  const database = await getDatabase();
  return database.getAllAsync<BodyMeasurements>(
    "SELECT * FROM body_measurements ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

export async function deleteBodyMeasurements(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM body_measurements WHERE id = ?", [id]);
}

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

export async function getBodyWeightCSVData(since: number): Promise<BodyWeightCSVRow[]> {
  const database = await getDatabase();
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  return database.getAllAsync<BodyWeightCSVRow>(
    "SELECT date, weight, notes FROM body_weight WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
}

export async function getBodyMeasurementsCSVData(since: number): Promise<BodyMeasurementsCSVRow[]> {
  const database = await getDatabase();
  const cutoff = since === 0 ? "0000-01-01" : new Date(since).toISOString().slice(0, 10);
  return database.getAllAsync<BodyMeasurementsCSVRow>(
    "SELECT date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf, neck, body_fat, notes FROM body_measurements WHERE date >= ? ORDER BY date ASC",
    [cutoff]
  );
}

// --------------- Workout Insights (PR Detection) ---------------

export async function getMaxWeightByExercise(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const database = await getDatabase();
  const placeholders = exerciseIds.map(() => "?").join(", ");
  const rows = await database.getAllAsync<{ exercise_id: string; max_weight: number }>(
    `SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id IN (${placeholders})
       AND ws.session_id != ?
       AND ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id`,
    [...exerciseIds, excludeSessionId]
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.exercise_id] = r.max_weight;
  }
  return result;
}

export async function getSessionPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; weight: number; previous_max: number }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{ exercise_id: string; name: string; weight: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_weight AS weight,
            hist.max_weight AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_weight > hist.max_weight
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getRecentPRs(
  limit: number = 5
): Promise<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }>(
    `SELECT ws.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS weight,
            ws.session_id,
            wss.started_at AS date
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
       AND ws.weight > (SELECT MAX(ws2.weight)
          FROM workout_sets ws2
          JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
          WHERE ws2.exercise_id = ws.exercise_id
            AND ws2.session_id != ws.session_id
            AND ws2.completed = 1
            AND ws2.weight IS NOT NULL
            AND ws2.weight > 0
            AND wss2.completed_at IS NOT NULL
            AND wss2.started_at < wss.started_at
         )
     GROUP BY ws.session_id, ws.exercise_id
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// --- Exercise History & Performance ---

export type ExerciseSession = {
  session_id: string;
  session_name: string;
  started_at: number;
  max_weight: number;
  max_reps: number;
  total_reps: number;
  set_count: number;
  volume: number;
  avg_rpe: number | null;
};

export type ExerciseRecords = {
  max_weight: number | null;
  max_reps: number | null;
  max_volume: number | null;
  est_1rm: number | null;
  total_sessions: number;
  is_bodyweight: boolean;
};

export async function getExerciseHistory(
  exerciseId: string,
  limit: number = 10,
  offset: number = 0
): Promise<ExerciseSession[]> {
  const database = await getDatabase();
  return database.getAllAsync<ExerciseSession>(
    `SELECT wss.id AS session_id,
            wss.name AS session_name,
            wss.started_at,
            MAX(ws.weight) AS max_weight,
            MAX(ws.reps) AS max_reps,
            SUM(ws.reps) AS total_reps,
            COUNT(ws.id) AS set_count,
            SUM(ws.weight * ws.reps) AS volume,
            AVG(CASE WHEN ws.rpe IS NOT NULL THEN ws.rpe END) AS avg_rpe
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND wss.completed_at IS NOT NULL
     GROUP BY wss.id
     ORDER BY wss.started_at DESC
     LIMIT ? OFFSET ?`,
    [exerciseId, limit, offset]
  );
}

export async function getExerciseRecords(exerciseId: string): Promise<ExerciseRecords> {
  const database = await getDatabase();

  const weight = await database.getFirstAsync<{ val: number | null }>(
    `SELECT MAX(ws.weight) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.weight > 0 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const reps = await database.getFirstAsync<{ val: number | null }>(
    `SELECT MAX(ws.reps) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const vol = await database.getFirstAsync<{ val: number | null }>(
    `SELECT MAX(sv) AS val FROM (
       SELECT SUM(ws.weight * ws.reps) AS sv
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
     )`,
    [exerciseId]
  );

  const rm = await database.getFirstAsync<{ val: number | null }>(
    `SELECT MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.weight > 0 AND ws.reps > 0 AND ws.reps <= 12 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const count = await database.getFirstAsync<{ val: number }>(
    `SELECT COUNT(DISTINCT wss.id) AS val
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ? AND ws.completed = 1 AND wss.completed_at IS NOT NULL`,
    [exerciseId]
  );

  const weighted = await database.getFirstAsync<{ val: number }>(
    `SELECT EXISTS(SELECT 1 FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND weight > 0) AS val`,
    [exerciseId]
  );

  return {
    max_weight: weight?.val ?? null,
    max_reps: reps?.val ?? null,
    max_volume: vol?.val ?? null,
    est_1rm: rm?.val ? Math.round(rm.val * 10) / 10 : null,
    total_sessions: count?.val ?? 0,
    is_bodyweight: !(weighted?.val),
  };
}

export async function getExerciseChartData(
  exerciseId: string,
  limit: number = 20
): Promise<{ date: number; value: number }[]> {
  const database = await getDatabase();

  // Try weight chart first
  const rows = await database.getAllAsync<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.weight) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );

  if (rows.length > 0) return rows;

  // Fallback: reps chart for bodyweight exercises
  return database.getAllAsync<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.reps) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND wss.completed_at IS NOT NULL
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, limit]
  );
}

// ---- Recent Exercise Sets (for progressive overload) ----

export async function getRecentExerciseSets(
  exerciseId: string,
  count: number,
): Promise<{
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
}[]> {
  const database = await getDatabase();
  return database.getAllAsync<{
    session_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    completed: number;
    started_at: number;
  }>(
    `SELECT ws.session_id, ws.set_number, ws.weight, ws.reps, ws.rpe,
            ws.completed, wss.started_at
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND wss.completed_at IS NOT NULL
       AND wss.id IN (
         SELECT DISTINCT wss2.id
         FROM workout_sessions wss2
         JOIN workout_sets ws2 ON ws2.session_id = wss2.id
         WHERE ws2.exercise_id = ?
           AND wss2.completed_at IS NOT NULL
         ORDER BY wss2.started_at DESC
         LIMIT ?
       )
     ORDER BY wss.started_at ASC, ws.set_number ASC`,
    [exerciseId, exerciseId, count],
  );
}

export async function getBestSet(
  exerciseId: string,
): Promise<{ weight: number; reps: number } | null> {
  const database = await getDatabase();
  return database.getFirstAsync<{ weight: number; reps: number }>(
    `SELECT ws.weight, ws.reps
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND ws.completed = 1
       AND ws.weight > 0
       AND ws.reps > 0
       AND ws.reps <= 12
       AND wss.completed_at IS NOT NULL
     ORDER BY ws.weight * (1.0 + ws.reps / 30.0) DESC
     LIMIT 1`,
    [exerciseId],
  );
}

// ---- Muscle Volume Analysis ----

export async function getMuscleVolumeForWeek(
  weekStart: number
): Promise<{ muscle: MuscleGroup; sets: number; exercises: number }[]> {
  const database = await getDatabase();
  const end = weekStart + 7 * 24 * 60 * 60 * 1000;

  const rows = await database.getAllAsync<{
    exercise_id: string;
    primary_muscles: string | null;
    sets: number;
  }>(
    `SELECT ws.exercise_id,
            e.primary_muscles,
            COUNT(*) AS sets
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE wss.completed_at IS NOT NULL
       AND wss.completed_at >= ?
       AND wss.completed_at < ?
       AND ws.completed = 1
     GROUP BY ws.exercise_id`,
    [weekStart, end]
  );

  const map = new Map<MuscleGroup, { sets: number; exercises: Set<string> }>();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    let muscles: MuscleGroup[];
    try {
      muscles = JSON.parse(row.primary_muscles);
    } catch {
      continue;
    }
    if (!Array.isArray(muscles) || muscles.length === 0) continue;

    for (const m of muscles) {
      const entry = map.get(m) ?? { sets: 0, exercises: new Set<string>() };
      entry.sets += row.sets;
      entry.exercises.add(row.exercise_id);
      map.set(m, entry);
    }
  }

  return Array.from(map.entries())
    .map(([muscle, data]) => ({
      muscle,
      sets: data.sets,
      exercises: data.exercises.size,
    }))
    .sort((a, b) => b.sets - a.sets);
}

export async function getMuscleVolumeTrend(
  muscle: MuscleGroup,
  weeks: number
): Promise<{ week: string; sets: number }[]> {
  const database = await getDatabase();
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diff);

  const oldest = new Date(monday);
  oldest.setDate(oldest.getDate() - (weeks - 1) * 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 7);

  const rows = await database.getAllAsync<{
    primary_muscles: string | null;
    completed_at: number;
    sets: number;
  }>(
    `SELECT e.primary_muscles, wss.completed_at, COUNT(*) AS sets
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE wss.completed_at IS NOT NULL
       AND wss.completed_at >= ?
       AND wss.completed_at < ?
       AND ws.completed = 1
     GROUP BY ws.exercise_id, wss.id`,
    [oldest.getTime(), end.getTime()]
  );

  // Bucket by week index
  const buckets = new Array<number>(weeks).fill(0);
  const oldestMs = oldest.getTime();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    try {
      const muscles: MuscleGroup[] = JSON.parse(row.primary_muscles);
      if (!muscles.includes(muscle)) continue;
    } catch {
      continue;
    }
    const idx = Math.floor((row.completed_at - oldestMs) / (7 * 24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < weeks) buckets[idx] += row.sets;
  }

  return buckets.map((sets, i) => ({ week: `W${i + 1}`, sets }));
}

// --------------- Post-Workout Summary ---------------

export async function getSessionRepPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; reps: number; previous_max: number }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{ exercise_id: string; name: string; reps: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_reps AS reps,
            hist.max_reps AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_reps > hist.max_reps
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getSessionComparison(
  sessionId: string
): Promise<{
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null> {
  const database = await getDatabase();

  const session = await database.getFirstAsync<{ template_id: string | null; started_at: number }>(
    "SELECT template_id, started_at FROM workout_sessions WHERE id = ?",
    [sessionId]
  );
  if (!session?.template_id) return null;

  const prev = await database.getFirstAsync<{ id: string; duration_seconds: number | null }>(
    `SELECT id, duration_seconds FROM workout_sessions
     WHERE template_id = ? AND id != ? AND completed_at IS NOT NULL
     ORDER BY started_at DESC LIMIT 1`,
    [session.template_id, sessionId]
  );
  if (!prev) return null;

  const agg = async (sid: string) => {
    const row = await database.getFirstAsync<{ vol: number; cnt: number }>(
      `SELECT COALESCE(SUM(CASE WHEN weight IS NOT NULL AND reps IS NOT NULL THEN weight * reps ELSE 0 END), 0) AS vol,
              COUNT(*) AS cnt
       FROM workout_sets WHERE session_id = ? AND completed = 1`,
      [sid]
    );
    return { volume: row?.vol ?? 0, sets: row?.cnt ?? 0 };
  };

  const curAgg = await agg(sessionId);
  const prevAgg = await agg(prev.id);

  const curSession = await database.getFirstAsync<{ duration_seconds: number | null }>(
    "SELECT duration_seconds FROM workout_sessions WHERE id = ?",
    [sessionId]
  );

  return {
    current: { ...curAgg, duration: curSession?.duration_seconds ?? 0 },
    previous: { ...prevAgg, duration: prev.duration_seconds ?? 0 },
  };
}

export async function getSessionWeightIncreases(
  sessionId: string
): Promise<{ exercise_id: string; name: string; current: number; previous: number }[]> {
  const database = await getDatabase();

  // Get max weight per exercise in current session
  const current = await database.getAllAsync<{
    exercise_id: string;
    name: string;
    max_weight: number;
  }>(
    `SELECT ws.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ?
       AND ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
     GROUP BY ws.exercise_id`,
    [sessionId]
  );

  if (current.length === 0) return [];

  const session = await database.getFirstAsync<{ started_at: number }>(
    "SELECT started_at FROM workout_sessions WHERE id = ?",
    [sessionId]
  );
  if (!session) return [];

  const result: { exercise_id: string; name: string; current: number; previous: number }[] = [];

  for (const ex of current) {
    // Find max weight from the most recent previous session with this exercise
    const prev = await database.getFirstAsync<{ max_weight: number }>(
      `SELECT MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND wss.id != ?
         AND wss.completed_at IS NOT NULL
         AND ws.completed = 1
         AND ws.weight > 0
         AND wss.started_at = (
           SELECT MAX(wss2.started_at)
           FROM workout_sessions wss2
           JOIN workout_sets ws2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ?
             AND wss2.id != ?
             AND wss2.completed_at IS NOT NULL
             AND ws2.completed = 1
         )`,
      [ex.exercise_id, sessionId, ex.exercise_id, sessionId]
    );

    if (prev?.max_weight && ex.max_weight > prev.max_weight) {
      result.push({
        exercise_id: ex.exercise_id,
        name: ex.name,
        current: ex.max_weight,
        previous: prev.max_weight,
      });
    }
  }

  return result;
}
