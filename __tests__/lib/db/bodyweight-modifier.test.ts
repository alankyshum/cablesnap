/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-541: Write-invariant tests for updateSetBodyweightModifier
const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
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

let mockSelectResult: any[] = [];
const mockUpdateSet = jest.fn();

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(() => Promise.resolve(mockSelectResult)),
        get: jest.fn(() => undefined),
        all: jest.fn(() => mockSelectResult),
        then: (r: any) => Promise.resolve(mockSelectResult).then(r),
      };
      return chain;
    }),
    update: jest.fn(() => ({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args);
        return {
          where: jest.fn(() => Promise.resolve()),
          then: (r: any) => Promise.resolve().then(r),
        };
      },
    })),
    insert: jest.fn(() => ({ values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) })),
    delete: jest.fn(() => ({ where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) })),
  })),
}));

import {
  updateSetBodyweightModifier,
  normalizeBodyweightModifier,
} from '../../../lib/db/session-sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectResult = [];
  mockUpdateSet.mockClear();
});

describe('bodyweight modifier write invariant', () => {
  it.each([
    // [input, expected]
    [0, null], [-0, null], [NaN, null], [Infinity, null],
    [15, 15], [-20, -20], [null, null], [undefined, null],
  ] as const)('normalizeBodyweightModifier(%s) = %s', (input, expected) => {
    expect(normalizeBodyweightModifier(input as number | null | undefined)).toBe(expected);
  });

  it.each([
    // [equipment, modifierIn, expectation]
    ['bodyweight', 15, { ok: true, stored: 15 }],
    ['bodyweight', 0, { ok: true, stored: null }], // ±0 normalized
    ['barbell', null, { ok: true, stored: null }], // null always clears
    ['dumbbell', 0, { ok: true, stored: null }],   // ±0 OK even on non-BW
  ] as const)(
    'updateSetBodyweightModifier(equipment=%s, modifier=%s) succeeds',
    async (equipment, modifier, { stored }) => {
      mockSelectResult = [{ equipment }];
      await expect(updateSetBodyweightModifier('set-1', modifier as number | null)).resolves.toBeUndefined();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ bodyweight_modifier_kg: stored })
      );
    }
  );

  it.each([
    ['barbell', 15],
    ['dumbbell', -20],
    ['cable', 5],
    ['machine', -10],
  ] as const)(
    'updateSetBodyweightModifier(equipment=%s, modifier=%s) throws (non-BW + non-null)',
    async (equipment, modifier) => {
      mockSelectResult = [{ equipment }];
      await expect(
        updateSetBodyweightModifier('set-1', modifier)
      ).rejects.toThrow('bodyweight_modifier_kg only valid on bodyweight exercises');
      expect(mockUpdateSet).not.toHaveBeenCalled();
    }
  );

  it('throws when the set is not found', async () => {
    mockSelectResult = [];
    await expect(updateSetBodyweightModifier('missing', 10)).rejects.toThrow(/not found/);
  });
});
