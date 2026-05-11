/**
 * BLD-1158b AC4: Tempo Coach drift / sub-second tick density tests.
 *
 * Verifies:
 * - Rep boundaries are anchored to absolute session start time (no per-rep drift)
 * - Phase ticks that arrive >250ms late (event-loop delay) are skipped, not fired
 * - Phase ticks that arrive ≤250ms late are still fired
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
    announceForAccessibility: jest.fn(),
  },
}));

import * as Haptics from "expo-haptics";
import { startCoach } from "../../../lib/workout/tempo-coach";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AC4 — absolute anchoring, no accumulated drift", () => {
  it("rep2 boundary fires within ±250ms of 12000ms (no 81ms-per-rep accumulation)", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance to 11750ms — rep2 boundary (12000ms) has NOT fired yet
    jest.advanceTimersByTime(11750);
    const beforeBoundary = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    // Advance 500ms window (11750→12250ms): rep2 boundary must fire here
    jest.advanceTimersByTime(500);
    expect(jest.mocked(Haptics.selectionAsync).mock.calls.length).toBeGreaterThan(beforeBoundary);

    session!.cancel();
  });

  it("rep3 boundary fires within ±250ms of 18000ms", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(17750);
    const before = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    jest.advanceTimersByTime(500);
    expect(jest.mocked(Haptics.selectionAsync).mock.calls.length).toBeGreaterThan(before);

    session!.cancel();
  });
});

describe("AC4 — lateness skip: ticks >250ms late are dropped", () => {
  it("skips phase tick when Date.now() shows event loop delivered it 300ms late", async () => {
    // Set session start time in the past via setSystemTime so the session "starts" at T=0,
    // but when the t=0 timer fires immediately, Date.now() is 300ms ahead → lateness 300ms.
    jest.setSystemTime(0);
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance Date.now() by 300ms without advancing fake timers (simulates event-loop delay).
    // The delay=0 timer for phase offset=0 fires at nominal fake-time 0.
    jest.setSystemTime(300);
    jest.advanceTimersByTime(0); // fire due timers (delay=0)

    // Lateness = Date.now() - sessionStartTime - expectedMs = 300 - 0 - 0 = 300ms > 250ms → skip
    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
  });

  it("fires phase tick when event loop delivers it only 200ms late (within cap)", async () => {
    jest.setSystemTime(0);
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.setSystemTime(200); // 200ms late — within 250ms cap
    jest.advanceTimersByTime(0);

    // Lateness = 200ms ≤ 250ms → fires
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(1);
  });

  it("fires phase tick at t=0 with 0ms lateness (normal case)", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(10);
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(1);

    session!.cancel();
  });
});

describe("AC4 — sub-second tick density for 3-1-2-0", () => {
  it("fires exactly 5 selectionAsync calls in 1 full rep (3 singles + 2 double)", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(6000 + 80);
    session!.cancel();

    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(5);
  });

  it("double-tick fires twice within 80ms at rep boundary", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(6000);
    const afterBoundaryOuter = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    jest.advanceTimersByTime(80);
    const afterDoubleTick = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    expect(afterDoubleTick - afterBoundaryOuter).toBe(2);
    session!.cancel();
  });
});

