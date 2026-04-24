// Controllable AppState mock for background/foreground transitions (BLD-577).
// eslint-disable-next-line no-var
var mockAppStateListeners: Array<(s: string) => void> = [];
// eslint-disable-next-line no-var
var mockAppState: { currentState: string; addEventListener: jest.Mock };

jest.mock("react-native", () => {
  mockAppState = {
    currentState: "active",
    addEventListener: jest.fn((event: string, handler: (s: string) => void) => {
      if (event === "change") mockAppStateListeners.push(handler);
      return {
        remove: () => {
          mockAppStateListeners = mockAppStateListeners.filter((h) => h !== handler);
        },
      };
    }),
  };
  return { AppState: mockAppState };
});

import { renderHook, act } from "@testing-library/react-native";
import { useSetTimer } from "../../hooks/useSetTimer";

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock audio
jest.mock("../../lib/audio", () => ({
  play: jest.fn(),
}));

describe("useSetTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAppStateListeners = [];
    mockAppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with idle state", () => {
    const { result } = renderHook(() => useSetTimer());
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsed).toBe(0);
    expect(result.current.activeExerciseId).toBeNull();
    expect(result.current.activeSetIndex).toBeNull();
  });

  it("sets isRunning to true on start", () => {
    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0);
    });
    expect(result.current.isRunning).toBe(true);
    expect(result.current.activeExerciseId).toBe("ex-1");
    expect(result.current.activeSetIndex).toBe(0);
  });

  it("tracks elapsed time using absolute timestamps", () => {
    const now = 1000000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0);
    });

    // Advance 5 seconds
    jest.spyOn(Date, "now").mockReturnValue(now + 5000);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.elapsed).toBe(5);
  });

  it("stop returns elapsed duration and resets state", () => {
    const now = 1000000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0);
    });

    jest.spyOn(Date, "now").mockReturnValue(now + 10000);
    let duration = 0;
    act(() => {
      duration = result.current.stop();
    });

    expect(duration).toBe(10);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsed).toBe(0);
    expect(result.current.activeExerciseId).toBeNull();
  });

  it("sets targetDuration for countdown mode", () => {
    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0, 60);
    });
    expect(result.current.targetDuration).toBe(60);
  });

  it("computes remaining time in countdown mode", () => {
    const now = 1000000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0, 60);
    });

    jest.spyOn(Date, "now").mockReturnValue(now + 10000);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.remaining).toBe(50);
    expect(result.current.displaySeconds).toBe(50);
    expect(result.current.isCountdownComplete).toBe(false);
  });

  it("detects countdown completion", () => {
    const now = 1000000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0, 10);
    });

    jest.spyOn(Date, "now").mockReturnValue(now + 10000);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.isCountdownComplete).toBe(true);
    expect(result.current.remaining).toBe(0);
  });

  it("dismiss clears all state", () => {
    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0, 60);
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsed).toBe(0);
    expect(result.current.targetDuration).toBeUndefined();
    expect(result.current.activeExerciseId).toBeNull();
  });

  it("displaySeconds shows elapsed in stopwatch mode", () => {
    const now = 1000000;
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0);
    });

    jest.spyOn(Date, "now").mockReturnValue(now + 25000);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.displaySeconds).toBe(25);
  });

  it("stop returns 0 when timer was never started", () => {
    const { result } = renderHook(() => useSetTimer());
    let duration = 0;
    act(() => {
      duration = result.current.stop();
    });
    expect(duration).toBe(0);
  });

  it("persists timer state to SecureStore on start", () => {
    const SecureStore = require("expo-secure-store");
    const { result } = renderHook(() => useSetTimer({ sessionId: "sess-1" }));
    act(() => {
      result.current.start("ex-1", 2, 60);
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "set-timer-sess-1-ex-1-2",
      expect.stringContaining('"exerciseId":"ex-1"'),
    );
  });

  it("clears persisted state on stop", () => {
    const SecureStore = require("expo-secure-store");
    const { result } = renderHook(() => useSetTimer({ sessionId: "sess-1" }));
    act(() => {
      result.current.start("ex-1", 0);
    });
    act(() => {
      result.current.stop();
    });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("set-timer-sess-1-ex-1-0");
  });

  it("does not persist when sessionId is undefined", () => {
    const SecureStore = require("expo-secure-store");
    const { result } = renderHook(() => useSetTimer());
    act(() => {
      result.current.start("ex-1", 0);
    });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  // BLD-577: battery — 1Hz interval must not keep firing while backgrounded.
  describe("AppState pause/resume (BLD-577)", () => {
    it("stops ticking when app goes to background", () => {
      const now = 1_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);
      const { result } = renderHook(() => useSetTimer());
      act(() => { result.current.start("ex-1", 0); });

      jest.spyOn(Date, "now").mockReturnValue(now + 2000);
      act(() => { jest.advanceTimersByTime(1000); });
      expect(result.current.elapsed).toBe(2);

      // Background — interval must clear; further fake-timer advances do
      // not cause any more re-renders even though wall-clock keeps moving.
      act(() => {
        mockAppState.currentState = "background";
        mockAppStateListeners.forEach((h) => h("background"));
      });
      const beforeBg = result.current.elapsed;
      jest.spyOn(Date, "now").mockReturnValue(now + 30_000);
      act(() => { jest.advanceTimersByTime(10_000); });
      expect(result.current.elapsed).toBe(beforeBg);
    });

    it("resumes ticking on foreground and recomputes elapsed from absolute startedAt", () => {
      const now = 1_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);
      const { result } = renderHook(() => useSetTimer());
      act(() => { result.current.start("ex-1", 0); });
      act(() => { jest.advanceTimersByTime(1000); });

      act(() => {
        mockAppState.currentState = "background";
        mockAppStateListeners.forEach((h) => h("background"));
      });
      // 30s of wall-clock passes in background.
      jest.spyOn(Date, "now").mockReturnValue(now + 31_000);

      act(() => {
        mockAppState.currentState = "active";
        mockAppStateListeners.forEach((h) => h("active"));
      });
      // Elapsed recomputed immediately on active transition (no drift).
      expect(result.current.elapsed).toBe(31);

      // And the 1Hz interval is re-armed.
      jest.spyOn(Date, "now").mockReturnValue(now + 32_000);
      act(() => { jest.advanceTimersByTime(1000); });
      expect(result.current.elapsed).toBe(32);
    });

    it("does not start the interval if start() is called while backgrounded", () => {
      mockAppState.currentState = "background";
      const now = 1_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);
      const { result } = renderHook(() => useSetTimer());
      act(() => { result.current.start("ex-1", 0); });

      // Wall-clock advances but no interval is scheduled → elapsed stays 0.
      jest.spyOn(Date, "now").mockReturnValue(now + 5000);
      act(() => { jest.advanceTimersByTime(5000); });
      expect(result.current.elapsed).toBe(0);

      // On foreground transition the interval starts and elapsed catches up.
      act(() => {
        mockAppState.currentState = "active";
        mockAppStateListeners.forEach((h) => h("active"));
      });
      expect(result.current.elapsed).toBe(5);
    });

    it("stop() prevents any further ticking even if AppState flips to active", () => {
      const now = 1_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);
      const { result } = renderHook(() => useSetTimer());
      act(() => { result.current.start("ex-1", 0); });
      act(() => { result.current.stop(); });

      act(() => {
        mockAppState.currentState = "background";
        mockAppStateListeners.forEach((h) => h("background"));
      });
      act(() => {
        mockAppState.currentState = "active";
        mockAppStateListeners.forEach((h) => h("active"));
      });
      jest.spyOn(Date, "now").mockReturnValue(now + 10_000);
      act(() => { jest.advanceTimersByTime(5000); });
      // Elapsed remains 0 because stop() reset state and cleared ticking flag.
      expect(result.current.isRunning).toBe(false);
      expect(result.current.elapsed).toBe(0);
    });
  });
});
