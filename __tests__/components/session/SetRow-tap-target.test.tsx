/**
 * BLD-579 regression lock: complete-set checkbox tap target geometry.
 *
 * GH #334 — gloved tap ergonomics on Z Fold 6. Requirements from the issue:
 *   - Visible circle-check size ≥ 48×48 dp.
 *   - Effective tap area (Pressable + hitSlop) ≥ 60×60 dp on BOTH axes.
 *   - Must NOT overlap the adjacent delete Pressable's hit region
 *     (components/session/SetRow.tsx:254). Concretely: the right-edge
 *     hitSlop expansion must be 0 so the enlarged hit box cannot swallow
 *     taps destined for the delete button.
 *
 * This test is a pure geometry lock — it reads the rendered Pressable's
 * style + hitSlop and asserts the numbers. It deliberately does NOT import
 * the full SetRow (which drags in WeightPicker, audio, haptics, db, etc.)
 * to keep the regression signal sharp and the test fast.
 */
import React from "react";
import { render } from "@testing-library/react-native";

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

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee", primaryContainer: "#e8def8", onPrimary: "#ffffff",
    onSurface: "#1c1b1f", onSurfaceVariant: "#49454f",
    surface: "#fffbfe", surfaceVariant: "#e7e0ec",
    tertiaryContainer: "#f8e1e7", onTertiaryContainer: "#31101d",
    errorContainer: "#ffdad6", onErrorContainer: "#410002",
    error: "#b3261e", outline: "#79747e",
    background: "#fffbfe", onError: "#ffffff",
  }),
}));

jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) => (
      <Text accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeToDelete", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

function makeSet(): SetWithMeta {
  return {
    id: "s1",
    workout_session_id: "sess",
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
    previous: "",
    is_pr: false,
  } as unknown as SetWithMeta;
}

function baseProps(): SetRowProps {
  const noop = jest.fn();
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    halfStep: null,
    trackingMode: "reps",
    equipment: "cable" as unknown as SetRowProps["equipment"],
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onRPE: jest.fn(),
    onHalfStep: noop,
    onHalfStepClear: noop,
    onHalfStepOpen: noop,
    onCycleSetType: noop,
    onLongPressSetType: noop,
  };
}

function flattenStyle(style: unknown): Record<string, number> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return (style ?? {}) as Record<string, number>;
}

describe("BLD-579: complete-set tap target geometry (GH #334)", () => {
  it("visible circle is >= 48x48 dp (WCAG 2.5.5 target size)", () => {
    const { getByLabelText } = render(<SetRow {...baseProps()} />);
    const check = getByLabelText("Mark set 1 complete");
    const style = flattenStyle(check.props.style);
    expect(style.width).toBeGreaterThanOrEqual(48);
    expect(style.height).toBeGreaterThanOrEqual(48);
  });

  it("effective hit box (visible + hitSlop) is >= 60x60 dp on both axes", () => {
    const { getByLabelText } = render(<SetRow {...baseProps()} />);
    const check = getByLabelText("Mark set 1 complete");
    const style = flattenStyle(check.props.style);
    const slop = check.props.hitSlop ?? {};

    const slopH =
      typeof slop === "number"
        ? slop * 2
        : (slop.left ?? 0) + (slop.right ?? 0);
    const slopV =
      typeof slop === "number"
        ? slop * 2
        : (slop.top ?? 0) + (slop.bottom ?? 0);

    expect(Number(style.width) + slopH).toBeGreaterThanOrEqual(60);
    expect(Number(style.height) + slopV).toBeGreaterThanOrEqual(60);
  });

  it("right-edge hitSlop is 0 so the enlarged hit box cannot overlap the adjacent delete Pressable", () => {
    const { getByLabelText } = render(<SetRow {...baseProps()} />);
    const check = getByLabelText("Mark set 1 complete");
    const slop = check.props.hitSlop;
    // Must be an object form with explicit right=0 — a scalar or missing
    // right would extend the hit region into the delete button (GH #334).
    expect(typeof slop).toBe("object");
    expect(slop.right ?? 0).toBe(0);
  });
});
