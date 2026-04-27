import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  warning?: string;
  onChangeWeight: (v: number | null) => void;
  onChangeReps: (v: number | null) => void;
  onRemove: () => void;
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Uncontrolled TextInputs with `defaultValue` so user keystrokes are not
 * overwritten when the parent re-renders. Values are committed on blur.
 * The parent's draft state remains the source of truth across remounts.
 */
export function EditableSetRow({
  setNumber,
  weight,
  reps,
  warning,
  onChangeWeight,
  onChangeReps,
  onRemove,
}: Props) {
  const colors = useThemeColors();
  return (
    <View>
      <View style={styles.row}>
        <Text variant="caption" style={[styles.num, { color: colors.onSurfaceVariant }]}>
          {setNumber}
        </Text>
        <TextInput
          accessibilityLabel={`Weight for set ${setNumber}`}
          style={[styles.input, { color: colors.onSurface, borderColor: colors.outline }]}
          keyboardType="decimal-pad"
          defaultValue={weight == null ? "" : String(weight)}
          onEndEditing={(e) => onChangeWeight(parseNum(e.nativeEvent.text))}
          placeholder="kg"
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="done"
        />
        <TextInput
          accessibilityLabel={`Reps for set ${setNumber}`}
          style={[styles.input, { color: colors.onSurface, borderColor: colors.outline }]}
          keyboardType="number-pad"
          defaultValue={reps == null ? "" : String(reps)}
          onEndEditing={(e) => onChangeReps(parseNum(e.nativeEvent.text))}
          placeholder="reps"
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove set ${setNumber}`}
          onPress={onRemove}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      {warning ? (
        <Text variant="caption" style={[styles.warning, { color: colors.onSurfaceVariant }]}>
          {warning}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  num: {
    width: 24,
    textAlign: "center",
    fontSize: fontSizes.sm,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: fontSizes.base,
  },
  iconBtn: {
    padding: 4,
  },
  warning: {
    marginLeft: 32,
    marginBottom: 4,
    fontStyle: "italic",
  },
});
