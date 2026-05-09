/**
 * BLD-1110 — updateSetRPE validation / clamp / round behaviour.
 *
 * Contract:
 *   - null passes through as null (explicit clear)
 *   - NaN / undefined / out-of-domain → null
 *   - Values outside [0, 10] are clamped then rounded to nearest 0.5
 *   - Values inside [0, 10] are rounded to nearest 0.5
 *   - Never throws — silently produces null for bad input
 */
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

import { updateSetRPE } from '../../../lib/db/session-sets';

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockImplementation(() => ({ where: mockWhere }));
});

describe('updateSetRPE — validation / clamp / round (BLD-1110)', () => {
  it('passes null through as null (explicit clear)', async () => {
    await updateSetRPE('set-1', null);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
  });

  it('rounds 7.0 → 7', async () => {
    await updateSetRPE('set-1', 7);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 7 });
  });

  it('rounds 7.3 → 7.5 (nearest 0.5)', async () => {
    await updateSetRPE('set-1', 7.3);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 7.5 });
  });

  it('rounds 7.2 → 7 (rounds down to nearest 0.5)', async () => {
    await updateSetRPE('set-1', 7.2);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 7 });
  });

  it('rounds 9.5 → 9.5 (exact boundary)', async () => {
    await updateSetRPE('set-1', 9.5);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 9.5 });
  });

  it('rounds 10.0 → 10 (max boundary)', async () => {
    await updateSetRPE('set-1', 10);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 10 });
  });

  it('rounds 0.0 → 0 (min boundary)', async () => {
    await updateSetRPE('set-1', 0);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 0 });
  });

  it('clamps 11 → 10 then rounds', async () => {
    await updateSetRPE('set-1', 11);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 10 });
  });

  it('clamps -1 → 0 then rounds', async () => {
    await updateSetRPE('set-1', -1);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 0 });
  });

  it('NaN → null (never throws)', async () => {
    await updateSetRPE('set-1', NaN);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
  });

  it('always calls update once with a rpe key', async () => {
    await updateSetRPE('set-42', 8.5);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'rpe')).toBe(true);
  });
});
