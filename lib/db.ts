import * as SQLite from "expo-sqlite";
import type {
  Exercise,
  WorkoutTemplate,
  TemplateExercise,
  WorkoutSession,
  WorkoutSet,
} from "./types";
import { seedExercises } from "./seed";

const DB_NAME = "fitforge.db";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(db);
  await seed(db);
  return db;
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
  `);
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
    "SELECT * FROM exercises ORDER BY name ASC"
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
  };
}

export async function removeExerciseFromTemplate(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ template_id: string }>(
    "SELECT template_id FROM template_exercises WHERE id = ?",
    [id]
  );
  await database.runAsync("DELETE FROM template_exercises WHERE id = ?", [id]);
  if (row) {
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
  name: string
): Promise<WorkoutSession> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO workout_sessions (id, template_id, name, started_at, notes) VALUES (?, ?, ?, ?, '')",
    [id, templateId, name, now]
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
  setNumber: number
): Promise<WorkoutSet> {
  const database = await getDatabase();
  const id = crypto.randomUUID();
  await database.runAsync(
    "INSERT INTO workout_sets (id, session_id, exercise_id, set_number) VALUES (?, ?, ?, ?)",
    [id, sessionId, exerciseId, setNumber]
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
    `SELECT ws.exercise_id, e.name, MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND ws.weight IS NOT NULL AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id
     ORDER BY e.name ASC`
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
}> {
  const database = await getDatabase();
  const exercises = await database.getAllAsync<ExerciseRow>("SELECT * FROM exercises");
  const templates = await database.getAllAsync<WorkoutTemplate>("SELECT * FROM workout_templates");
  const tplExercises = await database.getAllAsync<TemplateExercise>("SELECT * FROM template_exercises");
  const sessions = await database.getAllAsync<WorkoutSession>("SELECT * FROM workout_sessions");
  const sets = await database.getAllAsync<WorkoutSet>("SELECT * FROM workout_sets");
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    exercises,
    templates,
    template_exercises: tplExercises,
    sessions,
    sets,
  };
}

export async function importData(data: {
  version: number;
  exercises?: { id: string; name: string; category: string; primary_muscles: string; secondary_muscles: string; equipment: string; instructions: string; difficulty: string; is_custom: number }[];
  templates?: { id: string; name: string; created_at: number; updated_at: number }[];
  template_exercises?: { id: string; template_id: string; exercise_id: string; position: number; target_sets: number; target_reps: string; rest_seconds: number }[];
  sessions?: { id: string; template_id: string | null; name: string; started_at: number; completed_at: number | null; duration_seconds: number | null; notes: string }[];
  sets?: { id: string; session_id: string; exercise_id: string; set_number: number; weight: number | null; reps: number | null; completed: number; completed_at: number | null }[];
}): Promise<{ inserted: number }> {
  const database = await getDatabase();
  let inserted = 0;

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
        "INSERT OR IGNORE INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [te.id, te.template_id, te.exercise_id, te.position, te.target_sets, te.target_reps, te.rest_seconds]
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
        "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [s.id, s.session_id, s.exercise_id, s.set_number, s.weight, s.reps, s.completed, s.completed_at]
      );
      inserted += r.changes;
    }
  }

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
