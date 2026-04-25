/* eslint-disable @typescript-eslint/no-explicit-any */
let mockUuidCounter = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `mock-uuid-${++mockUuidCounter}`),
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

let drizzleGetResult: any = null;
let drizzleQueryResult: any = [];
const insertSpy = jest.fn();
const updateSpy = jest.fn();
const deleteSpy = jest.fn();

const mockDrizzleDb = {
  select: jest.fn(() => {
    const chain: any = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn(() => drizzleGetResult),
      then: (r: any, rj: any) => Promise.resolve(drizzleQueryResult).then(r, rj),
    };
    return chain;
  }),
  insert: jest.fn(() => ({
    values: jest.fn((v: any) => { insertSpy(v); return { then: (r: any) => Promise.resolve().then(r) }; }),
  })),
  update: jest.fn(() => ({
    set: jest.fn((v: any) => ({
      where: jest.fn(() => { updateSpy(v); return { then: (r: any) => Promise.resolve().then(r) }; }),
    })),
  })),
  delete: jest.fn(() => ({
    where: jest.fn(() => { deleteSpy(); return { then: (r: any) => Promise.resolve().then(r) }; }),
  })),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));
jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
}));

import {
  addWaterLog,
  deleteWaterLog,
  updateWaterLog,
  getWaterLogsForDate,
  getDailyTotalMl,
} from '../../../lib/db/hydration';
import { getDatabase } from '../../../lib/db/helpers';

beforeEach(async () => {
  jest.clearAllMocks();
  mockUuidCounter = 0;
  drizzleGetResult = null;
  drizzleQueryResult = [];
  insertSpy.mockClear();
  updateSpy.mockClear();
  deleteSpy.mockClear();
  await getDatabase();
});

describe('hydration db', () => {
  it('addWaterLog persists row with rounded amount and supplied date_key', async () => {
    const result = await addWaterLog('2026-04-25', 250.4);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      date_key: '2026-04-25',
      amount_ml: 250,
      id: expect.stringMatching(/^mock-uuid-/),
    });
    expect(result.amount_ml).toBe(250);
    expect(result.date_key).toBe('2026-04-25');
  });

  it('addWaterLog rejects non-positive amounts', async () => {
    await expect(addWaterLog('2026-04-25', 0)).rejects.toThrow();
    await expect(addWaterLog('2026-04-25', -1)).rejects.toThrow();
  });

  it('deleteWaterLog issues a delete on the row', async () => {
    await deleteWaterLog('w1');
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('updateWaterLog rounds amount and writes update', async () => {
    await updateWaterLog('w1', 333.7);
    expect(updateSpy).toHaveBeenCalledWith({ amount_ml: 334 });
  });

  it('updateWaterLog rejects invalid amount', async () => {
    await expect(updateWaterLog('w1', 0)).rejects.toThrow();
  });

  it('getWaterLogsForDate returns drizzle rows', async () => {
    drizzleQueryResult = [
      { id: 'w2', date_key: '2026-04-25', amount_ml: 500, logged_at: 2 },
      { id: 'w1', date_key: '2026-04-25', amount_ml: 250, logged_at: 1 },
    ];
    const rows = await getWaterLogsForDate('2026-04-25');
    expect(rows.length).toBe(2);
    expect(rows[0].amount_ml).toBe(500);
  });

  it('getDailyTotalMl returns 0 when no rows match', async () => {
    drizzleGetResult = { total: 0 };
    expect(await getDailyTotalMl('2026-04-25')).toBe(0);
  });

  it('getDailyTotalMl returns COALESCEd sum', async () => {
    drizzleGetResult = { total: 1250 };
    expect(await getDailyTotalMl('2026-04-25')).toBe(1250);
  });
});
