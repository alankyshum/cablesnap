import React from "react";
import { render } from "@testing-library/react-native";
import type { MuscleRecoveryStatus } from "../../lib/db/recovery";

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, []);
    },
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("react-native-body-highlighter", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: ({ side }: Record<string, unknown>) => <View testID={`body-${side}`} />,
  };
});
jest.mock("../../hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));
jest.mock("../../hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    card: "#f5f5f5",
    primary: "#6200ee",
    onBackground: "#000",
    onSurface: "#222",
    onSurfaceVariant: "#666",
    onPrimary: "#fff",
  }),
}));
jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

import { RecoveryHeatmap } from "../../components/home/RecoveryHeatmap";

import type { useThemeColors } from "../../hooks/useThemeColors";

const mockColors = {
  background: "#fff",
  card: "#f5f5f5",
  primary: "#6200ee",
  onBackground: "#000",
  onSurface: "#222",
  onSurfaceVariant: "#666",
  onPrimary: "#fff",
} as unknown as ReturnType<typeof useThemeColors>;

function makeStatus(overrides: Partial<MuscleRecoveryStatus>[]): MuscleRecoveryStatus[] {
  const base: MuscleRecoveryStatus[] = [
    { muscle: "chest", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "back", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "shoulders", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "biceps", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "triceps", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "quads", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "hamstrings", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "glutes", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "calves", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "core", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "forearms", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "traps", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
    { muscle: "lats", lastTrainedAt: null, hoursAgo: null, status: "no_data" },
  ];
  for (const o of overrides) {
    const idx = base.findIndex((s) => s.muscle === o.muscle);
    if (idx >= 0) base[idx] = { ...base[idx], ...o };
  }
  return base;
}

describe("RecoveryHeatmap", () => {
  it("shows empty state when no workout history", async () => {
    const statuses = makeStatus([]);
    const { findByText } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    expect(await findByText("Complete a workout to see recovery status")).toBeTruthy();
  });

  it("shows header with Muscle Recovery text", async () => {
    const statuses = makeStatus([]);
    const { findByText } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    expect(await findByText("Muscle Recovery")).toBeTruthy();
  });

  it("shows ready muscles when recovery status is recovered", async () => {
    const statuses = makeStatus([
      { muscle: "chest", lastTrainedAt: Date.now() - 72 * 3600000, hoursAgo: 72, status: "recovered" },
    ]);
    const { findByText } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    expect(await findByText(/Ready/)).toBeTruthy();
  });

  it("shows recovering muscles when status is fatigued", async () => {
    const statuses = makeStatus([
      { muscle: "quads", lastTrainedAt: Date.now() - 12 * 3600000, hoursAgo: 12, status: "fatigued" },
    ]);
    const { findByText } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    expect(await findByText(/Recovering/)).toBeTruthy();
  });

  it("does not show empty state when data exists", async () => {
    const statuses = makeStatus([
      { muscle: "chest", lastTrainedAt: Date.now() - 72 * 3600000, hoursAgo: 72, status: "recovered" },
    ]);
    const { queryByText } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(queryByText("Complete a workout to see recovery status")).toBeNull();
  });

  it("has accessible collapse button", async () => {
    const statuses = makeStatus([]);
    const { findByRole } = render(
      <RecoveryHeatmap recoveryStatus={statuses} colors={mockColors} />
    );
    const button = await findByRole("button");
    expect(button).toBeTruthy();
  });
});
