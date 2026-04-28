/**
 * BLD-771 — SetMountPositionChip unit tests.
 *
 * Mirrors the MountPositionChip test pattern (BLD-596). The per-set chip is a
 * sibling of the exercise-level MountPositionChip — same visual styling, but
 * reads `set.mount_position` instead of `exercise.mount_position`. Tests
 * confirm the visual / a11y contract is identical so the two chips are
 * indistinguishable in shared UX.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { SetMountPositionChip } from "../../../components/session/SetMountPositionChip";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../../lib/types";
import { fontSizes } from "../../../constants/design-tokens";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#ECE6F0",
    onSurfaceVariant: "#49454F",
  }),
}));

const MOUNTS: MountPosition[] = ["high", "mid", "low", "floor"];

describe("SetMountPositionChip — BLD-771", () => {
  it.each(MOUNTS)(
    "renders 'Mount: %s' visually with matching a11y label",
    (mount) => {
      const label = MOUNT_POSITION_LABELS[mount];
      const { getByText, getByLabelText } = render(
        <SetMountPositionChip mount={mount} />,
      );
      expect(getByText(`Mount: ${label}`)).toBeTruthy();
      const node = getByLabelText(`Mount: ${label}`);
      expect(node.props.accessibilityRole).toBeUndefined();
    },
  );

  it("renders nothing when mount is null (DB-loaded null)", () => {
    const { toJSON } = render(<SetMountPositionChip mount={null} />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when mount is undefined", () => {
    const { toJSON } = render(<SetMountPositionChip mount={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it("uses fontSizes.xs token for label typography", () => {
    const label = MOUNT_POSITION_LABELS.high;
    const { getByText } = render(<SetMountPositionChip mount="high" />);
    const labelNode = getByText(`Mount: ${label}`);
    const flat = StyleSheet.flatten(labelNode.props.style) ?? {};
    expect(flat.fontSize).toBe(fontSizes.xs);
    expect(flat.lineHeight).toBe(16);
  });
});
