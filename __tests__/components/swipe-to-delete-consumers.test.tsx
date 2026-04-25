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

// ----------------------------------------------------------------------
// CEO directive ccf07388 (16:24Z) — `revealTapTarget` regression tests.
//
// SwipeToDelete must render the legacy interactive `<Button
// onPress={onDelete} accessibilityLabel="Delete">` overlay on top of its
// reveal background, so that:
//   1. partial-swipe-then-tap (motor / one-handed / device-edge users)
//      still works on the five non-SetRow consumers,
//   2. screen-readers (TalkBack / VoiceOver) can focus and activate the
//      Delete button without any gesture.
// SetRow stays decorative-only (no revealTapTarget) so its single-write
// path through `handleCheckPress` is preserved.
// ----------------------------------------------------------------------
describe("SwipeToDelete revealTapTarget — interactive Delete overlay", () => {
  it("renders an interactive Delete Button for screen readers (no gesture required)", () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <SwipeToDelete onDelete={onDelete}>
        <View />
      </SwipeToDelete>,
    );
    // Screen-reader path: query the Button directly by its a11y label,
    // no swipe involved, fire press → onDelete fires.
    const btn = getByLabelText("Delete");
    require("@testing-library/react-native").fireEvent.press(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("partial-swipe-then-tap on the exposed Button fires onDelete exactly once", () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <SwipeToDelete onDelete={onDelete} dismissThresholdFraction={0.4} minDismissPx={0}>
        <View />
      </SwipeToDelete>,
    );
    // Drive a partial swipe — past the reveal threshold but under commit.
    act(() => {
      captured.current.onUpdate?.({ translationX: -85, velocityX: 0 });
    });
    // User releases short of commit: gesture does NOT auto-fire delete.
    act(() => {
      captured.current.onEnd?.({ translationX: -85, velocityX: -50 });
    });
    expect(onDelete).not.toHaveBeenCalled();
    // Then taps the exposed Button.
    const btn = getByLabelText("Delete");
    require("@testing-library/react-native").fireEvent.press(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("Button overlay carries accessibilityLabel='Delete' (TalkBack/VoiceOver focusable)", () => {
    const { queryByLabelText } = render(
      <SwipeToDelete onDelete={() => undefined}>
        <View />
      </SwipeToDelete>,
    );
    expect(queryByLabelText("Delete")).not.toBeNull();
  });
});

// ----------------------------------------------------------------------
// SwipeRowAction-without-revealTapTarget: proves the wrapper change
// doesn't leak into SetRow. SetRow uses SwipeRowAction directly without
// passing revealTapTarget for either side, so no Delete a11y node should
// appear in its rendered reveal — convergence still routes through
// handleCheckPress (single-write-path invariant).
// ----------------------------------------------------------------------
describe("SwipeRowAction without revealTapTarget — SetRow-style usage", () => {
  it("does not render an interactive Delete Button when revealTapTarget is undefined", () => {
    // Re-import via require so the gesture-handler / reanimated mocks above
    // also apply to this direct SwipeRowAction rendering path.
    const SwipeRowAction = require("../../components/SwipeRowAction").default;
    const { Trash2, Check } = require("lucide-react-native");
    const { queryByLabelText } = render(
      <SwipeRowAction
        left={{
          fraction: 0.5,
          minPx: 120,
          color: "#b00",
          icon: Trash2,
          label: "Delete",
          haptic: true,
          commitBehavior: "slide-out",
          callback: () => undefined,
          // NOTE: no revealTapTarget — matches SetRow.tsx usage.
        }}
        right={{
          fraction: 0.35,
          minPx: 80,
          color: "#0a0",
          icon: Check,
          label: "Complete",
          haptic: false,
          commitBehavior: "snap-back",
          callback: () => undefined,
          // NOTE: no revealTapTarget — matches SetRow.tsx usage.
        }}
      >
        <View />
      </SwipeRowAction>,
    );
    // No tappable Delete Button — reveal stays decorative-only.
    expect(queryByLabelText("Delete")).toBeNull();
    // No tappable Complete Button either — SetRow's checkmark Pressable is
    // the sole convergence point.
    expect(queryByLabelText("Complete")).toBeNull();
  });

  it("per-direction independence: revealTapTarget on right only renders right Button, not left", () => {
    const SwipeRowAction = require("../../components/SwipeRowAction").default;
    const { Check, X } = require("lucide-react-native");
    const onComplete = jest.fn();
    const { queryByLabelText, getByLabelText } = render(
      <SwipeRowAction
        left={{
          fraction: 0.5,
          minPx: 120,
          color: "#b00",
          icon: X,
          label: "Cancel",
          haptic: false,
          commitBehavior: "slide-out",
          callback: () => undefined,
          // No revealTapTarget — left stays decorative.
        }}
        right={{
          fraction: 0.35,
          minPx: 80,
          color: "#0a0",
          icon: Check,
          label: "Complete",
          haptic: false,
          commitBehavior: "snap-back",
          callback: () => undefined,
          revealTapTarget: { icon: Check, label: "Complete-Tap", onPress: onComplete },
        }}
      >
        <View />
      </SwipeRowAction>,
    );
    // Right side has a tappable Button.
    expect(queryByLabelText("Complete-Tap")).not.toBeNull();
    require("@testing-library/react-native").fireEvent.press(getByLabelText("Complete-Tap"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Left side has no tappable Button (decorative only).
    expect(queryByLabelText("Cancel")).toBeNull();
  });
});
