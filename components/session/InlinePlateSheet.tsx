// Do not wrap PlateCalculatorContent in a NavigationContainer or independent navigator — useFocusEffect depends on the parent screen's NavigationContext.

import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { PlateCalculatorContent } from "../plates/PlateCalculatorContent";

type Props = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  initialWeight: string;
  unit: "kg" | "lb";
  onBarChanged: (newBar: number) => void;
  onDismiss?: () => void;
};

export function InlinePlateSheet({
  sheetRef,
  initialWeight,
  unit,
  onBarChanged,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["65%"], []);
  const latestBarRef = useRef<number>(unit === "lb" ? 45 : 20);

  const handleActiveBarChanged = useCallback((newBar: number) => {
    latestBarRef.current = newBar;
  }, []);

  const handleDismiss = useCallback(() => {
    onBarChanged(latestBarRef.current);
    if (onDismiss) {
      onDismiss();
    }
  }, [onBarChanged, onDismiss]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onDismiss={handleDismiss}
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
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="subtitle"
          style={[styles.header, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          Plate Calculator
        </Text>
        <PlateCalculatorContent
          initialWeight={initialWeight}
          onActiveBarChanged={handleActiveBarChanged}
          unit={unit}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 16,
    textAlign: "center",
  },
});
