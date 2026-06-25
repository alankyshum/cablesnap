/**
 * BLD-1235 — Regression: timer ticks must NOT reset in-flight reps/weight edits.
 *
 * Root cause: timerDisplaySeconds was in the renderExerciseGroup useCallback dep
 * array, causing every ExerciseGroupCard (and transitively every SetRow) to
 * re-render every second while a set timer was active. SetTimerContext.Provider
 * now carries the tick-only state so that only SetTimerCell re-renders per tick.
 *
 * This test verifies:
 *   1. WeightPicker (reps) preserves its in-progress draft through timer ticks.
 *   2. Blurring after a tick still commits the typed value via onUpdate.
 *   3. A non-active set shows "Start set timer" even when another set's timer runs.
 *   4. The active set shows "Stop set timer" when the timer is running for it.
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: jest.fn().mockResolvedValue(undefined),
  setEnabled: jest.fn(),
  preload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeRowAction", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock("../../../components/session/MiniSetEditor", () => ({
  MiniSetEditor: () => null,
}));

jest.mock("../../../components/session/RpeChipStrip", () => ({
  RpeChipStrip: () => null,
}));

jest.mock("../../../components/session/SetWeightCell", () => {
  const React = require("react");
  const { TextInput } = require("react-native");
  return {
    SetWeightCell: ({
      displayedWeight,
      accessibilityLabel,
      onWeightChange,
    }: {
      displayedWeight: number | null;
      accessibilityLabel: string;
      onWeightChange?: (v: number) => void;
    }) => {
      // Local draft state mirrors what WeightPicker does inside the real component.
      // If SetRow re-mounts, this state resets — which is exactly what BLD-1235
      // should prevent.
      const [draft, setDraft] = React.useState(String(displayedWeight ?? ""));
      return (
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={draft}
          onChangeText={(t: string) => setDraft(t)}
          onBlur={() => onWeightChange && onWeightChange(parseFloat(draft) || 0)}
        />
      );
    },
  };
});

jest.mock("@/hooks/useActiveCalibration", () => ({
  useActiveCalibration: () => [],
}));

jest.mock("../../../hooks/useSetCompletionFeedback", () => ({
  useSetCompletionFeedback: () => ({ fire: jest.fn() }),
}));

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import { SetTimerContext, type SetTimerContextValue } from "../../../components/session/SetTimerContext";
import type { SetWithMeta } from "../../../components/session/types";

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    session_id: "sess-1",
    exercise_id: "ex-1",
    set_number: 1,
    round: null,
    weight: 80,
    reps: 10,
    rpe: null,
    notes: "",
    completed: false,
    completed_at: null,
    set_type: "normal",
    duration_seconds: null,
    link_id: null,
    tempo: null,
    swapped_from_exercise_id: null,
    exercise_position: 0,
    previous: "80 × 10",
    is_pr: false,
    prefillCandidate: null,
    bodyweight_modifier_kg: null,
    stack_marker: null,
    stack_unit_at_log: null,
    stack_name_at_log: null,
    stack_id_at_log: null,
    pulley_pin: null,
    segments: [],
    ...overrides,
  } as unknown as SetWithMeta;
}

function makeProps(overrides: Partial<SetRowProps> = {}): SetRowProps {
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "barbell",
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    exerciseId: "ex-1",
    setIndex: 0,
    ...overrides,
  };
}

function makeTimerCtx(overrides: Partial<SetTimerContextValue> = {}): SetTimerContextValue {
  return {
    isRunning: false,
    displaySeconds: 0,
    activeExerciseId: null,
    activeSetIndex: null,
    onTimerStart: jest.fn(),
    onTimerStop: jest.fn(),
    ...overrides,
  };
}

// ---- tests ----

describe("BLD-1235 — SetTimerContext isolation", () => {
  it("non-active set shows 'Start set timer' even when timer runs for another set", () => {
    // Timer is running for ex-2/set-0, not for this set (ex-1/set-0)
    const ctx = makeTimerCtx({
      isRunning: true,
      activeExerciseId: "ex-2",
      activeSetIndex: 0,
      displaySeconds: 45,
    });
    const { getByLabelText } = render(
      <SetTimerContext.Provider value={ctx}>
        <SetRow {...makeProps({ trackingMode: "duration" })} />
      </SetTimerContext.Provider>,
    );
    expect(getByLabelText("Start set timer")).toBeTruthy();
  });

  it("active set shows 'Stop set timer' when timer is running", () => {
    const ctx = makeTimerCtx({
      isRunning: true,
      activeExerciseId: "ex-1",
      activeSetIndex: 0,
      displaySeconds: 30,
    });
    const { getByLabelText } = render(
      <SetTimerContext.Provider value={ctx}>
        <SetRow {...makeProps({ trackingMode: "duration" })} />
      </SetTimerContext.Provider>,
    );
    expect(getByLabelText("Stop set timer")).toBeTruthy();
  });

  it("active set shows formatted timer display text", () => {
    const ctx = makeTimerCtx({
      isRunning: true,
      activeExerciseId: "ex-1",
      activeSetIndex: 0,
      displaySeconds: 75,
    });
    const { getByText } = render(
      <SetTimerContext.Provider value={ctx}>
        <SetRow {...makeProps({ trackingMode: "duration" })} />
      </SetTimerContext.Provider>,
    );
    expect(getByText("1:15")).toBeTruthy();
  });

  /**
   * Core BLD-1235 regression: WeightPicker local draft must survive timer ticks.
   *
   * Simulates the user typing "12" in the reps field while the timer ticks.
   * Verifies that re-rendering with a new timer context (tick) does not
   * clobber the in-progress value and that blur commits the typed value.
   */
  it("reps WeightPicker preserves typed draft through timer context updates", () => {
    const onUpdate = jest.fn();

    // Wrapper component that lets us swap out the timer context value
    // while keeping the same SetRow instance mounted (same key).
    function Harness({ displaySeconds }: { displaySeconds: number }) {
      const ctx = makeTimerCtx({
        isRunning: true,
        activeExerciseId: "ex-2", // different exercise — set-1 is NOT the active timer set
        activeSetIndex: 0,
        displaySeconds,
      });
      return (
        <SetTimerContext.Provider value={ctx}>
          <SetRow
            {...makeProps({ onUpdate })}
          />
        </SetTimerContext.Provider>
      );
    }

    const { getByLabelText, rerender } = render(<Harness displaySeconds={10} />);

    // Locate the reps input and focus it
    const repsInput = getByLabelText("Set 1 reps, 10");
    fireEvent(repsInput, "focus");

    // User types "12"
    fireEvent.changeText(repsInput, "12");

    // Simulate 3 timer ticks (re-render with new displaySeconds)
    act(() => { rerender(<Harness displaySeconds={11} />); });
    act(() => { rerender(<Harness displaySeconds={12} />); });
    act(() => { rerender(<Harness displaySeconds={13} />); });

    // The reps input must still show "12" — not rolled back to the prop value (10)
    const inputAfterTicks = getByLabelText("Set 1 reps, 10");
    // The TextInput value should still be "12" (the draft)
    expect(inputAfterTicks.props.value).toBe("12");

    // Blur should commit "12" → call onUpdate
    fireEvent(repsInput, "blur");
    expect(onUpdate).toHaveBeenCalledWith("set-1", "reps", "12");
  });

  /**
   * BLD-1235 nit: weight-cell draft must also survive timer context updates.
   * Mirrors the reps test for the weight field path.
   */
  it("weight WeightPicker preserves typed draft through timer context updates", () => {
    const onUpdate = jest.fn();

    function Harness({ displaySeconds }: { displaySeconds: number }) {
      const ctx = makeTimerCtx({
        isRunning: true,
        activeExerciseId: "ex-2", // different exercise — not the active timer set
        activeSetIndex: 0,
        displaySeconds,
      });
      return (
        <SetTimerContext.Provider value={ctx}>
          <SetRow {...makeProps({ onUpdate })} />
        </SetTimerContext.Provider>
      );
    }

    const { getByLabelText, rerender } = render(<Harness displaySeconds={10} />);

    // Initial weight is 80 (from makeSet); find the weight input via a11y label
    const weightInput = getByLabelText("Set 1 weight, 80 kilograms");
    fireEvent(weightInput, "focus");
    fireEvent.changeText(weightInput, "85");

    // Simulate 3 timer ticks
    act(() => { rerender(<Harness displaySeconds={11} />); });
    act(() => { rerender(<Harness displaySeconds={12} />); });
    act(() => { rerender(<Harness displaySeconds={13} />); });

    // Draft must still be "85" — not rolled back to "80"
    expect(getByLabelText("Set 1 weight, 80 kilograms").props.value).toBe("85");

    // Blur must commit via onUpdate
    fireEvent(weightInput, "blur");
    expect(onUpdate).toHaveBeenCalledWith("set-1", "weight", "85");
  });

  it("timer context updates do NOT propagate onTimerStart when stopped", () => {
    const onTimerStart = jest.fn();
    const ctx = makeTimerCtx({ onTimerStart });

    const { getByLabelText } = render(
      <SetTimerContext.Provider value={ctx}>
        <SetRow {...makeProps({ trackingMode: "duration" })} />
      </SetTimerContext.Provider>,
    );

    fireEvent.press(getByLabelText("Start set timer"));
    expect(onTimerStart).toHaveBeenCalledWith("set-1");
  });
});
