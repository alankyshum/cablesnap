/**
 * BLD-2701: RpeChipStrip mode-aware tests.
 *
 * CEO binding conditions enforced here:
 * - Condition 1: In RIR mode, chip tap still calls onChange with RPE-scale value.
 * - Condition 3: Scale constants come from lib/intensity.ts (no inline duplication).
 * - A11y labels flip per mode.
 *
 * These tests extend the existing BLD-1110 tests for the new intensity mode prop.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => {
  return {
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
    withDelay: (_d: unknown, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    FadeIn: { duration: () => ({}) },
    runOnJS: (fn: unknown) => fn,
    Easing: { bezier: () => () => 0, linear: () => () => 0 },
  };
});

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
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView: ({ children }: { children: unknown }) => ReactLib.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

import { RpeChipStrip } from "../../../components/session/RpeChipStrip";

// ─── RPE mode (default, backward-compatible) ──────────────────────

describe("RpeChipStrip — RPE mode (default)", () => {
  it("renders 4 chips in RPE mode", () => {
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} />
    );
    expect(getByText("Easy")).toBeTruthy();
    expect(getByText("Moderate")).toBeTruthy();
    expect(getByText("Hard")).toBeTruthy();
    expect(getByText("Max")).toBeTruthy();
  });

  it("a11y labels use RPE format in default mode", () => {
    const { getAllByRole } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} />
    );
    const radios = getAllByRole("radio");
    const labels = radios.map((r) => r.props.accessibilityLabel);
    expect(labels).toContain("RPE 6, easy");
    expect(labels).toContain("RPE 7.5, moderate");
    expect(labels).toContain("RPE 9, hard");
    expect(labels).toContain("RPE 10, max");
  });

  it("tapping Hard chip in RPE mode calls onChange with RPE 9", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} />
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it("container a11y label uses RPE language in RPE mode", () => {
    const { getByLabelText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} />
    );
    expect(getByLabelText("RPE for set s1")).toBeTruthy();
  });
});

// ─── RIR mode (BLD-2701) ──────────────────────────────────────────

describe("RpeChipStrip — RIR mode (BLD-2701)", () => {
  it("renders 4 chips in RIR mode", () => {
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    expect(getByText("Easy")).toBeTruthy();
    expect(getByText("Moderate")).toBeTruthy();
    expect(getByText("Hard")).toBeTruthy();
    expect(getByText("Max")).toBeTruthy();
  });

  it("a11y labels use RIR format in RIR mode", () => {
    const { getAllByRole } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    const radios = getAllByRole("radio");
    const labels = radios.map((r) => r.props.accessibilityLabel);
    // RPE 6 → 4 RIR, RPE 7.5 → 2.5 RIR, RPE 9 → 1 RIR, RPE 10 → 0 RIR
    expect(labels).toContain("4 RIR, easy");
    expect(labels).toContain("2.5 RIR, moderate");
    expect(labels).toContain("1 RIR, hard");
    expect(labels).toContain("0 RIR, max");
  });

  /**
   * CEO Condition 1: In RIR mode, chip tap MUST still call onChange with
   * the RPE-scale value. The chip "Hard" stores RPE 9, displayed as "1 RIR".
   */
  it("tapping Hard chip in RIR mode calls onChange with RPE 9 (NOT 1 RIR) — CEO condition 1", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Hard"));
    // MUST be RPE 9, NOT RIR 1
    expect(onChange).toHaveBeenCalledWith(9);
    expect(onChange).not.toHaveBeenCalledWith(1);
  });

  it("tapping Easy chip in RIR mode calls onChange with RPE 6 — CEO condition 1", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Easy"));
    expect(onChange).toHaveBeenCalledWith(6);
    expect(onChange).not.toHaveBeenCalledWith(4);
  });

  it("tapping Max chip in RIR mode calls onChange with RPE 10 — CEO condition 1", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Max"));
    expect(onChange).toHaveBeenCalledWith(10);
    expect(onChange).not.toHaveBeenCalledWith(0);
  });

  it("tapping Moderate chip in RIR mode calls onChange with RPE 7.5 — CEO condition 1", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Moderate"));
    expect(onChange).toHaveBeenCalledWith(7.5);
  });

  it("container a11y label uses RIR language in RIR mode", () => {
    const { getByLabelText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    expect(getByLabelText("Reps in reserve for set s1")).toBeTruthy();
  });

  it("tapping selected chip deselects in RIR mode (onChange null)", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={9} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ── BLD-2739 Fix 2: visible numeric annotation per chip ──────────

describe("RpeChipStrip — visible chip numeric annotation (BLD-2739)", () => {
  /**
   * Each chip must render the numeric annotation as visible text alongside the qualitative label.
   * RPE mode: Hard chip shows "RPE 9" below "Hard".
   * RIR mode: Hard chip shows "1 RIR" below "Hard".
   */
  it("RPE mode: Hard chip renders visible annotation 'RPE 9'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    // testID="chip-annotation-9" is on the annotation Text for Hard (RPE value 9)
    const annotation = getByTestId("chip-annotation-9");
    expect(annotation.props.children).toBe("RPE 9");
  });

  it("RPE mode: Easy chip renders visible annotation 'RPE 6'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    const annotation = getByTestId("chip-annotation-6");
    expect(annotation.props.children).toBe("RPE 6");
  });

  it("RPE mode: Max chip renders visible annotation 'RPE 10'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    const annotation = getByTestId("chip-annotation-10");
    expect(annotation.props.children).toBe("RPE 10");
  });

  it("RPE mode: Moderate chip renders visible annotation 'RPE 7.5'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    const annotation = getByTestId("chip-annotation-7.5");
    expect(annotation.props.children).toBe("RPE 7.5");
  });

  it("RIR mode: Hard chip renders visible annotation '1 RIR'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    const annotation = getByTestId("chip-annotation-9");
    expect(annotation.props.children).toBe("1 RIR");
  });

  it("RIR mode: Easy chip renders visible annotation '4 RIR'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    const annotation = getByTestId("chip-annotation-6");
    expect(annotation.props.children).toBe("4 RIR");
  });

  it("RIR mode: Max chip renders visible annotation '0 RIR'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    const annotation = getByTestId("chip-annotation-10");
    expect(annotation.props.children).toBe("0 RIR");
  });

  it("RIR mode: Moderate chip renders visible annotation '2.5 RIR'", () => {
    const { getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    const annotation = getByTestId("chip-annotation-7.5");
    expect(annotation.props.children).toBe("2.5 RIR");
  });

  /**
   * Both qualitative label AND numeric annotation render together per chip.
   * Ensures both text elements are present in the chip.
   */
  it("Hard chip (RPE mode): renders both qualitative 'Hard' and annotation 'RPE 9'", () => {
    const { getByText, getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    expect(getByText("Hard")).toBeTruthy();
    expect(getByTestId("chip-annotation-9").props.children).toBe("RPE 9");
  });

  it("Hard chip (RIR mode): renders both qualitative 'Hard' and annotation '1 RIR'", () => {
    const { getByText, getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    expect(getByText("Hard")).toBeTruthy();
    expect(getByTestId("chip-annotation-9").props.children).toBe("1 RIR");
  });

  /**
   * Annotation flips when mode changes — all 4 chips update simultaneously.
   * This verifies the mode prop is threaded to chipAnnotation() for every chip.
   */
  it("all 4 chip annotations flip together when mode changes rpe→rir", () => {
    const { rerender, getByTestId } = render(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rpe" />
    );
    // Verify RPE mode
    expect(getByTestId("chip-annotation-6").props.children).toBe("RPE 6");
    expect(getByTestId("chip-annotation-9").props.children).toBe("RPE 9");

    // Switch to RIR mode
    rerender(
      <RpeChipStrip setId="s1" value={null} onChange={jest.fn()} intensityMode="rir" />
    );
    // All annotations must now be in RIR
    expect(getByTestId("chip-annotation-6").props.children).toBe("4 RIR");
    expect(getByTestId("chip-annotation-7.5").props.children).toBe("2.5 RIR");
    expect(getByTestId("chip-annotation-9").props.children).toBe("1 RIR");
    expect(getByTestId("chip-annotation-10").props.children).toBe("0 RIR");
  });

  /**
   * onChange STILL emits RPE-scale value when a chip with a visible RIR annotation is pressed.
   * Combined regression: visible label changed BUT emitted value did not.
   */
  it("RIR mode: pressing Hard chip (shows '1 RIR') still fires onChange(9) — CEO condition 1", () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <RpeChipStrip setId="s1" value={null} onChange={onChange} intensityMode="rir" />
    );
    fireEvent.press(getByText("Hard"));
    expect(onChange).toHaveBeenCalledWith(9); // RPE 9, not RIR 1
  });
});
