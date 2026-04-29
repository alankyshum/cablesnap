/**
 * BLD-551 (originally) → BLD-850 (refactored):
 *
 * Previous-performance now lives in the LEFT half of the new
 * `LastNextRow` (BLD-850) instead of a standalone Pressable on the
 * right side of header row 1. The "tappable refresh affordance" goal
 * of BLD-551 is preserved end-to-end:
 *
 *   - The Last half still renders a leading `refresh` glyph in the
 *     12–14px range so sighted users get a visual tap cue.
 *   - The pressable is still tappable and now opens a confirm dialog
 *     that, on accept, calls `onPrefill(eid)` (the same callback chain
 *     BLD-449 introduced).
 *   - Color now resolves to the new "Last is faded reference data"
 *     contract (`onSurfaceVariant`) — the BLD-850 plan explicitly
 *     downgrades Last from `primary` to `onSurfaceVariant` so that
 *     Next (the actionable challenge) gets visual priority.
 */
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string; accessibilityLabel?: string }) =>
    ReactLib.createElement(Text, { ...props }, props.name);
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

jest.mock("../../../components/session/SuggestionExplainerModal", () => ({
  SuggestionExplainerModal: () => null,
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
  // BLD-850: header now also accepts suggestion/step/onUpdate so it can
  // render the inline LastNextRow. We default them to nullish so the
  // legacy "Last only" path is exercised here.
  suggestion: null,
  step: 2.5,
  onUpdate: jest.fn(),
  onModeChange: jest.fn(),
  onExerciseNotes: jest.fn(),
  onExerciseNotesDraftChange: jest.fn(),
  onToggleExerciseNotes: jest.fn(),
  onShowDetail: jest.fn(),
  onSwap: jest.fn(),
  onDeleteExercise: jest.fn(),
};

describe("GroupCardHeader — previous-performance affordance (BLD-551 / BLD-850)", () => {
  it("renders a leading refresh glyph in the Last half when previousPerformance is present", () => {
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
    // BLD-850 demotes Last to `onSurfaceVariant` (faded reference). We assert
    // the new color contract — primary is reserved for Next.
    expect(icon.props.color).toBe("#49454f");
  });

  it("does not render the refresh glyph when previousPerformance is absent", () => {
    const { UNSAFE_queryAllByProps } = render(
      <GroupCardHeader {...baseProps} previousPerformance={null} />,
    );
    expect(UNSAFE_queryAllByProps({ name: "refresh" }).length).toBe(0);
  });

  it("fires onPrefill on tap → confirm (no regression on BLD-449)", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onPrefill = jest.fn();
    const { getByTestId } = render(
      <GroupCardHeader
        {...baseProps}
        previousPerformance="5 reps · 60 kg"
        onPrefill={onPrefill}
      />,
    );

    fireEvent.press(getByTestId("last-half"));
    // BLD-850 gates the prefill behind a confirm dialog. Simulate the user
    // pressing "Refill" — this is the BLD-449 functional contract.
    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((b) => b.text === "Refill")?.onPress?.();
    expect(onPrefill).toHaveBeenCalledWith("ex-1");
    alertSpy.mockRestore();
  });
});
