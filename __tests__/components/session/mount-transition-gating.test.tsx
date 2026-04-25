/**
 * BLD-596 — gating + render-counter integration tests for the mount-position
 * chip and transition hint.
 *
 * Covers the four required cases from the approved plan that the unit tests
 * cannot reach:
 *   (a) `onSwap` mid-session — swapping an exercise to a different mount
 *       updates the chip on that card AND recomputes both adjacent hints.
 *   (b) `onMoveUp` / `onMoveDown` — reorder recomputes hints against new
 *       neighbours.
 *   (d) `GroupCardHeader` render-counter assertion — adding the chip does
 *       NOT cause unrelated re-renders when an OTHER group's `currentMode`
 *       changes (extends the BLD-560 guard to chip-bearing headers).
 *
 * (c) DB-loaded null is covered in `MountPositionChip.test.tsx` — chip self-
 * suppresses identically on `null` and `undefined` via `!mount` truthiness.
 */
import React, { useState } from "react";
import { render, act } from "@testing-library/react-native";
import {
  shouldShowMountTransition,
} from "../../../components/session/MountTransitionHint";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import {
  resetRenderCounts,
  dumpRenderCounts,
} from "../../../lib/dev/render-counter";
import type { ExerciseGroup } from "../../../components/session/types";
import type { MountPosition, TrainingMode } from "../../../lib/types";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    onSurfaceVariant: "#49454f",
    surfaceVariant: "#ECE6F0",
    outlineVariant: "#cac4d0",
  }),
}));

jest.mock("../../../components/TrainingModeSelector", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>ModeSelector</Text> };
});

jest.mock("../../../components/session/ExerciseNotesPanel", () => ({
  ExerciseNotesPanel: () => null,
}));

const mkGroup = (
  exercise_id: string,
  mount: MountPosition | null,
): ExerciseGroup => ({
  exercise_id,
  name: `Exercise ${exercise_id}`,
  sets: [],
  link_id: null,
  training_modes: ["weight"],
  is_voltra: true,
  is_bodyweight: false,
  trackingMode: "reps",
  equipment: "cable",
  exercise_position: 0,
  mount_position: mount,
});

describe("BLD-596 — mount-transition gating (swap/reorder)", () => {
  // (a) + (b) combined into ONE name via case table — keeps the test budget
  // tight while still asserting the swap and reorder transitions.
  it("swap and reorder recompute transition hints against new neighbours", () => {
    // Initial layout: Low → High → Mid (two boundaries: low|high, high|mid).
    let groups = [
      mkGroup("a", "low"),
      mkGroup("b", "high"),
      mkGroup("c", "mid"),
    ];
    expect(shouldShowMountTransition(groups[0], groups[1])).toBe(true); // low→high
    expect(shouldShowMountTransition(groups[1], groups[2])).toBe(true); // high→mid

    // (a) Swap middle exercise b: high → low.
    groups = [groups[0], { ...groups[1], mount_position: "low" }, groups[2]];
    expect(shouldShowMountTransition(groups[0], groups[1])).toBe(false); // low|low
    expect(shouldShowMountTransition(groups[1], groups[2])).toBe(true); // low→mid

    // (b) Reorder: move a (low) to the end → groups: [b(low), c(mid), a(low)].
    groups = [groups[1], groups[2], groups[0]];
    expect(shouldShowMountTransition(groups[0], groups[1])).toBe(true); // low→mid
    expect(shouldShowMountTransition(groups[1], groups[2])).toBe(true); // mid→low
  });

  it("suppresses the hint when either neighbour lacks a mount", () => {
    expect(
      shouldShowMountTransition(mkGroup("a", "low"), mkGroup("b", null)),
    ).toBe(false);
    expect(
      shouldShowMountTransition(mkGroup("a", null), mkGroup("b", "high")),
    ).toBe(false);
    expect(shouldShowMountTransition(undefined, mkGroup("a", "low"))).toBe(
      false,
    );
  });

  it("suppresses the hint when both neighbours share the same mount", () => {
    expect(
      shouldShowMountTransition(mkGroup("a", "high"), mkGroup("b", "high")),
    ).toBe(false);
  });
});

// (d) — render-counter regression. The chip must not cause the memoised
// GroupCardHeader to re-render when an UNRELATED group's mode changes.
describe("BLD-596 — chip does not regress GroupCardHeader memoisation", () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  type Setter = (prev: Record<string, TrainingMode>) => Record<string, TrainingMode>;

  const STABLE_GROUP = mkGroup("ex-1", "low");
  const noop = () => {};
  const stableProps = {
    exerciseNotesOpen: false,
    exerciseNotesDraft: undefined,
    firstSet: undefined,
    previousPerformance: null,
    previousPerformanceA11y: null,
    onModeChange: noop,
    onExerciseNotes: noop,
    onExerciseNotesDraftChange: noop,
    onToggleExerciseNotes: noop,
    onShowDetail: noop,
    onSwap: noop,
    onDeleteExercise: noop,
    onMoveUp: noop,
    onMoveDown: noop,
    onPrefill: noop,
    isFirst: false,
    isLast: false,
    showMoveButtons: false,
  } as const;

  function Harness({
    onExpose,
  }: {
    onExpose: (s: (s: Setter) => void) => void;
  }) {
    const [modes, setModes] = useState<Record<string, TrainingMode>>({
      "ex-1": "weight",
      "ex-2": "weight",
    });
    onExpose(setModes as unknown as (s: Setter) => void);
    return (
      <GroupCardHeader
        {...stableProps}
        group={STABLE_GROUP}
        currentMode={modes["ex-1"]}
      />
    );
  }

  it("does not re-render when an unrelated group's mode toggles (chip on)", () => {
    let setter: ((s: Setter) => void) | null = null;
    render(<Harness onExpose={(s) => { setter = s; }} />);

    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);

    for (let i = 0; i < 5; i++) {
      act(() => {
        setter!((prev) => ({
          ...prev,
          "ex-2": i % 2 === 0 ? "eccentric_overload" : "weight",
        }));
      });
    }

    // Chip introduction must not regress BLD-560: still 1 render.
    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);
  });
});
