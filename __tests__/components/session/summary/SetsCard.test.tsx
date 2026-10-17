/**
 * SetsCard.test.tsx — BLD-3660
 *
 * Tests for the exercise spacing fix in the completed-workout Summary Sets card.
 *
 * Fix: Replaced per-item `marginBottom: 8` on `exerciseGroup` with a single
 * `gap: 8` on a wrapping container (`exerciseGroups`), so spacing
 * between every exercise group is equal with no trailing margin on the last item.
 */

import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render } from "@testing-library/react-native";
import SetsCard from "../../../../components/session/summary/SetsCard";
import { makeMockThemeColors } from "../../../helpers/theme";
import type { WorkoutSet } from "@/lib/types";

// Mock the useIntensityMode hook to avoid DB/react-query dependency
jest.mock("@/hooks/useIntensityMode", () => ({
  useIntensityMode: jest.fn(() => "rpe"),
}));

const SETS_CARD_PATH = path.resolve(
  __dirname,
  "../../../../components/session/summary/SetsCard.tsx"
);
const source = fs.readFileSync(SETS_CARD_PATH, "utf8");

/** Minimal WorkoutSet factory — fills required fields with sensible test defaults. */
function makeSet(overrides: Partial<WorkoutSet> & { id: string }): WorkoutSet {
  return {
    session_id: "sess-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: null,
    reps: null,
    completed: true,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: null,
    round: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "normal",
    duration_seconds: null,
    exercise_position: 0,
    ...overrides,
  };
}

describe("SetsCard spacing and rendering (BLD-3660)", () => {
  const colors = makeMockThemeColors("light");

  const mockGrouped = [
    {
      name: "Squat",
      sets: [
        makeSet({ id: "set-1", weight: 100, reps: 5, tempo: "3010", rpe: 8 }),
        makeSet({ id: "set-2", weight: 80, reps: 4, rpe: 8.5 }),
      ],
    },
    {
      name: "Bench Press",
      sets: [
        makeSet({ id: "set-3", weight: 60, reps: 8, rpe: 9 }),
      ],
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
    expect(source).toMatch(/exerciseGroups/);
    expect(source).toMatch(/gap:\s*8/);
  });

  it("does NOT use marginBottom: 8 on per-item exerciseGroup style (old broken pattern)", () => {
    // The old pattern — marginBottom: 8 on each exerciseGroup — left a trailing
    // gap after the last group and produced unequal visual spacing.
    // This invariant ensures we never regress to that pattern.
    expect(source).not.toContain("exerciseGroup: { marginBottom:");
  });

  it("each mapped group View no longer carries the exerciseGroup style", () => {
    // Previously: <View key={group.name} style={styles.exerciseGroup}>
    // Now:        <View key={group.name}> (gap managed by parent)
    expect(source).not.toContain("style={styles.exerciseGroup}");
  });
});
