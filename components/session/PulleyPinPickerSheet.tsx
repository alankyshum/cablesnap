import React, { useCallback } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export type PulleyPinPickerSheetProps = {
  visible: boolean;
  currentPin: number | null;
  maxPins?: number;
  onSelect: (pin: number | null) => void;
  onClose: () => void;
};

export function PulleyPinPickerSheet({ visible, currentPin, maxPins = 12, onSelect, onClose }: PulleyPinPickerSheetProps) {
  const colors = useThemeColors();
  const clampedMax = Math.max(1, Math.min(30, maxPins));
  const pins = Array.from({ length: clampedMax }, (_, i) => i + 1);

  const handleSelect = useCallback((pin: number) => {
    onSelect(currentPin === pin ? null : pin);
    onClose();
  }, [currentPin, onSelect, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} accessibilityLabel="Close picker" />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}> 
          <Text style={[styles.title, { color: colors.onSurface }]}>Pulley Pin</Text>
          <FlatList
            data={pins}
            numColumns={6}
            keyExtractor={(item) => String(item)}
            renderItem={({ item }) => {
              const selected = item === currentPin;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={[
                    styles.pinBtn,
                    {
                      backgroundColor: selected ? colors.primary : colors.surfaceVariant,
                      minWidth: 44,
                      minHeight: 44,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pulley pin ${item}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.pinLabel, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}> 
                    {item}
                  </Text>
                </Pressable>
              );
            }}
            contentContainerStyle={styles.grid}
          />
          <Pressable onPress={() => { onSelect(null); onClose(); }} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel="Clear pulley pin">
            <Text style={[styles.clearLabel, { color: colors.error }]}>Clear</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32 },
  title: { fontSize: fontSizes.lg, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  grid: { paddingHorizontal: 4 },
  pinBtn: { margin: 4, borderRadius: 8, alignItems: "center", justifyContent: "center", flex: 1 / 6 },
  pinLabel: { fontSize: fontSizes.base, fontWeight: "600" },
  clearBtn: { marginTop: 12, padding: 12, alignItems: "center" },
  clearLabel: { fontSize: fontSizes.base, fontWeight: "600" },
});
