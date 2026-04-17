// Unit tests for session rating, notes, save-as-template, and export/import v4
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

import { updateSession, createTemplateFromSession } from '../../../lib/db/sessions';
import {
  validateBackupData,
} from '../../../lib/db/import-export';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

// ---- Rating CRUD ----

describe('updateSession', () => {
  it('updates rating for a session', async () => {
    await updateSession('sess-1', { rating: 4 });
    // execute calls db.runAsync under the hood
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sessions SET rating = ? WHERE id = ?',
      [4, 'sess-1']
    );
  });

  it('clears rating to null', async () => {
    await updateSession('sess-1', { rating: null });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sessions SET rating = ? WHERE id = ?',
      [null, 'sess-1']
    );
  });

  it('updates notes for a session', async () => {
    await updateSession('sess-1', { notes: 'Great workout!' });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sessions SET notes = ? WHERE id = ?',
      ['Great workout!', 'sess-1']
    );
  });

  it('updates both rating and notes', async () => {
    await updateSession('sess-1', { rating: 5, notes: 'Best ever' });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE workout_sessions SET rating = ?, notes = ? WHERE id = ?',
      [5, 'Best ever', 'sess-1']
    );
  });

  it('does nothing when no fields provided', async () => {
    await updateSession('sess-1', {});
    // No runAsync calls for the UPDATE (there may be other calls for getDatabase)
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE')
    );
    expect(updateCalls.length).toBe(0);
  });

  it('handles all rating values 1-5', async () => {
    for (const r of [1, 2, 3, 4, 5]) {
      jest.clearAllMocks();
      await updateSession('sess-1', { rating: r });
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE workout_sessions SET rating = ? WHERE id = ?',
        [r, 'sess-1']
      );
    }
  });
});

// ---- Save as Template ----

describe('createTemplateFromSession', () => {
  it('creates template from session with exercises', async () => {
    const sessionSets = [
      { exercise_id: 'ex-1', set_number: 1, reps: 8, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-1', set_number: 2, reps: 10, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-2', set_number: 1, reps: 12, link_id: null, training_mode: null },
    ];
    mockDb.getAllAsync.mockResolvedValue(sessionSets);

    const result = await createTemplateFromSession('sess-1', 'My Template');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');

    // Should create template + 2 template_exercises
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3); // 1 template + 2 exercises
  });

  it('handles empty session (no completed sets)', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await createTemplateFromSession('sess-1', 'Empty Template');
    expect(result).toBeTruthy();
    // Should only create template
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it('preserves superset groupings via link_id remapping', async () => {
    const sessionSets = [
      { exercise_id: 'ex-1', set_number: 1, reps: 8, link_id: 'link-old', training_mode: 'weight' },
      { exercise_id: 'ex-2', set_number: 1, reps: 10, link_id: 'link-old', training_mode: 'weight' },
    ];
    mockDb.getAllAsync.mockResolvedValue(sessionSets);

    await createTemplateFromSession('sess-1', 'Superset Template');

    // Should create template + 2 template exercises
    const insertCalls = mockDb.runAsync.mock.calls;
    expect(insertCalls.length).toBe(3); // template + 2 exercises

    // Both exercises should have same (new) link_id, different from 'link-old'
    const ex1LinkId = insertCalls[1][1][7]; // link_id param in template_exercises insert
    const ex2LinkId = insertCalls[2][1][7];
    expect(ex1LinkId).toBeTruthy();
    expect(ex2LinkId).toBeTruthy();
    expect(ex1LinkId).toBe(ex2LinkId);
    expect(ex1LinkId).not.toBe('link-old');
  });

  it('uses max reps as target_reps', async () => {
    const sessionSets = [
      { exercise_id: 'ex-1', set_number: 1, reps: 8, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-1', set_number: 2, reps: 12, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-1', set_number: 3, reps: 10, link_id: null, training_mode: 'weight' },
    ];
    mockDb.getAllAsync.mockResolvedValue(sessionSets);

    await createTemplateFromSession('sess-1', 'Rep Template');

    const insertCalls = mockDb.runAsync.mock.calls;
    // template_exercises insert is call index 1
    const targetReps = insertCalls[1][1][5]; // target_reps param
    expect(targetReps).toBe('12');
  });

  it('sets target_sets to count of completed sets per exercise', async () => {
    const sessionSets = [
      { exercise_id: 'ex-1', set_number: 1, reps: 8, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-1', set_number: 2, reps: 8, link_id: null, training_mode: 'weight' },
      { exercise_id: 'ex-1', set_number: 3, reps: 8, link_id: null, training_mode: 'weight' },
    ];
    mockDb.getAllAsync.mockResolvedValue(sessionSets);

    await createTemplateFromSession('sess-1', 'Set Count Template');

    const insertCalls = mockDb.runAsync.mock.calls;
    const targetSets = insertCalls[1][1][4]; // target_sets param
    expect(targetSets).toBe(3);
  });
});

// ---- Export/Import v4 validation ----

describe('validateBackupData v4', () => {
  it('accepts v4 backup', () => {
    const err = validateBackupData({
      version: 4,
      data: { exercises: [{ id: '1', name: 'Bench' }] },
    });
    expect(err).toBeNull();
  });

  it('rejects v7 as future version', () => {
    const err = validateBackupData({
      version: 7,
      data: { exercises: [{ id: '1' }] },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe('future_version');
  });

  it('accepts v6 backup (set_type support)', () => {
    const err = validateBackupData({
      version: 6,
      data: { exercises: [{ id: '1', name: 'Bench' }] },
    });
    expect(err).toBeNull();
  });

  it('accepts v3 backup (backward compatible)', () => {
    const err = validateBackupData({
      version: 3,
      data: { exercises: [{ id: '1', name: 'Bench' }] },
    });
    expect(err).toBeNull();
  });
});
