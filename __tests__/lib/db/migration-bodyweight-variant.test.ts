/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-768: Idempotency test for grip_type / grip_width column migrations.
//
// The plan AC requires an EXPLICIT idempotency assertion (not implicit
// reliance on BLD-771's analogous test). This file verifies:
//
//   1. First run: ALTER TABLE ADD COLUMN issued for both grip columns
//      (when they're missing from PRAGMA table_info).
//   2. Second run: NO ALTER issued (columns now present in PRAGMA result).
//   3. Pre-migration row safety: existing workout_sets rows are NOT touched
//      (no UPDATE or DELETE issued during the migration).
//
// The test mocks `expo-sqlite` so we can drive `PRAGMA table_info` results
// directly and observe what SQL the migration actually issues.

const execCalls: string[] = [];
const pragmaResults: { workout_sets: { name: string }[] } = {
  workout_sets: [
    { name: 'id' },
    { name: 'session_id' },
    { name: 'exercise_id' },
    { name: 'set_number' },
    // BLD-771's variant columns — present from a recent BLD-771 migration:
    { name: 'attachment' },
    { name: 'mount_position' },
    // grip_type / grip_width INTENTIONALLY ABSENT for first-run scenario.
  ],
};

// Tracks PRAGMA call count so the second run can return the post-migration
// table shape (columns present).
let runIndex = 0;

const mockGetAllAsync = jest.fn(async (sql: string) => {
  if (sql.startsWith('PRAGMA table_info(workout_sets)')) {
    return pragmaResults.workout_sets;
  }
  // Other PRAGMA calls (other tables) — return a default shape that doesn't
  // matter for this test.
  return [];
});
const mockExecAsync = jest.fn(async (sql: string) => {
  execCalls.push(sql);
});
const mockRunAsync = jest.fn().mockResolvedValue({ changes: 0 });
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: mockExecAsync,
    getAllAsync: mockGetAllAsync,
    getFirstAsync: mockGetFirstAsync,
    runAsync: mockRunAsync,
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
    prepareAsync: jest.fn(),
  })),
}));

import { addColumnIfMissing, hasColumn } from '../../../lib/db/tables';
import * as SQLite from 'expo-sqlite';

beforeEach(() => {
  execCalls.length = 0;
  jest.clearAllMocks();
  runIndex = 0;
  // Reset to first-run state.
  pragmaResults.workout_sets = [
    { name: 'id' },
    { name: 'session_id' },
    { name: 'exercise_id' },
    { name: 'set_number' },
    { name: 'attachment' },
    { name: 'mount_position' },
  ];
  mockGetAllAsync.mockImplementation(async (sql: string) => {
    if (sql.startsWith('PRAGMA table_info(workout_sets)')) {
      return pragmaResults.workout_sets;
    }
    return [];
  });
});

describe('migration idempotency for grip_type + grip_width (BLD-768)', () => {
  it('first migration run issues ALTER TABLE ADD COLUMN for both grip columns', async () => {
    const db = await SQLite.openDatabaseAsync('test.db');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_type', 'TEXT DEFAULT NULL');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_width', 'TEXT DEFAULT NULL');

    // Both ALTERs must fire on first run (columns absent from pragma).
    const alterStmts = execCalls.filter((s) => s.startsWith('ALTER TABLE workout_sets ADD COLUMN'));
    expect(alterStmts).toHaveLength(2);
    expect(alterStmts[0]).toContain('grip_type TEXT DEFAULT NULL');
    expect(alterStmts[1]).toContain('grip_width TEXT DEFAULT NULL');
  });

  it('second migration run is a no-op — zero ALTER TABLE statements issued', async () => {
    // Simulate post-first-run state: grip columns now present in table_info.
    pragmaResults.workout_sets = [
      { name: 'id' },
      { name: 'session_id' },
      { name: 'exercise_id' },
      { name: 'set_number' },
      { name: 'attachment' },
      { name: 'mount_position' },
      { name: 'grip_type' },
      { name: 'grip_width' },
    ];

    const db = await SQLite.openDatabaseAsync('test.db');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_type', 'TEXT DEFAULT NULL');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_width', 'TEXT DEFAULT NULL');

    const alterStmts = execCalls.filter((s) => s.startsWith('ALTER TABLE workout_sets ADD COLUMN'));
    expect(alterStmts).toHaveLength(0);
  });

  it('migration NEVER issues UPDATE or DELETE on workout_sets — pre-migration rows untouched', async () => {
    const db = await SQLite.openDatabaseAsync('test.db');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_type', 'TEXT DEFAULT NULL');
    await addColumnIfMissing(db as any, 'workout_sets', 'grip_width', 'TEXT DEFAULT NULL');

    const dataMutations = execCalls.filter((s) =>
      /^(UPDATE|DELETE)\s+workout_sets/i.test(s)
    );
    expect(dataMutations).toHaveLength(0);
    // Also verify runAsync (drizzle-style writes) was never called for workout_sets.
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('hasColumn returns true after migration, false before (sanity)', async () => {
    const db = await SQLite.openDatabaseAsync('test.db');

    // Before: grip_type absent.
    expect(await hasColumn(db as any, 'workout_sets', 'grip_type')).toBe(false);
    expect(await hasColumn(db as any, 'workout_sets', 'grip_width')).toBe(false);

    // Simulate ALTER TABLE having succeeded by extending the pragma result.
    pragmaResults.workout_sets = [
      ...pragmaResults.workout_sets,
      { name: 'grip_type' },
      { name: 'grip_width' },
    ];

    expect(await hasColumn(db as any, 'workout_sets', 'grip_type')).toBe(true);
    expect(await hasColumn(db as any, 'workout_sets', 'grip_width')).toBe(true);
  });
});
