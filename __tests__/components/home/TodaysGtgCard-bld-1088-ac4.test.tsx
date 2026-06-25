/**
 * BLD-1145: covers AC4 and AC15 from PLAN-BLD-1088.md
 *
 * AC4: Given the user has logged ≥1 quick-add set today When they view the
 *      home screen Then a "Today's GTG" card renders one row per exercise
 *      with total reps, set count, and a time-of-day sparkline.
 * AC15: Large-text accessibility: TodaysGtgCard Text elements use
 *      maxFontSizeMultiplier to cap scaling, and the sparkline container
 *      is hidden from accessibility tree (accessibilityElementsHidden)
 *      so screen readers skip it and use the numeric stats instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("../../../hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

import React from "react";
import { render } from "@testing-library/react-native";
import TodaysGtgCard from "../../../components/home/TodaysGtgCard";
import type { TodayGtgSummaryRow } from "../../../lib/db/day-session";
import { lightMockColors as COLORS } from "../../helpers/theme";

const NOW = new Date("2026-05-10T12:00:00.000Z").getTime();

function makeRow(overrides: Partial<TodayGtgSummaryRow> = {}): TodayGtgSummaryRow {
  return {
    exercise_id: "ex-pull-up",
    exercise_name: "Pull-up",
    total_reps: 25,
    set_count: 5,
    set_times: JSON.stringify([NOW - 3600000, NOW - 1800000, NOW]),
    day_session_id: "ds-1",
    ...overrides,
  };
}

describe("BLD-1088 AC4 — TodaysGtgCard renders one row per exercise", () => {
  it("renders nothing when rows is empty (card hidden)", () => {
    const { queryByText } = render(
      <TodaysGtgCard colors={COLORS} rows={[]} onRowPress={jest.fn()} />
    );
    expect(queryByText("Today's Quick-add sets")).toBeNull();
  });

  it("renders exactly one row for a single exercise (total reps + set count visible)", () => {
    const row = makeRow({ exercise_name: "Pull-up", total_reps: 25, set_count: 5 });
    const { getByText } = render(
      <TodaysGtgCard colors={COLORS} rows={[row]} onRowPress={jest.fn()} />
    );

    // Card heading visible
    expect(getByText("Today's Quick-add sets")).toBeTruthy();

    // Exercise name visible
    expect(getByText("Pull-up")).toBeTruthy();

    // Total reps value visible
    expect(getByText("25")).toBeTruthy();
    expect(getByText("reps")).toBeTruthy();

    // Set count visible
    expect(getByText("5")).toBeTruthy();
    expect(getByText("sets")).toBeTruthy();
  });

  it("renders two rows for two different exercises (one row per exercise)", () => {
    const rowA = makeRow({
      exercise_id: "ex-pull-up",
      exercise_name: "Pull-up",
      total_reps: 25,
      set_count: 5,
      day_session_id: "ds-1",
    });
    const rowB = makeRow({
      exercise_id: "ex-squat",
      exercise_name: "Goblet Squat",
      total_reps: 40,
      set_count: 8,
      day_session_id: "ds-2",
      set_times: JSON.stringify([NOW - 7200000, NOW - 3600000]),
    });

    const { getByText } = render(
      <TodaysGtgCard colors={COLORS} rows={[rowA, rowB]} onRowPress={jest.fn()} />
    );

    // Both exercise names visible
    expect(getByText("Pull-up")).toBeTruthy();
    expect(getByText("Goblet Squat")).toBeTruthy();

    // Both rep counts visible
    expect(getByText("25")).toBeTruthy();
    expect(getByText("40")).toBeTruthy();
  });

  it("calls onRowPress with the day_session_id when a row is pressed", () => {
    const onRowPress = jest.fn();
    const row = makeRow({ day_session_id: "ds-abc" });
    const { getByLabelText } = render(
      <TodaysGtgCard colors={COLORS} rows={[row]} onRowPress={onRowPress} />
    );

    const { fireEvent } = require("@testing-library/react-native");
    fireEvent.press(getByLabelText(/Pull-up/i));
    expect(onRowPress).toHaveBeenCalledWith("ds-abc");
  });

  it("row accessibilityLabel announces exercise name, total reps, and set count", () => {
    const row = makeRow({ exercise_name: "Pull-up", total_reps: 25, set_count: 5 });
    const { getByLabelText } = render(
      <TodaysGtgCard colors={COLORS} rows={[row]} onRowPress={jest.fn()} />
    );

    // The Pressable row's accessibilityLabel contains all three pieces of info
    expect(
      getByLabelText("Pull-up, 25 total reps across 5 sets. Tap to view details.")
    ).toBeTruthy();
  });

  it("sparkline renders dots when set_times has timestamps (AC4 sparkline present)", () => {
    const times = [NOW - 3600000, NOW - 1800000, NOW];
    const row = makeRow({ set_times: JSON.stringify(times) });

    // Sparkline renders Views (dots) for each occupied hour bucket
    // We verify the component renders without throwing
    const { toJSON } = render(
      <TodaysGtgCard colors={COLORS} rows={[row]} onRowPress={jest.fn()} />
    );
    const tree = toJSON();
    expect(tree).not.toBeNull();
    // The sparkline container is accessible={false} / accessibilityElementsHidden=true
    // Its dot children use borderRadius: 4 — present in rendered output
    const json = JSON.stringify(tree);
    expect(json).toContain('"accessibilityElementsHidden":true');
    expect(json).toContain('"borderRadius":4');
  });
});

// ── BLD-1088 AC15 — large-text accessibility (source-contract) ───────────────

import * as fs from "fs";
import * as path from "path";

describe("BLD-1088 AC15 — TodaysGtgCard large-text a11y contract", () => {
  const COMPONENT_PATH = path.join(__dirname, "../../../components/home/TodaysGtgCard.tsx");
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(COMPONENT_PATH, "utf8");
  });

  it("sparkline container uses accessibilityElementsHidden so screen readers skip it", () => {
    // Sparkline is hidden from a11y tree; numeric stats are the accessible representation
    expect(src).toContain("accessibilityElementsHidden");
  });

  it("Text elements use maxFontSizeMultiplier to cap large-text scaling", () => {
    // TodaysGtgCard uses the shared Text component from components/ui/text.tsx
    // which sets maxFontSizeMultiplier=1.5 on all Text elements internally.
    const textComponentSrc = fs.readFileSync(
      path.join(__dirname, "../../../components/ui/text.tsx"),
      "utf8"
    );
    expect(textComponentSrc).toContain("maxFontSizeMultiplier");
  });

  it("exercise name row has accessibilityLabel with reps and set count for VoiceOver", () => {
    // Ensures screen readers announce useful info even when sparkline is hidden
    expect(src).toMatch(/accessibilityLabel.*total reps.*sets/);
  });
});
