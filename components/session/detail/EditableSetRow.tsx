import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { intensityUnitLabel, rirToRpe } from "@/lib/intensity";
import type { IntensityMode } from "@/lib/intensity";

type Props = {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  /** Stored RPE value (0–10 scale). */
  rpe: number | null;
  completed: 0 | 1;
  warning?: string;
  onChangeWeight: (v: number | null) => void;
  onChangeReps: (v: number | null) => void;
  /** Called with the stored RPE value (0–10), regardless of intensityMode. */
  onChangeRpe: (v: number | null) => void;
  onToggleCompleted: (v: 0 | 1) => void;
  onRemove: () => void;
  /** BLD-2701: Active intensity display mode. Defaults to "rpe". */
  intensityMode?: IntensityMode;
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse the intensity input field.
 * In RPE mode: value is RPE (0–10).
 * In RIR mode: value is RIR (any non-negative decimal); convert to RPE on exit.
 * Out-of-range or invalid → null.
 */
function parseIntensityInput(s: string, mode: IntensityMode): number | null {
  const t = s.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 10) return null;
  if (mode === "rir") {
    // Convert RIR → RPE for storage. rirToRpe(n) = 10 - n.
    const rpe = rirToRpe(n);
    // Clamp: stored RPE must be 0–10.
    if (rpe < 0 || rpe > 10) return null;
    return rpe;
  }
  return n;
}

/**
 * Compute the default value to show in the intensity TextInput from the stored RPE.
 * In RPE mode: show the raw rpe value.
 * In RIR mode: show rpe converted to RIR (10 − rpe).
 */
function intensityDefaultValue(rpe: number | null, mode: IntensityMode): string {
  if (rpe == null) return "";
  if (mode === "rir") {
    return String(rirToRpe(rpe) === 0 ? 0 : rirToRpe(rpe));
  }
  return String(rpe);
}

/**
 * Uncontrolled TextInputs with `defaultValue` so user keystrokes are not
 * overwritten when the parent re-renders. Values are committed on blur.
 * The parent's draft state remains the source of truth across remounts.
 * BLD-2701: intensityMode changes the input placeholder and conversion.
 */
export function EditableSetRow({
  setNumber,
  weight,
  reps,
  rpe,
  completed,
  warning,
  onChangeWeight,
  onChangeReps,
  onChangeRpe,
  onToggleCompleted,
  onRemove,
  intensityMode = "rpe",
}: Props) {
  const colors = useThemeColors();
  const unitLabel = intensityUnitLabel(intensityMode);
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
        <TextInput
          accessibilityLabel={`${unitLabel} for set ${setNumber}`}
          style={[styles.rpeInput, { color: colors.onSurface, borderColor: colors.outline }]}
          keyboardType="decimal-pad"
          defaultValue={intensityDefaultValue(rpe, intensityMode)}
          onEndEditing={(e) => onChangeRpe(parseIntensityInput(e.nativeEvent.text, intensityMode))}
          placeholder={unitLabel}
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed === 1 }}
          accessibilityLabel={`Completed for set ${setNumber}`}
          onPress={() => onToggleCompleted(completed === 1 ? 0 : 1)}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons
            name={completed === 1 ? "checkbox-marked" : "checkbox-blank-outline"}
            size={22}
            color={completed === 1 ? colors.primary : colors.onSurfaceVariant}
          />
        </Pressable>
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
  rpeInput: {
    width: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: fontSizes.base,
    textAlign: "center",
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
