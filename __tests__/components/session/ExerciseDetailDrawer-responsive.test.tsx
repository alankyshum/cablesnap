import React from "react";
import { render } from "@testing-library/react-native";
import type { Exercise } from "../../../lib/types";

// --- Module mocks ---

jest.mock("../../../lib/useProfileGender", () => ({
  useProfileGender: () => "male",
}));

jest.mock("../../../hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6750A4",
    onPrimary: "#FFFFFF",
    primaryContainer: "#EADDFF",
    onPrimaryContainer: "#21005D",
    secondaryContainer: "#E8DEF8",
    onSecondaryContainer: "#1D192B",
    tertiaryContainer: "#FFD8E4",
    onTertiaryContainer: "#31111D",
    onSurface: "#1C1B1F",
    onSurfaceVariant: "#49454F",
    surfaceVariant: "#E7E0EC",
    outlineVariant: "#CAC4D0",
    surface: "#FFFBFE",
  }),
}));

// MuscleMap is heavy (react-native-body-highlighter SVG); replace with a marker view.
jest.mock("../../../components/MuscleMap", () => {
  const RealReact = require("react");
  const { View } = require("react-native");
  return {
    MuscleMap: (props: { width?: number }) =>
      RealReact.createElement(View, {
        testID: "mock-muscle-map",
        accessibilityLabel: `muscle-map-w${props.width}`,
      }),
  };
});

// Mute the drawer stats hook (we don't render it without `unit`).
jest.mock("../../../components/session/ExerciseDrawerStats", () => ({
  ExerciseDrawerStats: () => null,
}));

jest.mock("../../../components/exercises/ExerciseTutorialLink", () => ({
  ExerciseTutorialLink: () => null,
}));

// BottomSheetFlatList renders ListHeaderComponent via FlatList in tests; mock it
// to a plain View that just renders the header so jest doesn't need bottom-sheet
// internals.
jest.mock("@gorhom/bottom-sheet", () => {
  const RealReact = require("react");
  const { View } = require("react-native");
  return {
    BottomSheetFlatList: ({ ListHeaderComponent }: { ListHeaderComponent: React.ComponentType | React.ReactElement }) =>
      RealReact.createElement(
        View,
        { testID: "bottom-sheet-list" },
        typeof ListHeaderComponent === "function"
          ? RealReact.createElement(ListHeaderComponent)
          : ListHeaderComponent
      ),
  };
});

// useLayout is consumed via "../../lib/layout"; mock per test by re-requiring.
let mockAtLeastMedium = false;
jest.mock("../../../lib/layout", () => ({
  useLayout: () => ({
    width: mockAtLeastMedium ? 800 : 360,
    atLeastMedium: mockAtLeastMedium,
    compact: !mockAtLeastMedium,
    medium: mockAtLeastMedium,
    expanded: false,
    horizontalPadding: mockAtLeastMedium ? 24 : 16,
    scale: 1.0,
  }),
}));

// useWindowDimensions for mapWidth math.
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockAtLeastMedium ? 800 : 360, height: 800, scale: 2, fontScale: 1 }),
}));

import { ExerciseDetailDrawerContent } from "../../../components/session/ExerciseDetailDrawer";

const exercise = {
  id: "ex-1",
  name: "Barbell Bench Press",
  category: "compound",
  difficulty: "intermediate",
  equipment: "barbell",
  primary_muscles: ["chest"],
  secondary_muscles: ["triceps"],
  instructions: "Set up bench\nUnrack barbell\nLower to chest\nPress up",
  is_custom: false,
} as unknown as Exercise;

describe("ExerciseDetailDrawerContent — responsive Details tab", () => {
  beforeEach(() => {
    mockAtLeastMedium = false;
  });

  it("renders MuscleMap and numbered bullet instructions on phone layout (BLD-701 AC1, AC2)", () => {
    mockAtLeastMedium = false;
    const { getByTestId, getByText, getAllByText } = render(<ExerciseDetailDrawerContent exercise={exercise} />);
    // AC2: heatmap visible on narrow viewport.
    expect(getByTestId("mock-muscle-map")).toBeTruthy();
    // AC1: numbered bullets, not plain concatenated text.
    expect(getByText("Instructions")).toBeTruthy();
    expect(getByText("Set up bench")).toBeTruthy();
    expect(getByText("Press up")).toBeTruthy();
    expect(getAllByText(/^\d+\.$/).length).toBe(4);
  });

  it("preserves tablet layout: heatmap + numbered instructions both render (BLD-701 AC3)", () => {
    mockAtLeastMedium = true;
    const { getByTestId, getByText, getAllByText } = render(<ExerciseDetailDrawerContent exercise={exercise} />);
    expect(getByTestId("mock-muscle-map")).toBeTruthy();
    expect(getByText("Instructions")).toBeTruthy();
    expect(getByText("Lower to chest")).toBeTruthy();
    expect(getAllByText(/^\d+\.$/).length).toBe(4);
  });

  it("handles instruction edge cases: strips pre-numbered prefix; hides section when empty", () => {
    const preNumbered = { ...exercise, instructions: "1. Already numbered\n2. Second" } as unknown as Exercise;
    const r1 = render(<ExerciseDetailDrawerContent exercise={preNumbered} />);
    expect(r1.getByText("Already numbered")).toBeTruthy();
    expect(r1.getByText("Second")).toBeTruthy();
    expect(r1.queryByText("1. Already numbered")).toBeNull();

    const empty = { ...exercise, instructions: "" } as unknown as Exercise;
    const r2 = render(<ExerciseDetailDrawerContent exercise={empty} />);
    expect(r2.queryByText("Instructions")).toBeNull();
  });
});
