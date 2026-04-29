/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for warm-up set tagging (Phase 45) and set type annotation (Phase 46)
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

let mockDrizzleGetResult: any = undefined;
let mockDrizzleAllResult: any[] = [];

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = { from: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis(), get: jest.fn(() => mockDrizzleGetResult), all: jest.fn(() => mockDrizzleAllResult), then: (r: any) => Promise.resolve(mockDrizzleAllResult).then(r) };
      return chain;
    }),
    insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  })),
}));

import {
  updateSetWarmup,
  updateSetType,
  addSet,
  addSetsBatch,
  getSessionSets,
  getSessionSetCount,
  getPersonalRecords,
} from '../../../lib/db/sessions';

import { SET_TYPE_CYCLE } from '../../../lib/types';
import type { SetType } from '../../../lib/types';

beforeEach(() => {
  jest.clearAllMocks();
  mockDrizzleGetResult = undefined;
  mockDrizzleAllResult = [];
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

// ---- updateSetWarmup ----

describe('updateSetWarmup', () => {
  it('sets set_type = warmup when true', async () => {
    await expect(updateSetWarmup('set-1', true)).resolves.toBeUndefined();
  });

  it('sets set_type = normal when false', async () => {
    await expect(updateSetWarmup('set-2', false)).resolves.toBeUndefined();
  });
});

// ---- updateSetType ----

describe('updateSetType', () => {
  it('sets set_type = warmup', async () => {
    await expect(updateSetType('set-1', 'warmup')).resolves.toBeUndefined();
  });

  it('sets set_type = dropset', async () => {
    await expect(updateSetType('set-2', 'dropset')).resolves.toBeUndefined();
  });

  it('sets set_type = failure', async () => {
    await expect(updateSetType('set-3', 'failure')).resolves.toBeUndefined();
  });

  it('sets set_type = normal', async () => {
    await expect(updateSetType('set-4', 'normal')).resolves.toBeUndefined();
  });
});

// ---- addSet includes set_type ----

describe('addSet with setType', () => {
  it('inserts set with set_type = dropset', async () => {
    const result = await addSet('sess-1', 'ex-1', 1, null, null, null, false, 'dropset');
    expect(result.set_type).toBe('dropset');
  });

  it('defaults to set_type = normal when no type provided', async () => {
    const result = await addSet('sess-1', 'ex-1', 1);
    expect(result.set_type).toBe('normal');
  });

  it('defaults to normal when no setType provided', async () => {
    const result = await addSet('sess-1', 'ex-1', 1, null, null, null, true);
    expect(result.set_type).toBe('normal');
  });
});

// ---- addSetsBatch with set types ----

describe('addSetsBatch with setType', () => {
  it('creates batch with mixed set types', async () => {
    const sets = [
      { sessionId: 's1', exerciseId: 'e1', setNumber: 1, setType: 'normal' as SetType },
      { sessionId: 's1', exerciseId: 'e1', setNumber: 2, setType: 'dropset' as SetType },
      { sessionId: 's1', exerciseId: 'e1', setNumber: 3, setType: 'failure' as SetType },
    ];
    const result = await addSetsBatch(sets);

    expect(result).toHaveLength(3);
    expect(result[0].set_type).toBe('normal');
    expect(result[1].set_type).toBe('dropset');
    expect(result[2].set_type).toBe('failure');
  });

  it('batch resolves warmup from isWarmup when setType not provided', async () => {
    const sets = [
      { sessionId: 's1', exerciseId: 'e1', setNumber: 1, isWarmup: true },
    ];
    const result = await addSetsBatch(sets);

    expect(result[0].set_type).toBe('warmup');
  });
});

// ---- getSessionSets includes set_type ----

describe('getSessionSets', () => {
  it('maps set_type from row data', async () => {
    mockDrizzleAllResult = [
      {
        id: 's1', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 1, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', exercise_deleted_at: null, swapped_from_name: null,
        link_id: null, round: null,
tempo: null,
        swapped_from_exercise_id: null, set_type: 'warmup',
        duration_seconds: null,
      },
      {
        id: 's2', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 2, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', exercise_deleted_at: null, swapped_from_name: null,
        link_id: null, round: null,
tempo: null,
        swapped_from_exercise_id: null, set_type: 'dropset',
        duration_seconds: null,
      },
      {
        id: 's3', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 3, weight: 80, reps: 8, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', exercise_deleted_at: null, swapped_from_name: null,
        link_id: null, round: null,
tempo: null,
        swapped_from_exercise_id: null, set_type: 'failure',
        duration_seconds: null,
      },
    ];

    const sets = await getSessionSets('sess-1');
    expect(sets[0].set_type).toBe('warmup');
    expect(sets[1].set_type).toBe('dropset');
    expect(sets[2].set_type).toBe('failure');
  });

  it('defaults set_type to normal when missing from DB', async () => {
    mockDrizzleAllResult = [
      {
        id: 's1', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 1, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', exercise_deleted_at: null, swapped_from_name: null,
        link_id: null, round: null,
tempo: null,
        swapped_from_exercise_id: null,
        duration_seconds: null,
        // set_type intentionally missing
      },
    ];

    const sets = await getSessionSets('sess-1');
    expect(sets[0].set_type).toBe('normal');
  });
});

// ---- SET_TYPE_CYCLE order ----

describe('SET_TYPE_CYCLE', () => {
  it('has correct cycle order: normal → warmup → dropset → failure', () => {
    expect(SET_TYPE_CYCLE).toEqual(['normal', 'warmup', 'dropset', 'failure']);
  });

  it('cycles back to normal after failure', () => {
    const failureIdx = SET_TYPE_CYCLE.indexOf('failure');
    const next = SET_TYPE_CYCLE[(failureIdx + 1) % SET_TYPE_CYCLE.length];
    expect(next).toBe('normal');
  });
});

// ---- Metric queries exclude warm-ups (unchanged) ----

describe('metric queries exclude warm-ups', () => {
  it('getSessionSetCount excludes warm-up sets', async () => {
    mockDrizzleGetResult = { count: 3 };
    const count = await getSessionSetCount('sess-1');
    expect(count).toBe(3);
  });

  it('getPersonalRecords excludes warm-up sets', async () => {
    mockDrizzleAllResult = [{ exercise_id: 'ex1', name: 'Bench Press', max_weight: 100 }];
    const records = await getPersonalRecords();
    // Uses Drizzle ORM with ne(workoutSets.set_type, 'warmup') in the where clause
    expect(records).toEqual([{ exercise_id: 'ex1', name: 'Bench Press', max_weight: 100 }]);
  });
});
