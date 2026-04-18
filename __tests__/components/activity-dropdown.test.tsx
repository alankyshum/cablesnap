import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { renderScreen } from "../helpers/render";

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    usePathname: () => "/test",
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, []);
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  };
});

jest.mock("../../lib/db", () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg", height_unit: "cm" }),
  getNutritionProfile: jest.fn().mockResolvedValue(null),
  saveNutritionProfile: jest.fn().mockResolvedValue(undefined),
}));

import { ActivityDropdown } from "../../components/profile/ActivityDropdown";
import { ACTIVITY_LABELS, ACTIVITY_DESCRIPTIONS } from "../../lib/nutrition-calc";

describe("ActivityDropdown (BLD-345)", () => {
  it("displays selected level label and description", () => {
    const { getByText } = renderScreen(
      <ActivityDropdown
        value="moderately_active"
        onChange={jest.fn()}
        visible={false}
        onToggle={jest.fn()}
      />,
    );

    expect(getByText("Moderately Active")).toBeTruthy();
    expect(getByText("Moderate exercise 3–5 days/week")).toBeTruthy();
  });

  it("shows all options with descriptions when expanded", () => {
    const { getAllByText, getByText } = renderScreen(
      <ActivityDropdown
        value="sedentary"
        onChange={jest.fn()}
        visible={true}
        onToggle={jest.fn()}
      />,
    );

    // Selected level appears in trigger + list
    expect(getAllByText("Sedentary").length).toBeGreaterThanOrEqual(2);
    // Other labels visible in list
    expect(getByText("Lightly Active")).toBeTruthy();
    expect(getByText("Very Active")).toBeTruthy();
    expect(getByText("Extra Active")).toBeTruthy();

    // Descriptions visible
    expect(getAllByText("Little or no exercise, desk job").length).toBeGreaterThanOrEqual(1);
    expect(getByText("Hard exercise 6–7 days/week")).toBeTruthy();
  });

  it("calls onChange when an option is pressed", () => {
    const onChange = jest.fn();
    const { getByText } = renderScreen(
      <ActivityDropdown
        value="sedentary"
        onChange={onChange}
        visible={true}
        onToggle={jest.fn()}
      />,
    );

    fireEvent.press(getByText("Very Active"));
    expect(onChange).toHaveBeenCalledWith("very_active");
  });

  it("ACTIVITY_DESCRIPTIONS has entries for all activity levels", () => {
    const levels = Object.keys(ACTIVITY_LABELS);
    for (const level of levels) {
      expect(ACTIVITY_DESCRIPTIONS[level as keyof typeof ACTIVITY_DESCRIPTIONS]).toBeTruthy();
    }
  });
});
