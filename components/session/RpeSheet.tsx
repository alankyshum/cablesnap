/**
 * RpeSheet — precise RPE/RIR picker for the RPE chip strip (BLD-1110).
 * BLD-2701: Mode-aware — RIR mode shows descending 4.0→0.0 steps.
 *
 * Patterned on BodyweightModifierSheet (closest analogue: discrete-value
 * select with current-value highlight + Cancel + Clear).
 * RPE mode: 9 steps: 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0.
 * RIR mode: 9 steps: 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.0 (descending, 0 RIR = hardest).
 *
 * INVARIANT: onDone always receives the RPE-scale value (6–10), regardless of mode.
 *            In RIR mode: displayed value is converted back via rirToRpe before calling onDone.
 *
 * Background-tap dismisses (matches BodyweightModifierSheet behaviour).
 */
import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import { rpeColor, rpeText } from "@/lib/rpe";
import { RPE_MIN, RPE_MAX, RPE_STEP, rpeToRir, rirToRpe } from "@/lib/intensity";
import type { IntensityMode } from "@/lib/intensity";

/**
 * Build the array of selectable steps for RPE mode (ascending).
 * Derived from canonical constants in lib/intensity.ts.
 */
function buildRpeSteps(): number[] {
  const steps: number[] = [];
  for (let v = RPE_MIN; v <= RPE_MAX; v += RPE_STEP) {
    // Round to 1 decimal to avoid floating-point drift (e.g. 6.9999...)
    steps.push(Math.round(v * 10) / 10);
  }
  return steps;
}

/**
 * Build the array of selectable steps for RIR mode (descending: 4.0 → 0.0).
 * These are RIR display values; the sheet converts to RPE before calling onDone.
 */
function buildRirSteps(): number[] {
  // RIR max = rpeToRir(RPE_MIN) = 10 - 6 = 4
  // RIR min = rpeToRir(RPE_MAX) = 10 - 10 = 0
  const RIR_MAX = rpeToRir(RPE_MIN);
  const RIR_MIN = rpeToRir(RPE_MAX);
  const steps: number[] = [];
  for (let v = RIR_MAX; v >= RIR_MIN; v -= RPE_STEP) {
    steps.push(Math.round(v * 10) / 10);
  }
  return steps;
}

const RPE_STEPS = buildRpeSteps();
const RIR_STEPS = buildRirSteps();

export type RpeSheetProps = {
  sheetRef: React.RefObject<BottomSheet | null>;
  initialValue: number | null;
  onDone: (value: number | null) => void;
  onDismiss?: () => void;
  /** BLD-2701: Active display mode. Defaults to "rpe". */
  intensityMode?: IntensityMode;
};

export function RpeSheet({
  sheetRef,
  initialValue,
  onDone,
  onDismiss,
  intensityMode = "rpe",
}: RpeSheetProps) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["45%"], []);

  // Track selected value as RPE internally (storage unit).
  const [selectedRpe, setSelectedRpe] = useState<number | null>(initialValue);

  const steps = intensityMode === "rir" ? RIR_STEPS : RPE_STEPS;
  const title = intensityMode === "rir" ? "Reps in Reserve" : "Set RPE";

  /**
   * When a step is pressed:
   * - RPE mode: step IS the RPE value.
   * - RIR mode: step is a RIR display value; convert to RPE before calling onDone.
   */
  const handleStepPress = useCallback((step: number) => {
    const rpeValue = intensityMode === "rir" ? rirToRpe(step) : step;
    setSelectedRpe(rpeValue);
    onDone(rpeValue);
  }, [intensityMode, onDone]);

  const handleClear = useCallback(() => {
    setSelectedRpe(null);
    onDone(null);
  }, [onDone]);

  /**
   * Determine whether a given step is the currently selected one.
   * In RPE mode: step === selectedRpe.
   * In RIR mode: convert selectedRpe back to RIR and compare.
   */
  const isStepSelected = useCallback((step: number): boolean => {
    if (selectedRpe == null) return false;
    if (intensityMode === "rpe") return selectedRpe === step;
    // RIR mode: step is a RIR value; selectedRpe is RPE
    return rpeToRir(selectedRpe) === step;
  }, [selectedRpe, intensityMode]);

  /**
   * Format the step for display on each button.
   * RPE: "6.0", "6.5", ..., "10.0"
   * RIR: "4.0", "3.5", ..., "0.0"
   */
  const formatStep = (step: number): string =>
    step % 1 === 0 ? `${step}.0` : String(step);

  /**
   * Get background/foreground colors for a step.
   * Color is based on stored RPE value (so colors are consistent across modes).
   */
  const getStepColors = (step: number, isSelected: boolean): { bg: string; fg: string } => {
    if (!isSelected) {
      return { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant };
    }
    const rpeForColor = intensityMode === "rir" ? rirToRpe(step) : step;
    return { bg: rpeColor(rpeForColor), fg: rpeText(rpeForColor) };
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onClose={onDismiss}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      <BottomSheetView style={styles.content}>
        <Text
          variant="subtitle"
          style={{ color: colors.onSurface, marginBottom: 12 }}
          accessibilityRole="header"
        >
          {title}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepsRow}
        >
          {steps.map((step) => {
            const isSelected = isStepSelected(step);
            const { bg, fg } = getStepColors(step, isSelected);
            const a11yLabel = intensityMode === "rir"
              ? `${formatStep(step)} RIR`
              : `RPE ${formatStep(step)}`;
            return (
              <TouchableOpacity
                key={step}
                onPress={() => handleStepPress(step)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={a11yLabel}
                style={[
                  styles.step,
                  { backgroundColor: bg, borderColor: isSelected ? bg : colors.outline },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepLabel, { color: fg }]}>
                  {formatStep(step)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.actionsRow}>
          <Button
            variant="ghost"
            onPress={handleClear}
            label="Clear"
            accessibilityLabel="Clear intensity"
          />
          <Button
            variant="ghost"
            onPress={() => sheetRef.current?.close()}
            label="Cancel"
            accessibilityLabel="Cancel"
          />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 8,
  },
  stepsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  step: {
    width: 56,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    gap: 8,
  },
});
