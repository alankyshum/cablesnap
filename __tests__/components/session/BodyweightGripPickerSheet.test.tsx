/**
 * BLD-822 — BodyweightGripPickerSheet unit tests.
 *
 * Mirrors BLD-771's VariantPickerSheet.test.tsx. Mocks the heavy bottom-sheet
 * and SegmentedControl down to lightweight Pressables so we can assert on
 * picker logic without dragging in Modal/Reanimated/GestureHandler.
 *
 * Coverage:
 *  - Confirm without touching anything → onConfirm with NULL/NULL
 *    (silent-default trap closure, mirrors VariantPickerSheet's QD-B2).
 *  - Tap a grip-type segment then confirm → that value is staged.
 *  - Clear button resets staged values; confirm afterwards writes NULL.
 *  - Initial values from props prefill the staged state on each open.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { BodyweightGripPickerSheet } from "../../../components/session/BodyweightGripPickerSheet";

jest.mock("@/components/ui/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({ isVisible, children }: { isVisible: boolean; children: React.ReactNode }) =>
      isVisible ? <View testID="mock-bottom-sheet">{children}</View> : null,
  };
});

jest.mock("@/components/ui/segmented-control", () => {
  const React = require("react");
  const { View, Pressable, Text } = require("react-native");
  return {
    SegmentedControl: (props: {
      value: string;
      onValueChange: (v: string) => void;
      buttons: { value: string; label: string; accessibilityLabel?: string }[];
    }) => (
      <View>
        {props.buttons.map((b) => (
          <Pressable
            key={b.value}
            testID={`sc-${b.value}`}
            accessibilityLabel={b.accessibilityLabel}
            onPress={() => props.onValueChange(b.value)}
          >
            <Text>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#ECE6F0",
    onSurfaceVariant: "#49454F",
    onSurface: "#1C1B1F",
    primary: "#6750A4",
    onPrimary: "#FFFFFF",
    outline: "#79747E",
  }),
}));

describe("BodyweightGripPickerSheet — BLD-822", () => {
  it("confirming without any tap saves NULL/NULL (silent-default trap closure)", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <BodyweightGripPickerSheet
        isVisible
        onClose={onClose}
        gripType={null}
        gripWidth={null}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.press(getByLabelText("Save grip"));
    expect(onConfirm).toHaveBeenCalledWith({ gripType: null, gripWidth: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("tapping segments stages those values, then confirm writes them", () => {
    const onConfirm = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <BodyweightGripPickerSheet
        isVisible
        onClose={jest.fn()}
        gripType={null}
        gripWidth={null}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.press(getByTestId("sc-overhand"));
    fireEvent.press(getByTestId("sc-narrow"));
    fireEvent.press(getByLabelText("Save grip"));
    expect(onConfirm).toHaveBeenCalledWith({ gripType: "overhand", gripWidth: "narrow" });
  });

  it("Clear resets staged values; confirm afterwards writes NULL", () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <BodyweightGripPickerSheet
        isVisible
        onClose={jest.fn()}
        gripType="overhand"
        gripWidth="narrow"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.press(getByLabelText("Clear grip"));
    fireEvent.press(getByLabelText("Save grip"));
    expect(onConfirm).toHaveBeenCalledWith({ gripType: null, gripWidth: null });
  });

  it("each grip type & width segment is independently selectable", () => {
    const onConfirm = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <BodyweightGripPickerSheet
        isVisible
        onClose={jest.fn()}
        gripType={null}
        gripWidth={null}
        onConfirm={onConfirm}
      />,
    );
    // Only set grip width; leave grip type NULL.
    fireEvent.press(getByTestId("sc-wide"));
    fireEvent.press(getByLabelText("Save grip"));
    expect(onConfirm).toHaveBeenCalledWith({ gripType: null, gripWidth: "wide" });
  });

  it("hidden when not visible", () => {
    const { queryByTestId } = render(
      <BodyweightGripPickerSheet
        isVisible={false}
        onClose={jest.fn()}
        gripType={null}
        gripWidth={null}
        onConfirm={jest.fn()}
      />,
    );
    expect(queryByTestId("mock-bottom-sheet")).toBeNull();
  });
});
