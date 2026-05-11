/**
 * BLD-1158b AC5: Tempo Coach haptic-availability tests.
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
import { AccessibilityInfo } from "react-native";
import {
  startCoach,
  __resetHapticErrorLogForTests,
  emitSetCompleted,
} from "../../../lib/workout/tempo-coach";
import type { CoachPhase } from "../../../lib/workout/tempo-coach";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  __resetHapticErrorLogForTests();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("AC5 — reduce-motion mode", () => {
  it("fires no haptics when reduce-motion is enabled", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);

    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(6500);

    expect(jest.mocked(Haptics.selectionAsync)).not.toHaveBeenCalled();
    session!.cancel();
  });

  it("announces accessibility for eccentric phase in reduce-motion mode", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);

    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(10); // t=0 tick
    expect(jest.mocked(AccessibilityInfo.announceForAccessibility)).toHaveBeenCalledWith(
      "Lower the weight"
    );

    session!.cancel();
  });

  it("announces bottom pause at t=3000 in reduce-motion mode", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);

    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(3010); // past t=3000
    expect(jest.mocked(AccessibilityInfo.announceForAccessibility)).toHaveBeenCalledWith(
      "Hold at the bottom"
    );

    session!.cancel();
  });
});

describe("AC5 — native haptic rejection (log-once)", () => {
  it("catches haptic rejection and logs once per session, no crash", async () => {
    jest.mocked(Haptics.selectionAsync).mockRejectedValue(new Error("Haptics unavailable"));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const session = startCoach("3-1-2-0", {});
    await Promise.resolve();

    jest.advanceTimersByTime(10);
    await Promise.resolve();

    jest.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toMatch(/TempoCoach/);

    session!.cancel();
    consoleSpy.mockRestore();
  });

  it("resets log-once on new coach session start", async () => {
    jest.mocked(Haptics.selectionAsync).mockRejectedValue(new Error("Haptics unavailable"));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const s1 = startCoach("3-1-2-0", {});
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    s1!.cancel();
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    const s2 = startCoach("3-1-2-0", {});
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    s2!.cancel();
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it("AC5: Success haptic rejection is caught with log-once on set_completed path", async () => {
    jest.mocked(Haptics.notificationAsync).mockRejectedValue(new Error("Success haptic unavailable"));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    startCoach("3-1-2-0", {});
    await Promise.resolve();

    emitSetCompleted();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toMatch(/TempoCoach/);

    consoleSpy.mockRestore();
  });
});

describe("onPhaseChange callback", () => {
  it("calls onPhaseChange with current phase at each haptic boundary", async () => {
    const onPhaseChange = jest.fn();
    const session = startCoach("3-1-2-0", { onPhaseChange });
    await Promise.resolve();

    jest.advanceTimersByTime(10); // t=0 → eccentric
    expect(onPhaseChange).toHaveBeenCalledWith("eccentric");

    jest.advanceTimersByTime(3000); // t=3000 → bottom_pause
    expect(onPhaseChange).toHaveBeenCalledWith("bottom_pause");

    jest.advanceTimersByTime(1000); // t=4000 → concentric
    expect(onPhaseChange).toHaveBeenCalledWith("concentric");

    session!.cancel();
  });

  it("calls onPhaseChange(null) on cancel", async () => {
    const onPhaseChange = jest.fn();
    const session = startCoach("3-1-2-0", { onPhaseChange });
    await Promise.resolve();

    jest.advanceTimersByTime(10);
    onPhaseChange.mockClear();

    session!.cancel();
    expect(onPhaseChange).toHaveBeenCalledWith(null);
  });

  it("calls onPhaseChange with top_pause at rep boundary double-tick", async () => {
    const phases: (CoachPhase | null)[] = [];
    const onPhaseChange = jest.fn((p: CoachPhase | null) => phases.push(p));
    const session = startCoach("3-1-2-0", { onPhaseChange });
    await Promise.resolve();

    jest.advanceTimersByTime(6000 + 80);
    session!.cancel();

    // Should have received: eccentric, bottom_pause, concentric, top_pause, top_pause (double-tick), null
    expect(phases).toContain("top_pause");
    const topPauseCount = phases.filter((p) => p === "top_pause").length;
    expect(topPauseCount).toBeGreaterThanOrEqual(2); // double-tick fires twice
  });
});
