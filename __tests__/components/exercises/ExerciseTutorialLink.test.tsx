/**
 * BLD-593 — ExerciseTutorialLink component (GH #332 interim).
 */
import React from "react";
import { Alert, Linking } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import * as Sentry from "@sentry/react-native";

import { ExerciseTutorialLink } from "@/components/exercises/ExerciseTutorialLink";
import { __resetTutorialLinkLockForTests } from "@/lib/exercise-tutorial-link";

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
}));

// Minimal theme colors mock — component only depends on primary + onSurfaceVariant.
jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#3B82F6",
    onSurfaceVariant: "#6B7280",
    outlineVariant: "#E5E7EB",
  }),
}));

describe("ExerciseTutorialLink", () => {
  beforeEach(() => {
    __resetTutorialLinkLockForTests();
    jest.clearAllMocks();
  });

  it("returns null (renders nothing) when exerciseName is empty", () => {
    const { toJSON } = render(<ExerciseTutorialLink exerciseName="" />);
    expect(toJSON()).toBeNull();
  });

  it("returns null when exerciseName is whitespace-only", () => {
    const { toJSON } = render(
      <ExerciseTutorialLink exerciseName={"   \t\n "} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders the Pressable with the exact link label + caption", () => {
    const { getByText, getByTestId } = render(
      <ExerciseTutorialLink exerciseName="Cable Row" testID="tut-link" />,
    );
    // Link label.
    expect(getByText("Watch form tutorial ↗")).toBeTruthy();
    // Disclaimer caption.
    expect(
      getByText(
        /Opens YouTube search in your browser\. External content — not endorsed by CableSnap\./,
      ),
    ).toBeTruthy();
    // Pressable has accessibility role=link and label with exercise name.
    const pressable = getByTestId("tut-link");
    expect(pressable.props.accessibilityRole).toBe("link");
    expect(pressable.props.accessibilityLabel).toContain("Cable Row");
    expect(pressable.props.accessibilityLabel).toContain(
      "opens YouTube search in browser",
    );
    // The a11y label must NOT include the disclaimer caption (caption is a
    // sibling Text, not inside the Pressable).
    expect(pressable.props.accessibilityLabel).not.toMatch(
      /not endorsed by CableSnap/,
    );
    // Tap target >= 44×44.
    const flat = Array.isArray(pressable.props.style)
      ? Object.assign({}, ...pressable.props.style)
      : pressable.props.style;
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    expect(flat.minWidth).toBeGreaterThanOrEqual(44);
  });

  it("taps → opens YouTube search URL + emits Sentry open breadcrumb", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ExerciseTutorialLink exerciseName="Cable Row" testID="tut-link" />,
    );
    fireEvent.press(getByTestId("tut-link"));
    // Flush microtasks.
    await new Promise((r) => setImmediate(r));
    expect(open).toHaveBeenCalledWith(
      "https://www.youtube.com/results?search_query=Cable%20Row%20form%20tutorial",
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "exercise.tutorial",
        message: "open",
      }),
    );
  });

  it("failure path: Alert + open_failed breadcrumb when canOpenURL is false", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByTestId } = render(
      <ExerciseTutorialLink exerciseName="Cable Row" testID="tut-link" />,
    );
    fireEvent.press(getByTestId("tut-link"));
    await new Promise((r) => setImmediate(r));
    expect(alertSpy).toHaveBeenCalled();
    const [title] = alertSpy.mock.calls[0];
    expect(title).toBe("Couldn't open browser");
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "exercise.tutorial",
        message: "open_failed",
      }),
    );
  });
});
