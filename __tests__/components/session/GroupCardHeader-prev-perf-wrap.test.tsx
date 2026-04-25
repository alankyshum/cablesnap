/**
 * BLD-656: Previous-performance chip text must wrap to up to 2 lines
 * instead of single-line truncation. On narrow viewports (e.g., Z Fold6
 * cover screen ~884dp inner width) the previous-performance summary
 * was being truncated with ellipsis when the available width was
 * insufficient. This test locks in `numberOfLines={2}` so the change
 * isn't silently reverted by a future refactor.
 */
import React from "react";
import { render } from "@testing-library/react-native";
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
  modes: {} as Record<string, never>,
  currentMode: undefined,
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

describe("GroupCardHeader — previous-performance wrap (BLD-656)", () => {
  it("renders the previous-performance text with numberOfLines={2} so it wraps instead of truncating on narrow viewports", () => {
    const summary = "5 reps · 60 kg · concentric · prior session 2026-04-22";
    const { getByText } = render(
      <GroupCardHeader
        {...baseProps}
        previousPerformance={summary}
        onPrefill={jest.fn()}
      />,
    );

    const textNode = getByText(summary);
    expect(textNode.props.numberOfLines).toBe(2);
  });
});
