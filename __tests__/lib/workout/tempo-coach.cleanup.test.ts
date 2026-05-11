/**
 * BLD-1158b AC12: Tempo Coach cleanup/orphan-timer tests.
 */

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

describe("AC12 — no orphan timers after cancel", () => {
  it("fires no haptics after cancel with pending timers", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    session!.cancel();
    jest.advanceTimersByTime(10000);
    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
  });

  it("fires no haptics after manual cancel mid-rep", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    // Advance into the rep (past t=0 tick) then cancel
    jest.advanceTimersByTime(1000);
    const countBeforeCancel = jest.mocked(Haptics.selectionAsync).mock.calls.length;
    session!.cancel();
    jest.advanceTimersByTime(10000);

    // No additional haptics after cancel
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(countBeforeCancel);
  });

  it("isRunning() returns false after cancel", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    expect(session!.isRunning()).toBe(true);
    session!.cancel();
    expect(session!.isRunning()).toBe(false);
  });

  it("fires no haptics after set_completed cancel (timer handles cleared)", async () => {
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(1000); // past t=0 tick
    const countBeforeCancel = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    emitSetCompleted();
    jest.advanceTimersByTime(20000); // advance well past any pending rep timers

    // No additional selectionAsync haptics — all timer handles were cleared on cancel
    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(countBeforeCancel);
  });

  it("fires no haptics after unmount cancel (timer handles cleared)", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(1000);
    const countBeforeCancel = jest.mocked(Haptics.selectionAsync).mock.calls.length;

    session!.cancel("unmount");
    jest.advanceTimersByTime(20000);

    expect(jest.mocked(Haptics.selectionAsync)).toHaveBeenCalledTimes(countBeforeCancel);
  });

  it("returns null for invalid tempo", () => {
    expect(startCoach("not-a-tempo", {})).toBeNull();
  });

  it("returns null for all-zero tempo", () => {
    expect(startCoach("0-0-0-0", {})).toBeNull();
  });
});
