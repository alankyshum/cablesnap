import React from "react";
import { render } from "@testing-library/react-native";
import { ExerciseDrawerStats } from "../../../components/session/ExerciseDrawerStats";

jest.mock("../../../hooks/useExerciseDrawerStats", () => ({
  useExerciseDrawerStats: jest.fn(),
}));

jest.mock("../../../hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6750A4",
    onPrimary: "#FFFFFF",
    onSurface: "#1C1B1F",
    onSurfaceVariant: "#49454F",
    surfaceVariant: "#E7E0EC",
    outlineVariant: "#CAC4D0",
    surface: "#FFFBFE",
  }),
}));

const { useExerciseDrawerStats } = require("../../../hooks/useExerciseDrawerStats");

describe("ExerciseDrawerStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading placeholders when loading", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: null,
      bestSet: null,
      lastSession: null,
      loading: true,
      error: false,
    });

    const { getByText, getAllByText } = render(
      <ExerciseDrawerStats exerciseId="ex-1" unit="kg" />
    );

    expect(getByText("YOUR STATS")).toBeTruthy();
    expect(getAllByText("—").length).toBe(3);
  });

  it("renders empty state when exercise has no history", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: { total_sessions: 0, max_weight: null, max_reps: null, est_1rm: null, max_volume: null, is_bodyweight: false, max_duration: null },
      bestSet: null,
      lastSession: null,
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-1" unit="kg" />
    );

    expect(getByText(/No history yet/)).toBeTruthy();
  });

  it("renders stats with weight data in correct unit and last session", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: {
        max_weight: 105,
        max_reps: 12,
        max_volume: 1525,
        est_1rm: 121.3,
        total_sessions: 23,
        is_bodyweight: false,
        max_duration: null,
      },
      bestSet: { weight: 105, reps: 5 },
      lastSession: {
        session_id: "s1",
        session_name: "Push Day",
        started_at: new Date("2026-04-17").getTime(),
        max_weight: 102.5,
        max_reps: 6,
        total_reps: 18,
        set_count: 3,
        volume: 1525,
        avg_rpe: 8.5,
      },
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-1" unit="kg" />
    );

    expect(getByText("105kg×5")).toBeTruthy();
    expect(getByText("121.3kg")).toBeTruthy();
    expect(getByText("23")).toBeTruthy();
    expect(getByText(/102\.5kg × 6/)).toBeTruthy();
    expect(getByText(/3 sets/)).toBeTruthy();
  });

  it("renders bodyweight exercise stats with reps instead of weight", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: {
        max_weight: null,
        max_reps: 25,
        max_volume: null,
        est_1rm: null,
        total_sessions: 10,
        is_bodyweight: true,
        max_duration: null,
      },
      bestSet: null,
      lastSession: {
        session_id: "s2",
        session_name: "Calisthenics",
        started_at: new Date("2026-04-16").getTime(),
        max_weight: 0,
        max_reps: 20,
        total_reps: 60,
        set_count: 3,
        volume: 0,
        avg_rpe: null,
      },
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-2" unit="kg" />
    );

    expect(getByText("25 reps")).toBeTruthy();
    expect(getByText("10")).toBeTruthy();
    expect(getByText(/20 reps/)).toBeTruthy();
  });

  it("displays weighted-bodyweight best as modifier prefix × reps (BLD-541)", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: {
        max_weight: 0,
        max_reps: 8,
        max_volume: null,
        est_1rm: null,
        total_sessions: 12,
        is_bodyweight: true,
        max_duration: null,
        best_added_kg: 20,
        best_assisted_kg: null,
      },
      bestSet: null,
      bestBodyweightSet: { modifier_kg: 20, reps: 5 },
      lastSession: {
        session_id: "s-bw",
        session_name: "Pull",
        started_at: new Date("2026-04-20").getTime(),
        max_weight: 0,
        max_reps: 8,
        total_reps: 24,
        set_count: 3,
        volume: 0,
        avg_rpe: null,
        max_modifier: 20,
      },
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-bw-1" unit="kg" />
    );

    expect(getByText(/\+20 kg × 5/)).toBeTruthy();
    expect(getByText(/\+20 kg × 8/)).toBeTruthy();
  });

  it("displays assisted bodyweight last session with signed minus sign", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: {
        max_weight: 0,
        max_reps: 10,
        max_volume: null,
        est_1rm: null,
        total_sessions: 4,
        is_bodyweight: true,
        max_duration: null,
        best_added_kg: null,
        best_assisted_kg: -15,
      },
      bestSet: null,
      bestBodyweightSet: null,
      lastSession: {
        session_id: "s-assist",
        session_name: "Pull-ups",
        started_at: new Date("2026-04-20").getTime(),
        max_weight: 0,
        max_reps: 10,
        total_reps: 30,
        set_count: 3,
        volume: 0,
        avg_rpe: null,
        max_modifier: -15,
      },
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-bw-2" unit="kg" />
    );

    expect(getByText(/Assist\s*\u221215 kg × 10/)).toBeTruthy();
  });

  it("displays weights in lb when unit is lb", () => {
    useExerciseDrawerStats.mockReturnValue({
      records: {
        max_weight: 100,
        max_reps: 5,
        max_volume: 500,
        est_1rm: 116.7,
        total_sessions: 5,
        is_bodyweight: false,
        max_duration: null,
      },
      bestSet: { weight: 100, reps: 5 },
      lastSession: null,
      loading: false,
      error: false,
    });

    const { getByText } = render(
      <ExerciseDrawerStats exerciseId="ex-3" unit="lb" />
    );

    // 100kg * 2.20462 = 220.5lb
    expect(getByText("220.5lb×5")).toBeTruthy();
    // 116.7kg * 2.20462 = 257.3lb
    expect(getByText("257.3lb")).toBeTruthy();
  });
});
