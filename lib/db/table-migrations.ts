import * as SQLite from "expo-sqlite";
import { addColumnIfMissing, createScheduleTables } from "./tables";

let migSeq = 0;
function migrationUUID(): string {
  migSeq++;
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `mig-${ts}-${rnd}-${migSeq}`;
}

async function resolveOrCreateProgram(
  database: SQLite.SQLiteDatabase,
  oldSched: { day_of_week: number; template_id: string }[],
): Promise<string> {
  const activeProg = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM programs WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1"
  );
  if (activeProg) return activeProg.id;

  const pid = migrationUUID();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)",
    [pid, "My Weekly Routine", "", now, now]
  );
  const uniqueTemplates = [...new Set(oldSched.map((s) => s.template_id))];
  let firstDayId: string | undefined;
  for (const [i, templateId] of uniqueTemplates.entries()) {
    const dayId = migrationUUID();
    if (!firstDayId) firstDayId = dayId;
    await database.runAsync(
      "INSERT INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, '')",
      [dayId, pid, templateId, i]
    );
  }
  if (firstDayId) {
    await database.runAsync("UPDATE programs SET current_day_id = ? WHERE id = ?", [firstDayId, pid]);
  }
  return pid;
}

export async function createScheduleAndMigrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await createScheduleTables(database);

  // Migrate weekly_schedule → program_schedule on active program
  const hasMigrated = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = 'schedule_migrated'"
  );
  if (!hasMigrated) {
    const oldSched = await database.getAllAsync<{ day_of_week: number; template_id: string }>(
      "SELECT day_of_week, template_id FROM weekly_schedule"
    );
    if (oldSched.length > 0) {
      const targetProgramId = await resolveOrCreateProgram(database, oldSched);
      for (const s of oldSched) {
        await database.runAsync(
          "INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)",
          [targetProgramId, s.day_of_week, s.template_id]
        );
      }
    }
    await database.runAsync(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schedule_migrated', '1')"
    );
  }
}

export async function migrateExerciseAndFeatureColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(database, "exercises", "mount_position", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "attachment", "TEXT DEFAULT 'handle'");
  await addColumnIfMissing(database, "exercises", "training_modes", `TEXT DEFAULT '["weight"]'`);
  await addColumnIfMissing(database, "exercises", "is_voltra", "INTEGER DEFAULT 0");

  const hasVoltra = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM exercises WHERE is_voltra = 1 AND deleted_at IS NULL"
  );
  if ((hasVoltra?.count ?? 0) === 0) {
    await database.withTransactionAsync(async () => {
      const now = Date.now();
      await database.runAsync(
        "UPDATE exercises SET deleted_at = ? WHERE is_custom = 0 AND deleted_at IS NULL",
        [now]
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'arms' WHERE is_custom = 1 AND category IN ('biceps', 'triceps')"
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'legs_glutes' WHERE is_custom = 1 AND category IN ('legs', 'cardio')"
      );
      await database.runAsync(
        "UPDATE exercises SET category = 'abs_core' WHERE is_custom = 1 AND category IN ('core', 'full_body')"
      );
    });
  }

  await addColumnIfMissing(database, "workout_templates", "is_starter", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "programs", "is_starter", "INTEGER DEFAULT 0");
}
