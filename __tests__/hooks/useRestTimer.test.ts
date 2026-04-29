import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useRestTimer } from "../../hooks/useRestTimer";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

jest.mock("../../lib/audio", () => ({
  play: jest.fn(),
}));

const mockScheduleRestComplete = jest.fn().mockResolvedValue("notif-id-1");
const mockCancelRestComplete = jest.fn().mockResolvedValue(undefined);
const mockIsAvailable = jest.fn().mockReturnValue(true);
const mockRequestPermission = jest.fn().mockResolvedValue(true);
jest.mock("../../lib/notifications", () => ({
  isAvailable: () => mockIsAvailable(),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  scheduleRestComplete: (...args: unknown[]) => mockScheduleRestComplete(...args),
  cancelRestComplete: (...args: unknown[]) => mockCancelRestComplete(...args),
}));

const mockGetRestSeconds = jest.fn().mockResolvedValue(60);
const mockGetAppSetting = jest.fn().mockResolvedValue("true");
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
const mockDeleteAppSetting = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/db", () => ({
  getRestSecondsForExercise: (...args: unknown[]) => mockGetRestSeconds(...args),
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  getRestContext: jest.fn(),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  deleteAppSetting: (...args: unknown[]) => mockDeleteAppSetting(...args),
}));

let appStateListeners: Array<(state: string) => void> = [];
const mockAddEventListener = jest.fn((event: string, handler: (state: string) => void) => {
  if (event === "change") appStateListeners.push(handler);
  return { remove: () => { appStateListeners = appStateListeners.filter((h) => h !== handler); } };
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
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "rest_timer_default_seconds") return null;
      if (key === "rest_timer_active_state") return null;
      return "true";
    });
    mockIsAvailable.mockReturnValue(true);
    mockRequestPermission.mockResolvedValue(true);
    mockScheduleRestComplete.mockResolvedValue("notif-id-1");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with rest = 0", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));
    expect(result.current.rest).toBe(0);
  });

  it("defaults persisted and selected duration to 30 seconds when nothing is saved", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.persistedDurationSeconds).toBe(30);
    expect(result.current.selectedDurationSeconds).toBe(30);
  });

  it("startRestWithDuration sets rest and counts down using absolute timestamps", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.startRestWithDuration(5);
    });
    expect(result.current.rest).toBe(5);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(4);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(3);
  });

  it("persists the last started duration and marks it as selected", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.startRestWithDuration(45);
    });

    expect(result.current.selectedDurationSeconds).toBe(45);
    expect(result.current.persistedDurationSeconds).toBe(45);
    expect(mockSetAppSetting).toHaveBeenCalledWith("rest_timer_default_seconds", "45");
  });

  it("counts down to 0 and stops", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(3);
    });

    act(() => { jest.advanceTimersByTime(3000); });
    expect(result.current.rest).toBe(0);

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.rest).toBe(0);
  });

  it("dismissRest cancels timer and notification", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.dismissRest();
    });

    expect(result.current.rest).toBe(0);
    expect(mockCancelRestComplete).toHaveBeenCalledWith("notif-id-1");
    expect(mockDeleteAppSetting).toHaveBeenCalledWith("rest_timer_active_state");
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
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRequestPermission).toHaveBeenCalled();
    expect(mockScheduleRestComplete).toHaveBeenCalledWith(60, "session-1");
  });

  it("does NOT schedule notification when permission is denied", async () => {
    mockRequestPermission.mockResolvedValue(false);
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockScheduleRestComplete).not.toHaveBeenCalled();
  });

  it("does NOT schedule notification when setting is disabled", async () => {
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "rest_notification_enabled") return "false";
      if (key === "rest_timer_default_seconds") return null;
      if (key === "rest_timer_active_state") return null;
      return "true";
    });
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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
      await Promise.resolve();
      await Promise.resolve();
    });

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
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(30);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCancelRestComplete).toHaveBeenCalledWith("notif-1");
  });

  it("recalculates remaining time when app resumes from background", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.startRestWithDuration(90);
    });
    expect(result.current.rest).toBe(90);

    jest.setSystemTime(Date.now() + 60000);

    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(30);
  });

  it("shows 0 and cleans up when app resumes after timer would have expired", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.startRestWithDuration(60);
    });

    jest.setSystemTime(Date.now() + 90000);

    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(0);
    expect(mockDeleteAppSetting).toHaveBeenCalledWith("rest_timer_active_state");
  });

  it("does nothing on AppState change when no timer is running", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      for (const listener of appStateListeners) {
        listener("active");
      }
    });

    expect(result.current.rest).toBe(0);
  });

  it("pauses 1Hz interval when backgrounded", async () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.startRestWithDuration(60);
    });
    expect(result.current.rest).toBe(60);

    act(() => {
      for (const listener of appStateListeners) listener("background");
    });

    act(() => { jest.advanceTimersByTime(10000); });
    expect(result.current.rest).toBe(60);

    act(() => {
      for (const listener of appStateListeners) listener("active");
    });

    expect(result.current.rest).toBe(50);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(49);
  });

  it("restores an active timer from persisted end timestamp", async () => {
    const endTimestamp = Date.now() + 45000;
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "rest_timer_default_seconds") return "30";
      if (key === "rest_timer_active_state") {
        return JSON.stringify({
          sessionId: "session-1",
          endTimestamp,
          durationSeconds: 45,
          breakdown: {
            totalSeconds: 45,
            baseSeconds: 45,
            factors: [],
            isDefault: true,
            reasonShort: "",
            reasonAccessible: "",
          },
          notificationId: "notif-id-1",
        });
      }
      return "true";
    });

    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.rest).toBe(45);
    expect(result.current.selectedDurationSeconds).toBe(45);
  });

  it("does not schedule notification when notifications unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.startRestWithDuration(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockScheduleRestComplete).not.toHaveBeenCalled();
  });
});
