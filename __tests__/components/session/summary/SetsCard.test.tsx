/**
 * SetsCard.test.tsx — BLD-3660
 *
 * Tests for the exercise spacing fix in the completed-workout Summary Sets card.
 *
 * Fix: Replaced per-item `marginBottom: 8` on `exerciseGroup` with a single
 * `gap: 8` on a wrapping container (`exerciseGroupsContainer`), so spacing
 * between every exercise group is equal with no trailing margin on the last item.
 */

import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render } from "@testing-library/react-native";
import SetsCard from "../../../../components/session/summary/SetsCard";
import { makeMockThemeColors } from "../../../helpers/theme";

// Mock the useIntensityMode hook to avoid DB/react-query dependency
jest.mock("@/hooks/useIntensityMode", () => ({
  useIntensityMode: jest.fn(() => "rpe"),
}));

const SETS_CARD_PATH = path.resolve(
  __dirname,
  "../../../../components/session/summary/SetsCard.tsx"
);
const source = fs.readFileSync(SETS_CARD_PATH, "utf8");

describe("SetsCard spacing and rendering (BLD-3660)", () => {
  const colors = makeMockThemeColors("light");

  const mockGrouped = [
    {
      name: "Squat",
      sets: [
        { id: "set-1", weight: 100, reps: 5, tempo: "3010", rpe: 8 },
        { id: "set-2", weight: 80, reps: 4, tempo: null, rpe: 8.5 },
      ] as any[],
    },
    {
      name: "Bench Press",
      sets: [
        { id: "set-3", weight: 60, reps: 8, tempo: null, rpe: 9 },
      ] as any[],
    },
  ];

  // ── 1. Rendering: exercise names and set data appear in the tree ───────────

  it("renders the Sets header", () => {
    const { getByText } = render(<SetsCard grouped={mockGrouped} colors={colors} />);
    expect(getByText("Sets")).toBeTruthy();
  });

  it("renders all exercise group names", () => {
    const { getByText } = render(<SetsCard grouped={mockGrouped} colors={colors} />);
    expect(getByText("Squat")).toBeTruthy();
    expect(getByText("Bench Press")).toBeTruthy();
  });

  it("renders weight × reps text for each set", () => {
    const { getByText } = render(<SetsCard grouped={mockGrouped} colors={colors} />);
    expect(getByText("100 × 5")).toBeTruthy();
    expect(getByText("80 × 4")).toBeTruthy();
    expect(getByText("60 × 8")).toBeTruthy();
  });

  it("renders the tempo annotation when tempo is present", () => {
    const { getByText } = render(<SetsCard grouped={mockGrouped} colors={colors} />);
    expect(getByText("♩ 3010")).toBeTruthy();
  });

  // ── 2. Source invariants: gap-based spacing, no trailing marginBottom ──────

  it("uses a container View with gap: 8 to space exercise groups", () => {
    // The grouped.map() must be wrapped in a View that applies gap: 8.
    // This ensures equal spacing between groups with no trailing space after
    // the last group (the gap property only applies between sibling elements).
    expect(source).toMatch(/exerciseGroupsContainer/);
    expect(source).toMatch(/gap:\s*8/);
  });

  it("does NOT use marginBottom: 8 on per-item exerciseGroup style (old broken pattern)", () => {
    // The old pattern — marginBottom: 8 on each exerciseGroup — left a trailing
    // gap after the last group and produced unequal visual spacing.
    // This invariant ensures we never regress to that pattern.
    expect(source).not.toMatch(/exerciseGroup[^s][\s\S]{0,80}marginBottom:\s*8/);
    // Also verify the old style key is gone entirely
    expect(source).not.toContain("exerciseGroup: { marginBottom:");
  });

  it("each mapped group View no longer carries the exerciseGroup style", () => {
    // Previously: <View key={group.name} style={styles.exerciseGroup}>
    // Now:        <View key={group.name}> (gap managed by parent)
    expect(source).not.toContain("style={styles.exerciseGroup}");
  });
});
