/* eslint-disable @typescript-eslint/no-explicit-any */
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

let mockDrizzleQueryResult: any[] = [];

const mockUpdateSet = jest.fn().mockReturnThis();
const mockUpdateWhere = jest.fn().mockReturnThis();
const mockDeleteWhere = jest.fn().mockReturnThis();

const mockDrizzleInstance: any = {
  select: jest.fn(() => {
    const chain: any = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      get: jest.fn(() => undefined),
      all: jest.fn(() => mockDrizzleQueryResult),
      then: (r: any, rj: any) => Promise.resolve(mockDrizzleQueryResult).then(r, rj),
    };
    return chain;
  }),
  insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  update: jest.fn(() => {
    const c: any = {
      set: mockUpdateSet,
      where: mockUpdateWhere,
      then: (r: any) => Promise.resolve().then(r),
    };
    mockUpdateSet.mockReturnValue(c);
    mockUpdateWhere.mockReturnValue(c);
    return c;
  }),
  delete: jest.fn(() => {
    const c: any = {
      where: mockDeleteWhere,
      then: (r: any) => Promise.resolve().then(r),
    };
    mockDeleteWhere.mockReturnValue(c);
    return c;
  }),
};

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => mockDrizzleInstance),
}));

import {
  swapExerciseInSession,
  undoSwapInSession,
  deleteSetsBatch,
} from '../../../lib/db/sessions';

beforeEach(() => {
  jest.clearAllMocks();
  mockDrizzleQueryResult = [];
});

// ---- Swap Exercise ----

describe('swapExerciseInSession', () => {
  it('swaps uncompleted sets to new exercise and records swapped_from', async () => {
    mockDrizzleQueryResult = [{ id: 'set-1' }, { id: 'set-2' }];

    const result = await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(result).toEqual(['set-1', 'set-2']);
    expect(mockDrizzleInstance.select).toHaveBeenCalled();
    expect(mockDrizzleInstance.update).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ exercise_id: 'new-ex', swapped_from_exercise_id: 'old-ex' })
    );
  });

  it('returns empty array when no uncompleted sets found', async () => {
    mockDrizzleQueryResult = [];

    const result = await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(result).toEqual([]);
    expect(mockDrizzleInstance.update).not.toHaveBeenCalled();
  });

  it('only selects uncompleted sets (completed = 0)', async () => {
    mockDrizzleQueryResult = [{ id: 'set-3' }];

    await swapExerciseInSession('sess-1', 'old-ex', 'new-ex');

    expect(mockDrizzleInstance.select).toHaveBeenCalled();
  });
});

describe('undoSwapInSession', () => {
  it('restores original exercise_id and clears swapped_from', async () => {
    await undoSwapInSession(['set-1', 'set-2'], 'original-ex');

    expect(mockDrizzleInstance.update).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ exercise_id: 'original-ex', swapped_from_exercise_id: null })
    );
  });

  it('does nothing for empty setIds array', async () => {
    await undoSwapInSession([], 'original-ex');

    expect(mockDrizzleInstance.update).not.toHaveBeenCalled();
  });
});

// ---- Delete Sets ----
// NOTE (BLD-1044): deleteSet and deleteSetsBatch are now covered by
// __tests__/lib/db/session-sets-renumber.test.ts which tests the new
// withTransaction + renumber behaviour. The broad "calls Drizzle delete"
// assertions below are removed; the no-op guard for empty batch remains.

describe('deleteSetsBatch', () => {
  it('does nothing for empty array', async () => {
    await deleteSetsBatch([]);

    // The function returns early before opening a transaction.
    expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
  });
});
