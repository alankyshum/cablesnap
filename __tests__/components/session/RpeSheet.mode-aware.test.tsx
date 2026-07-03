/**
 * BLD-2701: RpeSheet mode-aware tests.
 *
 * CEO binding conditions:
 * - Condition 1: In RIR mode, selecting "2.0 RIR" stores RPE 8 (calls onDone with 8, not 2).
 * - Condition 3: Scale constants come from lib/intensity (no inline hardcoding).
 */
import React, { createRef } from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type BottomSheet from "@gorhom/bottom-sheet";

jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const BottomSheet = ({ children }: { children: unknown }) =>
    ReactLib.createElement(View, null, children);
  BottomSheet.displayName = "MockBottomSheet";
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView: ({ children }: { children: unknown }) => ReactLib.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

import { RpeSheet } from "../../../components/session/RpeSheet";

describe("RpeSheet — RPE mode (default)", () => {
  it("renders steps 6.0 through 10.0 in RPE mode", () => {
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={jest.fn()} />
    );
    expect(getByLabelText("RPE 6.0")).toBeTruthy();
    expect(getByLabelText("RPE 10.0")).toBeTruthy();
    expect(getByLabelText("RPE 7.5")).toBeTruthy();
  });

  it("sheet title is 'Set RPE' in RPE mode", () => {
    const sheetRef = createRef<BottomSheet>();
    const { getByText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={jest.fn()} />
    );
    expect(getByText("Set RPE")).toBeTruthy();
  });

  it("selecting RPE 8.0 calls onDone with 8 in RPE mode", () => {
    const onDone = jest.fn();
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={onDone} />
    );
    fireEvent.press(getByLabelText("RPE 8.0"));
    expect(onDone).toHaveBeenCalledWith(8);
  });
});

describe("RpeSheet — RIR mode (BLD-2701)", () => {
  it("renders steps 4.0 through 0.0 in RIR mode (descending)", () => {
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={jest.fn()} intensityMode="rir" />
    );
    expect(getByLabelText("4.0 RIR")).toBeTruthy();
    expect(getByLabelText("0.0 RIR")).toBeTruthy();
    expect(getByLabelText("2.0 RIR")).toBeTruthy();
  });

  it("sheet title is 'Reps in Reserve' in RIR mode", () => {
    const sheetRef = createRef<BottomSheet>();
    const { getByText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={jest.fn()} intensityMode="rir" />
    );
    expect(getByText("Reps in Reserve")).toBeTruthy();
  });

  /**
   * CEO Condition 1: selecting "2.0 RIR" MUST store RPE 8 (not RIR 2).
   * rirToRpe(2.0) = 8.
   */
  it("selecting '2.0 RIR' calls onDone with RPE 8 — CEO condition 1", () => {
    const onDone = jest.fn();
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={onDone} intensityMode="rir" />
    );
    fireEvent.press(getByLabelText("2.0 RIR"));
    expect(onDone).toHaveBeenCalledWith(8);
    expect(onDone).not.toHaveBeenCalledWith(2);
  });

  it("selecting '0.0 RIR' calls onDone with RPE 10 — CEO condition 1", () => {
    const onDone = jest.fn();
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={onDone} intensityMode="rir" />
    );
    fireEvent.press(getByLabelText("0.0 RIR"));
    expect(onDone).toHaveBeenCalledWith(10);
    expect(onDone).not.toHaveBeenCalledWith(0);
  });

  it("selecting '4.0 RIR' calls onDone with RPE 6 — easiest", () => {
    const onDone = jest.fn();
    const sheetRef = createRef<BottomSheet>();
    const { getByLabelText } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={onDone} intensityMode="rir" />
    );
    fireEvent.press(getByLabelText("4.0 RIR"));
    expect(onDone).toHaveBeenCalledWith(6);
  });

  it("RPE mode does NOT render RIR steps and vice versa", () => {
    const sheetRef = createRef<BottomSheet>();
    const { queryByLabelText: rpeQuery } = render(
      <RpeSheet sheetRef={sheetRef} initialValue={null} onDone={jest.fn()} />
    );
    expect(rpeQuery("4.0 RIR")).toBeNull();

    const sheetRef2 = createRef<BottomSheet>();
    const { queryByLabelText: rirQuery } = render(
      <RpeSheet sheetRef={sheetRef2} initialValue={null} onDone={jest.fn()} intensityMode="rir" />
    );
    expect(rirQuery("RPE 6.0")).toBeNull();
  });
});
