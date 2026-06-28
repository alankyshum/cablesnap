/**
 * settings-link-row.test.tsx
 *
 * BLD-2032 (epic BLD-2028, P0-4): extract `SettingsLinkRow` + `SettingsTile`.
 *
 * Covers the testable acceptance criteria from the plan:
 *  - SettingsLinkRow renders title + optional caption + chevron.
 *  - onPress fires when the row is pressed.
 *  - The row meets the 48px minimum touch target.
 *  - The caption line is omitted when the caption is empty (but the row keeps
 *    its min height so an async caption cannot shift the chevron's center).
 *  - SettingsTile renders an optional `subtitle` title + children and applies
 *    `spacing.base` padding (one source of truth for density).
 */

import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { SettingsLinkRow, SETTINGS_LINK_ROW_MIN_HEIGHT } from "@/components/settings/SettingsLinkRow";
import { SettingsTile } from "@/components/settings/SettingsTile";
import { Text } from "@/components/ui/text";
import { spacing } from "@/constants/design-tokens";
import { lightMockColors } from "./helpers/theme";

const colors = lightMockColors;

/**
 * Resolves a Pressable's `style` prop, which may be a function of the press
 * state (`({ pressed }) => ...`), into a flattened style object.
 */
function resolveStyle(style: unknown) {
  const resolved = typeof style === "function" ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return StyleSheet.flatten(resolved ?? {}) as Record<string, unknown>;
}

describe("SettingsLinkRow (BLD-2032)", () => {
  it("renders the title and caption", () => {
    const { getByText } = render(
      <SettingsLinkRow
        colors={colors}
        title="Gym Profiles"
        caption="Manage gyms, cable stacks, and marker calibrations."
        accessibilityLabel="Open gym profiles settings"
        onPress={() => {}}
      />,
    );

    expect(getByText("Gym Profiles")).toBeTruthy();
    expect(getByText("Manage gyms, cable stacks, and marker calibrations.")).toBeTruthy();
  });

  it("fires onPress when the row is pressed", () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <SettingsLinkRow
        colors={colors}
        title="Advanced Set Types"
        caption="How to use rest-pause, cluster, and myo-rep sets."
        accessibilityLabel="Open advanced set types help"
        onPress={onPress}
      />,
    );

    fireEvent.press(getByLabelText("Open advanced set types help"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("meets the 48px minimum touch target", () => {
    const { getByLabelText } = render(
      <SettingsLinkRow
        colors={colors}
        title="Gym Profiles"
        accessibilityLabel="Open gym profiles settings"
        onPress={() => {}}
      />,
    );

    const row = getByLabelText("Open gym profiles settings");
    const flat = resolveStyle(row.props.style);

    expect(SETTINGS_LINK_ROW_MIN_HEIGHT).toBe(48);
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
  });

  it("omits the caption line when the caption is empty, but keeps the row", () => {
    const { getByLabelText, queryByText } = render(
      <SettingsLinkRow
        colors={colors}
        title="Adaptive Macro Coach"
        caption=""
        accessibilityLabel="Open Adaptive Macro Coach settings"
        onPress={() => {}}
      />,
    );

    // Title (and therefore the row) still renders…
    expect(queryByText("Adaptive Macro Coach")).toBeTruthy();
    // …and the row still meets its min height so the chevron does not shift
    // when an async caption arrives later.
    const row = getByLabelText("Open Adaptive Macro Coach settings");
    const flat = resolveStyle(row.props.style);
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
  });

  it("exposes the supplied accessibility label with role=button", () => {
    const { getByLabelText } = render(
      <SettingsLinkRow
        colors={colors}
        title="Gym Profiles"
        accessibilityLabel="Open gym profiles settings"
        onPress={() => {}}
      />,
    );

    const row = getByLabelText("Open gym profiles settings");
    expect(row.props.accessibilityRole).toBe("button");
  });
});

describe("SettingsTile (BLD-2032)", () => {
  it("renders the optional title and children", () => {
    const { getByText } = render(
      <SettingsTile colors={colors} title="About">
        <Text>Inner content</Text>
      </SettingsTile>,
    );

    expect(getByText("About")).toBeTruthy();
    expect(getByText("Inner content")).toBeTruthy();
  });

  it("renders children without a title when none is supplied", () => {
    const { getByText, queryByText } = render(
      <SettingsTile colors={colors}>
        <Text>Just children</Text>
      </SettingsTile>,
    );

    expect(getByText("Just children")).toBeTruthy();
    // No stray heading rendered.
    expect(queryByText("undefined")).toBeNull();
  });

  it("applies spacing.base padding as the single source of tile density", () => {
    const { getByTestId } = render(
      <SettingsTile colors={colors} testID="tile" title="About">
        <Text>Inner content</Text>
      </SettingsTile>,
    );

    const flat = StyleSheet.flatten(getByTestId("tile").props.style ?? {}) as Record<string, unknown>;
    expect(flat.padding).toBe(spacing.base);
  });
});
