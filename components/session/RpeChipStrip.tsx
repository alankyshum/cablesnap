/**
 * RpeChipStrip — 4-chip RPE selector rendered under completed sets (BLD-1110).
 *
 * Props: controlled component — parent manages value and onChange.
 * Chips: Easy (6), Moderate (7.5), Hard (9), Max (10).
 * Long-press → RpeSheet (precise picker, 6.0–10.0 in 0.5 steps).
 *
 * Accessibility: radiogroup + per-chip radio role with selected state.
 * Reduced motion: disables slide-in animation.
 */
import React, { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import BottomSheet from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fontSizes } from "@/constants/design-tokens";
import { rpeColor, rpeText } from "@/lib/rpe";
import { RpeSheet } from "./RpeSheet";

const RPE_CHIPS = [
  { label: "Easy", value: 6, a11yLabel: "RPE 6, easy" },
  { label: "Moderate", value: 7.5, a11yLabel: "RPE 7.5, moderate" },
  { label: "Hard", value: 9, a11yLabel: "RPE 9, hard" },
  { label: "Max", value: 10, a11yLabel: "RPE 10, max effort" },
] as const;

const A11Y_HINT = "Long press to enter a precise value.";

export type RpeChipStripProps = {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  setId: string;
};

export const RpeChipStrip = memo(function RpeChipStrip({
  value,
  onChange,
  disabled = false,
  setId,
}: RpeChipStripProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<BottomSheet>(null);

  const handleChipPress = useCallback((chipValue: number) => {
    if (disabled) return;
    // Toggle off if same chip tapped
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

  return (
    <>
      <Animated.View
        entering={entering}
        style={styles.strip}
        accessibilityRole="radiogroup"
        accessibilityLabel={`RPE for set ${setId}`}
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
              accessibilityLabel={chip.a11yLabel}
              accessibilityHint={A11Y_HINT}
              accessibilityState={{ selected, disabled }}
              style={[
                styles.chip,
                { backgroundColor: bgColor },
                selected && styles.chipSelected,
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            >
              <Text
                style={[styles.chipLabel, { color: fgColor }]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      <RpeSheet
        key={setId}
        sheetRef={sheetRef}
        initialValue={value}
        onDone={handleSheetDone}
      />
    </>
  );
});

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 6,
  },
  chip: {
    flex: 1,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
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
});
