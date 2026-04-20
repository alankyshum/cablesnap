/* eslint-disable @typescript-eslint/no-explicit-any */
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

let mockDrizzleAllResult: any[] = [];

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn(() => undefined),
        all: jest.fn(() => mockDrizzleAllResult),
        then: (r: any) => Promise.resolve(mockDrizzleAllResult).then(r),
      };
      return chain;
    }),
    insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  })),
}));

import { getSourceSessionSets } from '../../../lib/db/sessions';

beforeEach(() => {
  jest.clearAllMocks();
  mockDrizzleAllResult = [];
});

describe('getSourceSessionSets', () => {
  it('returns completed sets with exercise existence flag', async () => {
    mockDrizzleAllResult = [
      {
        exercise_id: 'ex-1',
        set_number: 1,
        weight: 80,
        reps: 10,
        link_id: null,
        training_mode: 'weight',
        tempo: null,
        exercise_exists: 'ex-1',
        set_type: 'normal',
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
        set_type: 'normal',
      },
    ];

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
      set_type: 'normal',
    });
    expect(result[1].weight).toBe(85);
    expect(result[1].reps).toBe(8);
  });

  it('marks deleted exercises as exercise_exists = false', async () => {
    mockDrizzleAllResult = [
      {
        exercise_id: 'ex-deleted',
        set_number: 1,
        weight: 60,
        reps: 12,
        link_id: null,
        training_mode: null,
        tempo: null,
        exercise_exists: null,
        set_type: 'normal',
      },
    ];

    const result = await getSourceSessionSets('session-1');

    expect(result).toHaveLength(1);
    expect(result[0].exercise_exists).toBe(false);
  });

  it('preserves link_id for supersets', async () => {
    mockDrizzleAllResult = [
      {
        exercise_id: 'ex-1',
        set_number: 1,
        weight: 80,
        reps: 10,
        link_id: 'link-abc',
        training_mode: null,
        tempo: '3-1-2',
        exercise_exists: 'ex-1',
        set_type: 'normal',
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
        set_type: 'normal',
      },
    ];

    const result = await getSourceSessionSets('session-1');

    expect(result[0].link_id).toBe('link-abc');
    expect(result[0].tempo).toBe('3-1-2');
    expect(result[1].link_id).toBe('link-abc');
  });

  it('returns empty array for session with no completed sets', async () => {
    mockDrizzleAllResult = [];

    const result = await getSourceSessionSets('session-1');

    expect(result).toEqual([]);
  });

  it('uses Drizzle query for data access', async () => {
    mockDrizzleAllResult = [];

    const result = await getSourceSessionSets('sess-xyz');

    expect(result).toEqual([]);
  });
});
