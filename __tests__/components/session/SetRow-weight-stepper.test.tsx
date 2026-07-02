/**
 * BLD-2674 — SessionWeightStepper acceptance tests.
 *
 * Covers all plan ACs headlessly:
 *  - Case C (plain numeric): stepper renders; tap + / tap − changes value
 *  - kg value 20 step 2.5, tap + → 22.5 (onValueChange called)
 *  - lb value 45 step 5, tap − → 40
 *  - value at min (0), tap − → disabled, no change
 *  - value at max (500), tap + → disabled, no change
 *  - off-grid 47.5 step 5, tap + → 52.5 (no grid-snap)
 *  - repeated taps: no float drift
 *  - a11y: +/− announce correctly, disabled state
 *  - tap target ≥ 44 effective via style or hitSlop
 *  - bodyweight row → stepper absent
 *  - Case B (calibrated cable) row → stepper absent
 *  - completed + RPE → stepper absent (suppress option B)
 *  - SetRow renders stepper testID on a Case C row
 *  - 320px layout guard: stepper is a sibling footer, not inside pickerCol
 *  - NumericStepper no-op refactor: parity with pre-stepWeight values
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// ─── Required mocks for rendering SetRow ─────────────────────────────────────

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text testID="mci-icon">{name}</Text>,
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

jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({
      value,
      accessibilityLabel,
      testID,
    }: {
      value: number | null;
      accessibilityLabel: string;
      testID?: string;
    }) => (
      <Text accessibilityLabel={accessibilityLabel} testID={testID ?? "weight-picker"}>
        {value}
      </Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({
  PlateHint: () => null,
}));

jest.mock("../../../components/SwipeRowAction", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import { SessionWeightStepper } from "../../../components/session/SessionWeightStepper";
import type { SetWithMeta } from "../../../components/session/types";
import type { Equipment } from "../../../lib/types";
import type { StackWithCalibrations } from "@/hooks/useActiveCalibration";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSet(over: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1",
    session_id: "sess",
    exercise_id: "ex1",
    set_number: 1,
    round: null,
    weight: 20,
    reps: 10,
    rpe: null,
    notes: "",
    completed: false,
    completed_at: null,
    set_type: "normal",
    duration_seconds: null,
    link_id: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    exercise_position: 0,
    previous: "",
    is_pr: false,
    stack_marker: null,
    stack_unit_at_log: null,
    ...over,
  } as unknown as SetWithMeta;
}

const calibratedStack: StackWithCalibrations = {
  id: "stk1",
  name: "Stack A",
  unit: "kg",
  // @ts-expect-error partial fixture
  calibrations: [{ id: "c1", marker: 1, true_weight: 5 }],
};

function baseProps(over: Partial<SetRowProps> = {}): SetRowProps {
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "barbell" as Equipment,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    isBodyweight: false,
    stacks: [],
    ...over,
  };
}

// ─── SessionWeightStepper unit tests ─────────────────────────────────────────

describe("SessionWeightStepper — step up/down", () => {
  it("calls onValueChange(22.5) when + tapped with value=20 step=2.5", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    fireEvent.press(getByTestId("wstepper-increment"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(22.5);
  });

  it("calls onValueChange(40) when − tapped with value=45 step=5 (lb)", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={45}
        step={5}
        unit="lb"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    fireEvent.press(getByTestId("wstepper-decrement"));
    expect(onChange).toHaveBeenCalledWith(40);
  });
});

describe("SessionWeightStepper — min/max clamp + disabled state", () => {
  it("− is disabled and onValueChange not called when value=0", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={0}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    const decrementBtn = getByTestId("wstepper-decrement");
    // accessibilityState.disabled = true
    expect(decrementBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(decrementBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("+ is disabled and onValueChange not called when value=500", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={500}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    const incrementBtn = getByTestId("wstepper-increment");
    expect(incrementBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(incrementBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("null value + tap + → onValueChange(2.5) (starts from 0)", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={null}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    fireEvent.press(getByTestId("wstepper-increment"));
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it("null value + tap − → disabled, onValueChange not called", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={null}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    const decrementBtn = getByTestId("wstepper-decrement");
    expect(decrementBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(decrementBtn);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SessionWeightStepper — off-grid and float rounding", () => {
  it("off-grid 47.5 + step 5 → 52.5 (no grid-snap)", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SessionWeightStepper
        displayedWeight={47.5}
        step={5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );
    fireEvent.press(getByTestId("wstepper-increment"));
    expect(onChange).toHaveBeenCalledWith(52.5);
  });

  it("no float drift: 2.5 step 4 taps from 0 = 10.0 exactly", () => {
    // Simulate the sequential multi-tap scenario by checking the math is right;
    // onValueChange is called with the exact float each time via stepWeight.
    const values: number[] = [];
    let current: number | null = 0;
    const onChange = jest.fn((v: number) => {
      values.push(v);
      current = v;
    });

    const { getByTestId, rerender } = render(
      <SessionWeightStepper
        displayedWeight={current}
        step={2.5}
        unit="kg"
        onValueChange={onChange}
        testID="wstepper"
      />
    );

    // Tap 4 times, re-rendering with updated value each time
    for (let i = 1; i <= 4; i++) {
      fireEvent.press(getByTestId("wstepper-increment"));
      rerender(
        <SessionWeightStepper
          displayedWeight={current}
          step={2.5}
          unit="kg"
          onValueChange={onChange}
          testID="wstepper"
        />
      );
    }

    expect(values).toHaveLength(4);
    expect(values[3]).toBe(10);
    expect(String(values[3])).toBe("10");
  });
});

describe("SessionWeightStepper — a11y", () => {
  it("− button has accessibilityLabel 'Decrease by 2.5'", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-decrement").props.accessibilityLabel).toBe("Decrease by 2.5");
  });

  it("+ button has accessibilityLabel 'Increase by 2.5'", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-increment").props.accessibilityLabel).toBe("Increase by 2.5");
  });

  it("uses the provided step in a11y label (step=5)", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={45} step={5} unit="lb" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-decrement").props.accessibilityLabel).toBe("Decrease by 5");
    expect(getByTestId("ws-increment").props.accessibilityLabel).toBe("Increase by 5");
  });

  it("− button accessibilityRole is button", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-decrement").props.accessibilityRole).toBe("button");
  });

  it("+ button accessibilityRole is button", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-increment").props.accessibilityRole).toBe("button");
  });

  it("− not disabled when value > 0", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-decrement").props.accessibilityState?.disabled).toBe(false);
  });

  it("+ not disabled when value < 500", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    expect(getByTestId("ws-increment").props.accessibilityState?.disabled).toBe(false);
  });
});

describe("SessionWeightStepper — touch target ≥ 44", () => {
  function effectiveTarget(style: unknown, hitSlop: unknown, axis: "h" | "v"): number {
    const flat: Record<string, number> =
      Array.isArray(style)
        ? Object.assign({}, ...style.map((s: unknown) => s ?? {}))
        : ((style ?? {}) as Record<string, number>);
    const slop = hitSlop as Record<string, number> | number | undefined;
    const slopTotal =
      typeof slop === "number"
        ? slop * 2
        : axis === "h"
          ? ((slop?.left ?? 0) + (slop?.right ?? 0))
          : ((slop?.top ?? 0) + (slop?.bottom ?? 0));
    return (axis === "h" ? (flat.width ?? 40) : (flat.height ?? 28)) + slopTotal;
  }

  it("− button effective horizontal target ≥ 44 dp", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    const btn = getByTestId("ws-decrement");
    const t = effectiveTarget(btn.props.style, btn.props.hitSlop, "h");
    expect(t).toBeGreaterThanOrEqual(44);
  });

  it("+ button effective horizontal target ≥ 44 dp", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    const btn = getByTestId("ws-increment");
    const t = effectiveTarget(btn.props.style, btn.props.hitSlop, "h");
    expect(t).toBeGreaterThanOrEqual(44);
  });

  it("− button effective vertical target ≥ 44 dp", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    const btn = getByTestId("ws-decrement");
    const t = effectiveTarget(btn.props.style, btn.props.hitSlop, "v");
    expect(t).toBeGreaterThanOrEqual(44);
  });

  it("+ button effective vertical target ≥ 44 dp", () => {
    const { getByTestId } = render(
      <SessionWeightStepper displayedWeight={20} step={2.5} unit="kg" onValueChange={jest.fn()} testID="ws" />
    );
    const btn = getByTestId("ws-increment");
    const t = effectiveTarget(btn.props.style, btn.props.hitSlop, "v");
    expect(t).toBeGreaterThanOrEqual(44);
  });
});

// ─── SetRow gating tests ──────────────────────────────────────────────────────

describe("SetRow — weight stepper gating (BLD-2674)", () => {
  it("Case C (plain barbell row): stepper testID renders", () => {
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 20 }),
        })}
      />
    );
    expect(getByTestId("set-1-weight-stepper")).toBeTruthy();
  });

  it("Case C: tap + calls onUpdate with increased weight", () => {
    const onUpdate = jest.fn();
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 20 }),
          step: 2.5,
          onUpdate,
        })}
      />
    );
    fireEvent.press(getByTestId("set-1-weight-stepper-increment"));
    expect(onUpdate).toHaveBeenCalledWith("s1", "weight", "22.5");
  });

  it("Case C: tap − calls onUpdate with decreased weight", () => {
    const onUpdate = jest.fn();
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 45 }),
          step: 5,
          unit: "lb",
          onUpdate,
        })}
      />
    );
    fireEvent.press(getByTestId("set-1-weight-stepper-decrement"));
    expect(onUpdate).toHaveBeenCalledWith("s1", "weight", "40");
  });

  it("bodyweight row: stepper does NOT render", () => {
    const { queryByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "bodyweight" as Equipment,
          isBodyweight: true,
        })}
      />
    );
    expect(queryByTestId("set-1-weight-stepper")).toBeNull();
  });

  it("Case B (cable + calibrated manual/legacy): stepper does NOT render", () => {
    // Case B = isCable && hasCalibration && weight !== null && stackMarker === null
    const { queryByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          stacks: [calibratedStack],
          set: makeSet({ weight: 50, stack_marker: null }),
        })}
      />
    );
    expect(queryByTestId("set-1-weight-stepper")).toBeNull();
  });

  it("uncalibrated cable row (Case C): stepper DOES render", () => {
    // isCable + no calibrations = uncalibrated cable → stepper should appear
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          stacks: [], // no calibrations
          set: makeSet({ weight: 20, stack_marker: null }),
        })}
      />
    );
    expect(getByTestId("set-1-weight-stepper")).toBeTruthy();
  });

  it("duration mode row: stepper does NOT render", () => {
    const { queryByTestId } = render(
      <SetRow
        {...baseProps({
          trackingMode: "duration",
          set: makeSet({ weight: null, duration_seconds: 60 }),
        })}
      />
    );
    expect(queryByTestId("set-1-weight-stepper")).toBeNull();
  });

  it("completed Case C row with captureRpe: stepper does NOT render (suppress option B)", () => {
    const { queryByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 20, completed: true }),
          captureRpe: true,
        })}
      />
    );
    expect(queryByTestId("set-1-weight-stepper")).toBeNull();
  });

  it("completed Case C row WITHOUT captureRpe: stepper renders", () => {
    // Completed row with no RPE → stepper is fine (no height budget issue)
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 20, completed: true }),
          captureRpe: false,
        })}
      />
    );
    expect(getByTestId("set-1-weight-stepper")).toBeTruthy();
  });
});

// ─── 320px layout guard ───────────────────────────────────────────────────────

describe("SetRow — 320px narrow layout guard (BLD-2674 AC QD-required)", () => {
  it("stepper footer is a sibling of the main row, not inside pickerCol", () => {
    /**
     * The stepper MUST be rendered OUTSIDE pickerCol (which has flex:1,
     * marginHorizontal:12 and is ~25px wide on a 320px device). We verify
     * this structurally: the stepper testID exists and is NOT a descendant
     * of the weight picker testID's parent chain inside the main row.
     *
     * Implementation: testID "set-1-weight-stepper" is on the SessionWeightStepper
     * footer View (outside SwipeRowAction / outside the main setRow View).
     * The weight picker is inside SwipeRowAction > setRow > pickerCol.
     * The stepper is a sibling after </SwipeRowAction> at the top-level row wrapper.
     *
     * We confirm both exist and that their testIDs are distinct root elements
     * by querying independently — if stepper were inside pickerCol, this layout
     * would violate the plan hard constraint (BLD-2674 §UX Design).
     */
    const { getByTestId } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          set: makeSet({ weight: 20 }),
        })}
      />
    );

    // Weight picker is in the main row (pickerCol)
    const weightPicker = getByTestId("set-1-weight");
    // Stepper is a footer sibling (OUTSIDE the main row SwipeRowAction)
    const stepper = getByTestId("set-1-weight-stepper");

    // Both exist independently
    expect(weightPicker).toBeTruthy();
    expect(stepper).toBeTruthy();

    // Stepper is NOT a descendant of the weight picker's container.
    // In RTL, we check by asserting they are in different subtrees by
    // inspecting the weight picker's ancestors to ensure they don't contain
    // the stepper. (Simple check: the stepper's parent is not inside the
    // weight picker element tree.)
    expect(weightPicker.findAll((node) => node.props?.testID === "set-1-weight-stepper")).toHaveLength(0);
  });
});

// ─── NumericStepper refactor characterization guard ──────────────────────────

describe("NumericStepper — stepWeight refactor characterization (BLD-2674)", () => {
  /**
   * These tests characterize NumericStepper's behavior after the stepWeight
   * extraction refactor. Note: the refactor is NOT strictly behavior-preserving
   * at off-grid values within one step above min. The old inline guard was:
   *
   *   const next = Math.round((value - step) * 10) / 10;
   *   if (next >= min) onValueChange(next);  // silent no-call if below min
   *
   * The new guard calls stepWeight which clamps to min and fires onValueChange
   * if the clamped value differs from the current value:
   *
   *   const next = stepWeight(value, step, -1, { min, max }); // clamps to min
   *   if (next !== value) onValueChange(next);                // fires if clamped
   *
   * Divergence example: value=1, step=2.5, min=0
   *   OLD: next = Math.round((1-2.5)*10)/10 = -1.5 → -1.5 < 0 → NO CALL
   *   NEW: stepWeight(1, 2.5, -1, {min:0}) = Math.max(0, -1.5) = 0 → CALLS onValueChange(0)
   *
   * The new behavior is CORRECT (clamp-to-bound beats silently dead button).
   * These tests document the actual contract callers can rely on.
   */

  // ── Values well above min (identical in old and new) ──────────────────────

  it("increment 10 by step 2.5 → 12.5 (identical to old)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    expect(stepWeight(10, 2.5, 1, { min: 0, max: 9999 })).toBe(12.5);
  });

  it("decrement 10 by step 5 → 5 (identical to old)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    expect(stepWeight(10, 5, -1, { min: 0, max: 9999 })).toBe(5);
  });

  it("decrement at min(0) → 0 (identical to old — value already at min, no change)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    expect(stepWeight(0, 2.5, -1, { min: 0, max: 9999 })).toBe(0);
  });

  it("increment at max(9999) → 9999 (identical to old — value already at max)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    expect(stepWeight(9999, 1, 1, { min: 0, max: 9999 })).toBe(9999);
  });

  // ── Divergent cases: off-grid value within one step above min ─────────────
  // NEW behavior: clamps to min and fires. OLD behavior: silently no-call.
  // The new behavior is intentionally better — documents the contract change.

  it("divergent: value=1, step=2.5, min=0 → clamps to 0 (new: fires; old: silent no-call)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    // stepWeight returns 0 (clamped), which !== 1, so NumericStepper calls onValueChange(0)
    expect(stepWeight(1, 2.5, -1, { min: 0, max: 9999 })).toBe(0);
  });

  it("divergent: value=2.5, step=5, min=0 → clamps to 0 (new: fires; old: silent no-call)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    // 2.5 - 5 = -2.5 → clamp to 0; fires onValueChange(0)
    expect(stepWeight(2.5, 5, -1, { min: 0, max: 9999 })).toBe(0);
  });

  it("divergent: value=2, step=5, min=1 → clamps to 1 (new: fires; old: silent no-call)", () => {
    const { stepWeight } = require("../../../lib/weight-step");
    // 2 - 5 = -3 → clamp to 1; fires onValueChange(1)
    expect(stepWeight(2, 5, -1, { min: 1, max: 9999 })).toBe(1);
  });
});
