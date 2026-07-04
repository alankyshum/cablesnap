import React from "react";
import { act, fireEvent, waitFor, render } from "@testing-library/react-native";
import SessionPreferencesCard from "../../../components/settings/SessionPreferencesCard";
import type { ThemeColors } from "@/hooks/useThemeColors";

// Mocks must come BEFORE the component import/usage in some test setups.
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

const mockMarkRpeCaptureNudgeSeen = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db/achievements", () => ({
  hasSeenRpeCaptureNudge: jest.fn().mockResolvedValue(false),
  markRpeCaptureNudgeSeen: () => mockMarkRpeCaptureNudgeSeen(),
}));

const mockGet = jest.fn();
const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGet(...args),
  setAppSetting: (...args: unknown[]) => mockSet(...args),
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
  primary: "#3B82F6",
} as unknown as ThemeColors;

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

function setStored(values: Partial<Record<string, string | null>>) {
  mockGet.mockImplementation((key: string) =>
    Promise.resolve(key in values ? values[key] ?? null : null),
  );
}

describe("SessionPreferencesCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setStored({});
  });

  it("toggling captureRpe ON calls markRpeCaptureNudgeSeen and updates setting", async () => {
    setStored({ "session.captureRpe": "false" });
    const { getByTestId } = render(
      <SessionPreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as React.ComponentProps<typeof SessionPreferencesCard>["toast"]}
      />
    );

    await waitFor(() => getByTestId("pref-capture-rpe-switch"));

    await act(async () => {
      fireEvent(getByTestId("pref-capture-rpe-switch"), "valueChange", true);
    });

    await waitFor(() => {
      expect(mockMarkRpeCaptureNudgeSeen).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith("session.captureRpe", "true");
    });
  });

  it("toggling captureRpe OFF does NOT call markRpeCaptureNudgeSeen", async () => {
    setStored({ "session.captureRpe": "true" });
    const { getByTestId } = render(
      <SessionPreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as React.ComponentProps<typeof SessionPreferencesCard>["toast"]}
      />
    );

    await waitFor(() => getByTestId("pref-capture-rpe-switch"));

    await act(async () => {
      fireEvent(getByTestId("pref-capture-rpe-switch"), "valueChange", false);
    });

    expect(mockMarkRpeCaptureNudgeSeen).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith("session.captureRpe", "false");
  });

  it("intensity scale control reflects selected intensity scale", async () => {
    setStored({ "session.captureRpe": "true", "session.intensityMode": "rir" });
    const { getByTestId } = render(
      <SessionPreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as React.ComponentProps<typeof SessionPreferencesCard>["toast"]}
      />
    );

    await waitFor(() => getByTestId("pref-intensity-scale-control"));

    const rpeRadio = getByTestId("pref-intensity-scale-rpe");
    const rirRadio = getByTestId("pref-intensity-scale-rir");

    await waitFor(() => {
      expect(rirRadio.props.accessibilityState.selected).toBe(true);
    });

    expect(rpeRadio.props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(rpeRadio);
    });

    expect(mockSet).toHaveBeenCalledWith("session.intensityMode", "rpe");
  });

  it("toggles pulley pin position tracking", async () => {
    setStored({ "session.pulleyPinTracking": "true" });
    const { getByLabelText } = render(
      <SessionPreferencesCard
        colors={TEST_COLORS}
        toast={mockToast as unknown as React.ComponentProps<typeof SessionPreferencesCard>["toast"]}
      />
    );

    const toggle = await waitFor(() => getByLabelText("Track pulley pin position"));

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    expect(mockSet).toHaveBeenCalledWith("session.pulleyPinTracking", "false");
  });
});
