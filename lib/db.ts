import * as SQLite from "expo-sqlite";
import type { Exercise } from "./types";
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
