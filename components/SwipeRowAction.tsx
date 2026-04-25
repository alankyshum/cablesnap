/**
 * SwipeRowAction — bidirectional row Pan with independent per-direction config.
 *
 * Hard Exclusions (Behavior-Design Classification: NO).
 * This component MUST NOT introduce any of the following. If any of these is
 * added, flip Classification to YES and require fresh psychologist review:
 *   - no streaks
 *   - no badges
 *   - no celebrations
 *   - no animations on goal-hit
 *   - no haptics (commit haptic owned by consumer per direction; gesture path
 *     emits no independent haptic beyond the optional `haptic` flag, which is
 *     a Medium impact tied to a destructive commit only)
 *   - no success-toasts
 *   - no notifications
 *   - no reminders
 *
 * Owned invariants:
 *   - SINGLE WRITE PATH: callbacks here are commit notifications only; the
 *     owning row is responsible for the actual mutation and any
 *     completion-feedback haptic/audio (e.g. useSetCompletionFeedback).
 *   - Per-direction commit behavior: 'slide-out' unmounts the row;
 *     'snap-back' returns translateX to 0 and the row stays mounted. The
 *     callback fires only after the timing animation completes.
 *   - Sign-gated background opacity: the leading-edge background only
 *     renders when translateX moves toward leading; the trailing-edge
 *     background only renders when translateX moves toward trailing. This
 *     prevents a wrapper-mode (right: undefined) consumer from leaking the
 *     unconfigured background into view.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  I18nManager,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { radii, duration as durationTokens } from "../constants/design-tokens";

export type SwipeDirectionConfig = {
  /**
   * Fraction of the width basis the user must drag past before the
   * action commits on release. e.g. 0.4 = 40% of basis width.
   */
  fraction: number;
  /**
   * Minimum absolute pixel distance required to commit. Applied in
   * addition to `fraction` — effective threshold is the greater of the two.
   */
  minPx: number;
  /**
   * Optional fling-velocity override (px/s). If release |velocityX| exceeds
   * this AND |translation| exceeds `velocityMinTranslatePx`, the action
   * commits even if the distance threshold wasn't reached.
   */
  velocity?: number;
  /** Minimum translation required for the velocity override. Default 80. */
  velocityMinTranslatePx?: number;
  /** Background colour while revealing this direction. */
  color: string;
  /** Optional Lucide icon rendered on the revealed background. */
  icon?: LucideIcon;
  /** A11y label for the icon button on the revealed background. */
  label?: string;
  /** Fire a Medium impact haptic on commit. Default false. */
  haptic?: boolean;
  /**
   * Commit behaviour:
   *   - 'slide-out' — translateX animates to ±basisWidth and unmounts; the
   *     consumer's `callback` fires after the animation completes
   *     (existing destructive pattern from SwipeToDelete).
   *   - 'snap-back' — translateX animates back to 0; the row stays mounted
   *     and the consumer's `callback` fires after the animation completes
   *     (used for non-destructive commits like "mark complete").
   */
  commitBehavior: "slide-out" | "snap-back";
  /** Commit notification. Fired in the JS thread via runOnJS. */
  callback: () => void;
};

interface SwipeRowActionProps {
  children: React.ReactNode;
  /**
   * Leading-edge action (LTR: physical-left swipe; RTL: physical-right swipe).
   * Pass `undefined` to disable leading-edge gestures.
   */
  left?: SwipeDirectionConfig;
  /**
   * Trailing-edge action (LTR: physical-right swipe; RTL: physical-left swipe).
   * Pass `undefined` to disable trailing-edge gestures.
   */
  right?: SwipeDirectionConfig;
  enabled?: boolean;
  /**
   * Briefly nudge the row in the given direction on mount as a
   * discoverability hint. Pass `false` to disable.
   */
  showHint?: "left" | "right" | false;
  /**
   * What to measure the fractional thresholds against.
   * - "screen" — window width (preserves prior SwipeToDelete behaviour).
   * - "container" — the component's own measured width.
   */
  widthBasis?: "screen" | "container";
}

const REVEAL_THRESHOLD = 80;

function triggerMediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch((err) => {
    if (__DEV__) {
      console.warn("[SwipeRowAction] haptic impact failed:", err);
    }
  });
}

export default function SwipeRowAction({
  children,
  left,
  right,
  enabled = true,
  showHint = false,
  widthBasis = "screen",
}: SwipeRowActionProps) {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState<number>(screenWidth);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  const basisWidth = widthBasis === "container" ? containerWidth : screenWidth;

  // RTL flip: in RTL locales, leading edge is physically on the right, so
  // a "leading" swipe produces a positive translateX. In LTR, leading is
  // left → negative translateX.
  const leadingSign = I18nManager.isRTL ? 1 : -1;
  const trailingSign = -leadingSign;

  const leftEnabled = !!left && enabled;
  const rightEnabled = !!right && enabled;
  const anyEnabled = leftEnabled || rightEnabled;

  useEffect(() => {
    if (!showHint || !enabled) return;
    const dir = showHint === "left" ? leadingSign : trailingSign;
    if (showHint === "left" && !leftEnabled) return;
    if (showHint === "right" && !rightEnabled) return;
    translateX.value = withDelay(
      600,
      withSequence(
        withTiming(dir * 40, { duration: 300 }),
        withSpring(0, { damping: 15, stiffness: 200 }),
      ),
    );
  }, [showHint, enabled, leftEnabled, rightEnabled, leadingSign, trailingSign, translateX]);

  // Snapshot for the worklet — primitives only.
  const leftFraction = left?.fraction ?? 0;
  const leftMinPx = left?.minPx ?? 0;
  const leftVelocity = left?.velocity;
  const leftVelMinTrans = left?.velocityMinTranslatePx ?? 80;
  const leftHaptic = left?.haptic ?? false;
  const leftBehavior = left?.commitBehavior ?? "slide-out";
  const leftCallback = left?.callback;

  const rightFraction = right?.fraction ?? 0;
  const rightMinPx = right?.minPx ?? 0;
  const rightVelocity = right?.velocity;
  const rightVelMinTrans = right?.velocityMinTranslatePx ?? 80;
  const rightHaptic = right?.haptic ?? false;
  const rightBehavior = right?.commitBehavior ?? "snap-back";
  const rightCallback = right?.callback;

  const panGesture = Gesture.Pan()
    .enabled(anyEnabled)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      let v = e.translationX;
      // Disallow direction whose config is missing (gesture clamps to 0).
      if (!leftEnabled) {
        // In LTR leadingSign === -1 → drop negatives. In RTL drop positives.
        v = leadingSign < 0 ? Math.max(0, v) : Math.min(0, v);
      }
      if (!rightEnabled) {
        v = trailingSign < 0 ? Math.max(0, v) : Math.min(0, v);
      }
      translateX.value = v;
    })
    .onEnd((e) => {
      const t = e.translationX;
      const tSign = Math.sign(t);
      // Direction of release decides which config (if any) commits.
      const isLeft = tSign === leadingSign && leftEnabled;
      const isRight = tSign === trailingSign && rightEnabled;

      if (isLeft && leftCallback) {
        const fractional = basisWidth * leftFraction;
        const threshold = Math.max(fractional, leftMinPx);
        const distanceMet = Math.abs(t) > threshold;
        const velocityOverride =
          leftVelocity !== undefined &&
          Math.abs(e.velocityX) > leftVelocity &&
          Math.abs(t) > leftVelMinTrans &&
          Math.sign(e.velocityX) === leadingSign;

        if (distanceMet || velocityOverride) {
          if (leftHaptic) runOnJS(triggerMediumHaptic)();
          if (leftBehavior === "slide-out") {
            translateX.value = withTiming(
              leadingSign * basisWidth,
              { duration: durationTokens.fast },
              (finished) => {
                if (finished) runOnJS(leftCallback)();
              },
            );
          } else {
            translateX.value = withTiming(
              0,
              { duration: durationTokens.fast },
              (finished) => {
                if (finished) runOnJS(leftCallback)();
              },
            );
          }
          return;
        }
      } else if (isRight && rightCallback) {
        const fractional = basisWidth * rightFraction;
        const threshold = Math.max(fractional, rightMinPx);
        const distanceMet = Math.abs(t) > threshold;
        const velocityOverride =
          rightVelocity !== undefined &&
          Math.abs(e.velocityX) > rightVelocity &&
          Math.abs(t) > rightVelMinTrans &&
          Math.sign(e.velocityX) === trailingSign;

        if (distanceMet || velocityOverride) {
          if (rightHaptic) runOnJS(triggerMediumHaptic)();
          if (rightBehavior === "slide-out") {
            translateX.value = withTiming(
              trailingSign * basisWidth,
              { duration: durationTokens.fast },
              (finished) => {
                if (finished) runOnJS(rightCallback)();
              },
            );
          } else {
            translateX.value = withTiming(
              0,
              { duration: durationTokens.fast },
              (finished) => {
                if (finished) runOnJS(rightCallback)();
              },
            );
          }
          return;
        }
      }

      // Below threshold or wrong-direction: spring back. Preserve the
      // legacy "rest at REVEAL_THRESHOLD" peek for the leading direction
      // when that direction is configured (matches SwipeToDelete UX).
      const peekDistance = Math.abs(t);
      if (
        isLeft &&
        leftCallback &&
        peekDistance > REVEAL_THRESHOLD
      ) {
        translateX.value = withSpring(leadingSign * REVEAL_THRESHOLD, {
          damping: 20,
          stiffness: 200,
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftBgStyle = useAnimatedStyle(() => {
    const t = translateX.value;
    if (Math.sign(t) !== leadingSign) return { opacity: 0 };
    const o = Math.max(0, Math.min(1, Math.abs(t) / basisWidth));
    return { opacity: o };
  });

  const rightBgStyle = useAnimatedStyle(() => {
    const t = translateX.value;
    if (Math.sign(t) !== trailingSign) return { opacity: 0 };
    const o = Math.max(0, Math.min(1, Math.abs(t) / basisWidth));
    return { opacity: o };
  });

  if (!anyEnabled) return <>{children}</>;

  // Background alignment: the leading-edge background sits on the trailing
  // physical edge of the wrapper, because when the row slides toward
  // leading, the trailing edge of the wrapper becomes exposed.
  // LTR: leadingSign=-1, leading-edge BG at flex-end (right side).
  // RTL: leadingSign=+1, leading-edge BG at flex-start (left side).
  const leftBgAlignment =
    leadingSign < 0 ? styles.bgRight : styles.bgLeft;
  const rightBgAlignment =
    trailingSign < 0 ? styles.bgRight : styles.bgLeft;

  const LeftIcon = left?.icon;
  const RightIcon = right?.icon;

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {leftEnabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.actionBackground,
            leftBgAlignment,
            { backgroundColor: left!.color },
            leftBgStyle,
          ]}
          // Reveal background is decorative; semantics belong on the
          // consumer's primary control. Avoid duplicate a11y nodes.
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {LeftIcon ? (
            <View style={styles.actionContent}>
              <LeftIcon size={22} color="#ffffff" />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      {rightEnabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.actionBackground,
            rightBgAlignment,
            { backgroundColor: right!.color },
            rightBgStyle,
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {RightIcon ? (
            <View style={styles.actionContent}>
              <RightIcon size={22} color="#ffffff" />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },
  actionBackground: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    borderRadius: radii.md,
  },
  bgRight: {
    alignItems: "flex-end",
  },
  bgLeft: {
    alignItems: "flex-start",
  },
  actionContent: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
});
