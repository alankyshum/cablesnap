/**
 * BLD-1158b AC12: Tempo Coach keep-awake lifecycle tests.
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

import * as KeepAwake from "expo-keep-awake";
import { startCoach } from "../../../lib/workout/tempo-coach";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AC12 — keep-awake lifecycle", () => {
  it("activates keep-awake with tag 'tempo-coach' on start", async () => {
    const session = startCoach("3-1-2-0", {});
    expect(session).not.toBeNull();
    await Promise.resolve();
    expect(jest.mocked(KeepAwake.activateKeepAwakeAsync)).toHaveBeenCalledWith("tempo-coach");
  });

  it("deactivates keep-awake with tag 'tempo-coach' on manual cancel", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    session!.cancel("manual");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledWith("tempo-coach");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledTimes(1);
  });

  it("deactivates keep-awake on unmount cancel", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    session!.cancel("unmount");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledWith("tempo-coach");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledTimes(1);
  });

  it("deactivates keep-awake exactly once when cancel called twice", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    session!.cancel();
    session!.cancel(); // idempotent
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledTimes(1);
  });

  it("deactivates keep-awake on set_completed cancel path", async () => {
    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();
    session!.cancel("set_completed");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledWith("tempo-coach");
    expect(jest.mocked(KeepAwake.deactivateKeepAwake)).toHaveBeenCalledTimes(1);
  });
});
