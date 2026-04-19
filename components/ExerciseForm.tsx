/* eslint-disable max-lines-per-function */
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Wand2 } from "lucide-react-native";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  EQUIPMENT_LIST,
  EQUIPMENT_LABELS,
  type Exercise,
} from "../lib/types";
import { useExerciseForm } from "@/hooks/useExerciseForm";
import { MuscleGroupPicker } from "@/components/exercise-form/MuscleGroupPicker";

type Props = {
  initial?: Exercise;
  onSave: (data: Omit<Exercise, "id" | "is_custom">) => Promise<void>;
  title: string;
};

export default function ExerciseForm({ initial, onSave, title }: Props) {
  const {
    colors,
    name,
    setName,
    category,
    setCategory,
    equipment,
    setEquipment,
    difficulty,
    setDifficulty,
    primary,
    setPrimary,
    secondary,
    setSecondary,
    instructions,
    setInstructions,
    saving,
    setDirty,
    errors,
    setErrors,
    nlInput,
    setNlInput,
    autoFilledFields,
    nlPlaceholderIdx,
    nlExamples,
    autoFillHighlight,
    applyNlParse,
    toggleMuscle,
    save,
    back,
  } = useExerciseForm({ initial, onSave, title });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <FlatList
        data={[]}
        renderItem={null}
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* Quick-fill from description */}
            {!initial && (
              <View style={[styles.nlSection, { borderBottomColor: colors.outlineVariant }]}>
                <Text
                  variant="caption"
                  style={{ color: colors.onSurface, marginBottom: 4, fontWeight: "600" }}
                >
                  Describe your exercise
                </Text>
                <Text
                  variant="caption"
                  style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}
                >
                  Type a description and we&apos;ll fill in the details
                </Text>
                <View style={styles.nlRow}>
                  <Input
                    value={nlInput}
                    onChangeText={setNlInput}
                    onSubmitEditing={applyNlParse}
                    placeholder={`e.g. "${nlExamples[nlPlaceholderIdx]}"`}
                    variant="outline"
                    containerStyle={styles.nlInput}
                    accessibilityLabel="Describe exercise in natural language"
                    returnKeyType="go"
                    blurOnSubmit={false}
                  />
                  <Button
                    variant="default"
                    size="icon"
                    icon={Wand2}
                    onPress={applyNlParse}
                    disabled={!nlInput.trim()}
                    accessibilityLabel="Auto-fill from description"
                    style={styles.nlButton}
                  />
                </View>
                {autoFilledFields.size > 0 && (
                  <Text
                    variant="caption"
                    style={{ color: colors.primary, marginTop: 4 }}
                    accessibilityLiveRegion="polite"
                  >
                    Fields highlighted below were auto-filled. Tap any to adjust.
                  </Text>
                )}
              </View>
            )}

            {/* Name */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("name") ? autoFillHighlight : "transparent", borderRadius: 8 }}>
            <Input
              label="Exercise Name"
              value={name}
              onChangeText={(v) => { setName(v); setDirty(true); setErrors((e) => ({ ...e, name: undefined })); }}
              variant="outline"
              maxLength={100}
              error={errors.name}
              accessibilityLabel="Exercise name"
              containerStyle={styles.input}
            />
            <View style={styles.counter}>
              <Text
                variant="caption"
                style={{ color: errors.name ? colors.error : colors.onSurfaceVariant }}
                accessibilityLabel={errors.name ?? `${name.length} of 100 characters used`}
                accessibilityLiveRegion="polite"
              >
                {errors.name ?? `${name.length}/100`}
              </Text>
            </View>
            </Animated.View>

            {/* Category */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("category") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="caption" style={[styles.label, { color: colors.onSurface, fontWeight: "600" }]}>
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
                variant="caption"
                style={{ color: colors.error, marginTop: 2, marginHorizontal: 16 }}
                accessibilityLiveRegion="polite"
              >
                {errors.category}
              </Text>
            )}
            </Animated.View>

            {/* Equipment */}
            <Animated.View style={{ backgroundColor: autoFilledFields.has("equipment") ? autoFillHighlight : "transparent", borderRadius: 8, paddingHorizontal: 4 }}>
            <Text variant="caption" style={[styles.label, { color: colors.onSurface, fontWeight: "600" }]}>
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
            <Text variant="caption" style={[styles.label, { color: colors.onSurface, fontWeight: "600" }]}>
              Difficulty
            </Text>
            <SegmentedControl
              value={difficulty}
              onValueChange={(v) => { setDifficulty(v as Difficulty); setDirty(true); }}
              buttons={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
              style={styles.segment}
            />
            </Animated.View>

            {/* Primary Muscles */}
            <MuscleGroupPicker
              label="Primary Muscles *"
              muscles={primary}
              onToggle={(m) => { toggleMuscle(primary, setPrimary, m); setErrors((e) => ({ ...e, muscles: undefined })); }}
              autoFillHighlight={autoFillHighlight}
              isAutoFilled={autoFilledFields.has("primary_muscles")}
              error={errors.muscles}
              colors={colors}
              accessibilityPrefix="Primary muscle"
            />

            {/* Secondary Muscles */}
            <MuscleGroupPicker
              label="Secondary Muscles"
              muscles={secondary}
              onToggle={(m) => toggleMuscle(secondary, setSecondary, m)}
              autoFillHighlight={autoFillHighlight}
              isAutoFilled={autoFilledFields.has("secondary_muscles")}
              colors={colors}
              accessibilityPrefix="Secondary muscle"
            />

            {/* Instructions */}
            <Input
              label="Instructions (optional)"
              value={instructions}
              onChangeText={(v) => { setInstructions(v); setDirty(true); }}
              variant="outline"
              type="textarea"
              rows={3}
              accessibilityLabel="Exercise instructions"
              containerStyle={styles.input}
            />

            {/* Save / Cancel */}
            <View style={styles.actions}>
              <Button
                variant="default"
                onPress={save}
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
                accessibilityLabel={`Save ${title.toLowerCase()}`}
              >
                Save
              </Button>
              <Button
                variant="outline"
                onPress={back}
                disabled={saving}
                style={styles.cancelBtn}
                accessibilityLabel="Cancel"
              >
                Cancel
              </Button>
            </View>
          </>
        }
      />
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
  chip: { marginBottom: 2 },
  segment: { marginHorizontal: 0 },
  actions: { marginTop: 24, gap: 12 },
  saveBtn: { borderRadius: 8 },
  cancelBtn: { borderRadius: 8 },
  nlSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  nlRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  nlInput: { flex: 1 },
  nlButton: { marginTop: 6 },
});
