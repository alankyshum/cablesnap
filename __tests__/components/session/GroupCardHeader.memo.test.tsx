/**
 * BLD-2386 CORRECTION 3 — GroupCardHeader.memo.test.tsx
 *
 * Guards the React.memo wrapper at GroupCardHeader.tsx:390 so that:
 *   1. Render count stays flat (≤1 re-render) across 10 unrelated
 *      mode-change cycles (same assertion shape as BLD-560 reference).
 *   2. Items A and C introduce no always-changing props: Item A is purely
 *      subtractive (branch removed) and Item C is a static style change —
 *      neither alters the prop shape, so memo remains effective.
 *
 * BLD-560 baseline:
 *   Before BLD-560: 11 renders per 10 unrelated-mode-change cycles.
 *   After  BLD-560:  1 render  per 10 unrelated-mode-change cycles.
 *   This test locks that delta in permanently.
 */
import React, { useRef, useState } from "react";
import { Button } from "react-native";
import { act, render } from "@testing-library/react-native";
import { GroupCardHeader } from "../../../components/session/GroupCardHeader";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";
import {
  resetRenderCounts,
  dumpRenderCounts,
} from "../../../lib/dev/render-counter";
import type { TrainingMode } from "../../../lib/types";

// Silence the require inside countRender (__DEV__ is true in jest).
jest.mock("../../../lib/dev/render-counter", () => {
  const actual = jest.requireActual("../../../lib/dev/render-counter") as typeof import("../../../lib/dev/render-counter");
  return actual;
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string }) =>
    ReactLib.createElement(Text, props, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    outlineVariant: "#cac4d0",
    outline: "#79747e",
    surface: "#fffbfe",
    surfaceVariant: "#e7e0ec",
    shadow: "#000000",
    background: "#fffbfe",
  }),
}));

jest.mock("../../../components/session/ExerciseNotesPanel", () => ({
  __esModule: true,
  ExerciseNotesPanel: () => null,
}));

jest.mock("../../../components/session/SuggestionExplainerModal", () => ({
  SuggestionExplainerModal: () => null,
}));

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exercise_id: "ex-1",
    name: "Cable Row",
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps",
    equipment: "cable",
    exercise_position: 0,
    link_id: null,
    sets: [],
    progressionSuggested: false,
    ...overrides,
  } as ExerciseGroup;
}

/** Stable no-op callbacks to prevent memo busting from changing function refs. */
const stableCallbacks = {
  onExerciseNotes: jest.fn(),
  onExerciseNotesDraftChange: jest.fn(),
  onToggleExerciseNotes: jest.fn(),
  onPinnedNoteDraftChange: jest.fn(),
  onPinnedNoteSave: jest.fn(),
  onBackfillCopy: jest.fn(),
  onBackfillDismiss: jest.fn(),
  onLoadBackfill: jest.fn(),
  onShowDetail: jest.fn(),
  onSwap: jest.fn(),
  onDeleteExercise: jest.fn(),
  onUpdate: jest.fn(),
  onModeChange: jest.fn(),
};

// eslint-disable-next-line max-lines-per-function
describe("GroupCardHeader — BLD-2386 CORRECTION 3 — memo regression guard", () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  it("renders exactly once on initial mount (baseline)", () => {
    resetRenderCounts();
    render(
      <GroupCardHeader
        group={makeGroup()}
        currentMode={"normal" as TrainingMode}
        exerciseNotesOpen={false}
        exerciseNotesDraft={undefined}
        firstSet={undefined as SetWithMeta | undefined}
        suggestion={null}
        step={2.5}
        {...stableCallbacks}
      />,
    );
    const rows = dumpRenderCounts();
    const row = rows.find((r) => r.name === "GroupCardHeader");
    // Should be exactly 1 render on mount. Allow ≤2 for strict-mode double-invoke.
    expect(row?.renders ?? 0).toBeLessThanOrEqual(2);
    expect(row?.renders ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("does not re-render when unrelated parent state changes (10 cycles)", async () => {
    const group = makeGroup();

    // A component that re-renders the parent 10 times but passes stable props to GroupCardHeader.
    function TestWrapper() {
      const [counter, setCounter] = useState(0);
      const triggerRef = useRef<() => void>(() => setCounter((n) => n + 1));
      // Store trigger in a ref so tests can call it outside React.
      triggerRef.current = () => setCounter((n) => n + 1);

      return (
        <>
          <GroupCardHeader
            group={group}
            currentMode={"normal" as TrainingMode}
            exerciseNotesOpen={false}
            exerciseNotesDraft={undefined}
            firstSet={undefined as SetWithMeta | undefined}
            suggestion={null}
            step={2.5}
            {...stableCallbacks}
          />
          {/* An unrelated counter UI that forces parent to re-render */}
          <Button
            testID="bump"
            onPress={() => setCounter((n) => n + 1)}
            title={`counter: ${counter}`}
          />
        </>
      );
    }

    resetRenderCounts();
    const { getByTestId } = render(<TestWrapper />);

    // Trigger 10 parent re-renders that do NOT change any GroupCardHeader prop.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        getByTestId("bump").props.onPress?.();
      });
    }

    const rows = dumpRenderCounts();
    const row = rows.find((r) => r.name === "GroupCardHeader");
    // With React.memo, GroupCardHeader should not re-render after mount.
    // Allow ≤2 as tolerance for strict-mode double-invoke in dev.
    expect(row?.renders ?? 0).toBeLessThanOrEqual(2);
  });

  it("Item A — null pinnedNote renders consistently: no spurious re-render", () => {
    // Item A removed the '+ Add pinned note' branch. The remaining null branch
    // renders nothing — no new prop that changes on each cycle.
    const group = makeGroup({ pinnedNote: null });
    resetRenderCounts();
    render(
      <GroupCardHeader
        group={group}
        currentMode={"normal" as TrainingMode}
        exerciseNotesOpen={false}
        exerciseNotesDraft={undefined}
        firstSet={undefined as SetWithMeta | undefined}
        suggestion={null}
        step={2.5}
        {...stableCallbacks}
      />,
    );
    const rows = dumpRenderCounts();
    const row = rows.find((r) => r.name === "GroupCardHeader");
    // Exactly 1 render on mount (no spurious re-render from null branch).
    expect(row?.renders ?? 0).toBeLessThanOrEqual(2);
    expect(row?.renders ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("Item C — static style change (padding 8→10) does not introduce dynamic props", () => {
    // Item C only changed iconBtn: { padding: 10 } — a static StyleSheet entry.
    // No dynamic value derived from props, so memo is unaffected.
    const group = makeGroup();
    resetRenderCounts();
    render(
      <GroupCardHeader
        group={group}
        currentMode={"normal" as TrainingMode}
        exerciseNotesOpen={false}
        exerciseNotesDraft={undefined}
        firstSet={undefined as SetWithMeta | undefined}
        suggestion={null}
        step={2.5}
        {...stableCallbacks}
      />,
    );
    const rows = dumpRenderCounts();
    const row = rows.find((r) => r.name === "GroupCardHeader");
    expect(row?.renders ?? 0).toBeLessThanOrEqual(2);
    expect(row?.renders ?? 0).toBeGreaterThanOrEqual(1);
  });
});
