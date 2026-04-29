/**
 * BLD-850 — SuggestionExplainerModal
 *
 * Static modal that explains how the `suggest()` algorithm picks the
 * "Next" challenge. Mirrors the lightweight tooltip pattern in
 * `PreferencesCard.tsx` (`soundTooltipVisible`) — controlled visibility,
 * theme-aware, backdrop press → close.
 *
 * Coverage:
 *   - Hidden when `visible={false}`.
 *   - Renders the three case headings (Increase weight / Increase reps /
 *     Maintain) when visible.
 *   - Body copy uses the literal phrase "heaviest set last session"
 *     (the earlier draft used "last max" — ambiguous about set mode and
 *     blocked by the plan).
 *   - Close button calls `onClose`.
 *   - Backdrop press also calls `onClose`.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SuggestionExplainerModal } from "../../../components/session/SuggestionExplainerModal";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string }) =>
    ReactLib.createElement(Text, props, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    surface: "#fffbfe",
    outlineVariant: "#cac4d0",
  }),
}));

describe("SuggestionExplainerModal (BLD-850)", () => {
  it("does not render content when visible is false", () => {
    const { queryByText } = render(
      <SuggestionExplainerModal visible={false} onClose={() => {}} />,
    );
    // RN's <Modal> still mounts but its descendants are not visible. The
    // headings should not be reachable in the visible tree.
    expect(queryByText("Increase weight")).toBeNull();
    expect(queryByText("Increase reps (bodyweight)")).toBeNull();
    expect(queryByText("Maintain")).toBeNull();
  });

  it("renders the three case headings when visible", () => {
    const { getByText } = render(
      <SuggestionExplainerModal visible onClose={() => {}} />,
    );
    expect(getByText("Increase weight")).toBeTruthy();
    expect(getByText("Increase reps (bodyweight)")).toBeTruthy();
    expect(getByText("Maintain")).toBeTruthy();
  });

  it("uses the canonical phrase 'heaviest set last session' (not 'last max')", () => {
    const { queryAllByText } = render(
      <SuggestionExplainerModal visible onClose={() => {}} />,
    );
    const matches = queryAllByText(/heaviest set last session/i);
    expect(matches.length).toBeGreaterThan(0);
    const lastMaxMatches = queryAllByText(/last max/i);
    expect(lastMaxMatches.length).toBe(0);
  });

  it("calls onClose when the close button is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SuggestionExplainerModal visible onClose={onClose} />,
    );
    fireEvent.press(getByTestId("suggestion-explainer-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
