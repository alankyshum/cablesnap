/**
 * RpeChipStrip — 4-chip RPE/RIR selector rendered under completed sets (BLD-1110).
 * BLD-2701: Mode-aware — chips relabel/re-value based on intensityMode prop.
 *
 * Props: controlled component — parent manages value and onChange.
 * Chips: Easy (6), Moderate (7.5), Hard (9), Max (10) in RPE scale.
 * In RIR mode: same stored values (6, 7.5, 9, 10) but displayed as 4 RIR, 2.5 RIR, 1 RIR, 0 RIR.
 * Long-press → RpeSheet (precise picker, 6.0–10.0 or 4.0–0.0 RIR steps).
 *
 * Each chip shows two text lines (BLD-2739 Fix 2):
 *   1. Qualitative label  — "Easy" / "Moderate" / "Hard" / "Max" (always)
 *   2. Numeric annotation — "RPE 6" | "4 RIR" (flips per mode via chipAnnotation())
 *
 * INVARIANT: onChange always emits the RPE-scale value (6–10), regardless of mode.
 * Accessibility: radiogroup + per-chip radio role with selected state.
 * Reduced motion: disables slide-in animation.
 */
import React, { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import BottomSheet from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fontSizes } from "@/constants/design-tokens";
import { rpeColor, rpeText } from "@/lib/rpe";
import { rpeToRir } from "@/lib/intensity";
import type { IntensityMode } from "@/lib/intensity";
import { RpeSheet } from "./RpeSheet";

// Chip definitions use RPE values for storage; display labels are computed per mode.
const RPE_CHIPS = [
  { label: "Easy", value: 6 },
  { label: "Moderate", value: 7.5 },
  { label: "Hard", value: 9 },
  { label: "Max", value: 10 },
] as const;

const A11Y_HINT = "Long press to enter a precise value.";

/**
 * Build per-chip a11y label from the current mode.
 * RPE mode: "RPE 9, hard" | RIR mode: "1 RIR, hard"
 */
function chipA11yLabel(chip: { label: string; value: number }, mode: IntensityMode): string {
  const qualLabel = chip.label.toLowerCase();
  if (mode === "rpe") {
    return `RPE ${chip.value}, ${qualLabel}`;
  }
  const rir = rpeToRir(chip.value);
  return `${rir} RIR, ${qualLabel}`;
}

/**
 * Build the short numeric annotation rendered on each chip below the qualitative label.
 * BLD-2739 Fix 2: This IS rendered as a secondary caption line on each chip.
 * Flips per mode: RPE mode → "RPE 9", RIR mode → "1 RIR".
 * onChange still emits RPE-scale value regardless.
 */
export function chipAnnotation(rpeValue: number, mode: IntensityMode): string {
  if (mode === "rpe") return `RPE ${rpeValue}`;
  const rir = rpeToRir(rpeValue);
  return `${rir} RIR`;
}

export type RpeChipStripProps = {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  setId: string;
  /** BLD-2701: Active intensity display mode. Defaults to "rpe". */
  intensityMode?: IntensityMode;
};

export const RpeChipStrip = memo(function RpeChipStrip({
  value,
  onChange,
  disabled = false,
  setId,
  intensityMode = "rpe",
}: RpeChipStripProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<BottomSheet>(null);

  const handleChipPress = useCallback((chipValue: number) => {
    if (disabled) return;
    // Toggle off if same chip tapped; always emits RPE-scale value
    onChange(value === chipValue ? null : chipValue);
  }, [disabled, value, onChange]);

  const handleLongPress = useCallback(() => {
    if (disabled) return;
    sheetRef.current?.snapToIndex(0);
  }, [disabled]);

  const handleSheetDone = useCallback((newValue: number | null) => {
    sheetRef.current?.close();
    onChange(newValue);
  }, [onChange]);

  const entering = reduceMotion ? undefined : FadeIn.duration(150);

  // Build the container a11y label in the active mode
  const containerA11yLabel = intensityMode === "rpe"
    ? `RPE for set ${setId}`
    : `Reps in reserve for set ${setId}`;

  return (
    <>
      <Animated.View
        entering={entering}
        style={styles.strip}
        accessibilityRole="radiogroup"
        accessibilityLabel={containerA11yLabel}
      >
        {RPE_CHIPS.map((chip) => {
          const selected = value === chip.value;
          const bgColor = selected ? rpeColor(chip.value) : colors.surfaceVariant;
          const fgColor = selected ? rpeText(chip.value) : colors.onSurfaceVariant;
          return (
            <Pressable
              key={chip.value}
              onPress={() => handleChipPress(chip.value)}
              onLongPress={handleLongPress}
              accessibilityRole="radio"
              accessibilityLabel={chipA11yLabel(chip, intensityMode)}
              accessibilityHint={A11Y_HINT}
              accessibilityState={{ selected, disabled }}
              style={[
                styles.chip,
                { backgroundColor: bgColor },
                selected && styles.chipSelected,
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            >
              <View style={styles.chipContent}>
                <Text
                  style={[styles.chipLabel, { color: fgColor }]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
                {/* BLD-2739 Fix 2: visible numeric annotation flips per mode */}
                <Text
                  style={[styles.chipAnnotation, { color: fgColor }]}
                  numberOfLines={1}
                  testID={`chip-annotation-${chip.value}`}
                >
                  {chipAnnotation(chip.value, intensityMode)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Animated.View>

      <RpeSheet
        key={setId}
        sheetRef={sheetRef}
        initialValue={value}
        onDone={handleSheetDone}
        intensityMode={intensityMode}
      />
    </>
  );
});

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 48,
    paddingHorizontal: 6,
  },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
  },
  chipContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  chipSelected: {
    // Visual elevation hint for selected state
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  chipAnnotation: {
    // BLD-2739 Fix 2: secondary numeric annotation below the qualitative label.
    // Slightly smaller font keeps the chip compact on narrow screens.
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 12,
    opacity: 0.8,
  },
});
