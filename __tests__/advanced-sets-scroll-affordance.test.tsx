/**
 * BLD-1916 — Bottom scroll-affordance fade for the Advanced Set Types help screen.
 *
 * At narrow viewports (e.g. 320×640) the last section ("Myo-reps") is clipped
 * at the bottom edge with no scroll affordance, so users cannot tell more
 * content exists below the fold. The screen now overlays a bottom fade gradient
 * that appears only when the bounded scroll content overflows and the user has
 * not yet scrolled to the end.
 *
 * Coverage:
 *  1. `isBottomFadeVisible` pure predicate — overflow / at-bottom / fits / edge
 *     cases (table-driven).
 *  2. Render smoke — the screen mounts and shows all three section titles, and
 *     the fade overlay is absent at initial render (dimensions unmeasured = 0).
 */
import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { renderScreen } from "./helpers/render";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => require("./helpers/theme").lightMockColors,
}));

jest.mock("@/lib/layout", () => ({
  useLayout: () => ({
    width: 320,
    windowClass: "compact",
    compact: true,
    medium: false,
    expanded: false,
    atLeastMedium: false,
    scale: 1.0,
    horizontalPadding: 16,
  }),
}));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

import AdvancedSetsHelpScreen, {
  isBottomFadeVisible,
} from "@/app/settings/advanced-sets";

describe("isBottomFadeVisible", () => {
  // [scrollY, layoutHeight, contentHeight, expected, description]
  const cases: Array<[number, number, number, boolean, string]> = [
    // Content overflows and user is at the top → fade shown.
    [0, 640, 1200, true, "overflow, scrolled to top"],
    // Content overflows and user is partway → fade shown.
    [200, 640, 1200, true, "overflow, scrolled partway"],
    // Content overflows and user is exactly at the bottom → fade hidden.
    [560, 640, 1200, false, "overflow, scrolled to exact bottom"],
    // 1px slack: one pixel shy of the bottom still counts as bottom → hidden.
    [559, 640, 1200, false, "overflow, within 1px slack of bottom"],
    // Content fits the viewport exactly → no overflow → hidden.
    [0, 640, 640, false, "content fits exactly"],
    // Content shorter than viewport → hidden.
    [0, 640, 400, false, "content shorter than viewport"],
    // Trivial 1px overflow is within slack → not treated as overflow → hidden.
    [0, 640, 641, false, "1px overflow within slack"],
    // Just past the slack threshold → overflow, top → shown.
    [0, 640, 642, true, "2px overflow, at top"],
    // Unmeasured layout (initial render) → hidden.
    [0, 0, 0, false, "unmeasured dimensions"],
    [0, 0, 1200, false, "unmeasured layout height"],
    [0, 640, 0, false, "unmeasured content height"],
  ];

  it.each(cases)(
    "scrollY=%i layout=%i content=%i → %s (%s)",
    (scrollY, layoutHeight, contentHeight, expected) => {
      expect(isBottomFadeVisible(scrollY, layoutHeight, contentHeight)).toBe(
        expected,
      );
    },
  );

  it("never shows the fade for non-positive dimensions", () => {
    expect(isBottomFadeVisible(-10, -1, -1)).toBe(false);
    expect(isBottomFadeVisible(0, -5, 1200)).toBe(false);
  });
});

describe("AdvancedSetsHelpScreen — render", () => {
  it("renders all three advanced set type sections", () => {
    const { getByText } = renderScreen(<AdvancedSetsHelpScreen />);
    expect(getByText("Rest-pause")).toBeTruthy();
    expect(getByText("Cluster")).toBeTruthy();
    expect(getByText("Myo-reps")).toBeTruthy();
  });

  it("does not render the bottom fade before scroll dimensions are measured", () => {
    const { queryByTestId } = renderScreen(<AdvancedSetsHelpScreen />);
    // Initial render: layoutHeight/contentHeight are 0 → predicate false → no fade.
    expect(queryByTestId("advanced-sets-bottom-fade")).toBeNull();
  });

  it("shows the bottom fade once content overflows the viewport and hides it at the end", () => {
    const { UNSAFE_getByType, queryByTestId } = renderScreen(
      <AdvancedSetsHelpScreen />,
    );
    const { ScrollView } = require("react-native");
    const scroll = UNSAFE_getByType(ScrollView);

    // Simulate measurement: viewport 640px, content 1200px (overflow), at top.
    fireEvent(scroll, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 640 } },
    });
    fireEvent(scroll, "contentSizeChange", 320, 1200);
    expect(queryByTestId("advanced-sets-bottom-fade")).toBeTruthy();

    // Scroll to the bottom → fade hides.
    fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x: 0, y: 560 },
        contentSize: { width: 320, height: 1200 },
        layoutMeasurement: { width: 320, height: 640 },
      },
    });
    expect(queryByTestId("advanced-sets-bottom-fade")).toBeNull();
  });
});
