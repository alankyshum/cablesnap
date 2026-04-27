import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { EditableSetRow } from "./EditableSetRow";

type DraftSet = {
  key: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  warning?: string;
};

type Props = {
  exerciseName: string;
  sets: DraftSet[];
  onChangeWeight: (setIdx: number, v: number | null) => void;
  onChangeReps: (setIdx: number, v: number | null) => void;
  onRemoveSet: (setIdx: number) => void;
  onAddSet: () => void;
  onRemoveExercise: () => void;
};

export function EditableExerciseGroupRow({
  exerciseName,
  sets,
  onChangeWeight,
  onChangeReps,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
}: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text variant="title" style={[styles.title, { color: colors.primary }]}>
          {exerciseName}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${exerciseName}`}
          onPress={onRemoveExercise}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      {sets.map((s, i) => (
        <EditableSetRow
          key={s.key}
          setNumber={i + 1}
          weight={s.weight}
          reps={s.reps}
          warning={s.warning}
          onChangeWeight={(v) => onChangeWeight(i, v)}
          onChangeReps={(v) => onChangeReps(i, v)}
          onRemove={() => onRemoveSet(i)}
        />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add set to ${exerciseName}`}
        onPress={onAddSet}
        style={[styles.addSet, { borderColor: colors.outline }]}
      >
        <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
        <Text variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
          Add set
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    paddingVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  iconBtn: {
    padding: 4,
  },
  addSet: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingVertical: 8,
  },
});
