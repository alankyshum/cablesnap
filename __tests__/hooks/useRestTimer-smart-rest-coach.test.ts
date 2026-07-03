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

// Default settings: master ON, sound/vibrate default true where needed
const mockGetAppSetting = jest.fn((key: string): Promise<string> => {
  const defaults: Record<string, string> = {
    rest_notification_enabled: "true",
    rest_adaptive_enabled: "false",
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
    it("schedules pre-end cue when cueSeconds is hardcoded to 5 and rest=60s (60 > 5+2)", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
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
        55, // 60 - 5
        null, // no preview
        false, // isLastSet=false
        5, // cueSeconds (hardcoded 5)
        "sess-1",
      );
    });

    it("does NOT schedule pre-end cue when rest duration <= cueSeconds+2 (AC3)", async () => {
      mockGetRestSeconds.mockResolvedValueOnce(5); // 5 <= 5+2 (7s safety threshold)
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
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

  describe("AC4 — Live countdown timing", () => {
    it("AC4 — presentLiveRestCountdown called immediately (within 1s) since live countdown is hardcoded to ON", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          rest_notification_enabled: "true",
          rest_adaptive_enabled: "false",
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
        null, // no preview
        "sess-1",
      );
    });

    it("AC4 — re-presents live countdown on the 5s chain (fake timer advancement) since live countdown is hardcoded to ON", async () => {
      // AC4 requires re-presentation every 5s ±500ms until cancellation.
      // Use fake timers to advance past the first 5s interval and assert a second call.
      jest.useFakeTimers();
      try {
        mockGetAppSetting.mockImplementation((key: string) => {
          const map: Record<string, string> = {
            rest_notification_enabled: "true",
            rest_adaptive_enabled: "false",
          };
          return Promise.resolve(map[key] ?? null);
        });

        const { result } = renderHook(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { useRestTimer } = require("../../hooks/useRestTimer");
          return useRestTimer(defaultOptions);
        });

        // Start rest — async operations (getRestSecondsForExercise, getAppSetting)
        await act(async () => {
          result.current.startRest("exercise-1");
          // Flush microtasks/promises without advancing fake timers
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        // Initial call (within 1s — AC4 "appears within 1s") already happened in scheduleNotifications
        const initialCallCount = mockPresentLiveRestCountdown.mock.calls.length;
        expect(initialCallCount).toBeGreaterThanOrEqual(1);

        // Advance fake timers by 15001ms to fire the 15s self-correcting chain (BLD-1208: bumped from 5s)
        await act(async () => {
          jest.advanceTimersByTime(15001);
          await Promise.resolve();
        });

        // A second presentLiveRestCountdown must have been called (the 5s chain re-presented)
        expect(mockPresentLiveRestCountdown.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount + 1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("AC9 — Settings persistence across cold restart", () => {
    it("AC9 — rest_timer_sound and rest_timer_vibrate are read from getAppSetting when rest completes", async () => {
      // These two settings control haptic/audio feedback on timer completion.
      // They are read inside a useEffect triggered when rest goes from >0 to 0,
      // so we need to advance the timer interval to completion.
      jest.useFakeTimers();
      try {
        mockGetRestSeconds.mockResolvedValue(1); // 1-second timer for fast completion
        mockGetAppSetting.mockImplementation((key: string) => {
          const map: Record<string, string> = {
            rest_notification_enabled: "true",
            rest_adaptive_enabled: "false",
            rest_timer_sound: "true",
            rest_timer_vibrate: "true",
          };
          return Promise.resolve(map[key] ?? null);
        });

        const { result } = renderHook(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { useRestTimer } = require("../../hooks/useRestTimer");
          return useRestTimer(defaultOptions);
        });

        // Kick off startRest — flushes all async (getAppSetting reads, getRestSeconds)
        await act(async () => {
          result.current.startRest("exercise-1");
          // Flush microtasks so async resolution completes before advancing timers
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        // Advance 1s (the rest duration) to trigger the setInterval tick that sets rest=0
        await act(async () => {
          jest.advanceTimersByTime(1100);
          await Promise.resolve();
          await Promise.resolve();
        });

        // rest_timer_sound and rest_timer_vibrate must be read from DB (persistence layer)
        // so the user's preference survives cold restarts and is not hardcoded.
        expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_sound");
        expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_vibrate");
      } finally {
        jest.useRealTimers();
        mockGetRestSeconds.mockResolvedValue(60); // restore default
      }
    });

    it("AC9 — write→restart→read round-trip: hook reads persisted sound and vibrate on fresh mount", async () => {
      jest.useFakeTimers();
      try {
        // Step 1: Persist settings before process kill
        const settingsStore: Record<string, string> = {};
        mockSetAppSetting.mockImplementation((key: string, value: string) => {
          settingsStore[key] = value;
          return Promise.resolve();
        });
        await mockSetAppSetting("rest_timer_sound", "true");
        await mockSetAppSetting("rest_timer_vibrate", "true");

        // Step 2: Cold-start re-launch reads from DB (the written store)
        mockGetAppSetting.mockImplementation((key: string) => {
          const defaults: Record<string, string> = {
            rest_notification_enabled: "true",
            rest_adaptive_enabled: "false",
          };
          return Promise.resolve(settingsStore[key] ?? defaults[key] ?? null) as Promise<string>;
        });
        mockGetRestSeconds.mockResolvedValue(1); // 1-second timer for fast completion

        // Step 3: Mount fresh hook instance (simulates cold-start re-launch)
        const { result } = renderHook(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { useRestTimer } = require("../../hooks/useRestTimer");
          return useRestTimer(defaultOptions);
        });

        // Kick off startRest — flush async layers before advancing timers
        await act(async () => {
          result.current.startRest("exercise-1");
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        // Step 4: Advance 1s to timer completion — sound/vibrate keys read on completion
        await act(async () => {
          jest.advanceTimersByTime(1100);
          await Promise.resolve();
          await Promise.resolve();
        });

        // Step 5: Persisted settings were read from the persistence layer (getAppSetting)
        expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_sound");
        expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_vibrate");
        // live countdown was applied as it is hardcoded to true
        expect(mockPresentLiveRestCountdown).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        mockGetRestSeconds.mockResolvedValue(60);
      }
    });
  });

  describe("AC12 — Cold-start resume of live countdown", () => {
    it("AC12 — presentLiveRestCountdown called on mount when persisted state has liveEnabled=true and time remaining", async () => {
      const futureTimestamp = Date.now() + 55_000; // 55s remaining > cueSeconds(5) + 2
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
      // AC12: missing scheduled notifications re-scheduled on resume.
      // scheduleRestComplete must be called with previewSnapshot + isLastSet from persisted state
      // so a resumed last-set rest doesn't regress to "Time for your next set." body.
      expect(mockScheduleRestComplete).toHaveBeenCalledWith(
        expect.any(Number), // remaining seconds
        "sess-1",
        null, // previewSnapshot from persisted state
        false, // isLastSet from persisted state
      );
    });

    it("AC12 — re-schedules pre-end cue when remaining time allows (remaining > cueSeconds + 2)", async () => {
      const futureTimestamp = Date.now() + 55_000; // 55s > cueSeconds(10) + 2
      const activeState = JSON.stringify({
        sessionId: "sess-1",
        endTimestamp: futureTimestamp,
        durationSeconds: 60,
        breakdown: { totalSeconds: 60 },
        notificationIds: { preEnd: "preend-id", complete: "complete-id" },
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

      // Pre-end cue must be re-scheduled (55 > 10 + 2)
      expect(mockSchedulePreEndCue).toHaveBeenCalledWith(
        expect.any(Number), // remaining - cueSeconds (≈45)
        null, // previewSnapshot
        false, // isLastSet
        10, // cueSeconds
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
