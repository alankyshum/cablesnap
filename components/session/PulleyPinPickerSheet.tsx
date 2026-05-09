import React, { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export type PulleyPinPickerSheetProps = {
  visible: boolean;
  currentPin: number | null;
  maxPins?: number;
  onSelect: (pin: number | null) => void;
  onSetMaxPins?: (newMax: number) => void;
  onClose: () => void;
};

export function PulleyPinPickerSheet({ visible, currentPin, maxPins = 12, onSelect, onSetMaxPins, onClose }: PulleyPinPickerSheetProps) {
  const colors = useThemeColors();
  const clampedMax = Math.max(1, Math.min(30, maxPins));
  const pins = Array.from({ length: clampedMax }, (_, i) => i + 1);
  const [editingMax, setEditingMax] = useState(false);
  const [maxInput, setMaxInput] = useState(String(clampedMax));

  const handleSelect = useCallback((pin: number) => {
    onSelect(currentPin === pin ? null : pin);
    onClose();
  }, [currentPin, onSelect, onClose]);

  const handleTitleLongPress = useCallback(() => {
    if (!onSetMaxPins) return;
    setMaxInput(String(clampedMax));
    setEditingMax(true);
  }, [clampedMax, onSetMaxPins]);

  const handleConfirmMax = useCallback(() => {
    const parsed = parseInt(maxInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 30) {
      Alert.alert("Invalid value", "Please enter a number between 1 and 30.");
      return;
    }
    onSetMaxPins?.(parsed);
    setEditingMax(false);
  }, [maxInput, onSetMaxPins]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} accessibilityLabel="Close picker" />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {editingMax ? (
            <View style={styles.maxEditRow}>
              <TextInput
                value={maxInput}
                onChangeText={setMaxInput}
                keyboardType="number-pad"
                style={[styles.maxInput, { color: colors.onSurface, borderColor: colors.outline }]}
                accessibilityLabel="Max pins input"
                returnKeyType="done"
                onSubmitEditing={handleConfirmMax}
                autoFocus
              />
              <Pressable onPress={handleConfirmMax} style={[styles.maxConfirmBtn, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Confirm max pins">
                <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Set</Text>
              </Pressable>
              <Pressable onPress={() => setEditingMax(false)} style={styles.maxCancelBtn} accessibilityRole="button" accessibilityLabel="Cancel max pins edit">
                <Text style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onLongPress={onSetMaxPins ? handleTitleLongPress : undefined}
              accessibilityRole="text"
              accessibilityLabel={onSetMaxPins ? `Pulley Pin, long press to set max (currently ${clampedMax})` : "Pulley Pin"}
              accessibilityHint={onSetMaxPins ? "Long press to change the maximum pin number for this machine" : undefined}
            >
              <Text style={[styles.title, { color: colors.onSurface }]}>
                Pulley Pin
                {onSetMaxPins ? <Text style={[styles.maxHint, { color: colors.onSurfaceVariant }]}>{` (max ${clampedMax})`}</Text> : null}
              </Text>
            </Pressable>
          )}
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
  maxHint: { fontSize: fontSizes.sm, fontWeight: "400" },
  maxEditRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  maxInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: fontSizes.base, textAlign: "center" },
  maxConfirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  maxCancelBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  grid: { paddingHorizontal: 4 },
  pinBtn: { margin: 4, borderRadius: 8, alignItems: "center", justifyContent: "center", flex: 1 / 6 },
  pinLabel: { fontSize: fontSizes.base, fontWeight: "600" },
  clearBtn: { marginTop: 12, padding: 12, alignItems: "center" },
  clearLabel: { fontSize: fontSizes.base, fontWeight: "600" },
});
