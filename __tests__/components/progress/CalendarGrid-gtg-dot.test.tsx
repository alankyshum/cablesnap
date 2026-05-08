/**
 * AC21 — CalendarGrid renders the GTG-only light-fill dot (hollow outline)
 * for days that appear in gtgOnlyDates, and the normal solid dot for
 * days that appear in workoutDates.
 *
 * A day in both sets must render only the solid dot (hasWorkout takes priority).
 */
import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    onPrimary: "#fff",
    onPrimaryContainer: "#eaddff",
    onSurface: "#000",
    onSurfaceVariant: "#666",
    primaryContainer: "#eaddff",
    disabled: "#9e9e9e",
  }),
}));

jest.mock("@/lib/db/calendar", () => ({
  generateCalendarGrid: () => {
    // January 2024: starts on Monday (weekStart=0 → offset 1)
    const days: (number | null)[] = [null];
    for (let d = 1; d <= 31; d++) days.push(d);
    return days;
  },
  getWeekDayLabels: () => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  dateToISO: (_year: number, _month: number, day: number) =>
    `2024-01-${String(day).padStart(2, "0")}`,
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  default: () => ({ width: 390 }),
}));

import CalendarGrid from "@/components/progress/CalendarGrid";

// Use Jan 2024 (all days in the past relative to any future run date)
const BASE_PROPS = {
  year: 2024,
  month: 0, // January
  weekStartDay: 0,
  workoutDates: new Set<string>(),
  gtgOnlyDates: new Set<string>(),
  selectedDate: null,
  todayStr: "2026-01-01", // far future today → all Jan 2024 days are in the past
  onSelectDate: jest.fn(),
};

describe("AC21 — CalendarGrid GTG-only dot rendering", () => {
  it("shows 'workout completed' label for a day in workoutDates", () => {
    const { getByLabelText } = render(
      <CalendarGrid
        {...BASE_PROPS}
        workoutDates={new Set(["2024-01-10"])}
        gtgOnlyDates={new Set()}
      />
    );
    expect(getByLabelText("January 10, workout completed")).toBeTruthy();
  });

  it("shows 'GTG sets logged' label for a day in gtgOnlyDates only", () => {
    const { getByLabelText } = render(
      <CalendarGrid
        {...BASE_PROPS}
        workoutDates={new Set()}
        gtgOnlyDates={new Set(["2024-01-15"])}
      />
    );
    expect(getByLabelText("January 15, GTG sets logged")).toBeTruthy();
  });

  it("workout label takes priority when a day is in both sets", () => {
    const { getByLabelText, queryByLabelText } = render(
      <CalendarGrid
        {...BASE_PROPS}
        workoutDates={new Set(["2024-01-20"])}
        gtgOnlyDates={new Set(["2024-01-20"])}
      />
    );
    expect(getByLabelText("January 20, workout completed")).toBeTruthy();
    expect(queryByLabelText("January 20, GTG sets logged")).toBeNull();
  });

  it("shows 'no workout' label for a day with no activity", () => {
    const { getByLabelText } = render(
      <CalendarGrid
        {...BASE_PROPS}
        workoutDates={new Set()}
        gtgOnlyDates={new Set()}
      />
    );
    expect(getByLabelText("January 5, no workout")).toBeTruthy();
  });
});
