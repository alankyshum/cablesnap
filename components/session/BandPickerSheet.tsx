/**
 * BandPickerSheet — BLD-4293.
 *
 * Bottom sheet for selecting bands from the personal library.
 * Multi-select supported. Inline add-band form for empty library.
 * A11y: 44dp row hit targets, selection announced, SR-readable stack summary.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import type { Band } from "@/lib/bands";
import { resolveNumericLoad, validateLoadKg } from "@/lib/bands";

const KG_TO_LB = 2.20462;

export type BandPickerSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  bands: Band[];
  selectedBandIds: string[];
  unit: "kg" | "lb";
  setNumber?: number;
  onConfirm: (bandIds: string[]) => void;
  onCreateBand: (label: string, loadKg: number | null, colorHint: string | null) => Promise<Band>;
};

type AddBandFormState = { label: string; loadInput: string; error: string | null };
const INITIAL_FORM: AddBandFormState = { label: "", loadInput: "", error: null };

function BandPickerBody({
  onClose, bands, selectedBandIds, unit, setNumber, onConfirm, onCreateBand,
}: Omit<BandPickerSheetProps, "isVisible">) {
  const colors = useThemeColors();
  const [staged, setStaged] = useState<string[]>(selectedBandIds);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddBandFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const toggleBand = useCallback((id: string) => {
    setStaged((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);
  }, []);

  const handleConfirm = useCallback(() => { onConfirm(staged); onClose(); }, [staged, onConfirm, onClose]);
  const handleClear = useCallback(() => setStaged([]), []);

  const stagedBands = useMemo(
    () => staged.map((id) => bands.find((b) => b.id === id)).filter((b): b is Band => b !== undefined),
    [staged, bands],
  );
  const numericLoad = resolveNumericLoad(stagedBands);
  const loadSummary = useMemo(() => {
    if (stagedBands.length === 0) return null;
    if (numericLoad !== null) {
      return unit === "lb" ? `${(numericLoad * KG_TO_LB).toFixed(1)} lb` : `${numericLoad} kg`;
    }
    return stagedBands.map((b) => b.label).join(" + ");
  }, [stagedBands, numericLoad, unit]);

  const a11yStackSummary = stagedBands.length === 0
    ? "No bands selected"
    : `Selected bands: ${stagedBands.map((b) => b.label).join(", ")}${numericLoad !== null ? `, total ${loadSummary}` : ""}`;

  async function handleSaveNewBand() {
    if (!form.label.trim()) { setForm((f) => ({ ...f, error: "Label is required." })); return; }
    let loadKg: number | null = null;
    if (form.loadInput.trim()) {
      const rawValue = parseFloat(form.loadInput);
      const inKg = unit === "lb" ? rawValue / KG_TO_LB : rawValue;
      loadKg = validateLoadKg(inKg);
      if (loadKg === null) { setForm((f) => ({ ...f, error: "Invalid load — must be a positive number." })); return; }
    }
    setSaving(true);
    try {
      const newBand = await onCreateBand(form.label.trim(), loadKg, null);
      setStaged((prev) => [...prev, newBand.id]);
      setShowAddForm(false);
      setForm(INITIAL_FORM);
    } catch {
      Alert.alert("Error", "Failed to save band. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const renderBandRow = useCallback(({ item }: { item: Band }) => {
    const isSelected = staged.includes(item.id);
    const loadLabel = item.load_kg !== null
      ? (unit === "lb" ? `${(item.load_kg * KG_TO_LB).toFixed(1)} lb` : `${item.load_kg} kg`)
      : "No load set";
    return (
      <Pressable
        onPress={() => toggleBand(item.id)}
        style={[styles.bandRow, { borderColor: isSelected ? colors.primary : colors.outlineVariant },
          isSelected && { backgroundColor: colors.primaryContainer }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${item.label}, ${loadLabel}${isSelected ? ", selected" : ""}`}
        accessibilityHint="Double-tap to toggle selection"
        android_ripple={{ color: colors.primaryContainer }}
      >
        <View style={styles.bandRowContent}>
          <Text style={[styles.bandLabel, { color: isSelected ? colors.onPrimaryContainer : colors.onSurface }]}>{item.label}</Text>
          <Text style={[styles.bandLoad, { color: isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant }]}>{loadLabel}</Text>
        </View>
        {isSelected && (
          <View style={[styles.checkIndicator, { backgroundColor: colors.primary }]} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={[styles.checkText, { color: colors.onPrimary }]}>✓</Text>
          </View>
        )}
      </Pressable>
    );
  }, [staged, toggleBand, unit, colors]);

  const title = setNumber !== undefined ? `Set ${setNumber} — Bands` : "Select Bands";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.outlineVariant }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
        {staged.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear band selection">
            <Text style={[styles.clearBtn, { color: colors.error }]}>Clear</Text>
          </Pressable>
        )}
      </View>
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={a11yStackSummary} style={styles.a11ySummary} importantForAccessibility="yes">
        {loadSummary ? <Text style={[styles.loadSummary, { color: colors.onSurfaceVariant }]}>{loadSummary}</Text> : null}
      </View>
      {bands.length === 0 && !showAddForm ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>No bands yet — add your first band below.</Text>
        </View>
      ) : (
        <FlatList data={bands} keyExtractor={(b) => b.id} renderItem={renderBandRow} contentContainerStyle={styles.listContent} style={styles.list} />
      )}
      {showAddForm ? (
        <View style={[styles.addForm, { backgroundColor: colors.surfaceVariant, borderRadius: radii.md }]}>
          <Text style={[styles.formLabel, { color: colors.onSurface }]}>New Band</Text>
          <TextInput style={[styles.textInput, { borderColor: colors.outline, color: colors.onSurface }]} placeholder="Label (e.g. Red, Heavy)" placeholderTextColor={colors.onSurfaceVariant} value={form.label} onChangeText={(t) => setForm((f) => ({ ...f, label: t, error: null }))} accessibilityLabel="Band label" returnKeyType="next" autoFocus />
          <TextInput style={[styles.textInput, { borderColor: colors.outline, color: colors.onSurface }]} placeholder={`Load in ${unit} (optional)`} placeholderTextColor={colors.onSurfaceVariant} value={form.loadInput} onChangeText={(t) => setForm((f) => ({ ...f, loadInput: t, error: null }))} keyboardType="decimal-pad" accessibilityLabel={`Band load in ${unit}, optional`} returnKeyType="done" />
          {form.error ? <Text style={[styles.errorText, { color: colors.error }]}>{form.error}</Text> : null}
          <View style={styles.formActions}>
            <Pressable onPress={() => { setShowAddForm(false); setForm(INITIAL_FORM); }} style={[styles.actionBtn, { borderColor: colors.outline }]} accessibilityRole="button" accessibilityLabel="Cancel adding band">
              <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSaveNewBand} disabled={saving} style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Save new band">
              <Text style={[styles.actionBtnText, { color: colors.onPrimary }]}>{saving ? "Saving…" : "Add Band"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowAddForm(true)} style={[styles.addBandBtn, { borderColor: colors.outline }]} accessibilityRole="button" accessibilityLabel="Add a new band to your library">
          <Text style={[styles.addBandBtnText, { color: colors.primary }]}>+ Add Band</Text>
        </Pressable>
      )}
      <View style={styles.footer}>
        <Pressable onPress={onClose} style={[styles.footerBtn, { borderColor: colors.outline }]} accessibilityRole="button" accessibilityLabel="Cancel band selection">
          <Text style={[styles.footerBtnText, { color: colors.onSurface }]}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleConfirm} style={[styles.footerBtn, styles.footerConfirmBtn, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={`Confirm selection of ${staged.length} band${staged.length !== 1 ? "s" : ""}`}>
          <Text style={[styles.footerBtnText, { color: colors.onPrimary }]}>
            {staged.length > 0 ? `Use ${staged.length} band${staged.length !== 1 ? "s" : ""}` : "Save (no band)"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function BandPickerSheet(props: BandPickerSheetProps) {
  return (
    <BottomSheet isVisible={props.isVisible} onClose={props.onClose}>
      {props.isVisible ? <BandPickerBody {...props} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 0 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: fontSizes.base, fontWeight: "700" },
  clearBtn: { fontSize: fontSizes.sm, fontWeight: "600" },
  a11ySummary: { paddingHorizontal: 16, paddingTop: 6, minHeight: 20 },
  loadSummary: { fontSize: fontSizes.sm, fontStyle: "italic" },
  list: { maxHeight: 280 },
  listContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  bandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, borderRadius: radii.sm, borderWidth: 1.5 },
  bandRowContent: { flex: 1 },
  bandLabel: { fontSize: fontSizes.sm, fontWeight: "600" },
  bandLoad: { fontSize: fontSizes.xs, marginTop: 2 },
  checkIndicator: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  checkText: { fontSize: 12, fontWeight: "700" },
  emptyState: { paddingHorizontal: 20, paddingVertical: 24, alignItems: "center" },
  emptyText: { fontSize: fontSizes.sm, textAlign: "center" },
  addForm: { margin: 12, padding: 12, gap: 8 },
  formLabel: { fontSize: fontSizes.sm, fontWeight: "700", marginBottom: 4 },
  textInput: { height: 44, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 10, fontSize: fontSizes.sm },
  errorText: { fontSize: fontSizes.xs },
  formActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, height: 44, borderRadius: radii.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  primaryBtn: { borderWidth: 0 },
  actionBtnText: { fontSize: fontSizes.sm, fontWeight: "600" },
  addBandBtn: { marginHorizontal: 12, marginTop: 8, height: 44, borderWidth: 1, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", borderStyle: "dashed" },
  addBandBtnText: { fontSize: fontSizes.sm, fontWeight: "600" },
  footer: { flexDirection: "row", gap: 12, padding: 12, paddingBottom: Platform.OS === "ios" ? 24 : 12 },
  footerBtn: { flex: 1, height: 48, borderWidth: 1, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  footerConfirmBtn: { borderWidth: 0 },
  footerBtnText: { fontSize: fontSizes.sm, fontWeight: "700" },
});
