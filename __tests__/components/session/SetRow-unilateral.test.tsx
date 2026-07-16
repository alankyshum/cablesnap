/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

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
  const React = require("react");
  const { TextInput } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, onValueChange, accessibilityLabel, testID }: any) => (
      <TextInput
        value={value != null ? String(value) : ""}
        onChangeText={(text: string) => onValueChange(parseFloat(text) || 0)}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    ),
  };
});

jest.mock("../../../components/session/SetWeightCell", () => {
  const React = require("react");
  const { TextInput } = require("react-native");
  return {
    __esModule: true,
    SetWeightCell: ({ displayedWeight, onWeightChange, testID, accessibilityLabel }: any) => (
      <TextInput
        value={displayedWeight != null ? String(displayedWeight) : ""}
        onChangeText={(text: string) => onWeightChange(parseFloat(text) || 0)}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      />
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

function makeSet(leftValues = {}, rightValues = {}): SetWithMeta {
  return {
    id: "s1",
    session_id: "sess",
    exercise_id: "ex1",
    set_number: 1,
    round: null,
    weight: null,
    reps: null,
    rpe: null,
    notes: null,
    completed: false,
    set_type: "normal",
    duration_seconds: null,
    previous: "",
    is_pr: false,
    left: {
      id: "left-1",
      session_id: "sess",
      exercise_id: "ex1",
      set_number: 1,
      weight: 12,
      reps: 10,
      completed: false,
      set_type: "normal",
      ...leftValues,
    },
    right: {
      id: "right-1",
      session_id: "sess",
      exercise_id: "ex1",
      set_number: 1,
      weight: 14,
      reps: 10,
      completed: false,
      set_type: "normal",
      ...rightValues,
    },
  } as unknown as SetWithMeta;
}

describe("SetRow Unilateral Tests", () => {
  it("renders Left and Right inputs correctly when trackUnilateral is true", () => {
    const onUpdate = jest.fn();
    const set = makeSet();
    const props: SetRowProps = {
      set: set.left as any,
      rightSet: set.right,
      trackUnilateral: true,
      step: 2.5,
      unit: "kg",
      trackingMode: "reps",
      equipment: "cable",
      onUpdate,
      onCheck: jest.fn(),
      onDelete: jest.fn(),
      onCycleSetType: jest.fn(),
      onLongPressSetType: jest.fn(),
    };

    const { getByTestId, getByLabelText } = render(<SetRow {...props} />);

    expect(getByTestId("set-1-left-weight")).toBeTruthy();
    expect(getByTestId("set-1-left-reps")).toBeTruthy();
    expect(getByTestId("set-1-right-weight")).toBeTruthy();
    expect(getByTestId("set-1-right-reps")).toBeTruthy();
    expect(getByLabelText("Copy Left to Right")).toBeTruthy();
  });

  it("updates left and right side weights independently", () => {
    const onUpdate = jest.fn();
    const set = makeSet();
    const props: SetRowProps = {
      set: set.left as any,
      rightSet: set.right,
      trackUnilateral: true,
      step: 2.5,
      unit: "kg",
      trackingMode: "reps",
      equipment: "cable",
      onUpdate,
      onCheck: jest.fn(),
      onDelete: jest.fn(),
      onCycleSetType: jest.fn(),
      onLongPressSetType: jest.fn(),
    };

    const { getByTestId } = render(<SetRow {...props} />);

    fireEvent.changeText(getByTestId("set-1-left-weight"), "15");
    expect(onUpdate).toHaveBeenCalledWith("left-1", "weight", "15");

    fireEvent.changeText(getByTestId("set-1-right-weight"), "18");
    expect(onUpdate).toHaveBeenCalledWith("right-1", "weight", "18");
  });

  it("enforces neutral copy template and bans copy denylist words & Δ symbol", () => {
    const set = makeSet({ weight: 12, reps: 10 }, { weight: 14, reps: 10 });
    const props: SetRowProps = {
      set: set.left as any,
      rightSet: set.right,
      trackUnilateral: true,
      step: 2.5,
      unit: "kg",
      trackingMode: "reps",
      equipment: "cable",
      onUpdate: jest.fn(),
      onCheck: jest.fn(),
      onDelete: jest.fn(),
      onCycleSetType: jest.fn(),
      onLongPressSetType: jest.fn(),
    };

    const { getByLabelText } = render(<SetRow {...props} />);

    const label = getByLabelText(/Difference is \d+ percent/);
    expect(label).toBeTruthy();

    const text = label.props.accessibilityLabel;
    
    // Exact template check
    expect(text).toContain("Left side 12 kg by 10 reps, Right side 14 kg by 10 reps. Difference is 14 percent.");

    // Banned words denylist check (imbalance, deficiency, correct, fix, weak, behind, should, warning, bad, good, poor, symmetry, asymmetry)
    const denylist = [
      "imbalance", "deficiency", "correct", "fix", "weak", "behind", "should", "warning",
      "bad", "good", "poor", "symmetry", "asymmetry", "Δ"
    ];

    for (const word of denylist) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it("handles missing/absent rightSet gracefully and invokes onUpdate with right side parameter", () => {
    const onUpdate = jest.fn();
    const set = makeSet();
    const props: SetRowProps = {
      set: set.left as any,
      rightSet: undefined,
      trackUnilateral: true,
      step: 2.5,
      unit: "kg",
      trackingMode: "reps",
      equipment: "cable",
      onUpdate,
      onCheck: jest.fn(),
      onDelete: jest.fn(),
      onCycleSetType: jest.fn(),
      onLongPressSetType: jest.fn(),
    };

    const { getByTestId, queryByLabelText } = render(<SetRow {...props} />);

    expect(getByTestId("set-1-left-weight")).toBeTruthy();
    expect(getByTestId("set-1-right-weight")).toBeTruthy();
    
    // Difference display should be hidden since rightSet is missing
    const differenceLabel = queryByLabelText(/Difference/);
    expect(differenceLabel).toBeNull();

    // Typing in the right weight input should call onUpdate with set.id and "right" side parameter
    fireEvent.changeText(getByTestId("set-1-right-weight"), "16");
    expect(onUpdate).toHaveBeenCalledWith("left-1", "weight", "16", "right");

    // Typing in the right reps input should call onUpdate with set.id and "right" side parameter
    fireEvent.changeText(getByTestId("set-1-right-reps"), "12");
    expect(onUpdate).toHaveBeenCalledWith("left-1", "reps", "12", "right");
  });
});
