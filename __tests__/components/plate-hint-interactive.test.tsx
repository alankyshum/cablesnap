import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { PlateHint } from "../../components/session/PlateHint";

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
    const { queryByText, queryByTestId, queryByLabelText, queryByRole, debug } = render(
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
});
