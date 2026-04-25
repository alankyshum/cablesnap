/**
 * BLD-596 — MountPositionChip unit tests.
 *
 * Verifies:
 *  - Chip renders one of the 4 `MOUNT_POSITION_LABELS` values.
 *  - Chip uses the "Mount: <Label>" a11y vocabulary (no `accessibilityRole="text"`).
 *  - Chip self-suppresses on `null` AND `undefined` (DB-loaded null vs absent).
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { MountPositionChip } from "../../../components/session/MountPositionChip";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../../lib/types";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#ECE6F0",
    onSurfaceVariant: "#49454F",
  }),
}));

const MOUNTS: MountPosition[] = ["high", "mid", "low", "floor"];

describe("MountPositionChip — BLD-596", () => {
  it.each(MOUNTS)(
    "renders the chip with label %s and a11y label 'Mount: <Label>'",
    (mount) => {
      const label = MOUNT_POSITION_LABELS[mount];
      const { getByText, getByLabelText } = render(
        <MountPositionChip mount={mount} />,
      );
      expect(getByText(label)).toBeTruthy();
      const node = getByLabelText(`Mount: ${label}`);
      // No accessibilityRole="text" — Android warning, iOS-only hint.
      expect(node.props.accessibilityRole).toBeUndefined();
    },
  );

  it("renders nothing when mount is null (DB-loaded null)", () => {
    const { toJSON } = render(<MountPositionChip mount={null} />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when mount is undefined", () => {
    const { toJSON } = render(<MountPositionChip mount={undefined} />);
    expect(toJSON()).toBeNull();
  });
});
