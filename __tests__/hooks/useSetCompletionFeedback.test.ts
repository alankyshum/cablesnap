/**
 * BLD-559 AC-1..4, AC-8/9: useSetCompletionFeedback.fire() semantics.
 *
 * Uses it.each for the shared-structure scenarios per plan §Acceptance
 * Criteria (QD-B2 test-line ceiling compliance).
 */

const mockHaptic = jest.fn();
const mockNotification = jest.fn();
const mockPlay = jest.fn();
const mockSetEnabled = jest.fn();

jest.mock("expo-haptics", () => ({
  impactAsync: (...args: unknown[]) => { mockHaptic(...args); return Promise.resolve(); },
  notificationAsync: (...args: unknown[]) => { mockNotification(...args); return Promise.resolve(); },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: (...args: unknown[]) => { mockPlay(...args); return Promise.resolve(); },
  setEnabled: (...args: unknown[]) => mockSetEnabled(...args),
}));

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock("@/lib/db", () => ({
  getAppSetting: (k: string) => mockGet(k),
  setAppSetting: (k: string, v: string) => mockSet(k, v),
}));

import { renderHook, act } from "@testing-library/react-native";
import {
  useSetCompletionFeedback,
  setSetCompletionHaptic,
  setSetCompletionAudio,
  __resetSetCompletionFeedbackForTests,
} from "../../hooks/useSetCompletionFeedback";

beforeEach(() => {
  jest.clearAllMocks();
  __resetSetCompletionFeedbackForTests();
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue(undefined);
});

describe("useSetCompletionFeedback.fire() — AC-1..4, AC-5 (single haptic)", () => {
  type Case = {
    name: string;
    haptic: boolean;
    audio: boolean;
    expectHaptic: number;
    expectAudio: number;
  };
  const cases: Case[] = [
    { name: "haptic on, audio off", haptic: true, audio: false, expectHaptic: 1, expectAudio: 0 },
    { name: "haptic off, audio on", haptic: false, audio: true, expectHaptic: 0, expectAudio: 1 },
    { name: "both on", haptic: true, audio: true, expectHaptic: 1, expectAudio: 1 },
    { name: "both off", haptic: false, audio: false, expectHaptic: 0, expectAudio: 0 },
  ];

  it.each(cases)(
    "$name → haptic=$expectHaptic audio=$expectAudio, exactly once, synchronously",
    async ({ haptic, audio, expectHaptic, expectAudio }) => {
      await setSetCompletionHaptic(haptic);
      await setSetCompletionAudio(audio);

      const { result } = renderHook(() => useSetCompletionFeedback());

      act(() => {
        result.current.fire();
      });

      expect(mockHaptic).toHaveBeenCalledTimes(expectHaptic);
      if (expectHaptic) {
        expect(mockHaptic).toHaveBeenCalledWith("medium");
      }
      expect(mockNotification).not.toHaveBeenCalled();
      expect(mockPlay).toHaveBeenCalledTimes(expectAudio);
      if (expectAudio) {
        expect(mockPlay).toHaveBeenCalledWith("set_complete");
      }
    }
  );

  it("fire() is synchronous — does not return a Promise", () => {
    const { result } = renderHook(() => useSetCompletionFeedback());
    const ret = result.current.fire();
    expect(ret).toBeUndefined();
  });
});

describe("useSetCompletionFeedback — AC-8/9 (live toggle from Settings)", () => {
  it("subsequent fire() reflects updated settings with no restart", async () => {
    const { result } = renderHook(() => useSetCompletionFeedback());

    // Start with plan defaults: haptic on, audio off.
    act(() => { result.current.fire(); });
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledTimes(0);

    // User toggles both from Settings screen.
    await setSetCompletionHaptic(false);
    await setSetCompletionAudio(true);

    act(() => { result.current.fire(); });
    // Haptic count unchanged (still 1), audio now fired.
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it("setSetCompletionAudio mirrors to lib/audio setEnabled('feedback', val)", async () => {
    await setSetCompletionAudio(true);
    expect(mockSetEnabled).toHaveBeenCalledWith("feedback", true);
    await setSetCompletionAudio(false);
    expect(mockSetEnabled).toHaveBeenCalledWith("feedback", false);
  });
});

describe("useSetCompletionFeedback — hydration on mount", () => {
  it("reads both setting keys on mount (does not fire anything)", async () => {
    renderHook(() => useSetCompletionFeedback());
    // Allow the hydrate() microtask to run.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockGet).toHaveBeenCalledWith("feedback.setComplete.haptic");
    expect(mockGet).toHaveBeenCalledWith("feedback.setComplete.audio");
    expect(mockHaptic).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
