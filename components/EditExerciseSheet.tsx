import { useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Button, Portal, Text, TextInput } from "react-native-paper";
import type { TemplateExercise } from "../lib/types";
import { elevation } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  visible: boolean;
  exercise: TemplateExercise | null;
  onSave: (sets: number, reps: string, rest: number) => void;
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
  const [prevVisible, setPrevVisible] = useState(visible);

  // Reset state when sheet opens (derived state pattern)
  if (visible && !prevVisible) {
    setSets(String(exercise?.target_sets ?? DEFAULT_SETS));
    setReps(exercise?.target_reps ?? DEFAULT_REPS);
    setRest(String(exercise?.rest_seconds ?? DEFAULT_REST));
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

  const handleSave = () => {
    if (!canSave) return;
    Keyboard.dismiss();
    onSave(parsedSets, reps.trim(), parsedRest);
  };

  if (!visible) return null;

  return (
    <Portal>
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
          variant="titleMedium"
          style={[styles.title, { color: colors.onSurface }]}
          numberOfLines={2}
        >
          {exercise?.exercise?.name ?? "Edit Exercise"}
        </Text>

        <TextInput
          label="Target Sets"
          value={sets}
          onChangeText={setSets}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
          accessibilityLabel="Target sets"
          error={sets.length > 0 && !setsValid}
        />

        <TextInput
          label="Target Reps"
          value={reps}
          onChangeText={setReps}
          mode="outlined"
          style={styles.input}
          accessibilityLabel="Target reps"
          placeholder="e.g. 8-12, 5, AMRAP"
          error={reps.length > 0 && !repsValid}
        />

        <TextInput
          label="Rest (seconds)"
          value={rest}
          onChangeText={setRest}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
          accessibilityLabel="Rest time in seconds"
          error={rest.length > 0 && !restValid}
        />

        <View style={styles.buttons}>
          <Button
            mode="text"
            onPress={onDismiss}
            style={styles.button}
            contentStyle={styles.buttonContent}
            accessibilityLabel="Cancel editing"
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            disabled={!canSave}
            style={styles.button}
            contentStyle={styles.buttonContent}
            accessibilityRole="button"
            accessibilityLabel="Save exercise settings"
          >
            Save
          </Button>
        </View>
      </View>
    </Portal>
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
    fontSize: 16,
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
  buttonContent: {
    paddingVertical: 8,
    minHeight: 56,
  },
});
