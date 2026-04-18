import { Modal, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";

type WeightLogModalProps = {
  visible: boolean;
  onClose: () => void;
  unit: "kg" | "lb";
  logWeight: string;
  setLogWeight: (v: string) => void;
  logDate: string;
  setLogDate: (v: string) => void;
  logNotes: string;
  setLogNotes: (v: string) => void;
  saving: boolean;
  onSave: () => void;
};

export default function WeightLogModal({
  visible,
  onClose,
  unit,
  logWeight,
  setLogWeight,
  logDate,
  setLogDate,
  logNotes,
  setLogNotes,
  saving,
  onSave,
}: WeightLogModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text
            variant="title"
            style={{ color: colors.onSurface, marginBottom: 16 }}
          >
            Log Weight
          </Text>

          <Input
            label={`Weight (${unit})`}
            value={logWeight}
            onChangeText={setLogWeight}
            keyboardType="numeric"
            variant="outline"
            containerStyle={styles.input}
            accessibilityLabel={`Weight in ${unit}`}
          />

          <Input
            label="Date (YYYY-MM-DD)"
            value={logDate}
            onChangeText={setLogDate}
            variant="outline"
            containerStyle={styles.input}
            accessibilityLabel="Date for weight entry"
          />

          <Input
            label="Notes (optional)"
            value={logNotes}
            onChangeText={setLogNotes}
            variant="outline"
            containerStyle={styles.input}
            accessibilityLabel="Optional notes"
          />

          <View style={styles.modalButtons}>
            <Button
              variant="outline"
              onPress={onClose}
              style={{ flex: 1, marginRight: 8 }}
              accessibilityLabel="Cancel weight log"
              label="Cancel"
            />
            <Button
              variant="default"
              onPress={onSave}
              loading={saving}
              disabled={saving || !logWeight}
              style={{ flex: 1 }}
              accessibilityLabel="Save weight entry"
              label="Save"
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    elevation: 8,
  },
  input: {
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 8,
  },
});
