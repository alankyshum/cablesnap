/**
 * BLD-551: Previous-performance chip must retain a visual tappability
 * affordance. BLD-542 removed the trailing `arrow-collapse-down` icon,
 * leaving the chip reading as a static label for sighted users without
 * screen readers. This test locks in the restored trailing glyph
 * (`refresh`) so a future refactor doesn't silently drop it again.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string; accessibilityLabel?: string }) =>
    React.createElement(Text, { ...props }, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    outlineVariant: "#cac4d0",
    surface: "#fffbfe",
    surfaceVariant: "#e7e0ec",
    shadow: "#000000",
    background: "#fffbfe",
  }),
}));

jest.mock("../../../components/TrainingModeSelector", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../../components/session/ExerciseNotesPanel", () => ({
  __esModule: true,
  ExerciseNotesPanel: () => null,
}));

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exercise_id: "ex-1",
    name: "Cable Row",
    training_modes: ["concentric"],
    is_voltra: false,
    sets: [],
    progressionSuggested: false,
    ...overrides,
  } as ExerciseGroup;
}

const baseProps = {
  group: makeGroup(),
  currentMode: undefined,
  modes: {} as Record<string, never>,
  exerciseNotesOpen: false,
  exerciseNotesDraft: undefined,
  firstSet: undefined as SetWithMeta | undefined,
  onModeChange: jest.fn(),
  onExerciseNotes: jest.fn(),
  onExerciseNotesDraftChange: jest.fn(),
  onToggleExerciseNotes: jest.fn(),
  onShowDetail: jest.fn(),
  onSwap: jest.fn(),
  onDeleteExercise: jest.fn(),
};

describe("GroupCardHeader — previous-performance affordance (BLD-551)", () => {
  it("renders a trailing refresh glyph when previousPerformance is present", () => {
    const { UNSAFE_getAllByProps } = render(
      <GroupCardHeader
        {...baseProps}
        previousPerformance="5 reps · 60 kg"
        onPrefill={jest.fn()}
      />,
    );

    const icons = UNSAFE_getAllByProps({ name: "refresh" });
    expect(icons.length).toBeGreaterThan(0);
    const icon = icons[0];
    // Size must be in the 12–14px affordance range per BLD-551 scope.
    const size: number = icon.props.size;
    expect(size).toBeGreaterThanOrEqual(12);
    expect(size).toBeLessThanOrEqual(14);
    // Color must match the primary token (same as text) for visual coherence.
    expect(icon.props.color).toBe("#6200ee");
  });

  it("does not render the refresh glyph when previousPerformance is absent", () => {
    const { UNSAFE_queryAllByProps } = render(
      <GroupCardHeader {...baseProps} previousPerformance={null} />,
    );
    expect(UNSAFE_queryAllByProps({ name: "refresh" }).length).toBe(0);
  });

  it("still fires onPrefill on tap (no regression on BLD-449)", () => {
    const onPrefill = jest.fn();
    const { getByLabelText } = render(
      <GroupCardHeader
        {...baseProps}
        previousPerformance="5 reps · 60 kg"
        onPrefill={onPrefill}
      />,
    );

    fireEvent.press(getByLabelText("5 reps · 60 kg"));
    expect(onPrefill).toHaveBeenCalledWith("ex-1");
  });
});
