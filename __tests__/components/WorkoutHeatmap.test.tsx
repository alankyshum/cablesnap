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

  it("renders unambiguous weekday labels (BLD-686: GitHub-style Mon/Wed/Fri only)", () => {
    const { getAllByText, queryAllByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    // Only Mon/Wed/Fri rows show labels — Tue/Thu/Sat/Sun are blank to avoid T/T and S/S collisions.
    expect(getAllByText("Mon").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Wed").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Fri").length).toBeGreaterThanOrEqual(1);
    // Regression guard: never reintroduce ambiguous single-letter labels.
    expect(queryAllByText("T").length).toBe(0);
    expect(queryAllByText("S").length).toBe(0);
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
    // BLD-732: numeric labels are intentionally hidden from a11y (the
    // parent Pressable already announces the count via accessibilityLabel).
    // They exist purely as a visual non-color cue, so we must opt into
    // hidden elements to assert they render. Legend shows '3+' and the
    // body cell with count 3 also shows '3+'. (BLD-763.)
    expect(
      getAllByText("3+", { includeHiddenElements: true }).length
    ).toBeGreaterThanOrEqual(2);
  });

  // BLD-732: numeric labels are the non-color cue. Each step must render
  // its count inside the cell so deuteranopia/protanopia users can still
  // distinguish 1 / 2 / 3+. The labels are marked
  // `accessibilityElementsHidden` because the parent Pressable announces
  // the count via accessibilityLabel — so the queries below must opt into
  // hidden elements to find them. (BLD-763.)
  it("renders numeric '1' label for cells with exactly 1 workout (BLD-732)", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Legend shows '1' and the body cell with count 1 also shows '1'.
    expect(
      getAllByText("1", { includeHiddenElements: true }).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders numeric '2' label for cells with exactly 2 workouts (BLD-732)", () => {
    const data = new Map([["2026-04-14", 2]]);
    const { getAllByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Legend shows '2' and the body cell with count 2 also shows '2'.
    expect(
      getAllByText("2", { includeHiddenElements: true }).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("does not render a numeric label for cells with zero workouts (BLD-732)", () => {
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    // Step-0 cells stay unlabelled — the empty fill is the cue.
    // Use `includeHiddenElements` because the legend's labels are hidden
    // from a11y (BLD-763); we need to assert no '0' exists anywhere,
    // visible OR hidden.
    expect(queryByText("0", { includeHiddenElements: true })).toBeNull();
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
