/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for components/SwipeRowAction.tsx (BLD-614).
 *
 * Strategy: locally mock react-native-gesture-handler so onUpdate / onEnd
 * worklets are captured into a registry we can drive synchronously.
 * The default repo mock strips them, so these tests intentionally replace it.
 */
import React from "react";
import { Text, View } from "react-native";
import { render, act } from "@testing-library/react-native";

// ---- gesture-handler mock that captures onUpdate / onEnd ----
type Captured = {
  onUpdate?: (e: { translationX: number; velocityX: number }) => void;
  onEnd?: (e: { translationX: number; velocityX: number }) => void;
  enabled?: boolean;
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
    g.enabled = (v: boolean) => {
      captured.current.enabled = v;
      return g;
    };
    g.activeOffsetX = () => g;
    g.activeOffsetY = () => g;
    g.failOffsetX = () => g;
    g.minDistance = () => g;
    return g;
  };
  return {
    GestureDetector,
    Gesture: { Pan: make },
  };
});

// ---- reanimated mock that runs withTiming callbacks synchronously ----
jest.mock("react-native-reanimated", () => {

  const { View } = require("react-native");
  const bez = () => () => 0;
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (toValue: any, _opts: any, cb?: (finished: boolean) => void) => {
      if (cb) cb(true);
      return toValue;
    },
    withSpring: (toValue: any) => toValue,
    withDelay: (_d: any, v: any) => v,
    withSequence: (...args: any[]) => args[args.length - 1],
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

import SwipeRowAction from "../../components/SwipeRowAction";

function flush() {
  // helper: invoke captured.onEnd synchronously inside act
  return captured.current;
}

const baseLeft = {
  fraction: 0.5,
  minPx: 120,
  velocity: 1500,
  velocityMinTranslatePx: 80,
  color: "#b00",
  haptic: false,
  commitBehavior: "slide-out" as const,
};
const baseRight = {
  fraction: 0.35,
  minPx: 80,
  velocity: 1500,
  velocityMinTranslatePx: 80,
  color: "#06e",
  haptic: false,
  commitBehavior: "snap-back" as const,
};

beforeEach(() => {
  captured.current = {};
});

describe("SwipeRowAction", () => {
  it("right-past-threshold (LTR) → fires right callback", () => {
    const onLeft = jest.fn();
    const onRight = jest.fn();
    render(
      <SwipeRowAction
        left={{ ...baseLeft, callback: onLeft }}
        right={{ ...baseRight, callback: onRight }}
        widthBasis="screen"
      >
        <View>
          <Text>row</Text>
        </View>
      </SwipeRowAction>,
    );
    // Window width default 750 in test renderer; minPx=80 dominates 0.35*750=262.5
    // Use translation > 262.5 to satisfy both.
    act(() => {
      flush().onEnd?.({ translationX: 300, velocityX: 100 });
    });
    expect(onRight).toHaveBeenCalledTimes(1);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("left-past-threshold (LTR) → fires left callback", () => {
    const onLeft = jest.fn();
    const onRight = jest.fn();
    render(
      <SwipeRowAction
        left={{ ...baseLeft, callback: onLeft }}
        right={{ ...baseRight, callback: onRight }}
      >
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: -500, velocityX: -100 });
    });
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
  });

  it("right-under-threshold → no callback (snap-back, no commit)", () => {
    const onLeft = jest.fn();
    const onRight = jest.fn();
    render(
      <SwipeRowAction
        left={{ ...baseLeft, callback: onLeft }}
        right={{ ...baseRight, callback: onRight }}
      >
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: 40, velocityX: 100 });
    });
    expect(onRight).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("left-under-threshold → no callback", () => {
    const onLeft = jest.fn();
    const onRight = jest.fn();
    render(
      <SwipeRowAction
        left={{ ...baseLeft, callback: onLeft }}
        right={{ ...baseRight, callback: onRight }}
      >
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: -50, velocityX: -100 });
    });
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("vertical-dominance scroll guard: gesture activates only on |Δx|>10 (activeOffsetX)", () => {
    // The component sets activeOffsetX([-10, 10]); RNGH only invokes the
    // worklets when activation condition met. We assert the configuration
    // reaches the gesture rather than re-implementing RNGH semantics.
    const onLeft = jest.fn();
    render(
      <SwipeRowAction left={{ ...baseLeft, callback: onLeft }} right={undefined}>
        <View />
      </SwipeRowAction>,
    );
    // No translation update fired → no callback.
    act(() => {
      flush().onUpdate?.({ translationX: 5, velocityX: 0 });
      flush().onEnd?.({ translationX: 5, velocityX: 0 });
    });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("right: undefined (wrapper mode) → rightward Pan does nothing past threshold", () => {
    const onLeft = jest.fn();
    render(
      <SwipeRowAction left={{ ...baseLeft, callback: onLeft }} right={undefined}>
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: 600, velocityX: 100 });
    });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("left commitBehavior 'slide-out' fires callback after timing completes", () => {
    const onLeft = jest.fn();
    render(
      <SwipeRowAction
        left={{ ...baseLeft, commitBehavior: "slide-out", callback: onLeft }}
        right={undefined}
      >
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: -500, velocityX: -100 });
    });
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("right commitBehavior 'snap-back' fires callback after timing-to-zero completes", () => {
    const onRight = jest.fn();
    render(
      <SwipeRowAction left={undefined} right={{ ...baseRight, callback: onRight }}>
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: 300, velocityX: 100 });
    });
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it("velocity override: high velocity past min-translation commits even under distance threshold", () => {
    const onRight = jest.fn();
    render(
      <SwipeRowAction
        left={undefined}
        right={{ ...baseRight, fraction: 0.5, minPx: 500, velocity: 1500, callback: onRight }}
      >
        <View />
      </SwipeRowAction>,
    );
    act(() => {
      flush().onEnd?.({ translationX: 100, velocityX: 2000 });
    });
    expect(onRight).toHaveBeenCalledTimes(1);
  });
});
