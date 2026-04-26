/**
 * BLD-613 — SetRow shows a primary-colored outline when the set is completed,
 * and the row's outer dimensions are byte-identical between completed and
 * non-completed states (the base 2px transparent border is compensated by
 * reduced padding, so toggling completion changes only `borderColor`).
 */
import React from "react";
import { render } from "@testing-library/react-native";

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

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

const PRIMARY = "#6200ee";
const BACKGROUND = "#fffbfe";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: PRIMARY,
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
    background: BACKGROUND,
    onError: "#ffffff",
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

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
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
    ...overrides,
  } as SetWithMeta;
}

function baseProps(set: SetWithMeta): SetRowProps {
  const noop = jest.fn();
  return {
    set,
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

function flatten(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flatten(s) }), {});
  }
  return style as Record<string, unknown>;
}

function findSetRowContainer(root: ReturnType<typeof render>) {
  // The row container is the only Pressable hint that mentions "Swipe ... to complete"
  return root.getByA11yHint(
    /Swipe (right|left) to complete, swipe (right|left) to delete/,
  );
}

describe("SetRow completed outline (BLD-613)", () => {
  it("AC-1: completed set renders a primary-colored outline", () => {
    const r = render(<SetRow {...baseProps(makeSet({ completed: true }))} />);
    const container = findSetRowContainer(r);
    const style = flatten(container.props.style);
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe(PRIMARY);
  });

  it("AC-2: non-completed set has a transparent border (no visible outline)", () => {
    const r = render(<SetRow {...baseProps(makeSet({ completed: false }))} />);
    const container = findSetRowContainer(r);
    const style = flatten(container.props.style);
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe("transparent");
  });

  it("AC-3: outer box dimensions identical across completed/non-completed states", () => {
    const completed = render(<SetRow {...baseProps(makeSet({ completed: true }))} />);
    const incomplete = render(<SetRow {...baseProps(makeSet({ completed: false }))} />);
    const a = flatten(findSetRowContainer(completed).props.style);
    const b = flatten(findSetRowContainer(incomplete).props.style);

    // The only allowed delta is borderColor; everything that affects layout must match.
    const layoutKeys = [
      "paddingVertical",
      "paddingHorizontal",
      "borderWidth",
      "borderRadius",
      "marginBottom",
      "flexDirection",
      "alignItems",
    ];
    for (const k of layoutKeys) {
      expect(a[k]).toEqual(b[k]);
    }
  });
});
