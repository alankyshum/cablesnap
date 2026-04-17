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
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

// ---- updateSetWarmup (dual-writes both columns) ----

describe('updateSetWarmup', () => {
  it('sets is_warmup = 1 and set_type = warmup when true', async () => {
    await updateSetWarmup('set-1', true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET is_warmup = ?, set_type = ? WHERE id = ?',
      [1, 'warmup', 'set-1']
    );
  });

  it('sets is_warmup = 0 and set_type = normal when false', async () => {
    await updateSetWarmup('set-2', false);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET is_warmup = ?, set_type = ? WHERE id = ?',
      [0, 'normal', 'set-2']
    );
  });
});

// ---- updateSetType (dual-writes both columns) ----

describe('updateSetType', () => {
  it('sets set_type and is_warmup = 1 for warmup', async () => {
    await updateSetType('set-1', 'warmup');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET set_type = ?, is_warmup = ? WHERE id = ?',
      ['warmup', 1, 'set-1']
    );
  });

  it('sets set_type = dropset and is_warmup = 0', async () => {
    await updateSetType('set-2', 'dropset');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET set_type = ?, is_warmup = ? WHERE id = ?',
      ['dropset', 0, 'set-2']
    );
  });

  it('sets set_type = failure and is_warmup = 0', async () => {
    await updateSetType('set-3', 'failure');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET set_type = ?, is_warmup = ? WHERE id = ?',
      ['failure', 0, 'set-3']
    );
  });

  it('sets set_type = normal and is_warmup = 0', async () => {
    await updateSetType('set-4', 'normal');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sets SET set_type = ?, is_warmup = ? WHERE id = ?',
      ['normal', 0, 'set-4']
    );
  });
});

// ---- addSet includes set_type ----

describe('addSet with setType', () => {
  it('inserts set with set_type = dropset and is_warmup = 0', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ next: 2 });
    const result = await addSet('sess-1', 'ex-1', 1, null, null, null, null, false, 'dropset');

    const insertCall = mockDb.runAsync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO workout_sets')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain('set_type');
    const params = insertCall![1] as unknown[];
    // is_warmup should be 0, set_type should be 'dropset'
    expect(params[params.length - 2]).toBe(0); // is_warmup
    expect(params[params.length - 1]).toBe('dropset'); // set_type
    expect(result.set_type).toBe('dropset');
    expect(result.is_warmup).toBe(false);
  });

  it('defaults to set_type = normal when no type provided', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ next: 1 });
    const result = await addSet('sess-1', 'ex-1', 1);

    const insertCall = mockDb.runAsync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO workout_sets')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[params.length - 2]).toBe(0); // is_warmup
    expect(params[params.length - 1]).toBe('normal'); // set_type
    expect(result.set_type).toBe('normal');
    expect(result.is_warmup).toBe(false);
  });

  it('resolves setType from isWarmup when setType not provided', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ next: 2 });
    const result = await addSet('sess-1', 'ex-1', 1, null, null, null, null, true);

    const insertCall = mockDb.runAsync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO workout_sets')
    );
    const params = insertCall![1] as unknown[];
    expect(params[params.length - 2]).toBe(1); // is_warmup
    expect(params[params.length - 1]).toBe('warmup'); // set_type
    expect(result.set_type).toBe('warmup');
    expect(result.is_warmup).toBe(true);
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
    expect(result[0].is_warmup).toBe(false);
    expect(result[1].set_type).toBe('dropset');
    expect(result[1].is_warmup).toBe(false);
    expect(result[2].set_type).toBe('failure');
    expect(result[2].is_warmup).toBe(false);
  });

  it('batch resolves warmup from isWarmup when setType not provided', async () => {
    const sets = [
      { sessionId: 's1', exerciseId: 'e1', setNumber: 1, isWarmup: true },
    ];
    const result = await addSetsBatch(sets);

    expect(result[0].set_type).toBe('warmup');
    expect(result[0].is_warmup).toBe(true);
  });
});

// ---- getSessionSets includes set_type ----

describe('getSessionSets', () => {
  it('maps is_warmup and set_type from row data', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 's1', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 1, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', link_id: null, round: null,
        training_mode: null, tempo: null,
        swapped_from_exercise_id: null, is_warmup: 1, set_type: 'warmup',
      },
      {
        id: 's2', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 2, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', link_id: null, round: null,
        training_mode: null, tempo: null,
        swapped_from_exercise_id: null, is_warmup: 0, set_type: 'dropset',
      },
      {
        id: 's3', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 3, weight: 80, reps: 8, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', link_id: null, round: null,
        training_mode: null, tempo: null,
        swapped_from_exercise_id: null, is_warmup: 0, set_type: 'failure',
      },
    ]);

    const sets = await getSessionSets('sess-1');
    expect(sets[0].is_warmup).toBe(true);
    expect(sets[0].set_type).toBe('warmup');
    expect(sets[1].is_warmup).toBe(false);
    expect(sets[1].set_type).toBe('dropset');
    expect(sets[2].set_type).toBe('failure');
  });

  it('defaults set_type to normal when missing from DB', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 's1', session_id: 'sess-1', exercise_id: 'ex-1',
        set_number: 1, weight: 100, reps: 5, completed: 1,
        completed_at: null, rpe: null, notes: null,
        exercise_name: 'Squat', link_id: null, round: null,
        training_mode: null, tempo: null,
        swapped_from_exercise_id: null, is_warmup: 0,
        // set_type intentionally missing
      },
    ]);

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
    mockDb.getFirstAsync.mockResolvedValue({ cnt: 3 });
    await getSessionSetCount('sess-1');

    const call = mockDb.getFirstAsync.mock.calls[0];
    expect(call[0]).toContain('is_warmup = 0');
  });

  it('getPersonalRecords excludes warm-up sets', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    await getPersonalRecords();

    const call = mockDb.getAllAsync.mock.calls[0];
    expect(call[0]).toContain('is_warmup = 0');
  });
});
