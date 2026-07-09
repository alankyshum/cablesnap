import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { SegmentedControl, SEGMENT_MIN_TOUCH_TARGET } from "../../../components/ui/segmented-control";

jest.mock("@/hooks/useColor", () => ({
  useColor: (name: string) => {
    switch (name) {
      case "primary":
        return "#FF6038";
      case "mutedForeground":
        return "#6B7280";
      case "background":
        return "#FAFAFA";
      case "muted":
        return "#E5E7EB";
      default:
        return "#000000";
    }
  },
}));

function resolveStyle(style: unknown) {
  const resolved = typeof style === "function" ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return StyleSheet.flatten(resolved ?? {}) as Record<string, unknown>;
}

const TWO_BUTTONS = [
  { value: "kg", label: "kg", accessibilityLabel: "Weight in kilograms" },
  { value: "lb", label: "lb", accessibilityLabel: "Weight in pounds" },
];

describe("SegmentedControl (BLD-3195)", () => {
  it("renders with two buttons", () => {
    const { getByText } = render(
      <SegmentedControl
        value="kg"
        onValueChange={() => {}}
        buttons={TWO_BUTTONS}
      />,
    );

    expect(getByText("kg")).toBeTruthy();
    expect(getByText("lb")).toBeTruthy();
  });

  it("meets the 44px minimum touch target for each segment", () => {
    const { getByLabelText } = render(
      <SegmentedControl
        value="kg"
        onValueChange={() => {}}
        buttons={TWO_BUTTONS}
      />,
    );

    expect(SEGMENT_MIN_TOUCH_TARGET).toBe(44);

    const kgSegment = getByLabelText("Weight in kilograms");
    const lbSegment = getByLabelText("Weight in pounds");

    const kgStyle = resolveStyle(kgSegment.props.style);
    const lbStyle = resolveStyle(lbSegment.props.style);

    expect(kgStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(lbStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it("fires onValueChange with the correct value on press", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SegmentedControl
        value="kg"
        onValueChange={onValueChange}
        buttons={TWO_BUTTONS}
      />,
    );

    fireEvent.press(getByLabelText("Weight in pounds"));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("lb");
  });

  it("asserts accessibilityRole === 'radio' and accessibilityState reflects active value", () => {
    const { getByLabelText } = render(
      <SegmentedControl
        value="kg"
        onValueChange={() => {}}
        buttons={TWO_BUTTONS}
      />,
    );

    const kgSegment = getByLabelText("Weight in kilograms");
    const lbSegment = getByLabelText("Weight in pounds");

    expect(kgSegment.props.accessibilityRole).toBe("radio");
    expect(lbSegment.props.accessibilityRole).toBe("radio");

    expect(kgSegment.props.accessibilityState.selected).toBe(true);
    expect(lbSegment.props.accessibilityState.selected).toBe(false);
  });
});
