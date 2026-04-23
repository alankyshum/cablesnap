/**
 * Regression test for BLD-531: the "Edit adaptive rules…" button inside
 * RestBreakdownSheet is wired by SessionHeaderToolbar to navigate to the
 * Settings tab. This was missing in the first implementation pass and flagged
 * as a ship-blocker by QD + UX + reviewer.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SessionHeaderToolbar } from "../../../components/session/SessionHeaderToolbar";
import type { RestBreakdown } from "../../../lib/rest";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    surface: "#fffbfe",
    surfaceVariant: "#e7e0ec",
    secondary: "#625b71",
    outline: "#79747e",
    shadow: "#000000",
    background: "#fffbfe",
  }),
}));

jest.mock("../../../lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../lib/format", () => ({
  formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  formatTimeRemaining: () => null,
}));

const adaptiveBreakdown: RestBreakdown = {
  totalSeconds: 210,
  baseSeconds: 90,
  factors: [
    { label: "Heavy", multiplier: 1.3, deltaSeconds: 27 },
    { label: "RPE 9", multiplier: 1.15, deltaSeconds: 18 },
  ],
  isDefault: false,
  reasonShort: "Heavy · RPE 9",
  reasonAccessible: "Heavy set at RPE 9",
};

describe("SessionHeaderToolbar — Edit adaptive rules wiring", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the 'Edit adaptive rules…' control from the breakdown sheet", () => {
    const { getByLabelText } = render(
      <SessionHeaderToolbar
        rest={180}
        elapsed={300}
        breakdown={adaptiveBreakdown}
        onStartRest={jest.fn()}
        onDismissRest={jest.fn()}
        onOpenToolbox={jest.fn()}
      />,
    );
    expect(getByLabelText("Edit adaptive rest timer rules")).toBeTruthy();
  });

  it("navigates to the Settings tab when 'Edit adaptive rules…' is pressed", () => {
    const { getByLabelText } = render(
      <SessionHeaderToolbar
        rest={180}
        elapsed={300}
        breakdown={adaptiveBreakdown}
        onStartRest={jest.fn()}
        onDismissRest={jest.fn()}
        onOpenToolbox={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText("Edit adaptive rest timer rules"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/settings");
  });

  it("does not render the 'Edit adaptive rules…' control when no breakdown is provided", () => {
    const { queryByLabelText } = render(
      <SessionHeaderToolbar
        rest={180}
        elapsed={300}
        onStartRest={jest.fn()}
        onDismissRest={jest.fn()}
        onOpenToolbox={jest.fn()}
      />,
    );
    expect(queryByLabelText("Edit adaptive rest timer rules")).toBeNull();
  });
});
