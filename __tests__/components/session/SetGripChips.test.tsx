/**
 * BLD-822: SetGripTypeChip + SetGripWidthChip — display-only chips.
 *
 * Mirror tests for SetAttachmentChip / SetMountPositionChip (BLD-771).
 * Coverage: render label & a11y string for every value, self-suppress on
 * null/undefined.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { SetGripTypeChip } from "../../../components/session/SetGripTypeChip";
import { SetGripWidthChip } from "../../../components/session/SetGripWidthChip";
import type { GripType, GripWidth } from "../../../lib/types";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#ECE6F0",
    onSurfaceVariant: "#49454F",
  }),
}));

describe("SetGripTypeChip — BLD-822", () => {
  it.each<[GripType, string]>([
    ["overhand", "Grip: Overhand"],
    ["underhand", "Grip: Underhand"],
    ["neutral", "Grip: Neutral"],
    ["mixed", "Grip: Mixed"],
  ])("renders %s with a11y label %s", (value, expected) => {
    const { getByLabelText } = render(<SetGripTypeChip gripType={value} />);
    expect(getByLabelText(expected)).toBeTruthy();
  });

  it.each([null, undefined])("self-suppresses on %p", (value) => {
    const { queryByLabelText } = render(<SetGripTypeChip gripType={value} />);
    expect(queryByLabelText(/Grip:/)).toBeNull();
  });
});

describe("SetGripWidthChip — BLD-822", () => {
  it.each<[GripWidth, string]>([
    ["narrow", "Width: Narrow"],
    ["shoulder", "Width: Shoulder-width"],
    ["wide", "Width: Wide"],
  ])("renders %s with a11y label %s", (value, expected) => {
    const { getByLabelText } = render(<SetGripWidthChip gripWidth={value} />);
    expect(getByLabelText(expected)).toBeTruthy();
  });

  it.each([null, undefined])("self-suppresses on %p", (value) => {
    const { queryByLabelText } = render(<SetGripWidthChip gripWidth={value} />);
    expect(queryByLabelText(/Width:/)).toBeNull();
  });
});
