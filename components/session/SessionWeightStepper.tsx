import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * SessionWeightStepper — compact full-width footer-row −/+ stepper for
 * plain numeric-weight (Case C) set rows.
 *
 * BLD-2674: Quick Weight Stepper — one-tap +/− on the set row weight cell.
 *
 * Layout contract (plan §UX Design):
 *  - Full-width footer-row sibling, never inside `pickerCol`.
 *  - Insertion point: sibling of <StackMarkerHint> and cable-variant footer
 *    in SetRow.tsx — placed BEFORE StackMarkerHint.
 *  - Buttons meet ≥44dp touch target via size + hitSlop.
 *  - Visual height fits in the ~28–32dp footer band.
 *
 * Gating (controlled by parent SetRow):
 *  - Case C only: NOT bodyweight, NOT cable (or no calibration), NOT
 *    shouldRenderMarkerPill.
 *  - Case B (calibrated-cable manual/legacy): stepper SUPPRESSED by parent —
 *    this component is simply not rendered.
 *  - Case C + completed + captureRpe: stepper SUPPRESSED by parent to keep
 *    combined height ≤ 96 dp (plan §UX Design "Case C + RPE footer-merge rule").
 *
 * A11y:
 *  - "−" → accessibilityLabel={t({ id: "session.sessionweightstepper.str1", message: "Decrease by {step}" })}
 *  - "+" → accessibilityLabel={t({ id: "session.sessionweightstepper.str2", message: "Increase by {step}" })}
 *  - accessibilityState.disabled when at min/max
 *
 * Haptics:
 *  - Light impact on each successful step (only when a change actually occurs).
 *  - Silently skipped if expo-haptics unavailable or reduce-motion.
 */
import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { stepWeight } from "@/lib/weight-step";
import { fontSizes } from "@/constants/design-tokens";

// Light haptic on step — silently ignore errors (expo-haptics may not be
// available in all environments, e.g. web or test).
async function triggerLightHaptic(): Promise<void> {
  try {
    const haptics = await import("expo-haptics");
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Silently skip — reduce-motion, web, or unavailable native module.
  }
}

const MIN = 0;
const MAX = 500;

export type SessionWeightStepperProps = {
  /**
   * The displayed weight value (null = empty / no prefill).
   * This is `displayedWeight` from SetRow — i.e. `set.weight ?? prefillCandidate?.weight ?? null`.
   * Stepping commits a concrete number via `onValueChange`.
   */
  displayedWeight: number | null;
  /** Step size in the active unit (2.5 for kg, 5 for lb). */
  step: number;
  /** Unit label shown in accessibility descriptions. */
  unit: "kg" | "lb";
  /** Called with the new value after a step. Same callback as WeightPicker.onValueChange. */
  onValueChange: (val: number) => void;
  /**
   * testID for the stepper container. If provided:
   *  - root container testID = `{testID}` (used as-is)
   *  - minus button testID = `{testID}-decrement`
   *  - plus button testID = `{testID}-increment`
   */
  testID?: string;
};

export const SessionWeightStepper = memo(function SessionWeightStepper({
  displayedWeight,
  step,
  unit,
  onValueChange,
  testID,
}: SessionWeightStepperProps) {
  const colors = useThemeColors();

  const currentValue = displayedWeight ?? 0;
  const atMin = currentValue <= MIN;
  const atMax = currentValue >= MAX;

  const handleDecrement = useCallback(() => {
    if (atMin) return;
    const next = stepWeight(displayedWeight, step, -1, { min: MIN, max: MAX });
    if (next !== currentValue) {
      onValueChange(next);
      void triggerLightHaptic();
    }
  }, [displayedWeight, currentValue, step, atMin, onValueChange]);

  const handleIncrement = useCallback(() => {
    if (atMax) return;
    const next = stepWeight(displayedWeight, step, 1, { min: MIN, max: MAX });
    if (next !== currentValue) {
      onValueChange(next);
      void triggerLightHaptic();
    }
  }, [displayedWeight, currentValue, step, atMax, onValueChange]);

  return (
    <View
      style={styles.container}
      testID={testID ?? undefined}
    >
      <Pressable
        onPress={handleDecrement}
        disabled={atMin}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={t({ id: "session.sessionweightstepper.dynamic1", message: `Decrease by ${step}` })}
        accessibilityState={{ disabled: atMin }}
        testID={testID ? `${testID}-decrement` : undefined}
        style={[
          styles.stepBtn,
          { borderColor: atMin ? colors.outlineVariant : colors.outline },
        ]}
      >
        <Text
          style={[
            styles.stepBtnLabel,
            { color: atMin ? colors.onSurfaceVariant : colors.onSurface, opacity: atMin ? 0.38 : 1 },
          ]}
        >
          −
        </Text>
      </Pressable>

      <Text
        style={[styles.stepLabel, { color: colors.onSurfaceVariant }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {unit}
      </Text>

      <Pressable
        onPress={handleIncrement}
        disabled={atMax}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t({ id: "session.sessionweightstepper.dynamic2", message: `Increase by ${step}` })}
        accessibilityState={{ disabled: atMax }}
        testID={testID ? `${testID}-increment` : undefined}
        style={[
          styles.stepBtn,
          { borderColor: atMax ? colors.outlineVariant : colors.outline },
        ]}
      >
        <Text
          style={[
            styles.stepBtnLabel,
            { color: atMax ? colors.onSurfaceVariant : colors.onSurface, opacity: atMax ? 0.38 : 1 },
          ]}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  // Full-width footer band; height stays within the ~28–32dp footer envelope.
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 36, // aligns with StackMarkerHint / cable-variant footer indent
    paddingTop: 2,
    paddingBottom: 2,
    gap: 8,
    height: 30,
  },
  // Visual size 24 wide × 26 tall; effective tap target ≥44dp via hitSlop.
  stepBtn: {
    width: 36,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnLabel: {
    fontSize: fontSizes.base,
    fontWeight: "600",
    lineHeight: 20,
    // Keep "−" and "+" aligned in the center of the button.
    textAlign: "center",
  },
  stepLabel: {
    fontSize: fontSizes.xs,
    flex: 1,
    textAlign: "center",
  },
});
