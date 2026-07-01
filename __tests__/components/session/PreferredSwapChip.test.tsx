/**
 * BLD-2561: PreferredSwapChip component tests.
 *
 * AC coverage:
 *   - Chip renders "Swap to {name}" in idle state (presence guard)
 *   - Chip renders "Swapped to {name} · Undo" in swapped state with icon prefix
 *   - Pressing the chip in idle state calls onPress (≤1 tap — no intermediate)
 *   - Pressing the chip in swapped state calls onPress (undo in 1 tap)
 *   - A11y: accessibilityRole="button" present
 *   - A11y: minHeight 44 (style verified)
 *   - A11y: pre-swap label includes source + target name
 *   - A11y: post-swap label announces "swapped to + undo"
 *   - Non-color affordance: swap-horizontal icon present in swapped state
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PreferredSwapChip } from "../../../components/session/PreferredSwapChip";

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
    outline: "#79747e",
    onSurfaceVariant: "#49454f",
  }),
}));

describe("PreferredSwapChip", () => {
  describe("idle state (isSwapped=false)", () => {
    it('renders "Swap to {preferredName}" label', () => {
      const { getByText } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={jest.fn()}
        />,
      );
      expect(getByText("Swap to Machine Row")).toBeTruthy();
    });

    it("calls onPress in exactly 1 press — fast-path asserted", () => {
      const onPress = jest.fn();
      const { getByText } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={onPress}
        />,
      );
      fireEvent.press(getByText("Swap to Machine Row"));
      // ≤1 tap: onPress called exactly once per user tap, no intermediate confirm.
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("has accessibilityRole=button", () => {
      const { UNSAFE_getByProps } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={jest.fn()}
        />,
      );
      const pressable = UNSAFE_getByProps({ accessibilityRole: "button" });
      expect(pressable).toBeTruthy();
    });

    it("pre-swap a11y label includes source exercise and preferred name", () => {
      const { UNSAFE_getByProps } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={jest.fn()}
        />,
      );
      const pressable = UNSAFE_getByProps({ accessibilityRole: "button" });
      const label: string = pressable.props.accessibilityLabel ?? "";
      expect(label).toContain("Cable Row");
      expect(label).toContain("Machine Row");
    });

    it("does NOT render swap-horizontal icon in idle state (no false-positive affordance)", () => {
      const { queryByTestId } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={jest.fn()}
        />,
      );
      // swap-horizontal icon is only the undo affordance (non-color indicator)
      expect(queryByTestId("icon-swap-horizontal")).toBeNull();
    });

    it("chip style has minHeight 44 (touch target requirement)", () => {
      const { UNSAFE_getByProps } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          onPress={jest.fn()}
        />,
      );
      const pressable = UNSAFE_getByProps({ accessibilityRole: "button" });
      // StyleSheet flattens: check the style array or direct prop.
      const style = pressable.props.style;
      const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style ?? {};
      expect(flatStyle.minHeight).toBe(44);
    });
  });

  describe("swapped state (isSwapped=true)", () => {
    it('renders "Swapped to {name} · Undo" label', () => {
      const { getByText } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          isSwapped
          swappedToName="Machine Row"
          onPress={jest.fn()}
        />,
      );
      expect(getByText("Swapped to Machine Row · Undo")).toBeTruthy();
    });

    it("renders swap-horizontal icon as non-color affordance", () => {
      const { getByTestId } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          isSwapped
          onPress={jest.fn()}
        />,
      );
      expect(getByTestId("icon-swap-horizontal")).toBeTruthy();
    });

    it("calling onPress in swapped state triggers undo in 1 press", () => {
      const onPress = jest.fn();
      const { getByText } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          isSwapped
          swappedToName="Machine Row"
          onPress={onPress}
        />,
      );
      fireEvent.press(getByText("Swapped to Machine Row · Undo"));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("post-swap a11y label conveys swapped state and undo availability", () => {
      const { UNSAFE_getByProps } = render(
        <PreferredSwapChip
          preferredName="Machine Row"
          exerciseName="Cable Row"
          isSwapped
          swappedToName="Machine Row"
          onPress={jest.fn()}
        />,
      );
      const pressable = UNSAFE_getByProps({ accessibilityRole: "button" });
      const label: string = pressable.props.accessibilityLabel ?? "";
      expect(label.toLowerCase()).toContain("swapped");
      expect(label.toLowerCase()).toContain("undo");
    });
  });
});
