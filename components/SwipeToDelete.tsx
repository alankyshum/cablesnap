/**
 * SwipeToDelete — thin wrapper around SwipeRowAction that pins the trailing
 * edge to `undefined` and maps every legacy prop onto the leading-edge
 * config. Existing call sites stay byte-for-byte unchanged (BLD-614).
 *
 * For new bidirectional swipe rows (e.g. session SetRow with swipe-right to
 * complete) prefer SwipeRowAction directly.
 */
import React from "react";
import { Trash2 } from "lucide-react-native";
import SwipeRowAction from "./SwipeRowAction";
import { useThemeColors } from "@/hooks/useThemeColors";

interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  enabled?: boolean;
  /** Show a brief swipe-hint animation on mount */
  showHint?: boolean;
  /**
   * Fraction of the width basis the user must drag past before the row
   * dismisses on release. Default 0.4 (40% of screen width).
   */
  dismissThresholdFraction?: number;
  /**
   * Minimum absolute pixel distance required to dismiss. Applied in addition
   * to `dismissThresholdFraction` — effective threshold is whichever is
   * greater. Default 0 (no floor).
   */
  minDismissPx?: number;
  /**
   * What to measure the fractional threshold against.
   * - "screen" (default) — window width, preserves prior behavior for existing callers.
   * - "container" — the component's own measured width (preferred for row-scoped swipes).
   */
  widthBasis?: "screen" | "container";
  /**
   * Optional fling-velocity override. If the release velocity (in px/s) exceeds
   * this value AND the translation exceeds `velocityMinTranslatePx`, the row
   * dismisses even if the distance threshold wasn't reached. Undefined disables.
   */
  velocityDismissPxPerSec?: number;
  /** Minimum translation before the velocity override can fire. Default 80. */
  velocityMinTranslatePx?: number;
  /** Fire a medium impact haptic on commit. Default false. */
  haptic?: boolean;
}

export default function SwipeToDelete({
  children,
  onDelete,
  enabled = true,
  showHint = false,
  dismissThresholdFraction = 0.4,
  minDismissPx = 0,
  widthBasis = "screen",
  velocityDismissPxPerSec,
  velocityMinTranslatePx = 80,
  haptic = false,
}: SwipeToDeleteProps) {
  const colors = useThemeColors();
  return (
    <SwipeRowAction
      enabled={enabled}
      showHint={showHint ? "left" : false}
      widthBasis={widthBasis}
      left={{
        fraction: dismissThresholdFraction,
        minPx: minDismissPx,
        velocity: velocityDismissPxPerSec,
        velocityMinTranslatePx,
        color: colors.error,
        icon: Trash2,
        label: "Delete",
        haptic,
        commitBehavior: "slide-out",
        callback: onDelete,
        // Restore legacy interactive Button overlay (origin/main
        // SwipeToDelete.tsx:163-172) — preserves partial-swipe-then-tap
        // path and screen-reader Delete-without-gesture path for the five
        // non-SetRow consumers (FoodLogCard, MealTemplatesSheet,
        // WaterDayList, TemplateExerciseRow, app/nutrition/templates).
        // SetRow uses SwipeRowAction directly without revealTapTarget,
        // keeping its single-write-path convergence through handleCheckPress.
        revealTapTarget: {
          icon: Trash2,
          label: "Delete",
          onPress: onDelete,
        },
      }}
      right={undefined}
    >
      {children}
    </SwipeRowAction>
  );
}
