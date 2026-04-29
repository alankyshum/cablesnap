/**
 * BLD-656 → BLD-850:
 *
 * Previous-performance text must wrap to up to 2 lines instead of single-
 * line truncation on narrow viewports (e.g., Z Fold6 cover screen). This
 * lock-in survived the BLD-850 refactor — the LEFT half of the new
 * `LastNextRow` still applies `numberOfLines={2}` to the value text.
 */
import React from "react";
import { render } from "@testing-library/react-native";
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
    is_voltra: false,
    sets: [],
    progressionSuggested: false,
    ...overrides,
  } as ExerciseGroup;
}

const baseProps = {
  group: makeGroup(),
  exerciseNotesOpen: false,
  exerciseNotesDraft: undefined,
  firstSet: undefined as SetWithMeta | undefined,
  // BLD-850 additions on GroupCardHeader.
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

describe("GroupCardHeader — previous-performance wrap (BLD-656 / BLD-850)", () => {
  it("renders the previous-performance text inside LastNextRow with numberOfLines={2}", () => {
    const summary = "5 reps · 60 kg · concentric · prior session 2026-04-22";
    const { getByText } = render(
      <GroupCardHeader
        {...baseProps}
        previousPerformance={summary}
        onPrefill={jest.fn()}
      />,
    );

    // The summary is rendered as a child Text inside the Last half's label.
    const textNode = getByText(summary, { exact: false });
    // Walk up to find a Text node whose own props specify numberOfLines.
    // The summary is composed inside a nested `<Text>{previousPerformance}</Text>`;
    // RN's queryByText returns the innermost text host. The wrapping Text
    // (carrying numberOfLines) is its parent.
    const directParent = (textNode.parent ?? textNode);
    // Pull the closest enclosing Text with numberOfLines defined.
    let cursor: typeof directParent | null = directParent;
    let resolvedNumberOfLines: number | undefined;
    while (cursor) {
      const n = cursor.props?.numberOfLines as number | undefined;
      if (typeof n === "number") {
        resolvedNumberOfLines = n;
        break;
      }
      cursor = cursor.parent ?? null;
    }
    expect(resolvedNumberOfLines).toBe(2);
  });
});
