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

describe("StreakAndHeatmap stat labels (BLD-663, BLD-685)", () => {
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

  it("uses self-describing streak-noun labels (BLD-685: 'current streak' / 'longest streak' / 'workouts')", () => {
    const { getByText, queryAllByText } = renderStats();
    expect(getByText("current streak")).toBeTruthy();
    expect(getByText("longest streak")).toBeTruthy();
    expect(getByText("workouts")).toBeTruthy();
    // Regression guards: never regress to BLD-663 ("weeks"/"total") or to bare adjectives without the "streak" noun (BLD-685).
    expect(queryAllByText("weeks").length).toBe(0);
    expect(queryAllByText("total").length).toBe(0);
    expect(queryAllByText("current").length).toBe(0);
    expect(queryAllByText("longest").length).toBe(0);
  });

  it("preserves accessibilityLabel with units for screen readers", () => {
    const { getByLabelText } = renderStats();
    expect(getByLabelText("Current streak: 3 weeks")).toBeTruthy();
    expect(getByLabelText("Longest streak: 7 weeks")).toBeTruthy();
    expect(getByLabelText("Total workouts: 42")).toBeTruthy();
  });
});
