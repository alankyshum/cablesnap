/**
 * BLD-1110 — updateSetRPE validation / domain / round behaviour.
 *
 * Contract:
 *   - null passes through as null (explicit clear)
 *   - NaN / undefined → null
 *   - Values outside [6, 10] are out-of-domain → normalized to null
 *   - Values inside [6, 10] are rounded to nearest 0.5
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

describe('updateSetRPE — validation / domain / round (BLD-1110)', () => {
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

  it('rounds 6.0 → 6 (min boundary)', async () => {
    await updateSetRPE('set-1', 6);
    expect(mockSet).toHaveBeenCalledWith({ rpe: 6 });
  });

  it('out-of-domain 0.0 → null (below live-capture range [6,10])', async () => {
    await updateSetRPE('set-1', 0);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
  });

  it('out-of-domain 5.9 → null (just below live-capture range)', async () => {
    await updateSetRPE('set-1', 5.9);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
  });

  it('out-of-domain 11 → null (above live-capture range)', async () => {
    await updateSetRPE('set-1', 11);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
  });

  it('out-of-domain -1 → null', async () => {
    await updateSetRPE('set-1', -1);
    expect(mockSet).toHaveBeenCalledWith({ rpe: null });
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
