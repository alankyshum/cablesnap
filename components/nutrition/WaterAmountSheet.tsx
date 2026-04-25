/**
 * BLD-600 — Water amount input sheet (custom volume + edit existing entry).
 */
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { MAX_SINGLE_ENTRY_ML, mlToOz, ozToMl, type HydrationUnit } from "@/lib/hydration-units";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  visible: boolean;
  onClose: () => void;
  unit: HydrationUnit;
  initialMl?: number | null;
  onSubmit: (amountMl: number) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  colors: ThemeColors;
};

const MAX_OZ = mlToOz(MAX_SINGLE_ENTRY_ML);

export function WaterAmountSheet({
  visible, onClose, unit, initialMl, onSubmit, onDelete, colors,
}: Props) {
  const [text, setText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setText("");
      setErrorMsg(null);
      return;
    }
    if (initialMl != null && initialMl > 0) {
      const initial = unit === "ml" ? Math.round(initialMl) : Number(mlToOz(initialMl).toFixed(1));
      setText(String(initial));
    } else {
      setText("");
    }
    setErrorMsg(null);
  }, [visible, initialMl, unit]);

  const handleSubmit = async () => {
    const n = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErrorMsg("Enter an amount above 0.");
      return;
    }
    const cap = unit === "ml" ? MAX_SINGLE_ENTRY_ML : MAX_OZ;
    if (n > cap) {
      const suffix = unit === "ml" ? "ml" : "fl oz";
      setErrorMsg(`Maximum is ${unit === "ml" ? MAX_SINGLE_ENTRY_ML : Math.floor(MAX_OZ)} ${suffix} per entry.`);
      return;
    }
    const ml = unit === "ml" ? n : ozToMl(n);
    setErrorMsg(null);
    await onSubmit(Math.round(ml));
    onClose();
  };

  return (
    <BottomSheet isVisible={visible} onClose={onClose} snapPoints={[0.4, 0.6]} title={initialMl != null ? "Edit water entry" : "Add water"}>
      <View style={styles.body}>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
          Amount ({unit === "ml" ? "ml" : "fl oz"})
        </Text>
        <TextInput
          accessibilityLabel="Water amount"
          accessibilityHint={unit === "ml" ? "Enter a positive number of milliliters." : "Enter a positive number of fluid ounces."}
          value={text}
          onChangeText={setText}
          keyboardType="numeric"
          placeholder={unit === "ml" ? "e.g. 250" : "e.g. 8"}
          placeholderTextColor={colors.onSurfaceVariant}
          style={[
            styles.input,
            { color: colors.onSurface, borderColor: errorMsg ? "#d32f2f" : colors.onSurfaceVariant },
          ]}
        />
        {errorMsg && (
          <Text variant="caption" style={{ color: "#d32f2f", marginTop: 6 }}>{errorMsg}</Text>
        )}

        <View style={styles.actionsRow}>
          {onDelete ? (
            <Pressable
              onPress={async () => { await onDelete(); onClose(); }}
              accessibilityLabel="Delete water entry"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btn,
                styles.deleteBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text variant="body" style={{ color: "#d32f2f" }}>Delete</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleSubmit}
            accessibilityLabel={initialMl != null ? "Save water entry" : "Add water entry"}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text variant="body" style={{ color: "#fff" }}>{initialMl != null ? "Save" : "Add"}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 44,
  },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  btn: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  deleteBtn: { backgroundColor: "transparent" },
});
