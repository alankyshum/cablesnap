import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Chip,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useRouter } from "expo-router";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  EQUIPMENT_LIST,
  EQUIPMENT_LABELS,
  type Equipment,
  type Exercise,
  type MuscleGroup,
  MUSCLE_GROUPS_BY_REGION,
  MUSCLE_LABELS,
} from "../lib/types";

type Props = {
  initial?: Exercise;
  onSave: (data: Omit<Exercise, "id" | "is_custom">) => Promise<void>;
  title: string;
};

export default function ExerciseForm({ initial, onSave, title }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<Category | null>(initial?.category ?? null);
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? "bodyweight");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "beginner");
  const [primary, setPrimary] = useState<Set<MuscleGroup>>(
    new Set(initial?.primary_muscles ?? [])
  );
  const [secondary, setSecondary] = useState<Set<MuscleGroup>>(
    new Set(initial?.secondary_muscles ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string; muscles?: string }>({});
  const [toast, setToast] = useState("");

  const toggleMuscle = useCallback(
    (set: Set<MuscleGroup>, setter: (s: Set<MuscleGroup>) => void, muscle: MuscleGroup) => {
      const next = new Set(set);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      setter(next);
      setDirty(true);
    },
    []
  );

  const validate = useCallback(() => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = "Name is required";
    if (!category) e.category = "Category is required";
    if (primary.size === 0) e.muscles = "Select at least one primary muscle";
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, category, primary]);

  const save = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category: category!,
        equipment,
        difficulty,
        primary_muscles: Array.from(primary),
        secondary_muscles: Array.from(secondary),
        instructions: "",
      });
    } catch {
      setToast("Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }, [validate, onSave, name, category, equipment, difficulty, primary, secondary]);

  const back = useCallback(() => {
    if (dirty) {
      Alert.alert("Discard changes?", "You have unsaved changes.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  }, [dirty, router]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <TextInput
          label="Exercise Name"
          value={name}
          onChangeText={(v) => { setName(v); setDirty(true); setErrors((e) => ({ ...e, name: undefined })); }}
          mode="outlined"
          maxLength={100}
          error={!!errors.name}
          accessibilityLabel="Exercise name"
          style={styles.input}
        />
        <View style={styles.counter}>
          <Text
            variant="bodySmall"
            style={{ color: errors.name ? theme.colors.error : theme.colors.onSurfaceVariant }}
            accessibilityLabel={errors.name ?? `${name.length} of 100 characters used`}
            accessibilityLiveRegion="polite"
          >
            {errors.name ?? `${name.length}/100`}
          </Text>
        </View>

        {/* Category */}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
          Category *
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                selected={category === cat}
                onPress={() => { setCategory(cat); setDirty(true); setErrors((e) => ({ ...e, category: undefined })); }}
                style={styles.chip}
                compact
                accessibilityLabel={`Category: ${CATEGORY_LABELS[cat]}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === cat }}
              >
                {CATEGORY_LABELS[cat]}
              </Chip>
            ))}
          </View>
        </ScrollView>
        {errors.category && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.error, marginTop: 2, marginHorizontal: 16 }}
            accessibilityLiveRegion="polite"
          >
            {errors.category}
          </Text>
        )}

        {/* Equipment */}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
          Equipment
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {EQUIPMENT_LIST.map((eq) => (
              <Chip
                key={eq}
                selected={equipment === eq}
                onPress={() => { setEquipment(eq); setDirty(true); }}
                style={styles.chip}
                compact
                accessibilityLabel={`Equipment: ${EQUIPMENT_LABELS[eq]}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: equipment === eq }}
              >
                {EQUIPMENT_LABELS[eq]}
              </Chip>
            ))}
          </View>
        </ScrollView>

        {/* Difficulty */}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
          Difficulty
        </Text>
        <SegmentedButtons
          value={difficulty}
          onValueChange={(v) => { setDifficulty(v as Difficulty); setDirty(true); }}
          buttons={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
          style={styles.segment}
        />

        {/* Primary Muscles */}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
          Primary Muscles *
        </Text>
        {MUSCLE_GROUPS_BY_REGION.map((region) => (
          <View key={region.label} style={styles.region}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
              {region.label}
            </Text>
            <View style={styles.chipWrap}>
              {region.muscles.map((m) => (
                <Chip
                  key={m}
                  selected={primary.has(m)}
                  onPress={() => { toggleMuscle(primary, setPrimary, m); setErrors((e) => ({ ...e, muscles: undefined })); }}
                  style={styles.chip}
                  compact
                  accessibilityLabel={`Primary muscle: ${MUSCLE_LABELS[m]}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: primary.has(m) }}
                >
                  {MUSCLE_LABELS[m]}
                </Chip>
              ))}
            </View>
          </View>
        ))}
        {errors.muscles && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.error, marginHorizontal: 16 }}
            accessibilityLiveRegion="polite"
          >
            {errors.muscles}
          </Text>
        )}

        {/* Secondary Muscles */}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
          Secondary Muscles
        </Text>
        {MUSCLE_GROUPS_BY_REGION.map((region) => (
          <View key={region.label} style={styles.region}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
              {region.label}
            </Text>
            <View style={styles.chipWrap}>
              {region.muscles.map((m) => (
                <Chip
                  key={m}
                  selected={secondary.has(m)}
                  onPress={() => toggleMuscle(secondary, setSecondary, m)}
                  style={styles.chip}
                  compact
                  accessibilityLabel={`Secondary muscle: ${MUSCLE_LABELS[m]}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: secondary.has(m) }}
                >
                  {MUSCLE_LABELS[m]}
                </Chip>
              ))}
            </View>
          </View>
        ))}

        {/* Save / Cancel */}
        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={save}
            loading={saving}
            disabled={saving}
            style={styles.saveBtn}
            accessibilityLabel={`Save ${title.toLowerCase()}`}
          >
            Save
          </Button>
          <Button
            mode="outlined"
            onPress={back}
            disabled={saving}
            style={styles.cancelBtn}
            accessibilityLabel="Cancel"
          >
            Cancel
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast("")}
        duration={3000}
      >
        {toast}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  input: { marginBottom: 0 },
  counter: { alignItems: "flex-end", marginBottom: 8, marginRight: 4 },
  label: { marginTop: 16, marginBottom: 8 },
  chipScroll: { marginBottom: 4 },
  chipRow: { flexDirection: "row", gap: 6, paddingRight: 16 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { marginBottom: 2 },
  segment: { marginHorizontal: 0 },
  region: { marginBottom: 8, marginLeft: 4 },
  actions: { marginTop: 24, gap: 12 },
  saveBtn: { borderRadius: 8 },
  cancelBtn: { borderRadius: 8 },
});
