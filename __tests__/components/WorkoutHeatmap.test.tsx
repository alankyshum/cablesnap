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
});
