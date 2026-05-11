/**
 * BLD-1158b AC7: Tempo Coach AppState cancellation tests.
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

let capturedAppStateListener: ((state: string) => void) | null = null;

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      capturedAppStateListener = handler;
      return { remove: jest.fn() };
    }),
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
    announceForAccessibility: jest.fn(),
  },
}));

import * as Haptics from "expo-haptics";
import * as KeepAwake from "expo-keep-awake";
import { startCoach } from "../../../lib/workout/tempo-coach";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  capturedAppStateListener = null;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AC7 — AppState cancellation", () => {
  it("cancels the coach when app goes to background", async () => {
    const onAbort = jest.fn();
    const session = startCoach("3-1-2-0", { onAbort });
    expect(session).not.toBeNull();
    await Promise.resolve();

    capturedAppStateListener!("background");

    expect(onAbort).toHaveBeenCalledWith("backgrounded");
    expect(session!.isRunning()).toBe(false);
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledWith("tempo-coach");
  });

  it("cancels the coach when app goes to inactive", async () => {
    const onAbort = jest.fn();
    const session = startCoach("3-1-2-0", { onAbort });
    await Promise.resolve();

    capturedAppStateListener!("inactive");

    expect(onAbort).toHaveBeenCalledWith("backgrounded");
    expect(session!.isRunning()).toBe(false);
  });

  it("does NOT cancel on foreground (active) transition", async () => {
    const onAbort = jest.fn();
    const session = startCoach("3-1-2-0", { onAbort });
    await Promise.resolve();

    capturedAppStateListener!("active");

    expect(onAbort).not.toHaveBeenCalled();
    expect(session!.isRunning()).toBe(true);
    session!.cancel();
  });

  it("fires no haptics after background cancellation", async () => {
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    capturedAppStateListener!("background");

    jest.advanceTimersByTime(10000);
    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
  });

  it("deactivates keep-awake exactly once on background cancel", async () => {
    startCoach("3-1-2-0", {});
    await Promise.resolve();

    capturedAppStateListener!("background");
    capturedAppStateListener!("background"); // second call — no-op

    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledWith("tempo-coach");
  });
});
