import { useState, useCallback, useRef, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View, TextInput as RNTextInput } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/bna-toast";
import { createMealTemplate } from "@/lib/db";
import type { DailyLog, Meal } from "@/lib/types";
import { MEAL_LABELS } from "@/lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = { visible: boolean; onClose: () => void; meal: Meal; items: DailyLog[]; onSaved: () => void };

function sumMacros(items: DailyLog[]) {
  let cal = 0, p = 0, c = 0, f = 0;
  for (const l of items) {
    const s = l.servings;
    cal += (l.food?.calories ?? 0) * s;
    p += (l.food?.protein ?? 0) * s;
    c += (l.food?.carbs ?? 0) * s;
    f += (l.food?.fat ?? 0) * s;
  }
  return { cal: Math.round(cal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

export default function SaveAsTemplateSheet({ visible, onClose, meal, items, onSaved }: Props) {
  const colors = useThemeColors();
  const { success, error: showError } = useToast();
  const defaultName = `My ${MEAL_LABELS[meal]}`;
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<RNTextInput>(null);

  useEffect(() => {
    if (visible) { setName(defaultName); setTimeout(() => inputRef.current?.focus(), 400); }
  }, [visible, defaultName]);

  const isValid = name.trim().length > 0;
  const totals = sumMacros(items);

  const handleSave = useCallback(async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await createMealTemplate({ name: name.trim(), meal, items: items.map((l) => ({ food_entry_id: l.food_entry_id, servings: l.servings })) });
      success("Template saved");
      onClose();
      onSaved();
    } catch {
      showError("Failed to save template");
    } finally {
      setSaving(false);
    }
  }, [isValid, saving, name, meal, items, success, showError, onClose, onSaved]);

  const show = visible;

  return (
    <BottomSheet
      isVisible={show}
      onClose={onClose}
      title="Save as Template"
      snapPoints={[0.5, 0.7]}
    >
      <View style={styles.container}>
        <Input ref={inputRef} label="Name" value={name} onChangeText={setName} placeholder="e.g. My Breakfast" accessibilityLabel="Template name" />
        <View style={styles.preview}>
          <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>Items ({items.length})</Text>
          {items.map((item) => (
            <View key={item.id} style={styles.previewItem}>
              <Text variant="body" style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{item.food?.name ?? "Unknown"}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {item.servings !== 1 ? `${item.servings}× · ` : ""}{Math.round((item.food?.calories ?? 0) * item.servings)} cal
              </Text>
            </View>
          ))}
        </View>
        <View style={[styles.macroSummary, { backgroundColor: colors.surfaceVariant }]}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            Total: {totals.cal} cal · {totals.p}p · {totals.c}c · {totals.f}f
          </Text>
        </View>
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: isValid ? colors.primary : colors.surfaceVariant }]} onPress={handleSave} disabled={!isValid || saving} accessibilityLabel="Save template" accessibilityRole="button">
          <Text variant="body" style={{ color: isValid ? colors.onPrimary : colors.onSurfaceVariant, fontWeight: "600" }}>{saving ? "Saving…" : "Save Template"}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  preview: { marginTop: 8 },
  previewItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  macroSummary: { padding: 12, borderRadius: 8, alignItems: "center" },
  saveButton: { padding: 14, borderRadius: 8, alignItems: "center", minHeight: 48, justifyContent: "center" },
});
