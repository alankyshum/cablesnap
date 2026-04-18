// Unit tests for session swap-exercise and batch delete
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

import {
  swapExerciseInSession,
  undoSwapInSession,
  deleteSet,
  deleteSetsBatch,
} from '../../../lib/db/sessions';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
});

// ---- Swap Exercise ----

describe('swapExerciseInSession', () => {
  it('swaps uncompleted sets to new exercise and records swapped_from', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { id: 'set-1' },
      { id: 'set-2' },
    ]);

    const result = await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(result).toEqual(['set-1', 'set-2']);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_sets SET exercise_id = ?, swapped_from_exercise_id = ?'),
      ['new-ex', 'old-ex', 'set-1', 'set-2']
    );
  });

  it('returns empty array when no uncompleted sets found', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(result).toEqual([]);
  });

  it('only selects uncompleted sets (completed = 0)', async () => {
    mockDb.getAllAsync.mockResolvedValue([{ id: 'set-3' }]);

    await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('completed = 0'),
      ['sess-1', 'old-ex']
    );
  });
});

describe('undoSwapInSession', () => {
  it('restores original exercise_id and clears swapped_from', async () => {
    await undoSwapInSession(['set-1', 'set-2'], 'original-ex');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('SET exercise_id = ?, swapped_from_exercise_id = NULL'),
      ['original-ex', 'set-1', 'set-2']
    );
  });

  it('does nothing for empty setIds array', async () => {
    await undoSwapInSession([], 'original-ex');

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

// ---- Delete Sets ----

describe('deleteSet', () => {
  it('deletes a single set by id', async () => {
    await deleteSet('set-1');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM workout_sets WHERE id = ?',
      ['set-1']
    );
  });
});

describe('deleteSetsBatch', () => {
  it('deletes multiple sets in a single query', async () => {
    await deleteSetsBatch(['set-1', 'set-2', 'set-3']);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM workout_sets WHERE id IN (?,?,?)',
      ['set-1', 'set-2', 'set-3']
    );
  });

  it('does nothing for empty array', async () => {
    await deleteSetsBatch([]);

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('handles single item', async () => {
    await deleteSetsBatch(['set-1']);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM workout_sets WHERE id IN (?)',
      ['set-1']
    );
  });
});
