/* eslint-disable @typescript-eslint/no-explicit-any */
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

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis(), get: jest.fn(() => undefined), then: (r: any) => Promise.resolve([]).then(r) };
      return chain;
    }),
    insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  })),
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
    await expect(updateSession('sess-1', { rating: 4 })).resolves.toBeUndefined();
  });

  it('clears rating to null', async () => {
    await expect(updateSession('sess-1', { rating: null })).resolves.toBeUndefined();
  });

  it('updates notes for a session', async () => {
    await expect(updateSession('sess-1', { notes: 'Great workout!' })).resolves.toBeUndefined();
  });

  it('updates both rating and notes', async () => {
    await expect(updateSession('sess-1', { rating: 5, notes: 'Best ever' })).resolves.toBeUndefined();
  });

  it('does nothing when no fields provided', async () => {
    await expect(updateSession('sess-1', {})).resolves.toBeUndefined();
  });

  it('handles all rating values 1-5', async () => {
    for (const r of [1, 2, 3, 4, 5]) {
      await expect(updateSession('sess-1', { rating: r })).resolves.toBeUndefined();
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
