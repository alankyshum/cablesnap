/**
 * BLD-2674: SessionWeightStepper render tests.
 *
 * Covers all acceptance criteria from the plan:
 *   1. Stepper renders on Case C (plain numeric, non-cable, non-bodyweight) rows
 *   2. Stepper suppressed on Case B (calibrated-cable manual/legacy) rows
 *   3. Stepper suppressed on bodyweight rows
 *   4. Stepper suppressed on completed Case C + RPE rows (≤96dp budget)
 *   5. −/+ buttons call onValueChange with stepped value
 *   6. − disabled (accessibilityState.disabled) at min (0)
 *   7. + disabled at max (500)
 *   8. a11y labels: "Decrease by {step}" / "Increase by {step}"
 *   9. Touch target ≥ 44dp via size + hitSlop
 *   10. 320px layout: main-row controls (weight testID) present and stepper present
 *   11. Stepper absent on duration-mode rows
 *
 * Most tests render SessionWeightStepper directly; layout tests render
 * a minimal SetRow to verify the gate logic.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SessionWeightStepper } from "../../../components/session/SessionWeightStepper";

// ── Mocks (same set used by sibling SetRow tests) ─────────────────────────

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

// ── Direct component tests ────────────────────────────────────────────────

describe("SessionWeightStepper — basic render", () => {
  it("renders minus and plus buttons", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
        testID="s1-weight"
      />
    );
    expect(getByLabelText("Decrease by 2.5")).toBeTruthy();
    expect(getByLabelText("Increase by 2.5")).toBeTruthy();
  });

  it("renders correct a11y labels for lb unit with step 5", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={45}
        step={5}
        unit="lb"
        onValueChange={jest.fn()}
      />
    );
    expect(getByLabelText("Decrease by 5")).toBeTruthy();
    expect(getByLabelText("Increase by 5")).toBeTruthy();
  });
});

describe("SessionWeightStepper — step callbacks", () => {
  it("calls onValueChange with value+step when + is pressed", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Increase by 2.5"));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(22.5);
  });

  it("calls onValueChange with value−step when − is pressed", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={45}
        step={5}
        unit="lb"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Decrease by 5"));
    expect(onValueChange).toHaveBeenCalledWith(40);
  });

  it("steps up from null value (null = 0, first tap → step)", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={null}
        step={2.5}
        unit="kg"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Increase by 2.5"));
    expect(onValueChange).toHaveBeenCalledWith(2.5);
  });

  it("off-grid: 47.5 + step 5 = 52.5 (no grid-snapping)", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={47.5}
        step={5}
        unit="kg"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Increase by 5"));
    expect(onValueChange).toHaveBeenCalledWith(52.5);
  });
});

describe("SessionWeightStepper — min/max disabled state", () => {
  it("− is disabled at min (0) — accessibilityState.disabled=true", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={0}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
      />
    );
    const minusBtn = getByLabelText("Decrease by 2.5");
    expect(minusBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("− is disabled at null (treated as 0 = min)", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={null}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
      />
    );
    const minusBtn = getByLabelText("Decrease by 2.5");
    expect(minusBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("− does NOT call onValueChange when disabled at 0", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={0}
        step={2.5}
        unit="kg"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Decrease by 2.5"));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("+ is disabled at max (500) — accessibilityState.disabled=true", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={500}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
      />
    );
    const plusBtn = getByLabelText("Increase by 2.5");
    expect(plusBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it("+ does NOT call onValueChange when disabled at 500", () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={500}
        step={2.5}
        unit="kg"
        onValueChange={onValueChange}
      />
    );
    fireEvent.press(getByLabelText("Increase by 2.5"));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("− enabled when value > 0", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
      />
    );
    const minusBtn = getByLabelText("Decrease by 2.5");
    expect(minusBtn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it("+ enabled when value < 500", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
      />
    );
    const plusBtn = getByLabelText("Increase by 2.5");
    expect(plusBtn.props.accessibilityState?.disabled).toBeFalsy();
  });
});

describe("SessionWeightStepper — touch target ≥44dp", () => {
  function flattenStyle(style: unknown): Record<string, number> {
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
    return (style ?? {}) as Record<string, number>;
  }

  it("minus button has effective touch target ≥ 44×44 via size + hitSlop", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
        testID="s1-weight"
      />
    );
    const minusBtn = getByLabelText("Decrease by 2.5");
    const style = flattenStyle(minusBtn.props.style);
    const slop = minusBtn.props.hitSlop ?? {};
    const slopH = typeof slop === "number" ? slop * 2 : (slop.left ?? 0) + (slop.right ?? 0);
    const slopV = typeof slop === "number" ? slop * 2 : (slop.top ?? 0) + (slop.bottom ?? 0);
    expect(Number(style.width ?? 0) + slopH).toBeGreaterThanOrEqual(44);
    expect(Number(style.height ?? 0) + slopV).toBeGreaterThanOrEqual(44);
  });

  it("plus button has effective touch target ≥ 44×44 via size + hitSlop", () => {
    const { getByLabelText } = render(
      <SessionWeightStepper
        displayedWeight={20}
        step={2.5}
        unit="kg"
        onValueChange={jest.fn()}
        testID="s1-weight"
      />
    );
    const plusBtn = getByLabelText("Increase by 2.5");
    const style = flattenStyle(plusBtn.props.style);
    const slop = plusBtn.props.hitSlop ?? {};
    const slopH = typeof slop === "number" ? slop * 2 : (slop.left ?? 0) + (slop.right ?? 0);
    const slopV = typeof slop === "number" ? slop * 2 : (slop.top ?? 0) + (slop.bottom ?? 0);
    expect(Number(style.width ?? 0) + slopH).toBeGreaterThanOrEqual(44);
    expect(Number(style.height ?? 0) + slopV).toBeGreaterThanOrEqual(44);
  });
});

// ── SetRow-level gating tests ─────────────────────────────────────────────
// These tests render a minimal SetRow to verify the showWeightStepper gate
// logic produces the correct result for each case type.

jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel, testID }: { value: number | null; accessibilityLabel: string; testID?: string }) => (
      <Text testID={testID} accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeRowAction", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock("../../../components/session/StackMarkerHint", () => ({
  StackMarkerHint: () => null,
}));

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";
import type { Equipment } from "../../../lib/types";

function makeSet(over: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1", session_id: "sess", exercise_id: "ex1",
    set_number: 1, round: null, weight: 20, reps: 10, rpe: null,
    notes: "", completed: false, completed_at: null,
    set_type: "normal", duration_seconds: null, link_id: null,
    training_mode: null, tempo: null, swapped_from_exercise_id: null,
    exercise_position: 0, previous: "", is_pr: false,
    stack_marker: null, stack_unit_at_log: null,
    bodyweight_modifier_kg: null,
    segments: [],
    ...over,
  } as unknown as SetWithMeta;
}

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
    exerciseName: "Bench Press",
    ...over,
  };
}

describe("SetRow — SessionWeightStepper gate (BLD-2674)", () => {
  it("Case C: stepper is PRESENT on plain numeric non-cable row", () => {
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
        })}
      />
    );
    // Both stepper buttons should be accessible
    expect(getByLabelText("Decrease by 2.5")).toBeTruthy();
    expect(getByLabelText("Increase by 2.5")).toBeTruthy();
  });

  it("Case B: stepper ABSENT on calibrated-cable row (isCable + hasCalibration)", () => {
    const calibratedStacks = [{
      id: "stack1", name: "Left Cable", unit: "kg",
      calibrations: [{ marker: 5, true_weight: 25 }],
    }] as unknown as SetRowProps["stacks"];
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          stacks: calibratedStacks,
          set: makeSet({ weight: 20, stack_marker: null }), // Case B: manual/legacy
        })}
      />
    );
    expect(queryByLabelText("Decrease by 2.5")).toBeNull();
    expect(queryByLabelText("Increase by 2.5")).toBeNull();
  });

  it("Bodyweight: stepper ABSENT on bodyweight rows", () => {
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "bodyweight" as Equipment,
          isBodyweight: true,
          onOpenBodyweightModifier: jest.fn(),
          onClearBodyweightModifier: jest.fn(),
        })}
      />
    );
    expect(queryByLabelText("Decrease by 2.5")).toBeNull();
    expect(queryByLabelText("Increase by 2.5")).toBeNull();
  });

  it("Case C + completed + RPE: stepper ABSENT (suppress for ≤96dp height budget)", () => {
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
          captureRpe: true,
          onRpeChange: jest.fn(),
          set: makeSet({ completed: true, weight: 20 }),
        })}
      />
    );
    // Stepper must be suppressed when completed + RPE capture on
    expect(queryByLabelText("Decrease by 2.5")).toBeNull();
    expect(queryByLabelText("Increase by 2.5")).toBeNull();
  });

  it("Case C + completed WITHOUT RPE: stepper IS PRESENT", () => {
    // Without captureRpe=true, completed Case C rows still show stepper
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
          captureRpe: false,
          set: makeSet({ completed: true, weight: 20 }),
        })}
      />
    );
    expect(getByLabelText("Decrease by 2.5")).toBeTruthy();
    expect(getByLabelText("Increase by 2.5")).toBeTruthy();
  });

  it("Duration mode: stepper ABSENT", () => {
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          trackingMode: "duration",
          set: makeSet({ duration_seconds: 30, weight: null }),
        })}
      />
    );
    expect(queryByLabelText("Decrease by 2.5")).toBeNull();
    expect(queryByLabelText("Increase by 2.5")).toBeNull();
  });

  it("Cable without calibration (uncalibrated cable = Case C): stepper IS PRESENT", () => {
    // No stacks passed = no calibration = isCaseBRow=false → stepper shows
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          stacks: [], // no calibration
          set: makeSet({ weight: 20 }),
        })}
      />
    );
    expect(getByLabelText("Decrease by 2.5")).toBeTruthy();
    expect(getByLabelText("Increase by 2.5")).toBeTruthy();
  });

  it("Case C stepper + 320px layout: weight testID present and unchanged (stepper is footer sibling)", () => {
    // This is the headless proxy for the QD 320px layout AC:
    // The stepper is a full-width footer, not inside pickerCol.
    // We verify weight testID still present when stepper shows.
    const { getByTestId, getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
        })}
      />
    );
    // Main-row weight control (testID set by SetRow via SetWeightCell)
    expect(getByTestId("set-1-weight")).toBeTruthy();
    // Stepper present as sibling
    expect(getByLabelText("Decrease by 2.5")).toBeTruthy();
    expect(getByLabelText("Increase by 2.5")).toBeTruthy();
  });

  it("Case C stepper tapping + calls onUpdate with incremented weight", () => {
    const onUpdate = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
          onUpdate,
          set: makeSet({ weight: 20 }),
        })}
      />
    );
    fireEvent.press(getByLabelText("Increase by 2.5"));
    // onUpdate called with (setId, "weight", "22.5")
    expect(onUpdate).toHaveBeenCalledWith("s1", "weight", "22.5");
  });

  it("Case C stepper tapping − calls onUpdate with decremented weight", () => {
    const onUpdate = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "barbell" as Equipment,
          isBodyweight: false,
          onUpdate,
          set: makeSet({ weight: 45 }),
          step: 5,
          unit: "lb",
        })}
      />
    );
    fireEvent.press(getByLabelText("Decrease by 5"));
    expect(onUpdate).toHaveBeenCalledWith("s1", "weight", "40");
  });
});
