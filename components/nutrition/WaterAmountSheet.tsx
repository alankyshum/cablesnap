import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
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

  // Sync the input text/error to the incoming props each time visibility or
  // the initial amount changes. Intentional controlled reset of a sheet, not a
  // render loop (runs only on visible/initialMl/unit change). The upgraded
  // react-hooks plugin flags every synchronous setState path in this effect;
  // they are all part of the same intentional reset. Behavior is preserved.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    const n = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
       setErrorMsg(t({ id: "components.nutrition.water.amountError", message: "Enter an amount above 0." }));
      return;
    }
    const cap = unit === "ml" ? MAX_SINGLE_ENTRY_ML : MAX_OZ;
    if (n > cap) {
      const suffix = unit === "ml" ? "ml" : "fl oz";
       setErrorMsg(i18n._({ id: "components.nutrition.water.maximumError", message: "Maximum is {maximum} {suffix} per entry.", values: { maximum: unit === "ml" ? MAX_SINGLE_ENTRY_ML : Math.floor(MAX_OZ), suffix } }));
      return;
    }
    const ml = unit === "ml" ? n : ozToMl(n);
    setErrorMsg(null);
    await onSubmit(Math.round(ml));
    onClose();
  };

  return (
    <BottomSheet isVisible={visible} onClose={onClose} snapPoints={[0.4, 0.6]} title={initialMl != null ? t({ id: "components.nutrition.water.editTitle", message: "Edit water entry" }) : t({ id: "components.nutrition.water.addTitle", message: "Add water" })}>
      <View style={styles.body}>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
           {i18n._({ id: "components.nutrition.water.amount", message: "Amount ({unit, select, ml {ml} oz {fl oz}})", values: { unit: unit === "ml" ? "ml" : "oz" } })}
        </Text>
        <TextInput
          accessibilityLabel={t({ id: "components.nutrition.water.amountA11y", message: "Water amount" })}
          accessibilityHint={unit === "ml" ? t({ id: "components.nutrition.water.mlHint", message: "Enter a positive number of milliliters." }) : t({ id: "components.nutrition.water.ozHint", message: "Enter a positive number of fluid ounces." })}
          value={text}
          onChangeText={setText}
          keyboardType="numeric"
           placeholder={unit === "ml" ? t({ id: "components.nutrition.water.mlPlaceholder", message: "e.g. 250" }) : t({ id: "components.nutrition.water.ozPlaceholder", message: "e.g. 8" })}
          placeholderTextColor={colors.onSurfaceVariant}
          style={[
            styles.input,
            { color: colors.onSurface, borderColor: errorMsg ? colors.error : colors.onSurfaceVariant },
          ]}
        />
        {errorMsg && (
          <Text variant="caption" style={{ color: colors.error, marginTop: 6 }}>{errorMsg}</Text>
        )}

        <View style={styles.actionsRow}>
          {onDelete ? (
            <Pressable
              onPress={async () => { await onDelete(); onClose(); }}
              accessibilityLabel={t({ id: "components.nutrition.water.deleteA11y", message: "Delete water entry" })}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btn,
                styles.deleteBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text variant="body" style={{ color: colors.error }}><Trans id="components.nutrition.water.delete">Delete</Trans></Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleSubmit}
            accessibilityLabel={initialMl != null ? t({ id: "components.nutrition.water.saveA11y", message: "Save water entry" }) : t({ id: "components.nutrition.water.addA11y", message: "Add water entry" })}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text variant="body" style={{ color: colors.onPrimary }}>{initialMl != null ? <Trans id="components.nutrition.water.save">Save</Trans> : <Trans id="components.nutrition.water.add">Add</Trans>}</Text>
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
