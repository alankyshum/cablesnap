/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-771: Lock the positional contract of addSetsBatch's prepared INSERT.
//
// Techlead review on PR #426 (comment 5ccee2ba) flagged that the
// prepared statement is positional and easy to silently break in a
// future refactor. This test pins:
//
//   - attachment is bound at index 9 (10th param)
//   - mount_position is bound at index 10 (11th param, last)
//   - returned results carry the variant fields through unchanged
//
// BLD-783 rebase update: BLD-773 dropped the legacy `training_mode`
// column, so the binding shrank from 12 → 11 slots. The variant slots
// shifted left by one (10 → 9 and 11 → 10).
//
// We assert on the args passed to executeAsync (positional) rather than
// on the SQL string, because the SQL string is what we'd otherwise need
// to refactor first if we ever switch to drizzle's values([...]) form.
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
  // clearAllMocks wipes mockResolvedValue too — restore the chain.
  mockExecuteAsync.mockResolvedValue({ changes: 1 });
  mockFinalizeAsync.mockResolvedValue(undefined);
  mockPrepareAsync.mockResolvedValue({
    executeAsync: mockExecuteAsync,
    finalizeAsync: mockFinalizeAsync,
  });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

describe('addSetsBatch — variant positional binding (BLD-771)', () => {
  it('binds attachment at param index 9 and mount_position at param index 10', async () => {
    await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        attachment: 'rope',
        mountPosition: 'low',
      },
    ]);

    // First-run init may invoke executeAsync via the seed step on the
    // shared cached db — assert on the last call (the addSetsBatch INSERT)
    // rather than the total count.
    expect(mockExecuteAsync).toHaveBeenCalled();
    const args = mockExecuteAsync.mock.calls.at(-1)![0] as unknown[];
    expect(args).toHaveLength(13);
    // Slot order is: id, session_id, exercise_id, set_number, link_id,
    // round, tempo, set_type, exercise_position,
    // attachment, mount_position, grip_type, grip_width.
    expect(args[1]).toBe('sess-1');           // session_id
    expect(args[2]).toBe('ex-1');             // exercise_id
    expect(args[3]).toBe(1);                  // set_number
    expect(args[9]).toBe('rope');             // attachment
    expect(args[10]).toBe('low');             // mount_position
  });

  it('binds null at attachment + mount_position slots when caller omits them (no silent default)', async () => {
    await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
      },
    ]);

    const args = mockExecuteAsync.mock.calls.at(-1)![0] as unknown[];
    expect(args[9]).toBeNull();
    expect(args[10]).toBeNull();
  });

  it('returned results round-trip the variant fields unchanged', async () => {
    const results = await addSetsBatch([
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 1,
        attachment: 'rope',
        mountPosition: 'low',
      },
      {
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setNumber: 2,
        // omit variant — must be null in returned shape, not undefined.
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].attachment).toBe('rope');
    expect(results[0].mount_position).toBe('low');
    expect(results[1].attachment).toBeNull();
    expect(results[1].mount_position).toBeNull();
  });
});
