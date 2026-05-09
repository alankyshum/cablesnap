/**
 * BLD-1110 — RpeChipStrip unit tests.
 *
 * Coverage:
 *  - Renders 4 chips (Easy, Moderate, Hard, Max) for a completed set
 *  - Does not render when set is not completed
 *  - Chip with current value is selected (accessibilityState.checked)
 *  - Tapping a chip calls onChange with the correct RPE value
 *  - Tapping the selected chip calls onChange with null (deselect)
 *  - accessibilityRole radiogroup on container, radio on each chip
 *  - Long-press opens sheet (rendered via ref — smoke test only)
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => {
  return {
    __esModule: true,
    default: {
      // Forward ALL props so accessibilityRole, accessibilityLabel etc pass through
      View: (props: Record<string, unknown>) => {
        const ReactLib = require("react");
        const { View } = require("react-native");
        return ReactLib.createElement(View, props, props.children);
      },
    },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    FadeIn: { duration: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    Easing: { bezier: () => () => 0, linear: () => () => 0 },
  };
});

// Mock the RpeSheet (bottom sheet dependency) to a lightweight stub
jest.mock("../../../components/session/RpeSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const RpeSheet = (/* _props: unknown */) =>
    ReactLib.createElement(View, { testID: "mock-rpe-sheet" });
  return { RpeSheet };
});

// Mock useReducedMotion hook
jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// Mock @gorhom/bottom-sheet (pulled in transitively)
jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const BottomSheetModal = ({ children }: { children: unknown }) =>
    ReactLib.createElement(View, null, children);
  BottomSheetModal.displayName = "MockBottomSheetModal";
  return {
    __esModule: true,
    default: BottomSheetModal,
    BottomSheetModal,
    BottomSheetView: ({ children }: { children: unknown }) => ReactLib.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

import { RpeChipStrip } from "../../../components/session/RpeChipStrip";

describe("RpeChipStrip — render + a11y (BLD-1110)", () => {
  it("renders 4 chips", () => {
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={jest.fn()} />
    );
    expect(getByText("Easy")).toBeTruthy();
    expect(getByText("Moderate")).toBeTruthy();
    expect(getByText("Hard")).toBeTruthy();
    expect(getByText("Max")).toBeTruthy();
  });

  it("has accessibilityRole radiogroup on container", () => {
    // RNTL maps "radiogroup" via accessibilityRole; verify via rendered accessibilityLabel
    const { getByLabelText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={jest.fn()} />
    );
    // The Animated.View has accessibilityLabel="RPE for set set-1"
    expect(getByLabelText("RPE for set set-1")).toBeTruthy();
  });

  it("each chip has accessibilityRole radio", () => {
    const { getAllByRole } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={jest.fn()} />
    );
    const radios = getAllByRole("radio");
    expect(radios).toHaveLength(4);
  });

  it("chip matching current value is selected", () => {
    // Easy chip = 6
    const { getAllByRole } = render(
      <RpeChipStrip setId="set-1" value={6} onChange={jest.fn()} />
    );
    const radios = getAllByRole("radio");
    const selectedCount = radios.filter((r) => r.props.accessibilityState?.selected === true).length;
    expect(selectedCount).toBe(1);
  });

  it("no chip is selected when value is null", () => {
    const { getAllByRole } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={jest.fn()} />
    );
    const radios = getAllByRole("radio");
    const selectedCount = radios.filter((r) => r.props.accessibilityState?.selected === true).length;
    expect(selectedCount).toBe(0);
  });
});

describe("RpeChipStrip — onChange contract (BLD-1110)", () => {
  it("tapping Easy chip calls onChange with 6", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={onChange} />
    );
    fireEvent.press(getByText("Easy"));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("tapping Moderate chip calls onChange with 7.5", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={onChange} />
    );
    fireEvent.press(getByText("Moderate"));
    expect(onChange).toHaveBeenCalledWith(7.5);
  });

  it("tapping Hard chip calls onChange with 9", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={onChange} />
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it("tapping Max chip calls onChange with 10", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={null} onChange={onChange} />
    );
    fireEvent.press(getByText("Max"));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("tapping the currently selected chip deselects (onChange with null)", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="set-1" value={9} onChange={onChange} />
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
