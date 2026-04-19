import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useRestTimer } from "../../hooks/useRestTimer";

// Use the global reanimated mock from __mocks__/react-native-reanimated.js
// (no need to re-mock here)

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

// Mock audio
jest.mock("../../lib/audio", () => ({
  play: jest.fn(),
}));

// Mock notifications
const mockScheduleRestComplete = jest.fn().mockResolvedValue("notif-id-1");
const mockCancelRestComplete = jest.fn().mockResolvedValue(undefined);
const mockIsAvailable = jest.fn().mockReturnValue(true);
jest.mock("../../lib/notifications", () => ({
  isAvailable: () => mockIsAvailable(),
  scheduleRestComplete: (...args: unknown[]) => mockScheduleRestComplete(...args),
  cancelRestComplete: (...args: unknown[]) => mockCancelRestComplete(...args),
}));

// Mock db
const mockGetRestSeconds = jest.fn().mockResolvedValue(60);
const mockGetAppSetting = jest.fn().mockResolvedValue("true");
jest.mock("../../lib/db", () => ({
  getRestSecondsForExercise: (...args: unknown[]) => mockGetRestSeconds(...args),
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
}));

// Track AppState listeners
let appStateListeners: Array<(state: string) => void> = [];
const mockAddEventListener = jest.fn((event: string, handler: (state: string) => void) => {
  if (event === "change") appStateListeners.push(handler);
  return { remove: () => { appStateListeners = appStateListeners.filter(h => h !== handler); } };
});
jest.spyOn(AppState, "addEventListener").mockImplementation(mockAddEventListener as unknown as typeof AppState.addEventListener);

const defaultOptions = {
  sessionId: "session-1",
  colors: { primaryContainer: "#eee", primary: "#333" },
};

describe("useRestTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    appStateListeners = [];
    mockGetAppSetting.mockResolvedValue("true");
    mockIsAvailable.mockReturnValue(true);
    mockScheduleRestComplete.mockResolvedValue("notif-id-1");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with rest = 0", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));
    expect(result.current.rest).toBe(0);
  });

  it("startRestWithDuration sets rest and counts down using absolute timestamps", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(5);
    });
    expect(result.current.rest).toBe(5);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(4);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(3);
  });

  it("counts down to 0 and stops", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(3);
    });

    act(() => { jest.advanceTimersByTime(3000); });
    expect(result.current.rest).toBe(0);

    // Timer should be cleared
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.rest).toBe(0);
  });

  it("dismissRest cancels timer and notification", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(60);
      // Allow the async scheduleNotification to resolve
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.rest).toBe(60);

    act(() => {
      result.current.dismissRest();
    });
    expect(result.current.rest).toBe(0);
    // Notification should have been cancelled
    expect(mockCancelRestComplete).toHaveBeenCalledWith("notif-id-1");
  });

  it("startRest fetches rest seconds from DB", async () => {
    mockGetRestSeconds.mockResolvedValue(90);
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await result.current.startRest("exercise-1");
    });

    expect(mockGetRestSeconds).toHaveBeenCalledWith("session-1", "exercise-1");
    expect(result.current.rest).toBe(90);
  });

  it("schedules notification on rest start when enabled", async () => {
    mockGetAppSetting.mockResolvedValue("true");
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(60);
      // Allow the async scheduleNotification to resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockScheduleRestComplete).toHaveBeenCalledWith(60, "session-1");
  });

  it("does NOT schedule notification when setting is disabled", async () => {
    mockGetAppSetting.mockResolvedValue("false");
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockScheduleRestComplete).not.toHaveBeenCalled();
  });

  it("cancels notification when timer reaches 0 in-app", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(2);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.rest).toBe(0);
    expect(mockCancelRestComplete).toHaveBeenCalled();
  });

  it("new startRestWithDuration cancels previous notification", async () => {
    mockScheduleRestComplete
      .mockResolvedValueOnce("notif-1")
      .mockResolvedValueOnce("notif-2");

    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Starting a new timer should cancel the previous notification
    await act(async () => {
      result.current.startRestWithDuration(30);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCancelRestComplete).toHaveBeenCalledWith("notif-1");
  });

  it("recalculates remaining time when app resumes from background", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(90);
    });
    expect(result.current.rest).toBe(90);

    // Simulate 60 seconds passing while backgrounded (no intervals fire)
    jest.setSystemTime(Date.now() + 60000);

    // Simulate app coming back to foreground
    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(30);
  });

  it("shows 0 and cleans up when app resumes after timer would have expired", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(60);
    });

    // Simulate 90 seconds passing
    jest.setSystemTime(Date.now() + 90000);

    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(0);
  });

  it("does nothing on AppState change when no timer is running", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(0);
  });

  it("does not schedule notification when notifications unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockScheduleRestComplete).not.toHaveBeenCalled();
  });
});
