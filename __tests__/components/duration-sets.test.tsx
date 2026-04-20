import React from "react";
import { render } from "@testing-library/react-native";
import { formatDurationDisplay, SetRow, type SetRowProps } from "../../components/session/SetRow";
import type { SetWithMeta } from "../../components/session/types";

// ---- formatDurationDisplay ----

describe("formatDurationDisplay", () => {
  it("returns 0:00 for null", () => {
    expect(formatDurationDisplay(null)).toBe("0:00");
  });

  it("returns 0:00 for zero", () => {
    expect(formatDurationDisplay(0)).toBe("0:00");
  });

  it("returns 0:00 for negative", () => {
    expect(formatDurationDisplay(-5)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatDurationDisplay(45)).toBe("0:45");
  });

  it("formats exactly one minute", () => {
    expect(formatDurationDisplay(60)).toBe("1:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatDurationDisplay(90)).toBe("1:30");
  });

  it("formats just under an hour", () => {
    expect(formatDurationDisplay(3599)).toBe("59:59");
  });

  it("formats exactly one hour with H:MM:SS", () => {
    expect(formatDurationDisplay(3600)).toBe("1:00:00");
  });

  it("formats hours minutes seconds", () => {
    expect(formatDurationDisplay(3661)).toBe("1:01:01");
  });

  it("formats multi-hour durations", () => {
    expect(formatDurationDisplay(7384)).toBe("2:03:04");
  });

  it("pads single-digit minutes and seconds in hour format", () => {
    expect(formatDurationDisplay(3605)).toBe("1:00:05");
  });

  it("formats 1 second", () => {
    expect(formatDurationDisplay(1)).toBe("0:01");
  });

  it("pads single-digit seconds", () => {
    expect(formatDurationDisplay(9)).toBe("0:09");
  });
});

// ---- SetRow duration mode rendering ----

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    session_id: "sess-1",
    exercise_id: "ex-1",
    set_number: 1,
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
    equipment: "barbell",
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onRPE: jest.fn(),
    onHalfStep: jest.fn(),
    onHalfStepClear: jest.fn(),
    onHalfStepOpen: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    ...overrides,
  };
}

describe("SetRow — duration mode", () => {
  it("renders play button in duration mode when timer not running", () => {
    const { getByLabelText } = render(
      <SetRow {...makeProps({ trackingMode: "duration" })} />,
    );
    expect(getByLabelText("Start set timer")).toBeTruthy();
  });

  it("renders stop button when timer is running for this set", () => {
    const { getByLabelText } = render(
      <SetRow
        {...makeProps({
          trackingMode: "duration",
          isTimerRunning: true,
          isTimerActive: true,
          timerDisplaySeconds: 30,
        })}
      />,
    );
    expect(getByLabelText("Stop set timer")).toBeTruthy();
  });

  it("shows timer display when running", () => {
    const { getByText } = render(
      <SetRow
        {...makeProps({
          trackingMode: "duration",
          isTimerRunning: true,
          isTimerActive: true,
          timerDisplaySeconds: 90,
        })}
      />,
    );
    expect(getByText("1:30")).toBeTruthy();
  });
});
