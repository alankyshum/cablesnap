import React from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
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
 * Bottom-sheet drawer wrapper for the AI Model Picker.
 * Reuses the app's existing BottomSheet primitive.
 */
export function ModelPickerSheet({
  isVisible,
  onClose,
  selectedModelId,
  onSelectModel,
  title = "Select AI Model",
}: ModelPickerSheetProps) {
  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title={title}
      snapPoints={[0.6, 0.9]}
      enableBackdropDismiss
      disableContentScroll
    >
      {isVisible ? (
        <ModelPicker
          selectedModelId={selectedModelId}
          onSelectModel={onSelectModel}
          onClose={onClose}
          title={null}
        />
      ) : null}
    </BottomSheet>
  );
}

export default ModelPickerSheet;
