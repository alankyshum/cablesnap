import React from "react";
import { fireEvent } from "@testing-library/react-native";
import WorkoutHeatmap from "../../components/WorkoutHeatmap";
import { renderScreen } from "../helpers/render";

describe("WorkoutHeatmap", () => {
  const emptyData = new Map<string, number>();

  it("renders without crashing with empty data", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Less")).toBeTruthy();
    expect(getByText("More")).toBeTruthy();
  });

  it("shows empty state message when no workouts", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Start working out to see your consistency here!")).toBeTruthy();
  });

  it("does not show empty state when data exists", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });

  it("renders day labels", () => {
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getAllByText("M").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("S").length).toBeGreaterThanOrEqual(1);
  });

  it("renders accessibility labels on cells", () => {
    const data = new Map([["2026-04-14", 2]]);
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Should have accessibility labels with workout counts
    const cell = getByLabelText(/April 14, 2 workouts/);
    expect(cell).toBeTruthy();
  });

  it("has accessible role on container", () => {
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByLabelText("Workout heatmap grid")).toBeTruthy();
  });

  it("calls onDayPress when a cell is pressed", () => {
    const onPress = jest.fn();
    const data = new Map([["2026-04-14", 1]]);
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} onDayPress={onPress} />
    );
    const cell = getByLabelText(/April 14/);
    fireEvent.press(cell);
    expect(onPress).toHaveBeenCalledWith("2026-04-14");
  });

  it("renders color legend", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Less")).toBeTruthy();
    expect(getByText("More")).toBeTruthy();
  });

  it("renders 3+ text for cells with 3 or more workouts", () => {
    const data = new Map([["2026-04-14", 3]]);
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Legend shows 3+ and the cell with count 3 also shows 3+
    expect(getAllByText("3+").length).toBeGreaterThanOrEqual(2);
  });

  // BLD-732: numeric labels are the non-color cue. Each step must render
  // its count inside the cell so deuteranopia/protanopia users can still
  // distinguish 1 / 2 / 3+.
  it("renders numeric '1' label for cells with exactly 1 workout (BLD-732)", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Legend shows '1' and the body cell with count 1 also shows '1'.
    expect(getAllByText("1").length).toBeGreaterThanOrEqual(2);
  });

  it("renders numeric '2' label for cells with exactly 2 workouts (BLD-732)", () => {
    const data = new Map([["2026-04-14", 2]]);
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Legend shows '2' and the body cell with count 2 also shows '2'.
    expect(getAllByText("2").length).toBeGreaterThanOrEqual(2);
  });

  it("does not render a numeric label for cells with zero workouts (BLD-732)", () => {
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    // Step-0 cells stay unlabelled — the empty fill is the cue.
    expect(queryByText("0")).toBeNull();
  });

  it("legend exposes a screen-reader summary of all four steps (BLD-732)", () => {
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(
      getByLabelText("Heatmap legend: 0, 1, 2, and 3 or more workouts")
    ).toBeTruthy();
  });

  // BLD-662: when totalAllTime > 0 but the visible window is empty, the
  // copy must NOT contradict the stat card ("X total" + "start working out").
  it("uses 'no workouts in last N weeks' copy when totalAllTime > 0 and data empty", () => {
    const { getByText, queryByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} totalAllTime={5} weeks={16} />
    );
    expect(getByText("No completed workouts in the last 16 weeks")).toBeTruthy();
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });

  it("uses 'start working out' copy when totalAllTime is 0 (true new user)", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} totalAllTime={0} />
    );
    expect(getByText("Start working out to see your consistency here!")).toBeTruthy();
  });

  it("does not show empty state when data has workouts (regardless of totalAllTime)", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={data} totalAllTime={5} />
    );
    expect(queryByText(/No completed workouts/)).toBeNull();
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });
});
