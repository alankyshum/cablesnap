import { renderHook, act } from "@testing-library/react-native";
import { useSetTimer } from "../../hooks/useSetTimer";

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

describe("useSetTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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
});
