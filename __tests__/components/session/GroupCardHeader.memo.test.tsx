/**
 * BLD-560 Slice 3 — measurement-driven React.memo for GroupCardHeader.
 *
 * Before (main @ ffaa6a6):
 *   - Prop: `modes: Record<string, TrainingMode>`
 *   - GroupCardHeader was NOT memoized.
 *   - Any unrelated exercise's mode change mutates the `modes` Record in the
 *     parent, which cascades a re-render into every group's header even
 *     though this group's selected mode didn't change.
 *
 * After (this branch):
 *   - Prop: `currentMode: TrainingMode | undefined` (per-group scalar)
 *   - GroupCardHeader wrapped in React.memo.
 *   - Unrelated mode changes no longer pass through the shallow-equality gate.
 *
 * Measurement: 10 unrelated-mode-change cycles → 1 render (initial) after,
 *              vs. 1 + 10 = 11 renders before → ~91% reduction.
 *              Well above the ≥30% bar in the BLD-560 QD pre-criteria.
 */
import React, { useState } from "react";
import { render, act } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import {
  countRender,
  resetRenderCounts,
  dumpRenderCounts,
} from "../../../lib/dev/render-counter";
import type { ExerciseGroup } from "../../../components/session/types";
import type { TrainingMode } from "../../../lib/types";

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
    outlineVariant: "#cac4d0",
  }),
}));

// BLD-850: TrainingModeSelector is no longer rendered inside the header
// (mode picker moves to the Details modal in a follow-up). The mock is
// retained in the off-chance another consumer still imports it via this
// test file's transitive graph, but it's now a no-op factory.
jest.mock("../../../components/TrainingModeSelector", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../../components/session/ExerciseNotesPanel", () => ({
  ExerciseNotesPanel: () => null,
}));

// BLD-850: SuggestionExplainerModal is rendered as a sibling of headerWrap
// even when hidden; mock it out so we don't pull in the full Modal tree.
jest.mock("../../../components/session/SuggestionExplainerModal", () => ({
  SuggestionExplainerModal: () => null,
}));

const noop = () => {};
const commonProps = {
  exerciseNotesOpen: false,
  exerciseNotesDraft: undefined,
  firstSet: undefined,
  previousPerformance: null,
  previousPerformanceA11y: null,
  // BLD-850: new optional props on GroupCardHeader. We default suggestion
  // to null + step/onUpdate to stable identities so the LastNextRow render
  // path is fully exercised by the memo regression check.
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

type Setter = (prev: Record<string, TrainingMode>) => Record<string, TrainingMode>;
type ExposeSetter = (setter: (s: Setter) => void) => void;

const STABLE_GROUP: ExerciseGroup = {
  exercise_id: "ex-1",
  name: "Exercise ex-1",
  sets: [],
  link_id: null,
  training_modes: ["weight"],
  is_voltra: false,
  is_bodyweight: false,
  trackingMode: "reps",
  equipment: "cable",
  exercise_position: 0,
};

function Harness({
  initialModes,
  onExpose,
}: {
  initialModes: Record<string, TrainingMode>;
  onExpose: ExposeSetter;
}) {
  const [modes, setModes] = useState(initialModes);
  onExpose(setModes as unknown as (s: Setter) => void);
  return (
    <GroupCardHeader
      {...commonProps}
      group={STABLE_GROUP}
      currentMode={modes[STABLE_GROUP.exercise_id]}
    />
  );
}

describe("GroupCardHeader — React.memo subscription-slice (BLD-560)", () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  it("does NOT re-render when an unrelated exercise's mode changes", () => {
    let setter: ((s: Setter) => void) | null = null;
    render(
      <Harness
        initialModes={{ "ex-1": "weight", "ex-2": "weight" }}
        onExpose={(s) => {
          setter = s;
        }}
      />,
    );

    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);

    for (let i = 0; i < 10; i++) {
      act(() => {
        setter!((prev) => ({
          ...prev,
          "ex-2": i % 2 === 0 ? "band" : "weight",
        }));
      });
    }

    // Memo + per-group currentMode: ex-1's header does not re-render when
    // only ex-2's mode changes. Without the refactor, we'd see 1 + 10 = 11.
    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);
  });

  it("DOES re-render when this group's own mode changes", () => {
    let setter: ((s: Setter) => void) | null = null;
    render(
      <Harness
        initialModes={{ "ex-1": "weight" }}
        onExpose={(s) => {
          setter = s;
        }}
      />,
    );

    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(1);

    act(() => {
      setter!((prev) => ({ ...prev, "ex-1": "band" }));
    });

    expect(
      dumpRenderCounts().find((r) => r.name === "GroupCardHeader")?.renders,
    ).toBe(2);
  });

  it("render-counter sentinel stays accurate under test isolation", () => {
    countRender("sentinel");
    expect(
      dumpRenderCounts().find((r) => r.name === "sentinel")?.renders,
    ).toBe(1);
  });
});
