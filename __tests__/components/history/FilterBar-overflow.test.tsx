/**
 * BLD-956 / BLD-1055 — Regression tests: FilterBar must not clip the rightmost chip.
 *
 * BLD-956 (2026-05-02): The third filter chip ("Date Range") was visually
 * clipped at 390px because the ScrollView had no width constraint. The fix
 * added flexShrink/flexGrow/minWidth:0 on the ScrollView.
 *
 * BLD-1055 (2026-05-04): The regression persisted because the *container*
 * View lacked flex:1. On RN Web a row container without an explicit width
 * grows with its children, so the ScrollView's flex constraints resolved
 * against an oversized parent and scrolling never kicked in. The fix adds
 * flex:1 to the container.
 *
 * This test asserts both structural invariants so neither regresses again.
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

  it("container View has flex:1 so it takes available parent width on RN Web (BLD-1055)", () => {
    // BLD-1055: The container must have flex:1 so it takes the parent row's
    // full width. Without this, on RN Web the container grows to fit its
    // children and the ScrollView's flex constraints resolve against an
    // oversized parent — clipping the rightmost chip instead of scrolling.
    const { getByTestId } = renderBar();
    const container = getByTestId("history-filter-bar");

    const rawStyle = container.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    expect(flattened.flex).toBe(1);
  });

  it("scrollWrap View has overflow:hidden and is flex:1 to hard-bound the ScrollView on RN Web (BLD-1055)", () => {
    // The scrollWrap View acts as the width anchor: flex:1 takes the
    // container width, overflow:hidden prevents any bleed, and the inner
    // ScrollView fills it. Without this layer RN Web ignores flexShrink/
    // flexGrow on the ScrollView when the parent has no explicit width.
    const { getByTestId } = renderBar();
    const scrollWrap = getByTestId("history-filter-scroll-wrap");

    const rawStyle = scrollWrap.props.style;
    const flattened = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.filter(Boolean))
      : (rawStyle ?? {});

    expect(flattened.flex).toBe(1);
    expect(flattened.overflow).toBe("hidden");
    expect(flattened.minWidth).toBe(0);
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

  it("container View has flex:1 so the ScrollView width-constraint resolves against the actual viewport (BLD-1055)", () => {
    // Root cause of BLD-1055: the container View had no width definition, so
    // on RN Web it grew with its children. The inner ScrollView's
    // flexShrink/flexGrow then resolved against an already-oversized parent
    // and the rightmost chip clipped instead of scrolling into view.
    //
    // Fix: container must have flex:1 (or width:'100%') so the ScrollView
    // receives a bounded reference width from the layout engine.
    const { getByTestId } = renderBar();
    const container = getByTestId("history-filter-bar");

    const containerStyles = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style.filter(Boolean))
      : (container.props.style ?? {});

    // Must have a width-bounding property so the ScrollView can work
    const widthBounded =
      containerStyles.flex === 1 ||
      containerStyles.width === "100%" ||
      containerStyles.flexBasis === 0;

    expect(widthBounded).toBe(true);
  });

  it("chip + row paddings stay within the 390px viewport budget (BLD-1055 followup)", () => {
    // BLD-1055 followup: QD's live browser verification at 390×844 found the
    // Date Range chip extended to right=435.5 (61.5px past the 374px wrap)
    // even after the structural bounding fix landed. Root cause: chip
    // paddingHorizontal (12) + chip gap (6) + row gap (8) + paddingRight (8)
    // pushed the three-chip row to ~407px, well over the 358px usable width.
    //
    // The followup tightens those values. Codify the budget so any future
    // increase trips this test BEFORE it ships to the browser.
    const { getByTestId } = renderBar(emptyFilters);

    const chip = getByTestId("history-filter-chip-template");
    const flatChip = Array.isArray(chip.props.style)
      ? Object.assign({}, ...chip.props.style.filter(Boolean))
      : (chip.props.style ?? {});
    expect(flatChip.paddingHorizontal).toBeLessThanOrEqual(4);
    expect(flatChip.gap).toBeLessThanOrEqual(4);
  });

  it("has paddingLeft: 12 on the ScrollView's row content container style for left-content alignment (BLD-4520 / BLD-4585)", () => {
    const { UNSAFE_getAllByType } = renderBar();
    const chipScroll = UNSAFE_getAllByType(ScrollView)[0];
    const flatContentStyle = Array.isArray(chipScroll.props.contentContainerStyle)
      ? Object.assign({}, ...chipScroll.props.contentContainerStyle.filter(Boolean))
      : (chipScroll.props.contentContainerStyle ?? {});
    expect(flatContentStyle.paddingLeft).toBe(12);
  });
});
