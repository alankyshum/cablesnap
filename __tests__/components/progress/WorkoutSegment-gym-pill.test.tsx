/**
 * BLD-1060 — Gym filter pill 390px overflow regression test.
 *
 * AC: PLAN-BLD-1059 rev 3 lines 226-228 + BLD-1055 learning:
 * "assert full parent-to-child width chain so variable-length gym names do not
 * push the gym filter row past 390px on RN Web."
 *
 * Risk addressed: filterPills uses flexDirection:row for horizontal pills. If
 * flexWrap is removed or the paddingHorizontal budget is exceeded, long gym names
 * (user-controlled) can push the row past the 390px viewport — the exact regression
 * class as BLD-1055. This test locks the structural invariants so regressions
 * trip a test before shipping.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

// ── mock heavy deps before importing WorkoutSegment ──────────────────────────

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      // Run synchronously so state is set before first render assertions
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

// Child components that render complex UI — stub them out
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

// Return activeGymCount >= 2 so showGymUI = true and gymFilter renders
jest.mock("@/lib/db", () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([
    { id: "s1", name: "Pull Day", started_at: Date.now(), duration_seconds: 3600, set_count: 5 },
    { id: "s2", name: "Push Day", started_at: Date.now() - 86400000, duration_seconds: 2400, set_count: 6 },
    { id: "s3", name: "Leg Day", started_at: Date.now() - 172800000, duration_seconds: 2700, set_count: 7 },
  ]),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg" }),
  // 3 active gyms → showGymUI = true
  getActiveGymCount: jest.fn().mockResolvedValue(3),
  getGymProfiles: jest.fn().mockResolvedValue([
    { id: "gym-1", name: "A Very Long Gym Name That Exceeds 24 Chars", is_default: 1, deleted_at: null },
    { id: "gym-2", name: "Downtown Fitness Center", is_default: 0, deleted_at: null },
    { id: "gym-3", name: "CrossFit Annex", is_default: 0, deleted_at: null },
  ]),
  getSessionsByGym: jest.fn().mockResolvedValue([
    { gymId: "gym-1", gymName: "A Very Long Gym Name That Exceeds 24 Chars", count: 15 },
    { gymId: "gym-2", gymName: "Downtown Fitness Center", count: 8 },
    { gymId: "gym-3", gymName: "CrossFit Annex", count: 4 },
  ]),
}));

import WorkoutSegment from "@/components/progress/WorkoutSegment";

describe("WorkoutSegment — gym filter pill 390px width-chain regression (BLD-1060)", () => {
  it("renders gym filter row when activeGymCount >= 2", async () => {
    const { getByTestId } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByTestId("workout-gym-filter-row")).toBeTruthy();
    });
  });

  it("filterPills uses flexWrap:wrap so long gym names wrap instead of overflowing 390px", async () => {
    const { getByTestId } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByTestId("workout-gym-filter-pills")).toBeTruthy();
    });

    const pills = getByTestId("workout-gym-filter-pills");
    const rawStyle = pills.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    // flexWrap:wrap is the overflow prevention for a row of variable-length pills.
    // If this is removed, a 24+ char gym name pushes the row past 390px — BLD-1055 class.
    expect(flattened.flexWrap).toBe("wrap");
  });

  it("filterRow paddingHorizontal stays within 390px viewport budget", async () => {
    const { getByTestId } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByTestId("workout-gym-filter-row")).toBeTruthy();
    });

    const row = getByTestId("workout-gym-filter-row");
    const rawStyle = row.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    // paddingHorizontal: 16 means the pill area is 390 - 32 = 358px.
    // Must not exceed 20px per side or pills with long names may clip.
    const ph = flattened.paddingHorizontal ?? (flattened.paddingLeft ?? 0);
    expect(ph).toBeLessThanOrEqual(20);
  });

  it("filterPills uses flexDirection:row (pills lay out horizontally and wrap)", async () => {
    const { getByTestId } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByTestId("workout-gym-filter-pills")).toBeTruthy();
    });

    const pills = getByTestId("workout-gym-filter-pills");
    const rawStyle = pills.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    expect(flattened.flexDirection).toBe("row");
  });

  it("renders all gym options including extra-long names without crashing", async () => {
    const { getByTestId, getAllByRole } = render(<WorkoutSegment />);

    await waitFor(() => {
      expect(getByTestId("workout-gym-filter-row")).toBeTruthy();
    });

    // 4 pills: "All gyms" + 3 gym options — all must render without error
    const buttons = getAllByRole("button");
    // At least the 4 gym filter buttons (+ toggle button = 5 total)
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it("toggleRow horizontal and vertical padding matches design alignment constraints (BLD-3648)", async () => {
    const { getByTestId } = render(<WorkoutSegment />);

    await waitFor(() => {
      const row = getByTestId("workout-toggle-row");
      const rawStyle = row.props.style;
      const flattened = Array.isArray(rawStyle)
        ? Object.assign({}, ...rawStyle.filter(Boolean))
        : (rawStyle ?? {});
      expect(flattened.paddingHorizontal).toBe(0);
    });

    const toggleRow = getByTestId("workout-toggle-row");
    const rawStyle = toggleRow.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    // In list view, paddingHorizontal should resolve to 0 so the parent FlatList's 16px padding is used.
    expect(flattened.paddingHorizontal).toBe(0);
    // paddingTop should be 0 because vertical gap is defined by tabsContainer's paddingBottom in progress.tsx
    expect(flattened.paddingTop).toBe(0);
  });
});
