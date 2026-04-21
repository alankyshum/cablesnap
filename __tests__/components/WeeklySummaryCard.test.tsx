import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("../../hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));
jest.mock("../../hooks/useColor", () => ({
  useColor: (name: string) => {
    const map: Record<string, string> = { green: "#10B981", red: "#EF4444" };
    return map[name] ?? "#000";
  },
}));

import WeeklySummaryCard from "../../components/home/WeeklySummaryCard";
import type { ThemeColors } from "../../hooks/useThemeColors";

const mockColors: Partial<ThemeColors> = {
  surface: "#F3F4F6",
  onSurface: "#1A2138",
  onSurfaceVariant: "#6B7280",
  onBackground: "#1A2138",
  error: "#EF4444",
};

describe("WeeklySummaryCard", () => {
  it("renders volume and duration when workouts exist", () => {
    const { getByText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={12450}
        previousWeekVolume={11500}
        totalDurationSeconds={13500}
        sessionCount={3}
        unitSystem="kg"
      />,
    );

    expect(getByText("This Week")).toBeTruthy();
    expect(getByText(/12,450/)).toBeTruthy();
    expect(getByText(/3h 45m this week/)).toBeTruthy();
  });

  it("shows positive delta with green arrow when volume increased", () => {
    const { getByText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={11500}
        previousWeekVolume={10000}
        totalDurationSeconds={7200}
        sessionCount={2}
        unitSystem="kg"
      />,
    );

    expect(getByText("↑15%")).toBeTruthy();
  });

  it("shows negative delta with red arrow when volume decreased", () => {
    const { getByText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={8000}
        previousWeekVolume={10000}
        totalDurationSeconds={5400}
        sessionCount={2}
        unitSystem="kg"
      />,
    );

    expect(getByText("↓20%")).toBeTruthy();
  });

  it("hides delta when no previous week data", () => {
    const { queryByText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={5000}
        previousWeekVolume={null}
        totalDurationSeconds={3600}
        sessionCount={1}
        unitSystem="kg"
      />,
    );

    expect(queryByText(/↑/)).toBeNull();
    expect(queryByText(/↓/)).toBeNull();
  });

  it("renders empty state when no workouts this week", () => {
    const { getByText, queryByText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={0}
        previousWeekVolume={null}
        totalDurationSeconds={0}
        sessionCount={0}
        unitSystem="kg"
      />,
    );

    expect(getByText("No training data yet")).toBeTruthy();
    expect(queryByText(/this week/)).toBeNull();
  });

  it("has correct accessibility label with all metrics", () => {
    const { getByLabelText } = render(
      <WeeklySummaryCard
        colors={mockColors as ThemeColors}
        totalVolume={12450}
        previousWeekVolume={11500}
        totalDurationSeconds={13500}
        sessionCount={3}
        unitSystem="kg"
      />,
    );

    const card = getByLabelText(/This week.*kilograms.*total volume.*up.*3h 45m/);
    expect(card).toBeTruthy();
  });
});
