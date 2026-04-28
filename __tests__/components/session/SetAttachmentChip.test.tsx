/**
 * BLD-771 — SetAttachmentChip unit tests.
 *
 * Mirrors the MountPositionChip test pattern (BLD-596). Verifies:
 *  - Chip renders for all 7 ATTACHMENT_LABELS values.
 *  - A11y label uses "Attachment: <Label>" (full word; not "Att").
 *  - Visual label uses the abbreviated "Att: <Label>" prefix to fit row width.
 *  - Self-suppresses on null AND undefined (DB-loaded null vs absent).
 *  - Locks label typography to fontSizes.xs token (token-discipline guard).
 */
import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { SetAttachmentChip } from "../../../components/session/SetAttachmentChip";
import { ATTACHMENT_LABELS, type Attachment } from "../../../lib/types";
import { fontSizes } from "../../../constants/design-tokens";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#ECE6F0",
    onSurfaceVariant: "#49454F",
  }),
}));

const ATTACHMENTS: Attachment[] = [
  "handle",
  "ring_handle",
  "ankle_strap",
  "rope",
  "bar",
  "squat_harness",
  "carabiner",
];

describe("SetAttachmentChip — BLD-771", () => {
  it.each(ATTACHMENTS)(
    "renders 'Att: %s' visually with full a11y label 'Attachment: <Label>'",
    (attachment) => {
      const label = ATTACHMENT_LABELS[attachment];
      const { getByText, getByLabelText } = render(
        <SetAttachmentChip attachment={attachment} />,
      );
      // Visual label is abbreviated to fit the set-row layout
      expect(getByText(`Att: ${label}`)).toBeTruthy();
      // A11y uses the full word — never the abbreviation
      const node = getByLabelText(`Attachment: ${label}`);
      // No accessibilityRole="text" — Android warning, iOS-only hint
      expect(node.props.accessibilityRole).toBeUndefined();
    },
  );

  it("renders nothing when attachment is null (DB-loaded null)", () => {
    const { toJSON } = render(<SetAttachmentChip attachment={null} />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when attachment is undefined", () => {
    const { toJSON } = render(<SetAttachmentChip attachment={undefined} />);
    expect(toJSON()).toBeNull();
  });

  // Token-discipline regression guard (mirrors BLD-633 on MountPositionChip).
  it("uses fontSizes.xs token for label typography", () => {
    const label = ATTACHMENT_LABELS.handle;
    const { getByText } = render(<SetAttachmentChip attachment="handle" />);
    const labelNode = getByText(`Att: ${label}`);
    const flat = StyleSheet.flatten(labelNode.props.style) ?? {};
    expect(flat.fontSize).toBe(fontSizes.xs);
    expect(flat.fontSize).not.toBe(11);
    expect(flat.lineHeight).toBe(16);
  });
});
