/**
 * Tests for ScrollableTabs (BLD-849).
 *
 * Covers the contract that protects the Progress route from text-truncation
 * regression: tabs render with full label text, tab presses fire haptic +
 * onValueChange, and the active tab's accessibility state flips.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@/hooks/useColor", () => ({
  useColor: (name: string) => {
    switch (name) {
      case "primary":
        return "#FF6038";
      case "mutedForeground":
        return "#6B7280";
      case "background":
        return "#FAFAFA";
      default:
        return "#000000";
    }
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

// react-native-svg renders fine in jest preset; no extra mock needed.

import * as Haptics from "expo-haptics";
import { ScrollableTabs } from "../../../components/ui/scrollable-tabs";

const impactAsyncMock = Haptics.impactAsync as jest.Mock;

const FIVE_TABS = [
  { value: "workouts", label: "Workouts", accessibilityLabel: "Workouts progress" },
  { value: "body", label: "Body", accessibilityLabel: "Body metrics" },
  { value: "muscles", label: "Muscles", accessibilityLabel: "Muscle volume analysis" },
  { value: "nutrition", label: "Nutrition", accessibilityLabel: "Nutrition trends" },
  { value: "monthly", label: "Monthly", accessibilityLabel: "Monthly training report" },
] as const;

beforeEach(() => {
  impactAsyncMock.mockClear();
});

describe("ScrollableTabs (BLD-849)", () => {
  it("renders every label in full — no truncation, no missing tabs", () => {
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS as any}
      />,
    );
    // Every label must be rendered as text exactly as supplied.
    for (const tab of FIVE_TABS) {
      expect(getByText(tab.label)).toBeTruthy();
    }
  });

  it("calls onValueChange and fires light haptic when an inactive tab is pressed", () => {
    const onValueChange = jest.fn();
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={onValueChange}
        buttons={FIVE_TABS as any}
      />,
    );
    fireEvent.press(getByText("Body"));
    expect(onValueChange).toHaveBeenCalledWith("body");
    expect(impactAsyncMock).toHaveBeenCalledWith("light");
  });

  it("does not fire haptic when the already-active tab is pressed", () => {
    const onValueChange = jest.fn();
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={onValueChange}
        buttons={FIVE_TABS as any}
      />,
    );
    fireEvent.press(getByText("Workouts"));
    expect(impactAsyncMock).not.toHaveBeenCalled();
    // We still call onValueChange — parent decides whether it's a no-op.
    expect(onValueChange).toHaveBeenCalledWith("workouts");
  });

  it("marks only the active tab as accessibility-selected", () => {
    const { getByLabelText, rerender } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS as any}
      />,
    );
    expect(
      getByLabelText("Workouts progress").props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabelText("Body metrics").props.accessibilityState.selected,
    ).toBe(false);

    rerender(
      <ScrollableTabs
        value="muscles"
        onValueChange={() => {}}
        buttons={FIVE_TABS as any}
      />,
    );
    expect(
      getByLabelText("Workouts progress").props.accessibilityState.selected,
    ).toBe(false);
    expect(
      getByLabelText("Muscle volume analysis").props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it("uses the supplied accessibilityLabel when provided, falling back to label otherwise", () => {
    const buttons = [
      { value: "a", label: "A", accessibilityLabel: "Tab A custom" },
      { value: "b", label: "B" },
    ];
    const { getByLabelText } = render(
      <ScrollableTabs value="a" onValueChange={() => {}} buttons={buttons} />,
    );
    // Custom label.
    expect(getByLabelText("Tab A custom")).toBeTruthy();
    // Fallback to label string when accessibilityLabel is missing.
    expect(getByLabelText("B")).toBeTruthy();
  });

  it("renders an animated indicator and exposes a tablist role", () => {
    const { getByTestId, root } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS as any}
      />,
    );
    expect(getByTestId("scrollable-tabs-indicator")).toBeTruthy();
    // Root container exposes tablist for assistive tech.
    expect(root.props.accessibilityRole).toBe("tablist");
  });
});
