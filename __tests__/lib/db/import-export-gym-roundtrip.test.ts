/* eslint-disable @typescript-eslint/no-explicit-any */
const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue(undefined),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb: any = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
  withTransactionAsync: jest.fn(async (cb: (db: any) => Promise<void>) => cb(mockDb)),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { exportAllData, importData } from "../../../lib/db/import-export";

describe("import-export gym round-trip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getFirstAsync.mockResolvedValue({ cnt: 0 });
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
  });

  it("exports and re-imports gym tables plus session/set snapshot fields", async () => {
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("gym_profiles")) {
        return [{ id: "g1", name: "Home Gym", notes: "", is_default: 1, created_at: 1, updated_at: 1, deleted_at: null }];
      }
      if (sql.includes("cable_stacks")) {
        return [{ id: "stack-1", gym_id: "g1", name: "Dual Pulley", unit: "kg", position: 2, created_at: 2, updated_at: 2, deleted_at: null }];
      }
      if (sql.includes("stack_calibrations")) {
        return [{ id: "cal-1", stack_id: "stack-1", marker: 10, true_weight: 30 }];
      }
      if (sql.includes("workout_sessions")) {
        return [{ id: "sess-1", template_id: null, name: "Pull Day", started_at: 3, completed_at: 4, duration_seconds: 1800, notes: "", program_day_id: null, rating: null, import_batch_id: null, gym_id: "g1", gym_name_at_log: "Home Gym" }];
      }
      if (sql.includes("workout_sets")) {
        return [{ id: "set-1", session_id: "sess-1", exercise_id: "ex-1", set_number: 1, weight: 30, reps: 10, completed: 1, completed_at: 4, rpe: null, notes: "", link_id: null, round: null, tempo: null, set_type: "normal", duration_seconds: null, bodyweight_modifier_kg: null, attachment: null, mount_position: null, grip_type: null, grip_width: null, stack_id: "stack-1", stack_marker: 10, stack_unit_at_log: "kg", stack_name_at_log: "Dual Pulley" }];
      }
      return [];
    });

    const backup = await exportAllData();
    const history = (backup.data as Record<string, Record<string, any[]>>).workout_history;

    expect(history.gym_profiles[0].name).toBe("Home Gym");
    expect(history.cable_stacks[0].position).toBe(2);
    expect(history.stack_calibrations[0].true_weight).toBe(30);
    expect(history.workout_sessions[0].gym_name_at_log).toBe("Home Gym");
    expect(history.workout_sets[0].stack_name_at_log).toBe("Dual Pulley");

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      insertCalls.push({ sql, params });
      return { changes: 1 };
    });

    await importData(backup as unknown as Record<string, unknown>);

    expect(insertCalls.find((call) => call.sql.includes("INSERT OR IGNORE INTO gym_profiles"))?.params).toEqual([
      "g1", "Home Gym", "", 1, 1, 1, null,
    ]);
    expect(insertCalls.find((call) => call.sql.includes("INSERT OR IGNORE INTO cable_stacks"))?.params).toEqual([
      "stack-1", "g1", "Dual Pulley", "kg", 2, 2, 2, null, null, null, null,
    ]);
    expect(insertCalls.find((call) => call.sql.includes("INSERT OR IGNORE INTO stack_calibrations"))?.params).toEqual([
      "cal-1", "stack-1", 10, 30,
    ]);

    const sessionInsert = insertCalls.find((call) => call.sql.includes("INSERT OR IGNORE INTO workout_sessions"));
    expect(sessionInsert?.params?.[10]).toBe("g1");
    expect(sessionInsert?.params?.[11]).toBe("Home Gym");

    const setInsert = insertCalls.find((call) => call.sql.includes("INSERT OR IGNORE INTO workout_sets"));
    expect(setInsert?.params?.[20]).toBe("stack-1");
    expect(setInsert?.params?.[21]).toBe(10);
    expect(setInsert?.params?.[22]).toBe("kg");
    expect(setInsert?.params?.[23]).toBe("Dual Pulley");
  });

  it("round-trips soft-deleted rows with non-null deleted_at (plan §245 binding contract)", async () => {
    // Plan line 245: "a row exported with deleted_at = 1730000000 imports
    // with deleted_at = 1730000000". Verifies the INSERT OR IGNORE path
    // preserves non-null deleted_at byte-for-byte.
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("gym_profiles")) {
        return [
          { id: "g-live", name: "Active Gym", notes: "", is_default: 1, created_at: 1, updated_at: 1, deleted_at: null },
          { id: "g-del", name: "Closed Gym", notes: "", is_default: 0, created_at: 2, updated_at: 3, deleted_at: 1730000000 },
        ];
      }
      if (sql.includes("cable_stacks")) {
        return [
          { id: "stack-live", gym_id: "g-live", name: "Active Stack", unit: "kg", position: 1, created_at: 4, updated_at: 4, deleted_at: null },
          { id: "stack-del", gym_id: "g-del", name: "Old Stack", unit: "lb", position: 1, created_at: 5, updated_at: 6, deleted_at: 1730000000 },
        ];
      }
      if (sql.includes("stack_calibrations")) return [];
      if (sql.includes("workout_sessions")) return [];
      if (sql.includes("workout_sets")) return [];
      return [];
    });

    const backup = await exportAllData();
    const history = (backup.data as Record<string, Record<string, any[]>>).workout_history;

    // Backup must preserve the non-null deleted_at
    expect(history.gym_profiles.find((r: any) => r.id === "g-del")?.deleted_at).toBe(1730000000);
    expect(history.cable_stacks.find((r: any) => r.id === "stack-del")?.deleted_at).toBe(1730000000);

    const insertCalls: Array<{ sql: string; params: unknown[] }> = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      insertCalls.push({ sql, params });
      return { changes: 1 };
    });

    await importData(backup as unknown as Record<string, unknown>);

    // INSERT OR IGNORE must pass deleted_at: 1730000000 for the soft-deleted rows
    const gymInserts = insertCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO gym_profiles"));
    const deletedGymInsert = gymInserts.find((c) => (c.params as unknown[]).includes("g-del"));
    expect(deletedGymInsert?.params).toContain(1730000000);

    const stackInserts = insertCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO cable_stacks"));
    const deletedStackInsert = stackInserts.find((c) => (c.params as unknown[]).includes("stack-del"));
    expect(deletedStackInsert?.params).toContain(1730000000);
  });
});
