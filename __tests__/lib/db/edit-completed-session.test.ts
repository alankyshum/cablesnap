/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-690: Unit tests for editCompletedSession() API.
//
// Validates PATCH-style upserts (preserve untouched columns), set_number
// renumbering preservation of link_id/round, completed_at transition
// semantics, defense-in-depth validation, transaction rollback, and the
// edited_at stamp on workout_sessions.
//
// All shared mock state is held on globalThis under names prefixed with
// `__mock` so jest's mock-factory hoisting can reference them safely.

const mockDbStub = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDbStub)),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => {
    const g = globalThis as any;
    g.__mockUpdateCalls = g.__mockUpdateCalls ?? [];
    g.__mockInsertCalls = g.__mockInsertCalls ?? [];
    g.__mockDeleteCalls = g.__mockDeleteCalls ?? [];
    g.__mockSelectResult = g.__mockSelectResult ?? [];
    g.__mockSelectThrows = g.__mockSelectThrows ?? false;
    return {
      select: jest.fn(() => {
        if (g.__mockSelectThrows) throw new Error('boom');
        const chain: any = {
          from: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          get: jest.fn(() => undefined),
          all: jest.fn(() => g.__mockSelectResult),
          then: (r: any) => Promise.resolve(g.__mockSelectResult).then(r),
        };
        return chain;
      }),
      insert: jest.fn(() => ({
        values: jest.fn((v) => {
          g.__mockInsertCalls.push({ values: v });
          return { then: (r: any) => Promise.resolve().then(r) };
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn((vals) => {
          g.__mockUpdateCalls.push({ values: vals });
          return {
            where: jest.fn(() => ({
              then: (r: any) => Promise.resolve().then(r),
            })),
          };
        }),
      })),
      delete: jest.fn(() => ({
        where: jest.fn(() => {
          (globalThis as any).__mockDeleteCalls.push({ called: true });
          return { then: (r: any) => Promise.resolve().then(r) };
        }),
      })),
    };
  }),
}));

import {
  editCompletedSession,
  EditCompletedSessionError,
  type SessionEditPayload,
} from '../../../lib/db/sessions';

const g = globalThis as any;

beforeEach(() => {
  jest.clearAllMocks();
  g.__mockUpdateCalls = [];
  g.__mockInsertCalls = [];
  g.__mockDeleteCalls = [];
  g.__mockSelectResult = [];
  g.__mockSelectThrows = false;
  mockDbStub.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

describe('editCompletedSession', () => {
  it('writes only the explicitly-present columns (PATCH-style)', async () => {
    const payload: SessionEditPayload = {
      upserts: [{ id: 'set-1', exercise_id: 'ex-1', weight: 82.5 }],
      deletes: [],
    };
    await editCompletedSession('sess-1', payload, 1700000000000);

    const setUpdates = g.__mockUpdateCalls.filter((c: any) => 'weight' in (c.values ?? {}));
    expect(setUpdates).toHaveLength(1);
    expect(setUpdates[0].values).toEqual({ weight: 82.5, exercise_id: 'ex-1' });
    expect(setUpdates[0].values).not.toHaveProperty('bodyweight_modifier_kg');
    expect(setUpdates[0].values).not.toHaveProperty('set_type');
    expect(setUpdates[0].values).not.toHaveProperty('link_id');
    expect(setUpdates[0].values).not.toHaveProperty('round');
  });

  it('inserts a new set with sensible defaults when id is absent', async () => {
    const payload: SessionEditPayload = {
      upserts: [{ exercise_id: 'ex-1', weight: 50, reps: 10, completed: 1 }],
      deletes: [],
    };
    await editCompletedSession('sess-1', payload, 1700000000000);

    expect(g.__mockInsertCalls).toHaveLength(1);
    const row = g.__mockInsertCalls[0].values;
    expect(row.session_id).toBe('sess-1');
    expect(row.exercise_id).toBe('ex-1');
    expect(row.weight).toBe(50);
    expect(row.reps).toBe(10);
    expect(row.completed).toBe(1);
    expect(row.completed_at).toBe(1700000000000);
    expect(row.set_type).toBe('normal');
    expect(row.exercise_position).toBe(0);
    expect(row.id).toBeTruthy();
  });

  it('deletes via session-scoped guard', async () => {
    await editCompletedSession('sess-1', { upserts: [], deletes: ['s-a', 's-b'] });
    expect(g.__mockDeleteCalls).toHaveLength(1);
  });

  it('stamps edited_at on workout_sessions inside the same transaction', async () => {
    await editCompletedSession('sess-1', { upserts: [], deletes: [] }, 1700000000000);

    const editedAtUpdates = g.__mockUpdateCalls.filter((c: any) => 'edited_at' in (c.values ?? {}));
    expect(editedAtUpdates).toHaveLength(1);
    expect(editedAtUpdates[0].values.edited_at).toBe(1700000000000);
    expect(mockDbStub.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('rolls back: if mutations throw mid-tx, edited_at is NOT stamped', async () => {
    g.__mockSelectThrows = true;
    await expect(
      editCompletedSession('sess-1', { upserts: [], deletes: [] })
    ).rejects.toThrow();
    const editedAtUpdates = g.__mockUpdateCalls.filter((c: any) => 'edited_at' in (c.values ?? {}));
    expect(editedAtUpdates).toHaveLength(0);
  });

  describe('completed_at semantics (per-set)', () => {
    it('0 -> 1 transition stamps completed_at = now', async () => {
      await editCompletedSession(
        'sess-1',
        { upserts: [{ id: 's-1', exercise_id: 'e-1', completed: 1, reps: 5 }], deletes: [] },
        1700000000000,
      );
      const setUpdate = g.__mockUpdateCalls.find((c: any) => 'completed' in (c.values ?? {}));
      expect(setUpdate?.values.completed_at).toBe(1700000000000);
    });

    it('1 -> 0 transition nulls completed_at', async () => {
      await editCompletedSession(
        'sess-1',
        { upserts: [{ id: 's-1', exercise_id: 'e-1', completed: 0 }], deletes: [] },
        1700000000000,
      );
      const setUpdate = g.__mockUpdateCalls.find((c: any) => 'completed' in (c.values ?? {}));
      expect(setUpdate?.values.completed_at).toBeNull();
    });

    it('1 -> 1 (no transition) leaves completed_at untouched', async () => {
      await editCompletedSession(
        'sess-1',
        { upserts: [{ id: 's-1', exercise_id: 'e-1', weight: 100 }], deletes: [] },
        1700000000000,
      );
      const setUpdate = g.__mockUpdateCalls.find((c: any) => 'weight' in (c.values ?? {}));
      expect(setUpdate?.values).not.toHaveProperty('completed_at');
    });

    it('caller-provided completed_at wins over auto-stamp', async () => {
      await editCompletedSession(
        'sess-1',
        { upserts: [{ id: 's-1', exercise_id: 'e-1', completed: 1, reps: 3, completed_at: 1234567 }], deletes: [] },
        1700000000000,
      );
      const setUpdate = g.__mockUpdateCalls.find((c: any) => 'completed' in (c.values ?? {}));
      expect(setUpdate?.values.completed_at).toBe(1234567);
    });
  });

  describe('validation (defense in depth)', () => {
    it('rejects negative weight', async () => {
      await expect(
        editCompletedSession('sess-1', { upserts: [{ id: 's-1', exercise_id: 'e-1', weight: -5 }], deletes: [] })
      ).rejects.toBeInstanceOf(EditCompletedSessionError);
    });

    it('rejects negative reps', async () => {
      await expect(
        editCompletedSession('sess-1', { upserts: [{ id: 's-1', exercise_id: 'e-1', reps: -1 }], deletes: [] })
      ).rejects.toBeInstanceOf(EditCompletedSessionError);
    });

    it('auto-flips completed=1+reps=0 -> completed=0 (AC #12)', async () => {
      await editCompletedSession(
        'sess-1',
        { upserts: [{ id: 's-1', exercise_id: 'e-1', completed: 1, reps: 0 }], deletes: [] },
        1700000000000,
      );
      const setUpdate = g.__mockUpdateCalls.find((c: any) => 'completed' in (c.values ?? {}));
      expect(setUpdate?.values.completed).toBe(0);
      expect(setUpdate?.values.completed_at).toBeNull();
    });

    it('rejects insert without exercise_id', async () => {
      await expect(
        editCompletedSession('sess-1', { upserts: [{ exercise_id: '' }], deletes: [] })
      ).rejects.toBeInstanceOf(EditCompletedSessionError);
    });

    it('allows weight = 0 (bodyweight tracking)', async () => {
      await expect(
        editCompletedSession('sess-1', { upserts: [{ id: 's-1', exercise_id: 'e-1', weight: 0 }], deletes: [] })
      ).resolves.toBeUndefined();
    });
  });

  describe('set_number renumbering', () => {
    it('renumbers contiguously 1..N per (session, exercise_id)', async () => {
      g.__mockSelectResult = [
        { id: 's1', exercise_id: 'e1', set_number: 1 },
        { id: 's2', exercise_id: 'e1', set_number: 3 },
        { id: 's3', exercise_id: 'e2', set_number: 5 },
        { id: 's4', exercise_id: 'e2', set_number: 7 },
        { id: 's5', exercise_id: 'e2', set_number: 9 },
      ];

      await editCompletedSession('sess-1', { upserts: [], deletes: [] }, 1700000000000);

      const renumberUpdates = g.__mockUpdateCalls.filter((c: any) => 'set_number' in (c.values ?? {}));
      const newNumbers = renumberUpdates.map((c: any) => c.values.set_number).sort();
      // s1 already 1 (no update). s2->2, s3->1, s4->2, s5->3.
      expect(newNumbers).toEqual([1, 2, 2, 3]);
      // Renumber must touch ONLY set_number — never link_id or round.
      for (const u of renumberUpdates) {
        expect(Object.keys(u.values)).toEqual(['set_number']);
      }
    });
  });

  it('column-preservation: editing weight on a warmup set preserves untouched columns', async () => {
    await editCompletedSession(
      'sess-1',
      { upserts: [{ id: 's-warmup', exercise_id: 'e-1', weight: 25 }], deletes: [] },
      1700000000000,
    );
    const setUpdate = g.__mockUpdateCalls.find((c: any) => 'weight' in (c.values ?? {}));
    expect(setUpdate?.values).toEqual({ weight: 25, exercise_id: 'e-1' });
    expect(setUpdate?.values).not.toHaveProperty('set_type');
    expect(setUpdate?.values).not.toHaveProperty('bodyweight_modifier_kg');
  });

  it('linked-superset preservation: deletes preserve link_id/round on remaining sets', async () => {
    g.__mockSelectResult = [
      { id: 's-e1-1', exercise_id: 'e1', set_number: 1 },
      { id: 's-e1-3', exercise_id: 'e1', set_number: 3 },
      { id: 's-e2-1', exercise_id: 'e2', set_number: 1 },
      { id: 's-e2-2', exercise_id: 'e2', set_number: 2 },
    ];
    await editCompletedSession(
      'sess-1',
      { upserts: [], deletes: ['s-e1-2-deleted'] },
      1700000000000,
    );
    const renumberUpdates = g.__mockUpdateCalls.filter((c: any) => 'set_number' in (c.values ?? {}));
    for (const u of renumberUpdates) {
      expect(u.values).not.toHaveProperty('link_id');
      expect(u.values).not.toHaveProperty('round');
    }
  });
});
