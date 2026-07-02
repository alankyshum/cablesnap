/**
 * AC14 regression test: MacroTargetsSheet must show the C2 verbatim helper string
 * when Training-Day Macros feature is enabled, and must NOT show it when disabled.
 *
 * Verbatim copy (psychologist C2 — wording may NOT change without psych sign-off):
 *   "This is your base target. Training-day fueling is applied on top —
 *    manage it in Settings › Training-Day Macros."
 *
 * Binding ACs: AC14, AC16 (no banned lexemes, no directional color on this copy)
 */
import React from "react";
import { waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";

// ─── Shared mocks ──────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/test",
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("@react-navigation/native", () => {
  const RealReact = require("react");
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, []);
    },
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("../../../lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}));

const mockGetMacroTargets = jest.fn().mockResolvedValue({
  calories: 2000, protein: 150, carbs: 250, fat: 65,
});
const mockGetAppSetting = jest.fn().mockResolvedValue(null);

jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
  updateMacroTargets: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../lib/nutrition-calc", () => ({
  calculateFromProfile: jest.fn(() => ({ calories: 2000, protein: 150, carbs: 250, fat: 65 })),
  migrateProfile: jest.fn((p: unknown) => p),
}));

const mockGetAllSettings = jest.fn();
jest.mock("../../../lib/db/training-day-settings", () => ({
  getAllSettings: (...args: unknown[]) => mockGetAllSettings(...args),
}));

import { MacroTargetsSheet } from "../../../components/nutrition/MacroTargetsSheet";

// ─── AC14 verbatim string (binding — do not modify) ──────────────────────────

const AC14_HELPER =
  "This is your base target. Training-day fueling is applied on top — manage it in Settings › Training-Day Macros.";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MacroTargetsSheet — AC14 Training-Day helper (C2 verbatim)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMacroTargets.mockResolvedValue({ calories: 2000, protein: 150, carbs: 250, fat: 65 });
    mockGetAppSetting.mockResolvedValue(null);
  });

  it("AC14: shows the C2 verbatim helper text when Training-Day Macros is enabled", async () => {
    mockGetAllSettings.mockResolvedValue({
      enabled: true,
      splitPercent: 10,
      trainingDaysPerWeek: 4,
    });

    const { queryByText } = renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    );

    await waitFor(() => {
      const el = queryByText(AC14_HELPER);
      expect(el).not.toBeNull();
    });
  });

  it("AC14: does NOT show the helper text when Training-Day Macros is disabled", async () => {
    mockGetAllSettings.mockResolvedValue({
      enabled: false,
      splitPercent: 10,
      trainingDaysPerWeek: 4,
    });

    const { queryByText } = renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    );

    await waitFor(() => {
      // Wait for all effects to settle (getMacroTargets + getAllSettings)
      expect(mockGetAllSettings).toHaveBeenCalled();
    });

    const el = queryByText(AC14_HELPER);
    expect(el).toBeNull();
  });

  it("AC14: does NOT show the helper text when getAllSettings throws (safe default)", async () => {
    mockGetAllSettings.mockRejectedValue(new Error("DB unavailable"));

    const { queryByText } = renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    );

    await waitFor(() => {
      expect(mockGetAllSettings).toHaveBeenCalled();
    });

    const el = queryByText(AC14_HELPER);
    expect(el).toBeNull();
  });

  it("AC14: helper text is absent when the sheet is not visible", () => {
    mockGetAllSettings.mockResolvedValue({ enabled: true, splitPercent: 10, trainingDaysPerWeek: 4 });

    const { queryByText } = renderScreen(
      <MacroTargetsSheet visible={false} onClose={jest.fn()} />
    );

    // visible=false → useEffect skips loading → getAllSettings never called → helper absent
    const el = queryByText(AC14_HELPER);
    expect(el).toBeNull();
  });
});
