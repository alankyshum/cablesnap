/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1044 — Backfill migration: renumber non-contiguous set_number rows.
 *
 * Verifies that the CTE UPDATE appended to migrate() in lib/db/migrations.ts:
 *   - is included in every migrate() call
 *   - scopes to only rows where rn != set_number (fast-path for clean DBs)
 *   - is idempotent (calling migrate() twice issues the CTE UPDATE both times
 *     but both are no-ops on an already-clean schema)
 *
 * Like other migration tests in this suite we do NOT run real SQLite —
 * expo-sqlite is universally mocked. We capture the raw SQL string emitted
 * via execAsync and assert its shape.
 */

/** All execAsync calls recorded during the test. */
const execCalls: string[] = [];

const mockDb = {
  execAsync: jest.fn(async (sql: string) => {
    execCalls.push(sql);
    return undefined;
  }),
  getAllAsync: jest.fn(async (pragmaSql: string) => {
    // Minimal PRAGMA table_info() response so addColumnIfMissing / hasColumn work.
    // Return a non-empty column list so migrate() doesn't try to add every column.
    const m = /PRAGMA table_info\((\w+)\)/i.exec(pragmaSql);
    if (m) {
      // Return the canonical columns that already exist on the table so no
      // ADD COLUMN migrations fire (they are all idempotent anyway, but
      // keeping the list broad avoids noise in execCalls).
      const BASE_COLS: Record<string, string[]> = {
        exercises: ["id", "name", "category", "deleted_at", "attachment", "is_voltra",
          "start_image_uri", "end_image_uri", "progression_group", "progression_order"],
        workout_templates: ["id", "name", "is_starter", "source"],
        template_exercises: ["id", "template_id", "exercise_id", "position",
          "target_sets", "target_reps", "rest_seconds", "link_id", "link_label",
          "target_duration_seconds", "set_types", "training_mode"],
        workout_sets: ["id", "session_id", "exercise_id", "set_number", "weight",
          "reps", "completed", "completed_at", "rpe", "notes", "link_id", "round",
          "tempo", "swapped_from_exercise_id", "set_type", "duration_seconds",
          "exercise_position", "bodyweight_modifier_kg", "attachment", "mount_position",
          "grip_type", "grip_width", "training_mode"],
        workout_sessions: ["id", "template_id", "name", "started_at", "clock_started_at",
          "completed_at", "duration_seconds", "notes", "program_day_id", "rating", "edited_at"],
        body_settings: ["id", "weight_unit", "measurement_unit", "sex", "weight_goal",
          "body_fat_goal", "updated_at"],
        programs: ["id", "name", "description", "is_active", "current_day_id",
          "created_at", "updated_at", "deleted_at", "is_starter"],
        strength_goals: ["id", "exercise_id", "target_weight", "target_reps", "deadline",
          "achieved_at", "created_at", "updated_at"],
        daily_log: ["id", "date", "water_ml"],
        meals: ["id", "log_id", "name"],
        meal_items: ["id", "meal_id", "name", "calories", "protein_g", "carbs_g", "fat_g"],
        user_program_progress: ["id", "program_id", "current_day_id", "started_at", "updated_at"],
        program_days: ["id", "program_id", "name", "position", "template_id"],
        progression_sessions: ["id", "exercise_id", "session_id", "achieved_at"],
        session_ratings: ["id", "session_id", "rating", "created_at"],
        photos: ["id", "session_id", "uri", "created_at"],
      };
      const cols = BASE_COLS[m[1]] ?? ["id"];
      return cols.map((name) => ({ name }));
    }
    return [];
  }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 0 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue({ changes: 0 }),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { migrate } from "../../../lib/db/migrations";

beforeEach(() => {
  jest.clearAllMocks();
  execCalls.length = 0;
  mockDb.execAsync.mockImplementation(async (sql: string) => {
    execCalls.push(sql);
    return undefined;
  });
  mockDb.getAllAsync.mockImplementation(async (pragmaSql: string) => {
    const m = /PRAGMA table_info\((\w+)\)/i.exec(pragmaSql);
    if (m) {
      const BASE_COLS: Record<string, string[]> = {
        exercises: ["id", "name", "category", "deleted_at", "attachment", "is_voltra",
          "start_image_uri", "end_image_uri", "progression_group", "progression_order"],
        workout_templates: ["id", "name", "is_starter", "source"],
        template_exercises: ["id", "template_id", "exercise_id", "position",
          "target_sets", "target_reps", "rest_seconds", "link_id", "link_label",
          "target_duration_seconds", "set_types", "training_mode"],
        workout_sets: ["id", "session_id", "exercise_id", "set_number", "weight",
          "reps", "completed", "completed_at", "rpe", "notes", "link_id", "round",
          "tempo", "swapped_from_exercise_id", "set_type", "duration_seconds",
          "exercise_position", "bodyweight_modifier_kg", "attachment", "mount_position",
          "grip_type", "grip_width", "training_mode"],
        workout_sessions: ["id", "template_id", "name", "started_at", "clock_started_at",
          "completed_at", "duration_seconds", "notes", "program_day_id", "rating", "edited_at"],
        body_settings: ["id", "weight_unit", "measurement_unit", "sex", "weight_goal",
          "body_fat_goal", "updated_at"],
        programs: ["id", "name", "description", "is_active", "current_day_id",
          "created_at", "updated_at", "deleted_at", "is_starter"],
        strength_goals: ["id", "exercise_id", "target_weight", "target_reps", "deadline",
          "achieved_at", "created_at", "updated_at"],
        daily_log: ["id", "date", "water_ml"],
        meals: ["id", "log_id", "name"],
        meal_items: ["id", "meal_id", "name", "calories", "protein_g", "carbs_g", "fat_g"],
      };
      const cols = BASE_COLS[m[1]] ?? ["id"];
      return cols.map((name) => ({ name }));
    }
    return [];
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Extract the BLD-1044 backfill CTE UPDATE from execCalls. */
function findBackfillCall(): string | undefined {
  return execCalls.find((sql) => /ROW_NUMBER.*PARTITION BY session_id, exercise_id/s.test(sql));
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("migrate() — BLD-1044 set_number backfill", () => {
  it("includes the ROW_NUMBER backfill UPDATE on every migrate() call", async () => {
    await migrate(mockDb as any);
    expect(findBackfillCall()).toBeDefined();
  });

  it("the backfill SQL PARTITIONs by session_id and exercise_id", async () => {
    await migrate(mockDb as any);
    const sql = findBackfillCall()!;
    expect(sql).toMatch(/PARTITION BY session_id, exercise_id/i);
  });

  it("the backfill SQL ORDERs by set_number ASC, id ASC (deterministic tiebreak)", async () => {
    await migrate(mockDb as any);
    const sql = findBackfillCall()!;
    expect(sql).toMatch(/ORDER BY set_number ASC, id ASC/i);
  });

  it("the backfill UPDATE has a WHERE rn != set_number fast-path guard (idempotent no-op on clean data)", async () => {
    await migrate(mockDb as any);
    const sql = findBackfillCall()!;
    // The WHERE clause should only update rows where the computed row_number differs
    // from the current set_number so already-contiguous rows are never written.
    expect(sql).toMatch(/rn\s*!=\s*workout_sets\.set_number/i);
  });

  it("is idempotent: calling migrate() twice emits the backfill SQL both times without error", async () => {
    await migrate(mockDb as any);
    const firstCallCount = execCalls.filter((s) => /PARTITION BY session_id, exercise_id/s.test(s)).length;
    execCalls.length = 0;

    await migrate(mockDb as any);
    const secondCallCount = execCalls.filter((s) => /PARTITION BY session_id, exercise_id/s.test(s)).length;

    expect(firstCallCount).toBe(1);
    expect(secondCallCount).toBe(1);
  });
});
