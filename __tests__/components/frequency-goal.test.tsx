import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// Mock theme colors
const mockColors = {
  primary: "#6200EE",
  onPrimary: "#FFFFFF",
  surface: "#FFFFFF",
  onSurface: "#000000",
  onSurfaceVariant: "#666666",
  surfaceVariant: "#E0E0E0",
  background: "#FFFFFF",
  onBackground: "#000000",
};

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => mockColors,
}));

jest.mock("@/components/ui/card", () => {
  const { View } = require("react-native");
  return {
    Card: ({ children, ...props }: { children: React.ReactNode }) => <View {...props}>{children}</View>,
    CardContent: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/components/ui/FlowContainer", () => ({
  flowCardStyle: {},
}));

jest.mock("@/components/ui/text", () => {
  const { Text: RNText } = require("react-native");
  return { Text: ({ children, ...props }: { children: React.ReactNode }) => <RNText {...props}>{children}</RNText> };
});

import FrequencyGoalPicker from "../../components/settings/FrequencyGoalPicker";
import AdherenceBar from "../../components/home/AdherenceBar";
import StatsRow from "../../components/home/StatsRow";
import type { WeeklyGoalProgress } from "../../components/home/loadHomeData";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

describe("FrequencyGoalPicker", () => {
  it("renders 7 circles", () => {
    const { getAllByRole } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={null} onChange={() => {}} />,
    );
    const radios = getAllByRole("radio");
    expect(radios).toHaveLength(7);
  });

  it("highlights selected circle", () => {
    const { getAllByRole } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={4} onChange={() => {}} />,
    );
    const radios = getAllByRole("radio");
    const fourth = radios[3];
    expect(fourth.props.accessibilityState).toEqual({ checked: true });
  });

  it("calls onChange when circle tapped", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={null} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText("3 days per week"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("shows Clear button when value selected", () => {
    const { getByLabelText } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={5} onChange={() => {}} />,
    );
    expect(getByLabelText("Clear weekly training goal")).toBeTruthy();
  });

  it("calls onChange(null) on Clear", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={5} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText("Clear weekly training goal"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("hides Clear button when no value", () => {
    const { queryByLabelText } = render(
      <FrequencyGoalPicker colors={mockColors as never} value={null} onChange={() => {}} />,
    );
    expect(queryByLabelText("Clear weekly training goal")).toBeNull();
  });
});

describe("AdherenceBar", () => {
  it("hides when mode=hidden", () => {
    const progress: WeeklyGoalProgress = { mode: "hidden", slots: [], completedCount: 0, targetCount: 0 };
    const { toJSON } = render(<AdherenceBar colors={mockColors as never} progress={progress} />);
    expect(toJSON()).toBeNull();
  });

  it("renders schedule mode with day labels", () => {
    const slots = [
      { scheduled: true, completed: true },
      { scheduled: false, completed: false },
      { scheduled: true, completed: false },
      { scheduled: false, completed: false },
      { scheduled: true, completed: true },
      { scheduled: false, completed: false },
      { scheduled: false, completed: false },
    ];
    const progress: WeeklyGoalProgress = { mode: "schedule", slots, completedCount: 2, targetCount: 3 };
    const { getByText, getByLabelText } = render(
      <AdherenceBar colors={mockColors as never} progress={progress} />,
    );
    expect(getByText("2 of 3 this week 🎯")).toBeTruthy();
    expect(getByLabelText("Mon: completed")).toBeTruthy();
    expect(getByLabelText("Tue: rest day")).toBeTruthy();
  });

  it("renders frequency mode with goal dots", () => {
    const slots = [
      { scheduled: true, completed: true },
      { scheduled: true, completed: true },
      { scheduled: true, completed: false },
      { scheduled: true, completed: false },
    ];
    const progress: WeeklyGoalProgress = { mode: "frequency", slots, completedCount: 2, targetCount: 4 };
    const { getByText } = render(
      <AdherenceBar colors={mockColors as never} progress={progress} />,
    );
    expect(getByText("2 of 4 this week 🎯")).toBeTruthy();
  });

  it("shows fire emoji when goal met", () => {
    const slots = Array.from({ length: 4 }, () => ({ scheduled: true, completed: true }));
    const progress: WeeklyGoalProgress = { mode: "frequency", slots, completedCount: 4, targetCount: 4 };
    const { getByText } = render(
      <AdherenceBar colors={mockColors as never} progress={progress} />,
    );
    expect(getByText("4 of 4 this week 🔥")).toBeTruthy();
  });

  it("shows over-goal text when completions exceed target", () => {
    const slots = Array.from({ length: 3 }, () => ({ scheduled: true, completed: true }));
    const progress: WeeklyGoalProgress = { mode: "frequency", slots, completedCount: 5, targetCount: 3 };
    const { getByText } = render(
      <AdherenceBar colors={mockColors as never} progress={progress} />,
    );
    expect(getByText("Goal reached! 5 workouts this week 🔥")).toBeTruthy();
  });
});

describe("StatsRow with WeeklyGoalProgress", () => {
  it("shows X/Y when target is set", () => {
    const progress: WeeklyGoalProgress = { mode: "frequency", slots: [], completedCount: 2, targetCount: 4 };
    const { getByLabelText } = render(
      <StatsRow colors={mockColors as never} streak={3} progress={progress} prCount={1} />,
    );
    expect(getByLabelText("2 of 4 workouts this week")).toBeTruthy();
  });

  it("shows just count when no target", () => {
    const progress: WeeklyGoalProgress = { mode: "hidden", slots: [], completedCount: 2, targetCount: 0 };
    const { getByLabelText } = render(
      <StatsRow colors={mockColors as never} streak={0} progress={progress} prCount={0} />,
    );
    expect(getByLabelText("2 workouts this week")).toBeTruthy();
  });
});

// --- buildWeeklyGoalProgress unit tests ---

jest.mock("../../lib/db", () => ({
  getAppSetting: jest.fn(),
  getWeeklyCompletedCount: jest.fn(),
}));

import { buildWeeklyGoalProgress } from "../../components/home/loadHomeData";
import { getAppSetting, getWeeklyCompletedCount } from "../../lib/db";

const mockGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockGetWeeklyCompletedCount = getWeeklyCompletedCount as jest.MockedFunction<typeof getWeeklyCompletedCount>;

describe("buildWeeklyGoalProgress priority rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const noSchedule = Array.from({ length: 7 }, (_, i) => ({ day: i, scheduled: false, completed: false }));

  it("Priority 1: program schedule takes precedence over frequency goal", async () => {
    const adh = noSchedule.map((d, i) => ({ ...d, scheduled: i < 3, completed: i === 0 }));
    mockGetAppSetting.mockResolvedValue("5"); // goal set but should be ignored
    const result = await buildWeeklyGoalProgress(adh);
    expect(result.mode).toBe("schedule");
    expect(result.targetCount).toBe(3);
    expect(result.completedCount).toBe(1);
    expect(mockGetAppSetting).not.toHaveBeenCalled();
  });

  it("Priority 2: frequency goal when no schedule", async () => {
    mockGetAppSetting.mockResolvedValue("4");
    mockGetWeeklyCompletedCount.mockResolvedValue(2);
    const result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("frequency");
    expect(result.targetCount).toBe(4);
    expect(result.completedCount).toBe(2);
    expect(result.slots).toHaveLength(4);
    expect(result.slots.filter((s) => s.completed)).toHaveLength(2);
  });

  it("Priority 3: hidden when no schedule and no goal", async () => {
    mockGetAppSetting.mockResolvedValue(null);
    const result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("hidden");
    expect(result.slots).toHaveLength(0);
  });

  it("handles invalid goal value gracefully", async () => {
    mockGetAppSetting.mockResolvedValue("abc");
    const result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("hidden");
  });

  it("handles out-of-range goal (0, 8) as hidden", async () => {
    mockGetAppSetting.mockResolvedValue("0");
    let result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("hidden");

    mockGetAppSetting.mockResolvedValue("8");
    result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("hidden");
  });

  it("over-goal: completedCount exceeds target but slots capped", async () => {
    mockGetAppSetting.mockResolvedValue("3");
    mockGetWeeklyCompletedCount.mockResolvedValue(5);
    const result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("frequency");
    expect(result.completedCount).toBe(5);
    expect(result.targetCount).toBe(3);
    expect(result.slots.filter((s) => s.completed)).toHaveLength(3); // capped at goal
  });

  it("degrades gracefully when getAppSetting throws", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("DB error"));
    const result = await buildWeeklyGoalProgress(noSchedule);
    expect(result.mode).toBe("hidden");
  });
});
