/**
 * BLD-1114 — PulleyPinPickerSheet unit tests.
 *
 * Validates:
 *   - Renders N pin buttons (default maxPins=12) when visible=true
 *   - Renders clampedMax buttons for maxPins values (1..30 clamp)
 *   - Pressing a pin calls onSelect(pin) and onClose()
 *   - Pressing the selected pin toggles off (onSelect(null))
 *   - Pressing Clear calls onSelect(null) and onClose()
 *   - Not visible when visible=false
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

import { PulleyPinPickerSheet } from "../../components/session/PulleyPinPickerSheet";

function baseProps(over: Record<string, unknown> = {}) {
  return {
    visible: true,
    currentPin: null,
    maxPins: 12,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
}

describe("PulleyPinPickerSheet (BLD-1114)", () => {
  it("renders 12 pin buttons with default maxPins=12", () => {
    const { getAllByLabelText } = render(<PulleyPinPickerSheet {...baseProps()} />);
    // Each button has accessibilityLabel "Pulley pin N"
    const buttons = getAllByLabelText(/^Pulley pin \d+$/);
    expect(buttons).toHaveLength(12);
  });

  it("renders 5 pin buttons when maxPins=5", () => {
    const { getAllByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ maxPins: 5 })} />
    );
    const buttons = getAllByLabelText(/^Pulley pin \d+$/);
    expect(buttons).toHaveLength(5);
  });

  it("clamps maxPins=0 to 1 pin", () => {
    const { getAllByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ maxPins: 0 })} />
    );
    const buttons = getAllByLabelText(/^Pulley pin \d+$/);
    expect(buttons).toHaveLength(1);
  });

  it("clamps maxPins=100 to 30 pins", () => {
    const { getAllByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ maxPins: 100 })} />
    );
    const buttons = getAllByLabelText(/^Pulley pin \d+$/);
    expect(buttons).toHaveLength(30);
  });

  it("calls onSelect(pin) and onClose() when a pin is pressed", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ onSelect, onClose })} />
    );
    fireEvent.press(getByLabelText("Pulley pin 7"));
    expect(onSelect).toHaveBeenCalledWith(7);
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles off (onSelect(null)) when pressing the already-selected pin", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ currentPin: 7, onSelect, onClose })} />
    );
    fireEvent.press(getByLabelText("Pulley pin 7"));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelect(null) and onClose() when Clear is pressed", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <PulleyPinPickerSheet {...baseProps({ currentPin: 3, onSelect, onClose })} />
    );
    fireEvent.press(getByText("Clear"));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it("currently selected pin has accessibilityState selected=true", () => {
    const { getByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ currentPin: 4 })} />
    );
    const btn = getByLabelText("Pulley pin 4");
    expect(btn.props.accessibilityState?.selected).toBe(true);
  });

  it("non-selected pin has accessibilityState selected=false", () => {
    const { getByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ currentPin: 4 })} />
    );
    const btn = getByLabelText("Pulley pin 5");
    expect(btn.props.accessibilityState?.selected).toBe(false);
  });

  it("does not render buttons when visible=false", () => {
    const { queryAllByLabelText } = render(
      <PulleyPinPickerSheet {...baseProps({ visible: false })} />
    );
    // Modal is hidden — no buttons
    const buttons = queryAllByLabelText(/^Pulley pin \d+$/);
    expect(buttons).toHaveLength(0);
  });
});
