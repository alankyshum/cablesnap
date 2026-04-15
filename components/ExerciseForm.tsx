import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Chip,
  IconButton,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
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
import { parseExerciseDescription } from "../lib/exercise-nlp";

type Props = {
  initial?: Exercise;
  onSave: (data: Omit<Exercise, "id" | "is_custom">) => Promise<void>;
  title: string;
};

const NL_EXAMPLES = [
  "incline dumbbell bench press",
  "barbell back squat",
  "cable lat pulldown",
  "bodyweight pull-ups",
  "kettlebell goblet squat",
  "seated dumbbell shoulder press",
];

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
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string; muscles?: string }>({});
  const [toast, setToast] = useState("");

  const [nlInput, setNlInput] = useState("");
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [nlPlaceholderIdx] = useState(() => Math.floor(Math.random() * NL_EXAMPLES.length));
  const flashAnim = useRef(new Animated.Value(0)).current;

  const applyNlParse = useCallback(() => {
    const text = nlInput.trim();
    if (!text) return;

    const result = parseExerciseDescription(text);
    const filled = new Set<string>();

    if (result.name) {
      setName(result.name);
      filled.add("name");
    }
    if (result.category) {
      setCategory(result.category);
      filled.add("category");
    }
    if (result.equipment) {
      setEquipment(result.equipment);
      filled.add("equipment");
    }
    if (result.difficulty) {
      setDifficulty(result.difficulty);
      filled.add("difficulty");
    }
    if (result.primary_muscles.length > 0) {
      setPrimary(new Set(result.primary_muscles));
      filled.add("primary_muscles");
    }
    if (result.secondary_muscles.length > 0) {
      setSecondary(new Set(result.secondary_muscles));
      filled.add("secondary_muscles");
    }

    setAutoFilledFields(filled);
    setDirty(true);
    setErrors({});

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: false,
    }).start();

    const fieldCount = filled.size;
    setToast(`Auto-filled ${fieldCount} field${fieldCount === 1 ? "" : "s"}`);
  }, [nlInput, flashAnim]);

  const autoFillHighlight = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", theme.colors.primaryContainer],
  });

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
        instructions: instructions.trim(),
      });
    } catch {
      setToast("Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }, [validate, onSave, name, category, equipment, difficulty, primary, secondary, instructions]);

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
      <FlatList
        data={[]}
        renderItem={null}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* Quick-fill from description */}
            {!initial && (
              <View style={[styles.nlSection, { borderBottomColor: theme.colors.outlineVariant }]}>
                <Text
                  variant="labelLarge"
                  style={{ color: theme.colors.onSurface, marginBottom: 4 }}
                >
                  Describe your exercise
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
                >
                  Type a description and we&apos;ll fill in the details
                </Text>
                <View style={styles.nlRow}>
                  <TextInput
                    value={nlInput}
                    onChangeText={setNlInput}
                    onSubmitEditing={applyNlParse}
                    placeholder={`e.g. "${NL_EXAMPLES[nlPlaceholderIdx]}"`}
                    mode="outlined"
                    dense
                    style={styles.nlInput}
                    accessibilityLabel="Describe exercise in natural language"
                    returnKeyType="go"
                    blurOnSubmit={false}
                  />
                  <IconButton
                    icon="auto-fix"
                    mode="contained"
                    onPress={applyNlParse}
                    disabled={!nlInput.trim()}
                    accessibilityLabel="Auto-fill from description"
                    size={22}
                    style={styles.nlButton}
                  />
                </View>
                {autoFilledFields.size > 0 && (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.primary, marginTop: 4 }}
                    accessibilityLiveRegion="polite"
                  >
                    Fields highlighted below were auto-filled. Tap any to adjust.
                  </Text>
                )}
              </View>
            )}

            {/* Name */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("name") ? autoFillHighlight : "transparent", borderRadius: 8 }}>
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
            </Animated.View>

            {/* Category */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("category") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
              Category *
            </Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={CATEGORIES}
              keyExtractor={(cat) => cat}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item: cat }) => (
                <Chip
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
              )}
            />
            {errors.category && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.error, marginTop: 2, marginHorizontal: 16 }}
                accessibilityLiveRegion="polite"
              >
                {errors.category}
              </Text>
            )}
            </Animated.View>

            {/* Equipment */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("equipment") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
              Equipment
            </Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={EQUIPMENT_LIST}
              keyExtractor={(eq) => eq}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item: eq }) => (
                <Chip
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
              )}
            />
            </Animated.View>

            {/* Difficulty */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("difficulty") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
              Difficulty
            </Text>
            <SegmentedButtons
              value={difficulty}
              onValueChange={(v) => { setDifficulty(v as Difficulty); setDirty(true); }}
              buttons={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
              style={styles.segment}
            />
            </Animated.View>

            {/* Primary Muscles */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("primary_muscles") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
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
            </Animated.View>

            {/* Secondary Muscles */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("secondary_muscles") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
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

            </Animated.View>

            {/* Instructions */}
            <TextInput
              label="Instructions (optional)"
              value={instructions}
              onChangeText={(v) => { setInstructions(v); setDirty(true); }}
              mode="outlined"
              multiline
              numberOfLines={3}
              accessibilityLabel="Exercise instructions"
              style={styles.input}
            />

            {/* Save / Cancel */}
            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={save}
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
                contentStyle={{ paddingVertical: 8 }}
                accessibilityLabel={`Save ${title.toLowerCase()}`}
              >
                Save
              </Button>
              <Button
                mode="outlined"
                onPress={back}
                disabled={saving}
                style={styles.cancelBtn}
                contentStyle={{ paddingVertical: 8 }}
                accessibilityLabel="Cancel"
              >
                Cancel
              </Button>
            </View>
          </>
        }
      />

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
  nlSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  nlRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  nlInput: { flex: 1 },
  nlButton: { marginTop: 6 },
});
