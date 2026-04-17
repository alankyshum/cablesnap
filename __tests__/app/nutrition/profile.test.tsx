jest.setTimeout(10000);

import React from "react";
import { waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";

const mockRouter = { push: jest.fn(), back: jest.fn() };

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, []);
    },
    Stack: { Screen: () => null },
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("../../../lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}));
jest.mock("../../../lib/errors", () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue("{}"),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue("https://github.com"),
}));
jest.mock("../../../lib/interactions", () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "/cache" },
}));

const mockGetAppSetting = jest.fn().mockResolvedValue(null);
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
const mockUpdateMacroTargets = jest.fn().mockResolvedValue(undefined);
const mockGetBodySettings = jest.fn().mockResolvedValue({
  weight_unit: "kg",
  measurement_unit: "cm",
});
const mockGetLatestBodyWeight = jest.fn().mockResolvedValue(null);

jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  updateMacroTargets: (...args: unknown[]) => mockUpdateMacroTargets(...args),
}));

jest.mock("../../../lib/db/body", () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
  getLatestBodyWeight: (...args: unknown[]) => mockGetLatestBodyWeight(...args),
}));

import ProfileScreen from "../../../app/nutrition/profile";

describe("Profile Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppSetting.mockResolvedValue(null);
    mockGetBodySettings.mockResolvedValue({
      weight_unit: "kg",
      measurement_unit: "cm",
    });
    mockGetLatestBodyWeight.mockResolvedValue(null);
  });

  it("renders all profile fields", async () => {
    const { findByText, getByLabelText } = renderScreen(<ProfileScreen />);

    expect(await findByText("Your Profile")).toBeTruthy();
    expect(getByLabelText("Birth year")).toBeTruthy();
    expect(getByLabelText("Weight in kg")).toBeTruthy();
    expect(getByLabelText("Height in cm")).toBeTruthy();
    expect(getByLabelText("Calculate and save nutrition targets")).toBeTruthy();
  });

  it("pre-fills weight from latest body weight entry", async () => {
    mockGetLatestBodyWeight.mockResolvedValue({ weight: 75 });
    const { findByLabelText } = renderScreen(<ProfileScreen />);

    const weightInput = await findByLabelText("Weight in kg");
    await waitFor(() => {
      expect(weightInput.props.value).toBe("75");
    });
  });

  it("loads saved profile data", async () => {
    const savedProfile = JSON.stringify({
      birthYear: 1996,
      weight: 80,
      height: 180,
      sex: "male",
      activityLevel: "moderately_active",
      goal: "maintain",
      weightUnit: "kg",
      heightUnit: "cm",
    });
    mockGetAppSetting.mockResolvedValue(savedProfile);

    const { findByLabelText } = renderScreen(<ProfileScreen />);

    const birthYearInput = await findByLabelText("Birth year");
    await waitFor(() => {
      expect(birthYearInput.props.value).toBe("1996");
    });
  });

  it("shows validation errors for empty fields on save attempt", async () => {
    const { findByText, getByLabelText } = renderScreen(<ProfileScreen />);

    await findByText("Your Profile");
    const saveBtn = getByLabelText("Calculate and save nutrition targets");
    const { fireEvent } = require("@testing-library/react-native");
    fireEvent.press(saveBtn);

    const currentYear = new Date().getFullYear();
    expect(await findByText(`Enter a valid birth year (1900–${currentYear - 1})`)).toBeTruthy();
    expect(await findByText("Enter a valid weight")).toBeTruthy();
    expect(await findByText("Enter a valid height")).toBeTruthy();
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it("shows error banner when load fails", async () => {
    mockGetAppSetting.mockRejectedValueOnce(new Error("DB read failed"));

    const { findByText } = renderScreen(<ProfileScreen />);

    expect(
      await findByText("Could not load your profile. Please try again.")
    ).toBeTruthy();
  });

  it("displays segmented buttons for sex, activity, and goal", async () => {
    const { findByText } = renderScreen(<ProfileScreen />);

    expect(await findByText("Sex")).toBeTruthy();
    expect(await findByText("Activity Level")).toBeTruthy();
    expect(await findByText("Goal")).toBeTruthy();
    expect(await findByText("Male")).toBeTruthy();
    expect(await findByText("Female")).toBeTruthy();
  });
});
