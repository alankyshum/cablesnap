import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { PlateCalculatorContent } from "../plates/PlateCalculatorContent";
import { useThemeColors } from "@/hooks/useThemeColors";

// Do not wrap PlateCalculatorContent in a NavigationContainer or independent navigator — useFocusEffect depends on the parent screen's NavigationContext.

type Props = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  initialWeight: string | null;
  unit: "kg" | "lb";
  onBarChanged: (newBar: number) => void;
  onDismiss?: () => void;
};

export function InlinePlateSheet({
  sheetRef,
  initialWeight,
  onBarChanged,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["60%"], []);
  const activeBarRef = useRef<number | null>(null);

  const handleBarChanged = useCallback((newBar: number) => {
    activeBarRef.current = newBar;
  }, []);

  const handleDismiss = useCallback(() => {
    if (activeBarRef.current !== null) {
      onBarChanged(activeBarRef.current);
    }
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
        <PlateCalculatorContent
          initialWeight={initialWeight ?? undefined}
          onBarChanged={handleBarChanged}
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
});
