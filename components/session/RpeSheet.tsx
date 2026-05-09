/**
 * RpeSheet — precise RPE picker for the RPE chip strip (BLD-1110).
 *
 * Patterned on BodyweightModifierSheet (closest analogue: discrete-value
 * select with current-value highlight + Cancel + Clear).
 * 9 steps: 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0.
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

const RPE_STEPS = [6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0] as const;

export type RpeSheetProps = {
  sheetRef: React.RefObject<BottomSheet | null>;
  initialValue: number | null;
  onDone: (value: number | null) => void;
  onDismiss?: () => void;
};

export function RpeSheet({
  sheetRef,
  initialValue,
  onDone,
  onDismiss,
}: RpeSheetProps) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["45%"], []);
  const [selected, setSelected] = useState<number | null>(initialValue);

  const handleStepPress = useCallback((step: number) => {
    setSelected(step);
    onDone(step);
  }, [onDone]);

  const handleClear = useCallback(() => {
    setSelected(null);
    onDone(null);
  }, [onDone]);

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
          Set RPE
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepsRow}
        >
          {RPE_STEPS.map((step) => {
            const isSelected = selected === step;
            const bg = isSelected ? rpeColor(step) : colors.surfaceVariant;
            const fg = isSelected ? rpeText(step) : colors.onSurfaceVariant;
            return (
              <TouchableOpacity
                key={step}
                onPress={() => handleStepPress(step)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`RPE ${step}`}
                style={[
                  styles.step,
                  { backgroundColor: bg, borderColor: isSelected ? bg : colors.outline },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepLabel, { color: fg }]}>
                  {step % 1 === 0 ? `${step}.0` : String(step)}
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
            accessibilityLabel="Clear RPE"
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
