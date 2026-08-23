import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@/lib/i18n";
import { ModelPicker } from "./ModelPicker";

export type ModelPickerSheetProps = {
  /** Whether the model picker bottom sheet is visible. */
  isVisible: boolean;
  /** Callback to close the bottom sheet. */
  onClose: () => void;
  /** The currently active model ID / OpenRouter slug (null if none selected). */
  selectedModelId: string | null;
  /** Callback when user selects a model. */
  onSelectModel: (modelId: string) => void;
  /** Optional title override for the sheet header. */
  title?: string;
};

/**
 * Gorhom wrapper for the AI Model Picker. Its BottomSheetFlatList must remain
 * inside this sheet so native pan and scroll gestures coordinate correctly.
 */
export function ModelPickerSheet({
  isVisible,
  onClose,
  selectedModelId,
  onSelectModel,
  title,
}: ModelPickerSheetProps) {
  const colors = useThemeColors();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["60%", "90%"], []);
  const resolvedTitle = title ?? t({ id: "components.coach.selectAIModel", message: "Select AI Model" });

  useEffect(() => {
    if (isVisible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [isVisible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  const requestClose = useCallback(() => sheetRef.current?.dismiss(), []);
  const handleSelect = useCallback((modelId: string) => {
    // Dismiss before notifying the parent. This prevents the parent's selected
    // model update from causing the controlled sheet to present again.
    requestClose();
    onSelectModel(modelId);
  }, [onSelectModel, requestClose]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      {isVisible ? (
        // Keep the Gorhom scrollable in this direct child tree. A generic sheet
        // view registers itself as a non-scrollable VIEW and can overwrite the
        // nested BottomSheetFlatList's native gesture registration on Android.
        <ModelPicker
          selectedModelId={selectedModelId}
          onSelectModel={handleSelect}
          onClose={requestClose}
          closeOnSelect={false}
          showCloseButton
          title={resolvedTitle}
        />
      ) : null}
    </BottomSheetModal>
  );
}

export default ModelPickerSheet;
