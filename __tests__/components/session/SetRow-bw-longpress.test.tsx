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
    trackingMode: "reps",
    equipment: "bodyweight",
    isBodyweight: true,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    onOpenBodyweightModifier: jest.fn(),
    onClearBodyweightModifier: jest.fn(),
    ...overrides,
  };
}

describe("SetRow — bodyweight modifier chip long-press collision (BLD-541 AC-10)", () => {
  type GestureCase = {
    name: string;
    target: RegExp;
    event: "press" | "longPress";
    expectCalled: "open" | "clear" | "cycle";
  };
  const cases: GestureCase[] = [
    { name: "long-press chip → clear only", target: /Set 2 load, Weighted, plus 20 kilograms/i, event: "longPress", expectCalled: "clear" },
    { name: "tap chip → open only", target: /Set 2 load, Weighted, plus 20 kilograms/i, event: "press", expectCalled: "open" },
    { name: "long-press set-number → cycle only (no chip collision)", target: /Set 2, working set/i, event: "longPress", expectCalled: "cycle" },
  ];

  it.each(cases)("$name", ({ target, event, expectCalled }) => {
    const onOpenBodyweightModifier = jest.fn();
    const onClearBodyweightModifier = jest.fn();
    const onLongPressSetType = jest.fn();
    const onCycleSetType = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...makeProps({
          onOpenBodyweightModifier,
          onClearBodyweightModifier,
          onLongPressSetType,
          onCycleSetType,
        })}
      />,
    );

    const node = getByLabelText(target);
    if (event === "press") fireEvent.press(node);
    else fireEvent(node, "longPress");

    if (expectCalled === "open") {
      expect(onOpenBodyweightModifier).toHaveBeenCalledWith("set-bw-1");
      expect(onClearBodyweightModifier).not.toHaveBeenCalled();
      expect(onCycleSetType).not.toHaveBeenCalled();
    } else if (expectCalled === "clear") {
      expect(onClearBodyweightModifier).toHaveBeenCalledWith("set-bw-1");
      expect(onOpenBodyweightModifier).not.toHaveBeenCalled();
      expect(onLongPressSetType).not.toHaveBeenCalled();
    } else {
      expect(onLongPressSetType).toHaveBeenCalledTimes(1);
      expect(onClearBodyweightModifier).not.toHaveBeenCalled();
      expect(onOpenBodyweightModifier).not.toHaveBeenCalled();
    }
  });
});
