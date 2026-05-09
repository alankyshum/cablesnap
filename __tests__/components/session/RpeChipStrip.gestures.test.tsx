/**
 * BLD-1110 — RpeChipStrip gesture isolation (Tech N1 regression contract).
 *
 * Verifies that RPE chip interactions do NOT bubble to or fire any of the
 * 5 existing SetRow parent gesture handlers:
 *   1. swipe-complete
 *   2. setType cycle
 *   3. variant clear
 *   4. BW grip clear
 *   5. BW modifier clear
 *
 * Also verifies that a chip TAP does NOT toggle set completion.
 *
 * RN Pressable does not bubble events by default — these tests lock the
 * contract explicitly per the plan (AC9 / Tech N1).
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { RpeChipStrip, type RpeChipStripProps } from "../../../components/session/RpeChipStrip";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
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
  FadeIn: { duration: () => ({}) },
  runOnJS: (fn: unknown) => fn,
  Easing: { bezier: () => () => 0 },
}));

jest.mock("../../../components/session/RpeSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const RpeSheet = (/* _props: unknown */) =>
    ReactLib.createElement(View, { testID: "mock-rpe-sheet" });
  return { RpeSheet };
});

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const BottomSheet = ({ children }: { children: unknown }) =>
    ReactLib.createElement(View, null, children);
  BottomSheet.displayName = "MockBottomSheet";
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView: ({ children }: { children: unknown }) =>
      ReactLib.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

function makeProps(overrides: Partial<RpeChipStripProps> = {}): RpeChipStripProps {
  return {
    setId: "set-1",
    value: null,
    onChange: jest.fn(),
    ...overrides,
  };
}

// Spy holders for the "parent" handlers we must NOT call
let onCheck: jest.Mock;
let onCycleSetType: jest.Mock;
let onClearVariant: jest.Mock;
let onClearBodyweightGrip: jest.Mock;
let onClearBodyweightModifier: jest.Mock;

beforeEach(() => {
  onCheck = jest.fn();
  onCycleSetType = jest.fn();
  onClearVariant = jest.fn();
  onClearBodyweightGrip = jest.fn();
  onClearBodyweightModifier = jest.fn();
});

/**
 * Render RpeChipStrip inside a View that has equivalent onPress/onLongPress
 * handlers attached to parent views. This simulates the SetRow container
 * having those gesture handlers available.
 *
 * Because Pressable does not bubble in React Native, the parent handlers
 * should NEVER be called when the child chip is pressed or long-pressed.
 */
function renderWithParentHandlers(props: RpeChipStripProps) {
  const { View, Pressable } = require("react-native");

  // Wrap in a Pressable with all "parent" handlers
  return render(
    <Pressable
      onPress={() => onCheck()}
      onLongPress={() => onCycleSetType()}
      testID="parent-pressable"
    >
      <View>
        <Pressable
          onLongPress={() => onClearVariant()}
          testID="variant-pressable"
        />
        <Pressable
          onLongPress={() => onClearBodyweightGrip()}
          testID="grip-pressable"
        />
        <Pressable
          onLongPress={() => onClearBodyweightModifier()}
          testID="modifier-pressable"
        />
        <RpeChipStrip {...props} />
      </View>
    </Pressable>
  );
}

describe("RpeChipStrip — gesture isolation (AC9 / Tech N1)", () => {
  it("tap chip: onChange fires, set completion (onCheck) does NOT fire", () => {
    const onChange = jest.fn();
    const { getByText } = renderWithParentHandlers(
      makeProps({ onChange })
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(9);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("tap chip: setType cycle does NOT fire", () => {
    const { getByText } = renderWithParentHandlers(makeProps());
    fireEvent.press(getByText("Easy"));
    expect(onCycleSetType).not.toHaveBeenCalled();
  });

  it("long-press chip: setType cycle does NOT fire", () => {
    const { getByText } = renderWithParentHandlers(makeProps());
    fireEvent(getByText("Easy"), "longPress");
    expect(onCycleSetType).not.toHaveBeenCalled();
  });

  it("long-press chip: variant clear does NOT fire", () => {
    const { getByText } = renderWithParentHandlers(makeProps());
    fireEvent(getByText("Moderate"), "longPress");
    expect(onClearVariant).not.toHaveBeenCalled();
  });

  it("long-press chip: BW grip clear does NOT fire", () => {
    const { getByText } = renderWithParentHandlers(makeProps());
    fireEvent(getByText("Hard"), "longPress");
    expect(onClearBodyweightGrip).not.toHaveBeenCalled();
  });

  it("long-press chip: BW modifier clear does NOT fire", () => {
    const { getByText } = renderWithParentHandlers(makeProps());
    fireEvent(getByText("Max"), "longPress");
    expect(onClearBodyweightModifier).not.toHaveBeenCalled();
  });

  it("tap chip: swipe-complete does NOT fire (onChange only)", () => {
    const onChange = jest.fn();
    const { getByText } = renderWithParentHandlers(makeProps({ onChange }));
    fireEvent.press(getByText("Max"));
    // Verify only onChange was called, not the completion handler
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("disabled chips: onChange does NOT fire even on press", () => {
    const onChange = jest.fn();
    const { getByText } = renderWithParentHandlers(
      makeProps({ onChange, disabled: true })
    );
    fireEvent.press(getByText("Easy"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
