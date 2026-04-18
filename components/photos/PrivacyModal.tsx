import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";

interface PrivacyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function PrivacyModal({ visible, onDismiss }: PrivacyModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons
            name="shield-lock-outline"
            size={48}
            color={colors.primary}
            style={{ alignSelf: "center", marginBottom: 16 }}
          />
          <Text variant="title" style={{ color: colors.onSurface, textAlign: "center", marginBottom: 12 }}>
            Your Photos Are Private
          </Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 24 }}>
            Your progress photos are stored only on this device and never uploaded to any server.
            Photos are not visible in your device&apos;s photo gallery.
            If you reinstall the app, photos will be lost.
          </Text>
          <Button variant="default" onPress={onDismiss} label="I Understand" />
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
});
