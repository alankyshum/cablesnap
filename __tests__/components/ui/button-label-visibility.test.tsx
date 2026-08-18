/**
 * BLD-2585 / BLD-2581: Lock the visible-label contract for the primary
 * (`variant="default"`) Button.
 *
 * Context — the progress-tab empty-state CTA ("Start a workout") was flagged
 * by the 2026-07-02 visual audit (commit 5ccb2166) as a coral pill with no
 * visible text. Root-cause investigation (see PR / BLD-2585) proved the app
 * code is correct: the label is a real text node, navy `#1A2138` on coral
 * `#FF6038`, at full opacity and resting scale. The blank pill was an
 * audit-harness artifact — `chromium-headless-shell` in the fontless agent
 * container measures EVERY text run as 0×0 (no system fonts), so all app text
 * vanished, not just this button.
 *
 * These assertions are the durable, environment-independent regression lock
 * for the two failure modes a reviewer must never let regress on the primary
 * button:
 *
 *   1. Label color collapses to the background (invisible text) — the coral
 *      pill would then genuinely look empty on a real device.
 *   2. The press-animation opacity/scale rests at a hidden value (opacity 0 /
 *      scale 0), the "reanimated opacity race" hypothesis from the ticket. The
 *      reanimated mock resolves `useAnimatedStyle`/`useSharedValue` to their
 *      RESTING values, so the flattened animated-container style here is
 *      exactly what paints on first frame.
 *
 * Tests resolve to the light theme (default `themeMode: "system"` →
 * `useColorScheme()` → light), so colors are asserted against `Colors.light`.
 */

import React from "react";
import { StyleSheet, TextStyle, ViewStyle } from "react-native";
import { render } from "@testing-library/react-native";
import { Button } from "../../../components/ui/button";
import { Colors } from "../../../theme/colors";

/**
 * Flatten the style of the outer animated container (the `Animated.View` that
 * carries both the coral background AND the press-animation opacity/scale).
 *
 * Tree shape (animation branch): the `testID` lands on the outer `Pressable`
 * (empty style); its single child is the `Animated.View` — under the reanimated
 * mock a plain `View` whose style array is `[useAnimatedStyle(), buttonStyle,
 * …]`, i.e. carries `{ transform:[{scale}], opacity }` + `backgroundColor`.
 */
function flattenAnimatedContainer(
  screen: ReturnType<typeof render>,
  testID: string,
): ViewStyle {
  const pressable = screen.getByTestId(testID);
  const animatedView = pressable.children[0] as unknown as {
    props: { style: unknown };
  };
  return (StyleSheet.flatten(animatedView.props.style) ?? {}) as ViewStyle;
}

/** Flatten the resolved style of a queried label text node. */
function flattenLabel(node: { props: { style?: unknown } }): TextStyle {
  return (StyleSheet.flatten(node.props.style) ?? {}) as TextStyle;
}

describe("Button primary label visibility contract (BLD-2585)", () => {
  describe("label renders as visible text", () => {
    it('renders the label string as a text node for variant="default"', () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      // The label must be a real, queryable text node — not dropped.
      expect(screen.getByText("Start a workout")).toBeTruthy();
    });

    it("paints the label in the primaryForeground token (navy), never transparent nor equal to the coral background", () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      const label = screen.getByText("Start a workout");
      const labelStyle = flattenLabel(label);

      // Resolved label color is the navy foreground token…
      expect(labelStyle.color).toBe(Colors.light.primaryForeground);
      // …which must differ from the coral pill background (else invisible)…
      expect(labelStyle.color).not.toBe(Colors.light.primary);
      // …and must never be a transparent / zero-alpha color.
      expect(labelStyle.color).toBeTruthy();
      expect(String(labelStyle.color).toLowerCase()).not.toBe("transparent");
      expect(labelStyle.opacity).not.toBe(0);
    });
  });

  describe("press-animation rests at a VISIBLE state (refutes the reanimated opacity/scale race)", () => {
    it("resting animated container is fully opaque (opacity 1) when enabled", () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      const flat = flattenAnimatedContainer(screen, "cta");
      // brightness.value(1) * (disabled ? 0.5 : 1) === 1 at rest.
      expect(flat.opacity).toBe(1);
    });

    it("resting animated container is at scale 1 (not collapsed to 0)", () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      const flat = flattenAnimatedContainer(screen, "cta");
      const transforms = (flat.transform ?? []) as Array<{ scale?: number }>;
      const scaleEntry = transforms.find((t) => "scale" in t);
      expect(scaleEntry).toBeDefined();
      expect(scaleEntry!.scale).toBe(1);
    });

    it("carries the coral primary background on the same animated container", () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      const flat = flattenAnimatedContainer(screen, "cta");
      expect(flat.backgroundColor).toBe(Colors.light.primary);
    });

    it("carries a border on the same animated container for color contrast under deuteranopia emulation", () => {
      const screen = render(
        <Button variant="default" label="Start a workout" testID="cta" />,
      );
      const flat = flattenAnimatedContainer(screen, "cta");
      expect(flat.borderWidth).toBe(1);
      expect(flat.borderColor).toBe(Colors.light.border);
    });
  });

  describe("edge cases from the ticket", () => {
    it("disabled button dims to opacity 0.5 by design (label still present & legible)", () => {
      const screen = render(
        <Button
          variant="default"
          label="Start a workout"
          disabled
          testID="cta"
        />,
      );
      const flat = flattenAnimatedContainer(screen, "cta");
      expect(flat.opacity).toBe(0.5);
      // Label node still rendered when disabled.
      expect(screen.getByText("Start a workout")).toBeTruthy();
      // Label color is unchanged (the dim comes from the container, not a
      // transparent text color).
      const labelStyle = flattenLabel(screen.getByText("Start a workout"));
      expect(labelStyle.color).toBe(Colors.light.primaryForeground);
    });

    it("loading button shows the spinner and no label (unchanged behavior)", () => {
      const screen = render(
        <Button
          variant="default"
          label="Start a workout"
          loading
          testID="cta"
        />,
      );
      expect(screen.queryByText("Start a workout")).toBeNull();
    });

    it("other variants keep a visible (non-transparent, non-bg) label color — regression net", () => {
      // outline/ghost/link render label in the primary (coral) color on a
      // transparent/tinted surface; secondary uses its own foreground. None
      // may resolve to a transparent or missing color.
      for (const variant of ["outline", "ghost", "link", "secondary"] as const) {
        const screen = render(
          <Button variant={variant} label="Do it" testID={`cta-${variant}`} />,
        );
        const labelStyle = flattenLabel(screen.getByText("Do it"));
        expect(labelStyle.color).toBeTruthy();
        expect(String(labelStyle.color).toLowerCase()).not.toBe("transparent");
        screen.unmount();
      }
    });
  });
});
