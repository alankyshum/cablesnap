import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import React from "react";
import { Image, Modal, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PoseCategory } from "../../lib/db/photos";

interface PhotoMetaModalProps {
  visible: boolean;
  pendingUri: string | null;
  metaDate: string;
  metaPose: PoseCategory | null;
  metaNote: string;
  saving: boolean;
  onDateChange: (date: string) => void;
  onPoseChange: (pose: PoseCategory | null) => void;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
  poseOptions: { label: string; value: PoseCategory }[];
}

export default function PhotoMetaModal({
  visible,
  pendingUri,
  metaDate,
  metaPose,
  metaNote,
  saving,
  onDateChange,
  onPoseChange,
  onNoteChange,
  onSave,
  onCancel,
  poseOptions,
}: PhotoMetaModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Photo Details
          </Text>
          {pendingUri && (
            <Image
              source={{ uri: pendingUri }}
              style={styles.preview}
              resizeMode="contain"
            />
          )}
          <Input
             placeholder={t({ id: "components.photos.meta.datePlaceholder", message: "Date (YYYY-MM-DD)" })}
            value={metaDate}
            onChangeText={onDateChange}
            style={styles.input}
             accessibilityLabel={t({ id: "components.photos.meta.dateA11y", message: "Date" })}
          />
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 8, marginBottom: 4 }}>
             <Trans id="components.photos.meta.poseCategory">Pose Category</Trans>
          </Text>
          <View style={styles.chips}>
            {poseOptions.map((p) => (
              <Chip
                key={p.value}
                selected={metaPose === p.value}
                onPress={() => onPoseChange(metaPose === p.value ? null : p.value)}
                style={styles.chip}
                accessibilityLabel={`${p.label} pose category`}
                accessibilityRole="checkbox"
              >
                {p.label}
              </Chip>
            ))}
          </View>
          <Input
             placeholder={t({ id: "components.photos.meta.notePlaceholder", message: "Note (optional)" })}
            value={metaNote}
            onChangeText={onNoteChange}
            style={styles.input}
            multiline
             accessibilityLabel={t({ id: "components.photos.meta.noteA11y", message: "Note" })}
          />
          <View style={styles.modalButtons}>
            <Button
              variant="outline"
              onPress={onCancel}
              style={{ flex: 1, marginRight: 8 }}
               label={t({ id: "components.photos.meta.cancel", message: "Cancel" })}
            />
            <Button
              variant="default"
              onPress={onSave}
              loading={saving}
              disabled={saving}
              style={{ flex: 1 }}
               label={t({ id: "components.photos.meta.save", message: "Save" })}
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
    padding: 24,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    maxHeight: "85%",
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  input: {
    marginTop: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    gap: 4,
  },
  chip: {
    marginBottom: 4,
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 16,
  },
});
