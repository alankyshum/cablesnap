import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SetRow } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

// Mock expo-vector-icons
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

// Mock theme colors
jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onPrimary: "#ffffff",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    surface: "#fffbfe",
    surfaceVariant: "#e7e0ec",
    tertiaryContainer: "#f8e1e7",
    onTertiaryContainer: "#31101d",
    errorContainer: "#ffdad6",
    onErrorContainer: "#410002",
    error: "#b3261e",
    outline: "#79747e",
    background: "#fffbfe",
    onError: "#ffffff",
  }),
}));

// Mock expo-haptics to avoid side effects in tests
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light" },
}));

// Mock WeightPicker
jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) => (
      <Text accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({
  PlateHint: () => null,
}));

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    workout_session_id: "s1",
    exercise_id: 1,
    set_number: 1,
    round: null,
    weight: 60,
    reps: 10,
    rpe: null,
    notes: null,
    completed: false,
    set_type: "normal",
    duration_seconds: null,
    created_at: Date.now(),
    previous: "60 × 10",
    is_pr: false,
    ...overrides,
  } as SetWithMeta;
}

function renderRow(props: Partial<React.ComponentProps<typeof SetRow>> = {}) {
  const onDelete = jest.fn();
  const onCheck = jest.fn();
  const onUpdate = jest.fn();
  const noop = jest.fn();
  const utils = render(
    <SetRow
      set={makeSet(props.set)}
      step={5}
      unit="kg"
      trackingMode="reps"
      equipment="cable"
      onUpdate={onUpdate}
      onCheck={onCheck}
      onDelete={onDelete}
      onCycleSetType={noop}
      onLongPressSetType={noop}
      {...props}
    />,
  );
  return { ...utils, onDelete, onCheck };
}

describe("SetRow — BLD-543 delete affordance & hit targets", () => {
  it("faded delete icon is an accessible button with a11y label + hint, and no onPress", () => {
    const { UNSAFE_getByProps, onDelete } = renderRow();
    const hint = UNSAFE_getByProps({ testID: "set-set-1-delete-hint" });
    expect(hint.props.accessible).toBe(true);
    expect(hint.props.accessibilityRole).toBe("button");
    expect(hint.props.accessibilityLabel).toBe("Delete set 1");
    expect(typeof hint.props.accessibilityHint).toBe("string");
    // Sighted single-tap must NOT delete — no onPress handler at all.
    expect(hint.props.onPress).toBeUndefined();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("long-press on the faded icon fires onDelete (delayLongPress=600)", () => {
    const { UNSAFE_getByProps, onDelete } = renderRow();
    const hint = UNSAFE_getByProps({ testID: "set-set-1-delete-hint" });
    expect(hint.props.delayLongPress).toBe(600);
    fireEvent(hint, "longPress");
    expect(onDelete).toHaveBeenCalledWith("set-1");
  });

  it("screen-reader 'activate' action fires onDelete; other actions are no-ops", () => {
    const { UNSAFE_getByProps, onDelete } = renderRow();
    const hint = UNSAFE_getByProps({ testID: "set-set-1-delete-hint" });
    expect(hint.props.accessibilityActions).toEqual([
      { name: "activate", label: "Delete set 1" },
    ]);
    hint.props.onAccessibilityAction({ nativeEvent: { actionName: "activate" } });
    expect(onDelete).toHaveBeenCalledWith("set-1");
    hint.props.onAccessibilityAction({ nativeEvent: { actionName: "noop" } });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("completion checkbox uses enlarged hit target (BLD-579: visible ≥ 48, effective ≥ 60×60)", () => {
    const { getByLabelText } = renderRow();
    const check = getByLabelText("Mark set 1 complete");
    // Asymmetric hitSlop: right=0 keeps the enlarged hit box from overlapping
    // the adjacent delete Pressable. See BLD-579 / GH #334.
    const slop = check.props.hitSlop;
    expect(typeof slop).toBe("object");
    expect(slop.right ?? 0).toBe(0);
    const styles = Array.isArray(check.props.style) ? check.props.style : [check.props.style];
    const merged = Object.assign({}, ...styles.filter(Boolean));
    expect(merged.width).toBeGreaterThanOrEqual(48);
    expect(merged.height).toBeGreaterThanOrEqual(48);
    const effectiveH = merged.width + (slop.left ?? 0) + (slop.right ?? 0);
    const effectiveV = merged.height + (slop.top ?? 0) + (slop.bottom ?? 0);
    expect(effectiveH).toBeGreaterThanOrEqual(60);
    expect(effectiveV).toBeGreaterThanOrEqual(60);
  });

  it("does not render RPE chip radios (BLD-615: prompt removed)", () => {
    const { UNSAFE_queryAllByProps } = renderRow({ set: makeSet({ completed: true }) });
    const chips = UNSAFE_queryAllByProps({ accessibilityRole: "radio" });
    expect(chips.length).toBe(0);
  });
});
