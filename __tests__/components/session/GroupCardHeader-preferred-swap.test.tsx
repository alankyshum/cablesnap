/**
 * BLD-2561: GroupCardHeader — preferred swap chip (Row 3a) tests.
 *
 * AC coverage:
 *   - Chip renders when preferredSubstituteName is set (fast-path present)
 *   - Chip is hidden when preferredSubstituteName is null/undefined (empty-state)
 *   - Chip renders "Swapped to {name} · Undo" when isPreferredSwapApplied=true
 *     even when preferredSubstituteName is null (post-swap state on target card)
 *   - Tapping the chip calls onPreferredSwap with the exercise_id (≤1 tap)
 *   - Discovery sheet path is unchanged when no preference exists (regression guard)
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; testID?: string }) =>
    ReactLib.createElement(Text, { testID: `icon-${props.name}` }, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onPrimaryContainer: "#21005d",
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
  firstSet: undefined as SetWithMeta | undefined,
  suggestion: null,
  step: 2.5,
  onUpdate: jest.fn(),
  onExerciseNotes: jest.fn(),
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

describe("GroupCardHeader — BLD-2561 preferred substitute chip (Row 3a)", () => {
  it("renders 'Swap to {name}' chip when preferredSubstituteName is set", () => {
    const { getByText } = render(
      <GroupCardHeader
        {...baseProps}
        preferredSubstituteName="Machine Row"
        onPreferredSwap={jest.fn()}
      />,
    );
    expect(getByText("Swap to Machine Row")).toBeTruthy();
  });

  it("does NOT render the swap chip when preferredSubstituteName is null (empty-state)", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        preferredSubstituteName={null}
        onPreferredSwap={jest.fn()}
      />,
    );
    expect(queryByText(/Swap to/)).toBeNull();
  });

  it("does NOT render the swap chip when preferredSubstituteName is undefined", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        // intentionally no preferredSubstituteName prop
        onPreferredSwap={jest.fn()}
      />,
    );
    expect(queryByText(/Swap to/)).toBeNull();
  });

  it("tapping chip calls onPreferredSwap with the exercise_id (≤1 tap)", () => {
    const onPreferredSwap = jest.fn();
    const { getByText } = render(
      <GroupCardHeader
        {...baseProps}
        group={makeGroup({ exercise_id: "ex-abc" })}
        preferredSubstituteName="Machine Row"
        onPreferredSwap={onPreferredSwap}
      />,
    );
    fireEvent.press(getByText("Swap to Machine Row"));
    // ≤1 tap: exactly one call with the exercise id.
    expect(onPreferredSwap).toHaveBeenCalledTimes(1);
    expect(onPreferredSwap).toHaveBeenCalledWith("ex-abc");
  });

  it("discovery-sheet onSwap is unchanged — no regression when no preference", () => {
    const onSwap = jest.fn();
    // Render without a preferred substitute (no chip visible).
    // The existing swap icon in the controls cluster must still be present.
    const { UNSAFE_queryAllByProps } = render(
      <GroupCardHeader
        {...baseProps}
        onSwap={onSwap}
        // no preferredSubstituteName
      />,
    );
    const swapIcons = UNSAFE_queryAllByProps({ name: "swap-horizontal" });
    // The icon-only swap button in the controls cluster is present.
    expect(swapIcons.length).toBeGreaterThan(0);
  });

  it("renders 'Swapped to {name} · Undo' chip when isPreferredSwapApplied=true even with no preferredSubstituteName (post-swap state on target card)", () => {
    // After a preferred swap, the original exercise is replaced by the target.
    // The target card has preferredSubstituteName=null (its own preferred sub)
    // but isPreferredSwapApplied=true + preferredSwappedToName from in-session state.
    const { getByText } = render(
      <GroupCardHeader
        {...baseProps}
        preferredSubstituteName={null}
        isPreferredSwapApplied={true}
        preferredSwappedToName="Hack Squat"
        onPreferredSwap={jest.fn()}
      />,
    );
    expect(getByText("Swapped to Hack Squat · Undo")).toBeTruthy();
  });

  it("chip is hidden when both preferredSubstituteName=null and isPreferredSwapApplied=false (true empty-state)", () => {
    const { queryByText } = render(
      <GroupCardHeader
        {...baseProps}
        preferredSubstituteName={null}
        isPreferredSwapApplied={false}
        onPreferredSwap={jest.fn()}
      />,
    );
    expect(queryByText(/Swap/)).toBeNull();
  });
});
