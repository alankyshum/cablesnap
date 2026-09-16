import { useMemo, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import type { SetType, TemplateExercise } from "../lib/types";
import { SET_TYPE_CYCLE, SET_TYPE_LABELS } from "../lib/types";
import { fontSizes, radii, spacing } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

function normalizeEditorSetTypes(setTypes: SetType[] | undefined, targetSets: number): SetType[] {
  return Array.from({ length: targetSets }, (_, index) => setTypes?.[index] ?? "normal");
}

type Props = {
  visible: boolean;
  exercise: TemplateExercise | null;
  onSave: (sets: number, reps: string, rest: number, setTypes: SetType[]) => void;
  onDismiss: () => void;
};

const DEFAULT_SETS = 3;
const DEFAULT_REPS = "8-12";
const DEFAULT_REST = 90;

function getEditorDefaults(exercise: TemplateExercise | null) {
  return {
    sets: exercise?.target_sets ?? DEFAULT_SETS,
    reps: exercise?.target_reps ?? DEFAULT_REPS,
    rest: exercise?.rest_seconds ?? DEFAULT_REST,
    setTypes: exercise?.set_types,
  };
}

function editorFieldError(value: string, valid: boolean, message: string) {
  return value.length > 0 && !valid ? message : undefined;
}

export default function EditExerciseModal({
  visible,
  exercise,
  onSave,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const defaults = getEditorDefaults(exercise);
  const initialSets = visible ? String(defaults.sets) : "";
  const initialReps = visible ? defaults.reps : "";
  const initialRest = visible ? String(defaults.rest) : "";

  const [sets, setSets] = useState(initialSets);
  const [reps, setReps] = useState(initialReps);
  const [rest, setRest] = useState(initialRest);
  const [setTypes, setSetTypes] = useState<SetType[]>(normalizeEditorSetTypes(defaults.setTypes, defaults.sets));
  const [prevVisible, setPrevVisible] = useState(visible);

  // Reset state when modal opens (derived state pattern)
  if (visible && !prevVisible) {
    const nextTargetSets = defaults.sets;
    setSets(String(nextTargetSets));
    setReps(defaults.reps);
    setRest(String(defaults.rest));
    setSetTypes(normalizeEditorSetTypes(defaults.setTypes, nextTargetSets));
  }
  if (visible !== prevVisible) {
    setPrevVisible(visible);
  }

  const parsedSets = parseInt(sets, 10);
  const parsedRest = parseInt(rest, 10);
  const setsValid = !isNaN(parsedSets) && parsedSets >= 1;
  const repsValid = reps.trim().length > 0;
  const restValid = !isNaN(parsedRest) && parsedRest >= 0;
  const canSave = setsValid && repsValid && restValid;
  const visibleSetTypes = useMemo(
    () => normalizeEditorSetTypes(setTypes, setsValid ? parsedSets : (exercise?.target_sets ?? DEFAULT_SETS)),
    [exercise?.target_sets, parsedSets, setTypes, setsValid]
  );

  const cycleSetType = (index: number) => {
    setSetTypes(() => {
      const next = [...visibleSetTypes];
      const current = next[index] ?? "normal";
      const currentIndex = SET_TYPE_CYCLE.indexOf(current);
      next[index] = SET_TYPE_CYCLE[(currentIndex + 1) % SET_TYPE_CYCLE.length];
      return next;
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    Keyboard.dismiss();
    onSave(parsedSets, reps.trim(), parsedRest, normalizeEditorSetTypes(setTypes, parsedSets));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <Pressable
          style={styles.overlay}
          onPress={onDismiss}
          accessibilityLabel="Close edit exercise modal"
          accessibilityRole="button"
        >
          <Pressable
            onPress={(e) => e?.stopPropagation?.()}
            style={[styles.card, { backgroundColor: colors.surface }]}
            accessibilityViewIsModal={true}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.cardContent}
              showsVerticalScrollIndicator={false}
            >
              <Text
                variant="title"
                style={[styles.title, { color: colors.onSurface }]}
                numberOfLines={2}
              >
                {exercise?.exercise?.name ?? "Edit Exercise"}
              </Text>

              <Input
                label="Target Sets"
                value={sets}
                onChangeText={setSets}
                keyboardType="numeric"
                variant="outline"
                containerStyle={styles.input}
                accessibilityLabel="Target sets"
                error={editorFieldError(sets, setsValid, "Invalid sets")}
              />

              <Input
                label="Target Reps"
                value={reps}
                onChangeText={setReps}
                variant="outline"
                containerStyle={styles.input}
                accessibilityLabel="Target reps"
                placeholder="e.g. 8-12, 5, AMRAP"
                error={editorFieldError(reps, repsValid, "Invalid reps")}
              />

              <Input
                label="Rest (seconds)"
                value={rest}
                onChangeText={setRest}
                keyboardType="numeric"
                variant="outline"
                containerStyle={styles.input}
                accessibilityLabel="Rest time in seconds"
                error={editorFieldError(rest, restValid, "Invalid rest time")}
              />

              {setsValid && (
                <View style={styles.setTypeSection}>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: spacing.sm }}>
                    Set types
                  </Text>
                  <View style={styles.setTypeGrid}>
                    {visibleSetTypes.map((type, index) => (
                      <Chip
                        key={`set-type-${index + 1}`}
                        selected={type !== "normal"}
                        onPress={() => cycleSetType(index)}
                        compact
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${index + 1} type: ${SET_TYPE_LABELS[type].label}`}
                        style={styles.setTypeChip}
                        textStyle={{ fontSize: fontSizes.xs }}
                      >
                        {`Set ${index + 1}: ${SET_TYPE_LABELS[type].label}`}
                      </Chip>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.buttons}>
                <Button
                  variant="ghost"
                  onPress={onDismiss}
                  style={styles.button}
                  accessibilityLabel="Cancel editing"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onPress={handleSave}
                  disabled={!canSave}
                  style={styles.button}
                  accessibilityRole="button"
                  accessibilityLabel="Save exercise settings"
                >
                  Save
                </Button>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "90%",
    borderRadius: radii.xl,
  },
  cardContent: {
    padding: spacing.lg,
  },
  title: {
    marginBottom: spacing.base,
    fontWeight: "700",
  },
  input: {
    marginBottom: spacing.md,
  },
  setTypeSection: {
    marginBottom: spacing.md,
  },
  setTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  setTypeChip: {
    minHeight: 40,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  button: {
    minWidth: 56,
    minHeight: 56,
  },
});
