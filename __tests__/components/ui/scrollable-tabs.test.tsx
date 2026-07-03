/**
 * Tests for ScrollableTabs (BLD-849).
 *
 * Covers the contract that protects the Progress route from text-truncation
 * regression: tabs render with full label text, tab presses fire haptic +
 * onValueChange, and the active tab's accessibility state flips.
 */
import React from "react";
import { ScrollView, View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@/hooks/useColor", () => ({
  useColor: (name: string) => {
    switch (name) {
      case "primary":
        return "#FF6038";
      case "mutedForeground":
        return "#6B7280";
      case "background":
        return "#FAFAFA";
      default:
        return "#000000";
    }
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

// react-native-svg renders fine in jest preset; no extra mock needed.

import * as Haptics from "expo-haptics";
import { ScrollableTabs } from "../../../components/ui/scrollable-tabs";
import type { ScrollableTabsButton } from "../../../components/ui/scrollable-tabs";

const impactAsyncMock = Haptics.impactAsync as jest.Mock;

const FIVE_TABS: readonly ScrollableTabsButton[] = [
  { value: "workouts", label: "Workouts", accessibilityLabel: "Workouts progress" },
  { value: "body", label: "Body", accessibilityLabel: "Body metrics" },
  { value: "muscles", label: "Muscles", accessibilityLabel: "Muscle volume analysis" },
  { value: "nutrition", label: "Nutrition", accessibilityLabel: "Nutrition trends" },
  { value: "monthly", label: "Monthly", accessibilityLabel: "Monthly training report" },
];

beforeEach(() => {
  impactAsyncMock.mockClear();
});

describe("ScrollableTabs (BLD-849)", () => {
  it("renders every label in full — no truncation, no missing tabs", () => {
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );
    // Every label must be rendered as text exactly as supplied.
    for (const tab of FIVE_TABS) {
      expect(getByText(tab.label)).toBeTruthy();
    }
  });

  it("calls onValueChange and fires light haptic when an inactive tab is pressed", () => {
    const onValueChange = jest.fn();
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={onValueChange}
        buttons={FIVE_TABS}
      />,
    );
    fireEvent.press(getByText("Body"));
    expect(onValueChange).toHaveBeenCalledWith("body");
    expect(impactAsyncMock).toHaveBeenCalledWith("light");
  });

  it("does not fire haptic when the already-active tab is pressed", () => {
    const onValueChange = jest.fn();
    const { getByText } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={onValueChange}
        buttons={FIVE_TABS}
      />,
    );
    fireEvent.press(getByText("Workouts"));
    expect(impactAsyncMock).not.toHaveBeenCalled();
    // We still call onValueChange — parent decides whether it's a no-op.
    expect(onValueChange).toHaveBeenCalledWith("workouts");
  });

  it("marks only the active tab as accessibility-selected", () => {
    const { getByLabelText, rerender } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );
    expect(
      getByLabelText("Workouts progress").props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabelText("Body metrics").props.accessibilityState.selected,
    ).toBe(false);

    rerender(
      <ScrollableTabs
        value="muscles"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );
    expect(
      getByLabelText("Workouts progress").props.accessibilityState.selected,
    ).toBe(false);
    expect(
      getByLabelText("Muscle volume analysis").props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it("uses the supplied accessibilityLabel when provided, falling back to label otherwise", () => {
    const buttons = [
      { value: "a", label: "A", accessibilityLabel: "Tab A custom" },
      { value: "b", label: "B" },
    ];
    const { getByLabelText } = render(
      <ScrollableTabs value="a" onValueChange={() => {}} buttons={buttons} />,
    );
    // Custom label.
    expect(getByLabelText("Tab A custom")).toBeTruthy();
    // Fallback to label string when accessibilityLabel is missing.
    expect(getByLabelText("B")).toBeTruthy();
  });

  it("renders an animated indicator and exposes a tablist role", () => {
    const { getByTestId, root } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );
    expect(getByTestId("scrollable-tabs-indicator")).toBeTruthy();
    // Root container exposes tablist for assistive tech.
    expect(root.props.accessibilityRole).toBe("tablist");
  });

  it("shows the trailing fade only when content overflows the container and we are not scrolled to the end", () => {
    const { getByTestId, queryByTestId, UNSAFE_getAllByType } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );
    // 1) Initial render: container has zero width (no layout yet) — fade
    //    should be hidden because contentWidth (0) is not > containerWidth (0).
    expect(queryByTestId("scrollable-tabs-trailing-fade")).toBeNull();

    // 2) Container measures 200px wide.
    const tablist = UNSAFE_getAllByType(View).find(
      (n) => n.props.accessibilityRole === "tablist",
    );
    expect(tablist).toBeTruthy();
    fireEvent(tablist!, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 48 } },
    });

    // 3) ScrollView reports content width of 600px (overflows by 400px) and
    //    we are scrolled to the start. Fade must appear.
    const scrollView = UNSAFE_getAllByType(ScrollView)[0];
    fireEvent(scrollView, "contentSizeChange", 600, 48);
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { width: 600, height: 48 },
        layoutMeasurement: { width: 200, height: 48 },
      },
    });
    expect(getByTestId("scrollable-tabs-trailing-fade")).toBeTruthy();

    // 4) Scroll to the end (offset 400 → right edge reaches contentWidth).
    //    Fade must hide so the user does not see a phantom fade at the
    //    actual end of content.
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { x: 400, y: 0 },
        contentSize: { width: 600, height: 48 },
        layoutMeasurement: { width: 200, height: 48 },
      },
    });
    expect(queryByTestId("scrollable-tabs-trailing-fade")).toBeNull();
  });

  // ── CVD legibility (BLD-2729) ─────────────────────────────────────────────
  // Protanopia / deuteranopia both shift the primary hue to yellow-olive,
  // making the underline indicator's color alone insufficient to signal the
  // active state.  The non-hue treatment: active label uses fontWeight "700"
  // while inactive labels use "400".  This test guards against regression.

  it('active tab label has fontWeight "700" and inactive labels have fontWeight "400" (BLD-2729 CVD fix)', () => {
    const { UNSAFE_getAllByType } = render(
      <ScrollableTabs
        value="workouts"
        onValueChange={() => {}}
        buttons={FIVE_TABS}
      />,
    );

    // react-native Text elements that are direct children of the tab Pressables.
    // We need to inspect the style prop for fontWeight.
    // UNSAFE_getAllByType(Text) may include the Text from trailing-fade etc.
    // Filter to tab text nodes by checking their style directly.
    const { Text } = require("react-native");
    const textNodes = UNSAFE_getAllByType(Text) as Array<{ props: { style?: Record<string, unknown> | Array<Record<string, unknown>>; children?: unknown } }>;

    // Helper to resolve fontWeight from a possibly-array style prop.
    const getFontWeight = (style: unknown): string | undefined => {
      if (!style) return undefined;
      const styles = Array.isArray(style) ? style : [style];
      for (const s of styles.reverse()) {
        if (s && typeof s === "object" && "fontWeight" in s) {
          return s.fontWeight as string;
        }
      }
      return undefined;
    };

    // Tab labels are the text nodes whose children match a tab label string.
    const tabLabels = FIVE_TABS.map((t) => t.label);
    const tabTextNodes = textNodes.filter(
      (n) => typeof n.props.children === "string" && tabLabels.includes(n.props.children),
    );

    expect(tabTextNodes).toHaveLength(FIVE_TABS.length);

    for (const node of tabTextNodes) {
      const label = node.props.children as string;
      const weight = getFontWeight(node.props.style);
      if (label === "Workouts") {
        // active tab
        expect(weight).toBe("700");
      } else {
        // inactive tabs
        expect(weight).toBe("400");
      }
    }
  });
});
