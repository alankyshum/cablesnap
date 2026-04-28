import { useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import type { SetType, TemplateExercise } from "../lib/types";
import { SET_TYPE_CYCLE, SET_TYPE_LABELS } from "../lib/types";
import { elevation, fontSizes } from "../constants/design-tokens";
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

export default function EditExerciseSheet({
  visible,
  exercise,
  onSave,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const initialSets = visible ? String((exercise?.target_sets ?? DEFAULT_SETS)) : "";
  const initialReps = visible ? (exercise?.target_reps ?? DEFAULT_REPS) : "";
  const initialRest = visible ? String((exercise?.rest_seconds ?? DEFAULT_REST)) : "";

  const [sets, setSets] = useState(initialSets);
  const [reps, setReps] = useState(initialReps);
  const [rest, setRest] = useState(initialRest);
  const [setTypes, setSetTypes] = useState<SetType[]>(normalizeEditorSetTypes(exercise?.set_types, exercise?.target_sets ?? DEFAULT_SETS));
  const [prevVisible, setPrevVisible] = useState(visible);

  // Reset state when sheet opens (derived state pattern)
  if (visible && !prevVisible) {
    const nextTargetSets = exercise?.target_sets ?? DEFAULT_SETS;
    setSets(String(nextTargetSets));
    setReps(exercise?.target_reps ?? DEFAULT_REPS);
    setRest(String(exercise?.rest_seconds ?? DEFAULT_REST));
    setSetTypes(normalizeEditorSetTypes(exercise?.set_types, nextTargetSets));
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

  if (!visible) return null;

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityLabel="Close edit exercise sheet"
        accessibilityRole="button"
      >
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]}
          pointerEvents="none"
        />
      </Pressable>

      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface },
        ]}
        accessibilityViewIsModal={true}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.onSurfaceVariant }]} />
        </View>

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
          error={sets.length > 0 && !setsValid ? "Invalid sets" : undefined}
        />

        <Input
          label="Target Reps"
          value={reps}
          onChangeText={setReps}
          variant="outline"
          containerStyle={styles.input}
          accessibilityLabel="Target reps"
          placeholder="e.g. 8-12, 5, AMRAP"
          error={reps.length > 0 && !repsValid ? "Invalid reps" : undefined}
        />

        <Input
          label="Rest (seconds)"
          value={rest}
          onChangeText={setRest}
          keyboardType="numeric"
          variant="outline"
          containerStyle={styles.input}
          accessibilityLabel="Rest time in seconds"
          error={rest.length > 0 && !restValid ? "Invalid rest time" : undefined}
        />

        {setsValid && (
          <View style={styles.setTypeSection}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
    ...elevation.high,
  },
  handle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  title: {
    marginBottom: 16,
    fontWeight: "700",
  },
  input: {
    marginBottom: 12,
  },
  setTypeSection: {
    marginBottom: 12,
  },
  setTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  setTypeChip: {
    minHeight: 40,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    gap: 8,
  },
  button: {
    minWidth: 56,
    minHeight: 56,
  },
});
