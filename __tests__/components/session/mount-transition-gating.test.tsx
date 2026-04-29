/**
 * BLD-596 — gating + render-counter integration tests for the mount-position
 * transition hint.
 *
 * Originally covered four cases. After BLD-850 the in-header
 * `MountPositionChip` was removed (mount info is fully owned by per-set
 * `SetMountPositionChip` rows now). This file is therefore narrowed to the
 * cases that DO NOT depend on the in-header chip rendering — i.e. the
 * pure `shouldShowMountTransition` algorithm and the BLD-560 memo guard:
 *
 *   (a) `onSwap` mid-session — swapping an exercise to a different mount
 *       updates both adjacent hint computations.
 *   (b) `onMoveUp` / `onMoveDown` — reorder recomputes hints against new
 *       neighbours.
 *   (d) `GroupCardHeader` render-counter assertion — the header still
 *       memoises correctly when an OTHER group's `currentMode` changes.
 *
 * The previous in-header chip rendering integration test and the header-
 * height regression check (which both asserted the chip shows up inside
 * `GroupCardHeader`) have been removed alongside the chip itself. Per-set
 * mount chip rendering is covered by `SetMountPositionChip.test.tsx`.
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

jest.mock("../../../components/TrainingModeSelector", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../../components/session/ExerciseNotesPanel", () => ({
  ExerciseNotesPanel: () => null,
}));

// BLD-850: stub the modal so the tree stays small.
jest.mock("../../../components/session/SuggestionExplainerModal", () => ({
  SuggestionExplainerModal: () => null,
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

// (d) — render-counter regression. After BLD-850 the header no longer renders
// MountPositionChip, but the BLD-560 memo guard (per-group `currentMode`
// scalar prop wins over a `modes` Record) is still load-bearing for session
// scroll perf. Keep the assertion here so it stays close to its sibling tests.
describe("BLD-596 / BLD-850 — header memoisation guard", () => {
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
    suggestion: null,
    step: 2.5,
    onUpdate: noop,
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

  it("does not re-render when an unrelated group's mode toggles", () => {
    let setter: ((s: Setter) => void) | null = null;
    render(<Harness onExpose={(s) => { setter = s; }} />);

    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);

    for (let i = 0; i < 5; i++) {
      act(() => {
        setter!((prev) => ({
          ...prev,
          "ex-2": i % 2 === 0 ? "band" : "weight",
        }));
      });
    }

    // BLD-560 invariant — still 1 render after BLD-850's prop additions.
    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);
  });
});
