/* eslint-disable @typescript-eslint/no-explicit-any */
// BLD-771: Lock the three-way semantics of updateSetVariant.
//
// Techlead review on PR #426 (comment 5ccee2ba) flagged that the
// undefined-vs-null contract is correct but untested — a future refactor
// could collapse `undefined` into `null` and silently break the picker's
// "leave attachment, change mount" path. This test pins:
//
//   - value (Attachment | MountPosition) → write that value
//   - null                                 → write null (explicit clear)
//   - undefined                            → DO NOT write the column at all
//   - both undefined                       → no-op (no UPDATE issued)
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

import { updateSetVariant } from '../../../lib/db/session-sets';

beforeEach(() => {
  jest.clearAllMocks();
  // Reset chain so .set() returns the chain object on each call.
  mockSet.mockImplementation(() => ({ where: mockWhere }));
});

describe('updateSetVariant — 3-way undefined/null/value contract (BLD-771)', () => {
  it('writes attachment value when a value is provided, leaves mount_position untouched on undefined', async () => {
    await updateSetVariant('set-1', 'rope', undefined);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ attachment: 'rope' });
    // mount_position MUST NOT appear in the payload.
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'mount_position')).toBe(false);
  });

  it('writes mount_position value when a value is provided, leaves attachment untouched on undefined', async () => {
    await updateSetVariant('set-1', undefined, 'low');
    expect(mockSet).toHaveBeenCalledWith({ mount_position: 'low' });
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'attachment')).toBe(false);
  });

  it('writes null to explicitly clear attachment (Clear action)', async () => {
    await updateSetVariant('set-1', null, undefined);
    expect(mockSet).toHaveBeenCalledWith({ attachment: null });
  });

  it('writes null to explicitly clear mount_position (Clear action)', async () => {
    await updateSetVariant('set-1', undefined, null);
    expect(mockSet).toHaveBeenCalledWith({ mount_position: null });
  });

  it('writes both columns when both are provided (autofill / picker confirm path)', async () => {
    await updateSetVariant('set-1', 'rope', 'low');
    expect(mockSet).toHaveBeenCalledWith({ attachment: 'rope', mount_position: 'low' });
  });

  it('writes both nulls when picker Clear-All is used (both explicit null)', async () => {
    await updateSetVariant('set-1', null, null);
    expect(mockSet).toHaveBeenCalledWith({ attachment: null, mount_position: null });
  });

  it('issues NO UPDATE when both args are undefined (no-op contract)', async () => {
    await updateSetVariant('set-1', undefined, undefined);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});
