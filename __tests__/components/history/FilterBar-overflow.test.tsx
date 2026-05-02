/**
 * BLD-956 — Regression test: FilterBar must not clip the rightmost chip.
 *
 * The audit (2026-05-02, fingerprint cbe59de55e00) caught the third filter
 * chip ("Date Range") visually clipped at a 390px viewport because the
 * ScrollView wrapping the chip row had no width constraint — it overflowed
 * its parent flex row instead of scrolling.
 *
 * The fix bounds the ScrollView with `flex: 1` (flexShrink/flexGrow + minWidth:0)
 * so it constrains to the parent width and scrolls horizontally when needed.
 *
 * This test asserts the structural invariant: the ScrollView wrapping the
 * chips is horizontal, hides its scrollbar, and has the layout style that
 * lets it bound to the parent (the property the bug fix introduces).
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { ScrollView } from "react-native";
import { FilterBar } from "@/components/history/FilterBar";
import type { HistoryFilters, TemplateOption } from "@/lib/db";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6750A4",
    primaryContainer: "#EADDFF",
    onPrimaryContainer: "#21005D",
    surface: "#FFFBFE",
    onSurface: "#1C1B1F",
    outline: "#79747E",
  }),
}));

const emptyFilters: HistoryFilters = {
  templateId: null,
  muscleGroup: null,
  datePreset: null,
};

const noTemplates: TemplateOption[] = [];

describe("FilterBar — BLD-956 overflow regression", () => {
  function renderBar(filters: HistoryFilters = emptyFilters) {
    return render(
      <FilterBar
        filters={filters}
        templateOptions={noTemplates}
        onOpenTemplateSheet={() => {}}
        onOpenMuscleGroupSheet={() => {}}
        onOpenDateRangeSheet={() => {}}
        onClearOne={() => {}}
        onClearAll={() => {}}
      />,
    );
  }

  it("renders all three chips (Template / Muscle Group / Date Range)", () => {
    const { getByTestId } = renderBar();
    expect(getByTestId("history-filter-chip-template")).toBeTruthy();
    expect(getByTestId("history-filter-chip-muscle")).toBeTruthy();
    expect(getByTestId("history-filter-chip-date")).toBeTruthy();
  });

  it("wraps chips in a horizontal ScrollView so overflow scrolls instead of clipping", () => {
    const { UNSAFE_getAllByType } = renderBar();
    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);

    const chipScroll = scrollViews[0];
    expect(chipScroll.props.horizontal).toBe(true);
    expect(chipScroll.props.showsHorizontalScrollIndicator).toBe(false);
  });

  it("ScrollView is constrained to parent width (flex: 1) so the rightmost chip can scroll into view", () => {
    // The fix: the ScrollView must have a layout style that lets it bound
    // its width to the parent flex row. Without this, the ScrollView grows
    // to fit its children and overflows the viewport — clipping "Date Range".
    const { UNSAFE_getAllByType } = renderBar();
    const chipScroll = UNSAFE_getAllByType(ScrollView)[0];

    // The style prop is an array (StyleSheet.create + extras). Flatten it.
    const styles = Array.isArray(chipScroll.props.style)
      ? Object.assign({}, ...chipScroll.props.style.filter(Boolean))
      : (chipScroll.props.style ?? {});

    // At least one of these must be set for the ScrollView to bound to
    // the parent width. The current fix uses flexShrink + flexGrow + minWidth: 0.
    const bounded =
      styles.flex === 1 ||
      (styles.flexShrink === 1 && styles.flexGrow === 1) ||
      styles.minWidth === 0;

    expect(bounded).toBe(true);
  });

  it("renders chip row even when no filters are active (the bug-reproducing scenario)", () => {
    // The audited screenshot had no active filters — the row was three
    // unselected chips, and the third was still clipped. Make sure all
    // three render in this exact state.
    const { getByTestId } = renderBar(emptyFilters);
    expect(getByTestId("history-filter-bar")).toBeTruthy();
    expect(getByTestId("history-filter-chip-template")).toBeTruthy();
    expect(getByTestId("history-filter-chip-muscle")).toBeTruthy();
    expect(getByTestId("history-filter-chip-date")).toBeTruthy();
  });
});
