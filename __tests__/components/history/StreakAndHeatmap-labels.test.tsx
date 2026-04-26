import React from "react";
import StreakAndHeatmap from "../../../components/history/StreakAndHeatmap";
import { renderScreen } from "../../helpers/render";
import type { ThemeColors } from "@/hooks/useThemeColors";

const colors = {
  primary: "#000",
  surface: "#fff",
  onSurface: "#000",
  onSurfaceVariant: "#666",
  onBackground: "#000",
  background: "#fff",
  error: "#f00",
} as unknown as ThemeColors;

describe("StreakAndHeatmap stat labels (BLD-663)", () => {
  function renderStats() {
    return renderScreen(
      <StreakAndHeatmap
        colors={colors}
        currentStreak={3}
        longestStreak={7}
        totalWorkouts={42}
        heatmapData={new Map()}
        heatmapLoading={false}
        heatmapError={false}
        heatmapExpanded={false}
        setHeatmapExpanded={() => {}}
        onDayPress={() => {}}
      />,
    );
  }

  it("uses self-describing labels (current / longest / workouts) instead of two ambiguous 'weeks' labels", () => {
    const { getByText, queryAllByText } = renderStats();
    expect(getByText("current")).toBeTruthy();
    expect(getByText("longest")).toBeTruthy();
    expect(getByText("workouts")).toBeTruthy();
    // Regression guard: the streak card must not render two adjacent "weeks" labels.
    expect(queryAllByText("weeks").length).toBe(0);
    expect(queryAllByText("total").length).toBe(0);
  });

  it("preserves accessibilityLabel with units for screen readers", () => {
    const { getByLabelText } = renderStats();
    expect(getByLabelText("Current streak: 3 weeks")).toBeTruthy();
    expect(getByLabelText("Longest streak: 7 weeks")).toBeTruthy();
    expect(getByLabelText("Total workouts: 42")).toBeTruthy();
  });
});
