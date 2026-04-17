// Unit tests for getSourceSessionSets
const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import { getSourceSessionSets } from '../../../lib/db/sessions';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
});

describe('getSourceSessionSets', () => {
  it('returns completed sets with exercise existence flag', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        exercise_id: 'ex-1',
        set_number: 1,
        weight: 80,
        reps: 10,
        link_id: null,
        training_mode: 'weight',
        tempo: null,
        exercise_exists: 'ex-1',
      },
      {
        exercise_id: 'ex-1',
        set_number: 2,
        weight: 85,
        reps: 8,
        link_id: null,
        training_mode: 'weight',
        tempo: null,
        exercise_exists: 'ex-1',
      },
    ]);

    const result = await getSourceSessionSets('session-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      exercise_id: 'ex-1',
      set_number: 1,
      weight: 80,
      reps: 10,
      link_id: null,
      training_mode: 'weight',
      tempo: null,
      exercise_exists: true,
    });
    expect(result[1].weight).toBe(85);
    expect(result[1].reps).toBe(8);
  });

  it('marks deleted exercises as exercise_exists = false', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        exercise_id: 'ex-deleted',
        set_number: 1,
        weight: 60,
        reps: 12,
        link_id: null,
        training_mode: null,
        tempo: null,
        exercise_exists: null,
      },
    ]);

    const result = await getSourceSessionSets('session-1');

    expect(result).toHaveLength(1);
    expect(result[0].exercise_exists).toBe(false);
  });

  it('preserves link_id for supersets', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        exercise_id: 'ex-1',
        set_number: 1,
        weight: 80,
        reps: 10,
        link_id: 'link-abc',
        training_mode: null,
        tempo: '3-1-2',
        exercise_exists: 'ex-1',
      },
      {
        exercise_id: 'ex-2',
        set_number: 1,
        weight: 40,
        reps: 12,
        link_id: 'link-abc',
        training_mode: null,
        tempo: null,
        exercise_exists: 'ex-2',
      },
    ]);

    const result = await getSourceSessionSets('session-1');

    expect(result[0].link_id).toBe('link-abc');
    expect(result[0].tempo).toBe('3-1-2');
    expect(result[1].link_id).toBe('link-abc');
  });

  it('returns empty array for session with no completed sets', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await getSourceSessionSets('session-1');

    expect(result).toEqual([]);
  });

  it('calls query with correct SQL and session ID', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    await getSourceSessionSets('sess-xyz');

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ws.session_id = ?'),
      ['sess-xyz']
    );
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ws.completed = 1'),
      expect.anything()
    );
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN exercises e'),
      expect.anything()
    );
  });
});
