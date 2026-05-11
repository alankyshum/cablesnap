/**
 * BLD-1158b AC3 + AC4 + AC13: Tempo Coach integration tests.
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
import { startCoach, emitSetCompleted } from "../../../lib/workout/tempo-coach";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AC3 — no haptics when coach not started", () => {
  it("zero expo-haptics calls when no session started", () => {
    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
    expect(jest.mocked(Haptics.notificationAsync)).not.toHaveBeenCalled();
  });

  it("returns null for empty tempo (no session started)", () => {
    const session = startCoach("", {});
    expect(session).toBeNull();
    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
  });
});

describe("AC4 — haptics at expected timestamps for 3-1-2-0", () => {
  it("fires selectionAsync at t≈0, t≈3000, t≈4000 (single ticks)", async () => {
    const session = startCoach("3-1-2-0", {});
    expect(session).not.toBeNull();
    await Promise.resolve();

    jest.advanceTimersByTime(10); // t=0
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000); // t=3000
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1000); // t=4000
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(3);

    session!.cancel();
  });

  it("fires double-tick (2 more selectionAsync calls ≤80ms apart) at rep-boundary t=6000ms", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance to rep boundary: fires t=0, t=3000, t=4000, t=6000(first double)
    jest.advanceTimersByTime(6000);
    const beforeDouble = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    // Advance 80ms: second haptic of double-tick fires at t=6080
    jest.advanceTimersByTime(80);
    const afterDouble = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    expect(afterDouble - beforeDouble).toBe(2);

    session!.cancel();
  });

  it("total of 5 selectionAsync calls for 1 full rep (3 singles + 2 double)", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance through rep boundary including both double-tick haptics (at 6000 and 6080ms)
    jest.advanceTimersByTime(6000 + 80);
    session!.cancel();

    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(5);
  });

  it("repeats: second rep start tick fires after rep boundary", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance through end of rep including both double-tick haptics
    jest.advanceTimersByTime(6000 + 80);
    const afterRep1 = jest.mocked(Haptics.selectionAsync).mock.calls.length; // 5

    // Advance 2ms more: nextRepTimer at 6081ms fires → scheduleRep → rep2 offset=0 tick fires
    jest.advanceTimersByTime(2);
    const afterRep2Start = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    expect(afterRep2Start).toBeGreaterThan(afterRep1);

    session!.cancel();
  });
});

describe("AC13 — set-completed signal cancels coach, fires Success notification", () => {
  it("coach cancels synchronously on emitSetCompleted()", async () => {
    const onAbort = jest.fn();
    const session = startCoach("3-1-2-0", { onAbort });
    await Promise.resolve();

    emitSetCompleted();

    expect(onAbort).toHaveBeenCalledWith("set_completed");
    expect(session!.isRunning()).toBe(false);
  });

  it("Success haptic fires after set-completed cancellation", async () => {
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    emitSetCompleted();
    await Promise.resolve();

    expect(jest.mocked(Haptics.notificationAsync)).toHaveBeenCalledWith("success");
  });

  it("no overlapping selectionAsync after set-completed", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(10); // t=0 tick
    const callsBefore = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    emitSetCompleted();
    jest.advanceTimersByTime(10000);

    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(callsBefore);
    expect(session!.isRunning()).toBe(false);
  });
});

describe("AC4 — isometric 0-60-0-0", () => {
  it("fires tick at t=0 and double-tick at t=60000ms", async () => {
    const session = startCoach("0-60-0-0", {});
    await Promise.resolve();

    // Advance through rep boundary + 80ms double-tick gap (t=60080ms),
    // stopping before next-rep timer at t=60081ms
    jest.advanceTimersByTime(60080);
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(3); // t=0 + 2 double-tick

    session!.cancel();
  });
});
