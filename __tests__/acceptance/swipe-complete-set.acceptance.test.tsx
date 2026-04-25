/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-614 — SetRow swipe-right to mark complete.
 *
 * Component-level acceptance: gesture handlers route through the existing
 * `handleCheckPress` (which fires `fireSetCompletionFeedback` on the
 * false → true transition) and respect the BLD-559 single-haptic invariant.
 */
import React from "react";
import { render, act } from "@testing-library/react-native";

type Captured = {
  onUpdate?: (e: { translationX: number; velocityX: number }) => void;
  onEnd?: (e: { translationX: number; velocityX: number }) => void;
};
const captured: { current: Captured } = { current: {} };

jest.mock("react-native-gesture-handler", () => {

  const GestureDetector = ({ children }: { children: React.ReactNode }) => children;
  const make = () => {
    const g: any = {};
    g.onStart = () => g;
    g.onUpdate = (cb: any) => {
      captured.current.onUpdate = cb;
      return g;
    };
    g.onEnd = (cb: any) => {
      captured.current.onEnd = cb;
      return g;
    };
    g.enabled = () => g;
    g.activeOffsetX = () => g;
    g.activeOffsetY = () => g;
    g.failOffsetX = () => g;
    g.minDistance = () => g;
    return g;
  };
  return { GestureDetector, Gesture: { Pan: make } };
});

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const bez = () => () => 0;
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (to: any, _o: any, cb?: any) => {
      if (cb) cb(true);
      return to;
    },
    withSpring: (to: any) => to,
    withDelay: (_d: any, v: any) => v,
    withSequence: (...a: any[]) => a[a.length - 1],
    runOnJS: (fn: any) => fn,
    Easing: { bezier: bez, linear: bez, ease: bez, in: bez, out: bez, inOut: bez },
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light" },
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onPrimary: "#fff",
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
    onError: "#fff",
  }),
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

jest.mock("../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: any) => (
      <Text accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../components/session/PlateHint", () => ({
  PlateHint: () => null,
}));

const mockFireFeedback = jest.fn();
jest.mock("@/hooks/useSetCompletionFeedback", () => ({
  useSetCompletionFeedback: () => ({ fire: mockFireFeedback }),
}));

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue("1"), // hint already seen → suppress
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

import { SetRow } from "../../components/session/SetRow";
import type { SetWithMeta } from "../../components/session/types";

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

function renderRow(opts: { set?: Partial<SetWithMeta> } = {}) {
  const onCheck = jest.fn();
  const onDelete = jest.fn();
  const noop = jest.fn();
  const utils = render(
    <SetRow
      set={makeSet(opts.set)}
      step={5}
      unit="kg"
      halfStep={null}
      trackingMode="reps"
      equipment="cable"
      onUpdate={noop}
      onCheck={onCheck}
      onDelete={onDelete}
      onRPE={noop}
      onHalfStep={noop}
      onHalfStepClear={noop}
      onHalfStepOpen={noop}
      onCycleSetType={noop}
      onLongPressSetType={noop}
    />,
  );
  return { ...utils, onCheck, onDelete };
}

beforeEach(() => {
  captured.current = {};
  mockFireFeedback.mockReset();
});

describe("SetRow — BLD-614 swipe-right to complete", () => {
  it("swipe-right past threshold → onCheck once + fireSetCompletionFeedback once", () => {
    const { onCheck, onDelete } = renderRow();
    act(() => {
      captured.current.onEnd?.({ translationX: 2000, velocityX: 100 });
    });
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(mockFireFeedback).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("swipe-right on already-completed set → onCheck called BUT fireSetCompletionFeedback NOT called", () => {
    const { onCheck } = renderRow({ set: { completed: true } });
    act(() => {
      captured.current.onEnd?.({ translationX: 2000, velocityX: 100 });
    });
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(mockFireFeedback).not.toHaveBeenCalled();
  });

  it("swipe-right under threshold → no callback, no feedback", () => {
    const { onCheck } = renderRow();
    act(() => {
      captured.current.onEnd?.({ translationX: 50, velocityX: 100 });
    });
    expect(onCheck).not.toHaveBeenCalled();
    expect(mockFireFeedback).not.toHaveBeenCalled();
  });

  it("swipe-left past threshold → onDelete fires (regression: destructive path preserved)", () => {
    const { onDelete, onCheck } = renderRow();
    act(() => {
      captured.current.onEnd?.({ translationX: -2000, velocityX: -200 });
    });
    expect(onDelete).toHaveBeenCalledWith("set-1");
    expect(onCheck).not.toHaveBeenCalled();
    expect(mockFireFeedback).not.toHaveBeenCalled();
  });

  it("checkmark Pressable carries a 'complete' accessibilityAction routed through handleCheckPress", () => {
    const { getByLabelText, onCheck } = renderRow();
    const check = getByLabelText("Mark set 1 complete");
    expect(check.props.accessibilityActions).toEqual([
      { name: "complete", label: "Mark complete" },
    ]);
    check.props.onAccessibilityAction({ nativeEvent: { actionName: "complete" } });
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(mockFireFeedback).toHaveBeenCalledTimes(1);
  });

  it("row container exposes accessibilityHint mentioning both swipe directions", () => {
    const { UNSAFE_root } = renderRow();
    // Walk the tree: collect every accessibilityHint that mentions both
    // swipe directions (the row container's hint, distinct from the
    // per-control hints already verified by SetRow.swipe-delete tests).
    const hints: string[] = [];
    const visit = (node: any) => {
      if (!node) return;
      const hint = node.props?.accessibilityHint;
      if (typeof hint === "string") hints.push(hint);
      const children = node.children || [];
      for (const c of children) visit(c);
    };
    visit(UNSAFE_root);
    const bidirectional = hints.find(
      (h) => /complete/i.test(h) && /delete/i.test(h),
    );
    expect(bidirectional).toBeDefined();
    expect(bidirectional!).toMatch(/right/i);
    expect(bidirectional!).toMatch(/left/i);
  });

  it("convergence: tap and a11y action both route through the same path; gesture too", () => {
    const { getAllByA11yLabel, onCheck } = (() => {
      const r = renderRow();
      return {
        getAllByA11yLabel: (label: string) =>
          r.UNSAFE_getAllByProps({ accessibilityLabel: label }),
        ...r,
      };
    })();
    // Find the checkbox Pressable specifically (role=checkbox).
    const matches = getAllByA11yLabel("Mark set 1 complete");
    const check = matches.find(
      (m: any) => m.props?.accessibilityRole === "checkbox",
    );
    expect(check).toBeDefined();
    // Tap path
    check!.props.onPress();
    // a11y custom action path
    check!.props.onAccessibilityAction({
      nativeEvent: { actionName: "complete" },
    });
    // Gesture path
    act(() => {
      captured.current.onEnd?.({ translationX: 2000, velocityX: 100 });
    });
    expect(onCheck).toHaveBeenCalledTimes(3);
    expect(mockFireFeedback).toHaveBeenCalledTimes(3);
  });
});
