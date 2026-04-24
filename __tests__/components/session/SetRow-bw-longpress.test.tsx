// BLD-541 AC-10: long-press on the bodyweight modifier chip must not
// propagate to or collide with the set-type long-press (colSet column).
// The two long-press gestures live on separate Pressables in separate
// columns; this test locks the contract by ensuring a chip long-press
// fires onClearBodyweightModifier exactly once and onLongPressSetType
// never fires.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-bw-1",
    session_id: "sess-1",
    exercise_id: "ex-pull-up",
    set_number: 2,
    weight: 0,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: null,
    round: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "normal",
    duration_seconds: null,
    exercise_position: 0,
    bodyweight_modifier_kg: 20,
    ...overrides,
  };
}

function makeProps(overrides: Partial<SetRowProps> = {}): SetRowProps {
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    halfStep: null,
    trackingMode: "reps",
    equipment: "bodyweight",
    isBodyweight: true,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onRPE: jest.fn(),
    onHalfStep: jest.fn(),
    onHalfStepClear: jest.fn(),
    onHalfStepOpen: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    onOpenBodyweightModifier: jest.fn(),
    onClearBodyweightModifier: jest.fn(),
    ...overrides,
  };
}

describe("SetRow — bodyweight modifier chip long-press collision (BLD-541 AC-10)", () => {
  it("long-press on chip fires onClearBodyweightModifier and NOT onLongPressSetType", () => {
    const onLongPressSetType = jest.fn();
    const onClearBodyweightModifier = jest.fn();
    const onOpenBodyweightModifier = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...makeProps({
          onLongPressSetType,
          onClearBodyweightModifier,
          onOpenBodyweightModifier,
        })}
      />,
    );

    const chip = getByLabelText(/Set 2 load, Weighted, plus 20 kilograms/i);
    fireEvent(chip, "longPress");

    expect(onClearBodyweightModifier).toHaveBeenCalledTimes(1);
    expect(onClearBodyweightModifier).toHaveBeenCalledWith("set-bw-1");
    expect(onLongPressSetType).not.toHaveBeenCalled();
    expect(onOpenBodyweightModifier).not.toHaveBeenCalled();
  });

  it("tap on chip opens the sheet and does NOT cycle set type", () => {
    const onCycleSetType = jest.fn();
    const onOpenBodyweightModifier = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...makeProps({
          onCycleSetType,
          onOpenBodyweightModifier,
        })}
      />,
    );

    const chip = getByLabelText(/Set 2 load, Weighted, plus 20 kilograms/i);
    fireEvent.press(chip);

    expect(onOpenBodyweightModifier).toHaveBeenCalledTimes(1);
    expect(onOpenBodyweightModifier).toHaveBeenCalledWith("set-bw-1");
    expect(onCycleSetType).not.toHaveBeenCalled();
  });

  it("long-press on the set-number column still cycles set type for bodyweight rows", () => {
    const onLongPressSetType = jest.fn();
    const onClearBodyweightModifier = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...makeProps({
          onLongPressSetType,
          onClearBodyweightModifier,
        })}
      />,
    );

    const setNumber = getByLabelText(/Set 2, working set/i);
    fireEvent(setNumber, "longPress");

    expect(onLongPressSetType).toHaveBeenCalledTimes(1);
    expect(onClearBodyweightModifier).not.toHaveBeenCalled();
  });
});
