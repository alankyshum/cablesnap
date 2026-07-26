/**
 * WorkoutSegment-toggle-touch-target.test.tsx
 *
 * BLD-4077: Calendar/list toggle Pressable must meet the 44dp minimum
 * touch-target requirement (BLD-4039 UX audit finding).
 *
 * Tests:
 * - AC1: toggleButton width >= 44dp
 * - AC2: toggleButton height >= 44dp
 */

import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

// ── mock heavy deps before importing WorkoutSegment ──────────────────────────

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      RealReact.useEffect(() => { cb(); }, []);
    },
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: false, atLeastMedium: false, width: 390, scale: 1.0 }),
}));
jest.mock("@/components/FloatingTabBar", () => ({
  useFloatingTabBarHeight: () => 64,
}));
jest.mock("@/lib/errors", () => ({ logError: jest.fn() }));
jest.mock("@/lib/interactions", () => ({ log: jest.fn() }));
jest.mock("expo-localization", () => ({ getCalendars: () => [{ firstWeekday: 1 }] }));

jest.mock("@/components/WeeklySummary", () => "WeeklySummary");
jest.mock("@/components/progress/CalendarView", () => "CalendarView");
jest.mock("@/components/progress/WorkoutCards", () => ({
  WorkoutChartCard: "WorkoutChartCard",
  SessionsByGymCard: "SessionsByGymCard",
  SessionsCard: "SessionsCard",
}));
jest.mock("@/components/progress/PRSummaryCard", () => ({
  PRSummaryCard: "PRSummaryCard",
}));
jest.mock("@/components/progress/TrendCards", () => ({
  RPETrendCard: "RPETrendCard",
  RatingTrendCard: "RatingTrendCard",
}));
jest.mock("@/components/progress/StrengthLevelsCard", () => "StrengthLevelsCard");
jest.mock("@/components/progress/ActiveGoalsCard", () => "ActiveGoalsCard");
jest.mock("@/components/progress/WorkoutEmptyState", () => "WorkoutEmptyState");

jest.mock("@/lib/db/pr-dashboard", () => ({
  getPRStats: jest.fn().mockResolvedValue({ totalPRs: 0, prsThisMonth: 0 }),
  getRecentPRsWithDelta: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/db", () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg" }),
  getActiveGymCount: jest.fn().mockResolvedValue(0),
  getGymProfiles: jest.fn().mockResolvedValue([]),
  getSessionsByGym: jest.fn().mockResolvedValue([]),
}));

import WorkoutSegment from "@/components/progress/WorkoutSegment";

describe("WorkoutSegment — calendar/list toggle touch-target (BLD-4077)", () => {
  it("AC1: toggle button width is at least 44dp", async () => {
    const { getByLabelText } = render(<WorkoutSegment />);

    // Default viewMode is "list" so accessibilityLabel = "Switch to calendar view"
    await waitFor(() => {
      expect(getByLabelText("Switch to calendar view")).toBeTruthy();
    });

    const toggleBtn = getByLabelText("Switch to calendar view");
    const flatStyle = StyleSheet.flatten(toggleBtn.props.style ?? {});

    expect(flatStyle.width).toBeGreaterThanOrEqual(44);
  });

  it("AC2: toggle button height is at least 44dp", async () => {
    const { getByLabelText } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByLabelText("Switch to calendar view")).toBeTruthy();
    });

    const toggleBtn = getByLabelText("Switch to calendar view");
    const flatStyle = StyleSheet.flatten(toggleBtn.props.style ?? {});

    expect(flatStyle.height).toBeGreaterThanOrEqual(44);
  });
});
