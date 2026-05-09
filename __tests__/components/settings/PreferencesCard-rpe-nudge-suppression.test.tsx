/**
 * BLD-1111: PreferencesCard AC9 — turning captureRpe ON via Settings also
 * writes session.captureRpe.nudgeShown="1" so the banner never renders.
 *
 * (a) Toggling captureRpe ON calls markRpeCaptureNudgeSeen.
 * (b) Toggling captureRpe OFF does NOT call markRpeCaptureNudgeSeen.
 */

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";
import PreferencesCard from "../../../components/settings/PreferencesCard";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("../../../lib/audio", () => ({
  setEnabled: jest.fn(),
}));
jest.mock("../../../hooks/useSetCompletionFeedback", () => ({
  setSetCompletionHaptic: jest.fn().mockResolvedValue(undefined),
  setSetCompletionAudio: jest.fn().mockResolvedValue(undefined),
}));

const mockMarkRpeCaptureNudgeSeen = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db/achievements", () => ({
  hasSeenRpeCaptureNudge: jest.fn().mockResolvedValue(false),
  markRpeCaptureNudgeSeen: () => mockMarkRpeCaptureNudgeSeen(),
}));

const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db", () => ({
  getAppSetting: jest.fn().mockImplementation((key: string) => {
    if (key === "session.captureRpe") return Promise.resolve("false");
    return Promise.resolve(null);
  }),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}));

const TEST_COLORS = {
  onSurface: "#000",
  primaryContainer: "#eee",
  onPrimaryContainer: "#000",
  secondaryContainer: "#ddd",
  onSecondaryContainer: "#000",
  tertiaryContainer: "#ccc",
  onTertiaryContainer: "#000",
  outlineVariant: "#bbb",
  surfaceVariant: "#aaa",
  onSurfaceVariant: "#555",
  surface: "#fff",
  outline: "#888",
} as Parameters<typeof PreferencesCard>[0]["colors"];

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

describe("PreferencesCard RPE nudge suppression (AC9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("(a) toggling captureRpe ON calls markRpeCaptureNudgeSeen", async () => {
    const { getByTestId } = renderScreen(
      <PreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as ReturnType<typeof import("../../../components/ui/bna-toast").useToast>}
        soundEnabled={false}
        setSoundEnabled={jest.fn()}
      />
    );

    // Wait for hydration
    await waitFor(() => getByTestId("pref-capture-rpe-switch"));

    await act(async () => {
      fireEvent(getByTestId("pref-capture-rpe-switch"), "valueChange", true);
    });

    await waitFor(() => {
      expect(mockMarkRpeCaptureNudgeSeen).toHaveBeenCalledTimes(1);
    });
  });

  it("(b) toggling captureRpe OFF does NOT call markRpeCaptureNudgeSeen", async () => {
    const { getByTestId } = renderScreen(
      <PreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as ReturnType<typeof import("../../../components/ui/bna-toast").useToast>}
        soundEnabled={false}
        setSoundEnabled={jest.fn()}
      />
    );

    await waitFor(() => getByTestId("pref-capture-rpe-switch"));

    await act(async () => {
      fireEvent(getByTestId("pref-capture-rpe-switch"), "valueChange", false);
    });

    expect(mockMarkRpeCaptureNudgeSeen).not.toHaveBeenCalled();
  });
});
