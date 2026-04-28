import React from "react";
import { render } from "@testing-library/react-native";
import { PlateHint } from "../../components/session/PlateHint";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({ onSurfaceVariant: "#666" }),
}));

jest.mock("../../lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
}));

describe("PlateHint", () => {
  it("renders plate breakdown for barbell, hides for non-barbell, shows remainder, respects units", () => {
    // Barbell with weight > bar: shows plate hint
    const { queryByText, rerender } = render(
      <PlateHint weight={102.5} unit="kg" equipment="barbell" />,
    );
    expect(queryByText(/Per side: 25 \+ 15 \+ 1\.25/)).toBeTruthy();

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
    expect(queryByText(/≈/)).toBeTruthy();
    expect(queryByText(/Per side/)).toBeTruthy();

    // lb units: 135lb with 45lb bar → per side = 45
    rerender(<PlateHint weight={135} unit="lb" equipment="barbell" />);
    expect(queryByText(/Per side: 45/)).toBeTruthy();

    // lb units: 225lb → per side = 90 → 55 + 35
    rerender(<PlateHint weight={225} unit="lb" equipment="barbell" />);
    expect(queryByText(/Per side: 55 \+ 35/)).toBeTruthy();

    // Accessibility label exists
    rerender(<PlateHint weight={60} unit="kg" equipment="barbell" />);
    const text = queryByText(/Per side: 20/);
    expect(text).toBeTruthy();
    expect(text?.props.accessibilityLabel).toMatch(/kilograms/);
  });
});
