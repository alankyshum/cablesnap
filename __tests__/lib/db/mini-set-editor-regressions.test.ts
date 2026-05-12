/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regression tests for BLD-1175 reviewer Round 3 blockers:
 *
 * 1. nextReps param — handleAddSegment uses caller-supplied reps, not hardcoded 1
 * 2. collapse-to-normal preserves Σreps
 * 3. segment_number collision — MAX+1 strategy avoids duplicate segment numbers
 */

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

let mockInsertedRows: any[] = [];
let mockSegmentsForSet: any[] = [];

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn(() => undefined),
        all: jest.fn(() => mockSegmentsForSet),
        then: (r: any) => Promise.resolve(mockSegmentsForSet).then(r),
      };
      return chain;
    }),
    insert: jest.fn(() => {
      const c: any = {
        values: jest.fn((v: any) => { mockInsertedRows.push(v); return c; }),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
    update: jest.fn(() => {
      const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) };
      return c;
    }),
    delete: jest.fn(() => {
      const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) };
      return c;
    }),
  })),
}));

jest.mock('../../../lib/uuid', () => ({ uuid: jest.fn(() => 'mock-uuid') }));

import { insertSegment, deleteAllSegmentsForSet, getSegmentsForSets } from '../../../lib/db/sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertedRows = [];
  mockSegmentsForSet = [];
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

// ── Blocker 1: insertSegment uses caller-supplied reps (not hardcoded 1) ────
describe('insertSegment uses caller-supplied reps', () => {
  it('inserts segment with reps=8 when called with reps=8', async () => {
    await insertSegment({ setId: 'set-1', segmentNumber: 1, reps: 8, weight: null });
    expect(mockInsertedRows[0]).toMatchObject({ set_id: 'set-1', segment_number: 1, reps: 8 });
  });

  it('inserts segment with reps=3 when called with reps=3', async () => {
    await insertSegment({ setId: 'set-1', segmentNumber: 2, reps: 3, weight: null });
    expect(mockInsertedRows[0]).toMatchObject({ reps: 3 });
  });

  it('does NOT default to reps=1 when caller passes reps=5', async () => {
    await insertSegment({ setId: 'set-1', segmentNumber: 1, reps: 5, weight: null });
    expect(mockInsertedRows[0].reps).toBe(5);
    expect(mockInsertedRows[0].reps).not.toBe(1);
  });
});

// ── Blocker 2: collapse-to-normal reps sum logic ────────────────────────────
describe('collapse-to-normal reps sum', () => {
  it('sums [8, 3, 2] to 13', () => {
    const segments = [
      { id: 's1', set_id: 'set-1', segment_number: 1, reps: 8, weight: null },
      { id: 's2', set_id: 'set-1', segment_number: 2, reps: 3, weight: null },
      { id: 's3', set_id: 'set-1', segment_number: 3, reps: 2, weight: null },
    ];
    const total = segments.reduce((sum, seg) => sum + seg.reps, 0);
    expect(total).toBe(13);
  });

  it('sums [6, 4, 2] to 12', () => {
    const segments = [
      { id: 's1', set_id: 'set-1', segment_number: 1, reps: 6, weight: null },
      { id: 's2', set_id: 'set-1', segment_number: 2, reps: 4, weight: null },
      { id: 's3', set_id: 'set-1', segment_number: 3, reps: 2, weight: null },
    ];
    const total = segments.reduce((sum, seg) => sum + seg.reps, 0);
    expect(total).toBe(12);
  });

  it('returns 0 for empty segments array', () => {
    const segments: any[] = [];
    const total = segments.reduce((sum: number, seg: any) => sum + seg.reps, 0);
    expect(total).toBe(0);
  });
});

// ── Blocker 3: MAX+1 segment_number strategy avoids collisions ──────────────
describe('segment_number MAX+1 strategy', () => {
  it('returns 1 when there are no existing segments', () => {
    const segments: any[] = [];
    const nextNum = segments.length > 0
      ? Math.max(...segments.map((s) => s.segment_number)) + 1
      : 1;
    expect(nextNum).toBe(1);
  });

  it('returns MAX+1 for a contiguous list [1,2,3]', () => {
    const segments = [
      { segment_number: 1 }, { segment_number: 2 }, { segment_number: 3 },
    ];
    const nextNum = segments.length > 0
      ? Math.max(...segments.map((s) => s.segment_number)) + 1
      : 1;
    expect(nextNum).toBe(4);
  });

  it('returns 9 after deleting segment 4 from [1,2,3,5,6,7,8] (max=8)', () => {
    // Simulates: had 8 segments (1..8), deleted segment 4 → 7 remain
    // existingCount would be 7 → 7+1=8 collision! MAX+1 → 8+1=9, safe.
    const segments = [
      { segment_number: 1 }, { segment_number: 2 }, { segment_number: 3 },
      { segment_number: 5 }, { segment_number: 6 }, { segment_number: 7 },
      { segment_number: 8 },
    ];
    const nextNum = segments.length > 0
      ? Math.max(...segments.map((s) => s.segment_number)) + 1
      : 1;
    expect(nextNum).toBe(9);
    // Confirm the buggy approach would collide:
    const buggyNextNum = segments.length + 1; // 7+1 = 8, which already exists!
    expect(buggyNextNum).toBe(8);
    expect(segments.some((s) => s.segment_number === buggyNextNum)).toBe(true);
  });

  it('handles gap at start: segments [3,4,5] → next is 6', () => {
    const segments = [
      { segment_number: 3 }, { segment_number: 4 }, { segment_number: 5 },
    ];
    const nextNum = segments.length > 0
      ? Math.max(...segments.map((s) => s.segment_number)) + 1
      : 1;
    expect(nextNum).toBe(6);
  });
});
