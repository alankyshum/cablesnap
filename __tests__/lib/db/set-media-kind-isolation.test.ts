/**
 * BLD-1114 — set_media kind isolation: getClipForSet returns only kind='video',
 * getSetupPhotoForSet returns only kind='setup_photo'.
 *
 * Both functions must NOT cross-contaminate when a set has both kinds present.
 */

const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();

const mockSelectChain = {
  from: mockFrom.mockReturnThis(),
  where: mockWhere.mockReturnThis(),
  limit: mockLimit,
};

// Use __mocks__/expo-sqlite.ts auto-mock (includes withTransactionAsync + prepareAsync)
jest.mock("expo-sqlite");

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(),
  })),
}));

// Mock drizzle-orm operators to capture the kind filter in .where() calls
jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn((col: unknown, val: unknown) => ({ _col: col, _val: val })),
    and: jest.fn((...args: unknown[]) => args),
  };
});

import { getClipForSet } from "../../../lib/db/form-clips";
import { getSetupPhotoForSet } from "../../../lib/db/setup-photos";

const videoRow = {
  id: "m1", set_id: "s1", exercise_id: "ex1",
  kind: "video" as const, rel_path: "set-media/clips/ex1/c1.mp4",
  pending_delete: 0, created_at: 1700000001,
  size_bytes: null, width: null, height: null,
};

const photoRow = {
  id: "m2", set_id: "s1", exercise_id: "ex1",
  kind: "setup_photo" as const, rel_path: "set-media/setup-p1.jpg",
  pending_delete: 0, created_at: 1700000002,
  size_bytes: null, width: null, height: null,
};

describe("set_media kind isolation (BLD-1114)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { drizzle } = require("drizzle-orm/expo-sqlite");
    (drizzle as jest.Mock).mockReturnValue({
      select: mockSelect.mockReturnValue(mockSelectChain),
    });
    mockFrom.mockReturnValue(mockSelectChain);
    mockWhere.mockReturnValue(mockSelectChain);
  });

  it("getClipForSet includes kind='video' filter in WHERE call", async () => {
    mockLimit.mockResolvedValue([videoRow]);
    await getClipForSet("s1");

    // eq was called with the kind column and 'video'
    const { eq } = require("drizzle-orm");
    const eqCalls = (eq as jest.Mock).mock.calls;
    const kindCall = eqCalls.find(([, val]) => val === "video");
    expect(kindCall).toBeDefined();
  });

  it("getSetupPhotoForSet includes kind='setup_photo' filter in WHERE call", async () => {
    mockLimit.mockResolvedValue([photoRow]);
    await getSetupPhotoForSet("s1");

    const { eq } = require("drizzle-orm");
    const eqCalls = (eq as jest.Mock).mock.calls;
    const kindCall = eqCalls.find(([, val]) => val === "setup_photo");
    expect(kindCall).toBeDefined();
  });

  it("getClipForSet does NOT filter by kind='setup_photo'", async () => {
    mockLimit.mockResolvedValue([videoRow]);
    await getClipForSet("s1");

    const { eq } = require("drizzle-orm");
    const eqCalls = (eq as jest.Mock).mock.calls;
    const photoKindCall = eqCalls.find(([, val]) => val === "setup_photo");
    expect(photoKindCall).toBeUndefined();
  });

  it("getSetupPhotoForSet does NOT filter by kind='video'", async () => {
    mockLimit.mockResolvedValue([photoRow]);
    await getSetupPhotoForSet("s1");

    const { eq } = require("drizzle-orm");
    const eqCalls = (eq as jest.Mock).mock.calls;
    const videoKindCall = eqCalls.find(([, val]) => val === "video");
    expect(videoKindCall).toBeUndefined();
  });

  it("getClipForSet returns null when DB returns empty array", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await getClipForSet("s1");
    expect(result).toBeNull();
  });

  it("getSetupPhotoForSet returns null when DB returns empty array", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await getSetupPhotoForSet("s1");
    expect(result).toBeNull();
  });
});
