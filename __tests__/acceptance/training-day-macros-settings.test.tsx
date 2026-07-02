/**
 * Component tests for app/settings/training-day-macros.tsx
 *
 * AC14: C2 verbatim settings explainer body is rendered
 * AC19: Default OFF state shown, off-ramp line (C5) present, logged-workout copy (QD5)
 * AC20: Live preview shows training day, rest day, and weekly average
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { renderScreen } from "../helpers/render";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetEnabled = jest.fn().mockResolvedValue(false);
const mockGetSplitPercent = jest.fn().mockResolvedValue(10);
const mockGetTrainingDaysPerWeek = jest.fn().mockResolvedValue(4);
const mockSetEnabled = jest.fn().mockResolvedValue(undefined);
const mockSetSplitPercent = jest.fn().mockResolvedValue(undefined);
const mockSetTrainingDaysPerWeek = jest.fn().mockResolvedValue(undefined);

jest.mock("../../lib/db/training-day-settings", () => ({
  getEnabled: (...args: unknown[]) => mockGetEnabled(...args),
  getSplitPercent: (...args: unknown[]) => mockGetSplitPercent(...args),
  getTrainingDaysPerWeek: (...args: unknown[]) => mockGetTrainingDaysPerWeek(...args),
  setEnabled: (...args: unknown[]) => mockSetEnabled(...args),
  setSplitPercent: (...args: unknown[]) => mockSetSplitPercent(...args),
  setTrainingDaysPerWeek: (...args: unknown[]) => mockSetTrainingDaysPerWeek(...args),
}));

const mockGetMacroTargets = jest.fn().mockResolvedValue({
  id: "test-id",
  calories: 2400,
  protein: 160,
  carbs: 250,
  fat: 65,
  updated_at: Date.now(),
});

jest.mock("../../lib/db", () => ({
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect: (cb: () => () => void) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { const cleanup = cb(); return typeof cleanup === "function" ? cleanup : undefined; }, []);
  },
  Stack: { Screen: () => null },
}));

import TrainingDayMacrosScreen from "../../app/settings/training-day-macros";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TrainingDayMacrosScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnabled.mockResolvedValue(false);
    mockGetSplitPercent.mockResolvedValue(10);
    mockGetTrainingDaysPerWeek.mockResolvedValue(4);
    mockGetMacroTargets.mockResolvedValue({
      id: "test-id",
      calories: 2400,
      protein: 160,
      carbs: 250,
      fat: 65,
      updated_at: Date.now(),
    });
  });

  // ── AC19: Default OFF state ────────────────────────────────────────

  it("AC19: renders the enable switch with correct accessible label", async () => {
    const { findByLabelText } = renderScreen(<TrainingDayMacrosScreen />);
    const sw = await findByLabelText("Enable Training-Day Macro Adjustment");
    expect(sw).toBeTruthy();
  });

  it("AC19: switch starts in OFF state when getEnabled returns false", async () => {
    const { findByLabelText } = renderScreen(<TrainingDayMacrosScreen />);
    const sw = await findByLabelText("Enable Training-Day Macro Adjustment");
    // Switch value should be false → accessibilityState.checked = false
    expect(sw.props.value).toBe(false);
  });

  // ── AC14: C2 verbatim settings explainer ──────────────────────────

  it("AC14: renders the C2 verbatim settings opt-in body", async () => {
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    // Check for the key phrase from the psychologist-approved C2 copy
    expect(
      await findByText(/This is about fueling recovery, not a reward for exercising/)
    ).toBeTruthy();
  });

  it("AC14: renders the section heading 'How it works'", async () => {
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(await findByText("How it works")).toBeTruthy();
  });

  // ── AC19: C5 off-ramp line ─────────────────────────────────────────

  it("AC19 (C5): renders the off-ramp line", async () => {
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(
      await findByText(/Not for everyone — if adjusting food around workouts feels stressful/)
    ).toBeTruthy();
  });

  // ── AC19: QD5 logged-workout copy ─────────────────────────────────

  it("AC19 (QD5): renders 'logged workouts' note", async () => {
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(
      await findByText(/based on your logged workouts/)
    ).toBeTruthy();
  });

  // ── AC20: Live preview when enabled ──────────────────────────────

  it("AC20: renders preview with Training day, Rest day, Weekly average when enabled", async () => {
    mockGetEnabled.mockResolvedValue(true);
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(await findByText("Training day")).toBeTruthy();
    expect(await findByText("Rest day")).toBeTruthy();
    expect(await findByText("Weekly average")).toBeTruthy();
  });

  it("AC20: preview section is NOT shown when feature is disabled", async () => {
    mockGetEnabled.mockResolvedValue(false);
    const { queryByText } = renderScreen(<TrainingDayMacrosScreen />);
    await waitFor(() => {
      expect(queryByText("Training day")).toBeNull();
      expect(queryByText("Rest day")).toBeNull();
    });
  });

  // ── Parameter controls when enabled ──────────────────────────────

  it("renders split percent stepper when enabled", async () => {
    mockGetEnabled.mockResolvedValue(true);
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(await findByText("Training boost")).toBeTruthy();
    expect(await findByText("10%")).toBeTruthy();
  });

  it("renders training days stepper when enabled", async () => {
    mockGetEnabled.mockResolvedValue(true);
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    expect(await findByText("Training days per week")).toBeTruthy();
    expect(await findByText("4/week")).toBeTruthy();
  });

  // ── Toggle calls setter ────────────────────────────────────────────

  it("toggling the switch calls setEnabled with true", async () => {
    const { findByLabelText } = renderScreen(<TrainingDayMacrosScreen />);
    const sw = await findByLabelText("Enable Training-Day Macro Adjustment");
    fireEvent(sw, "onValueChange", true);
    await waitFor(() => {
      expect(mockSetEnabled).toHaveBeenCalledWith(true);
    });
  });

  // ── No banned copy in badge/dynamic copy ─────────────────────────

  it("AC16 (C1): preview labels do not use banned reward-framing words (badge-style copy)", async () => {
    mockGetEnabled.mockResolvedValue(true);
    const { findByText } = renderScreen(<TrainingDayMacrosScreen />);
    // Wait for preview to render
    const trainingLabel = await findByText("Training day");
    const restLabel = await findByText("Rest day");

    // The badge-style labels must not contain banned lexemes
    // (The C2 verbatim explanation is exempt as psychologist-approved copy)
    const bannedInBadges = ["earned", "bonus", "reward", "unlock", "penalty", "punish"];
    for (const banned of bannedInBadges) {
      expect(trainingLabel.props.children).not.toMatch(new RegExp(banned, "i"));
      expect(restLabel.props.children).not.toMatch(new RegExp(banned, "i"));
    }
  });
});
