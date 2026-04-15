jest.setTimeout(10000);

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";
import { createMacroTargets, resetIds } from "../../helpers/factories";

jest.mock("expo-router", () => {
  const RealReact = require("react");
  const router = { push: jest.fn(), back: jest.fn() };
  return {
    router,
    useRouter: () => router,
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

const targets = createMacroTargets({
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
});

const mockGetMacroTargets = jest.fn().mockResolvedValue(targets);
const mockUpdateMacroTargets = jest.fn().mockResolvedValue(undefined);
const mockGetAppSetting = jest.fn().mockResolvedValue(null);

jest.mock("../../../lib/db", () => ({
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
  updateMacroTargets: (...args: unknown[]) => mockUpdateMacroTargets(...args),
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
}));

import Targets from "../../../app/nutrition/targets";

const { router: mockRouter } = require("expo-router");

describe("Targets Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIds();
    mockGetMacroTargets.mockResolvedValue(targets);
    mockGetAppSetting.mockResolvedValue(null);
  });

  it("shows CTA to set profile when no profile exists", async () => {
    const { findByLabelText } = renderScreen(<Targets />);

    const cta = await findByLabelText(
      "Set your profile for personalized targets"
    );
    expect(cta).toBeTruthy();
  });

  it("navigates to profile screen on CTA press", async () => {
    const { findByLabelText } = renderScreen(<Targets />);

    const cta = await findByLabelText(
      "Set your profile for personalized targets"
    );
    fireEvent.press(cta);

    expect(mockRouter.push).toHaveBeenCalledWith("/nutrition/profile");
  });

  it("shows update profile CTA with summary when profile exists", async () => {
    const profile = JSON.stringify({
      age: 30,
      weight: 75,
      height: 175,
      sex: "male",
      activityLevel: "moderately_active",
      goal: "maintain",
      weightUnit: "kg",
      heightUnit: "cm",
    });
    mockGetAppSetting.mockResolvedValue(profile);

    const { findByLabelText, findByText } = renderScreen(<Targets />);

    const cta = await findByLabelText("Update your nutrition profile");
    expect(cta).toBeTruthy();

    expect(await findByText(/Based on:/)).toBeTruthy();
  });

  it("loads and displays current macro targets", async () => {
    const { findByText } = renderScreen(<Targets />);

    expect(await findByText("Daily Macro Targets")).toBeTruthy();
  });

  it("resets to hardcoded defaults when no profile exists", async () => {
    mockGetMacroTargets.mockResolvedValue(
      createMacroTargets({
        calories: 1800,
        protein: 120,
        carbs: 200,
        fat: 50,
      })
    );

    const { findByText, getByLabelText } = renderScreen(<Targets />);
    await findByText("Daily Macro Targets");

    fireEvent.press(getByLabelText("Reset to default targets"));

    await waitFor(() => {
      const calInput = getByLabelText("Calories");
      expect(calInput.props.value).toBe("2000");
    });
  });

  it("resets to profile-calculated values when profile exists", async () => {
    const profile = JSON.stringify({
      age: 30,
      weight: 75,
      height: 175,
      sex: "male",
      activityLevel: "moderately_active",
      goal: "maintain",
      weightUnit: "kg",
      heightUnit: "cm",
    });
    mockGetAppSetting.mockResolvedValue(profile);

    const { findByText, getByLabelText } = renderScreen(<Targets />);
    await findByText("Daily Macro Targets");

    fireEvent.press(getByLabelText("Reset to default targets"));

    await waitFor(() => {
      const calInput = getByLabelText("Calories");
      // Profile-calculated value should differ from hardcoded 2000
      expect(calInput.props.value).not.toBe("2000");
    });
  });

  it("saves targets and navigates back", async () => {
    const { findByText, getByLabelText } = renderScreen(<Targets />);
    await findByText("Daily Macro Targets");

    fireEvent.press(getByLabelText("Save macro targets"));

    await waitFor(() => {
      expect(mockUpdateMacroTargets).toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalled();
    });
  });
});
