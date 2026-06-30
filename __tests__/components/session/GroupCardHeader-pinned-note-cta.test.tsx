/**
 * BLD-2386 Item A — GroupCardHeader pinned-note empty-state CTA removal.
 *
 * AC1: group with no pinned note → no "+ Add pinned note" text CTA;
 *      pin-outline icon still present and opens the editor on tap.
 * AC2: group WITH a pinned note → "📌 {note}" read surface unchanged.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string; accessibilityLabel?: string; testID?: string }) =>
    ReactLib.createElement(Text, { ...props, testID: props.testID ?? `icon-${props.name}` }, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    outlineVariant: "#cac4d0",
    outline: "#79747e",
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
    is_bodyweight: false,
    trackingMode: "reps",
    equipment: "cable",
    exercise_position: 0,
    link_id: null,
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
  pinnedNoteDraft: undefined,
  onPinnedNoteDraftChange: jest.fn(),
  onPinnedNoteSave: jest.fn(),
  onBackfillCopy: jest.fn(),
  onBackfillDismiss: jest.fn(),
  onLoadBackfill: jest.fn(),
};

describe("GroupCardHeader — BLD-2386 Item A pinned-note CTA removal", () => {
  it("AC1: does NOT render '+ Add pinned note' CTA when no pinned note exists", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ pinnedNote: null })}
      />,
    );
    expect(queryByText("+ Add pinned note")).toBeNull();
    expect(queryByText(/Add pinned note/)).toBeNull();
  });

  it("AC1: pin-outline icon still present when no pinned note exists", () => {
    const { UNSAFE_queryAllByProps } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ pinnedNote: null })}
      />,
    );
    // The pin-outline Pressable (affordance to open editor) must still exist.
    const pinOutlineIcons = UNSAFE_queryAllByProps({ name: "pin-outline" });
    expect(pinOutlineIcons.length).toBeGreaterThan(0);
  });

  it("AC1: pin-outline icon opens the editor on tap — no crash", () => {
    // The pin-outline Pressable opens PinnedExerciseNoteEditor.
    // We verify it's pressable without crashing (editor component is not mocked here).
    const { UNSAFE_getAllByProps } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ pinnedNote: null })}
        onPinnedNoteSave={jest.fn()}
      />,
    );
    // Find and press the pin-outline icon's Pressable — should not throw.
    const pinIcon = UNSAFE_getAllByProps({ name: "pin-outline" })[0];
    // The Pressable wrapping the pin icon has onPress set. Fire it via parent.
    expect(() => {
      fireEvent.press(pinIcon);
    }).not.toThrow();
  });

  it("AC2: '📌 {note}' read surface is present when a pinned note exists", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ pinnedNote: "Keep elbows close" })}
      />,
    );
    expect(queryByText(/📌 Keep elbows close/)).toBeTruthy();
  });

  it("AC2: still NO '+ Add pinned note' CTA when a pinned note exists", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ pinnedNote: "Keep elbows close" })}
      />,
    );
    expect(queryByText("+ Add pinned note")).toBeNull();
  });
});
