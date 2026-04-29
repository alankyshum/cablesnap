/**
 * BLD-611: rest-start flash trigger tests for useRestTimer.
 *
 * Asserts that:
 * - On rest START (0 → positive), the flash shared value is animated via
 *   withSequence (one peak + return). End-flash is no longer fired.
 * - With OS reduce motion ON, a static-tint hold sequence is used instead
 *   (gentle fade, no opacity flicker, no cycles).
 * - Tick (positive → smaller positive) does NOT re-trigger the flash.
 * - End (positive → 0) does NOT trigger the flash (rest-start-only).
 * - Each rest start in a session fires its own flash.
 */
import { renderHook, act } from "@testing-library/react-native";

// Override the global reanimated mock so we can spy on animation primitives.
const mockWithTiming = jest.fn((...args: unknown[]) => args[0]);
const mockWithSequence = jest.fn((...args: unknown[]) => { void args; return "SEQ"; });
const mockWithDelay = jest.fn((...args: unknown[]) => args[1]);
const mockReduceMotion = { value: false };

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("../../__mocks__/react-native-reanimated");
  return {
    ...actual,
    withTiming: (value: unknown, config?: unknown) => mockWithTiming(value, config),
    withSequence: (...args: unknown[]) => mockWithSequence(...args),
    withDelay: (delayMs: number, value: unknown) => mockWithDelay(delayMs, value),
    useReducedMotion: () => mockReduceMotion.value,
  };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

jest.mock("../../lib/audio", () => ({ play: jest.fn() }));

jest.mock("../../lib/notifications", () => ({
  isAvailable: () => false,
  scheduleRestComplete: jest.fn().mockResolvedValue("notif-1"),
  cancelRestComplete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/db", () => ({
  getRestSecondsForExercise: jest.fn().mockResolvedValue(60),
  getAppSetting: jest.fn().mockResolvedValue("true"),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  deleteAppSetting: jest.fn().mockResolvedValue(undefined),
  getRestContext: jest.fn(),
}));

import { useRestTimer } from "../../hooks/useRestTimer";

const defaultOptions = {
  sessionId: "session-1",
  colors: { primaryContainer: "#eee", primary: "#333" },
};

describe("useRestTimer — BLD-611 rest-start flash", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWithTiming.mockClear();
    mockWithSequence.mockClear();
    mockWithDelay.mockClear();
    mockReduceMotion.value = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires a single-cycle pulse on rest start (0 → positive)", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    expect(mockWithSequence).not.toHaveBeenCalled();

    act(() => {
      result.current.startRestWithDuration(60);
    });

    // Single sequence call: rise + fall (no withDelay path).
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    expect(mockWithDelay).not.toHaveBeenCalled();

    // Sequence must contain TWO timing legs (peak then back to baseline).
    const args = mockWithTiming.mock.calls;
    // First two timing calls correspond to the two legs of the start-flash.
    expect(args.length).toBeGreaterThanOrEqual(2);
    const [v1, opts1] = args[0];
    const [v2, opts2] = args[1];
    expect(v1).toBe(1);
    expect(v2).toBe(0);
 
    // WCAG / spec: total ≤ 700 ms, ≥ 300 ms total.
    expect(opts1).toEqual(expect.objectContaining({ duration: expect.any(Number) }));
    expect(opts2).toEqual(expect.objectContaining({ duration: expect.any(Number) }));
    const total = (opts1 as { duration: number }).duration + (opts2 as { duration: number }).duration;
    expect(total).toBeLessThanOrEqual(700);
    expect(total).toBeGreaterThanOrEqual(300);
  });

  it("does NOT fire the flash on tick (positive → smaller positive)", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(5);
    });
    const seqCallsAfterStart = mockWithSequence.mock.calls.length;

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(4);
    expect(mockWithSequence.mock.calls.length).toBe(seqCallsAfterStart);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.rest).toBe(3);
    expect(mockWithSequence.mock.calls.length).toBe(seqCallsAfterStart);
  });

  it("does NOT fire the flash on rest end (positive → 0)", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(2);
    });
    const seqCallsAfterStart = mockWithSequence.mock.calls.length;

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.rest).toBe(0);

    // No additional flash on the start→end transition.
    expect(mockWithSequence.mock.calls.length).toBe(seqCallsAfterStart);
  });

  it("fires a fresh flash on EACH rest start within a session", () => {
    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => { result.current.startRestWithDuration(2); });
    expect(mockWithSequence).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.rest).toBe(0);

    act(() => { result.current.startRestWithDuration(2); });
    expect(mockWithSequence).toHaveBeenCalledTimes(2);

    act(() => { jest.advanceTimersByTime(2000); });
    act(() => { result.current.startRestWithDuration(2); });
    expect(mockWithSequence).toHaveBeenCalledTimes(3);
  });

  it("uses static-tint hold (withDelay) when reduce motion is enabled", () => {
    mockReduceMotion.value = true;

    const { result } = renderHook(() => useRestTimer(defaultOptions));

    act(() => {
      result.current.startRestWithDuration(60);
    });

    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    // Reduced-motion branch nests a withDelay → withTiming(0) for the hold.
    expect(mockWithDelay).toHaveBeenCalledTimes(1);
    const [delay] = mockWithDelay.mock.calls[0] as [number, unknown];
    expect(delay).toBeGreaterThanOrEqual(150);
    expect(delay).toBeLessThanOrEqual(300);
  });
});
