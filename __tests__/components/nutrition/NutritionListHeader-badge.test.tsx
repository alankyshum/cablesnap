/**
 * Tests for NutritionListHeader day-type badge (Training-Day Macro Adjustment — BLD-2641 PR5)
 *
 * Coverage targets:
 *   AC13  — accessibilityLabel is descriptive; role is 'button'
 *   AC14  — C2 verbatim badge labels (Training day · fueled / Rest day · recovery)
 *           and tap strings in accessibilityHint
 *   AC16  — no banned reward-framing words in badge copy
 *           no directional color tokens (badge uses neutral onSurface+10 background)
 *   AC17  — rest day renders as neutral state (not a penalty)
 *   AC21  — QD3: Base: N kcal visible alongside effective target
 */

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function MockMCIcon(props: any) {
    return React.createElement(View, { testID: props.testID ?? "icon" });
  };
});

jest.mock("../../../components/nutrition/WaterSection", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { WaterSection: () => React.createElement(View, { testID: "water-section" }) };
});

jest.mock("../../../components/nutrition/MacroRow", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MacroRow: ({ label, value, target }: any) =>
      React.createElement(View, { testID: `macro-row-${label.toLowerCase()}` },
        React.createElement(Text, null, `${label}: ${value}/${target}`)
      ),
  };
});

import React from "react";
import { render } from "@testing-library/react-native";
import { NutritionListHeader } from "../../../components/nutrition/NutritionListHeader";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#6200ea",
  onSurface: "#000000",
  onSurfaceVariant: "#666666",
  onBackground: "#000000",
  surface: "#ffffff",
};

const BASE_TARGETS = {
  id: "t1",
  calories: 2400,
  protein: 160,
  carbs: 250,
  fat: 65,
  updated_at: Date.now(),
};

const BASE_SUMMARY = { calories: 1200, protein: 80, carbs: 125, fat: 32 };

const BASE_PROPS = {
  date: new Date("2026-07-02"),
  summary: BASE_SUMMARY,
  targets: BASE_TARGETS,
  waterTotalMl: 500,
  waterGoalMl: 2000,
  waterUnit: "ml" as const,
  waterPresetsMl: [250, 500, 750] as [number, number, number],
  colors: COLORS,
  onPrev: jest.fn(),
  onNext: jest.fn(),
  onEditTargets: jest.fn(),
  onMealTemplates: jest.fn(),
  onWaterPreset: jest.fn(),
  onWaterCustom: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NutritionListHeader — Training-Day Macro Adjustment badge", () => {
  // ── No badge when feature is off ───────────────────────────────────────────

  it("renders without badge when trainingDayAdjustment is undefined", () => {
    const { queryByLabelText } = render(<NutritionListHeader {...BASE_PROPS} />);
    expect(queryByLabelText(/Training day/)).toBeNull();
    expect(queryByLabelText(/Recovery day/)).toBeNull();
  });

  it("renders without badge when adjusted=false (targets equal base)", () => {
    const { queryByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: false, cappedByFloor: false }}
      />
    );
    expect(queryByLabelText(/Training day/)).toBeNull();
  });

  // ── AC14: C2 verbatim badge labels ────────────────────────────────────────

  it("AC14: shows 'Training day · fueled' label for training day", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    expect(getByText("Training day · fueled")).toBeTruthy();
  });

  it("AC17: shows 'Rest day · recovery' label for rest day (neutral, not penalty)", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "rest", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    expect(getByText("Rest day · recovery")).toBeTruthy();
  });

  it("AC14: compact mode shows 'Training day' (minimal label)", () => {
    const { queryByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false, compact: true }}
      />
    );
    expect(queryByText("Training day")).toBeTruthy();
    expect(queryByText("Training day · fueled")).toBeNull();
  });

  it("AC14: compact rest day shows 'Rest day' (minimal label)", () => {
    const { queryByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "rest", baseCals: 2400, adjusted: true, cappedByFloor: false, compact: true }}
      />
    );
    expect(queryByText("Rest day")).toBeTruthy();
    expect(queryByText("Rest day · recovery")).toBeNull();
  });

  // ── AC13: a11y ────────────────────────────────────────────────────────────

  it("AC13: training day badge has descriptive accessibilityLabel", () => {
    const { getByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByLabelText(/Training day — calorie target increased/);
    expect(badge).toBeTruthy();
  });

  it("AC13: rest day badge has descriptive accessibilityLabel (not penalty language)", () => {
    const { getByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "rest", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByLabelText(/Recovery day — calorie target adjusted/);
    expect(badge).toBeTruthy();
    // AC17: must say "adjusted" not "reduced" or "penalized"
    expect(badge.props.accessibilityLabel).not.toMatch(/penaliz/i);
    expect(badge.props.accessibilityLabel).not.toMatch(/less because/i);
  });

  it("AC13: badge has accessibilityRole='button' (tappable)", () => {
    const { getByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByLabelText(/Training day/);
    expect(badge.props.accessibilityRole).toBe("button");
  });

  it("AC14: accessibilityHint contains the C2 verbatim tap copy for training day", () => {
    const { getByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByLabelText(/Training day/);
    expect(badge.props.accessibilityHint).toMatch(/Higher target today because you trained/);
    expect(badge.props.accessibilityHint).toMatch(/Your weekly average is unchanged/);
  });

  it("AC14: accessibilityHint contains C2 verbatim tap copy for rest day", () => {
    const { getByLabelText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "rest", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByLabelText(/Recovery day/);
    expect(badge.props.accessibilityHint).toMatch(/Recovery day — a bit lower to balance/);
    expect(badge.props.accessibilityHint).toMatch(/Your weekly average is unchanged/);
  });

  // ── AC21 (QD3): Base calories visible ─────────────────────────────────────

  it("AC21: shows 'Base: N kcal' alongside effective when adjusted", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        targets={{ ...BASE_TARGETS, calories: 2640 }} // effective = training day
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    expect(getByText("Base: 2400 kcal")).toBeTruthy();
  });

  it("AC21: shows 'Base: N kcal (capped)' when cappedByFloor is true", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        targets={{ ...BASE_TARGETS, calories: 1200 }} // floor-clamped
        trainingDayAdjustment={{ dayType: "rest", baseCals: 1400, adjusted: true, cappedByFloor: true }}
      />
    );
    expect(getByText("Base: 1400 kcal (capped)")).toBeTruthy();
  });

  // ── AC16: No banned lexemes ────────────────────────────────────────────────

  it("AC16 (C1): training day badge label contains no banned reward-framing words", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByText("Training day · fueled");
    const text = badge.props.children;
    const bannedWords = ["earned", "bonus", "reward", "unlock", "penalty", "punish", "guilt"];
    for (const banned of bannedWords) {
      expect(String(text)).not.toMatch(new RegExp(banned, "i"));
    }
  });

  it("AC16 (C1): rest day badge label contains no banned reward-framing words", () => {
    const { getByText } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "rest", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    const badge = getByText("Rest day · recovery");
    const text = badge.props.children;
    const bannedWords = ["no bonus", "base only", "earned", "penalty", "punish"];
    for (const banned of bannedWords) {
      expect(String(text)).not.toMatch(new RegExp(banned, "i"));
    }
  });

  // ── Existing functionality unchanged ──────────────────────────────────────

  it("still renders Edit Targets link when badge is shown", () => {
    const { getByLabelText: byLabel } = render(
      <NutritionListHeader
        {...BASE_PROPS}
        trainingDayAdjustment={{ dayType: "training", baseCals: 2400, adjusted: true, cappedByFloor: false }}
      />
    );
    expect(byLabel("Edit macro targets")).toBeTruthy();
  });

  it("BLD-4043: links have touch-target minHeight >= 44px, marginHorizontal = -8, and paddingHorizontal = 16", () => {
    const { getByLabelText } = render(<NutritionListHeader {...BASE_PROPS} />);
    const { StyleSheet } = require("react-native");
    const editTargets = getByLabelText("Edit macro targets");
    const mealTemplates = getByLabelText("View meal templates");

    const editStyle = StyleSheet.flatten(editTargets.props.style);
    const mealStyle = StyleSheet.flatten(mealTemplates.props.style);

    expect(editStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(editStyle.marginHorizontal).toBe(-8);
    expect(editStyle.paddingHorizontal).toBe(16);

    expect(mealStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(mealStyle.marginHorizontal).toBe(-8);
    expect(mealStyle.paddingHorizontal).toBe(16);
  });
});
