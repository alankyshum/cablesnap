import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { PlateHint } from "../../components/session/PlateHint";
import { SetRow } from "../../components/session/SetRow";
import type { SetWithMeta } from "../../components/session/types";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => {
      const cleanup = cb();
      if (typeof cleanup === "function") return cleanup;
    }, [cb]);
  },
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    onSurfaceVariant: "#666",
    surface: "#fff",
    onSurface: "#000",
    error: "#f00",
  }),
}));

jest.mock("../../lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg" }),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

describe("PlateHint Interactive", () => {
  it("opens sheet, changes bar, closes sheet, and updates collapsed hint text", async () => {
    const { queryByText, queryByTestId, queryByRole } = render(
      <PlateHint weight={100} unit="kg" equipment="barbell" />
    );

    // 1. Initial state check: default 20kg bar used.
    // 100kg total -> (100 - 20) / 2 = 40kg per side (25 + 15)
    expect(queryByText(/Per side: 25 \+ 15/)).toBeTruthy();

    // 2. Open the sheet by pressing the PlateHint pressable.
    const pressable = queryByRole("button");
    expect(pressable).toBeTruthy();
    
    await act(async () => {
      fireEvent.press(pressable!);
    });

    // 3. Find and tap the '15' kg bar chip
    const chip15 = queryByText("15");
    expect(chip15).toBeTruthy();
    
    await act(async () => {
      fireEvent.press(chip15!);
    });

    // 4. Simulate sheet dismiss (close)
    const modal = queryByTestId("bottom-sheet-modal");
    expect(modal).toBeTruthy();
    
    await act(async () => {
      modal?.props.onDismiss();
    });

    // 5. Assert the collapsed hint reflects the new 15kg bar!
    // (100 - 15) / 2 = 42.5kg per side (25 + 15 + 2.5)
    expect(queryByText(/Per side: 25 \+ 15 \+ 2\.5/)).toBeTruthy();
  });

  it("respects row unit even when global body settings are kg (dedicated test for lb-unit consistency)", async () => {
    const { queryByText, queryByTestId, queryByRole } = render(
      <PlateHint weight={225} unit="lb" equipment="barbell" />
    );

    // 1. Initial state check: default 45 lb bar used for 'lb'.
    // 225 lb total -> (225 - 45) / 2 = 90 lb per side -> 55 + 35
    expect(queryByText(/Per side: 55 \+ 35/)).toBeTruthy();

    // 2. Open the sheet by pressing the PlateHint pressable.
    const pressable = queryByRole("button");
    expect(pressable).toBeTruthy();
    
    await act(async () => {
      fireEvent.press(pressable!);
    });

    // 3. Assert that lb bar chips are displayed instead of kg bar chips.
    // In our DB mock, body settings is 'kg' (getBodySettings returns kg),
    // but the row has unit 'lb'. It should display '35' (which is in LB_BARS: 45, 35, 25).
    // Let's wait for the async focus effect to resolve and find/tap the '35' lb bar chip.
    let chip35;
    await waitFor(() => {
      chip35 = queryByText("35");
      expect(chip35).toBeTruthy();
    });
    
    await act(async () => {
      fireEvent.press(chip35!);
    });

    // 4. Simulate sheet dismiss (close)
    const modal = queryByTestId("bottom-sheet-modal");
    expect(modal).toBeTruthy();
    
    await act(async () => {
      modal?.props.onDismiss();
    });

    // 5. Assert the collapsed hint reflects the new 35 lb bar!
    // (225 - 35) / 2 = 95 lb per side -> 55 + 35 + 5
    await waitFor(() => {
      expect(queryByText(/Per side: 55 \+ 35 \+ 5/)).toBeTruthy();
    });
  });

  it("QD m3 / AC: does NOT call SetRow onUpdate or onManualWeightSave during plate calculator interaction (float 102.5 case)", async () => {
    const onUpdate = jest.fn();
    const onManualWeightSave = jest.fn();
    const mockSet: SetWithMeta = {
      id: "s1",
      workout_session_id: "sess",
      exercise_id: 1,
      set_number: 1,
      round: null,
      weight: 102.5,
      reps: 10,
      rpe: null,
      notes: null,
      completed: false,
      set_type: "normal",
      duration_seconds: null,
      created_at: Date.now(),
      previous: "",
      is_pr: false,
    } as unknown as SetWithMeta;

    const { queryByText, queryByTestId, getByLabelText } = render(
      <SetRow
        set={mockSet}
        step={2.5}
        unit="kg"
        trackingMode="reps"
        equipment="barbell"
        onUpdate={onUpdate}
        onManualWeightSave={onManualWeightSave}
        onCheck={jest.fn()}
        onDelete={jest.fn()}
        onCycleSetType={jest.fn()}
        onLongPressSetType={jest.fn()}
      />
    );

    // Verify PlateHint is rendered with 102.5 kg
    expect(queryByText(/Per side: 25 \+ 15 \+ 1\.25/)).toBeTruthy();

    // Open sheet using the unique PlateHint pressable containing 'Per side'
    const pressable = queryByText(/Per side/);
    expect(pressable).toBeTruthy();
    await act(async () => {
      fireEvent.press(pressable!);
    });

    // Verify sheet opened and is pre-filled with 102.5
    const modal = queryByTestId("bottom-sheet-modal");
    expect(modal).toBeTruthy();

    // Find target input in sheet and change its text to 120
    const targetInput = getByLabelText("Target weight in kilograms");
    expect(targetInput.props.value).toBe("102.5");

    await act(async () => {
      fireEvent.changeText(targetInput, "120");
    });

    // Dismiss sheet
    await act(async () => {
      modal?.props.onDismiss();
    });

    // Assert that onUpdate and onManualWeightSave were NEVER called
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onManualWeightSave).not.toHaveBeenCalled();
  });
});
