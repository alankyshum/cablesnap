/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-768: Lock the positional contract of addSetsBatch's prepared INSERT
// for bodyweight grip variant fields (grip_type, grip_width).
//
// Mirror of add-sets-batch-variant.test.ts (BLD-771). The 13-placeholder
// prepared statement is positional and easy to silently break in a future
// refactor. After BLD-771's training_mode column drop the INSERT is 13
// placeholders, not 14. This test pins:
//
//   - grip_type is bound at index 11 (12th param)
//   - grip_width is bound at index 12 (13th param, last)
//   - returned results carry the variant fields through unchanged
//   - omitting variant fields binds null (no silent default)
const mockExecuteAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockFinalizeAsync = jest.fn().mockResolvedValue(undefined);
const mockPrepareAsync = jest.fn().mockResolvedValue({
  executeAsync: mockExecuteAsync,
  finalizeAsync: mockFinalizeAsync,
});

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: mockPrepareAsync,
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({})),
}));

import { addSetsBatch } from '../../../lib/db/session-sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteAsync.mockResolvedValue({ changes: 1 });
  mockFinalizeAsync.mockResolvedValue(undefined);
  mockPrepareAsync.mockResolvedValue({
    executeAsync: mockExecuteAsync,
    finalizeAsync: mockFinalizeAsync,
  });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

describe('addSetsBatch — bodyweight variant positional binding (BLD-768)', () => {
  it('binds grip_type at param index 11 and grip_width at param index 12', async () => {
    await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        gripType: 'overhand',
        gripWidth: 'narrow',
      },
    ]);

    expect(mockExecuteAsync).toHaveBeenCalled();
    const args = mockExecuteAsync.mock.calls.at(-1)![0] as unknown[];
    expect(args).toHaveLength(13);
    // Slot order (post-BLD-771 column drop): id, session_id, exercise_id,
    // set_number, link_id, round, tempo, set_type, exercise_position,
    // attachment, mount_position, grip_type, grip_width.
    expect(args[1]).toBe('sess-1');           // session_id
    expect(args[2]).toBe('ex-1');             // exercise_id
    expect(args[3]).toBe(1);                  // set_number
    expect(args[9]).toBeNull();               // attachment
    expect(args[10]).toBeNull();              // mount_position
    expect(args[11]).toBe('overhand');        // grip_type
    expect(args[12]).toBe('narrow');          // grip_width
  });

  it('binds null at grip_type + grip_width slots when caller omits them (no silent default)', async () => {
    await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
      },
    ]);

    const args = mockExecuteAsync.mock.calls.at(-1)![0] as unknown[];
    expect(args[11]).toBeNull();
    expect(args[12]).toBeNull();
  });

  it('returned results round-trip the bodyweight variant fields unchanged', async () => {
    const results = await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        gripType: 'overhand',
        gripWidth: 'narrow',
      },
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 2,
        // omit grip — must be null in returned shape, not undefined.
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].grip_type).toBe('overhand');
    expect(results[0].grip_width).toBe('narrow');
    expect(results[1].grip_type).toBeNull();
    expect(results[1].grip_width).toBeNull();
  });

  it('binds cable + bodyweight variant fields independently on the same set (weighted pull-up scenario)', async () => {
    // Edge case from PLAN-BLD-768.md: weighted pull-up has both
    // bodyweight_modifier_kg AND grip_type. Although the modifier itself isn't
    // in this INSERT (it's set by the modifier sheet), this test verifies that
    // attachment/mount slots stay null while grip slots carry values, proving
    // the two variant systems are truly orthogonal at the binding layer.
    await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        gripType: 'overhand',
        gripWidth: 'narrow',
      },
    ]);
    const args = mockExecuteAsync.mock.calls.at(-1)![0] as unknown[];
    expect(args[9]).toBeNull();               // attachment must NOT bleed
    expect(args[10]).toBeNull();              // mount_position must NOT bleed
    expect(args[11]).toBe('overhand');
    expect(args[12]).toBe('narrow');
  });
});
