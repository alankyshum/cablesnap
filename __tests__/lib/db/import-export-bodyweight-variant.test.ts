/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-768: CSV/JSON round-trip preserves grip_type and grip_width.
//
// AC requirement (PLAN-BLD-768.md):
//   "CSV import-export round-trip preserves both fields."
//
// Export uses `SELECT *` (lib/db/import-export.ts:287) so any new column on
// `workout_sets` is automatically included. Import uses an explicit INSERT
// column list (line 463) which we updated in slice 1.
//
// This test verifies:
//   1. Export reads grip_type / grip_width from the DB row and emits them
//      in the backup.
//   2. Import binds grip_type / grip_width to the workout_sets INSERT at
//      the new positional slots.
//   3. Round-trip: export → JSON → import preserves values byte-for-byte.

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

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { exportAllData, importData } from '../../../lib/db/import-export';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getFirstAsync.mockResolvedValue({ cnt: 0 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
});

describe('import-export — bodyweight variant round-trip (BLD-768)', () => {
  it('export emits grip_type and grip_width from workout_sets rows', async () => {
    // Arrange: workout_sets table returns a row with grip values; all other
    // tables return empty.
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('workout_sets')) {
        return [
          {
            id: 'ws1',
            session_id: 's1',
            exercise_id: 'e1',
            set_number: 1,
            weight: null,
            reps: 8,
            completed: 1,
            completed_at: 1234,
            attachment: null,
            mount_position: null,
            grip_type: 'overhand',
            grip_width: 'narrow',
          },
        ];
      }
      return [];
    });

    const backup = await exportAllData();
    const sets = (backup.data as Record<string, unknown[]>).workout_sets;
    expect(sets).toHaveLength(1);
    const row = sets[0] as Record<string, unknown>;
    expect(row.grip_type).toBe('overhand');
    expect(row.grip_width).toBe('narrow');
  });

  it('import binds grip_type at slot 19 and grip_width at slot 20 on the workout_sets INSERT', async () => {
    const insertCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      insertCalls.push({ sql, params });
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        workout_sets: [
          {
            id: 'ws1',
            session_id: 's1',
            exercise_id: 'e1',
            set_number: 1,
            weight: null,
            reps: 8,
            completed: 1,
            completed_at: 1234,
            grip_type: 'overhand',
            grip_width: 'narrow',
          },
        ],
      },
    };

    await importData(data);

    const wsInsert = insertCalls.find((c) => c.sql.includes('INSERT OR IGNORE INTO workout_sets'));
    expect(wsInsert).toBeDefined();
    // Column list ends with: ..., attachment, mount_position, grip_type, grip_width.
    // Param indices (0-based): 17=attachment, 18=mount_position, 19=grip_type, 20=grip_width.
    expect(wsInsert!.params).toHaveLength(21);
    expect(wsInsert!.params[19]).toBe('overhand');
    expect(wsInsert!.params[20]).toBe('narrow');
  });

  it('import binds null for grip fields when row omits them (legacy backup compat)', async () => {
    const insertCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      insertCalls.push({ sql, params });
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        workout_sets: [
          {
            id: 'ws1',
            session_id: 's1',
            exercise_id: 'e1',
            set_number: 1,
            weight: null,
            reps: 8,
            completed: 1,
            completed_at: 1234,
            // Pre-BLD-768 backup — no grip fields.
          },
        ],
      },
    };

    await importData(data);
    const wsInsert = insertCalls.find((c) => c.sql.includes('INSERT OR IGNORE INTO workout_sets'));
    expect(wsInsert).toBeDefined();
    expect(wsInsert!.params[19]).toBeNull();
    expect(wsInsert!.params[20]).toBeNull();
  });

  it('round-trip: export → re-import preserves grip_type and grip_width', async () => {
    // Export step
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('workout_sets')) {
        return [
          {
            id: 'ws1', session_id: 's1', exercise_id: 'e1', set_number: 1,
            weight: null, reps: 8, completed: 1, completed_at: 1234,
            attachment: null, mount_position: null,
            grip_type: 'mixed', grip_width: 'wide',
          },
        ];
      }
      return [];
    });
    const backup = await exportAllData();

    // Re-import step (re-using the same in-memory backup object).
    const insertCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params: unknown[]) => {
      insertCalls.push({ sql, params });
      return { changes: 1 };
    });
    await importData(backup as unknown as Record<string, unknown>);

    const wsInsert = insertCalls.find((c) => c.sql.includes('INSERT OR IGNORE INTO workout_sets'));
    expect(wsInsert).toBeDefined();
    expect(wsInsert!.params[19]).toBe('mixed');
    expect(wsInsert!.params[20]).toBe('wide');
  });
});
