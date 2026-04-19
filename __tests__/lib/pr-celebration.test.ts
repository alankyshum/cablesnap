/* eslint-disable @typescript-eslint/no-require-imports */
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

let mockDrizzleAllResult: unknown[] = [];

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = jest.fn(self);
      chain.leftJoin = jest.fn(self);
      chain.innerJoin = jest.fn(self);
      chain.where = jest.fn(self);
      chain.groupBy = jest.fn(self);
      chain.orderBy = jest.fn(self);
      chain.limit = jest.fn(self);
      chain.offset = jest.fn(self);
      chain.get = jest.fn(() => mockDrizzleAllResult[0]);
      chain.all = jest.fn(() => mockDrizzleAllResult);
      chain.then = (r: (v: unknown) => unknown) => Promise.resolve(mockDrizzleAllResult).then(r);
      return chain;
    }),
    insert: jest.fn(() => { const c: Record<string, unknown> = {}; const s = () => c; c.values = jest.fn(s); c.then = (r: (v: unknown) => unknown) => Promise.resolve().then(r); return c; }),
    update: jest.fn(() => { const c: Record<string, unknown> = {}; const s = () => c; c.set = jest.fn(s); c.where = jest.fn(s); c.then = (r: (v: unknown) => unknown) => Promise.resolve().then(r); return c; }),
    delete: jest.fn(() => { const c: Record<string, unknown> = {}; const s = () => c; c.where = jest.fn(s); c.then = (r: (v: unknown) => unknown) => Promise.resolve().then(r); return c; }),
  })),
}));

jest.mock("../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

const mockHaptic = jest.fn();
const mockAnnounce = jest.fn();
const mockNotificationHaptic = jest.fn();

jest.mock("expo-haptics", () => ({
  impactAsync: (...args: unknown[]) => mockHaptic(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationHaptic(...args),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
  selectionAsync: jest.fn(),
}));

jest.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: (...args: unknown[]) => mockAnnounce(...args) },
  Platform: { OS: "ios" },
}));

jest.mock("react-native-reanimated", () => ({
  useReducedMotion: () => false,
}));

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "/cache" },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid"),
}));

import { renderHook, act } from "@testing-library/react-native";
import { usePRCelebration } from "../../hooks/usePRCelebration";
import { checkSetPR, getDatabase } from "../../lib/db";

beforeEach(async () => {
  jest.clearAllMocks();
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDrizzleAllResult = [];
  await getDatabase();
  jest.clearAllMocks();
  mockDrizzleAllResult = [];
});

describe("checkSetPR", () => {
  it("detects PR, returns false when not a PR, handles first exercise and bodyweight", async () => {
    // Case 1: PR detected — weight > historical max
    mockDrizzleAllResult = [{ max_weight: 80 }];
    const isPR = await checkSetPR("ex1", 100, "session1");
    expect(isPR).toBe(true);

    // Case 2: No PR — weight equals historical max
    mockDrizzleAllResult = [{ max_weight: 100 }];
    const noPR = await checkSetPR("ex1", 100, "session1");
    expect(noPR).toBe(false);

    // Case 3: No PR — weight below historical max
    mockDrizzleAllResult = [{ max_weight: 120 }];
    const belowPR = await checkSetPR("ex1", 100, "session1");
    expect(belowPR).toBe(false);

    // Case 4: First exercise (no history) — returns false
    mockDrizzleAllResult = [{ max_weight: null }];
    const firstExercise = await checkSetPR("ex1", 50, "session1");
    expect(firstExercise).toBe(false);

    // Case 5: Bodyweight (weight=0) — returns false without DB call
    const bodyweight = await checkSetPR("ex1", 0, "session1");
    expect(bodyweight).toBe(false);
  });
});

describe("usePRCelebration", () => {
  it("triggers celebration with haptic and VoiceOver, and auto-dismisses after 2s", () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => usePRCelebration());

    // Initially not visible
    expect(result.current.celebration.visible).toBe(false);

    // Trigger PR
    act(() => {
      result.current.triggerPR("Bench Press");
    });

    expect(result.current.celebration.visible).toBe(true);
    expect(result.current.celebration.exerciseName).toBe("Bench Press");
    expect(result.current.celebration.showConfetti).toBe(true);
    expect(mockHaptic).toHaveBeenCalledWith("medium");
    expect(mockAnnounce).toHaveBeenCalledWith("New personal record for Bench Press");

    // Auto-dismiss after 2s
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.celebration.visible).toBe(false);

    // Cleanup
    act(() => {
      result.current.cleanup();
    });

    jest.useRealTimers();
  });
});
