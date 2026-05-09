/**
 * BLD-1114 — validatePulleyPin + updatePulleyPin validation & domain contract.
 *
 * Contract (mirrors updateSetRPE validation style):
 *   - null passes through as null (explicit clear)
 *   - undefined passes through as null
 *   - Values 1..30 (integer) are accepted
 *   - 0, 31, negative, fractional, NaN, non-numeric → throw Error
 *   - updatePulleyPin calls drizzle update with the validated value
 */

const mockSet = jest.fn().mockReturnThis();
const mockWhere = jest.fn(() => Promise.resolve());
const mockUpdate = jest.fn(() => ({ set: mockSet }));

// Use the __mocks__/expo-sqlite.ts auto-mock (includes prepareAsync)
jest.mock("expo-sqlite");

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({ update: mockUpdate })),
}));

import { validatePulleyPin, updatePulleyPin } from "../../../lib/db/session-sets";

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockImplementation(() => ({ where: mockWhere }));
});

describe("validatePulleyPin — domain contract (BLD-1114)", () => {
  it("null → null (explicit clear)", () => {
    expect(validatePulleyPin(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(validatePulleyPin(undefined)).toBeNull();
  });

  it("1 → 1 (lower bound)", () => {
    expect(validatePulleyPin(1)).toBe(1);
  });

  it("30 → 30 (upper bound)", () => {
    expect(validatePulleyPin(30)).toBe(30);
  });

  it("15 → 15 (mid-range)", () => {
    expect(validatePulleyPin(15)).toBe(15);
  });

  it("0 → throws (below lower bound)", () => {
    expect(() => validatePulleyPin(0)).toThrow();
  });

  it("31 → throws (above upper bound)", () => {
    expect(() => validatePulleyPin(31)).toThrow();
  });

  it("-1 → throws (negative)", () => {
    expect(() => validatePulleyPin(-1)).toThrow();
  });

  it("2.5 → throws (fractional)", () => {
    expect(() => validatePulleyPin(2.5)).toThrow();
  });

  it("NaN → throws", () => {
    expect(() => validatePulleyPin(NaN)).toThrow();
  });

  it("'7' as string → coerces to 7 (Number('7') is in-range)", () => {
    expect(validatePulleyPin("7" as unknown as number)).toBe(7);
  });
});

describe("updatePulleyPin — calls drizzle with validated value (BLD-1114)", () => {
  it("passes null through to DB", async () => {
    await updatePulleyPin("set-1", null);
    expect(mockSet).toHaveBeenCalledWith({ pulley_pin: null });
  });

  it("passes valid pin 12 to DB", async () => {
    await updatePulleyPin("set-1", 12);
    expect(mockSet).toHaveBeenCalledWith({ pulley_pin: 12 });
  });

  it("throws on invalid pin 0 — does not call DB", async () => {
    await expect(updatePulleyPin("set-1", 0)).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });
});
