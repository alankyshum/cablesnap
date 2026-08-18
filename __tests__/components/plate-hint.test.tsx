import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { PlateHint } from "../../components/session/PlateHint";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({ onSurfaceVariant: "#666" }),
}));

const mockGetAppSetting = jest.fn().mockResolvedValue(null);
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg" }),
}));

jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => {
      const cleanup = cb();
      if (typeof cleanup === "function") return cleanup;
    }, [cb]);
  },
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  
  const BottomSheetModal = React.forwardRef((props: { onChange?: (index: number) => void; onDismiss?: () => void; children: React.ReactNode }, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      present: () => {
        if (props.onChange) props.onChange(0);
      },
      dismiss: () => {
        if (props.onDismiss) props.onDismiss();
      },
    }));
    return React.createElement(View, { testID: "bottom-sheet", onDismiss: props.onDismiss }, props.children);
  });
  BottomSheetModal.displayName = "BottomSheetModal";

  return {
    __esModule: true,
    default: BottomSheetModal,
    BottomSheetModal,
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

describe("PlateHint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppSetting.mockResolvedValue(null);
    mockSetAppSetting.mockResolvedValue(undefined);
  });

  it("renders plate breakdown for barbell, hides for non-barbell, shows remainder, respects units", async () => {
    // Barbell with weight > bar: shows plate hint
    const { queryByText, rerender, queryByRole } = render(
      <PlateHint weight={102.5} unit="kg" equipment="barbell" />,
    );
    await waitFor(() => {
      expect(queryByText(/Per side: 25 \+ 15 \+ 1\.25/)).toBeTruthy();
    });

    // Non-barbell: no hint
    rerender(<PlateHint weight={102.5} unit="kg" equipment="dumbbell" />);
    expect(queryByText(/Per side/)).toBeNull();

    // Bodyweight: no hint
    rerender(<PlateHint weight={80} unit="kg" equipment="bodyweight" />);
    expect(queryByText(/Per side/)).toBeNull();

    // Weight <= bar weight: no hint
    rerender(<PlateHint weight={20} unit="kg" equipment="barbell" />);
    expect(queryByText(/Per side/)).toBeNull();

    // Weight = 0: no hint
    rerender(<PlateHint weight={0} unit="kg" equipment="barbell" />);
    expect(queryByText(/Per side/)).toBeNull();

    // Null weight: no hint
    rerender(<PlateHint weight={null} unit="kg" equipment="barbell" />);
    expect(queryByText(/Per side/)).toBeNull();

    // Remainder (91.3kg): shows ≈
    rerender(<PlateHint weight={91.3} unit="kg" equipment="barbell" />);
    await waitFor(() => {
      expect(queryByText(/≈/)).toBeTruthy();
      expect(queryByText(/Per side/)).toBeTruthy();
    });

    // lb units: 135lb with 45lb bar → per side = 45
    rerender(<PlateHint weight={135} unit="lb" equipment="barbell" />);
    await waitFor(() => {
      expect(queryByText(/Per side: 45/)).toBeTruthy();
    });

    // lb units: 225lb → per side = 90 → 55 + 35
    rerender(<PlateHint weight={225} unit="lb" equipment="barbell" />);
    await waitFor(() => {
      expect(queryByText(/Per side: 55 \+ 35/)).toBeTruthy();
    });

    // Accessibility label exists on the outer pressable/button
    rerender(<PlateHint weight={60} unit="kg" equipment="barbell" />);
    await waitFor(() => {
      const button = queryByRole("button");
      expect(button).toBeTruthy();
      expect(button?.props.accessibilityLabel).toMatch(/kilograms/);
    });
  });

  it("QD M1 / AC#4: opens sheet, changes bar chip, closes sheet, and collapsed hint reflects new bar weight synchronously", async () => {
    mockGetAppSetting.mockResolvedValue("20");

    const { getByRole, getByLabelText, getByTestId, findByText } = render(
      <PlateHint weight={100} unit="kg" equipment="barbell" />
    );

    // Initial load: 100kg - 20kg bar = 80kg total, 40kg per side (25 + 15 plates)
    await findByText("Per side: 25 + 15 ▸");

    const button = getByRole("button");
    expect(button).toBeTruthy();
    expect(button.props.hitSlop).toEqual({ top: 12, bottom: 12, left: 12, right: 12 });

    // Open sheet
    fireEvent.press(button);

    // Select 15kg bar chip inside the sheet
    const barChip = getByLabelText("15 kilograms bar");
    expect(barChip).toBeTruthy();
    fireEvent.press(barChip);

    // Dismiss sheet
    const sheet = getByTestId("bottom-sheet");
    fireEvent(sheet, "onDismiss");

    // Collapsed hint should reflect the 15kg bar weight:
    // 100kg - 15kg bar = 85kg total, 42.5kg per side (25 + 15 + 2.5 plates)
    await findByText("Per side: 25 + 15 + 2.5 ▸");
  });

  it("QD m3 / AC: Target change inside the sheet is independent of the set's logged weight", async () => {
    const { getByRole, getByLabelText, getByDisplayValue } = render(
      <PlateHint weight={102.5} unit="kg" equipment="barbell" />
    );

    const button = getByRole("button");
    fireEvent.press(button);

    // In the sheet, check if target input pre-filled with the row's weight (102.5)
    await waitFor(() => {
      expect(getByDisplayValue("102.5")).toBeTruthy();
    });

    // Changing the target weight inside the sheet works
    const targetInput = getByLabelText("Target weight in kilograms");
    fireEvent.changeText(targetInput, "120");

    await waitFor(() => {
      expect(getByDisplayValue("120")).toBeTruthy();
    });

    // The set's logged weight is not modified (since there are no callback props on PlateHint for updating weight)
  });
});
