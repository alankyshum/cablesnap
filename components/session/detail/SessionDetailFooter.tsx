import React from "react";
import { Button } from "@/components/ui/button";
import { TemplateModal } from "./TemplateModal";
import ExercisePickerSheet from "@/components/ExercisePickerSheet";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { Exercise } from "@/lib/types";
import { t } from "@lingui/core/macro";

interface SessionDetailFooterProps {
  editing: boolean;
  isEmpty: boolean;
  pickerVisible: boolean;
  setPickerVisible: (visible: boolean) => void;
  deleteWholeSession: () => void;
  addExercise: (exercise: Exercise) => void;
  templateModalVisible: boolean;
  templateName: string;
  setTemplateName: (name: string) => void;
  handleSaveAsTemplate: () => void;
  closeTemplateModal: () => void;
  saving: boolean;
  colors: ThemeColors;
  styles: {
    repeatButton: object;
  };
}

export function SessionDetailFooter({
  editing,
  isEmpty,
  pickerVisible,
  setPickerVisible,
  deleteWholeSession,
  addExercise,
  templateModalVisible,
  templateName,
  setTemplateName,
  handleSaveAsTemplate,
  closeTemplateModal,
  saving,
  colors,
  styles,
}: SessionDetailFooterProps) {
  return (
    <>
      {editing && isEmpty && (
        <Button
          variant="outline"
          onPress={deleteWholeSession}
          style={styles.repeatButton}
          accessibilityLabel={t({ id: "components.session.detail.footer.delete-a11y", message: "Delete workout" })}
          label={t({ id: "components.session.detail.footer.delete", message: "Delete workout" })}
        />
      )}
      {editing && (
        <Button
          variant="outline"
          onPress={() => setPickerVisible(true)}
          style={styles.repeatButton}
          accessibilityLabel={t({ id: "components.session.detail.footer.add-exercise-a11y", message: "Add exercise" })}
          label={t({ id: "components.session.detail.footer.add-exercise", message: "+ Add exercise" })}
        />
      )}
      <TemplateModal
        visible={templateModalVisible}
        templateName={templateName}
        onNameChange={setTemplateName}
        onSave={handleSaveAsTemplate}
        onClose={closeTemplateModal}
        saving={saving}
        colors={colors}
      />
      <ExercisePickerSheet
        visible={pickerVisible}
        onDismiss={() => setPickerVisible(false)}
        onPick={addExercise}
      />
    </>
  );
}
