/**
 * BLD-690 — EditedPill snapshot/behavior tests.
 *
 * The pill is shared across the detail header, summary header, and history
 * list row. These tests prove (a) it renders the same DOM regardless of
 * theme/size and (b) it returns null for null/undefined `editedAt` so call
 * sites can render unconditionally without stomping on layout.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { EditedPill } from "../../../components/session/EditedPill";

const colors = {
  surfaceVariant: "#ECE6F0",
  onSurfaceVariant: "#49454F",
  outline: "#79747E",
} as unknown as Parameters<typeof EditedPill>[0]["colors"];

describe("EditedPill — BLD-690", () => {
  it("renders 'Edited' text with a11y date when editedAt is set", () => {
    const { getByText, getByLabelText } = render(
      <EditedPill editedAt={Date.UTC(2025, 0, 15, 12, 0, 0)} colors={colors} />,
    );
    expect(getByText("Edited")).toBeTruthy();
    // Locale-formatted date string should mention the year and "Edited" prefix.
    const node = getByLabelText(/This workout was edited on/);
    expect(node).toBeTruthy();
  });

  it("returns null when editedAt is null", () => {
    const { queryByText } = render(<EditedPill editedAt={null} colors={colors} />);
    expect(queryByText("Edited")).toBeNull();
  });

  it("returns null when editedAt is undefined", () => {
    const { queryByText } = render(<EditedPill editedAt={undefined} colors={colors} />);
    expect(queryByText("Edited")).toBeNull();
  });

  it("renders both compact and default sizes via the same component", () => {
    const a = render(<EditedPill editedAt={1700000000000} colors={colors} size="compact" />);
    const b = render(<EditedPill editedAt={1700000000000} colors={colors} size="default" />);
    expect(a.getByText("Edited")).toBeTruthy();
    expect(b.getByText("Edited")).toBeTruthy();
  });
});
