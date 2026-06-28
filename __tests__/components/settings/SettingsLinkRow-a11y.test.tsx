/**
 * __tests__/components/settings/SettingsLinkRow-a11y.test.tsx
 *
 * BLD-2037 (P2-9, epic BLD-2028) — A11y regression coverage for the settings
 * row primitive introduced by the masonry redesign.
 *
 * Acceptance criterion covered: "Touch targets >=48px on all rows." This is the
 * source-of-truth guard for the row primitive — asserting the flattened
 * `minHeight` on `SettingsLinkRow` is deterministic and immune to screen-level
 * mock churn, so a future style edit that drops the row below 48px fails here.
 *
 * Live-screen coverage (every redesign row mounted inside the Settings masonry)
 * lives in __tests__/acceptance/settings-responsive-a11y.test.tsx.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import {
  SettingsLinkRow,
  SETTINGS_LINK_ROW_MIN_HEIGHT,
} from "@/components/settings/SettingsLinkRow";
import { lightMockColors } from "../../helpers/theme";

/**
 * Flatten an RNTL node's `style` prop (which may be a `Pressable` style
 * function result, an array, or a plain object) into a single object so we can
 * read `minHeight` regardless of how the component composed its styles.
 *
 * `SettingsLinkRow` uses a `style={({ pressed }) => [...]}` callback; RNTL
 * resolves that to the array form in `node.props.style`, so `StyleSheet.flatten`
 * is sufficient here.
 */
function flatStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

const TID = "link-row";

function renderRow(extra: Partial<React.ComponentProps<typeof SettingsLinkRow>> = {}) {
  const onPress = jest.fn();
  const utils = render(
    <SettingsLinkRow
      colors={lightMockColors}
      title="Gym Profiles"
      accessibilityLabel="Open gym profiles settings"
      onPress={onPress}
      testID={TID}
      {...extra}
    />,
  );
  return { ...utils, onPress };
}

describe("SettingsLinkRow — a11y & touch target (BLD-2037 P2-9)", () => {
  it("exports a 48px minimum-height token (guards the >=48px acceptance criterion)", () => {
    expect(SETTINGS_LINK_ROW_MIN_HEIGHT).toBeGreaterThanOrEqual(48);
  });

  it("renders as an accessible button exposing its label", () => {
    const { getByTestId } = renderRow();
    const row = getByTestId(TID);
    expect(row.props.accessibilityRole).toBe("button");
    expect(row.props.accessibilityLabel).toBe("Open gym profiles settings");
  });

  it("has a flattened minHeight >= 48 (touch target) with a caption present", () => {
    const { getByTestId } = renderRow({ caption: "Manage gyms and cable stacks." });
    const style = flatStyle(getByTestId(TID).props.style);
    expect(style.minHeight as number).toBeGreaterThanOrEqual(48);
  });

  it("keeps minHeight >= 48 when the caption is absent or empty (async caption can't shrink the target)", () => {
    // Empty-string caption is the Macro Coach loading state in settings.tsx.
    for (const caption of [undefined, ""] as const) {
      const { getByTestId, unmount } = renderRow({ caption });
      const style = flatStyle(getByTestId(TID).props.style);
      expect(style.minHeight as number).toBeGreaterThanOrEqual(48);
      unmount();
    }
  });

  it("fires onPress when activated", () => {
    const { getByTestId, onPress } = renderRow();
    fireEvent.press(getByTestId(TID));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
