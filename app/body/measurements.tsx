import { useState, useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getLatestMeasurements,
  upsertBodyMeasurements,
  getBodySettings,
} from "../../lib/db";
import { useLayout } from "../../lib/layout";

const CM_TO_IN = 0.393701;
const IN_TO_CM = 2.54;

const FIELDS = [
  { key: "waist", label: "Waist" },
  { key: "chest", label: "Chest" },
  { key: "hips", label: "Hips" },
  { key: "left_arm", label: "Left Arm" },
  { key: "right_arm", label: "Right Arm" },
  { key: "left_thigh", label: "Left Thigh" },
  { key: "right_thigh", label: "Right Thigh" },
  { key: "left_calf", label: "Left Calf" },
  { key: "right_calf", label: "Right Calf" },
  { key: "neck", label: "Neck" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type FormState = Record<FieldKey | "body_fat", string>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Measurements() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    waist: "",
    chest: "",
    hips: "",
    left_arm: "",
    right_arm: "",
    left_thigh: "",
    right_thigh: "",
    left_calf: "",
    right_calf: "",
    neck: "",
    body_fat: "",
  });

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [prev, settings] = await Promise.all([
          getLatestMeasurements(),
          getBodySettings(),
        ]);
        setUnit(settings.measurement_unit);
        if (prev) {
          const convert = settings.measurement_unit === "in" ? CM_TO_IN : 1;
          const f: FormState = {
            waist: prev.waist ? String(Math.round(prev.waist * convert * 10) / 10) : "",
            chest: prev.chest ? String(Math.round(prev.chest * convert * 10) / 10) : "",
            hips: prev.hips ? String(Math.round(prev.hips * convert * 10) / 10) : "",
            left_arm: prev.left_arm ? String(Math.round(prev.left_arm * convert * 10) / 10) : "",
            right_arm: prev.right_arm ? String(Math.round(prev.right_arm * convert * 10) / 10) : "",
            left_thigh: prev.left_thigh ? String(Math.round(prev.left_thigh * convert * 10) / 10) : "",
            right_thigh: prev.right_thigh ? String(Math.round(prev.right_thigh * convert * 10) / 10) : "",
            left_calf: prev.left_calf ? String(Math.round(prev.left_calf * convert * 10) / 10) : "",
            right_calf: prev.right_calf ? String(Math.round(prev.right_calf * convert * 10) / 10) : "",
            neck: prev.neck ? String(Math.round(prev.neck * convert * 10) / 10) : "",
            body_fat: prev.body_fat ? String(prev.body_fat) : "",
          };
          setForm(f);
        }
      })();
    }, [])
  );

  const update = (key: FieldKey | "body_fat", val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const toCm = (val: string): number | null => {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return null;
    return unit === "in" ? n * IN_TO_CM : n;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fat = parseFloat(form.body_fat);
      await upsertBodyMeasurements(date, {
        waist: toCm(form.waist),
        chest: toCm(form.chest),
        hips: toCm(form.hips),
        left_arm: toCm(form.left_arm),
        right_arm: toCm(form.right_arm),
        left_thigh: toCm(form.left_thigh),
        right_thigh: toCm(form.right_thigh),
        left_calf: toCm(form.left_calf),
        right_calf: toCm(form.right_calf),
        neck: toCm(form.neck),
        body_fat: isNaN(fat) || fat <= 0 ? null : fat,
        notes,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const fieldInputs = FIELDS.map((f) => (
    <TextInput
      key={f.key}
      label={`${f.label} (${unit})`}
      value={form[f.key]}
      onChangeText={(v) => update(f.key, v)}
      keyboardType="numeric"
      mode="outlined"
      style={layout.wide ? styles.wideInput : styles.input}
      accessibilityLabel={`${f.label} in ${unit}`}
    />
  ));

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text variant="titleLarge" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
        Log Measurements
      </Text>

      <TextInput
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Measurement date"
      />

      {layout.wide ? (
        <View style={styles.grid}>
          {fieldInputs}
        </View>
      ) : (
        fieldInputs
      )}

      <TextInput
        label="Body Fat %"
        value={form.body_fat}
        onChangeText={(v) => update("body_fat", v)}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Body fat percentage"
      />

      <TextInput
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Optional notes"
      />

      <View style={styles.buttons}>
        <Button
          mode="outlined"
          onPress={() => router.back()}
          style={{ flex: 1, marginRight: 8 }}
          accessibilityLabel="Cancel measurement log"
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ flex: 1 }}
          accessibilityLabel="Save measurements"
        >
          Save
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  input: {
    marginBottom: 12,
  },
  wideInput: {
    marginBottom: 12,
    width: "48%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  buttons: {
    flexDirection: "row",
    marginTop: 8,
  },
});
