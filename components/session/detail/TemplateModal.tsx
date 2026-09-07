import { Modal, StyleSheet, TextInput, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { t } from "@lingui/core/macro";

type Props = {
  visible: boolean;
  templateName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  colors: ThemeColors;
};

export function TemplateModal({ visible, templateName, onNameChange, onSave, onClose, saving, colors }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>
            {t({ id: "components.session.detail.template-modal.title", message: "Save as Template" })}
          </Text>
          <TextInput
            value={templateName}
            onChangeText={(t) => onNameChange(t.slice(0, 100))}
            placeholder={t({ id: "components.session.detail.template-modal.placeholder", message: "Template name" })}
            placeholderTextColor={colors.onSurfaceDisabled}
            maxLength={100}
            style={[
              styles.modalInput,
              {
                color: colors.onSurface,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.outline,
              },
            ]}
            autoFocus
            accessibilityLabel={t({ id: "components.session.detail.template-modal.name-a11y", message: "Template name" })}
          />
          <View style={styles.modalActions}>
            <Button variant="ghost" onPress={onClose} label={t({ id: "components.session.detail.template-modal.cancel", message: "Cancel" })} />
            <Button
              variant="default"
              onPress={onSave}
              loading={saving}
              disabled={saving || !templateName.trim()}
              label={t({ id: "components.session.detail.template-modal.save", message: "Save" })}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: fontSizes.base,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
});
