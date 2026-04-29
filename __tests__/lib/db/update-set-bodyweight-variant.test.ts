/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-768: Lock the three-way semantics of updateSetBodyweightVariant.
//
// Mirror of update-set-variant.test.ts (BLD-771) — the same 3-way contract:
//
//   - value (GripType | GripWidth) → write that value
//   - null                          → write null (explicit clear)
//   - undefined                     → DO NOT write the column at all
//   - both undefined                → no-op (no UPDATE issued)
//
// A future refactor that collapses `undefined` into `null` would silently break
// the picker's "leave grip_type, change grip_width" path.
const mockSet = jest.fn().mockReturnThis();
const mockWhere = jest.fn(() => Promise.resolve());
const mockUpdate = jest.fn(() => ({ set: mockSet, where: mockWhere }));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
    prepareAsync: jest.fn().mockResolvedValue({
      executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      finalizeAsync: jest.fn().mockResolvedValue(undefined),
    }),
  })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({
    update: mockUpdate,
  })),
}));

import { updateSetBodyweightVariant } from '../../../lib/db/session-sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockImplementation(() => ({ where: mockWhere }));
});

describe('updateSetBodyweightVariant — 3-way undefined/null/value contract (BLD-768)', () => {
  it('writes grip_type value when a value is provided, leaves grip_width untouched on undefined', async () => {
    await updateSetBodyweightVariant('set-1', 'overhand', undefined);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ grip_type: 'overhand' });
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'grip_width')).toBe(false);
  });

  it('writes grip_width value when a value is provided, leaves grip_type untouched on undefined', async () => {
    await updateSetBodyweightVariant('set-1', undefined, 'narrow');
    expect(mockSet).toHaveBeenCalledWith({ grip_width: 'narrow' });
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'grip_type')).toBe(false);
  });

  it('writes null to explicitly clear grip_type (Clear action)', async () => {
    await updateSetBodyweightVariant('set-1', null, undefined);
    expect(mockSet).toHaveBeenCalledWith({ grip_type: null });
  });

  it('writes null to explicitly clear grip_width (Clear action)', async () => {
    await updateSetBodyweightVariant('set-1', undefined, null);
    expect(mockSet).toHaveBeenCalledWith({ grip_width: null });
  });

  it('writes both columns when both are provided (autofill / picker confirm path)', async () => {
    await updateSetBodyweightVariant('set-1', 'overhand', 'narrow');
    expect(mockSet).toHaveBeenCalledWith({ grip_type: 'overhand', grip_width: 'narrow' });
  });

  it('writes both nulls when picker Clear-All is used (both explicit null)', async () => {
    await updateSetBodyweightVariant('set-1', null, null);
    expect(mockSet).toHaveBeenCalledWith({ grip_type: null, grip_width: null });
  });

  it('issues NO UPDATE when both args are undefined (no-op contract)', async () => {
    await updateSetBodyweightVariant('set-1', undefined, undefined);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});
