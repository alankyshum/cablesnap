/**
 * BLD-1033: Recent Workout cards cropped on tablet rows.
 *
 * Superseded by the Masonry migration: the list now renders inside a
 * column-distributing <Masonry> instead of a flex-wrap row, so each card
 * lives in its own independent column and must STRETCH to fill that column
 * width (alignSelf:'stretch'). The old flex-wrap crop (which required
 * alignSelf:'flex-start') can no longer occur.
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

  it("animatedCard wrapper stretches to fill its Masonry column (BLD-1033, superseded by Masonry migration)", () => {
    const { StyleSheet } = require("react-native");
    const { toJSON } = render(
      <RecentWorkoutsList
        colors={mockColors as ThemeColors}
        sessions={[shortSession, longNameSession]}
        setCounts={{ s1: 5, s2: 8 }}
        avgRPEs={{ s1: null, s2: null }}
      />,
    );

    // Walk the JSON tree looking for a card wrapper that stretches to its
    // column. The card must NOT pin to flex-start (that would leave it at its
    // 280px intrinsic width instead of filling the Masonry column).
    type JsonNode = { props?: { style?: unknown }; children?: JsonNode[] | string[] | null };
    function findAlignSelf(node: JsonNode | string | null, value: string): boolean {
      if (!node || typeof node === "string") return false;
      if (node.props?.style) {
        const flat = StyleSheet.flatten(node.props.style);
        if (flat?.alignSelf === value) return true;
      }
      if (Array.isArray(node.children)) {
        return (node.children as Array<JsonNode | string>).some((child) => findAlignSelf(child, value));
      }
      return false;
    }

    const tree = toJSON() as JsonNode | string | null;
    expect(findAlignSelf(tree, "stretch")).toBe(true);
    expect(findAlignSelf(tree, "flex-start")).toBe(false);
  });
});
