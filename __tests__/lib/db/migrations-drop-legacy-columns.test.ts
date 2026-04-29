/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-773 — Drop legacy F12/F13 columns from upgraded DBs.
 *
 * Verifies the destructive migration appended to `migrate()` issues exactly
 * the right `ALTER TABLE ... DROP COLUMN` statements for each starting
 * schema state:
 *
 *   1. Fresh DB (none of the legacy columns present)        → 0 drops
 *   2. Upgraded DB (all 4 legacy columns present)            → 4 drops
 *   3. Partially-migrated DB (some legacy columns present)   → only those dropped
 *
 * The repo has no real-SQLite test harness — `expo-sqlite` is universally
 * mocked. We simulate `PRAGMA table_info(<table>)` by tracking which
 * columns are "present" per table and assert the `execAsync` calls.
 *
 * BLD-783 rebase note: the original BLD-773 drop set included
 * `workout_sets.mount_position`, but BLD-771 (per-set cable variant
 * logging — landed on main during the PR's review window) reclaims that
 * exact column name with new semantics. Dropping it would destroy live
 * BLD-771 data. The drop is now scoped to 4 columns; the workout_sets
 * `mount_position` column is preserved with its new BLD-771 semantics.
 *
 * Sequencing note: we drop AFTER the rest of `migrate()` runs. Earlier
 * steps call `addColumnIfMissing` for `workout_sets.mount_position`
 * (BLD-771); the test allows that ADD but disallows ADD/DROP for the
 * dropped legacy fields (`training_mode`, `training_modes`, and
 * `exercises.mount_position`).
 */

const tables: Record<string, Set<string>> = {};

function resetSchema(initial: Record<string, string[]>): void {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const [t, cols] of Object.entries(initial)) {
    tables[t] = new Set(cols);
  }
}

const execCalls: string[] = [];
const runCalls: { sql: string; params: unknown[] }[] = [];

const mockDb = {
  execAsync: jest.fn(async (sql: string) => {
    execCalls.push(sql);
    // Simulate ALTER TABLE ADD COLUMN / DROP COLUMN against our in-memory
    // schema so PRAGMA table_info reflects the post-execution state.
    const addRe = /ALTER TABLE (\w+) ADD COLUMN (\w+)\b/i;
    const dropRe = /ALTER TABLE (\w+) DROP COLUMN (\w+)\b/i;
    let m = addRe.exec(sql);
    if (m) {
      const [, table, col] = m;
      tables[table] ??= new Set();
      tables[table].add(col);
      return undefined;
    }
    m = dropRe.exec(sql);
    if (m) {
      const [, table, col] = m;
      tables[table]?.delete(col);
      return undefined;
    }
    // Other DDL (CREATE TABLE / CREATE INDEX / UPDATE) is a no-op in tests.
    return undefined;
  }),
  getAllAsync: jest.fn(async (sql: string) => {
    const m = /PRAGMA table_info\((\w+)\)/.exec(sql);
    if (m) {
      const cols = tables[m[1]] ?? new Set();
      return Array.from(cols).map((name) => ({ name }));
    }
    return [];
  }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
    runCalls.push({ sql, params: params ?? [] });
    return { changes: 0 };
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { migrate } from "../../../lib/db/migrations";

const ALL_TABLES_FRESH: Record<string, string[]> = {
  // Reflects post-PR `lib/db/tables.ts` declarations — no legacy columns.
  exercises: [
    "id", "name", "category", "primary_muscles", "secondary_muscles",
    "equipment", "instructions", "difficulty", "is_custom", "deleted_at",
    "attachment", "is_voltra",
  ],
  workout_templates: ["id", "name", "created_at", "updated_at", "is_starter", "source"],
  template_exercises: [
    "id", "template_id", "exercise_id", "position", "target_sets",
    "target_reps", "rest_seconds", "link_id", "link_label",
    "target_duration_seconds", "set_types",
  ],
  workout_sessions: [
    "id", "template_id", "name", "started_at", "clock_started_at",
    "completed_at", "duration_seconds", "notes", "program_day_id",
    "rating", "edited_at",
  ],
  workout_sets: [
    "id", "session_id", "exercise_id", "set_number", "weight", "reps",
    "completed", "completed_at", "rpe", "notes", "link_id", "round",
    "tempo", "swapped_from_exercise_id", "set_type", "duration_seconds",
    "exercise_position", "bodyweight_modifier_kg",
  ],
  body_settings: [
    "id", "weight_unit", "measurement_unit", "sex", "weight_goal",
    "body_fat_goal", "updated_at",
  ],
  programs: [
    "id", "name", "description", "is_active", "current_day_id",
    "created_at", "updated_at", "deleted_at", "is_starter",
  ],
  strength_goals: [
    "id", "exercise_id", "target_weight", "target_reps", "deadline",
    "achieved_at", "created_at", "updated_at",
  ],
};

function withLegacyColumns(): Record<string, string[]> {
  const cloned = JSON.parse(JSON.stringify(ALL_TABLES_FRESH));
  cloned.workout_sets.push("training_mode", "mount_position");
  cloned.template_exercises.push("training_mode");
  cloned.exercises.push("mount_position", "training_modes");
  return cloned;
}

function dropStatementsFor(execStatements: string[]): string[] {
  return execStatements
    .filter((sql) => /ALTER TABLE \w+ DROP COLUMN \w+/i.test(sql))
    .map((sql) => sql.trim().replace(/\s+/g, " "));
}

beforeEach(() => {
  jest.clearAllMocks();
  execCalls.length = 0;
  runCalls.length = 0;
});

describe("migrate() — BLD-773 drop legacy F12/F13 columns", () => {
  it("drops the four legacy columns on an upgraded DB that has them all", async () => {
    resetSchema(withLegacyColumns());
    await migrate(mockDb as any);

    const drops = dropStatementsFor(execCalls);
    expect(drops).toEqual(
      expect.arrayContaining([
        "ALTER TABLE workout_sets DROP COLUMN training_mode",
        "ALTER TABLE template_exercises DROP COLUMN training_mode",
        "ALTER TABLE exercises DROP COLUMN mount_position",
        "ALTER TABLE exercises DROP COLUMN training_modes",
      ])
    );
    expect(drops).toHaveLength(4);

    // Post-migration: legacy columns are gone from the simulated schema.
    expect(tables.workout_sets.has("training_mode")).toBe(false);
    // BLD-783: workout_sets.mount_position is preserved (BLD-771 reclaim).
    expect(tables.workout_sets.has("mount_position")).toBe(true);
    expect(tables.template_exercises.has("training_mode")).toBe(false);
    expect(tables.exercises.has("mount_position")).toBe(false);
    expect(tables.exercises.has("training_modes")).toBe(false);
  });

  it("is a no-op on a fresh DB that never had the legacy columns", async () => {
    resetSchema(ALL_TABLES_FRESH);
    await migrate(mockDb as any);

    expect(dropStatementsFor(execCalls)).toEqual([]);
  });

  it("does not re-add the dropped legacy columns via ADD COLUMN anywhere in migrate()", async () => {
    resetSchema(ALL_TABLES_FRESH);
    await migrate(mockDb as any);

    // BLD-783: workout_sets.mount_position is intentionally re-added by
    // BLD-771 (per-set cable variant logging) — exclude it from the
    // "must-not-be-re-added" list. The other three legacy fields stay
    // forbidden.
    const addLegacy = execCalls.filter((sql) =>
      /ALTER TABLE (workout_sets|template_exercises) ADD COLUMN training_mode\b/i.test(sql) ||
      /ALTER TABLE exercises ADD COLUMN (mount_position|training_modes)\b/i.test(sql)
    );
    expect(addLegacy).toEqual([]);
  });

  it("only drops the legacy columns that are actually present (partial state)", async () => {
    // Simulate a DB that has ONLY workout_sets.training_mode + exercises.mount_position;
    // the other three legacy columns were never added (hypothetical mid-migration state).
    const partial = JSON.parse(JSON.stringify(ALL_TABLES_FRESH));
    partial.workout_sets.push("training_mode");
    partial.exercises.push("mount_position");
    resetSchema(partial);

    await migrate(mockDb as any);

    const drops = dropStatementsFor(execCalls);
    expect(drops).toEqual(
      expect.arrayContaining([
        "ALTER TABLE workout_sets DROP COLUMN training_mode",
        "ALTER TABLE exercises DROP COLUMN mount_position",
      ])
    );
    expect(drops).toHaveLength(2);
  });

  it("post-migration round-trip: a session+set INSERT path uses no legacy columns", async () => {
    // Smoke-test that the canonical workout_sets column set after migration
    // does not include legacy F12/F13 fields. This guards against accidental
    // re-introduction of `training_mode` to the live INSERT path in
    // lib/db/session-sets.ts. BLD-783: `mount_position` is now BLD-771's
    // cable-variant column and is expected to be present after migration.
    resetSchema(withLegacyColumns());
    await migrate(mockDb as any);

    expect(tables.workout_sets.has("weight")).toBe(true);
    expect(tables.workout_sets.has("reps")).toBe(true);
    expect(tables.workout_sets.has("set_type")).toBe(true);
    expect(tables.workout_sets.has("duration_seconds")).toBe(true);
    expect(tables.workout_sets.has("training_mode")).toBe(false);
    // BLD-783/BLD-771: mount_position is reclaimed for cable variant logging.
    expect(tables.workout_sets.has("mount_position")).toBe(true);
  });
});
