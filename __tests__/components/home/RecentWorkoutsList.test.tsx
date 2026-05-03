/**
 * BLD-1033: Recent Workout cards cropped on tablet rows
 *
 * Regression test: Animated.View wrapper must have alignSelf:'flex-start' so
 * each card sizes to its own content rather than stretching to the tallest
 * sibling in the flex-wrap row.
 */

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../../hooks/useColorScheme", () => ({ useColorScheme: () => "light" }));

import React from "react";
import { render } from "@testing-library/react-native";
import RecentWorkoutsList from "../../../components/home/RecentWorkoutsList";
import type { ThemeColors } from "../../../hooks/useThemeColors";
import type { WorkoutSession } from "../../../lib/types";

const mockColors: Partial<ThemeColors> = {
  surface: "#FFFFFF",
  onSurface: "#1A2138",
  onSurfaceVariant: "#6B7280",
  onBackground: "#1A2138",
};

const shortSession: WorkoutSession = {
  id: "s1",
  name: "Push",
  started_at: 1746352800000,
  clock_started_at: null,
  completed_at: 1746356400000,
  duration_seconds: 3600,
  template_id: null,
  notes: "",
  rating: null,
  edited_at: null,
  import_batch_id: null,
};

const longNameSession: WorkoutSession = {
  id: "s2",
  name: "Full Body Hypertrophy — Upper Lower Split Day A",
  started_at: 1746439200000,
  clock_started_at: null,
  completed_at: 1746444600000,
  duration_seconds: 5400,
  template_id: null,
  notes: "",
  rating: null,
  edited_at: null,
  import_batch_id: null,
};

describe("RecentWorkoutsList", () => {
  it("renders session names", () => {
    const { getByText } = render(
      <RecentWorkoutsList
        colors={mockColors as ThemeColors}
        sessions={[shortSession, longNameSession]}
        setCounts={{ s1: 5, s2: 8 }}
        avgRPEs={{ s1: null, s2: 7.5 }}
      />,
    );

    expect(getByText("Push")).toBeTruthy();
    expect(getByText("Full Body Hypertrophy — Upper Lower Split Day A")).toBeTruthy();
  });

  it("renders empty state when no sessions", () => {
    const { getByText } = render(
      <RecentWorkoutsList
        colors={mockColors as ThemeColors}
        sessions={[]}
        setCounts={{}}
        avgRPEs={{}}
      />,
    );

    expect(getByText(/No workouts yet/)).toBeTruthy();
  });

  it("animatedCard wrapper has alignSelf flex-start to prevent tablet row crop (BLD-1033)", () => {
    const { StyleSheet } = require("react-native");
    const { toJSON } = render(
      <RecentWorkoutsList
        colors={mockColors as ThemeColors}
        sessions={[shortSession, longNameSession]}
        setCounts={{ s1: 5, s2: 8 }}
        avgRPEs={{ s1: null, s2: null }}
      />,
    );

    // Walk the JSON tree looking for a node with alignSelf: 'flex-start'
    type JsonNode = { props?: { style?: unknown }; children?: JsonNode[] | string[] | null };
    function hasAlignSelfFlexStart(node: JsonNode | string | null): boolean {
      if (!node || typeof node === "string") return false;
      if (node.props?.style) {
        const flat = StyleSheet.flatten(node.props.style);
        if (flat?.alignSelf === "flex-start") return true;
      }
      if (Array.isArray(node.children)) {
        return (node.children as Array<JsonNode | string>).some((child) => hasAlignSelfFlexStart(child));
      }
      return false;
    }

    expect(hasAlignSelfFlexStart(toJSON() as JsonNode | string | null)).toBe(true);
  });
});
