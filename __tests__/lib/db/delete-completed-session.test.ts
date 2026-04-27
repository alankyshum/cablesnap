/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-690 reviewer fix — orphan-protection test for deleteCompletedSession().
//
// The bug being prevented: hooks/useSessionEdit "Delete workout?" was calling
// cancelSession(id), and cancelSession runs a global orphan sweep over every
// session with completed_at IS NULL. Deleting an old completed workout while
// a separate live workout is in progress would silently wipe the live one.
//
// This test asserts:
//   1. deleteCompletedSession deletes ONLY the targeted session + its sets.
//   2. It NEVER touches any session row whose id ≠ target — in particular,
//      a concurrent in-progress (completed_at IS NULL) session survives.
//   3. cancelSession's legacy in-progress-cancel orphan-sweep semantics are
//      preserved (regression guard so we don't accidentally rip them out).

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
    g.__deleteCalls = g.__deleteCalls ?? [];
    g.__selectCalls = g.__selectCalls ?? [];
    g.__rows = g.__rows ?? { sessions: [], sets: [] };
    return {
      select: jest.fn(() => {
        // Return a chain that resolves to the in-progress (completed_at IS NULL)
        // sessions when select(...).from(workoutSessions).where(...).
        const chain: any = {
          from: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn(() => undefined),
          all: jest.fn(() => g.__rows.sessions.filter((s: any) => s.completed_at == null)),
          then: (r: any) =>
            Promise.resolve(
              g.__rows.sessions.filter((s: any) => s.completed_at == null),
            ).then(r),
        };
        g.__selectCalls.push(chain);
        return chain;
      }),
      delete: jest.fn(() => ({
        where: jest.fn((w: any) => {
          // We can't introspect drizzle SQL fragments here, so we capture
          // each delete call as a numbered marker. The test asserts on the
          // shape and count, not on the SQL string.
          g.__deleteCalls.push({ where: String(w) });
          return { then: (r: any) => Promise.resolve().then(r) };
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({ then: (r: any) => Promise.resolve().then(r) })),
        })),
      })),
      insert: jest.fn(() => ({
        values: jest.fn(() => ({ then: (r: any) => Promise.resolve().then(r) })),
      })),
    };
  }),
}));

import {
  cancelSession,
  deleteCompletedSession,
} from '../../../lib/db/sessions';

const g = globalThis as any;

beforeEach(() => {
  jest.clearAllMocks();
  g.__deleteCalls = [];
  g.__selectCalls = [];
  g.__rows = { sessions: [], sets: [] };
});

describe('deleteCompletedSession (BLD-690 reviewer fix)', () => {
  it('issues exactly two delete calls (sets + session) and runs them inside a transaction', async () => {
    g.__rows.sessions = [
      // The completed target.
      { id: 'completed-A', completed_at: 1700000000000 },
      // A separate, concurrent in-progress workout that MUST survive.
      { id: 'live-B', completed_at: null },
    ];

    await deleteCompletedSession('completed-A');

    // No orphan sweep: only 2 delete calls total — workoutSets + workoutSessions.
    expect(g.__deleteCalls).toHaveLength(2);
    // Ran inside a transaction (at least once for our call — count may include
    // any preceding migration/init transactions on the shared mock).
    expect(mockDbStub.withTransactionAsync).toHaveBeenCalled();
  });

  it('does NOT query workoutSessions for orphans (no completed_at IS NULL select)', async () => {
    g.__rows.sessions = [
      { id: 'completed-A', completed_at: 1700000000000 },
      { id: 'live-B', completed_at: null },
    ];
    // Reset select call counter post-init.
    g.__selectCalls = [];
    await deleteCompletedSession('completed-A');
    // The orphan-cleanup loop does .select({id}).from(sessions).where(IS NULL).
    // deleteCompletedSession must NOT issue any select call.
    expect(g.__selectCalls.length).toBe(0);
  });

  it('regression guard: cancelSession STILL performs orphan cleanup (live-cancel semantics preserved)', async () => {
    g.__rows.sessions = [
      { id: 'target-live', completed_at: null },
      { id: 'orphan-1', completed_at: null },
      { id: 'orphan-2', completed_at: null },
    ];

    await cancelSession('target-live');

    // 2 deletes for target + 2*2 deletes for the two orphans = 6 total.
    expect(g.__deleteCalls.length).toBeGreaterThanOrEqual(6);
  });
});
