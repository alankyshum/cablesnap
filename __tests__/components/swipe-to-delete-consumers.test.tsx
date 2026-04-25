/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lock-in test: BLD-614 refactor of SwipeToDelete onto SwipeRowAction
 * preserves single-direction (left = delete) behaviour. Right-direction
 * Pan must NOT fire any callback even past threshold (right: undefined
 * wrapper mode).
 */
import React from "react";
import { Text, View } from "react-native";
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
    g.failOffsetY = () => g;
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
  ImpactFeedbackStyle: { Medium: "medium" },
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({ error: "#b00", primary: "#06e" }),
}));

import SwipeToDelete from "../../components/SwipeToDelete";

beforeEach(() => {
  captured.current = {};
});

describe("SwipeToDelete (BLD-614 wrapper) — five-consumer lock-in", () => {
  it("left-swipe past threshold → onDelete fires (delete preserved)", () => {
    const onDelete = jest.fn();
    render(
      <SwipeToDelete onDelete={onDelete} dismissThresholdFraction={0.4} minDismissPx={0}>
        <View>
          <Text>row</Text>
        </View>
      </SwipeToDelete>,
    );
    act(() => {
      captured.current.onEnd?.({ translationX: -500, velocityX: -100 });
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("right-swipe past threshold → onDelete is NOT called (right: undefined)", () => {
    const onDelete = jest.fn();
    render(
      <SwipeToDelete onDelete={onDelete} dismissThresholdFraction={0.4} minDismissPx={0}>
        <View />
      </SwipeToDelete>,
    );
    act(() => {
      captured.current.onEnd?.({ translationX: 500, velocityX: 100 });
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("matches SetRow's destructive thresholds (0.5, 120) without regression", () => {
    const onDelete = jest.fn();
    render(
      <SwipeToDelete
        onDelete={onDelete}
        widthBasis="screen"
        dismissThresholdFraction={0.5}
        minDismissPx={120}
        velocityDismissPxPerSec={1500}
        velocityMinTranslatePx={80}
        haptic
      >
        <View />
      </SwipeToDelete>,
    );
    // Threshold = max(0.5 * screenWidth, 120). Below half-width → no commit.
    act(() => {
      captured.current.onEnd?.({ translationX: -100, velocityX: -200 });
    });
    expect(onDelete).not.toHaveBeenCalled();
    // Past half-width → commits.
    act(() => {
      captured.current.onEnd?.({ translationX: -2000, velocityX: -200 });
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("velocity override path still fires for delete", () => {
    const onDelete = jest.fn();
    render(
      <SwipeToDelete
        onDelete={onDelete}
        velocityDismissPxPerSec={1500}
        velocityMinTranslatePx={80}
      >
        <View />
      </SwipeToDelete>,
    );
    act(() => {
      captured.current.onEnd?.({ translationX: -100, velocityX: -2000 });
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
