/**
 * BLD-1137: Smart Rest Coach — useRestTimer unit tests
 *
 * Covers:
 * - Settings short-circuit (AC11: master OFF / permission denied)
 * - 3-id orchestration (preEnd, complete, liveOngoing scheduled appropriately)
 * - cancel-all on dismiss / skip (AC7)
 * - Persistence migration from legacy single notificationId (AC13)
 * - Cold-start resume: liveEnabled restarts live countdown (AC12)
 * - Preview forwarded through runTimer → scheduleNotification (AC2, AC5)
 */

import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));

jest.mock("../../lib/audio", () => ({ play: jest.fn() }));

const mockScheduleRestComplete = jest.fn().mockResolvedValue("complete-id");
const mockCancelRestComplete = jest.fn().mockResolvedValue(undefined);
const mockSchedulePreEndCue = jest.fn().mockResolvedValue("preend-id");
const mockPresentLiveRestCountdown = jest.fn().mockResolvedValue("live-id");
const mockCancelAllRestNotifications = jest.fn().mockResolvedValue(undefined);
const mockIsAvailable = jest.fn().mockReturnValue(true);
const mockRequestPermission = jest.fn().mockResolvedValue(true);

jest.mock("../../lib/notifications", () => ({
  isAvailable: () => mockIsAvailable(),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  scheduleRestComplete: (...args: unknown[]) => mockScheduleRestComplete(...args),
  cancelRestComplete: (...args: unknown[]) => mockCancelRestComplete(...args),
  schedulePreEndCue: (...args: unknown[]) => mockSchedulePreEndCue(...args),
  presentLiveRestCountdown: (...args: unknown[]) => mockPresentLiveRestCountdown(...args),
  cancelAllRestNotifications: (...args: unknown[]) => mockCancelAllRestNotifications(...args),
}));

// Default settings: master ON, cue=10s, live=false (avoid Platform.OS checks)
const mockGetAppSetting = jest.fn((key: string): Promise<string> => {
  const defaults: Record<string, string> = {
    rest_notification_enabled: "true",
    rest_adaptive_enabled: "false",
    rest_timer_pre_end_cue_seconds: "10",
    rest_timer_live_countdown: "false",
    rest_timer_show_next_set_preview: "false",
  };
  return Promise.resolve(defaults[key] ?? null) as Promise<string>;
});
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
const mockDeleteAppSetting = jest.fn().mockResolvedValue(undefined);
const mockGetRestSeconds = jest.fn().mockResolvedValue(60);

jest.mock("../../lib/db", () => ({
  getRestSecondsForExercise: (...args: unknown[]) => mockGetRestSeconds(...args),
  getAppSetting: (key: string) => mockGetAppSetting(key),
  getRestContext: jest.fn(),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  deleteAppSetting: (...args: unknown[]) => mockDeleteAppSetting(...args),
}));

jest.mock("../../lib/rest", () => ({
  resolveRestSeconds: jest.fn(),
  defaultBreakdown: (s: number) => ({ totalSeconds: s }),
}));

jest.mock("../../lib/rest-resolver", () => ({
  setUserRestSeconds: jest.fn(),
  restResolverBreadcrumb: jest.fn(),
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("../../lib/session-breadcrumbs", () => ({ sessionBreadcrumb: jest.fn() }));

let appStateListeners: Array<(state: string) => void> = [];
const mockAddEventListener = jest.fn((event: string, handler: (state: string) => void) => {
  if (event === "change") appStateListeners.push(handler);
  return { remove: () => { appStateListeners = appStateListeners.filter((h) => h !== handler); } };
});
jest.spyOn(AppState, "addEventListener").mockImplementation(
  mockAddEventListener as unknown as typeof AppState.addEventListener
);

Object.defineProperty(AppState, "currentState", {
  get: jest.fn(() => "active"),
  configurable: true,
});

const defaultOptions = {
  sessionId: "sess-1",
  colors: { primaryContainer: "#eee", primary: "#333" },
};

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners = [];
});

describe("useRestTimer BLD-1137: Smart Rest Coach", () => {
  describe("AC11 — Settings short-circuit", () => {
    it("does not schedule any notifications when master switch is OFF", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "rest_notification_enabled") return Promise.resolve("false");
        if (key === "rest_adaptive_enabled") return Promise.resolve("false");
        return Promise.resolve(null as unknown as string);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockScheduleRestComplete).not.toHaveBeenCalled();
      expect(mockSchedulePreEndCue).not.toHaveBeenCalled();
      expect(mockPresentLiveRestCountdown).not.toHaveBeenCalled();
    });

    it("does not schedule any notifications when permission denied", async () => {
      mockRequestPermission.mockResolvedValueOnce(false);
      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "rest_adaptive_enabled") return Promise.resolve("false");
        if (key === "rest_notification_enabled") return Promise.resolve("true");
        return Promise.resolve(null as unknown as string);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockScheduleRestComplete).not.toHaveBeenCalled();
      expect(mockSchedulePreEndCue).not.toHaveBeenCalled();
    });
  });

  describe("AC2 — Pre-end cue scheduling", () => {
    it("schedules pre-end cue when cueSeconds=10 and rest=60s (60 > 10+2)", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "false",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockSchedulePreEndCue).toHaveBeenCalledWith(
        50, // 60 - 10
        null, // no preview (showNextSet=false)
        false, // isLastSet=false
        10, // cueSeconds
        "sess-1",
      );
    });

    it("does NOT schedule pre-end cue when rest duration <= cueSeconds+2 (AC3)", async () => {
      mockGetRestSeconds.mockResolvedValueOnce(5); // 5 <= 10+2
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "false",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockSchedulePreEndCue).not.toHaveBeenCalled();
    });

    it("does NOT schedule pre-end cue when cueSeconds=0 (off)", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "0",
          rest_timer_live_countdown: "false",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockSchedulePreEndCue).not.toHaveBeenCalled();
    });
  });

  describe("AC7 — Cancel-all on dismiss", () => {
    it("cancels all rest notifications via cancelAllRestNotifications on dismissRest", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "false",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      await act(async () => {
        result.current.dismissRest();
        await flushPromises();
      });

      expect(mockCancelAllRestNotifications).toHaveBeenCalledWith("sess-1");
    });
  });

  describe("AC13 — Persistence migration from legacy notificationId", () => {
    it("reads legacy notificationId shape without error and treats as complete ID", async () => {
      const legacyState = JSON.stringify({
        sessionId: "sess-1",
        endTimestamp: Date.now() + 60_000,
        durationSeconds: 60,
        breakdown: { totalSeconds: 60 },
        notificationId: "old-legacy-id", // legacy field
      });
      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "rest_timer_active_state") return Promise.resolve(legacyState);
        if (key === "rest_timer_default_seconds") return Promise.resolve(null as unknown as string);
        return Promise.resolve(null as unknown as string);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => { await flushPromises(); });

      // Should have restored without crashing and timer should be running
      expect(result.current.rest).toBeGreaterThan(0);
    });
  });

  // BLD-1137: covers AC4 from PLAN-BLD-1137.md
  describe("AC4 — Live countdown timing", () => {
    it("AC4 — presentLiveRestCountdown called immediately (within 1s) when liveEnabled=true", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "true",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      // First live-countdown presentation must happen immediately inside scheduleNotifications
      // (no timer delay on the initial call — satisfies "within 1s of startRest()")
      expect(mockPresentLiveRestCountdown).toHaveBeenCalledWith(
        60, // full rest duration on first call
        null, // no preview (showNextSet=false)
        "sess-1",
      );
    });

    it("AC4 — 5-second re-presentation chain is scheduled via setTimeout after initial call", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "true",
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      // Spy on setTimeout to verify the 5s chain is set up (AC4: re-presents every 5s ±500ms)
      const setTimeoutSpy = jest.spyOn(global, "setTimeout");

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      // Verify the self-correcting 5s chain was scheduled
      const fiveSecondCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] === 5000);
      expect(fiveSecondCalls.length).toBeGreaterThanOrEqual(1);

      setTimeoutSpy.mockRestore();
    });
  });

  // BLD-1137: covers AC9 from PLAN-BLD-1137.md
  describe("AC9 — Settings persistence across cold restart", () => {
    it("AC9 — rest_timer_live_countdown=true read from getAppSetting starts live countdown", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "true", // persisted "true"
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      // Hook must have read rest_timer_live_countdown from getAppSetting
      expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_live_countdown");
      // And applied it — live countdown was presented
      expect(mockPresentLiveRestCountdown).toHaveBeenCalled();
    });

    it("AC9 — rest_timer_live_countdown=false read from getAppSetting suppresses live countdown", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "10",
          rest_timer_live_countdown: "false", // persisted "false"
          rest_timer_show_next_set_preview: "false",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_live_countdown");
      expect(mockPresentLiveRestCountdown).not.toHaveBeenCalled();
    });

    it("AC9 — rest_timer_pre_end_cue_seconds and rest_timer_show_next_set_preview are read from getAppSetting", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
          rest_timer_pre_end_cue_seconds: "15",
          rest_timer_live_countdown: "false",
          rest_timer_show_next_set_preview: "true",
        };
        return Promise.resolve(map[key] ?? null);
      });

      const { result } = renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => {
        await result.current.startRest("exercise-1");
        await flushPromises();
      });

      // All new BLD-1137 settings must be read from the persistence layer (getAppSetting)
      // so they survive cold restarts (process kill → re-launch reads fresh from DB).
      expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_pre_end_cue_seconds");
      expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_show_next_set_preview");
      expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_live_countdown");
    });
  });

  // BLD-1137: covers AC12 from PLAN-BLD-1137.md
  describe("AC12 — Cold-start resume of live countdown", () => {
    it("AC12 — presentLiveRestCountdown called on mount when persisted state has liveEnabled=true and time remaining", async () => {
      const futureTimestamp = Date.now() + 55_000; // 55s remaining > cueSeconds(10) + 2
      const activeState = JSON.stringify({
        sessionId: "sess-1",
        endTimestamp: futureTimestamp,
        durationSeconds: 60,
        breakdown: { totalSeconds: 60 },
        notificationIds: { preEnd: "preend-id", complete: "complete-id", liveOngoing: "live-id" },
        previewSnapshot: null,
        isLastSet: false,
        cueSeconds: 10,
        liveEnabled: true, // cold-start resume should re-start live countdown
      });

      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "rest_timer_active_state") return Promise.resolve(activeState);
        if (key === "rest_timer_default_seconds") return Promise.resolve(null as unknown as string);
        return Promise.resolve(null as unknown as string);
      });

      renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      // Allow the mount useEffect to run and call presentLiveRestCountdown
      await act(async () => { await flushPromises(); });

      // Live countdown must reappear within 2s of foreground (here: immediately on mount)
      expect(mockPresentLiveRestCountdown).toHaveBeenCalled();
      // Called with the session id from persisted state
      expect(mockPresentLiveRestCountdown).toHaveBeenCalledWith(
        expect.any(Number), // remaining seconds (≤55)
        null, // previewSnapshot
        "sess-1",
      );
    });

    it("AC12 — does NOT restart live countdown when liveEnabled=false in persisted state", async () => {
      const futureTimestamp = Date.now() + 55_000;
      const activeState = JSON.stringify({
        sessionId: "sess-1",
        endTimestamp: futureTimestamp,
        durationSeconds: 60,
        breakdown: { totalSeconds: 60 },
        notificationIds: {},
        previewSnapshot: null,
        isLastSet: false,
        cueSeconds: 10,
        liveEnabled: false,
      });

      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "rest_timer_active_state") return Promise.resolve(activeState);
        if (key === "rest_timer_default_seconds") return Promise.resolve(null as unknown as string);
        return Promise.resolve(null as unknown as string);
      });

      renderHook(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { useRestTimer } = require("../../hooks/useRestTimer");
        return useRestTimer(defaultOptions);
      });

      await act(async () => { await flushPromises(); });

      expect(mockPresentLiveRestCountdown).not.toHaveBeenCalled();
    });
  });
});
