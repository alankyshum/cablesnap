/**
 * SetWeightCell — thin selector that picks between StackMarkerPill, WeightPicker,
 * and the "↕ to marker" affordance based on AC1 logic.
 * BLD-1126: Stack Marker Quick-Pick.
 *
 * ≤ 200 LOC. Non-cable rows always render WeightPicker (AC7 regression guard).
 *
 * Three rendering cases (centralized via shouldRenderMarkerPill):
 *  A. Cable + calibrated + (pristine OR marker-logged) → StackMarkerPill
 *  B. Cable + calibrated + manual/legacy → WeightPicker + "↕" affordance
 *  C. Non-cable OR no calibration → WeightPicker only (today's behavior, AC7)
 *
 * AC5: When user long-presses a marker-logged pill and then saves a numeric
 * weight, onManualWeightSave is called (instead of onWeightChange) so the
 * caller can issue a single UPDATE that also clears the four stack_* columns.
 */
import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import WeightPicker from "@/components/WeightPicker";
import { StackMarkerPill } from "./StackMarkerPill";
import { MarkerPickerSheet } from "./MarkerPickerSheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { shouldRenderMarkerPill } from "@/lib/stack-marker";
import type { StackWithCalibrations } from "@/hooks/useActiveCalibration";

type MarkerResult = {
  stackId: string;
  stackName: string;
  marker: number;
  trueWeight: number;
  unit: string;
};

export type SetWeightCellProps = {
  setId: string;
  setNumber: number;
  weight: number | null;
  stackMarker: number | null;
  stackUnit: string | null;
  displayedWeight: number | null;
  step: number;
  unit: "kg" | "lb";
  isCable: boolean;
  stacks: StackWithCalibrations[];
  accessibilityLabel: string;
  /** Normal numeric weight change (no stack context). */
  onWeightChange: (val: number) => void;
  /** AC5: weight save after long-pressing a marker-logged pill. Must clear stack cols. */
  onManualWeightSave: (weight: number | null) => void;
  onMarkerConfirm: (result: MarkerResult) => void;
};

export function SetWeightCell({
  setId,
  setNumber,
  weight,
  stackMarker,
  stackUnit,
  displayedWeight,
  step,
  unit,
  isCable,
  stacks,
  accessibilityLabel,
  onWeightChange,
  onManualWeightSave,
  onMarkerConfirm,
}: SetWeightCellProps) {
  const colors = useThemeColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Per-set keypad override — long-pressing the pill switches to numeric input.
  const [keypadOverride, setKeypadOverride] = useState(false);
  // Track whether the row was marker-logged when the user entered keypad mode.
  // Used to decide whether onManualWeightSave (AC5) or onWeightChange is called.
  const wasMarkerLoggedRef = useRef(false);

  const hasCalibration = stacks.length > 0;
  const showPill = !keypadOverride && shouldRenderMarkerPill(
    { weight, stack_marker: stackMarker },
    isCable,
    hasCalibration
  );
  // Case B: cable + calibrated + manual/legacy (weight IS NOT NULL, marker null)
  const showUpsellAffordance =
    !keypadOverride &&
    isCable &&
    hasCalibration &&
    weight !== null &&
    stackMarker === null;

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const handleLongPress = useCallback(() => {
    wasMarkerLoggedRef.current = stackMarker !== null;
    setKeypadOverride(true);
  }, [stackMarker]);

  // Dispatches to onManualWeightSave (AC5) if the row was marker-logged,
  // otherwise falls through to the normal onWeightChange path.
  const handleKeypadWeightChange = useCallback((val: number) => {
    if (wasMarkerLoggedRef.current) {
      onManualWeightSave(val);
    } else {
      onWeightChange(val);
    }
  }, [onManualWeightSave, onWeightChange]);

  const handleMarkerConfirm = useCallback(
    (result: MarkerResult) => {
      onMarkerConfirm(result);
      setKeypadOverride(false);
      wasMarkerLoggedRef.current = false;
      closePicker();
    },
    [onMarkerConfirm, closePicker]
  );

  const handleUpsellConfirm = useCallback(
    (result: MarkerResult) => {
      onMarkerConfirm(result);
      closePicker();
    },
    [onMarkerConfirm, closePicker]
  );

  if (showPill) {
    return (
      <View>
        <StackMarkerPill
          marker={stackMarker}
          weight={weight}
          unit={stackUnit ?? unit}
          setNumber={setNumber}
          onPress={openPicker}
          onLongPress={handleLongPress}
        />
        <MarkerPickerSheet
          isVisible={pickerOpen}
          onClose={closePicker}
          stacks={stacks}
          onConfirm={handleMarkerConfirm}
        />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <WeightPicker
        value={displayedWeight}
        step={step}
        unit={unit}
        onValueChange={keypadOverride ? handleKeypadWeightChange : onWeightChange}
        accessibilityLabel={accessibilityLabel}
      />
      {showUpsellAffordance && (
        <Pressable
          onPress={openPicker}
          hitSlop={8}
          style={[styles.upsellBtn, { borderColor: colors.outlineVariant }]}
          accessibilityRole="button"
          accessibilityLabel="Switch to stack marker mode for this set"
          testID={`set-${setId}-marker-upsell`}
        >
          <Text style={[styles.upsellText, { color: colors.onSurfaceVariant }]}>↕</Text>
        </Pressable>
      )}
      {showUpsellAffordance && (
        <MarkerPickerSheet
          isVisible={pickerOpen}
          onClose={closePicker}
          stacks={stacks}
          onConfirm={handleUpsellConfirm}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upsellBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  upsellText: {
    fontSize: fontSizes.sm,
  },
});
