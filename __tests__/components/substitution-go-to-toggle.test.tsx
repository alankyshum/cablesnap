/**
 * BLD-2561: SubstitutionSheetBody — "Set as my go-to" toggle tests.
 *
 * AC coverage:
 *   - Toggle is hidden when onToggleSetAsGoTo is undefined (default render,
 *     no regression for callers that don't pass the prop)
 *   - Toggle is visible when onToggleSetAsGoTo is provided
 *   - Toggle label includes source exercise name
 *   - Pressing the toggle calls onToggleSetAsGoTo
 *   - Toggle has accessibilityRole="checkbox"
 *   - Toggled state (setAsGoTo=true) shows checked icon
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SubstitutionSheetBody } from "../../components/substitution/SubstitutionSheetBody";
import type { Exercise } from "../../lib/types";

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
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    primaryContainer: "#e8def8",
    onPrimaryContainer: "#21005d",
  }),
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { FlatList } = require("react-native");
  return {
    __esModule: true,
    BottomSheetFlatList: (props: React.ComponentProps<typeof FlatList>) =>
      ReactLib.createElement(FlatList, props),
  };
});

const makeExercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: "ex-src",
  name: "Cable Row",
  category: "back",
  primary_muscles: ["back"],
  secondary_muscles: [],
  equipment: "cable",
  instructions: "",
  difficulty: "beginner",
  is_custom: false,
  ...overrides,
});

const baseProps = {
  sourceExercise: makeExercise(),
  query: "",
  setQuery: jest.fn(),
  equipmentFilter: null,
  setEquipmentFilter: jest.fn(),
  availableEquipment: [],
  rows: [],
  emptyMessage: null,
  noMuscleData: false,
  onSelect: jest.fn(),
};

describe('SubstitutionSheetBody — BLD-2561 "Set as my go-to" toggle', () => {
  it("does NOT render toggle when onToggleSetAsGoTo is undefined (no regression)", () => {
    const { queryByRole } = render(
      <SubstitutionSheetBody {...baseProps} />,
    );
    // checkbox role should not be present when prop is omitted
    expect(queryByRole("checkbox")).toBeNull();
  });

  it("renders toggle when onToggleSetAsGoTo is provided", () => {
    const { getByRole } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={jest.fn()}
        setAsGoTo={false}
      />,
    );
    expect(getByRole("checkbox")).toBeTruthy();
  });

  it("toggle label includes the source exercise name", () => {
    const { getByText } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={jest.fn()}
        setAsGoTo={false}
      />,
    );
    expect(getByText(/Set as my go-to for Cable Row/)).toBeTruthy();
  });

  it("pressing toggle calls onToggleSetAsGoTo", () => {
    const onToggle = jest.fn();
    const { getByRole } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={onToggle}
        setAsGoTo={false}
      />,
    );
    fireEvent.press(getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("setAsGoTo=false shows unchecked icon", () => {
    const { getByTestId } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={jest.fn()}
        setAsGoTo={false}
      />,
    );
    expect(getByTestId("icon-checkbox-blank-outline")).toBeTruthy();
  });

  it("setAsGoTo=true shows checked icon", () => {
    const { getByTestId } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={jest.fn()}
        setAsGoTo={true}
      />,
    );
    expect(getByTestId("icon-checkbox-marked")).toBeTruthy();
  });

  it("toggle accessibilityState reflects checked state", () => {
    const { getByRole } = render(
      <SubstitutionSheetBody
        {...baseProps}
        onToggleSetAsGoTo={jest.fn()}
        setAsGoTo={true}
      />,
    );
    const checkbox = getByRole("checkbox");
    expect(checkbox.props.accessibilityState?.checked).toBe(true);
  });
});
